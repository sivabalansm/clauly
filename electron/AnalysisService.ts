import Anthropic from "@anthropic-ai/sdk"
import type { ContractRecord } from "./ContractStore"

export interface Redline {
  clause_reference: string
  original_text: string
  suggested_change: string
  rationale: string
  severity: "high" | "medium" | "low"
}

export interface DiscussionPoint {
  topic: string
  what_to_say: string
  priority: "high" | "medium" | "low"
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

const SYSTEM_PROMPT = `You are Clauly, a contract negotiation assistant helping a user during a LIVE meeting. Your job is to read the contract (provided once, cached) and the live transcript of what is being said right now, then return concise, actionable guidance the user can act on within seconds.

ABSOLUTE RULES:
1. NEVER fabricate contract text. Every "original_text" field MUST be a verbatim quote from the contract. If you cannot find a verbatim quote that supports your point, write "not addressed in contract" in original_text and adjust your suggestion accordingly.
2. NEVER invent clause numbers. Use exact section references from the contract (e.g., "Section 4.2", "Clause 11(b)"). If the contract has no numbering, write "Unnumbered: <first 8 words of clause>".
3. Speak like a sharp negotiator, not a textbook. "what_to_say" must sound like something a person would actually say out loud — short, plain, conversational. Avoid lawyer-speak phrases like "pursuant to", "notwithstanding", "heretofore".
4. Prioritize what was just said in the LAST 2-3 turns of the transcript. Older transcript is context, not the current focus.
5. Return valid JSON only. No markdown, no preamble, no trailing commentary.

OUTPUT SCHEMA (return EXACTLY this shape):
{
  "summary": "1 sentence on where the conversation is right now",
  "current_topic": "which contract clause/topic is being discussed RIGHT NOW based on the latest transcript turns; if unclear, write 'general'",
  "redlines": [
    {
      "clause_reference": "Section X.Y or 'Unnumbered: <first 8 words>'",
      "original_text": "verbatim quote from the contract",
      "suggested_change": "specific edit, in plain language",
      "rationale": "1 sentence why",
      "severity": "high | medium | low"
    }
  ],
  "discussion_points": [
    {
      "topic": "short label",
      "what_to_say": "literal sentence the user can speak",
      "priority": "high | medium | low"
    }
  ],
  "risks": [
    {
      "concern": "what the other party just said or implied",
      "implication": "concrete consequence",
      "triggered_by_quote": "verbatim snippet from the transcript that triggered this"
    }
  ],
  "quick_replies": ["short response 1", "short response 2", "short response 3"]
}

If the transcript is empty or has no contract-relevant content, return summary "No contract-relevant discussion detected yet." with empty arrays for redlines/discussion_points/risks/quick_replies and current_topic "general".`

export class AnalysisService {
  private client: Anthropic | null = null
  private model: string
  private temperature: number

  constructor() {
    this.model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5"
    this.temperature = Number(process.env.ANALYSIS_TEMPERATURE || "0.2")
  }

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not set. Add it to your .env file to enable analysis.")
      }
      this.client = new Anthropic({ apiKey })
    }
    return this.client
  }

  public async analyze(contract: ContractRecord, transcript: string): Promise<AnalysisResult> {
    const client = this.getClient()
    const start = Date.now()

    const trimmedTranscript = transcript.trim() || "(no speech captured yet)"

    const userMessage = `LIVE TRANSCRIPT (most recent at the bottom):
"""
${trimmedTranscript}
"""

Analyze the most recent 2-3 turns in the context of the contract above and return the JSON object specified in the system prompt. Only quote the contract verbatim. JSON only.`

    let raw = ""
    let attempt = 0
    let parseError: Error | null = null

    while (attempt < 2) {
      attempt++
      const response = await this.callWithCachedContract(client, contract, userMessage, attempt === 2)
      raw = response

      try {
        const parsed = this.parseAndValidate(raw)
        return {
          ...parsed,
          generated_at: Date.now(),
          latency_ms: Date.now() - start,
          model: this.model
        }
      } catch (err: any) {
        parseError = err
        console.warn(`[AnalysisService] JSON parse failed on attempt ${attempt}:`, err.message)
      }
    }

    throw new Error(
      `Analysis returned invalid JSON after 2 attempts. Last error: ${parseError?.message}. Raw output (first 400 chars): ${raw.slice(0, 400)}`
    )
  }

  private async callWithCachedContract(
    client: Anthropic,
    contract: ContractRecord,
    userMessage: string,
    strictRetry: boolean
  ): Promise<string> {
    const systemBlocks = [
      { type: "text" as const, text: SYSTEM_PROMPT },
      {
        type: "text" as const,
        text: `CONTRACT (filename: ${contract.filename}, ${contract.charCount} chars):\n\n${contract.text}`,
        cache_control: { type: "ephemeral" as const }
      }
    ]

    const finalUser = strictRetry
      ? `${userMessage}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a single JSON object. Do not include any text outside the JSON. Do not use markdown code fences.`
      : userMessage

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      temperature: this.temperature,
      system: systemBlocks,
      messages: [{ role: "user", content: finalUser }]
    })

    const block = response.content[0]
    if (!block || block.type !== "text") {
      throw new Error("Anthropic returned no text content")
    }
    return block.text
  }

  private parseAndValidate(raw: string): Omit<AnalysisResult, "generated_at" | "latency_ms" | "model"> {
    let text = raw.trim()
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "")
    const firstBrace = text.indexOf("{")
    const lastBrace = text.lastIndexOf("}")
    if (firstBrace > 0 || lastBrace !== text.length - 1) {
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        text = text.slice(firstBrace, lastBrace + 1)
      }
    }

    const parsed = JSON.parse(text)
    const required = ["summary", "current_topic", "redlines", "discussion_points", "risks", "quick_replies"]
    for (const key of required) {
      if (!(key in parsed)) throw new Error(`Missing required field: ${key}`)
    }
    return {
      summary: String(parsed.summary || ""),
      current_topic: String(parsed.current_topic || "general"),
      redlines: Array.isArray(parsed.redlines) ? parsed.redlines : [],
      discussion_points: Array.isArray(parsed.discussion_points) ? parsed.discussion_points : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      quick_replies: Array.isArray(parsed.quick_replies) ? parsed.quick_replies.map(String) : []
    }
  }

  public async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const client = this.getClient()
      await client.messages.create({
        model: this.model,
        max_tokens: 4,
        messages: [{ role: "user", content: "ok" }]
      })
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) }
    }
  }

  public getModel(): string {
    return this.model
  }
}
