import { AlertTriangle, MessageSquare, FileEdit, Sparkles, Loader2 } from "lucide-react"
import type { AnalysisResult } from "../types/api"
import { cn, formatRelativeTime } from "../lib/utils"

interface AnalysisPanelProps {
  result: AnalysisResult | null
  isLoading: boolean
  error: string | null
}

export function AnalysisPanel({ result, isLoading, error }: AnalysisPanelProps) {
  if (isLoading) {
    return (
      <div className="panel min-h-[140px] flex items-center justify-center">
        <div className="flex items-center gap-2 text-ink-200">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Analyzing contract against transcript…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="panel border-danger-500/40 bg-danger-500/5">
        <div className="flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 text-danger-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-danger-500">Analysis failed</p>
            <p className="text-xs text-ink-200 mt-1">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="panel min-h-[120px] flex flex-col items-center justify-center text-center">
        <Sparkles className="w-6 h-6 text-ink-400 mb-1.5" />
        <p className="text-sm text-ink-200">Hit Analyze to get redlines + talking points</p>
        <p className="text-[11px] text-ink-300 mt-0.5">Or press Cmd+Shift+A</p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <div className="panel">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="label">Where we are</span>
          <span className="text-[10px] text-ink-300">
            {formatRelativeTime(result.generated_at)} · {(result.latency_ms / 1000).toFixed(1)}s · {result.model}
          </span>
        </div>
        <p className="text-sm text-ink-100 leading-relaxed">{result.summary}</p>
        {result.current_topic && result.current_topic !== "general" && (
          <p className="text-xs text-accent-400 mt-1.5">
            Current focus: <span className="text-ink-100">{result.current_topic}</span>
          </p>
        )}
      </div>

      {result.risks.length > 0 && (
        <Section
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          title="Risks just raised"
          tone="danger"
          count={result.risks.length}
        >
          <div className="space-y-2">
            {result.risks.map((r, i) => (
              <div key={i} className="space-y-1">
                <p className="text-sm text-ink-100 font-medium leading-snug">{r.concern}</p>
                <p className="text-xs text-ink-200 leading-relaxed">→ {r.implication}</p>
                {r.triggered_by_quote && (
                  <p className="text-xs italic text-ink-300 border-l-2 border-ink-600 pl-2 leading-snug">
                    "{r.triggered_by_quote}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {result.discussion_points.length > 0 && (
        <Section
          icon={<MessageSquare className="w-3.5 h-3.5" />}
          title="What to say"
          tone="accent"
          count={result.discussion_points.length}
        >
          <div className="space-y-2">
            {result.discussion_points.map((dp, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-ink-100">{dp.topic}</span>
                  <PriorityBadge priority={dp.priority} />
                </div>
                <p className="text-sm text-ink-100 leading-snug">"{dp.what_to_say}"</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {result.redlines.length > 0 && (
        <Section
          icon={<FileEdit className="w-3.5 h-3.5" />}
          title="Redlines"
          tone="warn"
          count={result.redlines.length}
        >
          <div className="space-y-2.5">
            {result.redlines.map((r, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-ink-100">{r.clause_reference}</span>
                  <PriorityBadge priority={r.severity} />
                </div>
                {r.original_text && r.original_text !== "not addressed in contract" && (
                  <p className="text-xs italic text-ink-300 line-through border-l-2 border-ink-600 pl-2 leading-snug">
                    "{r.original_text}"
                  </p>
                )}
                <p className="text-xs text-ink-100 leading-relaxed">
                  <span className="text-ok-500">→</span> {r.suggested_change}
                </p>
                <p className="text-[11px] text-ink-300 leading-snug">{r.rationale}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {result.quick_replies.length > 0 && (
        <Section
          icon={<Sparkles className="w-3.5 h-3.5" />}
          title="Quick replies"
          tone="accent"
          count={result.quick_replies.length}
        >
          <div className="flex flex-wrap gap-1.5">
            {result.quick_replies.map((qr, i) => (
              <button
                key={i}
                type="button"
                onClick={() => navigator.clipboard.writeText(qr)}
                className="text-xs px-2 py-1 rounded-md bg-ink-700 border border-ink-600 text-ink-100 hover:bg-ink-600 hover:border-accent-500 transition-colors text-left max-w-full no-drag"
                title="Click to copy"
              >
                {qr}
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({
  icon,
  title,
  count,
  tone,
  children
}: {
  icon: React.ReactNode
  title: string
  count: number
  tone: "accent" | "warn" | "danger"
  children: React.ReactNode
}) {
  const toneClass = {
    accent: "text-accent-400",
    warn: "text-warn-500",
    danger: "text-danger-500"
  }[tone]
  return (
    <div className="panel">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={toneClass}>{icon}</span>
        <span className="text-xs font-semibold text-ink-100">{title}</span>
        <span className="text-[10px] text-ink-300">({count})</span>
      </div>
      {children}
    </div>
  )
}

function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  return <span className={cn("badge", `badge-${priority}`)}>{priority}</span>
}
