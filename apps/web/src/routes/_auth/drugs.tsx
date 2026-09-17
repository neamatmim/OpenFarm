import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  CircleCheck,
  Hourglass,
  PackagePlus,
  Pill,
  ShoppingCart,
  Syringe,
} from "lucide-react";
import { useState } from "react";

import { BuyMedicineSheet } from "@/components/drugs/buy-medicine-sheet";
import { ProductsTab } from "@/components/drugs/drug-products";
import { PurchasesTab } from "@/components/drugs/drug-purchases";
import type { DrugProduct } from "@/components/drugs/drug-types";
import { standingOf } from "@/components/drugs/drug-types";
import { Loaded, Page, PageHeader } from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const TABS = ["products", "bought"] as const;
type Tab = (typeof TABS)[number];

/** Products whose days nobody has written yet: nothing may be prescribed from them. */
const waitingOf = (products: DrugProduct[]) =>
  products.filter((product) => standingOf(product) === "waiting").length;

/** The figures the Drug List is judged by: what is on it, what may be prescribed, what still waits for the Vet's
 *  days, and how many of it are vaccines. */
const useListFigures = (products: DrugProduct[]): Figure[] => {
  const { t, language } = useLanguage();
  const live = products.filter((product) => !product.retiredAt);
  const waiting = waitingOf(products);
  const prescribable = live.filter((product) => product.prescribable).length;
  const vaccines = live.filter((product) => product.vaccine).length;
  return [
    {
      label: t("drugs.kpi.onList"),
      value: formatNumber(live.length, language),
      hint: t("drugs.kpi.onListHint"),
      icon: Pill,
    },
    {
      label: t("drugs.kpi.prescribable"),
      value: formatNumber(prescribable, language),
      hint: t("drugs.kpi.prescribableHint"),
      icon: CircleCheck,
    },
    {
      label: t("drugs.blank"),
      value: formatNumber(waiting, language),
      hint: t("drugs.kpi.waitingHint"),
      icon: Hourglass,
      tone: waiting > 0 ? "warning" : "neutral",
    },
    {
      label: t("drugs.kpi.vaccines"),
      value: formatNumber(vaccines, language),
      hint: t("drugs.kpi.vaccinesHint"),
      icon: Syringe,
    },
  ];
};

/**
 * The farm's Drug List: what it treats animals with, and what each product costs the milk
 * and the meat in days.
 *
 * There is no national table for this — the days come off the label and the prescribing
 * Vet — so this list is the only place they exist, and it is what the farm shows a slaughter
 * vet asking about the last thirty days. A product whose days are blank sits here saying so:
 * the farm owns it, and nothing may be prescribed from it yet.
 *
 * Whoever buys medicine — the Manager, and the Owner — has a second tab for what was bought, and medicine bought is one
 * button away from either.
 */
const DrugsPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab = "products" } = Route.useSearch();
  const me = useQuery(orpc.people.me.queryOptions());
  const drugs = useQuery(orpc.drugs.list.queryOptions());
  const [buying, setBuying] = useState<{ productId?: string } | null>(null);
  const [historyFor, setHistoryFor] = useState("");
  // A vet called in for a visit reads the Drug List to prescribe from; keeping it is the farm's own Vet's.
  const visiting = me.data?.scopes.vet?.kind === "cases";
  const isVet = (me.data?.roles.includes("vet") ?? false) && !visiting;
  const buys =
    me.data?.roles.some((role) => role === "owner" || role === "manager") ??
    false;
  const products = drugs.data ?? [];
  const live = products.filter((product) => !product.retiredAt);
  const figures = useListFigures(products);

  const productsTab = (
    <Loaded query={drugs}>
      <ProductsTab
        isVet={isVet}
        mayAdd={!visiting}
        mayBuy={buys}
        onBuy={(productId) => setBuying({ productId })}
        products={products}
      />
    </Loaded>
  );

  return (
    <Page>
      <PageHeader
        actions={
          buys && live.length > 0 ? (
            <Button
              onClick={() =>
                setBuying({
                  productId: tab === "bought" ? historyFor : undefined,
                })
              }
              type="button"
            >
              <PackagePlus aria-hidden data-icon="inline-start" />
              {t("drugs.recordPurchase")}
            </Button>
          ) : null
        }
        description={t("drugs.subtitle")}
        title={t("drugs.title")}
      />

      {drugs.data ? <SummaryFigures figures={figures} /> : null}

      {buys ? (
        <PageTabs
          onChange={(value) =>
            navigate({
              replace: true,
              search: value === "products" ? {} : { tab: value },
            })
          }
          tabs={[
            {
              value: "products",
              label: t("drugs.tab.products"),
              icon: Pill,
              count: waitingOf(products),
              content: productsTab,
            },
            {
              value: "bought",
              label: t("drugs.buy"),
              icon: ShoppingCart,
              content: (
                <Loaded query={drugs}>
                  <PurchasesTab
                    onProductChange={setHistoryFor}
                    productId={historyFor}
                    products={products}
                  />
                </Loaded>
              ),
            },
          ]}
          value={tab}
        />
      ) : (
        productsTab
      )}

      {buys ? (
        <BuyMedicineSheet
          key={buying?.productId ?? "any"}
          onOpenChange={(open) => {
            if (!open) {
              setBuying(null);
            }
          }}
          open={buying !== null}
          productId={buying?.productId}
          products={live}
        />
      ) : null}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/drugs")({
  /** The Vet keeps it, the Manager adds to it, the Owner reads it — and Barn Staff have no
   *  business in it at all, so they are not shown a form that would refuse them. */
  beforeLoad: ({ context }) => {
    const { roles } = context.me;
    const allowed = new Set(["owner", "manager", "vet"]);
    if (!roles.some((role) => allowed.has(role))) {
      throw redirect({ to: "/today", search: {} });
    }
  },
  component: DrugsPage,
  /** Which tab, kept in the address so the page comes back as it was left. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) && search.tab !== "products"
      ? { tab: search.tab as Tab }
      : {},
});
