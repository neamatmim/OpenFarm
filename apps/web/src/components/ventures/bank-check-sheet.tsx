import { roundTaka } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { lastMonth } from "@/lib/months";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/**
 * Said when the month was read against a figure the farm has since changed its mind about: what she
 * decided then, she decided about something else, so the reading itself is what has to happen again.
 */
const WhatItWasReadAgainst = ({
  checked,
}: {
  // `stale` is absent from a fortnight-old cached answer, written before a month could go stale.
  checked: { expectedBdt: number; stale?: boolean } | null;
}) => {
  const { t, language } = useLanguage();
  return checked?.stale ? (
    <p className="text-sm text-amber-700 dark:text-amber-500">
      {t("ventures.checkedAgainst", {
        expected: formatNumber(checked.expectedBdt, language),
      })}
    </p>
  ) : null;
};

/**
 * The month's bank check: what the statement said, against what the farm thinks the account held.
 *
 * The difference is worked out as she types, because the point of the act is the difference — and a
 * month that disagrees is meant to stay disagreeing, with what she found out about it beside it.
 */
export const BankCheckSheet = ({
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
  const [read, setRead] = useState("");
  const [note, setNote] = useState("");
  // A sheet opened on another Venture starts clean: the last statement figure typed is not this
  // account's, and leaving it in the box is how a wrong figure gets recorded.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  if (venture && venture.id !== openedOn) {
    setOpenedOn(venture.id);
    setRead("");
    setNote("");
    setMonth(lastMonth());
  }
  const expected = useQuery({
    ...orpc.ventures.expectedAtMonthEnd.queryOptions({
      input: { ventureId: venture?.id ?? "", month },
    }),
    enabled: venture !== null && /^\d{4}-\d{2}$/u.test(month),
  });
  const checking = useMutation(
    orpc.ventures.checkTheBank.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async (done) => {
        setRead("");
        setNote("");
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.ventures.key() });
        toast.success(
          done.differenceBdt === 0
            ? t("ventures.bankAgrees")
            : t("ventures.bankDiffers", {
                // Signed, because "five thousand apart" does not say which way.
                difference: formatNumber(done.differenceBdt, language),
              })
        );
      },
    })
  );
  const expectedBdt = expected.data?.expectedBdt ?? 0;
  const readBdt = Number(read);
  // Rounded the way the farm rounds, so what she reads here is what the farm will say.
  const differenceBdt =
    read === "" || Number.isNaN(readBdt) ? 0 : roundTaka(readBdt - expectedBdt);
  const already = expected.data?.checked ?? null;
  const ready = venture !== null && read !== "" && !Number.isNaN(readBdt);
  return (
    <FormSheet
      description={t("ventures.bankCheckHint", {
        venture: venture?.name ?? "",
      })}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        checking.mutate({
          ventureId: venture?.id ?? "",
          month,
          readBdt,
          note: note || undefined,
        })
      }
      open={open}
      pending={checking.isPending}
      ready={ready}
      submitLabel={t("ventures.checkTheBank")}
      title={t("ventures.checkTheBank")}
    >
      <FormField id="check-month" label={t("ventures.whichMonth")}>
        <Input
          id="check-month"
          onChange={(event) => setMonth(event.target.value)}
          type="month"
          value={month}
        />
      </FormField>
      <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm tabular-nums">
        {t("ventures.farmThinks", {
          expected: formatNumber(expectedBdt, language),
        })}
      </p>
      {already ? (
        <p className="text-muted-foreground text-sm">
          {t("ventures.alreadyChecked", {
            read: formatNumber(already.readBdt, language),
          })}
          {already.note ? ` · ${already.note}` : ""}
        </p>
      ) : null}
      <WhatItWasReadAgainst checked={already} />
      <FormField
        hint={t("ventures.readHint")}
        id="check-read"
        label={t("ventures.whatTheStatementSaid")}
      >
        <Input
          id="check-read"
          inputMode="numeric"
          onChange={(event) => setRead(event.target.value)}
          type="number"
          value={read}
        />
      </FormField>
      {differenceBdt === 0 ? null : (
        <p className="text-sm font-medium tabular-nums">
          {t("ventures.difference", {
            difference: formatNumber(differenceBdt, language),
          })}
        </p>
      )}
      <FormField
        hint={t("ventures.whatYouFoundOutHint")}
        id="check-note"
        label={t("ventures.whatYouFoundOut")}
      >
        <Textarea
          id="check-note"
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          value={note}
        />
      </FormField>
    </FormSheet>
  );
};
