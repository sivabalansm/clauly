# Redliner — Implementation Plan

> Word task-pane add-in that receives AI-generated counter-proposals over WebSocket
> and applies them as native track-changes redlines via Office.js. This branch
> covers the **frontend half** (Word add-in). The backend, LLM orchestration,
> and caption-capture client live on a separate track.

---

## Table of Contents

1. [Scope & ownership](#1-scope--ownership)
2. [Architecture](#2-architecture)
3. [Wire protocol — the contract between halves](#3-wire-protocol--the-contract-between-halves)
4. [Prerequisites](#4-prerequisites)
5. [Project layout](#5-project-layout)
6. [Office.js mental model](#6-officejs-mental-model)
7. [Phase 1 — Scaffold + Hello World](#7-phase-1--scaffold--hello-world)
8. [Phase 2 — Stub backend + WebSocket plumbing](#8-phase-2--stub-backend--websocket-plumbing)
9. [Phase 3 — Naive redline mechanic](#9-phase-3--naive-redline-mechanic)
10. [Phase 4 — Minimal-diff redline mechanic](#10-phase-4--minimal-diff-redline-mechanic)
11. [Phase 5 — Document extraction (making the AI aware)](#11-phase-5--document-extraction-making-the-ai-aware)
12. [Phase 6 — Tab UI (Coach / Standards / Redlines)](#12-phase-6--tab-ui-coach--standards--redlines)
13. [Phase 7 — Live-mode integration](#13-phase-7--live-mode-integration)
14. [Phase 8 — Polish & demo](#14-phase-8--polish--demo)
15. [Hour-by-hour build order](#15-hour-by-hour-build-order)
16. [Gotchas reference card](#16-gotchas-reference-card)
17. [Reference implementations](#17-reference-implementations)
18. [Demo strategy](#18-demo-strategy)
19. [Open decisions for the team](#19-open-decisions-for-the-team)

---

## 1. Scope & ownership

| Layer | Frontend (this branch) | Backend / Coach (other track) |
|---|---|---|
| Word task-pane add-in | ✓ All of it | — |
| Office.js redline mechanics | ✓ All of it | — |
| Task-pane UI (tabs, proposal cards, accept/reject) | ✓ All of it | — |
| WebSocket client | ✓ All of it | — |
| Manifest configuration (incl. AppDomains) | ✓ All of it | — |
| FastAPI / Express backend | — | ✓ |
| LLM calls (classifier, playbooks, RAG) | — | ✓ |
| Caption capture (Chrome extension or Electron) | — | ✓ |
| Topic detection, resolution-signal detection | — | ✓ |
| WebSocket server + ngrok tunnel | — | ✓ |

**The frontend's one job, in one sentence:** Receive a JSON proposal over WebSocket,
render it as a card with Accept and Reject buttons, and on Accept apply the change
as a native Word tracked redline using Office.js.

The frontend can be developed end-to-end against a **stub backend** (30 lines of
Node) without waiting for the real backend. See Phase 2.

---

## 2. Architecture

```
┌──────────────────────────┐    ┌──────────────────────────┐
│  Caption client          │    │  Word Task Pane          │
│  (Chrome ext / Electron) │    │  ◄─── THIS BRANCH ───►   │
│                          │    │                          │
│  (other track)           │    │  React + Office.js       │
└──────────┬───────────────┘    │                          │
           │ POST /captions     │  Tabs:                   │
           │                    │   - Coach                │
           ▼                    │   - Standards            │
   ┌────────────────────┐       │   - Redlines             │
   │  Backend           │       │                          │
   │  (other track)     │       └─────────────┬────────────┘
   │                    │                     │
   │  - LLM orchestrator│ ◄────── WSS ────────┤
   │  - Classifier      │  /contracts/{id}/   │
   │  - Playbooks       │       live          │
   │  - State mgmt      │                     │
   │  - WSS server      │  POST /redlines/    │
   │                    │       {id}/accept   │
   │                    │ ◄───────────────────┤
   └────────────────────┘                     │
                                              ▼
                                  ┌────────────────────┐
                                  │  The Word document │
                                  │  (Office.js)       │
                                  │                    │
                                  │  Tracked changes   │
                                  │  appear here       │
                                  └────────────────────┘
```

The boundary is the WebSocket connection. Everything that crosses it is specified in section 3.

---

## 3. Wire protocol — the contract between halves

**Lock this on hour 1 with the backend track.** Both halves implement against this
independently; if it changes mid-build, both halves break.

### 3.1 From frontend → backend (HTTPS)

```
POST {backend}/contracts
  body: { paragraphs: ParagraphInfo[] }
  response: { contract_id: string, clauses: ClauseInfo[] }

POST {backend}/redlines/{proposal_id}/accept
  > user clicked Accept; backend should mark clause AGREED

POST {backend}/redlines/{proposal_id}/reject
  > user clicked Reject; backend may regenerate or mark DISCUSSING

POST {backend}/contracts/{contract_id}/analyze
  > optional explicit "re-analyze the whole contract" trigger
```

### 3.2 From backend → frontend (WSS)

Frontend subscribes to `wss://{backend}/contracts/{contract_id}/live`. The backend pushes typed JSON.

#### Type: `proposal`

```json
{
  "type": "proposal",
  "id": "prop_xyz",
  "clause_id": "clause_5",
  "clause_type": "lol",
  "original_text": "In no event shall total liability exceed $100.",
  "proposed_text": "In no event shall total liability exceed twelve (12) months of fees paid hereunder.",
  "reasoning": "Market standard caps at 12 months of fees, not arbitrary dollar amounts.",
  "severity": "aggressive",
  "market_evidence": ["CUAD ex 1234", "ABA Model Rule 1.6"]
}
```

#### Type: `active_clause`

```json
{ "type": "active_clause", "clause_id": "clause_5" }
```

The backend believes the conversation has shifted to this clause. Frontend highlights
it in the Redlines tab and switches to its proposal if one exists.

#### Type: `clause_resolved`

```json
{ "type": "clause_resolved", "clause_id": "clause_5" }
```

Both parties have agreed on this clause. Frontend strikes through the proposal card
and archives it.

#### Type: `standard_citation`

```json
{
  "type": "standard_citation",
  "title": "ABA Model Rule 1.6",
  "excerpt": "A lawyer shall not reveal information relating to the representation of a client...",
  "url": "https://www.americanbar.org/...",
  "clause_id": "clause_5"
}
```

Frontend renders in the Standards tab.

#### Type: `caption`

```json
{
  "type": "caption",
  "speaker": "ours",
  "text": "we want unlimited liability for IP infringement",
  "ts": 1715257200.123
}
```

Pass-through transcript for the Coach tab to display in real time.

### 3.3 TypeScript types (drop into `src/taskpane/types.ts`)

```typescript
export type ClauseType = "lol" | "indemnity" | "rw" | "ip" | "other";
export type Severity = "aggressive" | "market" | "soft";

export interface ParagraphInfo {
  index: number;
  text: string;
  style: string;
}

export interface ClauseInfo {
  id: string;
  type: ClauseType;
  paragraph_indices: number[];
  text: string;
}

export interface Proposal {
  type: "proposal";
  id: string;
  clause_id: string;
  clause_type: ClauseType;
  original_text: string;
  proposed_text: string;
  reasoning: string;
  severity: Severity;
  market_evidence: string[];
}

export interface ActiveClause { type: "active_clause"; clause_id: string; }
export interface ClauseResolved { type: "clause_resolved"; clause_id: string; }
export interface Caption {
  type: "caption";
  speaker: "ours" | "theirs" | null;
  text: string;
  ts: number;
}
export interface StandardCitation {
  type: "standard_citation";
  title: string;
  excerpt: string;
  url: string;
  clause_id?: string;
}

export type WSMessage =
  | Proposal
  | ActiveClause
  | ClauseResolved
  | Caption
  | StandardCitation;
```

---

## 4. Prerequisites

### Tools

```bash
brew install node                       # Node.js LTS (v20 or v22)
npm install -g yo generator-office       # Yo Office add-in scaffold
npx -y office-addin-dev-certs install    # localhost HTTPS cert
brew install --cask visual-studio-code   # if not already installed
```

### Microsoft 365 account

A commercial Microsoft 365 account (Business / Enterprise / EDU) with sideload
permission. Personal subscriptions and the Microsoft 365 Developer Program are
**not** valid options for new applicants in 2024+.

If your institution blocks sideloading: sign up for a [Microsoft 365 Business
Standard 30-day trial](https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-business-standard).
Free for 30 days, $0 if cancelled, supports sideload.

### Verify sideload works (60 seconds)

1. Sign in to https://word.cloud.microsoft with your tenant account.
2. Open a blank doc.
3. **Home → Add-ins → More Settings → Upload My Add-in**.
4. Confirm the upload dialog appears with a **Developer Mode** checkbox.

If the dialog appears, sideload is enabled. Proceed.

---

## 5. Project layout

```
addin/                            ← Yo Office output, this branch
├── manifest.xml                  ← edit AppDomains here when ngrok URL changes
├── package.json
├── webpack.config.js
└── src/
    └── taskpane/
        ├── taskpane.html
        ├── taskpane.tsx          ← React entry, mounts <App/>
        ├── components/
        │   ├── App.tsx           ← top-level: tabs + WS connection
        │   ├── Tabs.tsx          ← tab switcher
        │   ├── CoachTab.tsx
        │   ├── StandardsTab.tsx
        │   ├── RedlineTab.tsx
        │   └── ProposalCard.tsx
        ├── lib/
        │   ├── ws.ts             ← WebSocket client + reconnect
        │   ├── redline.ts        ← Office.js redline ops
        │   ├── diff.ts           ← word-level diff helper
        │   ├── contract.ts       ← document extraction
        │   └── api.ts            ← POST accept/reject
        └── types.ts              ← Proposal, WSMessage, etc.

stub-backend/                     ← For parallel dev, not committed long-term
└── server.js                     ← 30-line WS server emitting fake proposals
```

---

## 6. Office.js mental model

Every Word interaction follows the same shape.

```typescript
await Word.run(async (context) => {
  // 1. Object references are free, no roundtrip
  const body = context.document.body;

  // 2. Tell Word which properties you want loaded
  body.load("text");

  // 3. context.sync() is the only way to talk to Word
  await context.sync();

  // 4. Now you can read the loaded data
  console.log(body.text);

  // 5. Mutations also queue — must sync to apply
  body.insertParagraph("New paragraph", "End");
  await context.sync();
});
```

### Four facts to remember

1. Object references are free (no roundtrip until sync).
2. You must `load()` any property before you read it.
3. `context.sync()` is the only way to talk to Word.
4. Object references are scoped to one `Word.run` block.

### Three operations you'll use 90% of the time

```typescript
// Find text by string match — returns a RangeCollection
const search = context.document.body.search("Limitation of Liability", { matchCase: false });
search.load("items");
await context.sync();

// Replace text on a range — becomes a tracked change if track-changes is on
search.items[0].insertText("...new text...", Word.InsertLocation.replace);
await context.sync();

// Toggle track changes — global flag on the document
context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
await context.sync();
```

---

## 7. Phase 1 — Scaffold + Hello World

**Goal:** A working `npm start` opens Word with a sample task pane.

### Steps

```bash
mkdir addin && cd addin
yo office
```

Answer:
- Project type: **Office Add-in Task Pane project using React framework**
- Script type: **TypeScript**
- Add-in name: `Redliner`
- Office host: **Word**
- Manifest: **Add-in only manifest (XML)**

Then:

```bash
npm start
```

### Verification

- [ ] Word desktop opens automatically.
- [ ] Right sidebar shows a "Redliner" task pane.
- [ ] Sample button in the task pane writes test text into the document.

### Common issues

| Symptom | Fix |
|---|---|
| `npm start` doesn't open Word | Sign in to Word with the trial account first, then re-run |
| Port 3000 already in use | Run `npm run stop`, then `npm start` |
| Task pane appears blank | Right-click inside the task pane → Inspect → check console |

---

## 8. Phase 2 — Stub backend + WebSocket plumbing

**Goal:** The task pane connects to a fake backend over WebSocket and renders a hardcoded proposal as a card.

### 8.1 Stub backend

```javascript
// stub-backend/server.js — npm install ws first
const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 8000 });

wss.on("connection", (ws) => {
  console.log("client connected");

  setTimeout(() => {
    ws.send(JSON.stringify({
      type: "proposal",
      id: "prop_demo_1",
      clause_id: "clause_5",
      clause_type: "lol",
      original_text: "In no event shall total liability exceed $100.",
      proposed_text: "In no event shall total liability exceed twelve (12) months of fees paid hereunder.",
      reasoning: "Market standard caps at 12 months of fees, not arbitrary dollar amounts.",
      severity: "aggressive",
      market_evidence: ["CUAD: 73% of SaaS MSAs use 12-month fee cap"],
    }));
  }, 1000);

  ws.on("message", (m) => console.log("from client:", m.toString()));
  ws.on("close", () => console.log("client disconnected"));
});

console.log("stub backend listening on ws://localhost:8000");
```

Run with `node server.js` in a separate terminal.

### 8.2 WebSocket client

```typescript
// src/taskpane/lib/ws.ts
import type { WSMessage } from "../types";

export function connect(url: string, onMessage: (m: WSMessage) => void): WebSocket {
  const ws = new WebSocket(url);

  ws.onopen = () => console.log("WS connected:", url);
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch (err) {
      console.error("bad message", e.data, err);
    }
  };
  ws.onerror = (e) => console.error("WS error", e);
  ws.onclose = () => {
    console.log("WS closed, reconnecting in 2s");
    setTimeout(() => connect(url, onMessage), 2000);
  };

  return ws;
}
```

### 8.3 Wire it into App.tsx

Replace the default `App.tsx` body with:

```typescript
import { useEffect, useState } from "react";
import { connect } from "../lib/ws";
import type { Proposal, WSMessage } from "../types";

const BACKEND_WSS = "ws://localhost:8000";

export default function App() {
  const [proposals, setProposals] = useState<Proposal[]>([]);

  useEffect(() => {
    const ws = connect(BACKEND_WSS, (m: WSMessage) => {
      if (m.type === "proposal") {
        setProposals(p => [...p, m]);
      }
    });
    return () => ws.close();
  }, []);

  return (
    <div style={{ padding: "12px", fontFamily: "system-ui", fontSize: "14px" }}>
      <h2>Redliner</h2>
      <p style={{ color: "#666" }}>{proposals.length} proposal(s)</p>
      {proposals.map(p => (
        <div key={p.id} style={{
          border: "1px solid #ddd",
          padding: "10px",
          marginBottom: "10px",
          borderRadius: "6px"
        }}>
          <div style={{ fontSize: "12px", color: "#666" }}>
            {p.clause_type.toUpperCase()} · {p.severity}
          </div>
          <p>{p.reasoning}</p>
          <div style={{ textDecoration: "line-through", color: "#a52a2a" }}>{p.original_text}</div>
          <div style={{ color: "#1d8348" }}>{p.proposed_text}</div>
          <button onClick={() => alert("accept clicked")}>Accept</button>
          <button onClick={() => alert("reject clicked")}>Reject</button>
        </div>
      ))}
    </div>
  );
}
```

### Verification

- [ ] Stub backend running; logs `client connected` when add-in loads.
- [ ] Task pane shows a proposal card within ~1 second of opening Word.
- [ ] Clicking Accept/Reject pops the alert.

---

## 9. Phase 3 — Naive redline mechanic

**Goal:** Click Accept → tracked change appears in the Word document.

### 9.1 The function

```typescript
// src/taskpane/lib/redline.ts
import type { Proposal } from "../types";

export async function applyNaiveRedline(proposal: Proposal): Promise<void> {
  await Word.run(async (context) => {
    context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;

    const search = context.document.body.search(proposal.original_text, { matchCase: false });
    search.load("items");
    await context.sync();

    if (search.items.length === 0) {
      console.error("Clause not found in document");
      return;
    }

    search.items[0].insertText(proposal.proposed_text, Word.InsertLocation.replace);
    await context.sync();
  });
}
```

### 9.2 Wire it to the Accept button

Replace the placeholder `onClick`:

```typescript
import { applyNaiveRedline } from "../lib/redline";

// inside the proposal card:
<button onClick={() => applyNaiveRedline(p)}>Accept</button>
```

### 9.3 Verification path

1. In Word, paste this sentence into the doc:
   `In no event shall total liability exceed $100.`
2. Reload the add-in (`Ctrl/Cmd + Shift + I` to open dev tools, then refresh).
3. The proposal card appears.
4. Click **Accept**.
5. Word shows a tracked change: `$100` struck through, replacement text inserted, attributed to your account.

### Quick sanity check via Script Lab

If you want to verify the mechanic works on your machine *before* writing add-in code, install **Script Lab** from the Word add-in store and run:

```typescript
async function run() {
  await Word.run(async (context) => {
    context.document.body.clear();
    context.document.body.insertParagraph(
      "In no event shall total liability exceed $100.",
      "End"
    );
    context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
    await context.sync();

    const found = context.document.body.search("$100");
    found.load("items");
    await context.sync();

    found.items[0].insertText("twelve (12) months of fees paid", "Replace");
    await context.sync();
  });
}
```

---

## 10. Phase 4 — Minimal-diff redline mechanic

**Goal:** Replace the "whole clause replaced" naive version with a word-level
redline. The result looks like a careful human redline.

### 10.1 Install the diff library

```bash
cd addin
npm install diff
npm install --save-dev @types/diff
```

### 10.2 The function

```typescript
// src/taskpane/lib/redline.ts
import { diffWords } from "diff";
import type { Proposal } from "../types";

export async function applyMinimalRedline(proposal: Proposal): Promise<void> {
  const parts = diffWords(proposal.original_text, proposal.proposed_text);

  await Word.run(async (context) => {
    context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;

    const search = context.document.body.search(proposal.original_text, { matchCase: false });
    search.load("items");
    await context.sync();
    if (search.items.length === 0) return;

    let cursor: Word.Range = search.items[0].getRange("Start");

    for (const part of parts) {
      if (part.added) {
        const inserted = cursor.insertText(part.value, Word.InsertLocation.after);
        cursor = inserted.getRange("End");
      } else if (part.removed) {
        const found = cursor.search(part.value, { matchCase: true });
        found.load("items");
        await context.sync();
        if (found.items.length > 0) {
          found.items[0].delete();
        }
      } else {
        const found = cursor.search(part.value, { matchCase: true });
        found.load("items");
        await context.sync();
        if (found.items.length > 0) {
          cursor = found.items[0].getRange("End");
        }
      }
    }

    await context.sync();
  });
}
```

### 10.3 Reject helper

```typescript
export async function rejectAIChanges(authorName = "Redliner AI") {
  await Word.run(async (context) => {
    const changes = context.document.body.getTrackedChanges();
    changes.load("items/author");
    await context.sync();
    changes.items
      .filter(c => c.author === authorName)
      .forEach(c => c.reject());
    await context.sync();
  });
}
```

### 10.4 Swap into the UI

Update App.tsx to import `applyMinimalRedline` instead of `applyNaiveRedline`.

### Reference

`sarturko-maker/vibe-legal-prototype` implements this exact pattern in
`src/services/handleAction.ts`. Read `handleAmendOperation` for production-quality
edge-case handling (preserving tracking state, search misses, etc.).

---

## 11. Phase 5 — Document extraction (making the AI aware)

**Goal:** Send the contract text to the backend on add-in load, so the AI knows
what's in the document.

### 11.1 Extraction helper

```typescript
// src/taskpane/lib/contract.ts
import type { ParagraphInfo } from "../types";

export async function extractContract(): Promise<ParagraphInfo[]> {
  return await Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("text,style");
    await context.sync();

    return paragraphs.items
      .map((p, i) => ({
        index: i,
        text: p.text,
        style: p.style,
      }))
      .filter(p => p.text.trim().length > 0);  // drop empty paragraphs
  });
}
```

### 11.2 Send on load

In `App.tsx`:

```typescript
import { extractContract } from "../lib/contract";

const BACKEND_HTTP = "http://localhost:8000";  // swap for backend's URL

export default function App() {
  const [contractId, setContractId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);

  // Extract the contract once on load
  useEffect(() => {
    (async () => {
      const paragraphs = await extractContract();
      const res = await fetch(`${BACKEND_HTTP}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paragraphs }),
      });
      const { contract_id } = await res.json();
      setContractId(contract_id);
    })();
  }, []);

  // Subscribe to live updates once we have a contract_id
  useEffect(() => {
    if (!contractId) return;
    const ws = connect(`ws://localhost:8000/contracts/${contractId}/live`, (m) => {
      if (m.type === "proposal") setProposals(p => [...p, m]);
    });
    return () => ws.close();
  }, [contractId]);

  // ... render
}
```

### 11.3 What the backend does with this

- **Chunks** paragraphs into clauses (heading-based heuristic, or LLM-driven).
- **Classifies** each clause (Haiku, structured output → `{type, priority, confidence}`).
- For high-priority clauses, runs the **playbook** (Sonnet) with:
  - The clause text
  - The playbook system prompt (firm preferences, market positions)
  - Retrieved evidence (CUAD examples, ABA snippets)
- Returns proposals via WSS.

The frontend sends paragraphs; the backend's intelligence lives in the playbook
prompts and the RAG retrieval. The frontend doesn't need to know how that works.

### Verification

- [ ] On add-in load, network tab shows `POST /contracts` with paragraph JSON.
- [ ] Backend (or stub) returns a `contract_id`.
- [ ] WS subscription uses that contract_id in the URL.

---

## 12. Phase 6 — Tab UI (Coach / Standards / Redlines)

**Goal:** Three tabs in the task pane, with active-clause highlighting.

### 12.1 Install Fluent UI

Microsoft's React component library, matches Word's look.

```bash
npm install @fluentui/react-components @fluentui/react-icons
```

### 12.2 Top-level App with tabs

```typescript
// src/taskpane/components/App.tsx
import { useEffect, useState } from "react";
import { FluentProvider, webLightTheme, TabList, Tab } from "@fluentui/react-components";
import { connect } from "../lib/ws";
import { extractContract } from "../lib/contract";
import { CoachTab } from "./CoachTab";
import { StandardsTab } from "./StandardsTab";
import { RedlineTab } from "./RedlineTab";
import type { Proposal, Caption, StandardCitation, WSMessage } from "../types";

const BACKEND_HTTP = "http://localhost:8000";
const BACKEND_WSS  = "ws://localhost:8000";

export default function App() {
  const [tab, setTab] = useState<string>("redlines");
  const [contractId, setContractId] = useState<string | null>(null);

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [citations, setCitations] = useState<StandardCitation[]>([]);
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
  const [resolvedClauseIds, setResolvedClauseIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const paragraphs = await extractContract();
      const res = await fetch(`${BACKEND_HTTP}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paragraphs }),
      });
      const { contract_id } = await res.json();
      setContractId(contract_id);
    })();
  }, []);

  useEffect(() => {
    if (!contractId) return;
    const ws = connect(`${BACKEND_WSS}/contracts/${contractId}/live`, (m: WSMessage) => {
      switch (m.type) {
        case "proposal":          setProposals(p => [...p, m]); break;
        case "active_clause":     setActiveClauseId(m.clause_id); break;
        case "clause_resolved":   setResolvedClauseIds(s => new Set(s).add(m.clause_id)); break;
        case "caption":           setCaptions(c => [...c, m].slice(-50)); break;
        case "standard_citation": setCitations(c => [...c, m]); break;
      }
    });
    return () => ws.close();
  }, [contractId]);

  return (
    <FluentProvider theme={webLightTheme}>
      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as string)}>
        <Tab value="coach">Coach</Tab>
        <Tab value="standards">Standards</Tab>
        <Tab value="redlines">Redlines</Tab>
      </TabList>
      {tab === "coach" && <CoachTab captions={captions} />}
      {tab === "standards" && <StandardsTab citations={citations} />}
      {tab === "redlines" && (
        <RedlineTab
          proposals={proposals}
          activeClauseId={activeClauseId}
          resolvedClauseIds={resolvedClauseIds}
        />
      )}
    </FluentProvider>
  );
}
```

### 12.3 Proposal card

```typescript
// src/taskpane/components/ProposalCard.tsx
import { Card, Button, Body1, Caption1 } from "@fluentui/react-components";
import { applyMinimalRedline } from "../lib/redline";
import type { Proposal } from "../types";

interface Props {
  proposal: Proposal;
  isActive: boolean;
  isResolved: boolean;
}

export function ProposalCard({ proposal, isActive, isResolved }: Props) {
  const accept = async () => {
    await applyMinimalRedline(proposal);
    await fetch(`http://localhost:8000/redlines/${proposal.id}/accept`, { method: "POST" });
  };
  const reject = async () => {
    await fetch(`http://localhost:8000/redlines/${proposal.id}/reject`, { method: "POST" });
  };

  return (
    <Card style={{
      borderLeft: isActive ? "3px solid #0066cc" : undefined,
      opacity: isResolved ? 0.5 : 1,
      textDecoration: isResolved ? "line-through" : undefined,
      marginBottom: "8px",
    }}>
      <Caption1>{proposal.clause_type.toUpperCase()} · {proposal.severity}</Caption1>
      <Body1>{proposal.reasoning}</Body1>
      <div>
        <span style={{ textDecoration: "line-through", color: "#a52a2a" }}>{proposal.original_text}</span>
        <br />
        <span style={{ color: "#1d8348" }}>{proposal.proposed_text}</span>
      </div>
      <ul style={{ fontSize: "11px", color: "#6e6e73" }}>
        {proposal.market_evidence.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
      <div style={{ display: "flex", gap: "6px" }}>
        <Button appearance="primary" onClick={accept} disabled={isResolved}>Accept</Button>
        <Button onClick={reject} disabled={isResolved}>Reject</Button>
      </div>
    </Card>
  );
}
```

### 12.4 The other two tabs (placeholder content is fine for now)

```typescript
// CoachTab.tsx
export function CoachTab({ captions }) {
  return (
    <div style={{ padding: "8px" }}>
      {captions.length === 0 && <p style={{ color: "#666" }}>Waiting for live transcript…</p>}
      {captions.map((c, i) => (
        <div key={i} style={{ fontSize: "12px", marginBottom: "4px" }}>
          <strong>{c.speaker ?? "—"}:</strong> {c.text}
        </div>
      ))}
    </div>
  );
}

// StandardsTab.tsx
export function StandardsTab({ citations }) {
  return (
    <div style={{ padding: "8px" }}>
      {citations.length === 0 && <p style={{ color: "#666" }}>Standards will appear here as topics arise.</p>}
      {citations.map((c, i) => (
        <div key={i} style={{ marginBottom: "10px" }}>
          <strong>{c.title}</strong>
          <p style={{ fontSize: "12px" }}>{c.excerpt}</p>
          <a href={c.url} target="_blank" rel="noreferrer">Source</a>
        </div>
      ))}
    </div>
  );
}
```

---

## 13. Phase 7 — Live-mode integration

**Goal:** Swap the localhost stub for the real backend. Verify end-to-end with
captions flowing.

### 13.1 Update manifest AppDomains

```xml
<!-- addin/manifest.xml -->
<OfficeApp>
  ...
  <AppDomains>
    <AppDomain>https://teammate-backend.ngrok-free.app</AppDomain>
  </AppDomains>
  ...
</OfficeApp>
```

The ngrok URL changes every restart of the free tier. Update this whenever the
backend track restarts ngrok, or have them pay $10 for a static domain.

### 13.2 Switch BACKEND constants

```typescript
// In App.tsx (or extract to a config file)
const BACKEND_HTTP = "https://teammate-backend.ngrok-free.app";
const BACKEND_WSS  = "wss://teammate-backend.ngrok-free.app";
```

### 13.3 Dev-mode toggle (recommended)

Add a query-string switch so you can flip between stub and real backend without
recompiling:

```typescript
const params = new URLSearchParams(window.location.search);
const useStub = params.get("stub") === "1";
const BACKEND_HTTP = useStub ? "http://localhost:8000" : "https://...";
const BACKEND_WSS  = useStub ? "ws://localhost:8000"   : "wss://...";
```

Then `npm start` opens `https://localhost:3000/taskpane.html` — append `?stub=1` to
the URL in the manifest's SourceLocation when you want to demo against the stub.

### Verification

- [ ] Real backend's ngrok URL responds to `POST /contracts` with a `contract_id`.
- [ ] WS subscription opens; first proposal arrives within ~10 seconds.
- [ ] Pasting a transcript snippet on the backend (or in the caption client) triggers an `active_clause` highlight in the task pane.

---

## 14. Phase 8 — Polish & demo

**Goal:** A reliable 4-minute demo run.

### 14.1 Polish checklist

- [ ] Empty states for all three tabs.
- [ ] Loading state while waiting for the first proposal.
- [ ] Connection status indicator (green/red dot in the header).
- [ ] Error toast if the WS reconnect fails > 3 times.
- [ ] Buttons disabled while a redline is being applied (avoid double-click).
- [ ] Card animations / fade-in on new proposals (Framer Motion or simple CSS transitions).

### 14.2 Demo backup

Always keep the stub backend ready. The dev-mode toggle from 13.3 lets you flip
to it in 2 seconds if the real backend dies during the demo.

---

## 15. Hour-by-hour build order

| Hour | Phase | Deliverable | Verification |
|---|---|---|---|
| 0–1 | 1 | Yo Office scaffold; agree wire protocol with backend track | `npm start` opens Word with sample task pane |
| 1–2 | 2 | Stub backend emits hardcoded proposals | Console logs show task pane receiving messages |
| 2–3 | 2 | Task pane renders proposal card with Accept/Reject | Card appears in the Redlines tab |
| 3–5 | 3 | Naive redline applier wired to Accept | Click Accept → tracked change appears in document |
| 5–7 | 4 | Minimal-diff redline applier (replace naive) | Word-level redlines look human-quality |
| 7–8 | 6 | Tab UI: Coach + Standards + Redlines tabs | Tabs switchable; active-clause border |
| 8–9 | 5 | Document extraction + POST /contracts on load | Network tab shows POST with paragraph JSON |
| 9–10 | 7 | Integration with real backend; manifest AppDomain updated | Full demo flow runs against real backend |
| 10–11 | 8 | Polish: card styling, empty states, error toast on WS disconnect | Demo run feels solid |
| 11–12 | 8 | Demo rehearsal end-to-end | Three full dry-runs without breakage |

### Drop list if behind schedule

- Hour 7+: drop Coach and Standards tabs to placeholder text.
- Hour 9+: ship with the stub backend if real backend integration breaks.
- **Never skip the rehearsal.**

---

## 16. Gotchas reference card

| # | Gotcha | Fix |
|---|---|---|
| 1 | Naive replace marks the entire clause as deleted/inserted | Use `diffWords` from the `diff` npm package and apply word-by-word (Phase 4) |
| 2 | WebSocket from task pane fails with "Security error" | Must be `wss://`, not `ws://`, except for `localhost` during dev |
| 3 | Cross-origin call from add-in to backend blocked | Add the backend domain to `<AppDomains>` in `manifest.xml`. Backend needs CORS headers. |
| 4 | Microsoft 365 Personal subscription doesn't allow sideload | Use commercial tenant (Business / EDU / 30-day trial) |
| 5 | ngrok free-tier URL changes every restart | Update `manifest.xml` on every restart, or pay for static domain |
| 6 | `npm start` fails to release port 3000 | Run `npm run stop` before re-running `npm start` |
| 7 | Add-in's task pane doesn't appear in Word | Manually activate via Home → Add-ins → My Add-ins → Redliner |
| 8 | `body.search()` returns no items but text is clearly there | Word treats line breaks differently. Search shorter anchor strings (5–10 words). |
| 9 | Object reference invalid across `Word.run` blocks | Wrap operations in a single `Word.run`, or `context.trackedObjects.add(obj)` |
| 10 | Forgot to `load()` a property; it's `undefined` after sync | Always `obj.load("propName")` before reading. `"items/author"` for collections. |
| 11 | Yo Office hangs at "installing dependencies" | Ctrl-C, `cd` into the project folder, run `npm install` manually |
| 12 | Manifest `AppDomain` accepts a single URL, not wildcards | List every backend domain explicitly in separate `<AppDomain>` elements |
| 13 | Track-changes accept/reject doesn't persist | Make sure `await context.sync()` runs after `c.accept()` or `c.reject()` |

---

## 17. Reference implementations

- **[sarturko-maker/vibe-legal-prototype](https://github.com/sarturko-maker/vibe-legal-prototype)** — closest open-source analogue. Read `src/services/handleAction.ts` (`handleAmendOperation`). AI redlines with native track changes + deterministic word-level diff. The architectural comment at the top is a free spec.
- **[AnsonLai/Gemini-AI-for-Office-Microsoft-Word-Add-In-for-Vibe-Drafting](https://github.com/AnsonLai/Gemini-AI-for-Office-Microsoft-Word-Add-In-for-Vibe-Drafting)** — production-quality Word add-in with redlines. `src/taskpane/modules/docx-redline-js-integration/` has helpers like `withNativeTrackingDisabled` and OOXML-level operations.
- **[yuch85/office-word-diff](https://github.com/yuch85/office-word-diff)** — multiple diff strategies: token-level, sentence-level, block-level.
- **Microsoft's track-changes sample** in [office-js-snippets / manage-change-tracking.yaml](https://raw.githubusercontent.com/OfficeDev/office-js-snippets/prod/samples/word/50-document/manage-change-tracking.yaml).
- **[Script Lab](https://appsource.microsoft.com/en-us/product/office/wa104380862)** — free Word add-in by Microsoft for testing Office.js snippets without project setup.

---

## 18. Demo strategy

### What the frontend specifically owns in the demo

- The visual moment: Word redline appearing on Accept click. This is the "Spellbook moment."
- The polish: task pane that doesn't look like a developer placeholder. Use Fluent UI.
- The reliability: stub-backend fallback if the real backend has issues during the demo.

### Demo script (4 minutes)

| Time | Action |
|---|---|
| 0:00–0:30 | Word open with demo MSA loaded; task pane visible. Frame the problem. |
| 0:30–1:30 | Backend pushes proposals — three cards appear (LoL, Indemnity, R&W). Click into LoL to show reasoning + market evidence. |
| 1:30–2:00 | Click **Accept** on LoL. Word redline appears. Show the Review pane. |
| 2:00–3:00 | Live mode: caption client posts "we want unlimited liability for IP infringement". `active_clause` highlights LoL card. New proposal arrives factoring in stated position. Accept. |
| 3:00–3:30 | Caption: "OK we're fine with the indemnity." `clause_resolved` flips that card. |
| 3:30–4:00 | Wrap with the moat. |

### Pre-demo checklist

- [ ] Demo contract loaded in Word, task pane open and connected.
- [ ] AppDomain in `manifest.xml` matches backend's current ngrok URL.
- [ ] WS connection green (status indicator visible in task pane).
- [ ] Stub backend running locally as fallback; toggle works.
- [ ] Wi-Fi tested in the demo room — phone hotspot as backup.
- [ ] Demo rehearsed end-to-end at least 3 times.
- [ ] Browser tabs closed, notifications off.
- [ ] Backup video of a successful run.

---

## 19. Open decisions for the team

Lock these on hour 1.

| # | Decision | Frontend lean | Notes |
|---|---|---|---|
| 1 | Paragraph schema for `POST /contracts` | `{index, text, style}` | Section 3.1 |
| 2 | Re-analyze on document edit? | No (frozen at ingest) | A "Re-analyze" button can re-POST the doc |
| 3 | How does the lawyer choose which contract is "live"? | One Word doc = one contract for the hackathon | Skip multi-doc support |
| 4 | Author name shown on tracked changes | "Redliner AI" hardcoded for the demo | Let the backend customize later |
| 5 | Caption source(s) for live mode | Google Meet only for hackathon | Zoom and Teams later |
| 6 | Static ngrok domain or rotating? | Static if backend track will pay $10 | Simplifies AppDomain management |

---

*End of plan. This branch is the redliner / frontend track. The backend, LLM, and
caption capture live on a separate track and coordinate via the wire protocol in
section 3.*
