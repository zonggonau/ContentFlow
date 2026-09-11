import { Client } from "ssh2"

export interface SshTarget {
  host: string
  user: string
  privateKeyPem: string
  port?: number
}

export interface ExecResult {
  code: number | null
  stdout: string
  stderr: string
}

/**
 * Thin promise wrapper around `ssh2` for the two things `deploy_to_vps`
 * needs: run a remote command, and upload a set of in-memory files over
 * SFTP. One connection per call — deploys are infrequent enough that
 * connection pooling isn't worth the complexity.
 */
function connect(target: SshTarget): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    const timer = setTimeout(() => {
      conn.end()
      reject(new Error(`SSH connection to ${target.host} timed out after 20s`))
    }, 20_000)

    conn
      .on("ready", () => {
        clearTimeout(timer)
        resolve(conn)
      })
      .on("error", (err) => {
        clearTimeout(timer)
        reject(new Error(`SSH connection to ${target.host} failed: ${err.message}`))
      })
      .connect({
        host: target.host,
        port: target.port ?? 22,
        username: target.user,
        privateKey: target.privateKeyPem,
        readyTimeout: 15_000,
      })
  })
}

/**
 * Run one command over SSH exec and collect its output. Not a shell session
 * — each call is a single, independent command (chain with `&&` inline
 * when a sequence must run in one shell, e.g. `cd /opt/sacms && ...`).
 */
export async function sshExec(target: SshTarget, command: string, timeoutMs = 180_000): Promise<ExecResult> {
  const conn = await connect(target)
  try {
    return await new Promise<ExecResult>((resolve, reject) => {
      let stdout = ""
      let stderr = ""
      const timer = setTimeout(() => {
        conn.end()
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command.slice(0, 120)}`))
      }, timeoutMs)

      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer)
          reject(err)
          return
        }
        stream
          .on("close", (code: number | null) => {
            clearTimeout(timer)
            resolve({ code, stdout, stderr })
          })
          .on("data", (data: Buffer) => {
            stdout += data.toString("utf8")
          })
          .stderr.on("data", (data: Buffer) => {
            stderr += data.toString("utf8")
          })
      })
    })
  } finally {
    conn.end()
  }
}

export interface RemoteFile {
  /** Path relative to the upload root, e.g. "package.json" or "app/page.tsx". */
  path: string
  content: string
}

/**
 * Replace the contents of `remoteDir` on the target with exactly `files` —
 * clears the directory first so a deploy never leaves stale files from a
 * previous one (e.g. a renamed/removed page), then uploads each file over
 * SFTP, creating subdirectories as needed.
 */
export async function sshSyncDirectory(target: SshTarget, remoteDir: string, files: RemoteFile[]): Promise<void> {
  // Recreate the directory fresh via exec (simpler and more reliable across
  // ssh2 SFTP client versions than trying to enumerate+delete over SFTP).
  const clean = await sshExec(target, `rm -rf ${shQuote(remoteDir)} && mkdir -p ${shQuote(remoteDir)}`)
  if (clean.code !== 0) {
    throw new Error(`Failed to prepare ${remoteDir} on ${target.host}: ${clean.stderr || clean.stdout}`)
  }

  const conn = await connect(target)
  try {
    const sftp = await new Promise<import("ssh2").SFTPWrapper>((resolve, reject) => {
      conn.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)))
    })

    // Create every subdirectory that will be needed, deepest segments last
    // don't matter since each mkdir call is only for one file's own parent.
    const dirsSeen = new Set<string>()
    for (const file of files) {
      const dir = dirname(file.path)
      if (!dir || dirsSeen.has(dir)) continue
      dirsSeen.add(dir)
      await mkdirRecursive(sftp, `${remoteDir}/${dir}`)
    }

    for (const file of files) {
      await new Promise<void>((resolve, reject) => {
        const stream = sftp.createWriteStream(`${remoteDir}/${file.path}`)
        stream.on("error", reject)
        stream.on("close", resolve)
        stream.end(Buffer.from(file.content, "utf8"))
      })
    }
  } finally {
    conn.end()
  }
}

function dirname(relativePath: string): string {
  const idx = relativePath.lastIndexOf("/")
  return idx === -1 ? "" : relativePath.slice(0, idx)
}

async function mkdirRecursive(sftp: import("ssh2").SFTPWrapper, fullPath: string): Promise<void> {
  const segments = fullPath.split("/").filter(Boolean)
  let current = fullPath.startsWith("/") ? "" : ""
  for (const seg of segments) {
    current += `/${seg}`
    await new Promise<void>((resolve) => {
      sftp.mkdir(current, () => resolve()) // ignore "already exists" errors
    })
  }
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}
