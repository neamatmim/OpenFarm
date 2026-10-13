// @vitest-environment jsdom
import { monthlyPaymentAllocationOf, monthlySumsOf } from "@OpenFarm/domain";
import { loadMessages, translate } from "@OpenFarm/i18n";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, expect, it, vi } from "vitest";

import { MonthlyPayments } from "./monthly-payments";

vi.mock("@/i18n/language-provider", () => ({
  useT: () => translate.bind(null, "en"),
  useLanguage: () => ({ language: "en", t: translate.bind(null, "en") }),
}));

beforeAll(async () => {
  await loadMessages("en", "desk");
});

it("shows a 45,000 receipt as 40,000 cattle and 5,000 monthly, with what was paid early inside the monthly total", () => {
  const allocation = monthlyPaymentAllocationOf({
    units: 1,
    unitPriceMoney: 58_000,
    paidMoney: 45_000,
    today: "2071-01-05",
    monthly: {
      cattlePartMoney: 40_000,
      sums: monthlySumsOf(58_000, {
        cattlePartMoney: 40_000,
        sums: 9,
        firstDueOn: "2071-02-10",
      }),
    },
  });
  const html = renderToStaticMarkup(
    createElement(MonthlyPayments, { allocation })
  );
  const page = new DOMParser().parseFromString(html, "text/html");
  const figures = [...(page.querySelector("dl")?.children ?? [])];
  expect(
    figures.map((figure) => figure.querySelector("dd")?.textContent)
  ).toEqual(["৳40,000", "৳5,000", "৳13,000"]);
  expect(figures[1]?.textContent).toContain(
    "Includes ৳5,000 paid early for months to come"
  );
});
