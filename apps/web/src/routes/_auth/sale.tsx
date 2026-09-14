import type { PaymentMethod } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ReceiptText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CorrectionDialog,
  CorrectionField,
} from "@/components/correction-dialog";
import {
  EmptyState,
  Page,
  PageHeader,
  RecordList,
  RecordRow,
  Section,
  StickyAction,
  TagChip,
} from "@/components/page";
import type { PaperId } from "@/components/paper";
import { Paper } from "@/components/paper";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

const NOTHING_TYPED = {
  tagNumber: "",
  buyerName: "",
  buyerAddress: "",
  buyerPhone: "",
  priceBdt: "",
  weightKg: "",
  destination: "",
  vehicle: "",
  driver: "",
  note: "",
  paymentMethod: "cash" as PaymentMethod,
};

/** The day she is fit, when the farm refused the sale because she is still inside her days. */
const fitOnFrom = (error: unknown): string | null => {
  const data = (error as { data?: { refusal?: string; fitOn?: string } })?.data;
  return data?.refusal === "meat_withdrawal" ? (data.fitOn ?? null) : null;
};

/** The last buyer and lorry of the day, one button away. Nothing at all on a day the farm has
 *  sold nothing: yesterday's buyer is a different market. */
const LastBuyerOfTheDay = ({
  sale,
  onUse,
}: {
  sale: {
    buyerName: string;
    buyerAddress: string | null;
    buyerPhone: string | null;
    destination: string;
    vehicle: string;
    driver: string;
  } | null;
  onUse: (patch: Partial<typeof NOTHING_TYPED>) => void;
}) => {
  const { t } = useLanguage();
  if (!sale) {
    return null;
  }
  return (
    <Button
      onClick={() =>
        onUse({
          buyerName: sale.buyerName,
          buyerAddress: sale.buyerAddress ?? "",
          buyerPhone: sale.buyerPhone ?? "",
          destination: sale.destination,
          vehicle: sale.vehicle,
          driver: sale.driver,
        })
      }
      variant="outline"
    >
      {t("sale.again")}
    </Button>
  );
};

/**
 * The day's sales, and the two papers each buyer leaves with.
 *
 * Asked for one at a time rather than printed with every sale: at Eid the receipt is written once
 * the man has finished buying, and it covers everything he took that morning.
 */
/** The Manager puts a sale right: its price or its buyer, with the reason — the Owner sees it among what awaits
 *  approval. */
const SaleCorrection = ({
  sale,
}: {
  sale: { id: string; priceBdt: number; buyerName: string };
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [price, setPrice] = useState(String(sale.priceBdt));
  const [buyer, setBuyer] = useState(sale.buyerName);
  const correct = useMutation(orpc.sale.correct.mutationOptions({}));
  return (
    <CorrectionDialog
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: sale.id,
          reason,
          ...(Number(price) === sale.priceBdt
            ? {}
            : { priceBdt: Number(price) }),
          ...(buyer.trim() === sale.buyerName
            ? {}
            : { buyer: { name: buyer.trim() } }),
        });
        await queryClient.invalidateQueries({ queryKey: orpc.papers.key() });
      }}
      ready={Number(price) > 0 && buyer.trim() !== ""}
      title={t("correct.sale")}
    >
      <CorrectionField
        inputMode="numeric"
        label={t("sale.price")}
        onChange={setPrice}
        type="number"
        value={price}
      />
      <CorrectionField
        label={t("correct.buyer")}
        onChange={setBuyer}
        value={buyer}
      />
    </CorrectionDialog>
  );
};

