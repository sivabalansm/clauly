import { createServer as createHttpsServer, Server as HttpsServer } from "node:https"
import type { IncomingMessage, ServerResponse } from "node:http"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { URL as NodeURL } from "node:url"
import type { AnalysisResult, Redline } from "./AnalysisService"

export interface RedlineProposal {
  type: "proposal"
  id: string
  clause_id: string
  clause_type: "lol" | "indemnity" | "rw" | "ip" | "other"
  original_text: string
  proposed_text: string
  reasoning: string
  severity: "aggressive" | "market" | "soft"
  market_evidence: string[]
}

export interface ActiveClauseEvent {
  type: "active_clause"
  clause_id: string
}

export interface CaptionEvent {
  type: "caption"
  speaker: "ours" | "theirs" | "unknown"
  text: string
  ts: number
}

export type ServerEvent = RedlineProposal | ActiveClauseEvent | CaptionEvent | { type: "cleared" }

interface SseClient {
  res: ServerResponse
  origin: string
}

const DEFAULT_PORT = 8765
const KEEPALIVE_INTERVAL_MS = 25_000
const ALLOWED_ORIGINS = new Set([
  "https://localhost:3000",
  "https://127.0.0.1:3000",
  "https://localhost:5180",
  "https://127.0.0.1:5180"
])

export class RedlineHttpServer {
  private server: HttpsServer | null = null
  private clients = new Set<SseClient>()
  private keepalive: NodeJS.Timeout | null = null
  private pendingById = new Map<string, RedlineProposal>()
  private pendingOrder: string[] = []
  private currentClause: ActiveClauseEvent | null = null
  private readonly port: number

  constructor() {
    const envPort = Number(process.env.REDLINE_BRIDGE_PORT)
    this.port = Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_PORT
  }

  public start(): void {
    if (this.server) return
    const tls = loadDevCerts()
    if (!tls) {
      console.error(
        "[RedlineHttpServer] missing dev TLS certs at ~/.office-addin-dev-certs/. Run `npx office-addin-dev-certs install` to generate them."
      )
      return
    }
    try {
      this.server = createHttpsServer(tls, (req, res) => this.handle(req, res))
      this.server.listen(this.port, "127.0.0.1")
    } catch (err) {
      console.error(`[RedlineHttpServer] failed to bind on port ${this.port}:`, err)
      this.server = null
      return
    }
    this.server.on("error", (err) => {
      console.error("[RedlineHttpServer] server error:", err.message)
    })
    this.keepalive = setInterval(() => {
      for (const client of this.clients) {
        try {
          client.res.write(`: keepalive ${Date.now()}\n\n`)
        } catch {}
      }
    }, KEEPALIVE_INTERVAL_MS)
    console.log(`[RedlineHttpServer] listening on https://127.0.0.1:${this.port}/`)
  }

  public stop(): void {
    if (this.keepalive) clearInterval(this.keepalive)
    this.keepalive = null
    for (const client of this.clients) {
      try {
        client.res.end()
      } catch {}
    }
    this.clients.clear()
    if (this.server) {
      this.server.close()
      this.server = null
    }
  }

  public broadcastAnalysis(analysis: AnalysisResult): { proposals: number; activeClause: boolean } {
    let proposals = 0
    let activeClause = false
    if (analysis.current_topic && analysis.current_topic !== "general") {
      const evt: ActiveClauseEvent = {
        type: "active_clause",
        clause_id: slugifyClause(analysis.current_topic)
      }
      this.currentClause = evt
      this.broadcastEvent("active_clause", evt)
      activeClause = true
    }
    for (let i = 0; i < analysis.redlines.length; i++) {
      const proposal = redlineToProposal(analysis.redlines[i], analysis.generated_at, i)
      this.enqueue(proposal)
      this.broadcastEvent("proposal", proposal)
      proposals++
    }
    return { proposals, activeClause }
  }

