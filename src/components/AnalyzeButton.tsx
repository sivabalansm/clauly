import { Sparkles, Loader2 } from "lucide-react"
import { cn } from "../lib/utils"

interface AnalyzeButtonProps {
  onClick: () => void
  isLoading: boolean
  disabled: boolean
  newSegments: number
}

export function AnalyzeButton({ onClick, isLoading, disabled, newSegments }: AnalyzeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        "no-drag w-full relative overflow-hidden rounded-xl px-4 py-3 font-semibold text-sm",
        "bg-gradient-to-r from-accent-600 via-accent-500 to-accent-600 bg-[length:200%_100%]",
        "text-white shadow-lg shadow-accent-600/30",
        "hover:from-accent-500 hover:to-accent-500 transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
        !disabled && !isLoading && "animate-shimmer"
      )}
    >
      <span className="flex items-center justify-center gap-2">
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing…
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Analyze now
            {newSegments > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20">
                +{newSegments}
              </span>
            )}
          </>
        )}
      </span>
      {!disabled && !isLoading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] opacity-70 font-mono">
          ⌘⇧A
        </span>
      )}
    </button>
  )
}
