import { diffWords, Change } from "diff";

export function normalizeForSearch(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function minimalDiff(original: string, proposed: string): Change[] {
  return diffWords(original, proposed);
}

export interface ChangedPortion {
  textToFind: string;
  replacementText: string;
  unchangedPrefix: string;
  unchangedSuffix: string;
}

export function findChangedPortion(
  oldText: string,
  newText: string
): ChangedPortion | null {
  if (oldText === newText) return null;

  const parts = diffWords(oldText, newText);

  let firstChangeIdx = -1;
  let lastChangeIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].added || parts[i].removed) {
      if (firstChangeIdx === -1) firstChangeIdx = i;
      lastChangeIdx = i;
    }
  }

  if (firstChangeIdx === -1) return null;

  let unchangedPrefix = "";
  for (let i = 0; i < firstChangeIdx; i++) {
    unchangedPrefix += parts[i].value;
  }

  let unchangedSuffix = "";
  for (let i = lastChangeIdx + 1; i < parts.length; i++) {
    unchangedSuffix += parts[i].value;
  }

  let textToFind = "";
  let replacementText = "";
  for (let i = firstChangeIdx; i <= lastChangeIdx; i++) {
    const p = parts[i];
    if (p.removed) {
      textToFind += p.value;
    } else if (p.added) {
      replacementText += p.value;
    } else {
      textToFind += p.value;
      replacementText += p.value;
    }
  }

  return {
    textToFind: textToFind.trim(),
    replacementText: replacementText.trim(),
    unchangedPrefix,
    unchangedSuffix,
  };
}
