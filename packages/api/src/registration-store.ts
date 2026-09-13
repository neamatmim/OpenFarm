import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import {
  farm,
  farmCertificate,
  registrationRenewal,
} from "@OpenFarm/db/schema/farm";
import type { FarmIdentity } from "@OpenFarm/domain";
import { identityView, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";

/** A photograph of the Registration certificate, as a phone sends it. */
export interface CertificatePhoto {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  data: string;
}

/** What the renewal SOP's closing Step records: the new expiry, and the renewed certificate. */
export interface RenewalEntry {
  /** The farm day the renewed certificate says it expires. */
  expiresOn: string;
  certificate?: CertificatePhoto;
}

/** What raises the renewal work for one expiry, so that it is raised once for each certificate. */
export const renewalCause = (expiresOn: Date): string =>
  `registration:${expiresOn.toISOString()}`;

/**
 * The Registration's renewal as the Owner's exception list says it: when it runs out, whether it already
 * has, and the renewal work raised for it — from the moment the renewal lead begins until the Registration
 * is renewed to a later day. Null while there is nothing to say.
 */
export const renewalDue = async (
  db: Pick<Tx, "query">,
  standing: {
    id: string;
    registrationExpiresOn: Date | null;
    registrationRenewalLeadDays: number;
  } & FarmIdentity,
  now: Date
): Promise<{
  expiresOn: Date;
  expired: boolean;
  instanceId: string | null;
} | null> => {
  const view = identityView(
    standing,
    now,
    standing.registrationRenewalLeadDays
  );
  const expiresOn = standing.registrationExpiresOn;
  if (
    expiresOn === null ||
    !(view.registrationEndingSoon || view.registrationExpired)
  ) {
    return null;
  }
  const work = await db.query.sopInstance.findFirst({
    where: {
      farmId: standing.id,
      cause: renewalCause(expiresOn),
      state: { in: ["due", "in_progress", "sent_back"] },
    },
    columns: { id: true },
  });
  return {
    expiresOn,
    expired: view.registrationExpired,
    instanceId: work?.id ?? null,
  };
};

/** Keeps the certificate's photograph, replacing the one kept before. */
export const keepCertificate = async (
  tx: Tx,
  farmId: string,
  photo: CertificatePhoto,
  { by, now }: { by: string; now: Date }
): Promise<void> => {
  await tx
    .insert(farmCertificate)
    .values({ farmId, ...photo, updatedBy: by, updatedAt: now })
    .onConflictDoUpdate({
      target: farmCertificate.farmId,
      set: { ...photo, updatedBy: by, updatedAt: now },
    });
};

/**
 * Renews the farm's Registration from the renewal SOP's closing Step: the new expiry replaces the old one,
 * and the renewed certificate's photograph replaces the old one's. Keyed on the Completion, so a corrected
 * renewal puts the same renewal right against the expiry it replaced, rather than renewing a second time.
 *
 * A renewal to a day not after the expiry it replaces is not a renewal, and is refused; so is a first
 * renewal with no photograph of the certificate, which is the thing an inspector asks to see.
 */
export const renewRegistration = async (
  tx: Tx,
  {
    farmId,
    completionId,
    renewal,
    by,
    now,
  }: {
    farmId: string;
    completionId: string;
    renewal: RenewalEntry | undefined;
    by: string;
    now: Date;
  }
): Promise<{ expiresOn: Date; previousExpiresOn: Date | null }> => {
  if (!renewal) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A renewal says when the renewed certificate expires",
      data: { refusal: "renewal_needs_expiry" },
    });
  }
  const [standing, already] = await Promise.all([
    tx.query.farm.findFirst({
      where: { id: farmId },
      columns: { registrationExpiresOn: true },
    }),
    tx.query.registrationRenewal.findFirst({
      where: { completionId },
      columns: { id: true, previousExpiresOn: true },
    }),
  ]);
  // A correction measures against the expiry this renewal replaced, not the one it wrote.
  const previousExpiresOn = already
    ? already.previousExpiresOn
    : (standing?.registrationExpiresOn ?? null);
  const expiresOn = startOfFarmDay(renewal.expiresOn);
  if (previousExpiresOn !== null && expiresOn <= previousExpiresOn) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A renewed Registration runs out after the one it replaces",
      data: { refusal: "renewal_not_later" },
    });
  }
  if (!(already || renewal.certificate)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A renewal keeps a photograph of the renewed certificate",
      data: { refusal: "renewal_needs_certificate" },
    });
  }
  await (already
    ? tx
        .update(registrationRenewal)
        .set({ expiresOn, renewedBy: by, renewedAt: now })
        .where(eq(registrationRenewal.id, already.id))
    : tx.insert(registrationRenewal).values({
        id: newId(now),
        farmId,
        completionId,
        previousExpiresOn,
        expiresOn,
        renewedBy: by,
        renewedAt: now,
      }));
  await tx
    .update(farm)
    .set({ registrationExpiresOn: expiresOn })
    .where(eq(farm.id, farmId));
  if (renewal.certificate) {
    await keepCertificate(tx, farmId, renewal.certificate, { by, now });
  }
  return { expiresOn, previousExpiresOn };
};
