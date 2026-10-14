import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq, sql } from "@OpenFarm/db/operators";
import { farm, registrationCertificate } from "@OpenFarm/db/schema/farm";
import type { FarmIdentity } from "@OpenFarm/domain";
import {
  OPEN_INSTANCE_STATES,
  farmDayOf,
  identityView,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";
import type { PhotoInput } from "./photo-input";
import type { RenewablePaper, RenewalEntry } from "./renewal-store";
import { renewPaper, renewalsKeptIn } from "./renewal-store";

export type { RenewalEntry } from "./renewal-store";

/** The prefix every renewal's work is raised under. */
const REGISTRATION_CAUSE = "registration:";

/**
 * What raises the renewal work for a Registration: the day its certificate runs out. Once for each certificate, so the
 * renewed one raises its own renewal when its lead comes — even where it runs out in the same year as the one it
 * replaced, which a cause keyed on the year never raised. A typed expiry put right while its renewal is open raises
 * nothing more: no renewal is raised while one is open (`openRenewalsOf`).
 */
export const renewalCause = (expiresOn: Date): string =>
  `${REGISTRATION_CAUSE}${farmDayOf(expiresOn)}`;

/** The SOPs with renewal work still open: none of them is given a second until it is done, missed or called off. */
export const openRenewalsOf = async (
  db: Pick<Tx, "query">,
  farmId: string
): Promise<Set<string>> => {
  const open = await db.query.sopInstance.findMany({
    where: {
      farmId,
      cause: { like: `${REGISTRATION_CAUSE}%` },
      state: { in: [...OPEN_INSTANCE_STATES] },
    },
    columns: { definitionId: true },
  });
  return new Set(open.map((one) => one.definitionId));
};

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
      cause: { like: `${REGISTRATION_CAUSE}%` },
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
  const renewals = raised.filter((one) =>
    one.cause?.startsWith(REGISTRATION_CAUSE)
  );
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

/** Where the farm's Registration keeps what a renewal reads and writes: its expiry on the farm itself, its renewals
 *  and its certificate's photographs beside it. */
const registrationPaper = (farmId: string): RenewablePaper => ({
  called: "Registration",
  expiresOn: async (tx) => {
    const standing = await tx.query.farm.findFirst({
      where: { id: farmId },
      columns: { registrationExpiresOn: true },
    });
    return standing?.registrationExpiresOn ?? null;
  },
  renewalOf: (tx, completionId) =>
    tx.query.registrationRenewal.findFirst({
      where: { completionId },
      columns: { id: true, previousExpiresOn: true, expiresOn: true },
    }),
  keepRenewal: renewalsKeptIn({ farmId }),
  setExpiry: async (tx, expiresOn, issuedOn) => {
    await tx
      .update(farm)
      .set({
        registrationExpiresOn: expiresOn,
        ...(issuedOn === undefined ? {} : { registrationIssuedOn: issuedOn }),
      })
      .where(eq(farm.id, farmId));
  },
  keepCertificate: (tx, photo, taken) =>
    keepCertificate(tx, farmId, photo, taken),
});

/**
 * Renews the farm's Registration from the renewal SOP's closing Step, as any paper the farm renews is renewed
 * (`renewPaper`): the new expiry replaces the old one, and the renewed certificate's photograph is kept as the newest.
 */
export const renewRegistration = (
  tx: Tx,
  {
    farmId,
    ...renewing
  }: {
    farmId: string;
    completionId: string;
    renewal: RenewalEntry | undefined;
    by: string;
    now: Date;
  }
) => renewPaper(tx, registrationPaper(farmId), renewing);
