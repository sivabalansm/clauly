import OpenAI from "openai"
import { toFile } from "openai/uploads"

export interface TranscribeResult {
  text: string
  durationMs: number
  model: string
}

const MIN_BUFFER_BYTES = 6 * 1024
const MAX_RETRIES = 3
const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNABORTED",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT"
])

export class TranscriptionService {
  private client: OpenAI | null = null
  private model: string

  constructor() {
    this.model = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1"
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not set. Add it to your .env file to enable live transcription.")
      }
      this.client = new OpenAI({
        apiKey,
        maxRetries: 0,
        timeout: 30000
      })
    }
    return this.client
  }

  public async transcribeChunk(
    buffer: Buffer,
    mimeType: string,
    primingText: string = ""
  ): Promise<TranscribeResult> {
    const start = Date.now()

    if (buffer.length < MIN_BUFFER_BYTES) {
      return { text: "", durationMs: Date.now() - start, model: this.model }
    }

    const client = this.getClient()
    const ext = mimeTypeToExtension(mimeType)
    const filename = `chunk.${ext}`
    const trimmedPrimer = primingText.trim().slice(-220)

    let lastError: any = null
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const file = await toFile(buffer, filename, { type: mimeType })
        const response = (await client.audio.transcriptions.create({
          file,
          model: this.model,
          response_format: "json",
          temperature: 0,
          prompt: trimmedPrimer || undefined
        } as Parameters<typeof client.audio.transcriptions.create>[0])) as unknown as { text: string }

        const text = response.text || ""
        return { text, durationMs: Date.now() - start, model: this.model }
      } catch (err: any) {
        lastError = err
        if (!isTransient(err) || attempt === MAX_RETRIES - 1) break
        const delayMs = 250 * Math.pow(2, attempt)
        console.warn(
          `[TranscriptionService] Transient error (attempt ${attempt + 1}/${MAX_RETRIES}): ${err?.message || err}. Retrying in ${delayMs}ms.`
        )
        await sleep(delayMs)
      }
    }

    const code = lastError?.code || lastError?.cause?.code || ""
    if (lastError?.status === 429 || code === "insufficient_quota") {
      throw new Error(
        "OpenAI quota exhausted (HTTP 429). Add billing credit at https://platform.openai.com/account/billing or use a different OPENAI_API_KEY."
      )
    }
    if (lastError?.status === 401) {
      throw new Error("OpenAI rejected the API key (HTTP 401). Check OPENAI_API_KEY in .env.")
    }
    const detail = code ? ` (${code})` : ""
    throw new Error(`Whisper request failed after ${MAX_RETRIES} attempts: ${lastError?.message || lastError}${detail}`)
  }

  public async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const client = this.getClient()
      await client.models.list()
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) }
    }
  }

  public getModel(): string {
    return this.model
  }
}

function mimeTypeToExtension(mimeType: string): string {
  const lower = mimeType.toLowerCase()
  if (lower.includes("webm")) return "webm"
  if (lower.includes("ogg")) return "ogg"
  if (lower.includes("mp4") || lower.includes("m4a")) return "m4a"
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3"
  if (lower.includes("wav")) return "wav"
  if (lower.includes("flac")) return "flac"
  return "webm"
}

function isTransient(err: any): boolean {
  if (!err) return false
  if (err.name === "AbortError") return true
  const code = err.code || err.cause?.code || err.errno
  if (code === "insufficient_quota") return false
  if (typeof code === "string" && TRANSIENT_ERROR_CODES.has(code)) return true
  if (err.status && err.status >= 500 && err.status < 600) return true
  if (err.status === 429 && code !== "insufficient_quota") return true
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
