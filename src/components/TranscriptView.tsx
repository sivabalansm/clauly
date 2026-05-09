import { useEffect, useRef } from "react"
import type { TranscriptSegment } from "../types/api"
import { Trash2 } from "lucide-react"

interface TranscriptViewProps {
  segments: TranscriptSegment[]
  pendingChunks: number
  lastAnalyzedAt: number | null
  onClear: () => void
}

export function TranscriptView({ segments, pendingChunks, lastAnalyzedAt, onClear }: TranscriptViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [segments.length])

  const newSinceLast = lastAnalyzedAt
    ? segments.filter((s) => s.capturedAt > lastAnalyzedAt).length
    : segments.length

  return (
    <div className="panel flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <span className="label">Transcript</span>
          <span className="text-[11px] text-ink-300">
            {segments.length} segment{segments.length === 1 ? "" : "s"}
            {pendingChunks > 0 && <span className="text-accent-400"> · {pendingChunks} processing</span>}
            {lastAnalyzedAt && newSinceLast > 0 && (
              <span className="text-ok-500"> · {newSinceLast} new since last analysis</span>
            )}
          </span>
        </div>
        {segments.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-ink-300 hover:text-danger-500 transition-colors no-drag"
            title="Clear transcript"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto scroll-thin -mx-1 px-1 min-h-0">
        {segments.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-4">
            <p className="text-sm text-ink-300">
              {pendingChunks > 0
                ? "Listening — first words appear in a few seconds…"
                : "Press Start capture to begin live transcription."}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {segments.map((seg) => {
              const isNew = lastAnalyzedAt ? seg.capturedAt > lastAnalyzedAt : false
              return (
                <p
                  key={seg.id}
                  className={
                    isNew
                      ? "text-sm leading-relaxed text-ink-100 border-l-2 border-ok-500 pl-2"
                      : "text-sm leading-relaxed text-ink-200 pl-2"
                  }
                >
                  {seg.text}
                </p>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
