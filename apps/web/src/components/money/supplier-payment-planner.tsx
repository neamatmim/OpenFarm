import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Badge } from "@OpenFarm/ui/components/badge";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Input } from "@OpenFarm/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { useId, useState } from "react";

import type { Invoice, PayableInvoice } from "@/components/feed/supplier-forms";
import {
  SupplierPaymentSheet,
  VoidSupplierPaymentSheet,
} from "@/components/feed/supplier-forms";
import { SupplierInvoiceCard } from "@/components/feed/suppliers";
import { SaidDate } from "@/components/list-cells";
import { EmptyState, Loaded, Section } from "@/components/page";
import { FormField, NativeSelect, SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { orpc } from "@/utils/orpc";

type PaymentPlan = Awaited<ReturnType<typeof orpc.suppliers.paymentPlan.call>>;
type Group = PaymentPlan["suppliers"][number];
type PlannedInvoice = Group["invoices"][number];
type Period = "all" | "overdue" | "next7" | "next30" | "month";
const PERIODS = ["all", "overdue", "next7", "next30", "month"] as const;
const PERIOD_WORDS = {
  all: "payables.all",
  overdue: "suppliers.overdue",
  next7: "payables.next7",
  next30: "payables.next30",
  month: "payables.month",
} as const;

const inPeriod = (
  invoice: PlannedInvoice,
  period: Period,
  plan: PaymentPlan
) => {
  if (period === "all") {
    return true;
  }
  if (period === "overdue") {
    return invoice.dueOn < plan.today;
  }
  if (period === "month") {
    return invoice.dueOn <= plan.monthEnd;
  }
  return (
    invoice.dueOn >= plan.today &&
    invoice.dueOn <= (period === "next7" ? plan.through7 : plan.through30)
  );
};

const shownGroups = (plan: PaymentPlan, period: Period, search: string) => {
  const term = search.trim().normalize("NFC").toLocaleLowerCase();
  return plan.suppliers.flatMap((group) => {
    const supplierMatches =
      `${group.supplier.name} ${group.supplier.phone ?? ""}`
        .normalize("NFC")
        .toLocaleLowerCase()
        .includes(term);
    const invoices = group.invoices.filter(
      (invoice) =>
        inPeriod(invoice, period, plan) &&
        (supplierMatches ||
          invoice.number.normalize("NFC").toLocaleLowerCase().includes(term))
    );
    return invoices.length ? [{ ...group, invoices }] : [];
  });
};

const amountOf = (invoices: readonly PlannedInvoice[]) =>
  invoices.reduce(
    (sum, invoice) => sum + Math.round(invoice.owingMoney * 100),
    0
  ) / 100;

/** One bill on the plan: the Owner pays it from here, and anybody else is told that she does, in place of the button,
 *  so the bill is not paid by some other road. */
const PlannedInvoiceRow = ({
  invoice,
  today,
  owner,
  onPay,
  onView,
}: {
  invoice: PlannedInvoice;
  today: string;
  owner: boolean;
  onPay: () => void;
  onView: () => void;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const overdue = invoice.dueOn < today;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium break-words">{invoice.number}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("suppliers.dueOn")}: <SaidDate at={invoice.dueOn} />
        </p>
        {overdue || invoice.dueOn === today ? (
          <Badge
            className="mt-1"
            variant={overdue ? "destructive" : "secondary"}
          >
            {t(overdue ? "suppliers.overdue" : "payables.today")}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold tabular-nums">
          {asMoney(invoice.owingMoney)}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={onView}
          aria-label={t("payables.viewNamed", {
            number: invoice.number,
            supplier: invoice.supplier.name,
          })}
        >
          {t("payables.viewInvoice")}
        </Button>
        {owner ? (
          <Button
            size="sm"
            onClick={onPay}
            aria-label={t("payables.payNamed", {
              number: invoice.number,
              supplier: invoice.supplier.name,
            })}
          >
            {t("suppliers.pay")}
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">
            {t("suppliers.ownerPays")}
          </span>
        )}
      </div>
    </li>
  );
};

const InvoiceReview = ({
  id,
  owner,
  onClose,
  onPay,
  onVoid,
}: {
  id: string;
  owner: boolean;
  onClose: () => void;
  onPay: (invoice: Invoice) => void;
  onVoid: (payment: Invoice["payments"][number]) => void;
}) => {
  const { t } = useLanguage();
  const invoice = useQuery(
    orpc.suppliers.invoice.queryOptions({ input: { id } })
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl" closeLabel={t("common.close")}>
        <DialogHeader className="pr-10">
          <DialogTitle>
            {invoice.data
              ? `${invoice.data.supplier.name} · ${invoice.data.number}`
              : t("payables.viewInvoice")}
          </DialogTitle>
        </DialogHeader>
        <Loaded query={invoice}>
          {invoice.data ? (
            <SupplierInvoiceCard
              invoice={invoice.data}
              owner={owner}
              onPay={() => {
                if (invoice.data) {
                  onPay(invoice.data);
                }
              }}
              onVoid={onVoid}
            />
          ) : null}
        </Loaded>
      </DialogContent>
    </Dialog>
  );
};

export const SupplierPaymentPlanner = ({ owner }: { owner: boolean }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const prefix = useId();
  const planQuery = useQuery({
    ...orpc.suppliers.paymentPlan.queryOptions(),
    refetchInterval: 60_000,
  });
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paying, setPaying] = useState<PayableInvoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice["payments"][number] | null>(
    null
  );
  const plan = planQuery.data;
  const groups = plan ? shownGroups(plan, period, search) : [];
  const day = (value: string) => formatDate(startOfFarmDay(value), language);
  return (
    <Loaded query={planQuery}>
      {plan ? (
        <div className="flex flex-col gap-5">
          <Section title={t("payables.title")} description={t("payables.hint")}>
            <div className="flex flex-col gap-4">
              <p className="text-muted-foreground text-sm">
                {t("payables.asOf", { date: day(plan.today) })} ·{" "}
                {t("payables.outstanding", {
                  money: asMoney(plan.outstandingMoney),
                })}
              </p>
              <SummaryFigures
                hintsOnPhone
                figures={[
                  {
                    label: t("suppliers.overdue"),
                    value: asMoney(plan.overdueMoney),
                    hint: t("payables.beforeToday"),
                    tone: plan.overdueMoney > 0 ? "danger" : "neutral",
                    onSelect: () => setPeriod("overdue"),
                    selected: period === "overdue",
                  },
                  {
                    label: t("payables.next7"),
                    value: asMoney(plan.next7Money),
                    hint: `${day(plan.today)} – ${day(plan.through7)}`,
                    onSelect: () => setPeriod("next7"),
                    selected: period === "next7",
                  },
                  {
                    label: t("payables.next30"),
                    value: asMoney(plan.next30Money),
                    hint: `${day(plan.today)} – ${day(plan.through30)}`,
                    onSelect: () => setPeriod("next30"),
                    selected: period === "next30",
                  },
                  {
                    label: t("payables.month"),
                    value: asMoney(plan.byMonthEndMoney),
                    hint: t("payables.monthHint", { date: day(plan.monthEnd) }),
                    onSelect: () => setPeriod("month"),
                    selected: period === "month",
                  },
                ]}
              />
              <p className="text-muted-foreground text-sm">
                {t("payables.windowsHint")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id={`${prefix}-search`} label={t("payables.search")}>
                  <Input
                    id={`${prefix}-search`}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </FormField>
                <FormField id={`${prefix}-period`} label={t("payables.show")}>
                  <NativeSelect
                    id={`${prefix}-period`}
                    value={period}
                    onChange={(event) => {
                      const chosen = PERIODS.find(
                        (value) => value === event.target.value
                      );
                      if (chosen) {
                        setPeriod(chosen);
                      }
                    }}
                  >
                    {PERIODS.map((value) => (
                      <option key={value} value={value}>
                        {t(PERIOD_WORDS[value])}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              </div>
              <output className="text-muted-foreground text-sm">
                {t("payables.shown", {
                  count: groups.reduce(
                    (sum, group) => sum + group.invoices.length,
                    0
                  ),
                  money: asMoney(
                    amountOf(groups.flatMap((group) => group.invoices))
                  ),
                })}
              </output>
            </div>
          </Section>
          {selectedId ? (
            <InvoiceReview
              id={selectedId}
              owner={owner}
              onClose={() => setSelectedId(null)}
              onPay={(invoice) => {
                setSelectedId(null);
                setPaying(invoice);
              }}
              onVoid={(payment) => {
                setSelectedId(null);
                setVoiding(payment);
              }}
            />
          ) : null}
          {groups.length ? (
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <article
                  className="rounded-xl border p-4"
                  key={group.supplier.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold break-words">
                        {group.supplier.name}
                      </h3>
                      {group.supplier.phone ? (
                        <p className="text-muted-foreground text-sm">
                          {group.supplier.phone}
                        </p>
                      ) : null}
                    </div>
                    {group.supplier.retired ? (
                      <Badge variant="secondary">
                        {t("suppliers.retired")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm">
                    {t("payables.supplierShown", {
                      money: asMoney(amountOf(group.invoices)),
                    })}
                  </p>
                  <ul className="mt-3 flex flex-col gap-3">
                    {group.invoices.map((invoice) => (
                      <PlannedInvoiceRow
                        key={invoice.id}
                        invoice={invoice}
                        today={plan.today}
                        owner={owner}
                        onPay={() => setPaying(invoice)}
                        onView={() => setSelectedId(invoice.id)}
                      />
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title={t(
                plan.suppliers.length ? "payables.noMatches" : "payables.empty"
              )}
              description={t(
                plan.suppliers.length
                  ? "payables.noMatchesHint"
                  : "payables.emptyHint"
              )}
            />
          )}
        </div>
      ) : null}
      {paying ? (
        <SupplierPaymentSheet
          invoice={paying}
          onClose={() => setPaying(null)}
        />
      ) : null}
      {voiding ? (
        <VoidSupplierPaymentSheet
          payment={voiding}
          onClose={() => setVoiding(null)}
        />
      ) : null}
    </Loaded>
  );
};
