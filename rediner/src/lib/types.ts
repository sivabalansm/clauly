/**
 * Shared types for the Redliner module.
 *
 * Both halves of the project import from this file. If you change a type here,
 * coordinate with your teammate before pushing. The shapes here are the wire
 * contract between the LLM/UI side and the Word/Office.js side.
 */

export type ClauseType = "lol" | "indemnity" | "rw" | "ip" | "other";
export type Severity = "aggressive" | "market" | "soft";

export interface ParagraphInfo {
  index: number;
  text: string;
  style: string;
}

export interface TrackedChangeInfo {
  author: string;
  date: string;
  type: "Insertion" | "Deletion" | "Formatting" | "Other";
  text: string;
}

export interface DocumentContext {
  full_text: string;
  paragraphs: ParagraphInfo[];
  current_selection: string | null;
  tracked_changes: TrackedChangeInfo[];
}

export interface Proposal {
  id: string;
  clause_id: string;
  clause_type: ClauseType;
  original_text: string;
  proposed_text: string;
  reasoning: string;
  severity: Severity;
  market_evidence: string[];
}

export interface RedlineResult {
  ok: boolean;
  applied_changes: number;
  error?: string;
  warnings?: string[];
}
