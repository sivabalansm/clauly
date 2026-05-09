import { useEffect, useState } from "react"
import { X, Monitor, AppWindow, Loader2, AlertCircle } from "lucide-react"
import type { AudioSource } from "../types/api"
import { cn } from "../lib/utils"

interface SourcePickerProps {
  open: boolean
  onPick: (sourceId: string) => void
  onClose: () => void
}

export function SourcePicker({ open, onPick, onClose }: SourcePickerProps) {
  const [sources, setSources] = useState<AudioSource[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    window.clauly
      .listAudioSources()
      .then((s) => setSources(s))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  const screens = sources.filter((s) => s.kind === "screen")
  const windows = sources.filter((s) => s.kind === "window")

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div
        className="absolute inset-0 bg-ink-900/90 backdrop-blur-sm no-drag"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl max-h-[80vh] flex flex-col bg-ink-800 border border-ink-600 rounded-xl shadow-2xl no-drag">
        <header className="flex items-center justify-between px-4 py-3 border-b border-ink-700">
          <div>
            <h2 className="text-sm font-semibold">Pick the audio source</h2>
            <p className="text-[11px] text-ink-300 mt-0.5">
              Choose the Zoom (or other meeting) window. Audio from that source will stream into Clauly.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-ink-300 hover:text-ink-100 hover:bg-ink-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto scroll-thin px-3 py-3 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-8 text-ink-300">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Listing screens & windows…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 panel border-danger-500/40 bg-danger-500/5">
              <AlertCircle className="w-4 h-4 text-danger-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-danger-500">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              {windows.length > 0 && (
                <Section title="Windows (recommended for Zoom)" icon={<AppWindow className="w-3.5 h-3.5" />}>
                  {windows.map((s) => (
                    <SourceCard key={s.id} source={s} onPick={onPick} />
                  ))}
                </Section>
              )}
              {screens.length > 0 && (
                <Section title="Entire screens" icon={<Monitor className="w-3.5 h-3.5" />}>
                  {screens.map((s) => (
                    <SourceCard key={s.id} source={s} onPick={onPick} />
                  ))}
                </Section>
              )}
              {windows.length === 0 && screens.length === 0 && (
                <p className="text-sm text-ink-300 text-center py-6">
                  No sources available. On macOS, grant Screen Recording permission and restart.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  icon,
  children
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5 px-1">
        <span className="text-ink-300">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider text-ink-300 font-medium">{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  )
}

function SourceCard({ source, onPick }: { source: AudioSource; onPick: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(source.id)}
      className={cn(
        "group text-left rounded-lg overflow-hidden border border-ink-600 bg-ink-700",
        "hover:border-accent-500 hover:bg-ink-600 transition-colors"
      )}
    >
      {source.thumbnail ? (
        <div className="aspect-video bg-ink-900 overflow-hidden">
          <img src={source.thumbnail} alt={source.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-video bg-ink-900 flex items-center justify-center">
          {source.kind === "screen" ? (
            <Monitor className="w-6 h-6 text-ink-400" />
          ) : (
            <AppWindow className="w-6 h-6 text-ink-400" />
          )}
        </div>
      )}
      <div className="px-2 py-1.5">
        <p className="text-xs font-medium text-ink-100 truncate">{source.name}</p>
      </div>
    </button>
  )
}
