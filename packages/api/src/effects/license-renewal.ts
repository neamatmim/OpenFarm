import { farmDayOf } from "@OpenFarm/domain";

import type { Tx } from "../audit";
import { renewLicense } from "../license-store";
import type { EffectInput, EffectKind, EffectResult } from "./effect";

type RenewalFacts = Pick<
  EffectInput,
  "instance" | "completionId" | "renewal" | "recordedBy" | "now"
>;

/**
 * Renews the License the work was raised for — the Owner's, as the Registration's renewal is (ADR 0030). The new expiry
 * and certificate replace the old, and the renewal is kept against the expiry it replaced.
 */
const renewTheLicense = async (
  tx: Tx,
  input: RenewalFacts
): Promise<EffectResult> => {
  const { superseded, licenseId, ...dates } = await renewLicense(tx, {
    farmId: input.instance.farmId,
    cause: input.instance.cause,
    completionId: input.completionId,
    renewal: input.renewal,
    by: input.recordedBy,
    now: input.now,
  });
  return {
    kind: "license_renewal",
    licenseId,
    ...dates,
    // The License has moved on since this renewal: the newer one is the one to put right.
    standsAside: superseded ? { because: "renewal_superseded" } : null,
  };
};

/** A Step that renews one of the farm's Licenses. */
export const licenseRenewalEffect: EffectKind<RenewalFacts> = {
  kind: "license_renewal",
  recordableBy: {
    roles: ["owner"],
    refusal: {
      message: "Renewing a License is the Owner's",
      reason: "owner_only",
    },
  },
  apply: renewTheLicense,
  // The day it was renewed to; the certificate and the day it was issued are on the License's own record.
  recorded: async (db, completionId) => {
    const renewed = await db.query.licenseRenewal.findFirst({
      where: { completionId },
      columns: { expiresOn: true },
    });
    return renewed
      ? { renewal: { expiresOn: farmDayOf(renewed.expiresOn) } }
      : {};
  },
  asShown: ({ renewal }) =>
    renewal ? { renewal: { expiresOn: renewal.expiresOn } } : {},
};
