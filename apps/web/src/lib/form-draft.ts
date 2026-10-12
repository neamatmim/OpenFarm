const PREFIX = "openfarm-form-draft:v1:";

export const formDraftText = (key: string): string | null => {
  try {
    return window.localStorage.getItem(`${PREFIX}${key}`);
  } catch {
    return null;
  }
};

export const parseFormDraft = <T>(
  text: string | null,
  valid: (value: unknown) => value is T
): T | null => {
  try {
    if (!text) {
      return null;
    }
    const value: unknown = JSON.parse(text);
    return valid(value) ? value : null;
  } catch {
    return null;
  }
};

/** A draft is scoped to its author, farm and workflow, and is never a saved business record. */
export const readFormDraft = <T>(
  key: string,
  valid: (value: unknown) => value is T
): T | null => parseFormDraft(formDraftText(key), valid);

export const writeFormDraft = (key: string, value: unknown): boolean => {
  try {
    if (value === null) {
      window.localStorage.removeItem(`${PREFIX}${key}`);
    } else {
      window.localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
    }
    return true;
  } catch {
    return false;
  }
};

/** Only the primitive fields this version of the form knows are restored. */
export const matchesFormFields = <T extends object>(
  value: unknown,
  blank: T
): value is T =>
  value !== null &&
  typeof value === "object" &&
  Object.entries(blank).every(
    ([key, initial]) =>
      key in value && typeof Reflect.get(value, key) === typeof initial
  );
