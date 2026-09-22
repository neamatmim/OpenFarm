import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq, sql } from "@OpenFarm/db/operators";
import {
  farm,
  registrationCertificate,
  registrationRenewal,
} from "@OpenFarm/db/schema/farm";
import type { FarmIdentity } from "@OpenFarm/domain";
import {
  OPEN_INSTANCE_STATES,
  farmDayOf,
  identityView,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";
import type { PhotoInput } from "./photo-input";

/** What the renewal SOP's closing Step records: the new expiry, when the renewed certificate was issued, and
 *  its photograph. */
export interface RenewalEntry {
  /** The farm day the renewed certificate says it expires. */
  expiresOn: string;
  /** The farm day it was issued, when the certificate says. */
  issuedOn?: string;
  certificate?: PhotoInput;
}

/** The prefix every renewal's work is raised under. */
const RENEWAL_CAUSE = "registration:";

/**
 * What raises the renewal work for a Registration: the year its certificate runs out. Once for each year's
 * certificate, so a Manager putting a typed expiry right within the year raises nothing more, and the renewed
 * certificate's year raises its own renewal when its lead comes.
 */
export const renewalCause = (expiresOn: Date): string =>
  `${RENEWAL_CAUSE}${farmDayOf(expiresOn).slice(0, "YYYY".length)}`;

/**
 * The Registration's renewal as the Owner's exception list says it: when it runs out, whether it already
 * has, and the open renewal work — from the moment the renewal lead begins, and for as long as renewal work
 * is open, until it is done. Null while there is nothing to say.
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
  expiresOn: Date | null;
  expired: boolean;
  instanceId: string | null;
} | null> => {
  const view = identityView(
    standing,
    now,
    standing.registrationRenewalLeadDays
  );
  const work = await db.query.sopInstance.findFirst({
    where: {
      farmId: standing.id,
      cause: { like: `${RENEWAL_CAUSE}%` },
      state: { in: [...OPEN_INSTANCE_STATES] },
    },
    columns: { id: true },
    orderBy: { dueAt: "asc", id: "asc" },
  });
  const renewalTime = view.registrationEndingSoon || view.registrationExpired;
  if (!(work || renewalTime)) {
    return null;
  }
  return {
    expiresOn: standing.registrationExpiresOn,
    expired: view.registrationExpired,
    instanceId: work?.id ?? null,
  };
};

/**
 * Tells the Owner a renewal has been raised — in the digest, never by a buzz (notification channels: DLS
 * renewal due → Owner, digest). Once for each piece of renewal work.
 */
export const tellOfRenewals = async (
  tx: Tx,
  standing: { id: string; registrationExpiresOn: Date | null },
  raised: readonly { id: string; cause: string | null }[],
  now: Date
): Promise<Raised[]> => {
  const renewals = raised.filter((one) => one.cause?.startsWith(RENEWAL_CAUSE));
  const told: Raised[] = [];
  const remembering = rememberingPeople();
  for (const work of renewals) {
    // oxlint-disable-next-line no-await-in-loop
    const rows = await tell(
      tx,
      standing.id,
      {
        kind: "registration_renewal_due",
        about: { id: work.id },
        facts: {
          expiresOn: standing.registrationExpiresOn?.toISOString() ?? null,
        },
      },
      now,
      remembering
    );
    told.push(...rows);
  }
  return told;
};

/** The certificate photographs the farm holds, newest first — the first is the certificate it holds now. */
export const certificatesOf = (db: Pick<Tx, "query">, farmId: string) =>
  db.query.registrationCertificate.findMany({
    where: { farmId },
    columns: { id: true, contentType: true, takenBy: true, takenAt: true },
    orderBy: { takenAt: "desc", id: "desc" },
  });

/**
 * Keeps a photograph of the certificate beside every one kept before: the newest is the certificate now,
 * and the older ones are what the farm held then. One taken by a renewal Step is that Step's, so a corrected
 * renewal replaces its own photograph rather than adding another.
 */
export const keepCertificate = async (
  tx: Tx,
  farmId: string,
  photo: PhotoInput,
  {
    by,
    now,
    completionId = null,
  }: { by: string; now: Date; completionId?: string | null }
): Promise<string> => {
  const id = newId(now);
  const [kept] = await tx
    .insert(registrationCertificate)
    .values({
      id,
      farmId,
      ...photo,
      completionId,
      takenBy: by,
      takenAt: now,
    })
    .onConflictDoUpdate({
      target: registrationCertificate.completionId,
      targetWhere: sql`${registrationCertificate.completionId} is not null`,
      set: { ...photo, takenBy: by, takenAt: now },
    })
    .returning({ id: registrationCertificate.id });
  return kept?.id ?? id;
};

/**
 * Renews the farm's Registration from the renewal SOP's closing Step: the new expiry replaces the old one,
 * and the renewed certificate's photograph replaces the old one's. Keyed on the Completion, so a corrected
 * renewal puts the same renewal right against the expiry it replaced, rather than renewing a second time.
 *
 * A renewal to a day before the expiry it replaces is not a renewal, and is refused; so is a first renewal
 * with no photograph of the certificate, which is the thing an inspector asks to see; and so is a correction
 * of a renewal the farm has since moved past — renewed again, or its expiry put right by hand — which would
 * otherwise quietly undo the newer one.
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
): Promise<{
  expiresOn: Date;
  previousExpiresOn: Date | null;
  /** The Registration has moved on since this renewal: nothing was written. */
  superseded: boolean;
}> => {
  if (!renewal) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A renewal says when the renewed certificate expires",
      data: { refusal: "renewal_needs_expiry" },
    });
  }
  const standing = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: { registrationExpiresOn: true },
  });
  const already = await tx.query.registrationRenewal.findFirst({
    where: { completionId },
    columns: { id: true, previousExpiresOn: true, expiresOn: true },
  });
  // A correction measures against the expiry this renewal replaced, not the one it wrote.
  const previousExpiresOn = already
    ? already.previousExpiresOn
    : (standing?.registrationExpiresOn ?? null);
  if (
    already &&
    standing?.registrationExpiresOn?.getTime() !== already.expiresOn.getTime()
  ) {
    return {
      expiresOn: already.expiresOn,
      previousExpiresOn,
      superseded: true,
    };
  }
  const expiresOn = startOfFarmDay(renewal.expiresOn);
  if (previousExpiresOn !== null && expiresOn < previousExpiresOn) {
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
    .set({
      registrationExpiresOn: expiresOn,
      ...(renewal.issuedOn === undefined
        ? {}
        : { registrationIssuedOn: startOfFarmDay(renewal.issuedOn) }),
    })
    .where(eq(farm.id, farmId));
  if (renewal.certificate) {
    await keepCertificate(tx, farmId, renewal.certificate, {
      by,
      now,
      completionId,
    });
  }
  return { expiresOn, previousExpiresOn, superseded: false };
};
