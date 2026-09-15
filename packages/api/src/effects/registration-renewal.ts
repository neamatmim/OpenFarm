import { farmDayOf } from "@OpenFarm/domain";

import type { Tx } from "../audit";
import type { EffectInput, EffectResult } from "../effects";
import { renewRegistration } from "../registration-store";
import type { EffectKind } from "./effect";

type RenewalFacts = Pick<
  EffectInput,
  "instance" | "completionId" | "renewal" | "recordedBy" | "now"
>;

/**
 * Renews the farm's DLS Registration: the Owner's, as the renewal SOP is (the registration decision). The
 * new expiry and certificate replace the old, and the renewal is kept against the expiry it replaced.
 */
const renewTheRegistration = async (
  tx: Tx,
  input: RenewalFacts
): Promise<EffectResult> => {
  const renewed = await renewRegistration(tx, {
    farmId: input.instance.farmId,
    completionId: input.completionId,
    renewal: input.renewal,
    by: input.recordedBy,
    now: input.now,
  });
  const { superseded, ...dates } = renewed;
  return {
    kind: "registration_renewal",
    ...dates,
    // The Registration has moved on since this renewal: the newer one is the one to put right.
    standsAside: superseded ? { because: "renewal_superseded" } : null,
  };
};

/** A Step that renews the farm's Registration. */
export const renewalEffect: EffectKind<RenewalFacts> = {
  kind: "registration_renewal",
  recordedBy: {
    roles: ["owner"],
    refusal: {
      message: "Renewing the Registration is the Owner's",
      reason: "owner_only",
    },
  },
  apply: renewTheRegistration,
  // The certificate's photograph is kept on its own and stays: a correction puts the day right.
  recorded: async (tx, completionId) => {
    const renewed = await tx.query.registrationRenewal.findFirst({
      where: { completionId },
      columns: { expiresOn: true },
    });
    return renewed
      ? { renewal: { expiresOn: farmDayOf(renewed.expiresOn) } }
      : {};
  },
};
