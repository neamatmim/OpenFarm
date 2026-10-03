import { roundMoney } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import { lastMonth } from "@/lib/months";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/**
 * Said when the month was read against a figure the farm has since changed its mind about: what she
 * decided then, she decided about something else, so the reading itself is what has to happen again.
 */
const WhatItWasReadAgainst = ({
  checked,
}: {
  // `stale` is absent from a fortnight-old cached answer, written before a month could go stale.
  checked: { expectedMoney: number; stale?: boolean } | null;
}) => {
  const { t, language } = useLanguage();
  return checked?.stale ? (
    <p className="text-warning text-sm">
      {t("ventures.checkedAgainst", {
        expected: formatNumber(checked.expectedMoney, language),
      })}
    </p>
  ) : null;
};

interface Named {
  id: string;
  name: string;
}

/** What the sheet says of a Venture Account's bank, or of one of the Farm's own accounts' statement. */
const wordsOf = (
  t: ReturnType<typeof useLanguage>["t"],
  venture: Named | null,
  farmAccount: Named | null
) =>
  venture
    ? {
        description: t("ventures.bankCheckHint", { venture: venture.name }),
        title: t("ventures.checkTheBank"),
        hint: t("ventures.readHint"),
      }
    : {
        description: t("farmAccounts.checkHint", {
          account: farmAccount?.name ?? "",
        }),
        title: t("farmAccounts.check"),
        hint: t("farmAccounts.readHint"),
      };

/**
 * What the farm thinks the account held at the month's end, and the act of writing down what the statement said — the
 * Venture's own procedures for a Venture Account, the Farm Account's for one of the Farm's.
 */
const useTheCheck = (
  venture: Named | null,
  farmAccount: Named | null,
  month: string,
  onDone: (checked: { differenceMoney: number }) => void
) => {
  const refused = useRefused();
  const aMonth = /^\d{4}-\d{2}$/u.test(month);
  const ventureExpected = useQuery({
    ...orpc.ventures.expectedAtMonthEnd.queryOptions({
      input: { ventureId: venture?.id ?? "", month },
    }),
    enabled: venture !== null && aMonth,
  });
  const accountExpected = useQuery({
    ...orpc.farmAccounts.expectedAtMonthEnd.queryOptions({
      input: { id: farmAccount?.id ?? "", month },
    }),
    enabled: farmAccount !== null && aMonth,
  });
  const checkingTheBank = useMutation(
    orpc.ventures.checkTheBank.mutationOptions({
      onError: refused,
      onSuccess: onDone,
    })
  );
  const checkingTheAccount = useMutation(
    orpc.farmAccounts.check.mutationOptions({
      onError: refused,
      onSuccess: onDone,
    })
  );
  const send = (said: { month: string; readMoney: number; note?: string }) => {
    if (venture) {
      checkingTheBank.mutate({ ventureId: venture.id, ...said });
      return;
    }
    if (farmAccount) {
      checkingTheAccount.mutate({ id: farmAccount.id, ...said });
    }
  };
  return {
    expected: (venture ? ventureExpected : accountExpected).data,
    send,
    pending: checkingTheBank.isPending || checkingTheAccount.isPending,
  };
};

/**
 * The month's bank check: what the statement said, against what the farm thinks the account held — a Venture
 * Account's, or one of the Farm's own mobile money numbers and bank accounts. A Farm Account's first reading has nothing to
 * be held against: the statement is what it held, and every month after starts from it.
 *
 * The difference is worked out as she types, because the point of the act is the difference — and a
 * month that disagrees is meant to stay disagreeing, with what she found out about it beside it.
 */
export const BankCheckSheet = ({
  venture = null,
  farmAccount = null,
  open,
  onOpenChange,
}: {
  venture?: Named | null;
  farmAccount?: Named | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const [month, setMonth] = useState(lastMonth);
  const [read, setRead] = useState("");
  const [note, setNote] = useState("");
  const which = venture ?? farmAccount;
  // This sheet worked it out first; the reason is now in `useFreshFor`, where the other nine read it.
  useFreshFor(which?.id, () => {
    setRead("");
    setNote("");
    setMonth(lastMonth());
  });
  const { expected, send, pending } = useTheCheck(
    venture,
    farmAccount,
    month,
    (checked) => {
      setRead("");
      setNote("");
      onOpenChange(false);
      toast.success(
        checked.differenceMoney === 0
          ? t("ventures.bankAgrees")
          : t("ventures.bankDiffers", {
              // Signed, because "five thousand apart" does not say which way.
              difference: formatNumber(checked.differenceMoney, language),
            })
      );
    }
  );
  // Nothing for a Farm Account never read before this month: the statement itself is the figure.
  const firstReading =
    expected !== undefined && expected.expectedMoney === null;
  const expectedMoney = expected?.expectedMoney ?? 0;
  const readMoney = Number(read);
  const typed = read !== "" && !Number.isNaN(readMoney);
  // Rounded the way the farm rounds, so what she reads here is what the farm will say.
  const differenceMoney =
    typed && !firstReading ? roundMoney(readMoney - expectedMoney) : 0;
  const already = expected?.checked ?? null;
  const ready = which !== null && typed;
  const words = wordsOf(t, venture, farmAccount);
  return (
    <FormSheet
      description={words.description}
      onOpenChange={onOpenChange}
      onSubmit={() => send({ month, readMoney, note: note || undefined })}
      open={open}
      pending={pending}
      ready={ready}
      submitLabel={words.title}
      title={words.title}
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
        {firstReading
          ? t("farmAccounts.firstReading")
          : t("ventures.farmThinks", {
              expected: formatNumber(expectedMoney, language),
            })}
      </p>
      {already ? (
        <p className="text-muted-foreground text-sm">
          {t("ventures.alreadyChecked", {
            read: formatNumber(already.readMoney, language),
          })}
          {already.note ? ` · ${already.note}` : ""}
        </p>
      ) : null}
      <WhatItWasReadAgainst checked={already} />
      <FormField
        hint={words.hint}
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
      {differenceMoney === 0 ? null : (
        <p className="text-sm font-medium tabular-nums">
          {t("ventures.difference", {
            difference: formatNumber(differenceMoney, language),
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
