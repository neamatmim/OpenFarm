import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { LICENSE_KINDS, farmLicense } from "@OpenFarm/db/schema/farm";
import { runningOut, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import {
  callOffLicenseRenewals,
  followLicenseExpiry,
  keepLicenseCertificate,
  licensesHeld,
} from "../license-store";
import { photoInput } from "../photo-input";
import { requirePersonalSession, requireRole } from "../roles";
import { sopsInForce } from "../sops-in-force";
import { tellTheOwnerOfTheChange } from "./farm";

/** What a License says, as the farm writes it from its certificate. */
const licenseFields = {
  name: z.string().trim().min(1).max(100).nullish(),
  number: z.string().trim().min(1).max(60),
  issuer: z.string().trim().max(200).nullish(),
  issuedOn: farmDay.nullish(),
  expiresOn: farmDay.nullish(),
};

/** A day as the farm keeps it, or nothing; left out, left as it is. */
const onFarmDay = (day: string | null | undefined) => {
  if (day === undefined) {
    return;
  }
  return day === null ? null : startOfFarmDay(day);
};

/** Refuses a License with no name of its own where its kind gives it none, or one that runs out before it was issued. */
const refuseUnsound = (license: {
  kind: string;
  name: string | null;
  issuedOn: Date | null;
  expiresOn: Date | null;
}) => {
  if (license.kind === "other" && !license.name) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A license of another kind says what it is",
      data: { refusal: "license_needs_a_name" },
    });
  }
  if (
    license.issuedOn &&
    license.expiresOn &&
    license.expiresOn < license.issuedOn
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A license cannot run out before it was issued",
      data: { refusal: "license_expires_before_issued" },
    });
  }
};

/** One of this farm's Licenses still held, or a refusal. */
const heldLicense = async (
  db: Pick<Tx, "query">,
  farmId: string,
  id: string
) => {
  const license = await db.query.farmLicense.findFirst({
    where: { id, farmId, retiredAt: { isNull: true } },
  });
  if (!license) {
    throw new ORPCError("NOT_FOUND", { message: "No such license" });
  }
  return license;
};

/** A License as the trail keeps it either side of a change. */
const readLicense = async (tx: Tx, farmId: string, id: string) =>
  (await tx.query.farmLicense.findFirst({
    where: { id, farmId },
    columns: {
      kind: true,
      name: true,
      number: true,
      issuer: true,
      issuedOn: true,
      expiresOn: true,
      retiredAt: true,
    },
  })) ?? null;

/**
 * The farm's **Licenses** beside its DLS Registration: the trade license, the environmental clearance, the fire
 * license, and any other the farm names. Written and put right by the Owner or the Manager, as the Registration is;
 * read by the Vet as the Farm Identity is. Renewed on the Registration's machinery (ADR 0032).
 */
