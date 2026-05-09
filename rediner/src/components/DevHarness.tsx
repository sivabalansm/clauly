import { useState } from "react";
import {
  applyRedline,
  applyNaiveRedline,
  rejectAllTrackedChanges,
  rejectAIChanges,
  acceptAIChanges,
  listTrackedChanges,
} from "../lib/redline";
import {
  getDocumentContext,
  getParagraphs,
  getCurrentSelection,
  getActiveClauseText,
} from "../lib/contract";
import type { Proposal } from "../lib/types";

const PROPOSAL_LOL: Proposal = {
  id: "test_lol",
  clause_id: "clause_5",
  clause_type: "lol",
  original_text: "In no event shall total liability exceed $100.",
  proposed_text:
    "In no event shall the aggregate liability of either party exceed twelve (12) months of fees paid hereunder.",
  reasoning:
    "Market standard caps liability at 12 months of fees, not arbitrary dollar amounts.",
  severity: "aggressive",
  market_evidence: ["CUAD: 73% of SaaS MSAs use 12-month fee cap"],
};

const PROPOSAL_SMART_QUOTES: Proposal = {
  id: "test_smart_quotes",
  clause_id: "clause_6",
  clause_type: "indemnity",
  original_text:
    "The Vendor shall indemnify the Customer for \u201Cany\u201D third-party claim.",
  proposed_text:
    "The Vendor shall indemnify the Customer for any third-party claim arising from Vendor\u2019s gross negligence.",
  reasoning: "Narrow indemnity scope to gross negligence.",
  severity: "market",
  market_evidence: [],
};

const PROPOSAL_SHORT: Proposal = {
  id: "test_short",
  clause_id: "clause_7",
  clause_type: "rw",
  original_text: "exceed $100",
  proposed_text: "exceed $1,000,000",
  reasoning: "Bump cap to $1M.",
  severity: "aggressive",
  market_evidence: [],
};

const PROPOSAL_MISSING: Proposal = {
  id: "test_missing",
  clause_id: "clause_99",
  clause_type: "other",
  original_text: "This text does not exist anywhere in the document at all.",
  proposed_text: "Whatever.",
  reasoning: "Should fail with 'Clause not found'.",
  severity: "soft",
  market_evidence: [],
};

const SAMPLE_CONTRACT = [
  "MASTER SERVICES AGREEMENT",
  "1. Limitation of Liability",
  "In no event shall total liability exceed $100.",
  "2. Indemnification",
  'The Vendor shall indemnify the Customer for "any" third-party claim.',
  "3. Governing Law",
  "This Agreement shall be governed by the laws of Delaware.",
];

type LogEntry = {
  id: number;
  timestamp: string;
  label: string;
  status: "ok" | "fail" | "info";
  payload: unknown;
};

let nextId = 0;

