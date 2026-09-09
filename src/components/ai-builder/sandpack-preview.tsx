"use client"

import { SandpackProvider, SandpackPreview as SandpackPreviewPane, SandpackLayout } from "@codesandbox/sandpack-react"
import { useTheme } from "next-themes"
import { useMemo } from "react"

interface GeneratedFile {
  name: string
  content: string
}

interface SandpackPreviewProps {
  files: GeneratedFile[]
}

/**
 * Renders a Claude-generated Next.js file set in an in-browser Sandpack
 * sandbox. This is a MOCK preview, not a real Next.js server: it strips
 * Next.js-only constructs (the "use client" directive, next/navigation
 * imports, etc. are left as-is since React Router/Next shims aren't worth
 * the complexity here) and renders the App Router's page/layout tree as
 * plain React components via Sandpack's "react-ts" template. `fetch()`
 * calls to the real SaCMS Content API will fail inside the sandbox's
 * isolated iframe (no network access to localhost) — this is a known,
 * accepted limitation of the mock-preview approach; components should
 * already fall back to their Unsplash sample data when a fetch fails,
 * same as they're instructed to in the generation prompt.
 */
export function SandpackPreview({ files }: SandpackPreviewProps) {
  const { theme } = useTheme()

  const sandpackFiles = useMemo(() => {
    const out: Record<string, string> = {}

    // Map every generated file into Sandpack's flat /src-relative paths,
    // preserving directory structure (app/page.tsx -> /App.tsx is handled
    // specially below; everything else keeps its relative path under /).
    for (const file of files) {
      const path = file.name.startsWith("/") ? file.name : `/${file.name}`
      out[path] = file.content
    }

    // Sandpack's react-ts template needs an /App.tsx entry point. Use the
    // generated app/page.tsx (the App Router's home page) as that entry —
    // it's almost always the top-level composed page in a v0/Claude build.
    const pageFile = files.find((f) => f.name === "app/page.tsx" || f.name.endsWith("/page.tsx"))
    if (pageFile && !out["/App.tsx"]) {
      out["/App.tsx"] = pageFile.content
    }

    out["/index.tsx"] = `import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
`

    out["/styles.css"] = `@tailwind base;
@tailwind components;
@tailwind utilities;

body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
`

    out["/tailwind.config.js"] = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
`

    return out
  }, [files])

  return (
    <div className="h-full w-full overflow-hidden">
      <SandpackProvider
        template="react-ts"
        theme={theme === "dark" ? "dark" : "light"}
        files={sandpackFiles}
        customSetup={{
          dependencies: {
            "lucide-react": "latest",
          },
        }}
        options={{
          externalResources: ["https://cdn.tailwindcss.com"],
        }}
      >
        <SandpackLayout style={{ height: "100%" }}>
          <SandpackPreviewPane
            showNavigator={false}
            showOpenInCodeSandbox={false}
            showRefreshButton
            style={{ height: "100%" }}
          />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  )
}
