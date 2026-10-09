// @vitest-environment jsdom
import { loadMessages } from "@OpenFarm/i18n";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/lib/toast";

import { LanguageProvider, useLanguage } from "./language-provider";

vi.mock("@OpenFarm/i18n", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  loadMessages: vi.fn<typeof loadMessages>().mockResolvedValue(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));
vi.mock("@/lib/page-context", () => ({
  LANGUAGE_COOKIE: "test-language",
  pageLanguage: () => "en",
}));
vi.mock("@/lib/mark-bangla", () => ({
  markBanglaWhileEnglish: () => () => {},
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }));
vi.mock("@/utils/orpc", () => ({
  orpc: { language: { set: { call: vi.fn() } } },
}));

const Choice = () => {
  const { language, setLanguage } = useLanguage();
  return createElement(
    "button",
    {
      onClick: () => {
        void setLanguage("bn");
      },
    },
    language
  );
};
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  vi.mocked(loadMessages).mockResolvedValue();
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(LanguageProvider, null, createElement(Choice)));
    await Promise.resolve();
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
});

describe("switching a language with a failed download", () => {
  it("keeps the current words, then switches when the reader retries", async () => {
    vi.mocked(loadMessages).mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      host.querySelector("button")?.click();
      await Promise.resolve();
    });
    expect(host.textContent).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    const action = vi.mocked(toast.error).mock.calls.at(-1)?.[1]?.action;
    expect(action).toMatchObject({ label: "Try again" });
    if (
      !action ||
      typeof action !== "object" ||
      !("onClick" in action) ||
      typeof action.onClick !== "function"
    ) {
      throw new Error("expected a retry action");
    }
    await act(async () => {
      Reflect.apply(action.onClick, undefined, []);
      await Promise.resolve();
    });
    expect(host.textContent).toBe("bn");
    expect(document.documentElement.lang).toBe("bn");
    expect(toast.dismiss).toHaveBeenCalledWith("language-download");
  });

  it("retries after reconnecting, including when the desk half failed", async () => {
    vi.mocked(loadMessages)
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("desk download failed"));
    await act(async () => {
      host.querySelector("button")?.click();
      await Promise.resolve();
    });
    expect(host.textContent).toBe("en");
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    expect(host.textContent).toBe("bn");
    expect(loadMessages).toHaveBeenCalledWith("bn", "desk");
  });
});
