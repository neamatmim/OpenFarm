import type { SopContent } from "@OpenFarm/domain";

/** A procedure being written, as the Playbook page holds it while the editor is open. */
export interface SopDraft {
  content: SopContent;
  definitionId: string | null;
  /** The Version in force when the change began: refused once a newer one is published meanwhile. */
  basedOnVersionId: string | null;
  /** What it said when the change began, whose meanings the editor keeps. */
  startedFrom: SopContent;
  /** The standard procedure it is adopted from, where it is. */
  standardKey?: string | null;
}

const KEY = "openfarm-sop-draft:";

/** Whether what was read back is a draft this page can open again, not something older or broken. */
const isDraft = (value: unknown): value is SopDraft => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const draft = value as Partial<SopDraft>;
  return (
    Array.isArray(draft.content?.steps) &&
    Array.isArray(draft.startedFrom?.steps) &&
    (draft.definitionId === null || typeof draft.definitionId === "string")
  );
};

/** Said whenever this tab keeps or lets go a draft, as the browser says it for other tabs. */
const KEPT_CHANGED = "openfarm-sop-draft-changed";

/**
 * A half-written procedure kept on this device, one person's own, until it is published, sent, or let go: a morning's
 * ten Steps were lost to a sidebar link, a reload or a session that ran out. Nothing is kept where the browser keeps
 * nothing; the editor still works, and only the keeping is lost.
 */
export const keepDraft = (userId: string, draft: SopDraft | null) => {
  try {
    if (draft) {
      window.localStorage.setItem(`${KEY}${userId}`, JSON.stringify(draft));
    } else {
      window.localStorage.removeItem(`${KEY}${userId}`);
    }
    window.dispatchEvent(new Event(KEPT_CHANGED));
  } catch {
    // Storage unavailable: the draft lives as long as the page does.
  }
};

/** The draft this person left on this device, as it was written down; nothing where none is, or none can be read. */
export const keptDraftText = (userId: string): string | null => {
  try {
    return window.localStorage.getItem(`${KEY}${userId}`);
  } catch {
    return null;
  }
};

/** A kept draft read back: one this page can open again, not something older or broken. */
export const draftOf = (kept: string | null): SopDraft | null => {
  if (!kept) {
    return null;
  }
  try {
    const draft: unknown = JSON.parse(kept);
    return isDraft(draft) ? draft : null;
  } catch {
    return null;
  }
};

/** Calls back whenever a kept draft may have changed, here or in another tab. */
export const subscribeKeptDraft = (onChange: () => void) => {
  window.addEventListener(KEPT_CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(KEPT_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
};

/** Whether the draft says anything its start did not: only then is leaving it a loss worth asking about. */
export const draftChanged = (draft: SopDraft | null): boolean =>
  draft !== null &&
  JSON.stringify(draft.content) !== JSON.stringify(draft.startedFrom);
