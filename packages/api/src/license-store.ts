import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq, sql } from "@OpenFarm/db/operators";
import type { LicenseKind } from "@OpenFarm/db/schema/farm";
import {
  LICENSE_HELD,
  farmLicense,
  licenseCertificate,
  licenseRenewal,
} from "@OpenFarm/db/schema/farm";
import type { SopContent } from "@OpenFarm/domain";
import { OPEN_INSTANCE_STATES, farmDayOf, runningOut } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { DueSlot } from "./instances-store";
import { renewalSlotsFor } from "./instances-store";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";
import type { PhotoInput } from "./photo-input";
import type { RenewablePaper, RenewalEntry } from "./renewal-store";
import { renewPaper } from "./renewal-store";

// The farm's **Licenses** beside its Registration — the trade license, the environmental clearance, the fire license,
// any other — renewed on the Registration's machinery (ADR 0030): renewal work raised for the Owner the renewal lead
// before one runs out, due on the day it does, and its closing Step recording the new expiry and certificate.

type Reading = Pick<Tx, "query">;

/** The prefix every License's renewal work is raised under: `license:<its id>:<the day it runs out>`. */
const LICENSE_CAUSE = "license:";

/** The cause a License's renewal work is raised under: once for each License and each certificate it holds. */
export const licenseRenewalCause =
  (licenseId: string) =>
  (expiresOn: Date): string =>
    `${LICENSE_CAUSE}${licenseId}:${farmDayOf(expiresOn)}`;

/** Which License a piece of renewal work was raised for, read off its cause; nothing for any other work. */
export const licenseOfCause = (cause: string | null): string | null => {
  if (!cause?.startsWith(LICENSE_CAUSE)) {
    return null;
  }
  const rest = cause.slice(LICENSE_CAUSE.length);
  const end = rest.lastIndexOf(":");
  return end > 0 ? rest.slice(0, end) : null;
};

/** The Licenses the farm holds, oldest written first. */
export const licensesHeld = (db: Reading, farmId: string) =>
  db.query.farmLicense.findMany({
    where: { farmId, ...LICENSE_HELD },
    orderBy: { createdAt: "asc", id: "asc" },
  });

/** For each License, the SOPs whose work renewing it is still open: given none more until it is done. */
const openRenewalsByLicense = async (
  db: Reading,
  farmId: string
): Promise<Map<string, Set<string>>> => {
  const open = await db.query.sopInstance.findMany({
    where: {
      farmId,
      cause: { like: `${LICENSE_CAUSE}%` },
      state: { in: [...OPEN_INSTANCE_STATES] },
    },
    columns: { definitionId: true, cause: true },
  });
  const byLicense = new Map<string, Set<string>>();
  for (const one of open) {
    const licenseId = licenseOfCause(one.cause);
    if (licenseId) {
      const sops = byLicense.get(licenseId) ?? new Set<string>();
      sops.add(one.definitionId);
      byLicense.set(licenseId, sops);
    }
  }
  return byLicense;
};

/** The renewal work every License the farm holds is owed now: one piece for each License within the renewal lead of
 *  running out, for each procedure that renews a License, raised once for each of its certificates. */
export const licenseRenewalSlots = async (
  db: Reading,
  farm: { id: string; registrationRenewalLeadDays: number },
  sops: { definitionId: string; versionId: string; content: SopContent }[],
  now: Date
): Promise<DueSlot[]> => {
  if (
    !sops.some((sop) =>
      sop.content.triggers.some((trigger) => trigger.kind === "license_renewal")
    )
  ) {
    return [];
  }
  const [licenses, open] = await Promise.all([
    licensesHeld(db, farm.id),
    openRenewalsByLicense(db, farm.id),
  ]);
  return licenses.flatMap((license) =>
    renewalSlotsFor(now, sops, {
      trigger: "license_renewal",
      expiresOn: license.expiresOn,
      renewalLeadDays: farm.registrationRenewalLeadDays,
      causeOf: licenseRenewalCause(license.id),
      stillOpen: open.get(license.id),
    })
  );
};

/** A License as a notice and a screen name it: its kind, the name the farm wrote for an `other`, and its number. */
export interface LicenseNamed {
  id: string;
  kind: LicenseKind;
  name: string | null;
  number: string;
}

/** Tells the Owner of each License's renewal raised, in the evening's post, as the Registration's is: once for each
 *  piece of renewal work. */
export const tellOfLicenseRenewals = async (
  tx: Tx,
  farmId: string,
  raised: readonly { id: string; cause: string | null }[],
  now: Date
): Promise<Raised[]> => {
  const renewals = raised.flatMap((one) => {
    const licenseId = licenseOfCause(one.cause);
    return licenseId ? [{ workId: one.id, licenseId }] : [];
  });
  if (renewals.length === 0) {
    return [];
  }
  const licenses = await tx.query.farmLicense.findMany({
    where: { farmId, id: { in: renewals.map((one) => one.licenseId) } },
  });
  const told: Raised[] = [];
  const remembering = rememberingPeople();
  for (const { workId, licenseId } of renewals) {
    const license = licenses.find((one) => one.id === licenseId);
    if (license) {
      // oxlint-disable-next-line no-await-in-loop
      const rows = await tell(
        tx,
        farmId,
        {
          kind: "license_renewal_due",
          about: { id: workId },
          facts: {
            kind: license.kind,
            name: license.name,
            number: license.number,
            expiresOn: license.expiresOn?.toISOString() ?? null,
          },
        },
        now,
        remembering
      );
      told.push(...rows);
    }
  }
  return told;
};

