import { formatDate, translate } from "@OpenFarm/i18n";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataFreshness } from "./data-freshness";
import type { FreshnessRead } from "./data-freshness";

const network = vi.hoisted(() => ({ online: true }));
vi.mock("@/lib/online", () => ({ useOnline: () => network.online }));
vi.mock("@/i18n/language-provider", () => ({
  useLanguage: () => ({
    language: "en",
    t: (
      key: Parameters<typeof translate>[1],
      params?: Parameters<typeof translate>[2]
    ) => translate("en", key, params),
  }),
}));

const yesterday = new Date("2026-10-08T03:00:00Z").getTime();
const read = (dataUpdatedAt = yesterday): FreshnessRead => ({
  dataUpdatedAt,
  fetchStatus: "idle",
  isError: false,
});
const draw = (reads: FreshnessRead[]) =>
  renderToStaticMarkup(createElement(DataFreshness, { reads }));

beforeEach(() => {
  network.online = true;
});

describe("the age of a page's data", () => {
  it("shows the oldest answer, rather than the most recently fetched part of the page", () => {
    const html = draw([read(yesterday + 60_000), read()]);
    expect(html).toContain(
      `Last updated ${formatDate(new Date(yesterday), "en", "dateTime")}`
    );
  });

  it("keeps the original timestamp visible offline and warns when a refresh fails", () => {
    network.online = false;
    const offline = draw([read()]);
    expect(offline).toContain("Offline · Last updated");
    network.online = true;
    const failed = draw([{ ...read(), isError: true }]);
    expect(failed).toContain("Could not refresh · Last updated");
    expect(failed).toContain(formatDate(new Date(yesterday), "en", "dateTime"));
  });

  it("does not invent an update time before any data arrives, and names an incomplete page", () => {
    expect(draw([read(0)])).toBe("");
    expect(draw([read(Number.NaN)])).toBe("");
    expect(draw([read(), read(0)])).toContain("Some data has not loaded");
    expect(draw([{ ...read(), fetchStatus: "fetching" }])).toContain(
      "Refreshing · Last updated"
    );
  });
});
