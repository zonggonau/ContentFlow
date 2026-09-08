"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function GlobalDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full min-h-[50vh] p-6 text-center">
      <div className="w-16 h-16 rounded-none bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-6">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-black uppercase tracking-tight mb-2">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-8">
        Failed to load your account dashboard. Please try again or navigate to a different section.
      </p>
      <Button
        onClick={() => reset()}
        className="rounded-none bg-orange-500 hover:bg-orange-600 font-bold px-8 shadow-none"
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Try Again
      </Button>
    </div>
  )
}
