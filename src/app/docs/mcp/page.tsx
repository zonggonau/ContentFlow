import { redirect } from "next/navigation"

export const metadata = {
  title: "MCP Server Documentation | SaCMS",
  description: "Connect Antigravity or VS Code (GitHub Copilot) to SaCMS via the Model Context Protocol.",
}

export default function MCPDocsRedirectPage() {
  redirect("/docs#mcp-overview")
}
