import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { licenseRenewal, registrationRenewal } from "@OpenFarm/db/schema/farm";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import {
  OPEN_INSTANCE_STATES,
  goodUntilOf,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { PhotoInput } from "./photo-input";

// A paper the farm renews — its DLS Registration, or one of its Licenses (ADR 0032) — renewed from the closing Step of
// the work raised for it. What makes a renewal a renewal is the same for every paper; where each keeps its expiry, its
// renewals and its certificate's photographs is its own.

/** What a renewal's closing Step records: the new expiry, when the renewed certificate was issued, and its photograph. */
export interface RenewalEntry {
  /** The farm day the renewed certificate says it expires. */
  expiresOn: string;
  /** The farm day it was issued, when the certificate says. */
  issuedOn?: string;
  certificate?: PhotoInput;
}

/** One renewal as the paper keeps it: the expiry it replaced, and the one it wrote. */
export interface RenewalKept {
  id: string;
  previousExpiresOn: Date | null;
  expiresOn: Date;
}

/** Where one paper keeps what a renewal reads and writes. */
export interface RenewablePaper {
  /** What a refusal calls it. */
  called: string;
  /** When it runs out now. */
  expiresOn: (tx: Tx) => Promise<Date | null>;
  /** The renewal a Step already recorded, when this is that Step put right. */
  renewalOf: (tx: Tx, completionId: string) => Promise<RenewalKept | undefined>;
  /** Writes the renewal down, or puts the one already written right. */
  keepRenewal: (
    tx: Tx,
    renewal: {
      already: RenewalKept | undefined;
      completionId: string;
      previousExpiresOn: Date | null;
      expiresOn: Date;
      by: string;
      now: Date;
    }
  ) => Promise<void>;
  /** Moves the paper's own expiry, and its issue day when the certificate says one. */
  setExpiry: (
    tx: Tx,
    expiresOn: Date,
    issuedOn: Date | undefined
  ) => Promise<void>;
  /** Keeps the renewed certificate's photograph, the Step's own so a correction replaces it. */
  keepCertificate: (
    tx: Tx,
    photo: PhotoInput,
    taken: { by: string; now: Date; completionId: string }
  ) => Promise<unknown>;
}

/**
 * How a paper keeps its renewals, in a table of its own beside it — the Registration's, or the Licenses' with the
 * License each renews: a Step's renewal written once, and put right in its own row by a correction.
 */
export const renewalsKeptIn =
  (whose: {
    farmId: string;
    licenseId?: string;
  }): RenewablePaper["keepRenewal"] =>
  async (
    tx,
    { already, completionId, previousExpiresOn, expiresOn, by, now }
  ) => {
    const { licenseId } = whose;
    const table =
      licenseId === undefined ? registrationRenewal : licenseRenewal;
    if (already) {
      await tx
        .update(table)
        .set({ expiresOn, renewedBy: by, renewedAt: now })
        .where(eq(table.id, already.id));
      return;
    }
    const row = {
      id: newId(now),
      farmId: whose.farmId,
      completionId,
      previousExpiresOn,
      expiresOn,
      renewedBy: by,
      renewedAt: now,
    };
    await (licenseId === undefined
      ? tx.insert(registrationRenewal).values(row)
      : tx.insert(licenseRenewal).values({ ...row, licenseId }));
  };

/**
 * Moves a paper's open renewal work to the expiry put right by hand: due when the paper now runs out, under the cause of
 * that expiry — so it is not late on a day the paper no longer runs out, and the next turn finds it already raised. A
 * cause another piece of the same procedure's work already holds is left, and only the day moves. Nothing for an expiry
 * cleared: the work still stands for the paper the farm holds.
 */
export const followTheExpiry = async (
  tx: Tx,
  {
    farmId,
    causePrefix,
    expiresOn,
    causeOf,
  }: {
    farmId: string;
    /** What every cause of this paper's renewal work begins with. */
    causePrefix: string;
    expiresOn: Date | null | undefined;
    causeOf: (expiresOn: Date) => string;
  }
): Promise<void> => {
  if (!expiresOn) {
    return;
  }
  const open = await tx.query.sopInstance.findMany({
    where: {
      farmId,
      cause: { like: `${causePrefix}%` },
      state: { in: [...OPEN_INSTANCE_STATES] },
    },
    columns: { id: true, definitionId: true, cause: true },
    orderBy: { dueAt: "asc", id: "asc" },
  });
  const cause = causeOf(expiresOn);
  for (const work of open) {
    // One row each, sequentially: a transaction has one client. A paper has one or two pieces of work open at most.
    // oxlint-disable-next-line no-await-in-loop
    const taken = await tx.query.sopInstance.findFirst({
      where: { definitionId: work.definitionId, cause, id: { ne: work.id } },
      columns: { id: true },
    });
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(sopInstance)
      .set({ dueAt: goodUntilOf(expiresOn), ...(taken ? {} : { cause }) })
      .where(eq(sopInstance.id, work.id));
  }
};

/**
 * Renews a paper from its renewal work's closing Step: the new expiry replaces the old one, and the renewed
 * certificate's photograph is kept as the newest. Keyed on the Completion, so a corrected renewal puts the same renewal
 * right against the expiry it replaced, rather than renewing a second time.
 *
 * A renewal to a day before the expiry it replaces is not a renewal, and is refused; so is a first renewal with no
 * photograph of the certificate, which is the thing an inspector asks to see; and so is a correction of a renewal the
 * farm has since moved past — renewed again, or its expiry put right by hand — which would otherwise quietly undo the
 * newer one.
 */
export const renewPaper = async (
  tx: Tx,
  paper: RenewablePaper,
  {
    completionId,
    renewal,
    by,
    now,
  }: {
    completionId: string;
    renewal: RenewalEntry | undefined;
    by: string;
    now: Date;
  }
): Promise<{
  expiresOn: Date;
  previousExpiresOn: Date | null;
  /** The paper has moved on since this renewal: nothing was written. */
  superseded: boolean;
}> => {
  if (!renewal) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A renewal says when the renewed certificate expires",
      data: { refusal: "renewal_needs_expiry" },
    });
  }
  const standing = await paper.expiresOn(tx);
  const already = await paper.renewalOf(tx, completionId);
  // A correction measures against the expiry this renewal replaced, not the one it wrote.
  const previousExpiresOn = already ? already.previousExpiresOn : standing;
  if (already && standing?.getTime() !== already.expiresOn.getTime()) {
    return {
      expiresOn: already.expiresOn,
      previousExpiresOn,
      superseded: true,
    };
  }
  const expiresOn = startOfFarmDay(renewal.expiresOn);
  if (previousExpiresOn !== null && expiresOn < previousExpiresOn) {
    throw new ORPCError("BAD_REQUEST", {
      message: `A renewed ${paper.called} runs out after the one it replaces`,
      data: { refusal: "renewal_not_later" },
    });
  }
  if (!(already || renewal.certificate)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A renewal keeps a photograph of the renewed certificate",
      data: { refusal: "renewal_needs_certificate" },
    });
  }
  await paper.keepRenewal(tx, {
    already,
    completionId,
    previousExpiresOn,
    expiresOn,
    by,
    now,
  });
  await paper.setExpiry(
    tx,
    expiresOn,
    renewal.issuedOn === undefined
      ? undefined
      : startOfFarmDay(renewal.issuedOn)
  );
  if (renewal.certificate) {
    await paper.keepCertificate(tx, renewal.certificate, {
      by,
      now,
      completionId,
    });
  }
  return { expiresOn, previousExpiresOn, superseded: false };
};
