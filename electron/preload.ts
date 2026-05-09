import { contextBridge, ipcRenderer } from "electron"

const api = {
  loadContractFromText: (text: string, filename?: string) =>
    ipcRenderer.invoke("contract:load-text", { text, filename }),
  loadContractFromFile: (filePath: string) =>
    ipcRenderer.invoke("contract:load-file", filePath),
  loadContractFromBuffer: (buffer: ArrayBuffer, filename: string) =>
    ipcRenderer.invoke("contract:load-buffer", { buffer: Buffer.from(buffer), filename }),
  getContractInfo: () => ipcRenderer.invoke("contract:get-info"),
  clearContract: () => ipcRenderer.invoke("contract:clear"),

  transcribeChunk: (audio: ArrayBuffer, mimeType: string, primingText: string) =>
    ipcRenderer.invoke("transcribe:chunk", {
      buffer: Buffer.from(audio),
      mimeType,
      primingText
    }),

  transcribeChunkLocal: (audio: ArrayBuffer, mimeType: string) =>
    ipcRenderer.invoke("transcribe:chunk-local", {
      buffer: Buffer.from(audio),
      mimeType
    }),

  testLocalWhisper: () => ipcRenderer.invoke("transcribe:test-local"),

  listAudioSources: () => ipcRenderer.invoke("audio:list-sources"),
  setSelectedAudioSource: (sourceId: string | null) =>
    ipcRenderer.invoke("audio:set-selected-source", sourceId),

  analyzeNow: (transcript: string) =>
    ipcRenderer.invoke("analyze:now", { transcript }),

  toggleAlwaysOnTop: () => ipcRenderer.invoke("window:toggle-aot"),
  isAlwaysOnTop: () => ipcRenderer.invoke("window:is-aot"),
  toggleVisibility: () => ipcRenderer.invoke("window:toggle-visibility"),

  getConfig: () => ipcRenderer.invoke("config:get"),
  testConnections: () => ipcRenderer.invoke("config:test"),

  onTriggerAnalyze: (cb: () => void) => {
    const sub = () => cb()
    ipcRenderer.on("trigger:analyze", sub)
    return () => ipcRenderer.removeListener("trigger:analyze", sub)
  },
  onTriggerToggleCapture: (cb: () => void) => {
    const sub = () => cb()
    ipcRenderer.on("trigger:toggle-capture", sub)
    return () => ipcRenderer.removeListener("trigger:toggle-capture", sub)
  }
}

contextBridge.exposeInMainWorld("clauly", api)

export type ClaulyAPI = typeof api
