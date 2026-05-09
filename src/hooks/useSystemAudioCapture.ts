import { useCallback, useEffect, useRef, useState } from "react"
import type { CaptureMode } from "../types/api"

export interface SystemAudioCaptureOptions {
  mode: CaptureMode
  selectedSourceId: string | null
  chunkMs: number
  onChunk: (blob: Blob, durationMs: number) => Promise<void> | void
  onError: (message: string) => void
  onStatus?: (message: string) => void
}

export interface SystemAudioCaptureControls {
  isCapturing: boolean
  start: () => Promise<void>
  stop: () => void
  totalCapturedMs: number
}

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4"
]

function pickMimeType(): string {
  for (const candidate of PREFERRED_MIME_TYPES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }
  return "audio/webm"
}

export function useSystemAudioCapture(opts: SystemAudioCaptureOptions): SystemAudioCaptureControls {
  const [isCapturing, setIsCapturing] = useState(false)
  const [totalCapturedMs, setTotalCapturedMs] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const cycleTimerRef = useRef<number | null>(null)
  const chunkStartRef = useRef<number>(0)
  const stoppingRef = useRef<boolean>(false)
  const optsRef = useRef(opts)

  useEffect(() => {
    optsRef.current = opts
  }, [opts])

  const acquireStream = useCallback(async (): Promise<MediaStream> => {
    const mode = optsRef.current.mode
    if (mode === "mic") {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
    }

    if (optsRef.current.selectedSourceId) {
      await window.clauly.setSelectedAudioSource(optsRef.current.selectedSourceId)
    }
    const display = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true
    } as MediaStreamConstraints)
    const audioTracks = display.getAudioTracks()
    for (const v of display.getVideoTracks()) v.stop()
    if (audioTracks.length === 0) {
      for (const t of display.getTracks()) t.stop()
      throw new Error(
        "No system audio track returned. On macOS, grant Screen Recording permission in System Settings → Privacy & Security and try again."
      )
    }
    return new MediaStream(audioTracks)
  }, [])

  const startRecorderCycle = useCallback((stream: MediaStream, mimeType: string) => {
    const recorder = new MediaRecorder(stream, { mimeType })
    recorderRef.current = recorder
    chunkStartRef.current = performance.now()
    const chunks: Blob[] = []

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      const duration = Math.round(performance.now() - chunkStartRef.current)
      const blob = new Blob(chunks, { type: mimeType })
      if (blob.size > 0 && duration > 200) {
        setTotalCapturedMs((prev) => prev + duration)
        Promise.resolve(optsRef.current.onChunk(blob, duration)).catch((err) => {
          optsRef.current.onError(`Transcription failed: ${err?.message || err}`)
        })
      }
      if (!stoppingRef.current && streamRef.current) {
        startRecorderCycle(streamRef.current, mimeType)
      }
    }

    recorder.start()
    cycleTimerRef.current = window.setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop()
      }
    }, optsRef.current.chunkMs)
  }, [])

  const cleanup = useCallback(() => {
    if (cycleTimerRef.current !== null) {
      window.clearTimeout(cycleTimerRef.current)
      cycleTimerRef.current = null
    }
    recorderRef.current = null
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop()
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined)
      audioCtxRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    if (isCapturing) return
    stoppingRef.current = false
    setTotalCapturedMs(0)
    try {
      optsRef.current.onStatus?.("Acquiring audio source…")
      const stream = await acquireStream()
      streamRef.current = stream
      const mimeType = pickMimeType()
      optsRef.current.onStatus?.(`Capturing → whisper.cpp (${mimeType})`)
      setIsCapturing(true)
      startRecorderCycle(stream, mimeType)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      optsRef.current.onError(msg)
      setIsCapturing(false)
      cleanup()
    }
  }, [acquireStream, isCapturing, startRecorderCycle, cleanup])

  const stop = useCallback(() => {
    stoppingRef.current = true
    if (cycleTimerRef.current !== null) {
      window.clearTimeout(cycleTimerRef.current)
      cycleTimerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state === "recording") {
      try {
        recorderRef.current.stop()
      } catch {}
    }
    setIsCapturing(false)
    setTimeout(cleanup, 200)
  }, [cleanup])

  useEffect(() => {
    return () => {
      stoppingRef.current = true
      cleanup()
    }
  }, [cleanup])

  return { isCapturing, start, stop, totalCapturedMs }
}
