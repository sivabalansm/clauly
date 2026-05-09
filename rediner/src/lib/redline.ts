import type {
  Proposal,
  RedlineResult,
  TrackedChangeInfo,
} from "./types";
import { findChangedPortion, normalizeForSearch } from "./diff";

export async function applyRedline(
  proposal: Proposal
): Promise<RedlineResult> {
  const portion = findChangedPortion(
    proposal.original_text,
    proposal.proposed_text
  );

  if (!portion) {
    return {
      ok: true,
      applied_changes: 0,
      warnings: ["Original and proposed text are identical"],
    };
  }

  const warnings: string[] = [];

  try {
    return await Word.run(async (context) => {
      context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;

      const clauseRange = await findClauseRange(
        context,
        proposal.original_text
      );
      if (!clauseRange) {
        return {
          ok: false,
          applied_changes: 0,
          error: "Clause not found in document",
        };
      }

      if (portion.textToFind.length < 3) {
        warnings.push(
          "Changed portion is very short; falling back to whole-clause replace for reliability"
        );
        clauseRange.insertText(
          proposal.proposed_text,
          Word.InsertLocation.replace
        );
        await context.sync();
        return { ok: true, applied_changes: 1, warnings };
      }

      const innerSearch = clauseRange.search(portion.textToFind, {
        matchCase: false,
      });
      innerSearch.load("items");
      await context.sync();

      if (innerSearch.items.length === 0) {
        warnings.push(
          `Could not find minimal portion "${truncate(portion.textToFind)}" within clause; falling back to whole-clause replace`
        );
        clauseRange.insertText(
          proposal.proposed_text,
          Word.InsertLocation.replace
        );
        await context.sync();
        return { ok: true, applied_changes: 1, warnings };
      }

      innerSearch.items[0].insertText(
        portion.replacementText,
        Word.InsertLocation.replace
      );
      await context.sync();

      return {
        ok: true,
        applied_changes: 1,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    });
  } catch (err) {
    return {
      ok: false,
      applied_changes: 0,
      error: errorMessage(err),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

export async function applyNaiveRedline(
  proposal: Proposal
): Promise<RedlineResult> {
  try {
    return await Word.run(async (context) => {
      context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;

      const range = await findClauseRange(context, proposal.original_text);
      if (!range) {
        return {
          ok: false,
          applied_changes: 0,
          error: "Clause not found in document",
        };
      }

      range.insertText(proposal.proposed_text, Word.InsertLocation.replace);
      await context.sync();

      return { ok: true, applied_changes: 1 };
    });
  } catch (err) {
    return { ok: false, applied_changes: 0, error: errorMessage(err) };
  }
}

export async function rejectAllTrackedChanges(): Promise<number> {
  return await Word.run(async (context) => {
    const changes = context.document.body.getTrackedChanges();
    changes.load("items");
    await context.sync();
    const count = changes.items.length;
    changes.items.forEach((c) => c.reject());
    await context.sync();
    return count;
  });
}

export async function rejectAIChanges(authorName: string): Promise<number> {
  return await Word.run(async (context) => {
    const changes = context.document.body.getTrackedChanges();
    changes.load("items/author");
    await context.sync();

    const toReject = changes.items.filter((c) => c.author === authorName);
    toReject.forEach((c) => c.reject());
    await context.sync();
    return toReject.length;
  });
}

export async function acceptAIChanges(authorName: string): Promise<number> {
  return await Word.run(async (context) => {
    const changes = context.document.body.getTrackedChanges();
    changes.load("items/author");
    await context.sync();

    const toAccept = changes.items.filter((c) => c.author === authorName);
    toAccept.forEach((c) => c.accept());
    await context.sync();
    return toAccept.length;
  });
}

export async function listTrackedChanges(): Promise<TrackedChangeInfo[]> {
  return await Word.run(async (context) => {
    const changes = context.document.body.getTrackedChanges();
    changes.load("items/author,items/date,items/type,items/text");
    await context.sync();

    return changes.items.map((c): TrackedChangeInfo => {
      const rawType = c.type as string;
      const type: TrackedChangeInfo["type"] =
        rawType === "Insertion" ||
        rawType === "Deletion" ||
        rawType === "Formatting"
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
    });
  });
}

async function findClauseRange(
  context: Word.RequestContext,
  searchText: string
): Promise<Word.Range | null> {
  const direct = context.document.body.search(searchText, { matchCase: false });
  direct.load("items");
  await context.sync();
  if (direct.items.length > 0) {
    return direct.items[0];
  }

  const normalized = normalizeForSearch(searchText);
  if (normalized !== searchText) {
    const fallback = context.document.body.search(normalized, {
      matchCase: false,
    });
    fallback.load("items");
    await context.sync();
    if (fallback.items.length > 0) {
      return fallback.items[0];
    }
  }

  const firstSentence = searchText.split(/(?<=[.!?])\s+/)[0];
  if (
    firstSentence &&
    firstSentence.length > 10 &&
    firstSentence.length < searchText.length
  ) {
    const anchor = context.document.body.search(firstSentence, {
      matchCase: false,
    });
    anchor.load("items");
    await context.sync();
    if (anchor.items.length > 0) {
      return anchor.items[0];
    }
  }

  return null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function truncate(s: string, max = 40): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
