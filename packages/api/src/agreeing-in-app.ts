import { ORPCError } from "@orpc/server";

import type { audited } from "./audit";
import type { Actor, Context } from "./context";

// What agreeing in the app asks of every paper offered there, an Agreement or an Amendment: the farm's switch on, and
// everybody who is to agree able to reach the portal to do it.

/** A request the Owner or an Investor makes, with the Farm certain. */
export type Acting = Parameters<typeof audited>[0] & {
  farm: NonNullable<Context["farm"]>;
  actor: Actor;
  clock: { now: () => Date };
};

/** A refusal the screen words for itself. */
export const refused = (message: string, refusal: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

/** The switch is off: nothing is offered or agreed in the app. */
export const assertSwitchedOn = (farm: { agreementsInApp: boolean }) => {
  if (!farm.agreementsInApp) {
    throw refused(
      "Agreements are not agreed in the app on this farm",
      "agreements_in_app_off"
    );
  }
};

/** That every one of them can agree in the app: the portal open, and each one's access to it taken up and standing. */
export const assertInThePortal = async (
  context: Acting,
  investorIds: readonly string[]
) => {
  const access = await context.db.query.investorAccess.findMany({
    where: {
      farmId: context.farm.id,
      investorId: { in: [...investorIds] },
      revokedAt: { isNull: true },
      acceptedAt: { isNotNull: true },
    },
    columns: { investorId: true },
  });
  const inThePortal = new Set(access.map((one) => one.investorId));
  const everyone = investorIds.every((id) => inThePortal.has(id));
  if (!(context.farm.investorPortal && everyone)) {
    throw refused(
      "They cannot agree in the app: the portal is shut, or they have not joined it",
      "investor_not_in_portal"
    );
  }
};
