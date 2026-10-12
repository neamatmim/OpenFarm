import { translate } from "@OpenFarm/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OutboxState } from "@/lib/outbox";

import { SyncBanner } from "./sync-banner";

vi.mock("@/i18n/language-provider", () => ({
  useLanguage: () => ({
    language: "en",
    t: (
      key: Parameters<typeof translate>[1],
      params?: Parameters<typeof translate>[2]
    ) => translate("en", key, params),
  }),
}));
vi.mock("@/utils/orpc", () => ({ client: {} }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) =>
    createElement("a", { href: to }, children),
}));

const draw = (changes: Partial<OutboxState>) => {
  const client = new QueryClient();
  client.setQueryData(["outbox"], {
    pending: 0,
    rejected: 0,
    reviewed: 0,
    lastSyncAt: null,
    oldestWaitingAt: null,
    paused: "none",
    waitedLong: false,
    ...changes,
  });
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(SyncBanner))
  );
  client.clear();
  return html;
};

describe("outbox status wording", () => {
  it("shows accepted entries awaiting review without presenting them as rejected", () => {
    const html = draw({ reviewed: 3 });
    expect(html).toContain("3 awaiting review");
    expect(html).toContain('href="/outbox"');
    expect(html).not.toContain("the farm sent back");
    expect(html).not.toContain("border-warning");
  });

  it("keeps rejected and reviewed counts separate when both are present", () => {
    const html = draw({ rejected: 2, reviewed: 3 });
    expect(html).toContain("Returned: 2 · Review: 3");
    expect(html).not.toContain("5 the farm sent back");
    expect(html).toContain("border-warning");
  });

  it("does not call the queue empty while pending entries remain alongside review notices", () => {
    const html = draw({ pending: 4, reviewed: 3 });
    expect(html).toContain("4 waiting to send");
    expect(html).not.toContain("Nothing waiting to send");
  });

  it("still asks for sign-in when accepted review notices are also present", () => {
    expect(draw({ pending: 2, reviewed: 3, paused: "signed_out" })).toContain(
      "Sign in again to send what is waiting"
    );
  });
});
