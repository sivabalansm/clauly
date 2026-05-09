import { app, BrowserWindow, desktopCapturer, session } from "electron"
import path from "node:path"
import dotenv from "dotenv"
import { WindowHelper } from "./WindowHelper"
import { initializeIpcHandlers } from "./ipcHandlers"
import { ContractStore } from "./ContractStore"
import { TranscriptionService } from "./TranscriptionService"
import { LocalWhisperService } from "./LocalWhisperService"
import { AnalysisService } from "./AnalysisService"
import { registerGlobalShortcuts, unregisterAllShortcuts } from "./shortcuts"

dotenv.config({ path: path.join(app.getAppPath(), ".env") })
dotenv.config()

export class AppContext {
  private static instance: AppContext | null = null

  public readonly windowHelper: WindowHelper
  public readonly contractStore: ContractStore
  public readonly transcription: TranscriptionService
  public readonly localWhisper: LocalWhisperService
  public readonly analysis: AnalysisService

  public selectedAudioSourceId: string | null = null

  private constructor() {
    this.windowHelper = new WindowHelper()
    this.contractStore = new ContractStore()
    this.transcription = new TranscriptionService()
    this.localWhisper = new LocalWhisperService()
    this.analysis = new AnalysisService()
  }

  public static getInstance(): AppContext {
    if (!AppContext.instance) AppContext.instance = new AppContext()
    return AppContext.instance
  }

  public getMainWindow(): BrowserWindow | null {
    return this.windowHelper.getMainWindow()
  }
}

function configureDisplayMediaHandler(ctx: AppContext): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          fetchWindowIcons: false,
          thumbnailSize: { width: 0, height: 0 }
        })
        const wanted = ctx.selectedAudioSourceId
        const chosen = wanted ? sources.find((s) => s.id === wanted) : null
        const fallback = sources.find((s) => s.id.startsWith("screen:")) || sources[0]
        const source = chosen || fallback
        if (!source) {
          callback({})
          return
        }
        callback({ video: source, audio: "loopback" })
      } catch (err) {
        console.error("[main] setDisplayMediaRequestHandler error:", err)
        callback({})
      }
    },
    { useSystemPicker: false }
  )
}

async function bootstrap() {
  const ctx = AppContext.getInstance()
  initializeIpcHandlers(ctx)

  await app.whenReady()
  configureDisplayMediaHandler(ctx)
  ctx.windowHelper.createWindow()
  registerGlobalShortcuts(ctx)

  app.on("activate", () => {
    if (ctx.getMainWindow() === null) ctx.windowHelper.createWindow()
  })

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
  })

  app.on("will-quit", () => {
    unregisterAllShortcuts()
  })
}

bootstrap().catch((err) => {
  console.error("[main] bootstrap failed:", err)
  app.exit(1)
})
