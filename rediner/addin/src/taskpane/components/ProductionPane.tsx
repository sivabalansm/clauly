import * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Badge,
  Caption1,
  Body1,
  Title3,
  Divider,
  makeStyles,
  tokens,
  Spinner,
  Tooltip,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  CheckmarkRegular,
  DismissRegular,
  EditRegular,
  ArrowDownRegular,
  ArrowRightRegular,
  CircleFilled,
  DocumentArrowDownRegular,
  HistoryRegular,
  CheckmarkCircleFilled,
} from "@fluentui/react-icons";
import {
  applyRedline,
  rejectAIChanges,
  rejectAllTrackedChanges,
} from "../lib/redline";
import type { Proposal, Severity, ClauseType } from "../lib/types";

const SAMPLE_CONTRACT_TEXT = [
  "MASTER SERVICES AGREEMENT",
  "1. Limitation of Liability",
  "In no event shall total liability exceed $100.",
  "2. Indemnification",
  'The Vendor shall indemnify the Customer for "any" third-party claim.',
  "3. Governing Law",
  "This Agreement shall be governed by the laws of Delaware.",
  "4. Notices",
  "All notices shall be in writing.",
  "5. Severability",
  "If any provision is invalid, the remainder shall remain in force.",
];

const SAMPLE_PROPOSALS: Proposal[] = [
  {
    id: "prop_lol",
    clause_id: "clause_5",
    clause_type: "lol",
    original_text: "In no event shall total liability exceed $100.",
    proposed_text:
      "In no event shall the aggregate liability of either party exceed twelve (12) months of fees paid hereunder.",
    reasoning:
      "Counterparty proposed an arbitrary $100 cap, which is unenforceable in commercial software contracts. Market standard is 12 months of fees. We've added the mutual element to neutralize one-sidedness.",
    severity: "aggressive",
    market_evidence: [
      "CUAD: 73% of SaaS MSAs use 12-month fee cap",
      "ABA Section of Business Law - Commercial Transactions",
      "Internal precedent: Acme MSA §8.2 (2024)",
    ],
  },
  {
    id: "prop_indem",
    clause_id: "clause_6",
    clause_type: "indemnity",
    original_text:
      'The Vendor shall indemnify the Customer for "any" third-party claim.',
    proposed_text:
      "The Vendor shall indemnify the Customer for third-party claims arising solely from Vendor's gross negligence or willful misconduct.",
    reasoning:
      "Original scope is unlimited. Tightening to gross negligence + willful misconduct matches market practice for SaaS vendors.",
    severity: "market",
    market_evidence: [
      "CUAD: 68% of vendor-side indemnities scoped to gross negligence",
      "ABA Model Indemnity Clause §3.1",
    ],
  },
  {
    id: "prop_rw",
    clause_id: "clause_7",
    clause_type: "rw",
    original_text:
      "Vendor represents and warrants that the services will perform in all material respects.",
    proposed_text:
      "Vendor represents and warrants that for twelve (12) months following acceptance, the services will perform in all material respects in conformance with the Documentation.",
    reasoning:
      "Adds time-bound and reference to documentation, making the warranty actionable.",
    severity: "soft",
    market_evidence: ["CUAD: 12-month warranty period in 81% of SaaS deals"],
  },
];

const RESOLVED_AUTO = [
  { id: "auto_3", title: "§3 Governing Law", reason: "Standard Delaware law clause; no negotiation needed" },
  { id: "auto_4", title: "§4 Notices", reason: "Standard written notice requirement" },
  { id: "auto_5", title: "§5 Severability", reason: "Standard severability clause" },
];

