import { payInCodeIn } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useInvestorNames } from "@/components/investors/investor-names";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { FarmAccountField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { paperOnFile } from "@/lib/agreed-in-app";
import { useFreshFor } from "@/lib/fresh-for";
import { useMoney } from "@/lib/money";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

interface Arrival {
  agreementId: string;
  amountMoney: string;
  movedOn: string;
  reference: string;
  /** The Farm's own bank account its own capital left from, where the paper is the Farm's own Units. */
  farmAccountId: string;
}

const NOTHING_YET: Arrival = {
  agreementId: "",
  amountMoney: "",
  movedOn: "",
  reference: "",
  farmAccountId: "",
};

/** Why a paper takes no capital now, as its option says it — paid up, or not yet papered — or nothing. */
const whyNotThisPaper = (
  one: {
    capitalLeftMoney: number;
    hasPaper: boolean;
    paperOnFile?: boolean;
  },
  t: (key: MessageKey) => string
): string | undefined => {
  if (one.capitalLeftMoney === 0) {
    return t("ventures.paidInFull");
  }
  return paperOnFile(one) ? undefined : t("ventures.noPaperYet");
};

/** The Farm's own bank account its capital left from, where the paper is the Farm's own Units and one was chosen. */
const farmsAccountOf = (
  paper: { isFarm?: boolean } | undefined,
  farmAccountId: string
) => (paper?.isFarm && farmAccountId ? { farmAccountId } : {});

/** The Farm's own capital leaves the Farm's own books: from which of its bank accounts. Nothing for anybody else's. */
const FarmsOwnAccount = ({
  paper,
  value,
  onChange,
}: {
  paper: { isFarm?: boolean } | undefined;
  value: string;
  onChange: (farmAccountId: string) => void;
}) =>
  paper?.isFarm ? (
    <FarmAccountField
      id="capital-farm-account"
      kind="bank"
      onChange={onChange}
      value={value}
    />
  ) : null;

/**
 * What the choice of paper says under it. Whose Pay-in Code the reference carries, and — when that is not the paper
 * chosen, because it may take nothing or the Owner chose another by hand — that the two disagree; with no code in the
 * reference, what the chosen paper may still take.
 */
const whatTheChoiceSays = ({
  carried,
  chosenId,
  whyNotCarried,
  chosen,
  t,
}: {
  carried: { code: string; name: string; id: string } | undefined;
  chosenId: string;
  whyNotCarried: string | undefined;
  /** The chosen paper's Units and what it may still take, said already. */
  chosen: string | undefined;
  t: ReturnType<typeof useLanguage>["t"];
}): string => {
  if (carried === undefined) {
    return chosen ?? t("ventures.whosePaperHint");
  }
  const named = { code: carried.code, name: carried.name };
  if (whyNotCarried !== undefined) {
    return t("ventures.codeButNotThisPaper", { ...named, why: whyNotCarried });
  }
  return carried.id === chosenId
    ? t("ventures.pickedByCode", named)
    : t("ventures.codeNotChosen", named);
};

/**
 * Capital as it lands: which paper it came against, how much, the day the bank moved it, and the
 * reference on the transfer, check or deposit slip.
 *
 * Each paper is listed with its Pay-in Code, and a reference that carries one chooses that paper: the Owner types
 * what the bank printed, and the farm says whose money it is. The reference is kept exactly as typed — the code
 * inside it only chooses.
 *
 * There is no way to say "cash" here, because there is no way to take it: the sheet says bank because
 * the farm only takes bank.
 */
export const TakeCapitalSheet = ({
  venture,
  agreementId = null,
  fromNote = null,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  /** Opened from one Investor's row: his paper, chosen already. */
  agreementId?: string | null;
  /** Opened from an Investor's Pay-in Note (ADR 0018): what it says, filled in for the Owner to check against the
   *  statement, and the note answered received once the capital is recorded. */
  fromNote?: {
    id: string;
    investor: string;
    agreementId: string;
    amountMoney: number;
    sentOn: string;
    reference: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [arrival, setArrival] = useState<Arrival>(NOTHING_YET);
  /** What the sheet starts from: what a note says, or his paper alone, or nothing. */
  const startingFrom = (): Arrival =>
    fromNote
      ? {
          agreementId: fromNote.agreementId,
          amountMoney: String(fromNote.amountMoney),
          movedOn: fromNote.sentOn,
          reference: fromNote.reference,
          farmAccountId: "",
        }
      : { ...NOTHING_YET, agreementId: agreementId ?? "" };
  // A new subject is another Venture, another man's paper or another note: what was typed for one is not the other's.
  useFreshFor(
    venture
      ? `${venture.id}:${agreementId ?? ""}:${fromNote?.id ?? ""}`
      : undefined,
    () => setArrival(startingFrom())
  );
  const agreements = useQuery({
    ...orpc.ventures.agreements.list.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const nameOf = useInvestorNames();
  const asMoney = useMoney();
  const taking = useMutation(
    orpc.ventures.takeCapital.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setArrival(startingFrom());
        onOpenChange(false);
        toast.success(t("ventures.capitalTaken"));
      },
    })
  );
  const papers = agreements.data ?? [];
  /** The paper whose Pay-in Code the reference carries. A list drawn from an answer cached before the codes has none. */
  const carriedBy = (reference: string) => {
    const code = payInCodeIn(
      reference,
      papers.map((one) => one.payInCode ?? "").filter((one) => one !== "")
    );
    return code === undefined
      ? undefined
      : papers.find((one) => one.payInCode === code);
  };
  const carried = carriedBy(arrival.reference);
  const paper = papers.find((one) => one.id === arrival.agreementId);
  const whyNotCarried = carried ? whyNotThisPaper(carried, t) : undefined;
  /** What the choice says under it: whose code the reference carries, or what the chosen paper may still take. */
  const said = whatTheChoiceSays({
    carried: carried && {
      code: carried.payInCode,
      name: nameOf(carried.investorId),
      id: carried.id,
    },
    chosenId: arrival.agreementId,
    whyNotCarried,
    chosen:
      paper &&
      `${t("ventures.holdsUnits", {
        units: formatNumber(paper.units, language),
      })} · ${t("ventures.capitalLeft", { amount: asMoney(paper.capitalLeftMoney) })}`,
    t,
  });
  const amount = Number(arrival.amountMoney);
  const ready =
    arrival.agreementId !== "" &&
    amount > 0 &&
    arrival.movedOn !== "" &&
    arrival.reference.trim() !== "";
  return (
    <FormSheet
      wide
      description={t("ventures.capitalHint", { venture: venture?.name ?? "" })}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        taking.mutate({
          agreementId: arrival.agreementId,
          amountMoney: amount,
          movedOn: arrival.movedOn,
          paymentMethod: "bank",
          reference: arrival.reference,
          ...(fromNote ? { payInNoteId: fromNote.id } : {}),
          ...farmsAccountOf(paper, arrival.farmAccountId),
        })
      }
      open={open}
      pending={taking.isPending}
      ready={ready}
      submitLabel={t("ventures.takeCapital")}
      title={t("ventures.takeCapital")}
    >
      {fromNote ? (
        <p className="bg-muted/50 rounded-lg p-3 text-sm">
          {t("ventures.payIn.fromNote", { investor: fromNote.investor })}
        </p>
      ) : null}
      <FormField
        hint={t("ventures.referenceHint")}
        id="capital-reference"
        label={t("ventures.reference")}
      >
        <Input
          autoComplete="off"
          id="capital-reference"
          onChange={(event) => {
            const typed = event.target.value;
            // Chosen as it is typed rather than whenever it reads so, so a paper the Owner then chooses by hand stays
            // chosen. A paper that may take nothing is named in the hint, and not chosen.
            const by = carriedBy(typed);
            const chosen =
              by && whyNotThisPaper(by, t) === undefined
                ? by.id
                : arrival.agreementId;
            setArrival({ ...arrival, reference: typed, agreementId: chosen });
          }}
          value={arrival.reference}
        />
      </FormField>
      <FormField
        hint={said}
        id="capital-agreement"
        label={t("ventures.whosePaper")}
      >
        <NativeSelect
          id="capital-agreement"
          onChange={(event) =>
            setArrival({ ...arrival, agreementId: event.target.value })
          }
          value={arrival.agreementId}
        >
          <option value="">—</option>
          {papers.map((one) => {
            // Paid up, or not yet papered: either way the farm would refuse capital on it, so it is not chosen.
            const why = whyNotThisPaper(one, t);
            const label = [nameOf(one.investorId), one.payInCode, why]
              .filter(Boolean)
              .join(" · ");
            return (
              <option disabled={why !== undefined} key={one.id} value={one.id}>
                {label}
              </option>
            );
          })}
        </NativeSelect>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="capital-amount" label={t("ventures.amount")}>
          <Input
            id="capital-amount"
            inputMode="numeric"
            onChange={(event) =>
              setArrival({ ...arrival, amountMoney: event.target.value })
            }
            type="number"
            value={arrival.amountMoney}
          />
        </FormField>
        <FormField id="capital-moved-on" label={t("ventures.movedOn")}>
          <Input
            id="capital-moved-on"
            onChange={(event) =>
              setArrival({ ...arrival, movedOn: event.target.value })
            }
            type="date"
            value={arrival.movedOn}
          />
        </FormField>
      </div>
      <FarmsOwnAccount
        onChange={(farmAccountId) => setArrival({ ...arrival, farmAccountId })}
        paper={paper}
        value={arrival.farmAccountId}
      />
    </FormSheet>
  );
};
