import { translate } from "@OpenFarm/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkDeliveryNotice } from "./work-delivery-notice";

vi.mock("@/i18n/language-provider", () => ({
  useLanguage: () => ({
    language: "en",
    t: (key: Parameters<typeof translate>[1]) => translate("en", key),
  }),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Link: ({ to, children }: { to: string; children: ReactNode }) =>
    createElement("a", { href: to }, children),
}));

const draw = (waiting: string[], instanceId?: string) => {
  const client = new QueryClient();
  client.setQueryData(["outbox", "work-delivery"], waiting);
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(WorkDeliveryNotice, { instanceId })
    )
  );
  client.clear();
  return html;
};

describe("work delivery guidance", () => {
  it("marks local work as waiting for the farm on its board and on today's list", () => {
    expect(draw(["job"], "job")).toContain("Work waiting to reach the farm");
    expect(draw(["job"])).toContain('href="/outbox"');
  });
  it("does not attach another job's pending delivery to this board or imply pending work after the queue clears", () => {
    expect(draw(["other-job"], "job")).toBe("");
    expect(draw([], "job")).toBe("");
  });
});