/**
 * The Licenses coming up for renewal or run out, as the Owner's exception list says them: each from the moment its
 * renewal lead begins, and for as long as its renewal work is open, with that work.
 */
export const licenseRenewalsDue = async (
  db: Reading,
  farm: { id: string; registrationRenewalLeadDays: number },
  now: Date
) => {
  const [licenses, open] = await Promise.all([
    licensesHeld(db, farm.id),
    db.query.sopInstance.findMany({
      where: {
        farmId: farm.id,
        cause: { like: `${LICENSE_CAUSE}%` },
        state: { in: [...OPEN_INSTANCE_STATES] },
      },
      columns: { id: true, cause: true },
      orderBy: { dueAt: "asc", id: "asc" },
    }),
  ]);
  return licenses.flatMap((license) => {
    const { expired, endingSoon } = runningOut(
      license.expiresOn,
      now,
      farm.registrationRenewalLeadDays
    );
    const work = open.find((one) => licenseOfCause(one.cause) === license.id);
    if (!(work || expired || endingSoon)) {
      return [];
    }
    return [
      {
        licenseId: license.id,
        kind: license.kind,
        name: license.name,
        number: license.number,
        expiresOn: license.expiresOn,
        expired,
        instanceId: work?.id ?? null,
      },
    ];
  });
};

/** Keeps a photograph of a License's certificate beside the ones kept before it; one a renewal Step took is that
 *  Step's, so a corrected renewal replaces its own. */
export const keepLicenseCertificate = async (
  tx: Tx,
  { farmId, licenseId }: { farmId: string; licenseId: string },
  photo: PhotoInput,
  {
    by,
    now,
    completionId = null,
  }: { by: string; now: Date; completionId?: string | null }
): Promise<string> => {
  const id = newId(now);
  const [kept] = await tx
    .insert(licenseCertificate)
    .values({
      id,
      farmId,
      licenseId,
      ...photo,
      completionId,
      takenBy: by,
      takenAt: now,
    })
    .onConflictDoUpdate({
      target: licenseCertificate.completionId,
      targetWhere: sql`${licenseCertificate.completionId} is not null`,
      set: { ...photo, takenBy: by, takenAt: now },
    })
    .returning({ id: licenseCertificate.id });
  return kept?.id ?? id;
};

/** Where a License keeps what a renewal reads and writes: its expiry on its own row, its renewals and certificates
 *  beside it. */
const licensePaper = (farmId: string, licenseId: string): RenewablePaper => ({
  called: "License",
  expiresOn: async (tx) => {
    const license = await tx.query.farmLicense.findFirst({
      where: { id: licenseId, farmId },
      columns: { expiresOn: true },
    });
    return license?.expiresOn ?? null;
  },
  renewalOf: (tx, completionId) =>
    tx.query.licenseRenewal.findFirst({
      where: { completionId },
      columns: { id: true, previousExpiresOn: true, expiresOn: true },
    }),
  keepRenewal: async (
    tx,
    { already, completionId, previousExpiresOn, expiresOn, by, now }
  ) => {
    await (already
      ? tx
          .update(licenseRenewal)
          .set({ expiresOn, renewedBy: by, renewedAt: now })
          .where(eq(licenseRenewal.id, already.id))
      : tx.insert(licenseRenewal).values({
          id: newId(now),
          farmId,
          licenseId,
          completionId,
          previousExpiresOn,
          expiresOn,
          renewedBy: by,
          renewedAt: now,
        }));
  },
  setExpiry: async (tx, expiresOn, issuedOn) => {
    await tx
      .update(farmLicense)
      .set({ expiresOn, ...(issuedOn === undefined ? {} : { issuedOn }) })
      .where(eq(farmLicense.id, licenseId));
  },
  keepCertificate: (tx, photo, taken) =>
    keepLicenseCertificate(tx, { farmId, licenseId }, photo, taken),
});

/**
 * Renews the License a piece of renewal work was raised for, as any paper the farm renews is renewed (`renewPaper`).
 * Work raised for no License — a procedure misread — renews nothing, and says so.
 */
export const renewLicense = async (
  tx: Tx,
  {
    farmId,
    cause,
    ...renewing
  }: {
    farmId: string;
    cause: string | null;
    completionId: string;
    renewal: RenewalEntry | undefined;
    by: string;
    now: Date;
  }
) => {
  const licenseId = licenseOfCause(cause);
  const license = licenseId
    ? await tx.query.farmLicense.findFirst({
        where: { id: licenseId, farmId },
        columns: { id: true },
      })
    : undefined;
  if (!license) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This work was raised for no License the farm holds",
      data: { refusal: "renewal_names_no_license" },
    });
  }
  return {
    licenseId: license.id,
    ...(await renewPaper(tx, licensePaper(farmId, license.id), renewing)),
  };
};
