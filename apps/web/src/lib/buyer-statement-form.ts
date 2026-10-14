import type { MessageKey } from "@OpenFarm/i18n";

import type { Photo } from "./photo";

// A buyer's statement as the sheet types it, and what the farm is sent of it (ADR 0033). Here rather than in the sheet,
// because which box stops the save, and what is sent, are easier read — and tested — apart from the markup.

/** Every box of the statement sheet, as typed. */
export const STATEMENT_OPENS = {
  counterpartyId: "",
  number: "",
  fromDay: "",
  toDay: "",
  statedOn: "",
  payBy: "",
  liters: "",
  amount: "",
  fat: "",
  snf: "",
  rate: "",
  note: "",
};

export type StatementTyped = typeof STATEMENT_OPENS;

/** A figure typed into a box, or nothing when it is empty or no figure. */
const figureOf = (value: string): number | undefined => {
  if (value.trim() === "") {
    return undefined;
  }
  const figure = Number(value);
  return Number.isFinite(figure) ? figure : undefined;
};

/** What stops the statement being saved, and the box it is about. */
export const statementProblem = (
  form: StatementTyped
): { message: MessageKey; at: string } | null => {
  if (!form.counterpartyId) {
    return { message: "statement.missing.buyer", at: "statement-buyer" };
  }
  if (!form.fromDay) {
    return { message: "statement.missing.days", at: "statement-fromDay" };
  }
  if (!form.toDay || form.toDay < form.fromDay) {
    return { message: "statement.missing.days", at: "statement-toDay" };
  }
  if (!form.statedOn || form.statedOn < form.toDay) {
    return { message: "statement.missing.statedOn", at: "statement-statedOn" };
  }
  if (form.payBy && form.payBy < form.statedOn) {
    return { message: "statement.missing.payBy", at: "statement-payBy" };
  }
  const liters = figureOf(form.liters);
  if (liters === undefined || liters <= 0) {
    return { message: "statement.missing.liters", at: "statement-liters" };
  }
  const amount = figureOf(form.amount);
  if (amount === undefined || amount < 0) {
    return { message: "statement.missing.amount", at: "statement-amount" };
  }
  return null;
};

/** What the farm's milk is set beside as the statement is typed: once its buyer, days, liters and amount are there. */
export const besideAsked = (form: StatementTyped) => {
  const liters = figureOf(form.liters);
  const amountMoney = figureOf(form.amount);
  const daysInOrder =
    form.fromDay !== "" && form.toDay !== "" && form.fromDay <= form.toDay;
  if (
    !(form.counterpartyId && daysInOrder) ||
    liters === undefined ||
    liters <= 0 ||
    amountMoney === undefined ||
    amountMoney < 0
  ) {
    return null;
  }
  return {
    counterpartyId: form.counterpartyId,
    fromDay: form.fromDay,
    toDay: form.toDay,
    liters,
    amountMoney,
  };
};

/** Words typed into a box, or nothing when it was left empty. */
const wordsOf = (value: string): string | undefined =>
  value.trim() || undefined;

/** What the farm is sent: what was typed, under the phone's own id so a save sent twice is one statement. */
export const statementSent = (
  form: StatementTyped,
  id: string,
  photo: Photo | null
) => {
  const number = wordsOf(form.number);
  const payBy = wordsOf(form.payBy);
  const fatPercent = figureOf(form.fat);
  const snfPercent = figureOf(form.snf);
  const ratePerLiterMoney = figureOf(form.rate);
  const note = wordsOf(form.note);
  return {
    id,
    counterpartyId: form.counterpartyId,
    ...(number === undefined ? {} : { number }),
    fromDay: form.fromDay,
    toDay: form.toDay,
    statedOn: form.statedOn,
    ...(payBy === undefined ? {} : { payBy }),
    liters: Number(form.liters),
    amountMoney: Number(form.amount),
    ...(fatPercent === undefined ? {} : { fatPercent }),
    ...(snfPercent === undefined ? {} : { snfPercent }),
    ...(ratePerLiterMoney === undefined ? {} : { ratePerLiterMoney }),
    ...(note === undefined ? {} : { note }),
    ...(photo === null ? {} : { photo }),
  };
};
