import { startOfFarmDay } from "@OpenFarm/domain";
import { currencySign, formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { HandCoins, Plus } from "lucide-react";
import { useState } from "react";

import { phoneLink } from "@/components/investors/phone-link";
import { useIsOwner } from "@/components/money";
import {
  ReceivablePaymentCorrection,
  WriteOffCorrection,
} from "@/components/money/receivable-corrections";
import type { PaymentFor } from "@/components/money/receivable-payment-sheet";
import { ReceivablePaymentSheet } from "@/components/money/receivable-payment-sheet";
import { WriteOffButton } from "@/components/money/receivable-write-off";
import {
  EmptyState,
  Loaded,
  RecordList,
  RecordRow,
  Section,
  StatTile,
  TagChip,
} from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

type Buyer = Awaited<ReturnType<typeof orpc.receivable.list.call>>[number];
type KindStanding = Buyer["kinds"][number];

/** A farm day as the reader reads it. */
const useDay = () => {
  const { language } = useLanguage();
  return (day: string) => formatDate(startOfFarmDay(day), language, "date");
};

/** One Sale or Dispatch he left owing on: the bull by her tag or the milk by its litres, what of it is still owed and
 *  what stays written off — and, for the Owner, the way to write off what will not be paid. */
const OwedRow = ({
  item,
  kind,
  mayWriteOff,
}: {
  item: KindStanding["items"][number];
  kind: KindStanding["kind"];
  mayWriteOff: boolean;
}) => {
  const { t } = useLanguage();
  const day = useDay();
  const what =
    item.tagNumber === null ? (
      t("receivable.litres", { litres: item.litres ?? 0 })
    ) : (
      <TagChip>{item.tagNumber}</TagChip>
    );
  return (
    <RecordRow
      meta={
        <>
          <span>{day(item.leftOn)}</span>
          {item.promisedBy === null ? null : (
            <span>
              {t("receivable.promised", { day: day(item.promisedBy) })}
            </span>
          )}
        </>
      }
      title={what}
      trailing={
        <span className="flex flex-col items-end gap-0.5">
          <span
            className={
              item.owingMoney > 0
                ? "text-warning text-sm font-medium tabular-nums"
                : "text-muted-foreground text-sm"
            }
          >
            {item.owingMoney > 0
              ? t("receivable.itemOwes", {
                  owing: item.owingMoney,
                  receivable: item.receivableMoney,
                })
              : t("receivable.itemPaidOff")}
          </span>
          {/* Missing from an answer a phone kept from before anything was written off. */}
          {(item.writtenOffMoney ?? 0) > 0 ? (
            <span className="text-danger text-xs tabular-nums">
              {t("receivable.writtenOff", { amount: item.writtenOffMoney })}
            </span>
          ) : null}
          {mayWriteOff && item.owingMoney > 0 ? (
            <WriteOffButton
              id={item.id}
              owingMoney={item.owingMoney}
              source={kind === "milk" ? "dispatch" : "sale"}
            />
          ) : null}
        </span>
      }
    />
  );
};

/** Each time the Owner wrote some of his Receivable off, as written, each to put right or take back — the Owner's alone.
 *  None in an answer the phone kept from before write-offs were listed one by one. */
const WriteOffLines = ({ standing }: { standing: KindStanding }) => {
  const { t } = useLanguage();
  const day = useDay();
  const written = standing.items.flatMap((item) => item.writeOffs ?? []);
  if (written.length === 0) {
    return null;
  }
  return (
    <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
      {written.map((one) => (
        <li
          className="flex flex-wrap items-center justify-between gap-2"
          key={one.id}
        >
          <span>
            {t("receivable.writeOffLine", {
              amount: one.amountMoney,
              day: day(one.writtenOn),
            })}
            {` — ${one.reason}`}
          </span>
          <WriteOffCorrection writeOff={one} />
        </li>
      ))}
    </ul>
  );
};

/** His Receivable of one kind: what he owes and since when, each thing he took, and each payment he made. */
const KindPart = ({
  standing,
  onPay,
  mayWriteOff,
}: {
  standing: KindStanding;
  onPay: () => void;
  mayWriteOff: boolean;
}) => {
  const { t } = useLanguage();
  const day = useDay();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">
            {t(
              standing.kind === "milk"
                ? "receivable.kind.milk"
                : "receivable.kind.cattle"
            )}
            {" · "}
            <span className="tabular-nums">
              {t("receivable.owed", { amount: standing.owingMoney })}
            </span>
          </span>
          <span className="text-muted-foreground text-xs">
            {[
              standing.oldestOn === null
                ? null
                : t("receivable.since", { day: day(standing.oldestOn) }),
              standing.soonestPromise === null
                ? null
                : t("receivable.promised", {
                    day: day(standing.soonestPromise),
                  }),
              standing.paidAheadMoney > 0
                ? t("receivable.paidAhead", { amount: standing.paidAheadMoney })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <Button onClick={onPay} size="sm" type="button" variant="outline">
          <Plus aria-hidden data-icon="inline-start" />
          {t("receivable.record")}
        </Button>
      </div>
      <RecordList>
        {standing.items.map((item) => (
          <OwedRow
            item={item}
            key={item.id}
            kind={standing.kind}
            mayWriteOff={mayWriteOff}
          />
        ))}
      </RecordList>
      {standing.payments.length > 0 ? (
        <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
          {standing.payments.map((payment) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2"
              key={payment.id}
            >
              <span>
                {t("receivable.paymentLine", {
                  amount: payment.amountMoney,
                  day: day(payment.paidOn),
                })}
                {payment.note ? ` — ${payment.note}` : null}
              </span>
              <ReceivablePaymentCorrection payment={payment} />
            </li>
          ))}
        </ul>
      ) : null}
      {mayWriteOff ? <WriteOffLines standing={standing} /> : null}
    </div>
  );
};

/** One buyer who owes the farm: his name and a number to ring, and his cattle and his milk apart. */
const BuyerCard = ({
  buyer,
  onPay,
  mayWriteOff,
}: {
  buyer: Buyer;
  onPay: (paying: PaymentFor) => void;
  mayWriteOff: boolean;
}) => {
  const { t } = useLanguage();
  return (
    <Section
      description={phoneLink(buyer.phone)}
      title={
        <span className="flex flex-wrap items-baseline gap-x-2">
          {buyer.name}
          {buyer.owingMoney > 0 ? (
            <span className="text-warning text-sm font-medium tabular-nums">
              {t("receivable.owed", { amount: buyer.owingMoney })}
            </span>
          ) : null}
          {(buyer.writtenOffMoney ?? 0) > 0 ? (
            <span className="text-danger text-sm font-medium tabular-nums">
              {t("receivable.writtenOff", { amount: buyer.writtenOffMoney })}
            </span>
          ) : null}
        </span>
      }
    >
      {buyer.kinds.map((standing) => (
        <KindPart
          key={standing.kind}
          mayWriteOff={mayWriteOff}
          onPay={() => onPay({ buyer: buyer.name, kind: standing.kind })}
          standing={standing}
        />
      ))}
    </Section>
  );
};

/**
 * Who owes the farm what: every buyer with Receivable, the one owed longest first — the one to ring today — with what he
 * took, what he has paid, and a payment one tap away.
 */
export const ReceivableTab = () => {
  const { t, language } = useLanguage();
  const list = useQuery(orpc.receivable.list.queryOptions());
  // Writing Receivable off is the Owner's alone.
  const mayWriteOff = useIsOwner();
  const [paying, setPaying] = useState<PaymentFor | null>(null);
  const buyers = list.data ?? [];
  const owing = buyers.reduce((sum, one) => sum + one.owingMoney, 0);
  const owingBuyers = buyers.filter((one) => one.owingMoney > 0).length;
  return (
    <Loaded query={list}>
      {buyers.length === 0 ? (
        <EmptyState
          description={t("receivable.nobodyHint")}
          icon={HandCoins}
          title={t("receivable.nobody")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <StatTile
            hint={t("receivable.owingTotalHint", { count: owingBuyers })}
            icon={HandCoins}
            label={t("receivable.owingTotal")}
            tone={owing > 0 ? "warning" : "neutral"}
            value={`${currencySign()}${formatNumber(owing, language)}`}
          />
          {buyers.map((buyer) => (
            <BuyerCard
              buyer={buyer}
              key={buyer.counterpartyId}
              mayWriteOff={mayWriteOff}
              onPay={setPaying}
            />
          ))}
        </div>
      )}
      <ReceivablePaymentSheet
        key={paying ? `${paying.buyer}:${paying.kind}` : "none"}
        onClose={() => setPaying(null)}
        paying={paying}
      />
    </Loaded>
  );
};
