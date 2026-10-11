import { Badge } from "@OpenFarm/ui/components/badge";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import { SaidDate } from "@/components/list-cells";
import { Loaded, Notice, Section } from "@/components/page";
import { FormField, NativeSelect, SummaryFigures } from "@/components/page-kit";
import { PAYMENT_METHOD_WORD } from "@/components/payment-method";
import { PhotoField } from "@/components/photo-field";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { namesIn } from "@/lib/names-in";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import { SupplierPaperButton } from "./purchase-paper";
import { REFUSALS } from "./supplier-fields";
import type { Invoice, Supplier, SupplierDetails } from "./supplier-forms";
import {
  SupplierPaymentSheet,
  SupplierSheet,
  VoidSupplierPaymentSheet,
} from "./supplier-forms";

const InvoiceCopy = ({ invoice }: { invoice: Invoice }) => {
  const { t } = useLanguage();
  const prefix = useId();
  const [viewing, setViewing] = useState(false);
  const [reason, setReason] = useState("");
  const refused = useRefused(REFUSALS);
  const photo = useQuery({
    ...orpc.suppliers.invoicePhoto.queryOptions({
      input: { invoiceId: invoice.id },
    }),
    enabled: viewing && !!invoice.photoKeptAt,
  });
  const keep = useMutation(
    orpc.suppliers.keepInvoicePhoto.mutationOptions({
      onSuccess: () => {
        toast.success(t("suppliers.copySaved"));
        setReason("");
      },
      onError: refused,
    })
  );
  return (
    <details className="mt-3 rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {t("suppliers.invoiceCopy")}
        {invoice.photoKeptAt ? ` · ${t("suppliers.copyKept")}` : ""}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {invoice.photoKeptAt ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setViewing((shown) => !shown)}
          >
            {t(viewing ? "suppliers.hideCopy" : "suppliers.viewCopy")}
          </Button>
        ) : null}
        {viewing ? (
          <Loaded query={photo}>
            {photo.data ? (
              <img
                src={`data:${photo.data.contentType};base64,${photo.data.data}`}
                alt={t("suppliers.invoiceCopy")}
                className="h-auto max-w-full rounded-lg"
              />
            ) : null}
          </Loaded>
        ) : null}
        <FormField id={`${prefix}-reason`} label={t("purchasing.reason")}>
          <Input
            id={`${prefix}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder={t("suppliers.copyReason")}
          />
        </FormField>
        <PhotoField
          id={`${prefix}-copy`}
          chosen={false}
          disabled={keep.isPending || reason.trim().length < 3}
          fromCamera={false}
          takeLabel="suppliers.attachCopy"
          onPhoto={(chosen) => {
            if (chosen) {
              keep.mutate({ invoiceId: invoice.id, photo: chosen, reason });
            }
          }}
        />
      </div>
    </details>
  );
};

export const SupplierInvoiceCard = ({
  invoice,
  owner,
  onPay,
  onVoid,
}: {
  invoice: Invoice;
  owner: boolean;
  onPay: () => void;
  onVoid: (payment: Invoice["payments"][number]) => void;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const overdue = invoice.owingMoney !== 0 && invoice.aging !== "current";
  const agingWords = {
    current: "suppliers.aging.current",
    "1_30": "suppliers.aging.1_30",
    "31_60": "suppliers.aging.31_60",
    "61_90": "suppliers.aging.61_90",
    over_90: "suppliers.aging.over_90",
  } as const;
  return (
    <article className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 font-semibold break-words">{invoice.number}</h3>
        <Badge variant={overdue ? "destructive" : "secondary"}>
          {invoice.owingMoney === 0
            ? t("suppliers.fullyPaid")
            : t(agingWords[invoice.aging])}
        </Badge>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("suppliers.invoiceDate")}: <SaidDate at={invoice.invoicedOn} /> ·{" "}
        {t("suppliers.dueOn")}: <SaidDate at={invoice.dueOn} />
      </p>
      <div className="mt-3">
        <SummaryFigures
          figures={[
            {
              label: t("suppliers.purchased"),
              value: asMoney(invoice.purchasedMoney),
            },
            { label: t("suppliers.paid"), value: asMoney(invoice.paidMoney) },
            { label: t("suppliers.owing"), value: asMoney(invoice.owingMoney) },
          ]}
        />
      </div>
      {owner && invoice.owingMoney > 0 ? (
        <Button className="mt-3" size="sm" onClick={onPay}>
          {t("suppliers.pay")}
        </Button>
      ) : null}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">
          {t("suppliers.deliveriesPayments")}
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          {invoice.deliveries.map((delivery) => (
            <div className="bg-muted/40 rounded-lg p-3" key={delivery.id}>
              <SaidDate at={delivery.receivedOn} />
              <p>
                {t("suppliers.purchased")}: {asMoney(delivery.priceMoney ?? 0)}{" "}
                · {t("suppliers.paidNow")}:{" "}
                {asMoney(delivery.paidAtDeliveryMoney ?? 0)}
              </p>
              {delivery.initialPayment ? (
                <div className="mt-2">
                  <SupplierPaperButton
                    supplierId={invoice.counterpartyId}
                    paymentId={delivery.id}
                  />
                </div>
              ) : null}
              <p className="text-muted-foreground text-xs break-all">
                {t("suppliers.deliveryReference")}: {delivery.id}
              </p>
            </div>
          ))}
          {invoice.payments.map((payment) => (
            <div className="rounded-lg border p-3" key={payment.id}>
              <p>
                <SaidDate at={payment.paidOn} /> ·{" "}
                {asMoney(payment.amountMoney)} ·{" "}
                {t(PAYMENT_METHOD_WORD[payment.paymentMethod])}
              </p>
              {payment.note ? <p className="mt-1">{payment.note}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <SupplierPaperButton
                  supplierId={invoice.counterpartyId}
                  paymentId={payment.id}
                />
                {owner ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onVoid(payment)}
                  >
                    {t("suppliers.voidPayment")}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </details>
      <InvoiceCopy invoice={invoice} />
    </article>
  );
};

const SupplierHistory = ({ details }: { details: SupplierDetails }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  return (
    <Section title={t("suppliers.history")}>
      <div className="flex flex-col gap-3">
        {details.purchases.length ? (
          details.purchases.map((row) => (
            <article className="rounded-lg border p-3 text-sm" key={row.id}>
              <p className="font-medium">
                {namesIn(row.feedItem, language).shown} · {row.quantity}{" "}
                {row.feedItem.unit}
              </p>
              <p>
                <SaidDate at={row.receivedOn} /> ·{" "}
                {asMoney(row.priceMoney ?? 0)}
              </p>
              <p className="text-muted-foreground">
                {row.supplierInvoiceId
                  ? t("suppliers.invoiceRecorded")
                  : t("suppliers.fullyPaid")}
              </p>
            </article>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("suppliers.noPurchases")}
          </p>
        )}
        {details.orders.length ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              {t("purchasing.title")}
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              {details.orders.map((order) => (
                <p className="rounded-lg border p-3 text-sm" key={order.id}>
                  {order.orderReference || order.id} ·{" "}
                  {t(`purchasing.state.${order.state}`)} ·{" "}
                  <SaidDate at={order.neededOn} />
                </p>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </Section>
  );
};

export const SuppliersTab = () => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const suppliers = useQuery(orpc.suppliers.list.queryOptions());
  const me = useQuery(orpc.people.me.queryOptions());
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [payment, setPayment] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice["payments"][number] | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const details = useQuery({
    ...orpc.suppliers.details.queryOptions({ input: { id: selectedId } }),
    enabled: !!selectedId,
  });
  const owner = me.data?.roles.includes("owner") ?? false;
  const rows = (suppliers.data ?? []).filter(
    (row) =>
      (filter === "all" ||
        (filter === "owing" ? row.owingMoney > 0 : !row.retiredAt)) &&
      `${row.name} ${row.phone ?? ""} ${row.contactPerson ?? ""}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase())
  );
  const total = { owing: 0, overdue: 0 };
  for (const row of suppliers.data ?? []) {
    total.owing += row.owingMoney;
    total.overdue += row.overdueMoney;
  }
  return (
    <div className="flex flex-col gap-6">
      <Section title={t("suppliers.title")} description={t("suppliers.hint")}>
        <div className="flex flex-col gap-4">
          <SummaryFigures
            figures={[
              { label: t("suppliers.owing"), value: asMoney(total.owing) },
              { label: t("suppliers.overdue"), value: asMoney(total.overdue) },
            ]}
          />
          <div className="flex flex-wrap items-end gap-3">
            <FormField id="supplier-search" label={t("suppliers.search")}>
              <Input
                id="supplier-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </FormField>
            <FormField id="supplier-filter" label={t("suppliers.show")}>
              <NativeSelect
                id="supplier-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="active">{t("suppliers.active")}</option>
                <option value="owing">{t("suppliers.withDues")}</option>
                <option value="all">{t("suppliers.all")}</option>
              </NativeSelect>
            </FormField>
            <Button onClick={() => setEditing("new")}>
              {t("suppliers.add")}
            </Button>
          </div>
          <Loaded query={suppliers}>
            <div className="grid gap-3 sm:grid-cols-2">
              {rows.map((row) => (
                <article className="rounded-xl border p-4" key={row.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 font-semibold break-words">
                      {row.name}
                    </h3>
                    {row.retiredAt ? (
                      <Badge variant="secondary">
                        {t("suppliers.retired")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {row.phone || row.contactPerson || "—"}
                  </p>
                  <p className="mt-2 text-sm">
                    {t("suppliers.owing")}: {asMoney(row.owingMoney)}
                    {row.overdueMoney > 0
                      ? ` · ${t("suppliers.overdue")}: ${asMoney(row.overdueMoney)}`
                      : ""}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {t("suppliers.creditDays")}: {row.creditDays} ·{" "}
                    {t("suppliers.purchaseCount", { count: row.purchaseCount })}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedId(row.id)}
                    >
                      {t("suppliers.view")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(row)}
                    >
                      {t("suppliers.edit")}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            {rows.length === 0 ? (
              <Notice title={t("suppliers.empty")} tone="info" />
            ) : null}
          </Loaded>
        </div>
      </Section>
      {selectedId ? (
        <Loaded query={details}>
          {details.data ? (
            <>
              <Section title={details.data.supplier.name}>
                <div className="flex flex-col gap-3">
                  <p className="text-muted-foreground text-sm">
                    {[
                      details.data.supplier.phone,
                      details.data.supplier.address,
                      details.data.supplier.contactPerson,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {details.data.supplier.note ? (
                    <p className="text-sm">{details.data.supplier.note}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <SupplierPaperButton supplierId={selectedId} />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedId("")}
                    >
                      {t("suppliers.closeDetails")}
                    </Button>
                  </div>
                </div>
              </Section>
              <Section title={t("suppliers.invoices")}>
                <div className="flex flex-col gap-3">
                  {details.data.invoices.map((invoice) => (
                    <SupplierInvoiceCard
                      key={invoice.id}
                      invoice={invoice}
                      owner={owner}
                      onPay={() => setPayment(invoice)}
                      onVoid={setVoiding}
                    />
                  ))}
                  {details.data.invoices.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {t("suppliers.noInvoices")}
                    </p>
                  ) : null}
                </div>
              </Section>
              <SupplierHistory details={details.data} />
            </>
          ) : null}
        </Loaded>
      ) : null}
      {editing ? (
        <SupplierSheet
          supplier={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          owner={owner}
        />
      ) : null}
      {payment ? (
        <SupplierPaymentSheet
          invoice={payment}
          onClose={() => setPayment(null)}
        />
      ) : null}
      {voiding ? (
        <VoidSupplierPaymentSheet
          payment={voiding}
          onClose={() => setVoiding(null)}
        />
      ) : null}
    </div>
  );
};