  public broadcastSampleProposals(): { proposals: number } {
    const now = Date.now()
    const samples: RedlineProposal[] = [
      {
        type: "proposal",
        id: `test_${now}_lol`,
        clause_id: "section_1",
        clause_type: "lol",
        original_text: "In no event shall total liability exceed $100.",
        proposed_text:
          "In no event shall the aggregate liability of either party exceed twelve (12) months of fees paid hereunder.",
        reasoning:
          "An arbitrary $100 cap is unenforceable in commercial software contracts. Market standard is 12 months of fees, and mutual phrasing avoids one-sidedness.",
        severity: "aggressive",
        market_evidence: ["CUAD: 73% of SaaS MSAs use 12-month fee cap"]
      },
      {
        type: "proposal",
        id: `test_${now}_indem`,
        clause_id: "section_2",
        clause_type: "indemnity",
        original_text: 'The Vendor shall indemnify the Customer for "any" third-party claim.',
        proposed_text:
          "The Vendor shall indemnify the Customer for third-party claims arising solely from Vendor's gross negligence or willful misconduct.",
        reasoning:
          "Original scope is unlimited. Tightening to gross negligence and willful misconduct matches market practice for SaaS vendors.",
        severity: "market",
        market_evidence: ["CUAD: 68% of vendor-side indemnities scoped to gross negligence"]
      }
    ]
    this.currentClause = { type: "active_clause", clause_id: "section_1" }
    this.broadcastEvent("active_clause", this.currentClause)
    for (const p of samples) {
      this.enqueue(p)
      this.broadcastEvent("proposal", p)
    }
    return { proposals: samples.length }
  }

  public hasListeners(): boolean {
    return this.clients.size > 0
  }

  public listenerCount(): number {
    return this.clients.size
  }

  public queueSize(): number {
    return this.pendingById.size
  }

  private enqueue(proposal: RedlineProposal): void {
    if (!this.pendingById.has(proposal.id)) this.pendingOrder.push(proposal.id)
    this.pendingById.set(proposal.id, proposal)
  }

  private removeFromQueue(id: string): boolean {
    if (!this.pendingById.has(id)) return false
    this.pendingById.delete(id)
    const idx = this.pendingOrder.indexOf(id)
    if (idx !== -1) this.pendingOrder.splice(idx, 1)
    return true
  }

