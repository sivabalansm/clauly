import { useState } from "react"
import { AlertTriangle, MessageSquare, FileEdit, Sparkles, Loader2, TrendingUp } from "lucide-react"
import type { AnalysisResult } from "../types/api"
import { cn, formatRelativeTime } from "../lib/utils"

interface AnalysisPanelProps {
  result: AnalysisResult | null
  isLoading: boolean
  error: string | null
}

type Tab = "analysis" | "market"

export function AnalysisPanel({ result, isLoading, error }: AnalysisPanelProps) {
  const [tab, setTab] = useState<Tab>("analysis")

  return (
    <div className="panel flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1">
          <TabButton active={tab === "analysis"} onClick={() => setTab("analysis")}>
            Analysis
          </TabButton>
          <TabButton active={tab === "market"} onClick={() => setTab("market")}>
            Market Standard
          </TabButton>
        </div>
        {tab === "analysis" && result && !isLoading && !error && (
          <span className="text-[10px] text-ink-300">
            {formatRelativeTime(result.generated_at)} · {(result.latency_ms / 1000).toFixed(1)}s · {result.model}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto scroll-thin -mx-1 px-1 min-h-0">
        {tab === "analysis" ? (
          <AnalysisContent result={result} isLoading={isLoading} error={error} />
        ) : (
          <MarketStandardContent />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-xs font-medium rounded-md transition-colors no-drag",
        active
          ? "bg-ink-700 text-ink-100 border border-ink-600"
          : "text-ink-300 hover:text-ink-100 hover:bg-ink-700/50 border border-transparent"
      )}
    >
      {children}
    </button>
  )
}

function AnalysisContent({ result, isLoading, error }: AnalysisPanelProps) {
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-ink-200">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Analyzing contract against transcript…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex gap-2 items-start p-2 rounded-md border border-danger-500/40 bg-danger-500/5">
        <AlertTriangle className="w-4 h-4 text-danger-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-danger-500">Analysis failed</p>
          <p className="text-xs text-ink-200 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <Sparkles className="w-6 h-6 text-ink-400 mb-1.5" />
        <p className="text-sm text-ink-200">Hit Analyze to get redlines + talking points</p>
        <p className="text-[11px] text-ink-300 mt-0.5">Or press Cmd+Shift+A</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="label text-[10px]">Where we are</span>
        <p className="text-sm text-ink-100 leading-relaxed mt-1">{result.summary}</p>
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

function MarketStandardContent() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 mb-1">
        <TrendingUp className="w-3.5 h-3.5 text-accent-400" />
        <span className="text-xs font-semibold text-ink-100">Market standard reference</span>
      </div>
      <ul className="space-y-2.5 text-xs text-ink-100 leading-relaxed">
        <li className="flex gap-2">
          <span className="text-accent-400 mt-0.5">•</span>
          <span>
            <span className="font-semibold text-ink-100">Escrow / holdback in 88% of deals.</span>{" "}
            <span className="text-ink-200">
              Asking your counterparty to skip an indemnity escrow is uphill — almost everyone keeps one.
            </span>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-accent-400 mt-0.5">•</span>
          <span>
            <span className="font-semibold text-ink-100">Cybersecurity rep in 78% of deals.</span>{" "}
            <span className="text-ink-200">
              A standalone cybersecurity representation is now expected for SaaS / data-heavy targets, not optional.
            </span>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-accent-400 mt-0.5">•</span>
          <span>
            <span className="font-semibold text-ink-100">General reps survive 12–18 months.</span>{" "}
            <span className="text-ink-200">
              Median is 12 months (37% of deals); 30% extend to 18 months. Anything shorter than 12 or longer than 24 is off-market.
            </span>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-accent-400 mt-0.5">•</span>
          <span>
            <span className="font-semibold text-ink-100">Sandbagging clause: 50% silent / 49% pro-buyer.</span>{" "}
            <span className="text-ink-200">
              Anti-sandbagging language appears in &lt;1% of deals. Resist any clause that says buyer's pre-close knowledge bars later claims.
            </span>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-accent-400 mt-0.5">•</span>
          <span>
            <span className="font-semibold text-ink-100">Earnouts: 24% of non-Life-Sciences deals.</span>{" "}
            <span className="text-ink-200">
              Median earnout potential is 34% of the closing payment; median length is 21 months. Anything beyond 3 years is rare.
            </span>
          </span>
        </li>
      </ul>
      <p className="text-[10px] text-ink-300 italic pt-2 border-t border-ink-700">
        Source: SRS Acquiom 2026 M&A Deal Terms Study — 2,300+ private-target deals valued at $569B+ closing 2020–2025.
      </p>
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
    <div className="border-t border-ink-700 pt-3">
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