const TodaysSales = () => {
  const { t, language } = useLanguage();
  const sold = useQuery(orpc.papers.day.queryOptions({ input: {} }));
  const me = useQuery(orpc.people.me.queryOptions());
  const isManager = me.data?.roles.includes("manager") ?? false;
  const isOwner = me.data?.roles.includes("owner") ?? false;
  const [paper, setPaper] = useState<{ id: PaperId; text: string } | null>(
    null
  );
  const onError = (error: Error) =>
    toast.error(
      (error as { data?: { refusal?: string } }).data?.refusal ===
        "farm_identity_incomplete"
        ? t("sale.missingRegistration")
        : (error.message ?? t("common.error"))
    );
  const receipt = useMutation(
    orpc.papers.receipt.mutationOptions({
      onSuccess: ({ text }) => setPaper({ id: "sale-receipt", text }),
      onError,
    })
  );
  const card = useMutation(
    orpc.papers.transportCard.mutationOptions({
      onSuccess: ({ text }) => setPaper({ id: "transport-card", text }),
      onError,
    })
  );

  if (!sold.data || sold.data.length === 0) {
    return (
      <Section title={t("sale.today")}>
        <EmptyState bare icon={ReceiptText} title={t("sale.noneToday")} />
      </Section>
    );
  }

  return (
    <Section description={t("sale.todayHint")} title={t("sale.today")}>
      <RecordList className="no-print">
        {sold.data.map((row) => (
          <RecordRow
            key={row.id}
            leading={<TagChip>{row.tagNumber}</TagChip>}
            meta={row.buyerName}
            title={t("intake.taka", {
              taka: formatNumber(row.priceBdt, language),
            })}
            trailing={
              <span className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => receipt.mutate({ saleId: row.id })}
                  size="sm"
                  variant="outline"
                >
                  {t("sale.receipt")}
                </Button>
                <Button
                  onClick={() => card.mutate({ saleId: row.id })}
                  size="sm"
                  variant="outline"
                >
                  {t("sale.transportCard")}
                </Button>
                {isManager || isOwner ? <SaleCorrection sale={row} /> : null}
              </span>
            }
          />
        ))}
      </RecordList>
      {paper ? <Paper id={paper.id} text={paper.text} /> : null}
    </Section>
  );
};

/**
 * Selling an animal, on Eid morning, on a phone.
 *
 * Only animals the Manager has already confirmed Ready appear in the list, and the last buyer
 * and lorry of the day are one button away — at Eid several beasts go to one man in one morning,
 * and asking for his name, his address, his lorry and his driver five times is how a farm ends up
 * with five spellings of one man.
 */
