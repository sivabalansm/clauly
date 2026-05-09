import { globalShortcut } from "electron"
import type { AppContext } from "./main"

export function registerGlobalShortcuts(ctx: AppContext): void {
  globalShortcut.register("CommandOrControl+Shift+A", () => {
    const win = ctx.getMainWindow()
    win?.webContents.send("trigger:analyze")
  })

  globalShortcut.register("CommandOrControl+Shift+L", () => {
    const win = ctx.getMainWindow()
    win?.webContents.send("trigger:toggle-capture")
  })

  globalShortcut.register("CommandOrControl+Shift+H", () => {
    ctx.windowHelper.toggleVisibility()
  })
}

export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll()
}