interface HistoryEntry {
  id: string;
  ts: Date;
  type: "accept" | "reject" | "auto" | "load" | "active";
  label: string;
  detail?: string;
  proposalId?: string;
}

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
    fontFamily: tokens.fontFamilyBase,
    minHeight: "100vh",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: tokens.spacingVerticalS,
  },
  headerTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  statusDot: {
    fontSize: "10px",
  },
  metricsBar: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    paddingBottom: tokens.spacingVerticalXS,
  },
  metric: {
    display: "flex",
    alignItems: "baseline",
    gap: "4px",
  },
  metricNumber: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  activeBanner: {
    backgroundColor: tokens.colorBrandBackground2,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalS,
    fontSize: tokens.fontSizeBase200,
  },
  activeBannerHeader: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: tokens.colorBrandForeground1,
    marginBottom: "4px",
  },
  activeBannerCaption: {
    fontStyle: "italic",
    color: tokens.colorNeutralForeground2,
    marginTop: "4px",
  },
  hero: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeftWidth: "4px",
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    boxShadow: tokens.shadow4,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  heroAggressive: { borderLeftColor: "#c0392b" },
  heroMarket: { borderLeftColor: "#d39c2a" },
  heroSoft: { borderLeftColor: "#1d8348" },
  heroHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalS,
  },
  diffBlock: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusSmall,
    padding: tokens.spacingVerticalS,
    fontFamily: "Georgia, serif",
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400,
  },
  diffStrike: {
    textDecoration: "line-through",
    color: "#a52a2a",
    backgroundColor: "rgba(165, 42, 42, 0.08)",
    padding: "0 2px",
    borderRadius: "2px",
  },
  diffInsert: {
    color: "#0d6e3f",
    backgroundColor: "rgba(13, 110, 63, 0.08)",
    padding: "0 2px",
    borderRadius: "2px",
    fontWeight: tokens.fontWeightSemibold,
  },
  reasoning: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase300,
  },
  sectionToggle: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorBrandForeground1,
    cursor: "pointer",
    userSelect: "none",
    padding: "2px 0",
    border: "none",
    background: "transparent",
    fontWeight: tokens.fontWeightSemibold,
    width: "fit-content",
  },
  evidenceList: {
    margin: 0,
    paddingLeft: tokens.spacingHorizontalM,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  actionRow: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalXS,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: "#1d8348",
    color: "white",
    ":hover": { backgroundColor: "#196b3a" },
    ":active": { backgroundColor: "#196b3a" },
  },
  rejectButton: { flex: 1 },
  editButton: { minWidth: "auto", paddingLeft: tokens.spacingHorizontalS, paddingRight: tokens.spacingHorizontalS },
  sectionTitle: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: tokens.colorNeutralForeground3,
    paddingTop: tokens.spacingVerticalS,
  },
  queueItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: tokens.spacingVerticalXS,
    fontSize: tokens.fontSizeBase200,
    borderRadius: tokens.borderRadiusSmall,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  queueItemActive: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  queueLeft: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    flex: 1,
    minWidth: 0,
  },
  resolvedRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    padding: "2px 0",
  },
  historyEntry: {
    display: "flex",
    flexDirection: "column",
    padding: "4px 0",
    fontSize: tokens.fontSizeBase200,
    borderBottom: `1px dashed ${tokens.colorNeutralStroke3}`,
  },
  historyTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  historyLabel: {
    color: tokens.colorNeutralForeground1,
  },
  historyTime: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  emptyState: {
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    padding: tokens.spacingVerticalL,
  },
  loadDemoButton: {
    width: "100%",
    marginTop: tokens.spacingVerticalS,
  },
  devToolsLink: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    textAlign: "center",
    marginTop: tokens.spacingVerticalL,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    width: "100%",
  },
});

function diffToRender(
  original: string,
  proposed: string,
  styles: ReturnType<typeof useStyles>
): React.ReactNode {
  const origWords = original.split(/(\s+)/);
  const newWords = proposed.split(/(\s+)/);
  const origSet = new Set(origWords.map((w) => w.toLowerCase()));
  const newSet = new Set(newWords.map((w) => w.toLowerCase()));

  const removed = origWords.filter((w) => w.trim() && !newSet.has(w.toLowerCase()));
  const added = newWords.filter((w) => w.trim() && !origSet.has(w.toLowerCase()));

  return (
    <>
      <span className={styles.diffStrike}>{removed.join(" ")}</span>{" "}
      <span className={styles.diffInsert}>{added.join(" ")}</span>
    </>
  );
}

