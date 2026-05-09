import { ipcMain, desktopCapturer, shell } from "electron"
import fs from "node:fs/promises"
import type { AppContext } from "./main"

export function initializeIpcHandlers(ctx: AppContext): void {
  ipcMain.handle("contract:load-text", async (_e, { text, filename }: { text: string; filename?: string }) => {
    const record = await ctx.contractStore.loadFromText(text, filename)
    return { ok: true, info: serializeContract(record) }
  })

  ipcMain.handle("contract:load-file", async (_e, filePath: string) => {
    const record = await ctx.contractStore.loadFromFile(filePath)
    return { ok: true, info: serializeContract(record) }
  })

  ipcMain.handle(
    "contract:load-buffer",
    async (_e, { buffer, filename }: { buffer: Buffer; filename: string }) => {
      const record = await ctx.contractStore.loadFromBuffer(Buffer.from(buffer), filename)
      return { ok: true, info: serializeContract(record) }
    }
  )

  ipcMain.handle("contract:get-info", () => {
    const record = ctx.contractStore.get()
    return record ? serializeContract(record) : null
  })

  ipcMain.handle("contract:clear", () => {
    ctx.contractStore.clear()
    return { ok: true }
  })

  ipcMain.handle("contract:open-in-word", async () => {
    const record = ctx.contractStore.get()
    if (!record?.wordDocPath) {
      throw new Error("No contract loaded — upload a contract first.")
    }
    try {
      await fs.access(record.wordDocPath)
    } catch {
      throw new Error(`Generated DOCX is missing at ${record.wordDocPath}. Re-upload the contract.`)
    }
    const failure = await shell.openPath(record.wordDocPath)
    if (failure) throw new Error(failure)
    return { ok: true, path: record.wordDocPath }
  })

  ipcMain.handle(
    "transcribe:chunk",
    async (_e, { buffer, mimeType, primingText }: { buffer: Buffer; mimeType: string; primingText: string }) => {
      const contract = ctx.contractStore.get()
      const glossary = contract?.glossary?.slice(0, 30).join(", ") ?? ""
      const fullPrimer = [glossary, primingText].filter(Boolean).join(". ").slice(-220)
      const result = await ctx.transcription.transcribeChunk(Buffer.from(buffer), mimeType, fullPrimer)
      return result
    }
  )

  ipcMain.handle(
    "transcribe:chunk-local",
    async (_e, { buffer, mimeType }: { buffer: Buffer; mimeType: string }) => {
      const result = await ctx.localWhisper.transcribeChunk(Buffer.from(buffer), mimeType)
      return result
    }
  )

  ipcMain.handle("transcribe:test-local", async () => {
    return ctx.localWhisper.testReady()
  })

  ipcMain.handle("audio:list-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      fetchWindowIcons: false,
      thumbnailSize: { width: 320, height: 180 }
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.id.startsWith("screen:") ? ("screen" as const) : ("window" as const),
      thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL()
    }))
  })

  ipcMain.handle("audio:set-selected-source", (_e, sourceId: string | null) => {
    ctx.selectedAudioSourceId = sourceId
    return { ok: true }
  })

  ipcMain.handle("analyze:now", async (_e, { transcript }: { transcript: string }) => {
    const contract = ctx.contractStore.get()
    if (!contract) {
      throw new Error("No contract loaded. Upload a contract before analyzing.")
    }
    const result = await ctx.analysis.analyze(contract, transcript)
    const pushed = ctx.redlineHttp.broadcastAnalysis(result)
    if (pushed.proposals > 0 || pushed.activeClause) {
      console.log(
        `[analyze:now] pushed ${pushed.proposals} proposal(s) to ${ctx.redlineHttp.listenerCount()} subscriber(s)`
      )
    } else if (result.redlines.length > 0) {
      console.log(
        `[analyze:now] ${result.redlines.length} redline(s) generated but no SSE subscribers attached to https://127.0.0.1:8765/redlines/stream`
      )
    }
    return result
  })

  ipcMain.handle("redline:bridge-status", () => ({
    listening: true,
    listeners: ctx.redlineHttp.listenerCount(),
    queued: ctx.redlineHttp.queueSize()
  }))

  ipcMain.handle("window:toggle-aot", () => ctx.windowHelper.toggleAlwaysOnTop())
  ipcMain.handle("window:is-aot", () => ctx.windowHelper.isAlwaysOnTop())
  ipcMain.handle("window:toggle-visibility", () => ctx.windowHelper.toggleVisibility())

  ipcMain.handle("config:get", () => ({
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    anthropicModel: ctx.analysis.getModel(),
    transcribeModel: ctx.localWhisper.getModel(),
    platform: process.platform
  }))

  ipcMain.handle("config:test", async () => {
    const [anthropic, openai, local] = await Promise.all([
      ctx.analysis.testConnection(),
      ctx.transcription.testConnection(),
      ctx.localWhisper.testReady()
    ])
    return { anthropic, openai, local }
  })
}

function serializeContract(record: {
  filename: string
  charCount: number
  loadedAt: number
  glossary: string[]
  wordDocPath: string | null
}) {
  return {
    filename: record.filename,
    charCount: record.charCount,
    loadedAt: record.loadedAt,
    glossarySize: record.glossary.length,
    wordDocPath: record.wordDocPath
  }
}