export default function DevHarness() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);

  const append = (label: string, status: LogEntry["status"], payload: unknown) => {
    setLog((prev) => [
      {
        id: nextId++,
        timestamp: new Date().toLocaleTimeString(),
        label,
        status,
        payload,
      },
      ...prev,
    ]);
  };

  const wrap =
    (label: string, fn: () => Promise<unknown>) =>
    async () => {
      if (running) return;
      setRunning(true);
      try {
        const result = await fn();
        const looksLikeFailure =
          typeof result === "object" &&
          result !== null &&
          "ok" in (result as Record<string, unknown>) &&
          (result as { ok: unknown }).ok === false;
        append(label, looksLikeFailure ? "fail" : "ok", result);
      } catch (err) {
        append(label, "fail", String(err));
      } finally {
        setRunning(false);
      }
    };

  const setupContract = wrap("Load sample contract", async () => {
    return await Word.run(async (context) => {
      context.document.body.clear();
      for (const line of SAMPLE_CONTRACT) {
        context.document.body.insertParagraph(line, Word.InsertLocation.end);
      }
      await context.sync();
      return { paragraphs_inserted: SAMPLE_CONTRACT.length };
    });
  });

  const clearAll = wrap("Clear document", async () => {
    return await Word.run(async (context) => {
      context.document.changeTrackingMode = Word.ChangeTrackingMode.off;
      context.document.body.clear();
      await context.sync();
      return { cleared: true };
    });
  });

  const runReadAll = wrap("getDocumentContext", () => getDocumentContext());
  const runReadParas = wrap("getParagraphs", () => getParagraphs());
  const runReadSel = wrap("getCurrentSelection", () => getCurrentSelection());
  const runFindClause = wrap("getActiveClauseText('Limitation')", () =>
    getActiveClauseText("Limitation of Liability")
  );

  const runApplyMinimal = wrap("applyRedline (LoL)", () =>
    applyRedline(PROPOSAL_LOL)
  );
  const runApplyNaive = wrap("applyNaiveRedline (LoL)", () =>
    applyNaiveRedline(PROPOSAL_LOL)
  );
  const runApplySmart = wrap("applyRedline (smart quotes)", () =>
    applyRedline(PROPOSAL_SMART_QUOTES)
  );
  const runApplyShort = wrap("applyRedline (short anchor)", () =>
    applyRedline(PROPOSAL_SHORT)
  );
  const runApplyMissing = wrap("applyRedline (missing - should fail)", () =>
    applyRedline(PROPOSAL_MISSING)
  );

  const runListChanges = wrap("listTrackedChanges", () => listTrackedChanges());
  const runRejectAll = wrap("rejectAllTrackedChanges", () =>
    rejectAllTrackedChanges()
  );
  const runRejectAI = wrap("rejectAIChanges('Redliner AI')", () =>
    rejectAIChanges("Redliner AI")
  );
  const runAcceptAI = wrap("acceptAIChanges('Redliner AI')", () =>
    acceptAIChanges("Redliner AI")
  );

  const runFullSuite = wrap("Full test suite", async () => {
    const results: Array<{ test: string; ok: boolean; details: unknown }> = [];

    await Word.run(async (ctx) => {
      ctx.document.changeTrackingMode = Word.ChangeTrackingMode.off;
      ctx.document.body.clear();
      for (const line of SAMPLE_CONTRACT) {
        ctx.document.body.insertParagraph(line, Word.InsertLocation.end);
      }
      await ctx.sync();
    });

    const ctxResult = await getDocumentContext();
    results.push({
      test: "getDocumentContext returns paragraphs",
      ok:
        ctxResult.paragraphs.length === SAMPLE_CONTRACT.length &&
        ctxResult.full_text.includes("Limitation of Liability"),
      details: { paragraph_count: ctxResult.paragraphs.length },
    });

    const r1 = await applyRedline(PROPOSAL_LOL);
    results.push({
      test: "applyRedline (LoL) succeeds",
      ok: r1.ok && r1.applied_changes > 0,
      details: r1,
    });

    const r2 = await applyRedline(PROPOSAL_SMART_QUOTES);
    results.push({
      test: "applyRedline (smart quotes) succeeds via normalization",
      ok: r2.ok && r2.applied_changes > 0,
      details: r2,
    });

    const r3 = await applyRedline(PROPOSAL_MISSING);
    results.push({
      test: "applyRedline (missing) fails gracefully",
      ok: !r3.ok && (r3.error?.includes("not found") ?? false),
      details: r3,
    });

    const changes = await listTrackedChanges();
    results.push({
      test: "listTrackedChanges returns >= 2 entries after edits",
      ok: changes.length >= 2,
      details: { count: changes.length, sample: changes.slice(0, 2) },
    });

    const rejected = await rejectAllTrackedChanges();
    results.push({
      test: "rejectAllTrackedChanges clears every change",
      ok: rejected >= 2,
      details: { rejected_count: rejected },
    });

    const post = await listTrackedChanges();
    results.push({
      test: "listTrackedChanges empty after rejectAll",
      ok: post.length === 0,
      details: { count: post.length },
    });

    const allPass = results.every((r) => r.ok);
    return {
      summary: allPass ? "ALL PASS" : "SOME FAILED",
      pass_count: results.filter((r) => r.ok).length,
      fail_count: results.filter((r) => !r.ok).length,
      results,
    };
  });

  const buttonStyle: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: "12px",
    border: "1px solid #c2c2c7",
    borderRadius: "4px",
    background: "#fff",
    cursor: "pointer",
    textAlign: "left",
  };
  const sectionStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginBottom: "12px",
  };
  const headerStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 700,
    color: "#3a3a3c",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: "2px",
  };

  return (
    <div
      style={{
        padding: "10px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        fontSize: "12px",
        color: "#1a1a1a",
      }}
    >
      <h2 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>
        Redliner — Dev Harness
      </h2>
      <div style={{ color: "#6e6e73", marginBottom: "12px", fontSize: "11px" }}>
        Office.js bridge module test runner. Each button calls one
        public-API function; results stream below.
      </div>

      <div style={sectionStyle}>
        <div style={headerStyle}>Setup</div>
        <button style={buttonStyle} onClick={setupContract} disabled={running}>
          1. Load sample contract
        </button>
        <button style={buttonStyle} onClick={clearAll} disabled={running}>
          Clear document &amp; reset tracking mode
        </button>
        <button
          style={{ ...buttonStyle, background: "#0066cc", color: "#fff" }}
          onClick={runFullSuite}
          disabled={running}
        >
          Run full test suite (auto)
        </button>
      </div>

      <div style={sectionStyle}>
        <div style={headerStyle}>Read functions (let LLM see the doc)</div>
        <button style={buttonStyle} onClick={runReadAll} disabled={running}>
          getDocumentContext()
        </button>
        <button style={buttonStyle} onClick={runReadParas} disabled={running}>
          getParagraphs()
        </button>
        <button style={buttonStyle} onClick={runReadSel} disabled={running}>
          getCurrentSelection()
        </button>
        <button style={buttonStyle} onClick={runFindClause} disabled={running}>
          getActiveClauseText("Limitation of Liability")
        </button>
      </div>

      <div style={sectionStyle}>
        <div style={headerStyle}>Apply redlines (let LLM edit the doc)</div>
        <button style={buttonStyle} onClick={runApplyMinimal} disabled={running}>
          applyRedline · LoL clause
        </button>
        <button style={buttonStyle} onClick={runApplyNaive} disabled={running}>
          applyNaiveRedline · LoL clause (whole-clause replace)
        </button>
        <button style={buttonStyle} onClick={runApplySmart} disabled={running}>
          applyRedline · smart quotes (normalization test)
        </button>
        <button style={buttonStyle} onClick={runApplyShort} disabled={running}>
          applyRedline · "exceed $100" (short anchor)
        </button>
        <button style={buttonStyle} onClick={runApplyMissing} disabled={running}>
          applyRedline · missing clause (should fail gracefully)
        </button>
      </div>

      <div style={sectionStyle}>
        <div style={headerStyle}>Tracked-change management</div>
        <button style={buttonStyle} onClick={runListChanges} disabled={running}>
          listTrackedChanges()
        </button>
        <button style={buttonStyle} onClick={runAcceptAI} disabled={running}>
          acceptAIChanges("Redliner AI")
        </button>
        <button style={buttonStyle} onClick={runRejectAI} disabled={running}>
          rejectAIChanges("Redliner AI")
        </button>
        <button style={buttonStyle} onClick={runRejectAll} disabled={running}>
          rejectAllTrackedChanges()
        </button>
      </div>

      <div style={{ ...sectionStyle, marginTop: "16px" }}>
        <div style={headerStyle}>Output ({log.length} entries)</div>
        <button
          style={{ ...buttonStyle, fontSize: "11px" }}
          onClick={() => setLog([])}
          disabled={running}
        >
          Clear output
        </button>
        <div
          style={{
            background: "#f4f4f6",
            border: "1px solid #e3e3e7",
            borderRadius: "4px",
            padding: "6px",
            maxHeight: "320px",
            overflow: "auto",
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            fontSize: "10.5px",
          }}
        >
          {log.length === 0 && (
            <div style={{ color: "#6e6e73" }}>Click a button…</div>
          )}
          {log.map((entry) => (
            <div
              key={entry.id}
              style={{
                marginBottom: "8px",
                paddingBottom: "6px",
                borderBottom: "1px dashed #d2d2d7",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  alignItems: "baseline",
                  marginBottom: "2px",
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    color:
                      entry.status === "ok"
                        ? "#1d8348"
                        : entry.status === "fail"
                        ? "#a52a2a"
                        : "#6e6e73",
                  }}
                >
                  [{entry.status.toUpperCase()}]
                </span>
                <span style={{ fontSize: "10px", color: "#6e6e73" }}>
                  {entry.timestamp}
                </span>
                <span style={{ fontWeight: 600 }}>{entry.label}</span>
              </div>
              <pre
                style={{
                  margin: "0 0 0 12px",
                  padding: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify(entry.payload, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
