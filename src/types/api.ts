export interface ContractInfo {
  filename: string
  charCount: number
  loadedAt: number
  glossarySize: number
  wordDocPath: string | null
}

export interface TranscribeResult {
  text: string
  durationMs: number
  model: string
}

export type Severity = "high" | "medium" | "low"

export interface Redline {
  clause_reference: string
  original_text: string
  suggested_change: string
  rationale: string
  severity: Severity
}

export interface DiscussionPoint {
  topic: string
  what_to_say: string
  priority: Severity
}

export interface RiskNote {
  concern: string
  implication: string
  triggered_by_quote: string
}

export interface AnalysisResult {
  summary: string
  current_topic: string
  redlines: Redline[]
  discussion_points: DiscussionPoint[]
  risks: RiskNote[]
  quick_replies: string[]
  generated_at: number
  latency_ms: number
  model: string
}

export interface AppConfig {
  anthropicConfigured: boolean
  openaiConfigured: boolean
  anthropicModel: string
  transcribeModel: string
  platform: NodeJS.Platform
}

export interface AudioSource {
  id: string
  name: string
  kind: "screen" | "window"
  thumbnail: string | null
}

export type CaptureMode = "mic" | "system"

export interface TranscriptSegment {
  id: string
  text: string
  capturedAt: number
  durationMs: number
}
