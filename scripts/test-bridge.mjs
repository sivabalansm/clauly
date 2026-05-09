process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

const BASE = process.env.CLAULY_BRIDGE_URL || "https://127.0.0.1:8765"
const TIMEOUT_MS = 8000

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

async function main() {
  console.log(`Target: ${BASE}`)

  const health = await fetch(`${BASE}/health`)
  if (!health.ok) fail(`/health returned ${health.status}`)
  const healthBody = await health.json()
  if (!healthBody.ok) fail(`/health body missing ok:true (${JSON.stringify(healthBody)})`)
  console.log(`  ✓ /health → ${JSON.stringify(healthBody)}`)

  const clear = await fetch(`${BASE}/redlines`, { method: "DELETE" })
  if (!clear.ok) fail(`DELETE /redlines returned ${clear.status}`)
  console.log(`  ✓ DELETE /redlines → cleared`)

  const ac = new AbortController()
  const sseProposals = []
  const sseClause = []
  const ssePromise = consumeSse(`${BASE}/redlines/stream`, ac.signal, (evt) => {
    if (evt.type === "proposal") sseProposals.push(evt.data)
    if (evt.type === "active_clause") sseClause.push(evt.data)
  })

  await sleep(150)

  const broadcast = await fetch(`${BASE}/test/broadcast`, { method: "POST" })
  if (!broadcast.ok) fail(`POST /test/broadcast returned ${broadcast.status}`)
  const broadcastBody = await broadcast.json()
  console.log(`  ✓ POST /test/broadcast → ${JSON.stringify(broadcastBody)}`)

  const pending = await fetch(`${BASE}/redlines/pending`).then((r) => r.json())
  if (!Array.isArray(pending) || pending.length < 2) {
    fail(`GET /redlines/pending expected 2+ items, got ${JSON.stringify(pending).slice(0, 200)}`)
  }
  console.log(`  ✓ GET /redlines/pending → ${pending.length} proposal(s)`)

  const deadline = Date.now() + TIMEOUT_MS
  while (sseProposals.length < 2 && Date.now() < deadline) await sleep(100)
  ac.abort()
  await ssePromise.catch(() => undefined)

  if (sseProposals.length < 2) {
    fail(`SSE stream delivered only ${sseProposals.length} proposal(s) within ${TIMEOUT_MS}ms`)
  }
  console.log(`  ✓ SSE stream → ${sseProposals.length} proposal event(s), ${sseClause.length} active_clause event(s)`)
  for (const p of sseProposals) {
    console.log(`      [${p.clause_type}/${p.severity}] ${p.id}`)
    console.log(`        original: ${truncate(p.original_text)}`)
    console.log(`        proposed: ${truncate(p.proposed_text)}`)
  }

  const ackId = sseProposals[0].id
  const ack = await fetch(`${BASE}/redlines/${encodeURIComponent(ackId)}/applied`, { method: "POST" })
  if (!ack.ok) fail(`POST /redlines/${ackId}/applied returned ${ack.status}`)
  console.log(`  ✓ POST /redlines/${ackId}/applied`)

  const after = await fetch(`${BASE}/redlines/pending`).then((r) => r.json())
  if (after.find((p) => p.id === ackId)) fail(`Acked proposal ${ackId} still in pending queue`)
  console.log(`  ✓ Acked proposal removed from queue (${after.length} remaining)`)

  console.log("\nOK: REST + SSE bridge round-trip works.")
  process.exit(0)
}

async function consumeSse(url, signal, onEvent) {
  const res = await fetch(url, { signal, headers: { Accept: "text/event-stream" } })
  if (!res.ok) throw new Error(`SSE ${url} → ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  let currentEvent = null
  while (true) {
    let chunk
    try {
      chunk = await reader.read()
    } catch {
      return
    }
    if (chunk.done) return
    buf += decoder.decode(chunk.value, { stream: true })
    let nl
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "")
      buf = buf.slice(nl + 1)
      if (line === "") {
        if (currentEvent) {
          try {
            onEvent({ type: currentEvent.event, data: JSON.parse(currentEvent.data) })
          } catch {}
        }
        currentEvent = null
        continue
      }
      if (line.startsWith(":")) continue
      const colon = line.indexOf(":")
      const field = colon === -1 ? line : line.slice(0, colon)
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "")
      currentEvent = currentEvent || { event: "message", data: "" }
      if (field === "event") currentEvent.event = value
      else if (field === "data") currentEvent.data = currentEvent.data ? `${currentEvent.data}\n${value}` : value
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function truncate(s, n = 70) {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

main().catch((err) => fail(err?.message || String(err)))
