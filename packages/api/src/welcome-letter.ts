import { and, eq, sql } from "@OpenFarm/db/operators";
import { auditEvent } from "@OpenFarm/db/schema/audit";
import { farmDayOf, letterheadOf, mobileNumberOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { audited } from "./audit";
import { assertRegistered, exportedPaper } from "./export-store";
import { producedAt } from "./paper-values";
import type { Owned } from "./portal-invitable";
import { refused } from "./portal-invitable";
import { farmToCall, theNoticeToRead } from "./portal-reads";
import { codeIsOpen } from "./portal-store";

// The Welcome Letter and its Code Slip (the glossary's entries). The Owner prints them from the code dialog while the
// code is on their screen: the farm keeps only its hash, so the code is set on the page there and never asked for here.
// What the farm lays out is everything round it — and each print is an Export that cannot hold the code, because the
// code never reaches it.

/** The paper a code goes out with: the Welcome Letter the first time, the Code Slip alone with every code after. */
export const CODE_PAPERS = ["welcome_letter", "code_slip"] as const;
export type CodePaper = (typeof CODE_PAPERS)[number];

/**
 * Which paper a code for this Investor goes out with: the Welcome Letter until they have been handed one, and the
 * Code Slip alone after. Read from the trail's Exports, so somebody invited before the letter existed, or whose first
 * code went out with nothing printed, is still handed the letter with their next.
 */
export const codePaperFor = async (
  db: Pick<Tx, "select">,
  farmId: string,
  investorId: string
): Promise<CodePaper> => {
  const [handed] = await db
    .select({ id: auditEvent.id })
    .from(auditEvent)
    .where(
      and(
        eq(auditEvent.farmId, farmId),
        eq(auditEvent.entity, "investor"),
        eq(auditEvent.entityId, investorId),
        eq(auditEvent.action, "export"),
        sql`${auditEvent.after}->>'paper' = 'welcome_letter'`
      )
    )
    .limit(1);
  return handed ? "code_slip" : "welcome_letter";
};

/**
 * Everything on a Welcome Letter or a Code Slip but the code and its last day: the letterhead, whom it is for and the
 * phone they sign in with, whom to call — the farm as the portal's account page shows it — the day it was handed
 * over, the stamp line, and on the letter the notice «আপনার তথ্য» for its back.
 */
export const handOver = async (
  context: Owned,
  investorId: string,
  paper: CodePaper
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
    columns: { codeHash: true, codeExpiresAt: true },
  });
  if (!(access && codeIsOpen(access, now))) {
    throw refused(
      "There is no code of theirs to hand over: give them one, and print it while it is on the screen",
      "no_code_to_hand_over"
    );
  }
  // The letter is handed over once; a lost or spoilt one means a new code, which goes out with the slip.
  if (
    paper === "welcome_letter" &&
    (await codePaperFor(context.db, farmId, investorId)) === "code_slip"
  ) {
    throw refused(
      "They have been handed their Welcome Letter already: print the slip for this code",
      "letter_handed_over"
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
    // A Bangla paper throughout, whatever the Owner reads the app in.
    produced: `${producedAt(now, "bn")} · ${context.actor.name}`,
    notice,
  };
};
