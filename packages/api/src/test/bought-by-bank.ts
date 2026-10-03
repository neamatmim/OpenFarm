import type { RouterClient } from "@orpc/server";

import type { appRouter } from "../routers/index";

/**
 * How a test takes a Venture's bull in when she came home on no outing: the Owner's to take in, paid straight from
 * the Venture Account by bank, with its reference — never cash, which a Venture's bull at the gate is refused.
 */
export const PAID_FROM_THE_ACCOUNT = {
  paymentMethod: "bank",
  reference: "TRF ভেঞ্চারের হিসাব থেকে",
} as const;

/** A small stable number from a label, so each file's Investor has a phone of its own. */
const hashOf = (label: string) =>
  [...label].reduce(
    (sum, letter) => (sum * 31 + (letter.codePointAt(0) ?? 0)) % 99_999_989,
    7
  );

/**
 * Capital into a Venture still open — one Investor signing for every Unit and paying it all by bank — so that, once
 * buying starts, its Cattle Budget holds money a bull at the gate can be paid from.
 */
export const putCapitalIn = async (
  client: RouterClient<typeof appRouter>,
  venture: { id: string; units: number; unitPriceMoney: number },
  /** Tells this file's Investor, stamp and transfer apart from every other file's. */
  label: string,
  /** The day the paper was stamped and the money moved. */
  on: string
) => {
  const person = await client.investors.record({
    name: `বিনিয়োগকারী ${label}`,
    phone: `019${String(Math.abs(hashOf(label)))
      .padStart(8, "0")
      .slice(-8)}`,
  });
  const agreement = await client.ventures.agreements.sign({
    ventureId: venture.id,
    investorId: person.id,
    units: venture.units,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${label}`,
    stampValueMoney: 300,
    stampedOn: on,
    stampSerial: `AA ${label}`,
  });
  await client.ventures.agreements.keepPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await client.ventures.takeCapital({
    agreementId: agreement.id,
    amountMoney: venture.units * venture.unitPriceMoney,
    movedOn: on,
    paymentMethod: "bank",
    reference: `TRF ${label}`,
  });
};
