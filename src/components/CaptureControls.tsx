import { useState } from "react"
import { Mic, MonitorSpeaker, Square, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import type { CaptureMode } from "../types/api"
import { cn } from "../lib/utils"

interface CaptureControlsProps {
  mode: CaptureMode
  setMode: (m: CaptureMode) => void
  isCapturing: boolean
  isStarting: boolean
  onStart: () => void
  onStop: () => void
  totalCapturedMs: number
  selectedSourceName: string | null
  onChangeSource: () => void
  interimText: string
}

const MODE_META: Record<CaptureMode, { label: string; icon: typeof Mic; hint: string }> = {
  mic: { label: "Microphone", icon: Mic, hint: "Captures your voice from the default mic." },
  system: {
    label: "System audio",
    icon: MonitorSpeaker,
    hint: "Captures audio from a chosen window/screen — pick the Zoom window."
  }
}

export function CaptureControls({
  mode,
  setMode,
  isCapturing,
  isStarting,
  onStart,
  onStop,
  totalCapturedMs,
  selectedSourceName,
  onChangeSource,
  interimText
}: CaptureControlsProps) {
  const [expanded, setExpanded] = useState(true)
  const minutes = Math.floor(totalCapturedMs / 60000)
  const seconds = Math.floor((totalCapturedMs % 60000) / 1000)
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`
  const ModeIcon = MODE_META[mode].icon

  return (
    <div className={cn("panel", expanded ? "space-y-3" : "py-2")}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1.5 text-ink-200 hover:text-ink-100 transition-colors no-drag"
          title={expanded ? "Collapse capture controls" : "Expand capture controls"}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span className="label">Capture mode</span>
        </button>

        <div className="flex items-center gap-2 no-drag">
          {!expanded && (
            <span className="flex items-center gap-1 text-[11px] text-ink-300">
              <ModeIcon className="w-3 h-3" />
              <span className="hidden sm:inline">{MODE_META[mode].label}</span>
            </span>
          )}
          {isCapturing && (
            <span className="flex items-center gap-1.5 text-xs text-ok-500">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-500 animate-pulse-recording" />
              {timeStr}
            </span>
          )}
          {!expanded &&
            (isCapturing ? (
              <button
                onClick={onStop}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-danger-600 hover:bg-danger-500 text-white"
              >
                <Square className="w-3 h-3 fill-current" />
                Stop
              </button>
            ) : (
              <button
                onClick={onStart}
                disabled={isStarting}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-accent-600 hover:bg-accent-500 text-white disabled:opacity-50"
              >
                {isStarting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
                {isStarting ? "…" : "Start"}
              </button>
            ))}
        </div>
      </div>

      {expanded && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {(["mic", "system"] as CaptureMode[]).map((m) => {
              const meta = MODE_META[m]
              const Icon = meta.icon
              const active = mode === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  disabled={isCapturing}
                  title={meta.hint}
                  className={cn(
                    "flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors no-drag",
                    active
                      ? "bg-accent-600 border-accent-500 text-white"
                      : "bg-ink-700 border-ink-600 text-ink-200 hover:bg-ink-600 disabled:opacity-50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {meta.label}
                </button>
              )
            })}
          </div>

          <p className="text-[11px] text-ink-300 leading-snug">{MODE_META[mode].hint}</p>

          {mode === "system" && (
            <button
              type="button"
              onClick={onChangeSource}
              disabled={isCapturing}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs",
                "bg-ink-700 border border-ink-600 hover:bg-ink-600 hover:border-accent-500 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed no-drag"
              )}
            >
              <span className="text-ink-300">Source</span>
              <span className="text-ink-100 font-medium truncate">
                {selectedSourceName || "Click to choose…"}
              </span>
            </button>
          )}

          {isCapturing ? (
            <button onClick={onStop} className="btn-danger w-full">
              <Square className="w-4 h-4 fill-current" />
              Stop capture
            </button>
          ) : (
            <button onClick={onStart} disabled={isStarting} className="btn-primary w-full">
              {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
              {isStarting ? "Starting…" : "Start capture"}
            </button>
          )}

          {isCapturing && interimText && (
            <div className="rounded-md bg-ink-700/50 border border-ink-600 px-2 py-1.5">
              <p className="text-[11px] text-ink-300 italic leading-snug">…{interimText}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
