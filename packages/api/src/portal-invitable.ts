import { investorLoginOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Context } from "./context";

// Who may be asked into the portal at all, checked the same way whatever the step: the Portal Consent printed and
// recorded, and the code given after it. A consent is never kept for somebody who could not then be given a code.

/** A refusal with the word the Owner's screens say it by. */
export const refused = (message: string, refusal: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

/** The Owner acting on the farm: the farm, and who they are. */
export type Owned = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: { id: string; name: string };
};

/**
 * The Investor on this farm, and the address their portal account signs in as, once it is certain they can have one:
 * not retired, on a Bangladeshi mobile number, and no other Investor's portal on that number.
 */
export const invitable = async (context: Owned, investorId: string) => {
  const who = await context.db.query.investor.findFirst({
    where: { id: investorId, farmId: context.farm.id },
  });
  if (!who) {
    throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
  }
  if (who.retiredAt) {
    throw refused(
      "A retired Investor is brought back before they are asked into the portal",
      "investor_retired"
    );
  }
  const loginEmail = investorLoginOf(who.phone);
  if (!loginEmail) {
    throw refused(
      "Their phone is not a Bangladeshi mobile number, which is what they sign in with",
      "phone_not_mobile"
    );
  }
  const sharing = await context.db.query.investorAccess.findFirst({
    where: { loginEmail },
    columns: { investorId: true },
  });
  if (sharing && sharing.investorId !== investorId) {
    throw refused(
      "Another Investor on the same phone already has the portal",
      "phone_has_portal"
    );
  }
  return { who, loginEmail };
};