export const licensesRouter = {
  /** The Licenses the farm holds: each with whether it has run out or is within the renewal lead, and when its
   *  certificate was last photographed. */
  list: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const [licenses, certificates] = await Promise.all([
        licensesHeld(context.db, context.farm.id),
        context.db.query.licenseCertificate.findMany({
          where: { farmId: context.farm.id },
          columns: { licenseId: true, takenAt: true },
          orderBy: { takenAt: "desc", id: "desc" },
        }),
      ]);
      return licenses.map((license) => ({
        id: license.id,
        kind: license.kind,
        name: license.name,
        number: license.number,
        issuer: license.issuer,
        issuedOn: license.issuedOn,
        expiresOn: license.expiresOn,
        ...runningOut(
          license.expiresOn,
          now,
          context.farm.registrationRenewalLeadDays
        ),
        /** When its certificate was last photographed; null for one never photographed. */
        certificateTakenAt:
          certificates.find((one) => one.licenseId === license.id)?.takenAt ??
          null,
      }));
    }),

  /**
   * Whether any procedure in force raises a License's renewal, and the Registration's: until one does, the farm keeps
   * the papers and says when they run out, and nobody is given their renewal as work.
   */
  renewalProcedures: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .handler(async ({ context }) => {
      const sops = await sopsInForce(context.db, context.farm.id);
      const raisedBy = (kind: "registration_renewal" | "license_renewal") =>
        sops.some((sop) =>
          sop.content.triggers.some((trigger) => trigger.kind === kind)
        );
      return {
        licenses: raisedBy("license_renewal"),
        registration: raisedBy("registration_renewal"),
      };
    }),

  /** Writes a License down from its certificate. */
  add: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ kind: z.enum(LICENSE_KINDS), ...licenseFields }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = uuidv7(now);
      const row = {
        id,
        farmId: context.farm.id,
        kind: input.kind,
        // Only an other is called what the farm writes; the rest are called by their kind.
        name: input.kind === "other" ? (input.name ?? null) : null,
        number: input.number,
        issuer: input.issuer ?? null,
        issuedOn: onFarmDay(input.issuedOn) ?? null,
        expiresOn: onFarmDay(input.expiresOn) ?? null,
        createdBy: context.actor.id,
        createdAt: now,
      };
      refuseUnsound(row);
      await audited(context).write(
        { entity: "license", entityId: id, action: "create", after: row },
        async (tx) => {
          await tx.insert(farmLicense).values(row);
          await tellTheOwnerOfTheChange(context, tx, { license: id });
        }
      );
      return { id };
    }),

  /** Puts a License right — its number, issuer or days, as the certificate says them. A field left out stays. */
  update: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        id: z.string(),
        ...licenseFields,
        number: licenseFields.number.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      await audited(context).write(
        {
          entity: "license",
          entityId: input.id,
          action: "update",
          before: (tx) => readLicense(tx, farmId, input.id),
          after: (tx) => readLicense(tx, farmId, input.id),
        },
        async (tx) => {
          const was = await heldLicense(tx, farmId, input.id);
          const changes = Object.fromEntries(
            Object.entries({
              name: was.kind === "other" ? input.name : undefined,
              number: input.number,
              issuer: input.issuer,
              issuedOn: onFarmDay(input.issuedOn),
              expiresOn: onFarmDay(input.expiresOn),
            }).filter(([, value]) => value !== undefined)
          );
          refuseUnsound({ ...was, ...changes });
          await tx
            .update(farmLicense)
            .set(changes)
            .where(eq(farmLicense.id, input.id));
          // The renewal work raised for the expiry it replaced follows it, or is owed no more (ADR 0032).
          await followLicenseExpiry(tx, {
            farmId,
            licenseId: input.id,
            previous: was.expiresOn,
            expiresOn: onFarmDay(input.expiresOn),
            renewalLeadDays: context.farm.registrationRenewalLeadDays,
            now: context.clock.now(),
            trail: audited(context).recordEvent,
          });
          await tellTheOwnerOfTheChange(context, tx, changes);
        }
      );
      return { id: input.id };
    }),

  /** Takes a License the farm no longer holds off its list. Never deleted: it is still what the farm held. */
  retire: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      await audited(context).write(
        {
          entity: "license",
          entityId: input.id,
          action: "update",
          before: (tx) => readLicense(tx, farmId, input.id),
          after: (tx) => readLicense(tx, farmId, input.id),
        },
        async (tx) => {
          await heldLicense(tx, farmId, input.id);
          await tx
            .update(farmLicense)
            .set({ retiredAt: context.clock.now() })
            .where(eq(farmLicense.id, input.id));
          // Nobody renews a License the farm no longer holds: its open renewal work is called off.
          await callOffLicenseRenewals(
            tx,
            { farmId, licenseId: input.id },
            audited(context).recordEvent
          );
          await tellTheOwnerOfTheChange(context, tx, { retired: input.id });
        }
      );
      return { id: input.id };
    }),

  /** Photographs a License's certificate; the one before is kept. From the Owner's or the Manager's own phone. */
  setCertificate: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(photoInput.extend({ licenseId: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const farmId = context.farm.id;
      const { licenseId, ...photo } = input;
      let kept = "";
      await audited(context).write(
        {
          entity: "license_certificate",
          entityId: () => kept,
          action: "create",
          after: () =>
            Promise.resolve({
              id: kept,
              licenseId,
              contentType: photo.contentType,
              takenAt: now.toISOString(),
            }),
        },
        async (tx) => {
          await heldLicense(tx, farmId, licenseId);
          kept = await keepLicenseCertificate(
            tx,
            { farmId, licenseId },
            photo,
            { by: context.actor.id, now }
          );
          await tellTheOwnerOfTheChange(context, tx, { certificate: kept });
        }
      );
      return { id: kept, takenAt: now };
    }),

  /** A License's certificate as last photographed. */
  certificate: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .input(z.object({ licenseId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await context.db.query.licenseCertificate.findFirst({
        where: { farmId: context.farm.id, licenseId: input.licenseId },
        columns: { contentType: true, data: true },
        orderBy: { takenAt: "desc", id: "desc" },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND", {
          message: "No certificate has been photographed",
        });
      }
      return row;
    }),
};
