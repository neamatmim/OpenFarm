import type { Language, MessageKey } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { lastMonth } from "@/lib/months";
import { sayWhy } from "@/lib/saying";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

/** What a line is called in the reader's own language. */
const nameOf = (
  line: { nameBn: string; nameEn: string | null },
  language: Language
) => (language === "en" ? (line.nameEn ?? line.nameBn) : line.nameBn);

const Line = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex justify-between gap-2">
    <span className="text-muted-foreground">{label}</span>
    <span className="tabular-nums">{children}</span>
  </div>
);

/** What a total was made of, each thing under the total it belongs to. */
interface Named {
  id: string;
  bdt: number;
  nameBn: string;
  nameEn: string | null;
}

const MadeOf = ({
  lines,
  language,
}: {
  lines: readonly Named[];
  language: Language;
}) => {
  const taka = useTaka();
  return (
    <>
      {lines.map((one) => (
        <Line key={one.id} label={`· ${nameOf(one, language)}`}>
          {taka(one.bdt)}
        </Line>
      ))}
    </>
  );
};

/** A month nobody has asked about yet: every figure nothing, every list empty. */
const NOTHING_YET = {
  feedBdt: 0,
  medicineBdt: 0,
  vetBdt: 0,
  herdBdt: 0,
  tripsBdt: 0,
  totalBdt: 0,
  madeOf: {
    feed: [] as readonly Named[],
    medicine: [] as readonly Named[],
    herd: [] as readonly Named[],
    trips: [] as readonly Named[],
  },
};

/** The month's figure and its parts, each total with the things that made it under it. */
const WhatItIsMadeOf = ({
  consumed,
  language,
}: {
  consumed:
    | {
        feedBdt: number;
        medicineBdt: number;
        vetBdt: number;
        herdBdt: number;
        tripsBdt: number;
        totalBdt: number;
        madeOf: {
          feed: readonly Named[];
          medicine: readonly Named[];
          herd: readonly Named[];
          trips: readonly Named[];
        };
      }
    | undefined;
  language: Language;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  // Defaulted once rather than at every figure: the month is either answered or it is not, and ten
  // separate fallbacks only made the same statement ten times.
  const said = consumed ?? NOTHING_YET;
  // One head and the things that made it, five times over. The Vet's fee names nobody — a visit is
  // charged to the animals it named, and the visit is the thing.
  const heads: { label: MessageKey; bdt: number; lines: readonly Named[] }[] = [
    { label: "ventures.feed", bdt: said.feedBdt, lines: said.madeOf.feed },
    {
      label: "ventures.medicine",
      bdt: said.medicineBdt,
      lines: said.madeOf.medicine,
    },
    { label: "ventures.vet", bdt: said.vetBdt, lines: [] },
    {
      label: "ventures.herdCosts",
      bdt: said.herdBdt,
      lines: said.madeOf.herd,
    },
    {
      label: "ventures.sellingTrips",
      bdt: said.tripsBdt,
      lines: said.madeOf.trips,
    },
  ];
  return (
    <div className="bg-muted flex flex-col gap-1 rounded-md px-3 py-2 text-sm">
      {heads.map((head) => (
        <Fragment key={head.label}>
          <Line label={t(head.label)}>{taka(head.bdt)}</Line>
          <MadeOf language={language} lines={head.lines} />
        </Fragment>
      ))}
      <div className="mt-1 border-t pt-1 font-medium">
        <Line label={t("ventures.thatMonth")}>{taka(said.totalBdt)}</Line>
      </div>
    </div>
  );
};

/**
 * The month's Reimbursement: what a Venture's Animals consumed of what the Farm bought.
 *
 * The figure and its parts are shown before anything moves, because the Owner will be asked what it was
 * made of by somebody whose money it is, and "the system worked it out" is not an answer.
 */
export const ReimburseSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(lastMonth);
  const [movedOn, setMovedOn] = useState("");
  const [reference, setReference] = useState("");
  const consumed = useQuery({
    ...orpc.ventures.consumption.queryOptions({
      input: { ventureId: venture?.id ?? "", month },
    }),
    enabled: venture !== null && /^\d{4}-\d{2}$/u.test(month),
  });
  const reimbursing = useMutation(
    orpc.ventures.reimburse.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async () => {
        setMovedOn("");
        setReference("");
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.ventures.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.money.key() });
        toast.success(t("ventures.reimbursed"));
      },
    })
  );
  const total = consumed.data?.totalBdt ?? 0;
  const ready =
    venture !== null && total > 0 && movedOn !== "" && reference.trim() !== "";
  return (
    <FormSheet
      description={t("ventures.reimburseHint", {
        venture: venture?.name ?? "",
      })}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        reimbursing.mutate({
          ventureId: venture?.id ?? "",
          month,
          movedOn,
          paymentMethod: "bank",
          reference,
          amountBdt: total,
        })
      }
      open={open}
      pending={reimbursing.isPending}
      ready={ready}
      submitLabel={t("ventures.reimburse")}
      title={t("ventures.reimburse")}
    >
      <FormField id="reimburse-month" label={t("ventures.whichMonth")}>
        <Input
          id="reimburse-month"
          onChange={(event) => setMonth(event.target.value)}
          type="month"
          value={month}
        />
      </FormField>
      <WhatItIsMadeOf consumed={consumed.data} language={language} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="reimburse-moved-on" label={t("ventures.movedOn")}>
          <Input
            id="reimburse-moved-on"
            onChange={(event) => setMovedOn(event.target.value)}
            type="date"
            value={movedOn}
          />
        </FormField>
        <FormField id="reimburse-reference" label={t("ventures.reference")}>
          <Input
            autoComplete="off"
            id="reimburse-reference"
            onChange={(event) => setReference(event.target.value)}
            value={reference}
          />
        </FormField>
      </div>
    </FormSheet>
  );
};
