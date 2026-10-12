// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { matchesFormFields, readFormDraft, writeFormDraft } from "./form-draft";
import { draftKeyFor, useFormDraft } from "./use-form-draft";

const BLANK = { name: "", amount: "", consent: false };
const valid = (value: unknown): value is typeof BLANK =>
  matchesFormFields(value, BLANK);
const key = "person-a:farm-a:intake";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("recoverable form drafts", () => {
  it("restores unfinished text after remount and removes it after a successful save", () => {
    const first = renderHook(() => useFormDraft(key, BLANK, valid));
    act(() =>
      first.result.current.setValue({ ...BLANK, name: "Seller", amount: "15." })
    );
    expect(first.result.current.restored).toBe(false);
    first.unmount();
    const next = renderHook(() => useFormDraft(key, BLANK, valid));
    expect(next.result.current.value).toEqual({
      ...BLANK,
      name: "Seller",
      amount: "15.",
    });
    expect(next.result.current.restored).toBe(true);
    act(() => next.result.current.clear());
    expect(readFormDraft(key, valid)).toBeNull();
    expect(next.result.current.value).toEqual(BLANK);
    expect(next.result.current.restored).toBe(false);
  });

  it("keeps different users, farms and agreements separate when the scope changes", () => {
    const person = { id: "person-a", farm: { id: "farm-a" } };
    const own = draftKeyFor(person, "agreement:a");
    const other = draftKeyFor(
      { id: "person-b", farm: { id: "farm-b" } },
      "agreement:a"
    );
    const { result, rerender } = renderHook(
      ({ scope }) => useFormDraft(scope, BLANK, valid),
      { initialProps: { scope: own } }
    );
    act(() => result.current.setValue({ ...BLANK, name: "Private name" }));
    rerender({ scope: other });
    expect(result.current.value).toEqual(BLANK);
    rerender({ scope: draftKeyFor(person, "agreement:b") });
    expect(result.current.value).toEqual(BLANK);
    rerender({ scope: own });
    expect(result.current.value.name).toBe("Private name");
    expect(draftKeyFor(undefined, "intake")).toBeNull();
  });

  it("keeps edits usable and reports storage failure rather than claiming they are durable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const { result } = renderHook(() => useFormDraft(key, BLANK, valid));
    act(() => result.current.setValue({ ...BLANK, name: "Unsaved" }));
    expect(result.current.value.name).toBe("Unsaved");
    expect(result.current.failed).toBe(true);
    expect(readFormDraft(key, valid)).toBeNull();
  });

  it("ignores incomplete or corrupt stored drafts", () => {
    writeFormDraft(key, { name: 5 });
    expect(readFormDraft(key, valid)).toBeNull();
    localStorage.setItem(`openfarm-form-draft:v1:${key}`, "{broken");
    expect(readFormDraft(key, valid)).toBeNull();
  });
});