  private broadcastEvent(eventName: string, payload: unknown): number {
    const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
    let sent = 0
    for (const client of this.clients) {
      try {
        client.res.write(frame)
        sent++
      } catch {}
    }
    return sent
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new NodeURL(req.url || "/", `https://127.0.0.1:${this.port}`)
    const origin = (req.headers.origin as string) || ""
    const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "*"

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Max-Age": "600"
      })
      res.end()
      return
    }

    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Credentials": "false"
    }

    try {
      if (req.method === "GET" && url.pathname === "/health") {
        return jsonOk(res, corsHeaders, {
          ok: true,
          listeners: this.clients.size,
          queued: this.pendingById.size,
          version: "1.0.0"
        })
      }

      if (req.method === "GET" && url.pathname === "/redlines/stream") {
        return this.handleSse(req, res, origin)
      }

      if (req.method === "GET" && url.pathname === "/redlines/pending") {
        const ordered = this.pendingOrder
          .map((id) => this.pendingById.get(id))
          .filter((p): p is RedlineProposal => Boolean(p))
        return jsonOk(res, corsHeaders, ordered)
      }

      if (req.method === "DELETE" && url.pathname === "/redlines") {
        this.pendingById.clear()
        this.pendingOrder.length = 0
        this.currentClause = null
        this.broadcastEvent("cleared", { type: "cleared" })
        return jsonOk(res, corsHeaders, { ok: true, cleared: true })
      }

      const appliedMatch = req.method === "POST" && url.pathname.match(/^\/redlines\/([^/]+)\/applied$/)
      if (appliedMatch) {
        const removed = this.removeFromQueue(decodeURIComponent(appliedMatch[1]))
        return jsonOk(res, corsHeaders, { ok: removed, removed })
      }

      const rejectedMatch = req.method === "POST" && url.pathname.match(/^\/redlines\/([^/]+)\/rejected$/)
      if (rejectedMatch) {
        const removed = this.removeFromQueue(decodeURIComponent(rejectedMatch[1]))
        return jsonOk(res, corsHeaders, { ok: removed, removed })
      }

      if (req.method === "POST" && url.pathname === "/test/broadcast") {
        const result = this.broadcastSampleProposals()
        return jsonOk(res, corsHeaders, { ok: true, ...result })
      }

      jsonResponse(res, 404, corsHeaders, { ok: false, error: "Not found", path: url.pathname })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      jsonResponse(res, 500, corsHeaders, { ok: false, error: message })
    }
  }

  private handleSse(req: IncomingMessage, res: ServerResponse, origin: string): void {
    const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "*"
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": allowOrigin
    })
    res.write(`retry: 2000\n\n`)
    res.write(`event: hello\ndata: ${JSON.stringify({ source: "clauly", queued: this.pendingById.size })}\n\n`)
    if (this.currentClause) {
      res.write(`event: active_clause\ndata: ${JSON.stringify(this.currentClause)}\n\n`)
    }
    for (const id of this.pendingOrder) {
      const proposal = this.pendingById.get(id)
      if (proposal) res.write(`event: proposal\ndata: ${JSON.stringify(proposal)}\n\n`)
    }
    const client: SseClient = { res, origin }
    this.clients.add(client)
    console.log(`[RedlineHttpServer] subscriber connected from ${origin || "?"} (${this.clients.size} total)`)
    const cleanup = () => {
      if (!this.clients.delete(client)) return
      console.log(`[RedlineHttpServer] subscriber disconnected (${this.clients.size} remaining)`)
    }
    req.on("close", cleanup)
    req.on("error", cleanup)
    res.on("error", cleanup)
  }
}

function jsonOk(res: ServerResponse, headers: Record<string, string>, body: unknown): void {
  jsonResponse(res, 200, headers, body)
}

function jsonResponse(res: ServerResponse, status: number, headers: Record<string, string>, body: unknown): void {
  res.writeHead(status, { ...headers, "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

function redlineToProposal(redline: Redline, generatedAt: number, index: number): RedlineProposal {
  return {
    type: "proposal",
    id: `clauly_${generatedAt}_${index}`,
    clause_id: slugifyClause(redline.clause_reference),
    clause_type: classifyClause(redline.clause_reference, redline.original_text),
    original_text: redline.original_text,
    proposed_text: redline.suggested_change,
    reasoning: redline.rationale,
    severity: severityToProposalSeverity(redline.severity),
    market_evidence: []
  }
}

function severityToProposalSeverity(s: Redline["severity"]): RedlineProposal["severity"] {
  if (s === "high") return "aggressive"
  if (s === "medium") return "market"
  return "soft"
}

function slugifyClause(reference: string): string {
  return (
    reference
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64) || "clause"
  )
}

function classifyClause(reference: string, text: string): RedlineProposal["clause_type"] {
  const haystack = `${reference} ${text}`.toLowerCase()
  if (/limit.*liab|aggregate liab|liability.*cap/.test(haystack)) return "lol"
  if (/indemnif|indemnity|hold.*harmless/.test(haystack)) return "indemnity"
  if (/represent|warrant/.test(haystack)) return "rw"
  if (/intellectual property|copyright|trademark|patent|\bip\b/.test(haystack)) return "ip"
  return "other"
}

function loadDevCerts(): { cert: Buffer; key: Buffer } | null {
  const certDir = process.env.OFFICE_ADDIN_CERTS_DIR || path.join(os.homedir(), ".office-addin-dev-certs")
  const certPath = path.join(certDir, "localhost.crt")
  const keyPath = path.join(certDir, "localhost.key")
  try {
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) return null
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }
  } catch {
    return null
  }
}
