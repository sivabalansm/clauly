import { useRef, useState } from "react"
import { Upload, FileText, AlertCircle, Loader2 } from "lucide-react"
import { cn, formatChars } from "../lib/utils"

interface OnboardingProps {
  onLoaded: () => void
  platform: NodeJS.Platform | "unknown"
  anthropicConfigured: boolean
}

export function Onboarding({ onLoaded, platform, anthropicConfigured }: OnboardingProps) {
  const [mode, setMode] = useState<"paste" | "upload">("upload")
  const [pasted, setPasted] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const submitPaste = async () => {
    if (!pasted.trim()) {
      setError("Paste contract text first.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await window.clauly.loadContractFromText(pasted, "Pasted contract")
      onLoaded()
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      await window.clauly.loadContractFromBuffer(buffer, file.name)
      onLoaded()
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  const platformWarning =
    platform === "darwin"
      ? "macOS: When you start capture, pick the Zoom (or other meeting) WINDOW from the source picker. Clauly captures system audio directly via ScreenCaptureKit — no virtual audio drivers, no BlackHole, no loopback dance. Grant Screen Recording permission when prompted."
      : platform === "linux"
      ? "Linux: System audio capture works via PipeWire + xdg-desktop-portal-pipewire. Pick the Zoom window in the source picker."
      : platform === "win32"
      ? "Windows: Pick the Zoom window in the source picker; Electron captures audio via WASAPI loopback."
      : "Pick the meeting window in the source picker when you start capture. The OS handles audio routing."

  return (
    <div className="flex flex-col h-full">
      <div className="drag-region px-5 pt-5 pb-3 border-b border-ink-700">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-accent-500 animate-pulse-recording" />
          <h1 className="text-lg font-semibold tracking-tight">Clauly</h1>
          <span className="text-xs text-ink-300">Live contract review</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto scroll-thin px-5 py-4 space-y-4">
        {!anthropicConfigured && (
          <div className="panel border-warn-500/40 bg-warn-500/5">
            <div className="flex gap-2 items-start">
              <AlertCircle className="w-4 h-4 text-warn-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-warn-500">
                <p className="font-medium mb-1">ANTHROPIC_API_KEY missing</p>
                <p className="text-xs text-ink-200">
                  Analysis (the Analyze button) will fail until you add your key. Edit{" "}
                  <code className="text-ink-100">.env</code> in the project root, then restart.
                </p>
                <p className="text-xs text-ink-300 mt-1">
                  Transcription is free via Web Speech — no key needed.
                </p>
              </div>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-base font-medium mb-1">Load the contract first</h2>
          <p className="text-sm text-ink-300 leading-relaxed">
            Paste or upload the contract you'll be discussing. Clauly keeps it cached for the whole session — every "Analyze" click reuses it without re-uploading.
          </p>
        </div>

        <div className="flex gap-1.5 p-1 bg-ink-800 rounded-lg w-fit border border-ink-600">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors no-drag",
              mode === "upload" ? "bg-accent-600 text-white" : "text-ink-200 hover:bg-ink-700"
            )}
          >
            Upload file
          </button>
          <button
            type="button"
            onClick={() => setMode("paste")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors no-drag",
              mode === "paste" ? "bg-accent-600 text-white" : "text-ink-200 hover:bg-ink-700"
            )}
          >
            Paste text
          </button>
        </div>

        {mode === "upload" ? (
          <div
            className="panel border-dashed border-ink-500 hover:border-accent-500 transition-colors cursor-pointer no-drag"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) handleFile(f)
            }}
          >
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Upload className="w-8 h-8 text-ink-300" />
              <div>
                <p className="text-sm font-medium">Drop or click to upload</p>
                <p className="text-xs text-ink-300 mt-0.5">PDF, DOCX, TXT — up to a few hundred pages</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </div>
        ) : (
          <div className="space-y-2 no-drag">
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="Paste full contract text here…"
              className="w-full h-48 p-3 rounded-lg bg-ink-800 border border-ink-600 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:border-accent-500 scroll-thin"
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-ink-300">{formatChars(pasted.length)}</span>
              <button onClick={submitPaste} disabled={busy} className="btn-primary">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Use this text
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="panel border-danger-500/40 bg-danger-500/5">
            <div className="flex gap-2 items-start">
              <AlertCircle className="w-4 h-4 text-danger-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-danger-500">{error}</p>
            </div>
          </div>
        )}

        <div className="panel">
          <p className="label mb-1">Audio capture on your platform</p>
          <p className="text-sm text-ink-200 leading-relaxed">{platformWarning}</p>
        </div>
      </div>
    </div>
  )
}
