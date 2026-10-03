import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { HandCoins, Plus } from "lucide-react";
import { useState } from "react";

import { phoneLink } from "@/components/investors/phone-link";
import { useIsOwner } from "@/components/money";
import {
  BakiPaymentCorrection,
  WriteOffCorrection,
} from "@/components/money/baki-corrections";
import type { PaymentFor } from "@/components/money/baki-payment-sheet";
import { BakiPaymentSheet } from "@/components/money/baki-payment-sheet";
import { WriteOffButton } from "@/components/money/baki-write-off";
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

type Buyer = Awaited<ReturnType<typeof orpc.baki.list.call>>[number];
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
      t("baki.litres", { litres: item.litres ?? 0 })
    ) : (
      <TagChip>{item.tagNumber}</TagChip>
    );
  return (
    <RecordRow
      meta={
        <>
          <span>{day(item.leftOn)}</span>
          {item.promisedBy === null ? null : (
            <span>{t("baki.promised", { day: day(item.promisedBy) })}</span>
          )}
        </>
      }
      title={what}
      trailing={
        <span className="flex flex-col items-end gap-0.5">
          <span
            className={
              item.owingBdt > 0
                ? "text-warning text-sm font-medium tabular-nums"
                : "text-muted-foreground text-sm"
            }
          >
            {item.owingBdt > 0
              ? t("baki.itemOwes", { owing: item.owingBdt, baki: item.bakiBdt })
              : t("baki.itemPaidOff")}
          </span>
          {/* Missing from an answer a phone kept from before anything was written off. */}
          {(item.writtenOffBdt ?? 0) > 0 ? (
            <span className="text-danger text-xs tabular-nums">
              {t("baki.writtenOff", { taka: item.writtenOffBdt })}
            </span>
          ) : null}
          {mayWriteOff && item.owingBdt > 0 ? (
            <WriteOffButton
              id={item.id}
              owingBdt={item.owingBdt}
              source={kind === "milk" ? "dispatch" : "sale"}
            />
          ) : null}
        </span>
      }
    />
  );
};

/** Each time the Owner wrote some of his Baki off, as written, each to put right or take back — the Owner's alone.
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
            {t("baki.writeOffLine", {
              taka: one.amountBdt,
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

/** His Baki of one kind: what he owes and since when, each thing he took, and each payment he made. */
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
              standing.kind === "milk" ? "baki.kind.milk" : "baki.kind.cattle"
            )}
            {" · "}
            <span className="tabular-nums">
              {t("baki.owed", { taka: standing.owingBdt })}
            </span>
          </span>
          <span className="text-muted-foreground text-xs">
            {[
              standing.oldestOn === null
                ? null
                : t("baki.since", { day: day(standing.oldestOn) }),
              standing.soonestPromise === null
                ? null
                : t("baki.promised", { day: day(standing.soonestPromise) }),
              standing.creditBdt > 0
                ? t("baki.credit", { taka: standing.creditBdt })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <Button onClick={onPay} size="sm" type="button" variant="outline">
          <Plus aria-hidden data-icon="inline-start" />
          {t("baki.record")}
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
                {t("baki.paymentLine", {
                  taka: payment.amountBdt,
                  day: day(payment.paidOn),
                })}
                {payment.note ? ` — ${payment.note}` : null}
              </span>
              <BakiPaymentCorrection payment={payment} />
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
          {buyer.owingBdt > 0 ? (
            <span className="text-warning text-sm font-medium tabular-nums">
              {t("baki.owed", { taka: buyer.owingBdt })}
            </span>
          ) : null}
          {(buyer.writtenOffBdt ?? 0) > 0 ? (
            <span className="text-danger text-sm font-medium tabular-nums">
              {t("baki.writtenOff", { taka: buyer.writtenOffBdt })}
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
 * Who owes the farm what: every buyer with Baki, the one owed longest first — the one to ring today — with what he
 * took, what he has paid, and a payment one tap away.
 */
export const BakiTab = () => {
  const { t, language } = useLanguage();
  const list = useQuery(orpc.baki.list.queryOptions());
  // Writing Baki off is the Owner's alone.
  const mayWriteOff = useIsOwner();
  const [paying, setPaying] = useState<PaymentFor | null>(null);
  const buyers = list.data ?? [];
  const owing = buyers.reduce((sum, one) => sum + one.owingBdt, 0);
  const owingBuyers = buyers.filter((one) => one.owingBdt > 0).length;
  return (
    <Loaded query={list}>
      {buyers.length === 0 ? (
        <EmptyState
          description={t("baki.nobodyHint")}
          icon={HandCoins}
          title={t("baki.nobody")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <StatTile
            hint={t("baki.owingTotalHint", { count: owingBuyers })}
            icon={HandCoins}
            label={t("baki.owingTotal")}
            tone={owing > 0 ? "warning" : "neutral"}
            value={`৳${formatNumber(owing, language)}`}
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
      <BakiPaymentSheet
        key={paying ? `${paying.buyer}:${paying.kind}` : "none"}
        onClose={() => setPaying(null)}
        paying={paying}
      />
    </Loaded>
  );
};
