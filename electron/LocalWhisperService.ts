import path from "node:path"
import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import os from "node:os"
import { app } from "electron"

export interface LocalTranscribeResult {
  text: string
  durationMs: number
  model: string
}

const SUPPORTED_MODELS = [
  "tiny",
  "tiny.en",
  "base",
  "base.en",
  "small",
  "small.en",
  "medium",
  "medium.en",
  "large-v3"
] as const

type WhisperModel = (typeof SUPPORTED_MODELS)[number]

export class LocalWhisperService {
  private model: WhisperModel
  private modelDir: string
  private ready: Promise<void> | null = null
  private nodewhisperImport: Promise<typeof import("nodejs-whisper")> | null = null

  constructor() {
    const requested = (process.env.WHISPER_LOCAL_MODEL as WhisperModel) || "base.en"
    this.model = SUPPORTED_MODELS.includes(requested) ? requested : "base.en"
    this.modelDir = path.join(app.getPath("userData"), "whisper-models")
  }

  public getModel(): string {
    return `whisper.cpp/${this.model}`
  }

  private async ensureReady(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = (async () => {
      await fs.mkdir(this.modelDir, { recursive: true })
      this.nodewhisperImport = import("nodejs-whisper")
      await this.nodewhisperImport
    })()
    return this.ready
  }

  public async transcribeChunk(buffer: Buffer, mimeType: string): Promise<LocalTranscribeResult> {
    const start = Date.now()
    await this.ensureReady()

    const ext = mimeTypeToExtension(mimeType)
    const tmpDir = path.join(os.tmpdir(), "clauly-audio")
    await fs.mkdir(tmpDir, { recursive: true })
    const tmpFile = path.join(tmpDir, `chunk-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`)
    await fs.writeFile(tmpFile, buffer)

    let wavFile: string | null = null
    try {
      wavFile = await this.convertToWav16k(tmpFile, ext)
      const mod = await this.nodewhisperImport!
      const result = await mod.nodewhisper(wavFile, {
        modelName: this.model,
        autoDownloadModelName: this.model,
        removeWavFileAfterTranscription: false,
        withCuda: false,
        whisperOptions: {
          outputInText: true,
          translateToEnglish: false,
          wordTimestamps: false,
          timestamps_length: 0,
          splitOnWord: false
        },
        logger: { log: () => {}, debug: () => {}, error: () => {} }
      })

      const text = typeof result === "string" ? result : ""
      return {
        text: cleanWhisperOutput(text),
        durationMs: Date.now() - start,
        model: this.getModel()
      }
    } finally {
      cleanup(tmpFile)
      if (wavFile) cleanup(wavFile)
    }
  }

  private async convertToWav16k(inputFile: string, _ext: string): Promise<string> {
    const wavFile = inputFile.replace(/\.[a-z0-9]+$/i, ".wav")
    if (existsSync(wavFile) && wavFile === inputFile) return wavFile

    const { spawn } = await import("node:child_process")
    return new Promise((resolve, reject) => {
      const proc = spawn(
        "ffmpeg",
        ["-y", "-i", inputFile, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavFile],
        { stdio: ["ignore", "ignore", "pipe"] }
      )
      let stderr = ""
      proc.stderr.on("data", (d) => {
        stderr += d.toString()
      })
      proc.on("error", reject)
      proc.on("close", (code) => {
        if (code === 0) resolve(wavFile)
        else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-300)}`))
      })
    })
  }

  public async testReady(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.ensureReady()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}

function mimeTypeToExtension(mimeType: string): string {
  const lower = mimeType.toLowerCase()
  if (lower.includes("webm")) return "webm"
  if (lower.includes("ogg")) return "ogg"
  if (lower.includes("mp4") || lower.includes("m4a")) return "m4a"
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3"
  if (lower.includes("wav")) return "wav"
  return "webm"
}

function cleanup(filePath: string): void {
  fs.unlink(filePath).catch(() => undefined)
}

function cleanWhisperOutput(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/, "").trim())
    .filter((line) => line && !/^\[BLANK_AUDIO\]$|^\[Music\]$|^\(.*\)$/.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}
