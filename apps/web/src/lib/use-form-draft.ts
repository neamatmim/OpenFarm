import { useMemo, useState, useSyncExternalStore } from "react";

import { formDraftText, parseFormDraft, writeFormDraft } from "./form-draft";

const subscribe = (changed: () => void) => {
  window.addEventListener("storage", changed);
  return () => window.removeEventListener("storage", changed);
};

export const draftKeyFor = (
  person: { id: string; farm: { id: string } | null } | undefined,
  workflow: string
): string | null =>
  person?.farm ? `${person.id}:${person.farm.id}:${workflow}` : null;

export const useFormDraft = <T>(
  key: string | null,
  blank: T,
  valid: (value: unknown) => value is T
) => {
  const text = useSyncExternalStore(
    subscribe,
    () => (key ? formDraftText(key) : null),
    () => null
  );
  const kept = useMemo(() => parseFormDraft(text, valid), [text, valid]);
  const [edited, setEdited] = useState<{
    key: string | null;
    value: T;
    restored: boolean;
    failed: boolean;
  } | null>(null);
  const current = edited?.key === key ? edited : null;
  const restored = current?.restored ?? kept !== null;
  const setValue = (next: T) => {
    const failed = key ? !writeFormDraft(key, next) : true;
    setEdited({ key, value: next, restored, failed });
  };
  const clear = () => {
    const failed = key ? !writeFormDraft(key, null) : false;
    setEdited({ key, value: blank, restored: false, failed });
  };
  return {
    value: current?.value ?? kept ?? blank,
    setValue,
    clear,
    restored,
    failed: current?.failed ?? false,
  };
};