function severityBadge(s: Severity): React.ReactNode {
  const map: Record<Severity, { label: string; color: "danger" | "warning" | "success" }> = {
    aggressive: { label: "Aggressive", color: "danger" },
    market: { label: "Market", color: "warning" },
    soft: { label: "Soft", color: "success" },
  };
  const cfg = map[s];
  return (
    <Badge appearance="filled" color={cfg.color} size="small">
      {cfg.label}
    </Badge>
  );
}

function clauseTypeLabel(t: ClauseType): string {
  const map: Record<ClauseType, string> = {
    lol: "Limitation of Liability",
    indemnity: "Indemnity",
    rw: "Reps & Warranties",
    ip: "IP",
    other: "Other",
  };
  return map[t];
}

function severityHeroClass(severity: Severity, styles: ReturnType<typeof useStyles>): string {
  if (severity === "aggressive") return styles.heroAggressive;
  if (severity === "market") return styles.heroMarket;
  return styles.heroSoft;
}

function timeFmt(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderBridgeStatus(
  status: "connecting" | "live" | "offline",
  styles: ReturnType<typeof useStyles>
): React.ReactNode {
  const cfg = {
    connecting: { color: "#c08a00", label: "Connecting…" },
    live: { color: "#1d8348", label: "Live" },
    offline: { color: "#a02020", label: "Bridge offline" }
  }[status];
  return (
    <span className={styles.statusRow} title={`Clauly bridge https://127.0.0.1:8765 — ${cfg.label}`}>
      <CircleFilled className={styles.statusDot} style={{ color: cfg.color }} />
      {cfg.label}
    </span>
  );
}

interface ProductionPaneProps {
  onSwitchToDevTools?: () => void;
}

export default function ProductionPane({ onSwitchToDevTools }: ProductionPaneProps) {
  const styles = useStyles();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
  const [activeCaption, setActiveCaption] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [autoResolved] = useState(RESOLVED_AUTO);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasoningOpen, setReasoningOpen] = useState(true);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [showResolved, setShowResolved] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const seenProposalIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const overrideUrl =
      typeof window !== "undefined"
        ? (window as { __CLAULY_BRIDGE_URL__?: string }).__CLAULY_BRIDGE_URL__
        : undefined;
    const baseUrl = overrideUrl || "https://127.0.0.1:8765";
    const streamUrl = `${baseUrl}/redlines/stream`;
    let source: EventSource | null = null;
    let cancelled = false;

    const open = () => {
      if (cancelled) return;
      setBridgeStatus("connecting");
      try {
        source = new EventSource(streamUrl);
      } catch {
        setBridgeStatus("offline");
        return;
      }
      source.onopen = () => setBridgeStatus("live");
      source.onerror = () => setBridgeStatus("offline");
      source.addEventListener("hello", () => setBridgeStatus("live"));
      source.addEventListener("proposal", (ev: MessageEvent) => {
        try {
          const proposal = JSON.parse(ev.data) as Proposal;
          if (!proposal?.id || seenProposalIds.current.has(proposal.id)) return;
          seenProposalIds.current.add(proposal.id);
          setProposals((prev) => [...prev, proposal]);
        } catch {}
      });
      source.addEventListener("active_clause", (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data) as { clause_id?: string };
          if (data?.clause_id) setActiveClauseId(data.clause_id);
        } catch {}
      });
      source.addEventListener("caption", (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data) as { text?: string };
          if (data?.text) setActiveCaption(String(data.text).slice(0, 280));
        } catch {}
      });
      source.addEventListener("cleared", () => {
        seenProposalIds.current.clear();
        setProposals([]);
        setResolvedIds(new Set());
        setActiveCaption(null);
      });
    };

    open();

    return () => {
      cancelled = true;
      if (source) source.close();
    };
  }, []);

  const ackProposal = (id: string, kind: "applied" | "rejected") => {
    const overrideUrl =
      typeof window !== "undefined"
        ? (window as { __CLAULY_BRIDGE_URL__?: string }).__CLAULY_BRIDGE_URL__
        : undefined;
    const baseUrl = overrideUrl || "https://127.0.0.1:8765";
    fetch(`${baseUrl}/redlines/${encodeURIComponent(id)}/${kind}`, {
      method: "POST",
      mode: "cors",
      credentials: "omit"
    }).catch(() => undefined);
  };

  const pending = proposals.filter((p) => !resolvedIds.has(p.id));
  const hero =
    pending.find((p) => p.clause_id === activeClauseId) || pending[0] || null;
  const queue = pending.filter((p) => p !== hero);
  const resolvedFromActions = proposals.filter((p) => resolvedIds.has(p.id));

  const log = (entry: Omit<HistoryEntry, "id" | "ts">) => {
    setHistory((h) => [
      { id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ts: new Date(), ...entry },
      ...h,
    ]);
  };

  const loadDemo = async () => {
    setError(null);
    try {
      await Word.run(async (context) => {
        const existing = context.document.body.getTrackedChanges();
        existing.load("items");
        await context.sync();
        existing.items.forEach((c) => c.reject());
        context.document.changeTrackingMode = Word.ChangeTrackingMode.off;
        context.document.body.clear();
        await context.sync();
        for (const line of SAMPLE_CONTRACT_TEXT) {
          context.document.body.insertParagraph(line, Word.InsertLocation.end);
        }
        await context.sync();
      });
      setProposals(SAMPLE_PROPOSALS);
      setActiveClauseId("clause_5");
      setActiveCaption(
        "we want unlimited liability for IP infringement"
      );
      setResolvedIds(new Set());
      setHistory([]);
      log({
        type: "load",
        label: "Demo contract loaded",
        detail: `${SAMPLE_CONTRACT_TEXT.length} paragraphs · ${SAMPLE_PROPOSALS.length} proposals · ${RESOLVED_AUTO.length} auto-resolved`,
      });
      log({ type: "active", label: "§5 LoL is being discussed" });
    } catch (e) {
      setError(`Could not load demo: ${String(e)}`);
    }
  };

  const handleAccept = async (proposal: Proposal) => {
    setError(null);
    setBusyId(proposal.id);
    try {
      const result = await applyRedline(proposal);
      if (!result.ok) {
        setError(result.error || "Could not apply redline");
        log({
          type: "reject",
          label: `${clauseTypeLabel(proposal.clause_type)} accept failed`,
          detail: result.error,
          proposalId: proposal.id,
        });
        return;
      }
      setResolvedIds((s) => new Set(s).add(proposal.id));
      ackProposal(proposal.id, "applied");
      log({
        type: "accept",
        label: `Accepted ${clauseTypeLabel(proposal.clause_type)} redline`,
        detail: result.warnings?.[0],
        proposalId: proposal.id,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (proposal: Proposal) => {
    setBusyId(proposal.id);
    setResolvedIds((s) => new Set(s).add(proposal.id));
    ackProposal(proposal.id, "rejected");
    log({
      type: "reject",
      label: `Rejected ${clauseTypeLabel(proposal.clause_type)} proposal`,
      proposalId: proposal.id,
    });
    setBusyId(null);
  };

  const handleUndo = async (entry: HistoryEntry) => {
    if (entry.type !== "accept" || !entry.proposalId) return;
    setError(null);
    try {
      const proposal = proposals.find((p) => p.id === entry.proposalId);
      if (!proposal) return;
      await rejectAIChanges("Redliner AI");
      await rejectAllTrackedChanges();
      setResolvedIds((s) => {
        const next = new Set(s);
        next.delete(entry.proposalId!);
        return next;
      });
      log({
        type: "reject",
        label: `Undid ${clauseTypeLabel(proposal.clause_type)} accept`,
        proposalId: proposal.id,
      });
    } catch (e) {
      setError(String(e));
    }
  };

  const jumpTo = async (clauseId: string) => {
    const p = proposals.find((x) => x.clause_id === clauseId);
    if (!p) return;
    try {
      await Word.run(async (context) => {
        const found = context.document.body.search(p.original_text, {
          matchCase: false,
        });
        found.load("items");
        await context.sync();
        if (found.items.length > 0) {
          found.items[0].select();
          await context.sync();
        }
      });
    } catch {
      return;
    }
  };

  const bridgeIndicator = renderBridgeStatus(bridgeStatus, styles);

  if (proposals.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>Redliner</span>
          {bridgeIndicator}
        </div>
        <Divider />
        <div className={styles.emptyState}>
          <DocumentArrowDownRegular fontSize={36} />
          <Body1 style={{ display: "block", marginTop: 8 }}>
            No contract loaded yet
          </Body1>
          <Caption1 style={{ display: "block", marginTop: 4, color: tokens.colorNeutralForeground3 }}>
            Click below to populate the document with a sample MSA
            and queue up redline proposals.
          </Caption1>
          <Button
            appearance="primary"
            className={styles.loadDemoButton}
            icon={<DocumentArrowDownRegular />}
            onClick={loadDemo}
          >
            Load demo contract
          </Button>
        </div>
        {onSwitchToDevTools && (
          <button className={styles.devToolsLink} onClick={onSwitchToDevTools}>
            developer tools →
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Redliner</span>
        {bridgeIndicator}
      </div>

      <div className={styles.metricsBar}>
        <span className={styles.metric}>
          <span className={styles.metricNumber}>{pending.length}</span>pending
        </span>
        <span className={styles.metric}>
          <span className={styles.metricNumber}>
            {resolvedFromActions.length + autoResolved.length}
          </span>
          resolved
        </span>
        <span className={styles.metric}>
          <span className={styles.metricNumber}>{autoResolved.length}</span>auto
        </span>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {activeClauseId && hero && (
        <div className={styles.activeBanner}>
          <div className={styles.activeBannerHeader}>Now discussing</div>
          <div>
            <strong>
              §{hero.clause_id.replace("clause_", "")} · {clauseTypeLabel(hero.clause_type)}
            </strong>
          </div>
          {activeCaption && (
            <div className={styles.activeBannerCaption}>"{activeCaption}"</div>
          )}
        </div>
      )}

      {hero ? (
        <div className={`${styles.hero} ${severityHeroClass(hero.severity, styles)}`}>
          <div className={styles.heroHeader}>
            <Title3>{clauseTypeLabel(hero.clause_type)}</Title3>
            {severityBadge(hero.severity)}
          </div>

          <div className={styles.diffBlock}>
            {diffToRender(hero.original_text, hero.proposed_text, styles)}
          </div>

          <button
            className={styles.sectionToggle}
            onClick={() => setReasoningOpen((v) => !v)}
          >
            {reasoningOpen ? <ArrowDownRegular /> : <ArrowRightRegular />} Why this change
          </button>
          {reasoningOpen && <Body1 className={styles.reasoning}>{hero.reasoning}</Body1>}

          <button
            className={styles.sectionToggle}
            onClick={() => setEvidenceOpen((v) => !v)}
          >
            {evidenceOpen ? <ArrowDownRegular /> : <ArrowRightRegular />} Market evidence ({hero.market_evidence.length})
          </button>
          {evidenceOpen && (
            <ul className={styles.evidenceList}>
              {hero.market_evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}

          <Tooltip content="Scroll the document to this clause" relationship="label">
            <Button
              size="small"
              appearance="subtle"
              icon={<ArrowRightRegular />}
              onClick={() => jumpTo(hero.clause_id)}
              style={{ alignSelf: "flex-start" }}
            >
              Jump to clause
            </Button>
          </Tooltip>

          <div className={styles.actionRow}>
            <Button
              appearance="primary"
              icon={<CheckmarkRegular />}
              onClick={() => handleAccept(hero)}
              disabled={busyId === hero.id}
              className={styles.acceptButton}
              style={{ flex: 1 }}
            >
              {busyId === hero.id ? <Spinner size="tiny" /> : "Accept"}
            </Button>
            <Button
              icon={<DismissRegular />}
              onClick={() => handleReject(hero)}
              disabled={busyId === hero.id}
              className={styles.rejectButton}
              style={{ flex: 1 }}
            >
              Reject
            </Button>
            <Tooltip content="Modify the proposed text before accepting" relationship="label">
              <Button
                icon={<EditRegular />}
                disabled={busyId === hero.id}
                className={styles.editButton}
                aria-label="Edit"
              />
            </Tooltip>
          </div>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <CheckmarkCircleFilled fontSize={36} style={{ color: "#1d8348" }} />
          <Body1 style={{ display: "block", marginTop: 8 }}>
            All proposals handled
          </Body1>
          <Caption1 style={{ display: "block", marginTop: 4 }}>
            {resolvedFromActions.length} accepted/rejected · {autoResolved.length} auto-resolved
          </Caption1>
        </div>
      )}

      {queue.length > 0 && (
        <>
          <button
            className={styles.sectionToggle}
            onClick={() => setShowQueue((v) => !v)}
          >
            {showQueue ? <ArrowDownRegular /> : <ArrowRightRegular />} Queue ({queue.length} pending)
          </button>
          {showQueue && (
            <div>
              {queue.map((p) => (
                <div
                  key={p.id}
                  className={`${styles.queueItem} ${
                    p.clause_id === activeClauseId ? styles.queueItemActive : ""
                  }`}
                  onClick={() => setActiveClauseId(p.clause_id)}
                >
                  <span className={styles.queueLeft}>
                    <strong>§{p.clause_id.replace("clause_", "")}</strong>
                    <span style={{ color: tokens.colorNeutralForeground2 }}>
                      {clauseTypeLabel(p.clause_type)}
                    </span>
                  </span>
                  {severityBadge(p.severity)}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <button
        className={styles.sectionToggle}
        onClick={() => setShowResolved((v) => !v)}
      >
        {showResolved ? <ArrowDownRegular /> : <ArrowRightRegular />} Resolved ({resolvedFromActions.length + autoResolved.length})
      </button>
      {showResolved && (
        <div>
          {resolvedFromActions.map((p) => (
            <div key={p.id} className={styles.resolvedRow}>
              <CheckmarkCircleFilled style={{ color: "#1d8348" }} />
              <span>
                <strong>§{p.clause_id.replace("clause_", "")}</strong> {clauseTypeLabel(p.clause_type)}
              </span>
            </div>
          ))}
          {autoResolved.map((r) => (
            <Tooltip key={r.id} content={r.reason} relationship="description">
              <div className={styles.resolvedRow}>
                <CheckmarkCircleFilled style={{ color: "#1d8348" }} />
                <span>
                  {r.title}{" "}
                  <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                    auto
                  </Caption1>
                </span>
              </div>
            </Tooltip>
          ))}
        </div>
      )}

      <button
        className={styles.sectionToggle}
        onClick={() => setShowHistory((v) => !v)}
      >
        {showHistory ? <ArrowDownRegular /> : <ArrowRightRegular />} <HistoryRegular /> History ({history.length})
      </button>
      {showHistory && history.length > 0 && (
        <div>
          {history.map((h) => (
            <div key={h.id} className={styles.historyEntry}>
              <div className={styles.historyTop}>
                <span className={styles.historyLabel}>{h.label}</span>
                <span className={styles.historyTime}>{timeFmt(h.ts)}</span>
              </div>
              {h.detail && <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>{h.detail}</Caption1>}
              {h.type === "accept" && h.proposalId && (
                <Button
                  size="small"
                  appearance="subtle"
                  onClick={() => handleUndo(h)}
                  style={{ alignSelf: "flex-start", padding: "2px 4px", marginTop: 2 }}
                >
                  Undo
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {onSwitchToDevTools && (
        <button className={styles.devToolsLink} onClick={onSwitchToDevTools}>
          developer tools →
        </button>
      )}
    </div>
  );
}
