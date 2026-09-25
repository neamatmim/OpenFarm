import { farmDayOf, letterheadOf, mobileNumberOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { audited } from "./audit";
import { assertRegistered, exportedPaper } from "./export-store";
import { producedAt } from "./paper-values";
import type { Owned } from "./portal-invitable";
import { refused } from "./portal-invitable";
import { farmToCall, theNoticeToRead } from "./portal-reads";
import { languageOf } from "./reader-language";

// The Welcome Letter and its Code Slip (the glossary's entries). The Owner prints them from the code dialog while the
// code is on their screen: the farm keeps only its hash, so the code is set on the page there and never asked for here.
// What the farm lays out is everything round it — and each print is an Export that cannot hold the code, because the
// code never reaches it.

/** What goes out with a code: the Welcome Letter with a first invitation, the Code Slip alone with every code after. */
export const HANDED_OVER = ["welcome_letter", "code_slip"] as const;
export type HandedOver = (typeof HANDED_OVER)[number];

/**
 * Everything on a Welcome Letter or a Code Slip but the code and its last day: the letterhead, whom it is for and the
 * phone they sign in with, whom to call — the farm as the portal's account page shows it — the day it was handed
 * over, the stamp line, and on the letter the notice «আপনার তথ্য» for its back.
 */
export const handOver = async (
  context: Owned,
  investorId: string,
  paper: HandedOver
) => {
  const farmId = context.farm.id;
  const now = context.clock.now();
  const who = await context.db.query.investor.findFirst({
    where: { id: investorId, farmId },
    columns: { id: true, name: true, phone: true },
  });
  if (!who) {
    throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
  }
  assertRegistered(context.farm, paper);
  const access = await context.db.query.investorAccess.findFirst({
    where: { farmId, investorId },
    columns: { codeHash: true, codeExpiresAt: true, revokedAt: true },
  });
  const codeOpen =
    access?.codeHash &&
    !access.revokedAt &&
    access.codeExpiresAt &&
    access.codeExpiresAt > now;
  if (!codeOpen) {
    throw refused(
      "There is no code of theirs to hand over: give them one, and print it while it is on the screen",
      "no_code_to_hand_over"
    );
  }
  // The notice goes on the letter's back, whole or not at all: an Investor is never handed a blank in it.
  const toRead =
    paper === "welcome_letter"
      ? await theNoticeToRead(context.db, context.farm)
      : null;
  const notice = toRead?.notice ?? null;
  if (paper === "welcome_letter" && !notice) {
    throw refused(
      "The privacy notice on the letter's back still names a fact the farm has not written down",
      "notice_unwritten"
    );
  }
  await audited(context).write(
    {
      entity: "investor",
      entityId: investorId,
      action: "export",
      after: exportedPaper(context.farm, paper, { investorId }),
    },
    () => Promise.resolve()
  );
  return {
    letterhead: letterheadOf(context.farm),
    investor: { name: who.name, phone: mobileNumberOf(who.phone) ?? who.phone },
    farm: farmToCall(context.farm),
    issuedOn: farmDayOf(now),
    produced: `${producedAt(now, await languageOf(context.db, context.actor.id))} · ${context.actor.name}`,
    notice,
  };
};
