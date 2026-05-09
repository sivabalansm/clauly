import type {
  ContractInfo,
  AnalysisResult,
  TranscribeResult,
  AppConfig,
  AudioSource
} from "./api"

declare global {
  interface Window {
    clauly: {
      loadContractFromText: (text: string, filename?: string) => Promise<{ ok: boolean; info: ContractInfo }>
      loadContractFromFile: (filePath: string) => Promise<{ ok: boolean; info: ContractInfo }>
      loadContractFromBuffer: (buffer: ArrayBuffer, filename: string) => Promise<{ ok: boolean; info: ContractInfo }>
      getContractInfo: () => Promise<ContractInfo | null>
      clearContract: () => Promise<{ ok: boolean }>

      transcribeChunk: (audio: ArrayBuffer, mimeType: string, primingText: string) => Promise<TranscribeResult>
      transcribeChunkLocal: (audio: ArrayBuffer, mimeType: string) => Promise<TranscribeResult>
      testLocalWhisper: () => Promise<{ ok: boolean; error?: string }>

      listAudioSources: () => Promise<AudioSource[]>
      setSelectedAudioSource: (sourceId: string | null) => Promise<{ ok: boolean }>

      analyzeNow: (transcript: string) => Promise<AnalysisResult>

      toggleAlwaysOnTop: () => Promise<boolean>
      isAlwaysOnTop: () => Promise<boolean>
      toggleVisibility: () => Promise<void>

      getConfig: () => Promise<AppConfig>
      testConnections: () => Promise<unknown>

      onTriggerAnalyze: (cb: () => void) => () => void
      onTriggerToggleCapture: (cb: () => void) => () => void
    }
  }
}

export {}
