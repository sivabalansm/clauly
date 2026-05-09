# Redliner Module — Verification Plan

How to test the `src/lib/` module in Word and confirm it works robustly.

> The TypeScript compiler has already validated every Office.js API call in
> `src/lib/*.ts` against `@types/office-js`. What remains is **runtime verification**
> in Word itself — track-changes rendering, search behavior on real documents,
> Web vs Desktop differences.

---

## 1. Drop the module into your Yo Office project

Once you've run `yo office` in `addin/` (per `IMPLEMENTATION_PLAN.md` Phase 1),
copy the module files in:

```bash
# from clauly/ repo root
mkdir -p addin/src/taskpane/lib
cp src/lib/*.ts addin/src/taskpane/lib/
cp src/components/DevHarness.tsx addin/src/taskpane/components/

# install the diff dependency in your add-in project
cd addin && npm install diff && npm install --save-dev @types/diff
```

Then make `App.tsx` render the dev harness while you're testing:

```tsx
// addin/src/taskpane/components/App.tsx — replace contents during dev
import DevHarness from "./DevHarness";
export default function App() {
  return <DevHarness />;
}
```

Run the add-in:

```bash
cd addin
npm start
```

Word desktop opens with the dev harness in the task pane. You're now ready to test.

---

## 2. Test cases

For every test below, the **PASS criterion is an observable Word state** — not just a
log message. The dev harness logs structured JSON so you can see what was returned,
but you must also visually confirm the document looks right.

### TEST 1 — Setup

**Steps:**
1. Click **1. Load sample contract**
2. Confirm the document now contains 7 paragraphs (a tiny MSA fragment with LoL,
   indemnity, governing law clauses).

**Pass:** Output log shows `{ paragraphs_inserted: 7 }` and the doc is populated.

---

### TEST 2 — Read functions

**Steps:**
1. Click **getDocumentContext()**
2. Inspect the JSON: should contain `full_text`, `paragraphs[]`, `current_selection`, `tracked_changes[]`.
3. Click **getParagraphs()** — should return 7 entries with `text` and `style` properties.
4. Select some text in the Word document with your mouse.
5. Click **getCurrentSelection()** — should return the selected text as a string.
6. Click **getActiveClauseText("Limitation of Liability")** — should return the heading text.

**Pass:** All four read functions return non-empty, well-shaped data.

---

### TEST 3 — Apply minimal-diff redline (the demo moment)

**Steps:**
1. Document is still loaded with the sample contract.
2. Click **applyRedline · LoL clause**.
3. Look at the document.

**Pass:**
- `$100` is shown with red strikethrough (tracked deletion).
- `twelve (12) months of fees paid hereunder` is shown in red with underline (tracked insertion).
- The unchanged words around them ("In no event shall total liability exceed", ".") stay as normal black text.
- The Review pane (View → Show Markup) shows the changes attributed to your account.

**This is the Spellbook-style visual** — only changed words marked, unchanged
text untouched.

**Fail signs:**
- Whole clause appears struck through → `applyRedline` fell back to `applyNaiveRedline`. Check the warnings field in the log.
- Nothing visible → check that **Track Changes** is enabled in the Word ribbon (Review → Track Changes). The function turns it on programmatically; if you see no result, the document or Word version may be ignoring the API call.

---

### TEST 4 — Apply naive redline (the fallback)

**Steps:**
1. Click **rejectAllTrackedChanges** to clean up TEST 3.
2. Click **applyNaiveRedline · LoL clause**.

**Pass:**
- The **entire** original clause is struck through.
- The **entire** new clause is shown as inserted.
- This is the "ugly but always works" path; visually noisier than minimal-diff.

**Why both exist:** `applyRedline` automatically falls back to naive replace
when the changed-portion search fails. `applyNaiveRedline` is also exposed
explicitly for fallback or for cases where the LLM rewrites a whole clause.

---

### TEST 5 — Smart-quote normalization

**Steps:**
1. **Clear document &amp; reset tracking mode**, then **Load sample contract** again.
2. Click **applyRedline · smart quotes**.

The proposal's `original_text` uses smart double quotes (`"`) which match the document.
The `proposed_text` adds a smart apostrophe in `Vendor's`. The function should still find
the original via Word's search and apply the redline.

**Pass:**
- Indemnity clause is updated.
- The change includes proper apostrophe handling.
- Output log shows `ok: true`.

---

### TEST 6 — Short-anchor edge case

**Steps:**
1. Document still loaded.
2. Click **applyRedline · "exceed $100"** (short anchor).

The `original_text` here is just `"exceed $100"` — a short fragment that *appears
inside* the LoL clause. The function should still find and redline it.

**Pass:**
- `$100` is replaced with `$1,000,000` as a tracked change.
- Surrounding text stays intact.

**Note:** if `textToFind` ends up under 3 characters after diff extraction, the
function falls back to naive whole-clause replace and emits a warning. This is
intentional — short search strings are unreliable in Office.js.

---

### TEST 7 — Missing-clause graceful failure

**Steps:**
1. Click **applyRedline · missing clause**.

The proposal's `original_text` is text that doesn't exist in the document.

**Pass:**
- The function does NOT crash.
- Output log shows `{ ok: false, applied_changes: 0, error: "Clause not found in document" }`.
- The document is unchanged.

This is critical for production: when the LLM hallucinates text that's not in
the doc, the failure must be clean.

---

### TEST 8 — Tracked-change introspection

