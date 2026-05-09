import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { v4 as uuid } from "uuid"
import { Pin, PinOff, Trash2, RotateCcw } from "lucide-react"
import { Onboarding } from "./components/Onboarding"
import { CaptureControls } from "./components/CaptureControls"
import { TranscriptView } from "./components/TranscriptView"
import { AnalysisPanel } from "./components/AnalysisPanel"
import { AnalyzeButton } from "./components/AnalyzeButton"
import { SourcePicker } from "./components/SourcePicker"
import { useSystemAudioCapture } from "./hooks/useSystemAudioCapture"
import { cn, formatChars, formatRelativeTime } from "./lib/utils"
import type {
  AnalysisResult,
  AppConfig,
  CaptureMode,
  ContractInfo,
  TranscriptSegment
} from "./types/api"

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null)
  const [mode, setMode] = useState<CaptureMode>("system")
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [selectedSourceName, setSelectedSourceName] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [pendingChunks, setPendingChunks] = useState(0)
  const [interimText] = useState("")
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [aotPinned, setAotPinned] = useState(true)

  const segmentsRef = useRef<TranscriptSegment[]>([])
  segmentsRef.current = segments

  const handleChunk = useCallback(async (blob: Blob, _durationMs: number) => {
    setPendingChunks((n) => n + 1)
    try {
      const buffer = await blob.arrayBuffer()
      const result = await window.clauly.transcribeChunkLocal(buffer, blob.type || "audio/webm")
      const text = result.text.trim()
      if (text.length > 0) {
        setSegments((prev) => [
          ...prev,
          { id: uuid(), text, capturedAt: Date.now(), durationMs: result.durationMs }
        ])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCaptureError(`whisper.cpp failed: ${msg}`)
      throw err
    } finally {
      setPendingChunks((n) => Math.max(0, n - 1))
    }
  }, [])

  const capture = useSystemAudioCapture({
    mode,
    selectedSourceId,
    chunkMs: 6000,
    onChunk: handleChunk,
    onError: (msg) => setCaptureError(msg),
    onStatus: (msg) => setStatusMsg(msg)
  })

  useEffect(() => {
    window.clauly.getConfig().then(setConfig).catch(console.error)
    window.clauly.getContractInfo().then(setContractInfo).catch(console.error)
    window.clauly.isAlwaysOnTop().then(setAotPinned).catch(() => undefined)
  }, [])

  const transcriptText = useMemo(() => segments.map((s) => s.text).join(" "), [segments])

  const handleAnalyze = useCallback(async () => {
    if (!contractInfo || analysisLoading) return
    setAnalysisLoading(true)
    setAnalysisError(null)
    try {
      const result = await window.clauly.analyzeNow(transcriptText)
      setAnalysis(result)
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err))
    } finally {
      setAnalysisLoading(false)
    }
  }, [contractInfo, transcriptText, analysisLoading])

  const captureRef = useRef(capture)
  captureRef.current = capture

  useEffect(() => {
    const off1 = window.clauly.onTriggerAnalyze(() => handleAnalyze())
    const off2 = window.clauly.onTriggerToggleCapture(() => {
      const c = captureRef.current
      if (c.isCapturing) c.stop()
      else c.start()
    })
    return () => {
      off1()
      off2()
    }
  }, [handleAnalyze])

  const handleStart = useCallback(async () => {
    setCaptureError(null)
    if (mode === "system" && !selectedSourceId) {
      setPickerOpen(true)
      return
    }
    await capture.start()
  }, [mode, selectedSourceId, capture])

  const handlePickSource = useCallback(
    async (sourceId: string) => {
      setPickerOpen(false)
      setSelectedSourceId(sourceId)
      try {
        const all = await window.clauly.listAudioSources()
        const found = all.find((s) => s.id === sourceId)
        setSelectedSourceName(found?.name || sourceId)
      } catch {
        setSelectedSourceName(sourceId)
      }
      setTimeout(() => capture.start(), 100)
    },
    [capture]
  )

  const handleClearTranscript = useCallback(() => {
    setSegments([])
    setAnalysis(null)
    setAnalysisError(null)
  }, [])

  const handleResetContract = useCallback(async () => {
    if (capture.isCapturing) capture.stop()
    await window.clauly.clearContract()
    setContractInfo(null)
    setSegments([])
    setAnalysis(null)
    setAnalysisError(null)
  }, [capture])

  const togglePin = useCallback(async () => {
    const next = await window.clauly.toggleAlwaysOnTop()
    setAotPinned(next)
  }, [])

  if (!contractInfo) {
    return (
      <Onboarding
        onLoaded={() => {
          window.clauly.getContractInfo().then(setContractInfo).catch(console.error)
        }}
        platform={config?.platform || "linux"}
        anthropicConfigured={config?.anthropicConfigured ?? false}
      />
    )
  }

  const newSegments = analysis ? segments.filter((s) => s.capturedAt > analysis.generated_at).length : segments.length

  return (
    <div className="flex flex-col h-full">
      <header className="drag-region flex items-center justify-between px-4 py-2.5 border-b border-ink-700">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "w-2 h-2 rounded-full flex-shrink-0",
              capture.isCapturing ? "bg-ok-500 animate-pulse-recording" : "bg-ink-400"
            )}
          />
          <h1 className="text-sm font-semibold tracking-tight">Clauly</h1>
          <span className="text-[11px] text-ink-300 truncate">
            · {contractInfo.filename} · {formatChars(contractInfo.charCount)}
          </span>
        </div>
        <div className="flex items-center gap-1 no-drag">
          <button
            type="button"
            onClick={togglePin}
            title={aotPinned ? "Unpin (allow other windows above)" : "Pin always on top"}
            className="p-1.5 rounded text-ink-300 hover:text-ink-100 hover:bg-ink-700 transition-colors"
          >
            {aotPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleResetContract}
            title="Load a different contract"
            className="p-1.5 rounded text-ink-300 hover:text-ink-100 hover:bg-ink-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto scroll-thin px-4 py-3 space-y-3">
        <CaptureControls
          mode={mode}
          setMode={setMode}
          isCapturing={capture.isCapturing}
          isStarting={false}
          onStart={handleStart}
          onStop={capture.stop}
          totalCapturedMs={capture.totalCapturedMs}
          selectedSourceName={selectedSourceName}
          onChangeSource={() => setPickerOpen(true)}
          interimText={interimText}
        />

        {captureError && (
          <div className="panel border-warn-500/40 bg-warn-500/5 flex items-start gap-2">
            <p className="text-xs text-warn-500 flex-1">{captureError}</p>
            <button onClick={() => setCaptureError(null)} className="text-ink-300 hover:text-ink-100 no-drag">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}

        {statusMsg && !captureError && capture.isCapturing && (
          <p className="text-[11px] text-ink-300 italic">{statusMsg}</p>
        )}

        <AnalyzeButton
          onClick={handleAnalyze}
          isLoading={analysisLoading}
          disabled={segments.length === 0}
          newSegments={newSegments}
        />

        <AnalysisPanel result={analysis} isLoading={analysisLoading} error={analysisError} />

        <TranscriptView
          segments={segments}
          pendingChunks={pendingChunks}
          lastAnalyzedAt={analysis?.generated_at ?? null}
          onClear={handleClearTranscript}
        />
      </div>

      <footer className="px-4 py-1.5 border-t border-ink-700 flex items-center justify-between text-[10px] text-ink-300">
        <span>
          {capture.totalCapturedMs > 0 && (
            <>
              {Math.floor(capture.totalCapturedMs / 60000)}:
              {Math.floor((capture.totalCapturedMs % 60000) / 1000).toString().padStart(2, "0")} captured · local whisper.cpp
            </>
          )}
        </span>
        <span>{analysis && `Last analyzed ${formatRelativeTime(analysis.generated_at)}`}</span>
      </footer>

      <SourcePicker
        open={pickerOpen}
        onPick={handlePickSource}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