const SalePage = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState(NOTHING_TYPED);
  // A fattening beast is chosen from the list. A dairy cow going to a butcher — the cull the
  // Owner decided is a Sale — is never Ready for Sale, so she is named by her tag instead.
  const [byTag, setByTag] = useState(false);
  // Asked of the farm, not filtered here: the phone cannot see a withdrawal, and a beast
  // confirmed Ready last week and treated on Thursday would sit in this list looking sellable.
  const sellable = useQuery(orpc.sale.sellable.queryOptions());
  const last = useQuery(orpc.sale.lastToday.queryOptions());

  const ready = sellable.data ?? [];
  const edit = (patch: Partial<typeof fields>) =>
    setFields({ ...fields, ...patch });

  const record = useMutation(
    orpc.sale.record.mutationOptions({
      onSuccess: async ({ tagNumber }) => {
        toast.success(t("sale.done", { tag: tagNumber }));
        // The buyer and the lorry stay on the screen: the next beast is usually his too.
        setFields({ ...fields, tagNumber: "", weightKg: "", priceBdt: "" });
        await Promise.all(
          [orpc.papers.key(), orpc.ready.key()].map((key) =>
            queryClient.invalidateQueries({ queryKey: key })
          )
        );
      },
      onError: (error) => {
        const fitOn = fitOnFrom(error);
        toast.error(
          fitOn
            ? t("ready.underWithdrawal", {
                when: formatDate(new Date(fitOn), language, "date"),
              })
            : (error.message ?? t("common.error"))
        );
      },
    })
  );

  return (
    <Page width="narrow">
      <PageHeader
        actions={<LastBuyerOfTheDay onUse={edit} sale={last.data ?? null} />}
        description={t("sale.subtitle")}
        title={t("sale.title")}
      />

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          record.mutate({
            tagNumber: fields.tagNumber,
            buyer: {
              name: fields.buyerName,
              address: fields.buyerAddress || undefined,
              phone: fields.buyerPhone || undefined,
            },
            priceBdt: Number(fields.priceBdt),
            weightKg: Number(fields.weightKg),
            destination: fields.destination,
            vehicle: fields.vehicle,
            driver: fields.driver,
            note: fields.note || undefined,
            paymentMethod: fields.paymentMethod,
          });
        }}
      >
        <Section title={t("sale.groupAnimal")}>
          <div className="space-y-1">
            <Label htmlFor="sale-animal">{t("sale.animal")}</Label>
            {byTag || ready.length === 0 ? (
              <Input
                id="sale-animal"
                maxLength={32}
                onChange={(e) => edit({ tagNumber: e.target.value })}
                placeholder="F-0001"
                required
                value={fields.tagNumber}
              />
            ) : (
              <select
                className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
                id="sale-animal"
                onChange={(e) => edit({ tagNumber: e.target.value })}
                required
                value={fields.tagNumber}
              >
                <option value="">—</option>
                {ready.map((row) => (
                  <option key={row.id} value={row.tagNumber}>
                    {row.tagNumber} · {row.penName}
                  </option>
                ))}
              </select>
            )}
            {ready.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("sale.noneReady")}
              </p>
            ) : (
              <Button
                className="px-0"
                onClick={() => {
                  setByTag(!byTag);
                  edit({ tagNumber: "" });
                }}
                type="button"
                variant="link"
              >
                {t(byTag ? "sale.fromList" : "sale.otherAnimal")}
              </Button>
            )}
          </div>
        </Section>

        <Section title={t("sale.groupBuyer")}>
          <div className="space-y-1">
            <Label htmlFor="sale-buyer">{t("sale.buyerName")}</Label>
            <Input
              id="sale-buyer"
              maxLength={120}
              onChange={(e) => edit({ buyerName: e.target.value })}
              required
              value={fields.buyerName}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sale-address">{t("sale.buyerAddress")}</Label>
              <Input
                id="sale-address"
                maxLength={200}
                onChange={(e) => edit({ buyerAddress: e.target.value })}
                value={fields.buyerAddress}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sale-phone">{t("sale.buyerPhone")}</Label>
              <Input
                id="sale-phone"
                inputMode="tel"
                maxLength={20}
                onChange={(e) => edit({ buyerPhone: e.target.value })}
                value={fields.buyerPhone}
              />
            </div>
          </div>
        </Section>

        <Section title={t("sale.groupPrice")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sale-price">{t("sale.price")}</Label>
              <Input
                id="sale-price"
                inputMode="numeric"
                onChange={(e) => edit({ priceBdt: e.target.value })}
                required
                type="number"
                value={fields.priceBdt}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sale-weight">{t("sale.weight")}</Label>
              <Input
                id="sale-weight"
                inputMode="decimal"
                onChange={(e) => edit({ weightKg: e.target.value })}
                required
                step="0.1"
                type="number"
                value={fields.weightKg}
              />
            </div>
          </div>
          <PaymentMethodField
            id="sale-paid-by"
            onChange={(paymentMethod) => edit({ paymentMethod })}
            value={fields.paymentMethod}
          />
        </Section>

        <Section title={t("sale.groupTransport")}>
          <div className="space-y-1">
            <Label htmlFor="sale-destination">{t("sale.destination")}</Label>
            <Input
              id="sale-destination"
              maxLength={200}
              onChange={(e) => edit({ destination: e.target.value })}
              required
              value={fields.destination}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sale-vehicle">{t("sale.vehicle")}</Label>
              <Input
                id="sale-vehicle"
                maxLength={60}
                onChange={(e) => edit({ vehicle: e.target.value })}
                required
                value={fields.vehicle}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sale-driver">{t("sale.driver")}</Label>
              <Input
                id="sale-driver"
                maxLength={120}
                onChange={(e) => edit({ driver: e.target.value })}
                required
                value={fields.driver}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sale-note">{t("sale.note")}</Label>
            <Input
              id="sale-note"
              maxLength={300}
              onChange={(e) => edit({ note: e.target.value })}
              value={fields.note}
            />
            <p className="text-muted-foreground text-sm">{t("sale.noteWhy")}</p>
          </div>
        </Section>

        <StickyAction>
          <Button
            className="w-full sm:w-auto"
            disabled={record.isPending || ready.length === 0}
            size="lg"
            type="submit"
          >
            {t("sale.record")}
          </Button>
        </StickyAction>
      </form>

      <TodaysSales />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/sale")({
  beforeLoad: onlyFor("runsTheFarm"),
  component: SalePage,
});
