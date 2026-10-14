import type { MonthlyPaymentAllocation } from "@OpenFarm/domain";
import { dueByMonthEndOf, monthlyPaymentAllocationOf } from "@OpenFarm/domain";

import { paperOnFile } from "@/lib/agreed-in-app";

/** One paper of a Venture paid by the month, as its Investors tab lists it: what the grid needs of it. */
export interface GridPaper {
  id: string;
  investorId: string;
  /** What it may still take; missing from an answer cached before it was sent, and worked out from its allocation. */
  capitalLeftMoney?: number;
  paymentAllocation?: MonthlyPaymentAllocation | null;
  hasPaper: boolean;
  paperOnFile?: boolean;
  isFarm?: boolean;
}

/** One line of the month's capital grid: one paper, as the Owner fills it from the bank's statement. */
export interface GridLine {
  agreementId: string;
  investorId: string;
  /** Whether the statement shows this paper's money: only lines ticked are written. */
  came: boolean;
  /** What came, as typed; filled with what the paper is asked for by the month's end. */
  amountMoney: string;
  movedOn: string;
  reference: string;
  /** What the paper may still take: the most a line may say. */
  roomMoney: number;
  allocation: MonthlyPaymentAllocation;
  /** The Investor's waiting Pay-in Note the line was filled from: answered received when the line is written. */
  payInNoteId?: string;
}

/** An Investor's Pay-in Note, as the Venture's notes list gives it: what the grid fills a line from. */
export interface GridNote {
  id: string;
  agreementId: string;
  amountMoney: number;
  sentOn: string;
  reference: string;
  state: string;
}

/**
 * The month's grid, one line a paper that may take capital now: an Investor's paper on file with money still to come,
 * paid by the month. Each line starts filled with what that paper is asked for by the month's end — or, where its
 * Investor has said he sent money and the note still waits, with what the note says, so writing the line answers the
 * note and the same money is not taken from it again. None is ticked: the Owner ticks the ones the statement shows. The
 * Farm's own Units are recorded on the capital sheet, which names the Farm Account they left, and are not in the grid.
 */
export const linesOfTheMonth = (
  papers: readonly GridPaper[],
  today: string,
  notes: readonly GridNote[] = []
): GridLine[] =>
  papers.flatMap((one) => {
    const allocation = one.paymentAllocation;
    // An answer cached before what a paper may still take was sent works it out as the Investors tab does: what its
    // Units are for, less what has come in against it.
    const roomMoney = one.capitalLeftMoney ?? allocation?.owedMoney ?? 0;
    if (
      !allocation ||
      one.isFarm === true ||
      !paperOnFile(one) ||
      roomMoney <= 0
    ) {
      return [];
    }
    // The latest note still waiting on this paper, the list being the latest first.
    const told = notes.find(
      (note) => note.agreementId === one.id && note.state === "waiting"
    );
    const asked = Math.min(dueByMonthEndOf(allocation, today), roomMoney);
    const askedSaid = asked > 0 ? String(asked) : "";
    return [
      {
        agreementId: one.id,
        investorId: one.investorId,
        came: false,
        amountMoney: told ? String(told.amountMoney) : askedSaid,
        movedOn: told?.sentOn ?? "",
        reference: told?.reference ?? "",
        roomMoney,
        allocation,
        ...(told ? { payInNoteId: told.id } : {}),
      },
    ];
  });

/** A ticked line the farm could take: some money, no more than its paper may still take, a day and a reference. */
export const lineIsReady = (line: GridLine): boolean => {
  const amount = Number(line.amountMoney);
  return (
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= line.roomMoney &&
    line.movedOn !== "" &&
    line.reference.trim() !== ""
  );
};

/** What the grid sends: its ticked lines, in their order, which is the order a refusal counts its line in. */
export const receiptsOf = (lines: readonly GridLine[]) =>
  lines
    .filter((one) => one.came)
    .map((one) => ({
      agreementId: one.agreementId,
      amountMoney: Number(one.amountMoney),
      movedOn: one.movedOn,
      reference: one.reference,
      ...(one.payInNoteId ? { payInNoteId: one.payInNoteId } : {}),
    }));

/** Whether the grid may be sent: something ticked, and every ticked line ready. */
export const gridIsReady = (lines: readonly GridLine[]): boolean => {
  const ticked = lines.filter((one) => one.came);
  return ticked.length > 0 && ticked.every(lineIsReady);
};

/**
 * Which of the lines sent a refusal names, from the line the farm counted from one: the index among the lines sent, or
 * nothing for a refusal of the whole.
 */
export const refusedLineOf = (error: unknown): number | null => {
  const row = (error as { data?: { row?: unknown } } | null)?.data?.row;
  return typeof row === "number" && Number.isInteger(row) && row > 0
    ? row - 1
    : null;
};

/** A preview uses the ledger's allocation; server checks still run behind the Farm lock. */
export const proposedAllocation = (
  allocation: MonthlyPaymentAllocation | null | undefined,
  amount: number,
  today: string
) => {
  if (
    !allocation ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > allocation.owedMoney
  ) {
    return null;
  }
  return monthlyPaymentAllocationOf({
    units: 1,
    unitPriceMoney: allocation.totalMoney,
    monthly: {
      cattlePartMoney: allocation.cattleRequiredMoney,
      sums: allocation.sums.map((one) => ({
        dueOn: one.dueOn,
        amount: one.amountMoney,
      })),
    },
    paidMoney: allocation.paidMoney + amount,
    today,
  });
};

/** One share of an approved Settlement, as the payout sheet needs it. */
export interface PayoutShare {
  agreementId: string;
  name: string;
  payoutMoney: number;
  paid: boolean;
}

/** One line of the payout sheet: a share still to send, with the transfer it goes on. */
export interface PayoutLine {
  agreementId: string;
  name: string;
  amountMoney: number;
  reference: string;
  /** The Farm's own Units' payout comes home to one of the Farm's own bank accounts. */
  farmsOwn: boolean;
  farmAccountId: string;
}

/** Every share still to send, as the sheet lists it: something owed and not yet gone. */
export const payoutLinesOf = (
  shares: readonly PayoutShare[],
  farmsOwn: ReadonlySet<string>
): PayoutLine[] =>
  shares
    .filter((one) => !one.paid && one.payoutMoney > 0)
    .map((one) => ({
      agreementId: one.agreementId,
      name: one.name,
      amountMoney: one.payoutMoney,
      reference: "",
      farmsOwn: farmsOwn.has(one.agreementId),
      farmAccountId: "",
    }));

/** What the payout sheet sends: every line, each with its transfer and, for the Farm's own, the account it came to. */
export const payoutsOf = (lines: readonly PayoutLine[]) =>
  lines.map((one) => ({
    agreementId: one.agreementId,
    amountMoney: one.amountMoney,
    reference: one.reference,
    ...(one.farmsOwn && one.farmAccountId
      ? { farmAccountId: one.farmAccountId }
      : {}),
  }));
