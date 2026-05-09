import { BrowserWindow, screen } from "electron"
import path from "node:path"

const isDev = process.env.NODE_ENV === "development"

const startUrl = isDev
  ? "http://localhost:5180"
  : `file://${path.join(__dirname, "../dist/index.html")}`

export class WindowHelper {
  private mainWindow: BrowserWindow | null = null
  private alwaysOnTop: boolean = true

  public createWindow(): void {
    if (this.mainWindow !== null) return

    const primary = screen.getPrimaryDisplay()
    const work = primary.workAreaSize
    const initialWidth = Math.min(880, Math.floor(work.width * 0.6))
    const initialHeight = Math.min(820, Math.floor(work.height * 0.86))

    const isMac = process.platform === "darwin"

    this.mainWindow = new BrowserWindow({
      width: initialWidth,
      height: initialHeight,
      minWidth: 720,
      minHeight: 520,
      x: work.width - initialWidth - 24,
      y: 24,
      title: "Clauly",
      backgroundColor: "#00000000",
      transparent: true,
      hasShadow: false,
      show: false,
      frame: !isMac,
      titleBarStyle: isMac ? "hiddenInset" : "default",
      trafficLightPosition: { x: 14, y: 14 },
      alwaysOnTop: this.alwaysOnTop,
      resizable: true,
      movable: true,
      skipTaskbar: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload: path.join(__dirname, "preload.js")
      }
    })

    const enforceAlwaysOnTop = () => {
      if (!this.mainWindow || this.mainWindow.isDestroyed() || !this.alwaysOnTop) return
      if (process.platform === "darwin") {
        this.mainWindow.setAlwaysOnTop(true, "floating")
        this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      } else {
        this.mainWindow.setAlwaysOnTop(true, "screen-saver")
      }
    }

    enforceAlwaysOnTop()

    this.mainWindow.loadURL(startUrl).catch((err) => {
      console.error("[WindowHelper] loadURL failed:", err)
    })

    this.mainWindow.once("ready-to-show", () => {
      if (!this.mainWindow) return
      this.mainWindow.show()
      this.mainWindow.focus()
      enforceAlwaysOnTop()
      setTimeout(enforceAlwaysOnTop, 200)
      setTimeout(enforceAlwaysOnTop, 1000)
      this.applyLinuxTilingWMHints()
    })

    this.mainWindow.on("blur", enforceAlwaysOnTop)
    this.mainWindow.on("show", enforceAlwaysOnTop)

    this.mainWindow.on("closed", () => {
      this.mainWindow = null
    })
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  public toggleAlwaysOnTop(): boolean {
    if (!this.mainWindow) return this.alwaysOnTop
    this.alwaysOnTop = !this.alwaysOnTop
    if (process.platform === "darwin") {
      this.mainWindow.setAlwaysOnTop(this.alwaysOnTop, "floating")
    } else {
      this.mainWindow.setAlwaysOnTop(this.alwaysOnTop)
    }
    return this.alwaysOnTop
  }

  public isAlwaysOnTop(): boolean {
    return this.alwaysOnTop
  }

  public toggleVisibility(): void {
    if (!this.mainWindow) return
    if (this.mainWindow.isVisible()) this.mainWindow.hide()
    else {
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  private applyLinuxTilingWMHints(): void {
    if (process.platform !== "linux") return
    const desktop = (process.env.XDG_CURRENT_DESKTOP || "").toLowerCase()
    const session = (process.env.DESKTOP_SESSION || "").toLowerCase()
    const isI3 = desktop.includes("i3") || session.includes("i3") || Boolean(process.env.I3SOCK)
    const isSway = desktop.includes("sway") || session.includes("sway") || Boolean(process.env.SWAYSOCK)

    if (isI3 || isSway) {
      const { spawn } = require("node:child_process") as typeof import("node:child_process")
      const cmdName = isSway ? "swaymsg" : "i3-msg"
      const command = `[class="clauly"] floating enable, sticky enable, move position 1300px 30px, resize set 580 800`
      try {
        const proc = spawn(cmdName, [command], { stdio: "ignore", detached: true })
        proc.on("error", () => undefined)
        proc.unref()
      } catch {}
      return
    }

    console.warn(
      "[WindowHelper] Linux tiling WM (dwm/xmonad/etc) cannot be auto-floated. Toggle floating with your WM shortcut (e.g. Mod+Space) for true overlay behavior."
    )
  }
}