**Steps:**
1. Apply a few redlines (TEST 3 and TEST 5).
2. Click **listTrackedChanges()**.

**Pass:**
- Output log returns an array of objects, each with `author`, `date`, `type`, `text`.
- Count matches the number of operations applied (each minimal-diff applies 1 tracked
  change pair).

**Known issue (Word for Mac):** [office-js issue #5188](https://github.com/OfficeDev/office-js/issues/5188)
— `text` may come back empty for `Deletion` type on Word Desktop for Mac. This is a
Microsoft bug, not ours. Workaround: cross-reference with `getReviewedText`. Document
this if it bites you in the demo.

---

### TEST 9 — Accept / reject programmatically

**Steps:**
1. Apply a redline.
2. Click **rejectAIChanges("Redliner AI")**.

The author of the changes will be your Word account name (e.g., your sign-in name),
NOT "Redliner AI". So this test will return 0.

3. Click **rejectAllTrackedChanges()** instead.

**Pass:**
- All tracked changes are rejected; the document reverts to original text.
- Output log shows the count of rejected changes.

**To make `rejectAIChanges` useful**, your teammate's backend should set a custom
author name when applying redlines. There's a separate Office.js call for that
(`Application.options.userName`) — out of scope for this module but easy to add.

---

### TEST 10 — Full automated sweep

**Steps:**
1. Click **Run full test suite (auto)**.

This runs TEST 1, 3, 5, 7, 8, plus reject — in sequence — and reports
`pass_count` / `fail_count`.

**Pass:** Output log shows `{ summary: "ALL PASS", pass_count: 6, fail_count: 0 }`.

If any sub-test fails, expand its `details` field in the JSON output to see
why. The most common cause of failure is the Word document not being in the
expected starting state — click **Clear document** first, then re-run.

---

## 3. Cross-platform verification

Office.js behaves differently between **Word Online** and **Word Desktop**.
Both must work for the demo to be safe.

| Platform | How to test | What to watch for |
|---|---|---|
| Word Desktop (Mac) | `npm start` opens here automatically | Whitespace at run boundaries ([issue #6544](https://github.com/OfficeDev/office-js/issues/6544)); empty `TrackedChange.text` on Deletion ([issue #5188](https://github.com/OfficeDev/office-js/issues/5188)) |
| Word Online | `npm run start:web -- --document <onedrive-url>` | Deleted text included in `paragraph.text` ([issue #1267](https://github.com/OfficeDev/office-js/issues/1267)) — affects subsequent searches |

Run TEST 3 (the headline minimal-diff test) on **both** platforms before declaring
done. Note any divergence in your demo notes.

---

## 4. Known limitations

These are Office.js-level limits, not module bugs:

1. **Multi-paragraph clauses** — Word's `body.search()` does not span paragraph
   breaks. If a proposal's `original_text` contains `\n`, the search will miss
   and we'll fall back to whole-clause replace. Workaround: have the backend
   send single-paragraph proposals, or use first-sentence anchoring (already
   built in via `findClauseRange`).

2. **Multi-block diffs** — if a proposal contains TWO non-contiguous edits in
   the same clause (e.g., change `$100` AND change `1 year` in the same
   paragraph), the function emits ONE search-and-replace covering the entire
   span. The unchanged middle text gets re-marked. This is per
   [office-js issue #6324](https://github.com/OfficeDev/office-js/issues/6324)
   — Microsoft has acknowledged this is an Office.js platform limitation.
   Workaround: have the backend split such proposals into two separate
   `Proposal` objects.

3. **Search ambiguity** — if `original_text` appears multiple times in the
   document (e.g., a generic phrase repeated in different clauses), the
   function operates on the first match. Workaround: backend should send
   distinctive anchor text, including unique surrounding context.

4. **Search string length cap** — Word's search throws on strings longer than
   ~255 characters. For long clauses, `findClauseRange` falls back to
   first-sentence anchoring.

5. **Custom author name** — currently uses the Word user's name. To attribute
   changes to "Redliner AI" specifically, teammate's code can set
   `Office.context.host` user name before calling `applyRedline`. Optional polish.

---

## 5. Pass criteria for "robust"

The module is "robust enough for the hackathon demo" when:

- [x] `npx tsc --noEmit` passes (✅ already passing)
- [ ] TEST 1 through TEST 10 all pass on Word Desktop (Mac)
- [ ] TEST 3 (headline minimal-diff) passes on Word Online
- [ ] TEST 7 (missing clause) returns clean error, no crash
- [ ] No tracked-change leakage between tests (each starts clean after reject)

You only need to manually run TEST 10 (full suite) and one platform-bridging
TEST 3 to clear the bar. The rest are diagnostic for when something goes wrong.

---

## 6. If a test fails — debugging path

1. **Open Word's task-pane dev tools**: right-click inside the task pane → Inspect.
2. Look at the **Console** tab. The harness logs structured errors there as well.
3. Check **Network** tab if your teammate's backend is involved (not relevant for
   the unit tests above).
4. For Office.js-specific issues, check the [office-js GitHub issues](https://github.com/OfficeDev/office-js/issues).
5. As a last resort, reproduce the failure in [Script Lab](https://appsource.microsoft.com/en-us/product/office/wa104380862) — runs Office.js snippets directly inside Word without project setup, isolates whether the issue is in your code or the platform.

---

*If everything passes, the module is wire-ready for your teammate to consume.
The next integration step is documented in `IMPLEMENTATION_PLAN.md` Phases 6–8.*
