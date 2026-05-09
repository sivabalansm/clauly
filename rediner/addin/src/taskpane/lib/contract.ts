import type {
  DocumentContext,
  ParagraphInfo,
  TrackedChangeInfo,
} from "./types";

/**
 * Snapshot the entire document state for an LLM prompt.
 *
 * Returns paragraphs with text + style, the current selection (if any), and the
 * full set of tracked changes. The returned object is JSON-safe — pass it
 * straight into a fetch body or include it in a prompt.
 *
 * Errors are caught at the call site by `Word.run` rejecting; callers should
 * wrap in try/catch if they care about distinguishing failures.
 */
export async function getDocumentContext(): Promise<DocumentContext> {
  return await Word.run(async (context) => {
    const body = context.document.body;
    body.load("text");

    const paragraphs = body.paragraphs;
    paragraphs.load("text,style");

    const selection = context.document.getSelection();
    selection.load("text");

    const trackedChanges = body.getTrackedChanges();
    trackedChanges.load("items/author,items/date,items/type,items/text");

    await context.sync();

    return {
      full_text: body.text,
      paragraphs: paragraphs.items
        .map((p, i): ParagraphInfo => ({
          index: i,
          text: p.text,
          style: p.style,
        }))
        .filter((p) => p.text.trim().length > 0),
      current_selection: selection.text || null,
      tracked_changes: trackedChanges.items.map(toTrackedChangeInfo),
    };
  });
}

/** Just the paragraphs. Cheaper than `getDocumentContext` if you don't need the rest. */
export async function getParagraphs(): Promise<ParagraphInfo[]> {
  return await Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("text,style");
    await context.sync();

    return paragraphs.items
      .map((p, i): ParagraphInfo => ({
        index: i,
        text: p.text,
        style: p.style,
      }))
      .filter((p) => p.text.trim().length > 0);
  });
}

/** Returns the user's current text selection, or null if there's no selection. */
export async function getCurrentSelection(): Promise<string | null> {
  return await Word.run(async (context) => {
    const sel = context.document.getSelection();
    sel.load("text");
    await context.sync();
    return sel.text || null;
  });
}

/**
 * Find the text of a clause given a search anchor string.
 *
 * Useful when the LLM has a clause_id but the UI needs the actual current text
 * (e.g., to display alongside a proposal card).
 */
export async function getActiveClauseText(
  searchString: string
): Promise<string | null> {
  return await Word.run(async (context) => {
    const search = context.document.body.search(searchString, {
      matchCase: false,
    });
    search.load("items/text");
    await context.sync();
    return search.items.length > 0 ? search.items[0].text : null;
  });
}

function toTrackedChangeInfo(c: Word.TrackedChange): TrackedChangeInfo {
  const rawType = c.type as string;
  const type: TrackedChangeInfo["type"] =
    rawType === "Insertion" || rawType === "Deletion" || rawType === "Formatting"
      ? rawType
      : "Other";

  let dateStr: string;
  const rawDate = c.date as unknown;
  if (rawDate instanceof Date) {
    dateStr = rawDate.toISOString();
  } else if (typeof rawDate === "string") {
    dateStr = rawDate;
  } else {
    dateStr = String(rawDate);
  }

  return {
    author: c.author,
    date: dateStr,
    type,
    text: c.text,
  };
}
