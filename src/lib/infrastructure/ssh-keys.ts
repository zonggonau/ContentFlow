import { generateKeyPairSync } from "crypto"

export interface GeneratedSshKeyPair {
  /** PKCS8 PEM — what ssh2's Client accepts as `privateKey`. */
  privateKeyPem: string
  /** OpenSSH `authorized_keys` line format: `ssh-ed25519 <base64> <comment>`. */
  publicKeyLine: string
}

// Fixed 12-byte ASN.1 prefix every Ed25519 SPKI DER key starts with:
//   SEQUENCE { SEQUENCE { OID 1.3.101.112 }, BIT STRING (33 bytes, 0 unused) }
// followed by the 32 raw public key bytes. This never varies for Ed25519,
// so extracting the raw key is just slicing off this constant prefix rather
// than pulling in a full ASN.1 parser for one fixed-shape value.
const ED25519_SPKI_DER_PREFIX_LEN = 12
const ED25519_RAW_KEY_LEN = 32

/**
 * Generate a fresh ed25519 SSH keypair for a dedicated VPS: the public half
 * is injected into the instance via cloud-init (`ssh_authorized_keys`) at
 * provisioning time, the private half is stored encrypted
 * (InfrastructureCredential.sshPrivateKeyEncrypted) and used by
 * `lib/infrastructure/ssh-client.ts` to authenticate for `deploy_to_vps`.
 */
export function generateVpsSshKeyPair(comment: string): GeneratedSshKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  })

  const der = publicKey as unknown as Buffer
  if (der.length !== ED25519_SPKI_DER_PREFIX_LEN + ED25519_RAW_KEY_LEN) {
    throw new Error(`Unexpected Ed25519 SPKI DER length: ${der.length}`)
  }
  const rawPublicKey = der.subarray(ED25519_SPKI_DER_PREFIX_LEN)

  const keyType = "ssh-ed25519"
  const typeBuf = Buffer.from(keyType)
  const wire = Buffer.concat([
    uint32be(typeBuf.length),
    typeBuf,
    uint32be(rawPublicKey.length),
    rawPublicKey,
  ])

  const publicKeyLine = `${keyType} ${wire.toString("base64")} ${comment}`

  return {
    privateKeyPem: privateKey as unknown as string,
    publicKeyLine,
  }
}

function uint32be(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}
