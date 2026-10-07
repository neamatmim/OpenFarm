import { uuidv7 } from "@OpenFarm/db/ids";
import {
  and,
  eq,
  gte,
  isNull,
  like,
  not,
  or,
  sql,
} from "@OpenFarm/db/operators";
import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import {
  sopDefinition,
  sopProposal,
  sopTraining,
  sopVersion,
} from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import {
  findPublishBlockers,
  mayBePrescribed,
  standardPlaybook,
  whyNotPrescribable,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import { raiseAlerts } from "../alerts-store";
import type { Trail, Tx } from "../audit";
import { audited } from "../audit";
import { protectedProcedure } from "../index";
import { nameTaken } from "../names";
import { tell } from "../notice";
import { requirePersonalSession, requireRole } from "../roles";
import {
  asSopContent,
  publishedContent,
  sopContentSchema,
} from "../sop-content";
import { callOffWork } from "../work-transitions";

const note = z.string().trim().max(400).optional();

/**
 * A campaign names the product it gives every animal in the Pen. That product has to be on
 * the farm's own Drug List and have its withdrawal days written down — otherwise the campaign
 * would put milk in the tank that nobody could call safe, and the shed would find out about it
 * with the syringe in hand rather than the Owner finding out here.
 *
 * Checked when the Version is published, because a Version is immutable and this is the moment
 * it becomes the farm's word. Days cleared afterwards cannot happen: nothing on the farm
 * clears them.
 */
const assertProductsMayBeGiven = async (
  tx: Tx,
  farmId: string,
  content: SopContent
): Promise<void> => {
  const named = content.steps.flatMap((step) =>
    step.effect?.kind === "treatment" && step.effect.productId
      ? [step.effect.productId]
      : []
  );
  if (named.length === 0) {
    return;
  }
  const known = await tx.query.drugProduct.findMany({
    where: { farmId, id: { in: named } },
    columns: {
      id: true,
      nameBn: true,
      milkWithdrawalDays: true,
      meatWithdrawalDays: true,
      retiredAt: true,
    },
  });
  for (const productId of named) {
    const product = known.find((row) => row.id === productId);
    if (!product) {
      throw new ORPCError("BAD_REQUEST", {
        message: "That product is not on the farm's drug list",
        data: { refusal: "no_such_product" },
      });
    }
    if (!mayBePrescribed(product)) {
      throw new ORPCError("BAD_REQUEST", {
        message: `${product.nameBn} has no withdrawal days written down, so a campaign cannot give it`,
        data: { refusal: whyNotPrescribable(product) },
      });
    }
  }
};

/**
 * The farm has one procedure for each act that raises its own work: one it treats with, one it
 * reports with.
 *
 * Those acts raise their work against the SOP that says they raise it, and with two of those the
 * farm would have to pick — silently, by some rule nobody asked for, and differently from the one
 * the Owner had in mind. Retiring the old one first is how a farm changes how it treats or how it
 * reports, and that is the same act as changing anything else in the Playbook.
 */
const RAISED_BY_AN_ACT = [
  {
    kind: "prescription" as const,
    refusal: "treatment_sop_exists",
    message:
      "The farm already has a procedure a prescription raises; retire that one first — the doses it owes still finish on it",
  },
  {
    kind: "notifiable_disease" as const,
    refusal: "report_sop_exists",
    message:
      "The farm already has a procedure a notifiable diagnosis raises; retire that one first — the reports it owes still finish on it",
  },
];

const assertOneSuchProcedure = async (
  tx: Tx,
  farmId: string,
  definitionId: string,
  content: SopContent
): Promise<void> => {
  const raising = RAISED_BY_AN_ACT.filter((act) =>
    content.triggers.some((trigger) => trigger.kind === act.kind)
  );
  if (raising.length === 0) {
    return;
  }
  const live = await tx.query.sopDefinition.findMany({
    where: { farmId, retiredAt: { isNull: true } },
    columns: { id: true },
    with: { currentVersion: { columns: { content: true } } },
  });
  for (const act of raising) {
    const already = live.find(
      (definition) =>
        definition.id !== definitionId &&
        publishedContent(definition)?.triggers.some(
          (trigger) => trigger.kind === act.kind
        )
    );
    if (already) {
      throw new ORPCError("CONFLICT", {
        message: act.message,
        data: { refusal: act.refusal, definitionId: already.id },
      });
    }
  }
};

/**
 * The procedure, on this farm, still in force. A retired one says nothing new: it is not published to, proposed to or
 * approved into until the Owner brings it back, since a Version nobody's work is raised from would only look like the
 * farm's word.
 */
const requireInForce = async (
  tx: Tx,
  farmId: string,
  definitionId: string
): Promise<void> => {
  const definition = await tx.query.sopDefinition.findFirst({
    where: { id: definitionId, farmId },
    columns: { id: true, retiredAt: true },
  });
  if (!definition) {
    throw new ORPCError("NOT_FOUND");
  }
  if (definition.retiredAt) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This SOP has been retired",
      data: { refusal: "sop_retired" },
    });
  }
};

/** A procedure as the trail keeps it either side of retiring it or bringing it back. */
const readStanding = async (tx: Tx, farmId: string, definitionId: string) =>
  (await tx.query.sopDefinition.findFirst({
    where: { id: definitionId, farmId },
    columns: { retiredAt: true },
  })) ?? null;

/** The procedure, on this farm, as retiring it and bringing it back need it: whether it is retired, and what it says. */
const requireProcedure = async (
  db: Pick<Tx, "query">,
  farmId: string,
  definitionId: string
) => {
  const definition = await db.query.sopDefinition.findFirst({
    where: { id: definitionId, farmId },
    columns: { id: true, retiredAt: true, standardKey: true },
    with: { currentVersion: { columns: { content: true } } },
  });
  if (!definition) {
    throw new ORPCError("NOT_FOUND");
  }
  return definition;
};

/**
 * Tells the Role that does a procedure's work that it was retired or brought back: it is their list the work leaves,
 * or comes back to. Each act is its own notice, so a procedure retired a second time is told a second time.
 */
const tellItsDoers = async (
  tx: Tx,
  farmId: string,
  kind: "sop_retired" | "sop_restored",
  {
    eventId,
    definitionId,
    content,
    now,
  }: {
    eventId: string;
    definitionId: string;
    content: SopContent | null;
    now: Date;
  }
): Promise<void> => {
  if (!content) {
    return;
  }
  await tell(
    tx,
    farmId,
    {
      kind,
      about: { id: eventId, assignedRole: content.assignedRole },
      facts: {
        sopBn: content.name.bn,
        sopEn: content.name.en ?? content.name.bn,
        definitionId,
      },
    },
    now
  );
};

/**
 * Tells whoever proposed a change what became of it, with the Owner's reason: the Manager's suggestion vanished from the
 * list either way, and the reason a rejection had to give reached only the trail. Nobody is told of their own decision.
 */
const tellTheProposer = async (
  tx: Tx,
  context: { farm: { id: string }; actor: { id: string } },
  answered: {
    id: string;
    proposedBy: string | null;
    content: SopContent;
    approved: boolean;
    note: string | null;
    now: Date;
  }
) => {
  if (!answered.proposedBy || answered.proposedBy === context.actor.id) {
    return;
  }
  await raiseAlerts(
    tx,
    context.farm.id,
    [answered.proposedBy],
    {
      kind: "proposal_answered",
      entity: "sop_proposal",
      entityId: answered.id,
      params: {
        sopBn: answered.content.name.bn,
        sopEn: answered.content.name.en ?? answered.content.name.bn,
        approved: answered.approved,
        note: answered.note ?? "",
      },
    },
    answered.now
  );
};

/**
 * Refuses a standard procedure adopted while one adopted from it is in force: adopted twice, under whatever names, it
 * raised every Pen's head count twice. The database's index says the same; this says it in words.
 */
const assertStandardFree = async (
  tx: Tx,
  farmId: string,
  standardKey: string
) => {
  const adopted = await tx.query.sopDefinition.findFirst({
    where: { farmId, standardKey, retiredAt: { isNull: true } },
    columns: { id: true },
  });
  if (adopted) {
    throw new ORPCError("CONFLICT", {
      message: "The farm already has this standard procedure in force",
      data: { refusal: "sop_standard_adopted" },
    });
  }
};

/**
 * Refuses a procedure named as another in force already is, in either language — the farm's name-clash rule. The
 * standard head count adopted twice was two procedures raising every Pen's count twice, and one renamed brought the
 * standard one back on offer. A retired procedure's name is free again, as it raises nothing.
 */
const assertNameFree = async (
  tx: Tx,
  farmId: string,
  definitionId: string,
  name: SopContent["name"]
) => {
  const inForce = await tx.query.sopDefinition.findMany({
    where: { farmId, retiredAt: { isNull: true } },
    columns: { id: true },
    with: { currentVersion: { columns: { content: true } } },
  });
  const named = inForce.flatMap((one) => {
    const said = (one.currentVersion?.content as SopContent | undefined)?.name;
    return said
      ? [{ id: one.id, nameBn: said.bn, nameEn: said.en ?? null }]
      : [];
  });
  if (nameTaken(named, name, definitionId)) {
    throw new ORPCError("CONFLICT", {
      message: "Another procedure in force already has this name",
      data: { refusal: "sop_name_taken" },
    });
  }
};

/**
 * Refuses a publish begun from a Version the procedure has moved on from: an edit started from a copy cached days ago,
 * or a Manager's proposal drafted against Version 1 approved after the Owner published Version 2, published whole and
 * quietly undid what came between. Drafted again from the Version in force, nothing is lost unseen.
 */
const assertNotMovedOn = async (
  tx: Tx,
  farmId: string,
  definitionId: string,
  basedOn: {
    versionId: string | null;
    refusal: "changed_since_you_began" | "proposal_out_of_date";
  }
) => {
  const definition = await tx.query.sopDefinition.findFirst({
    where: { id: definitionId, farmId },
    with: { currentVersion: { columns: { id: true, number: true } } },
  });
  const inForce = definition?.currentVersion ?? null;
  if (inForce && inForce.id !== basedOn.versionId) {
    throw new ORPCError("CONFLICT", {
      message:
        basedOn.refusal === "proposal_out_of_date"
          ? "The procedure has had a newer Version since this proposal was drafted"
          : "The procedure has had a newer Version since you began this change",
      data: { refusal: basedOn.refusal, version: inForce.number },
    });
  }
};

/** Publishing is the only way an SOP's content changes: a new immutable Version, and the
 *  Definition pointed at it. Nothing ever rewrites a published Version (ADR 0001). */
const publishVersion = async (
  tx: Tx,
  {
    farmId,
    definitionId,
    content,
    note: publishNote,
    actorId,
    roleUsed,
    now,
    trail,
    basedOn,
  }: {
    farmId: string;
    definitionId: string;
    content: SopContent;
    note?: string;
    actorId: string;
    roleUsed: string | null;
    now: Date;
    /** Where calling off the old Version's work still to come is written. */
    trail: Trail;
    /** The Version the edit or the proposal was begun from, where it says: refused once a newer one is in force. */
    basedOn?: {
      versionId: string | null;
      refusal: "changed_since_you_began" | "proposal_out_of_date";
    };
  }
): Promise<{ id: string; number: number }> => {
  // One publish at a time for one procedure: two at once — the Owner's phone and her desk, Approve beside Publish —
  // both counted the same next number, and one met the database's own refusal in English.
  await tx.execute(
    sql`select 1 from ${sopDefinition} where ${sopDefinition.id} = ${definitionId} for update`
  );
  await requireInForce(tx, farmId, definitionId);
  if (basedOn) {
    await assertNotMovedOn(tx, farmId, definitionId, basedOn);
  }
  const blockers = findPublishBlockers(content);
  if (blockers.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: `This cannot be published yet — ${blockers.join("; ")}`,
      data: { blockers },
    });
  }
  await assertProductsMayBeGiven(tx, farmId, content);
  await assertOneSuchProcedure(tx, farmId, definitionId, content);
  // After what is wrong with the procedure itself: a name already in force is a clash with the farm, said last.
  await assertNameFree(tx, farmId, definitionId, content.name);
  const previous = await tx.query.sopVersion.findMany({
    where: { definitionId },
    columns: { number: true },
    orderBy: { number: "desc" },
    limit: 1,
  });
  const number = (previous[0]?.number ?? 0) + 1;
  const id = uuidv7(now);
  await tx.insert(sopVersion).values({
    id,
    farmId,
    definitionId,
    number,
    content,
    note: publishNote ?? null,
    publishedBy: actorId,
    publishedByRole: roleUsed as never,
    publishedAt: now,
  });
  await tx
    .update(sopDefinition)
    .set({ currentVersionId: id })
    .where(
      and(eq(sopDefinition.id, definitionId), eq(sopDefinition.farmId, farmId))
    );
  // The old Version's scheduled work still to come and not yet taken is the old times': called off, for the new
  // Version to raise at its own. What is under way, or past, stays — a morning's milking done at five is not raised
  // again at half past because the afternoon moved.
  if (number > 1) {
    await callOffWork(
      tx,
      farmId,
      and(
        eq(sopInstance.definitionId, definitionId),
        // Its Pens' scheduled work, and the whole farm's, which carries its time as its cause. A slot the new Version
        // keeps is taken back up under it when the day's work is raised next.
        or(isNull(sopInstance.cause), like(sopInstance.cause, "whole-farm:%")),
        gte(sopInstance.dueAt, now)
      ) as SQL,
      { trail, by: "version_published", unstartedOnly: true }
    );
  }

  // Everybody whose Role does this work is told a new Version exists. It is written to the
  // farm's notification list and shown in-app, and it is deliberately not pushed: a changed
  // procedure costs nothing if it is read at six in the morning, and Push is for what costs
  // money or breaks a deadline. Ticket 23 batches notices like this into the morning and
  // evening digests. What actually changed is shown on the work itself, the first time the
  // person opens it.
  if (number > 1) {
    await tell(
      tx,
      farmId,
      {
        kind: "sop_published",
        about: { id, assignedRole: content.assignedRole },
        facts: {
          sopBn: content.name.bn,
          sopEn: content.name.en ?? content.name.bn,
          number,
        },
      },
      now
    );
  }
  return { id, number };
};

export const sopsRouter = {
  /** The Playbook: every SOP with the Version in force. */
  list: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(({ context }) =>
      context.db.query.sopDefinition.findMany({
        where: { farmId: context.farm.id },
        with: { currentVersion: true },
        orderBy: { createdAt: "asc" },
      })
    ),

  get: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await context.db.query.sopDefinition.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        with: {
          currentVersion: true,
          versions: {
            columns: { id: true, number: true, publishedAt: true, note: true },
          },
        },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND");
      }
      return row;
    }),

  /** Any Version, by its number — what the farm shows when asked what was in force. */
  version: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(
      z.object({ definitionId: z.string(), number: z.number().int().min(1) })
    )
    .handler(async ({ context, input }) => {
      const row = await context.db.query.sopVersion.findFirst({
        where: {
          farmId: context.farm.id,
          definitionId: input.definitionId,
          number: input.number,
        },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND");
      }
      return row;
    }),

  /** Creates the SOP and publishes its first Version in one act. */
  create: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(
      z.object({
        content: sopContentSchema,
        note,
        /** The standard procedure it is adopted from, where it is: what it is, whatever it is renamed later. */
        standardKey: z
          .string()
          .refine((key) => Object.hasOwn(standardPlaybook(), key))
          .optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const definitionId = uuidv7(now);
      let published = { id: "", number: 0 };
      await audited(context).write(
        {
          entity: "sop",
          entityId: definitionId,
          action: "create",
          after: { name: input.content.name, version: 1 },
          reason: input.note,
        },
        async (tx) => {
          if (input.standardKey) {
            await assertStandardFree(tx, context.farm.id, input.standardKey);
          }
          await tx.insert(sopDefinition).values({
            id: definitionId,
            farmId: context.farm.id,
            standardKey: input.standardKey ?? null,
            createdBy: context.actor.id,
            createdAt: now,
          });
          published = await publishVersion(tx, {
            trail: audited(context).recordEvent,
            farmId: context.farm.id,
            definitionId,
            content: asSopContent(input.content),
            note: input.note,
            actorId: context.actor.id,
            roleUsed: context.roleUsed,
            now,
          });
        }
      );
      return {
        definitionId,
        versionId: published.id,
        number: published.number,
      };
    }),

  /** Publishes the next Version. The previous one is untouched. */
  publish: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(
      z.object({
        definitionId: z.string(),
        content: sopContentSchema,
        note,
        /** The Version the Owner's edit began from: refused once a newer one is in force. */
        basedOnVersionId: z.string().nullable().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      let published = { id: "", number: 0 };
      await audited(context).write(
        {
          entity: "sop",
          entityId: input.definitionId,
          action: "update",
          before: async (tx) => {
            const row = await tx.query.sopDefinition.findFirst({
              where: { id: input.definitionId },
              with: { currentVersion: { columns: { number: true } } },
            });
            return { version: row?.currentVersion?.number ?? null };
          },
          after: async (tx) => {
            const row = await tx.query.sopDefinition.findFirst({
              where: { id: input.definitionId },
              with: { currentVersion: { columns: { number: true } } },
            });
            return { version: row?.currentVersion?.number ?? null };
          },
          reason: input.note,
        },
        async (tx) => {
          published = await publishVersion(tx, {
            trail: audited(context).recordEvent,
            farmId: context.farm.id,
            definitionId: input.definitionId,
            content: asSopContent(input.content),
            note: input.note,
            actorId: context.actor.id,
            roleUsed: context.roleUsed,
            now,
            ...(input.basedOnVersionId === undefined
              ? {}
              : {
                  basedOn: {
                    versionId: input.basedOnVersionId,
                    refusal: "changed_since_you_began" as const,
                  },
                }),
          });
        }
      );
      return {
        definitionId: input.definitionId,
        versionId: published.id,
        number: published.number,
      };
    }),

  /**
   * The SOP Card: the published Version as it goes on the shed wall — what it is for, the
   * Steps in order, and what each one records. It names its own Version and the day it was
   * published, so a card somebody printed in March can be checked against the Playbook
   * rather than trusted.
   */
  card: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ definitionId: z.string() }))
    .handler(async ({ context, input }) => {
      const definition = await context.db.query.sopDefinition.findFirst({
        where: { id: input.definitionId, farmId: context.farm.id },
        with: { currentVersion: true },
      });
      if (!definition?.currentVersion) {
        throw new ORPCError("NOT_FOUND", {
          message: "That SOP has no published version yet",
        });
      }
      const content = definition.currentVersion.content as SopContent;
      // The medicine each campaign Step gives, by the farm's name for it: the card says what is given, not an id.
      const productIds = content.steps.flatMap((step) =>
        step.effect?.kind === "treatment" && step.effect.productId
          ? [step.effect.productId]
          : []
      );
      const products =
        productIds.length > 0
          ? await context.db.query.drugProduct.findMany({
              where: { farmId: context.farm.id, id: { in: productIds } },
              columns: { id: true, nameBn: true },
            })
          : [];
      return {
        productNames: Object.fromEntries(
          products.map((one) => [one.id, one.nameBn])
        ),
        definitionId: definition.id,
        versionId: definition.currentVersion.id,
        number: definition.currentVersion.number,
        publishedAt: definition.currentVersion.publishedAt,
        name: content.name,
        purpose: content.purpose,
        assignedRole: content.assignedRole,
        checkerRole: content.checkerRole,
        wholeFarm: content.wholeFarm === true,
        // Its card stays readable once it is retired — the work done under it points at it — but says it is.
        retired: definition.retiredAt !== null,
        triggers: content.triggers,
        steps: content.steps,
      };
    }),

  /**
   * Who has been taught what, for one SOP. `asOf` answers the question the farm actually
   * asks — "did they know this procedure on the day it went wrong" — by cutting the list at
   * that date and saying which Version was in force by then.
   */
  training: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        definitionId: z.string(),
        asOf: z.coerce.date().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const rows = await context.db.query.sopTraining.findMany({
        where: {
          farmId: context.farm.id,
          definitionId: input.definitionId,
          ...(input.asOf ? { trainedAt: { lte: input.asOf } } : {}),
        },
        orderBy: { trainedAt: "desc" },
        with: {
          version: { columns: { number: true, publishedAt: true } },
          person: { columns: { name: true } },
        },
      });
      // The Version in force on the day asked about: a person taught Version 2 while Version 4 is in force still needs
      // teaching, and the card said only "Version 2".
      const asOf = input.asOf ?? context.clock.now();
      const versions = await context.db.query.sopVersion.findMany({
        where: {
          farmId: context.farm.id,
          definitionId: input.definitionId,
          publishedAt: { lte: asOf },
        },
        columns: { id: true, number: true },
        orderBy: { number: "desc" },
        limit: 1,
      });
      const [inForce] = versions;
      const seen = new Set<string>();
      return rows.map(({ version, person, ...row }) => {
        // Rows come latest first: each person's first is what they were last taught.
        const latest = !seen.has(row.userId);
        seen.add(row.userId);
        return {
          ...row,
          versionNumber: version.number,
          versionPublishedAt: version.publishedAt,
          personName: person?.name ?? null,
          latest,
          versionInForce: inForce?.number ?? null,
          onVersionInForce: row.versionId === inForce?.id,
        };
      });
    }),

  /**
   * Records that a person was taught this Version. Never a flag: the farm keeps what was
   * taught and when, so "who knew which procedure" can be answered for any date, including
   * the day something went wrong.
   */
  recordTraining: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string(), versionId: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const version = await context.db.query.sopVersion.findFirst({
        where: { id: input.versionId, farmId: context.farm.id },
        columns: { id: true, definitionId: true, number: true },
      });
      if (!version) {
        throw new ORPCError("NOT_FOUND", { message: "No such version" });
      }
      // Somebody on this farm, and not somebody it has let go: training is a fact about the
      // people who do the work here.
      const person = await context.db.query.user.findFirst({
        where: { id: input.userId },
        columns: { id: true, disabledAt: true },
      });
      const roles = await context.db.query.roleAssignment.findMany({
        where: {
          farmId: context.farm.id,
          userId: input.userId,
          ...ACTIVE_ROLE,
        },
        columns: { role: true },
      });
      if (!person || person.disabledAt || roles.length === 0) {
        throw new ORPCError("NOT_FOUND", {
          message: "That is not somebody who works on this farm",
        });
      }
      // Already taught this Version: nothing changed, so nothing is written — least of all
      // an Audit Event saying something did.
      const already = await context.db.query.sopTraining.findFirst({
        where: { versionId: version.id, userId: input.userId },
        columns: { id: true },
      });
      if (already) {
        return { id: already.id, versionNumber: version.number, taught: false };
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "sop_training",
          entityId: id,
          action: "create",
          after: async (tx) => {
            const row = await tx.query.sopTraining.findFirst({
              where: { id },
              columns: { userId: true, versionId: true, trainedAt: true },
            });
            return row ?? null;
          },
        },
        async (tx) => {
          const [saved] = await tx
            .insert(sopTraining)
            .values({
              id,
              farmId: context.farm.id,
              definitionId: version.definitionId,
              versionId: version.id,
              userId: input.userId,
              trainedBy: context.actor.id,
              trainedByRole: context.roleUsed,
              trainedAt: now,
            })
            // Two Managers marking the same person at once: the second finds it written.
            .onConflictDoNothing()
            .returning({ id: sopTraining.id });
          if (!saved) {
            throw new ORPCError("CONFLICT", {
              message:
                "That person was already marked as trained on this version",
              data: { refusal: "already_trained" },
            });
          }
        }
      );
      return { id, versionNumber: version.number, taught: true };
    }),

  /** Proposed changes to an SOP, waiting for the Owner. */
  proposals: {
    list: protectedProcedure
      .use(requireRole("owner", "manager"))
      .handler(({ context }) =>
        context.db.query.sopProposal.findMany({
          // One waiting on a retired procedure waits for it to be brought back: nobody can approve it meanwhile.
          where: {
            farmId: context.farm.id,
            status: "pending",
            definition: { retiredAt: { isNull: true } },
          },
          with: {
            definition: {
              with: {
                currentVersion: { columns: { content: true, number: true } },
              },
            },
            proposer: { columns: { name: true } },
            basedOn: { columns: { number: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      ),

    /** A Manager's suggested change, waiting for the Owner. Approving it publishes a Version. */
    create: protectedProcedure
      .use(requireRole("owner", "manager"))
      .use(requirePersonalSession())
      .input(
        z.object({
          definitionId: z.string(),
          content: sopContentSchema,
          note,
          /** The Version the Manager's draft began from: refused once a newer one is in force. */
          basedOnVersionId: z.string().nullable().optional(),
        })
      )
      .handler(async ({ context, input }) => {
        const now = context.clock.now();
        const id = uuidv7(now);
        await audited(context).write(
          {
            entity: "sop_proposal",
            entityId: id,
            action: "create",
            after: { definitionId: input.definitionId, status: "pending" },
            reason: input.note,
          },
          async (tx) => {
            await requireInForce(tx, context.farm.id, input.definitionId);
            if (input.basedOnVersionId !== undefined) {
              await assertNotMovedOn(tx, context.farm.id, input.definitionId, {
                versionId: input.basedOnVersionId,
                refusal: "changed_since_you_began",
              });
            }
            const definition = await tx.query.sopDefinition.findFirst({
              where: { id: input.definitionId, farmId: context.farm.id },
              columns: { id: true, currentVersionId: true },
            });
            if (!definition) {
              throw new ORPCError("NOT_FOUND");
            }
            await tx.insert(sopProposal).values({
              id,
              farmId: context.farm.id,
              definitionId: input.definitionId,
              basedOnVersionId: definition.currentVersionId,
              content: input.content,
              note: input.note ?? null,
              status: "pending",
              proposedBy: context.actor.id,
              proposedByRole: context.roleUsed,
              createdAt: now,
            });
            // The Owner is the only person who can answer a proposal, so the Owner is who is
            // told. In the digest: a suggested change to the Playbook is not something to
            // wake anybody for (notification channels).
            await tell(
              tx,
              context.farm.id,
              {
                kind: "sop_proposed",
                about: { id },
                facts: {
                  sopBn: input.content.name.bn,
                  sopEn: input.content.name.en ?? input.content.name.bn,
                },
              },
              now
            );
          }
        );
        return { id, status: "pending" } as const;
      }),

    /** Approving a proposal is how a Manager's change becomes the Playbook. */
    approve: protectedProcedure
      .use(requireRole("owner"))
      .use(requirePersonalSession())
      .input(z.object({ id: z.string(), note }))
      .handler(async ({ context, input }) => {
        const now = context.clock.now();
        let published = { id: "", number: 0 };
        await audited(context).write(
          {
            entity: "sop_proposal",
            entityId: input.id,
            action: "update",
            before: { status: "pending" },
            after: { status: "approved" },
            reason: input.note,
          },
          async (tx) => {
            const [proposal] = await tx
              .update(sopProposal)
              .set({
                status: "approved",
                decidedBy: context.actor.id,
                decidedAt: now,
                decisionNote: input.note ?? null,
              })
              .where(
                and(
                  eq(sopProposal.id, input.id),
                  eq(sopProposal.farmId, context.farm.id),
                  eq(sopProposal.status, "pending")
                )
              )
              .returning({
                definitionId: sopProposal.definitionId,
                content: sopProposal.content,
                basedOnVersionId: sopProposal.basedOnVersionId,
                proposedBy: sopProposal.proposedBy,
              });
            if (!proposal) {
              throw new ORPCError("NOT_FOUND");
            }
            published = await publishVersion(tx, {
              trail: audited(context).recordEvent,
              farmId: context.farm.id,
              definitionId: proposal.definitionId,
              content: proposal.content as SopContent,
              note: input.note,
              actorId: context.actor.id,
              roleUsed: context.roleUsed,
              now,
              basedOn: {
                versionId: proposal.basedOnVersionId,
                refusal: "proposal_out_of_date",
              },
            });
            await tellTheProposer(tx, context, {
              id: input.id,
              proposedBy: proposal.proposedBy,
              content: proposal.content as SopContent,
              approved: true,
              note: input.note ?? null,
              now,
            });
          }
        );
        return {
          id: input.id,
          versionId: published.id,
          number: published.number,
        };
      }),

    reject: protectedProcedure
      .use(requireRole("owner"))
      .use(requirePersonalSession())
      .input(
        z.object({ id: z.string(), note: z.string().trim().min(1).max(400) })
      )
      .handler(async ({ context, input }) => {
        const now = context.clock.now();
        await audited(context).write(
          {
            entity: "sop_proposal",
            entityId: input.id,
            action: "update",
            before: { status: "pending" },
            after: { status: "rejected" },
            reason: input.note,
          },
          async (tx) => {
            const [row] = await tx
              .update(sopProposal)
              .set({
                status: "rejected",
                decidedBy: context.actor.id,
                decidedAt: now,
                decisionNote: input.note,
              })
              .where(
                and(
                  eq(sopProposal.id, input.id),
                  eq(sopProposal.farmId, context.farm.id),
                  eq(sopProposal.status, "pending")
                )
              )
              .returning({
                id: sopProposal.id,
                proposedBy: sopProposal.proposedBy,
                content: sopProposal.content,
              });
            if (!row) {
              throw new ORPCError("NOT_FOUND");
            }
            await tellTheProposer(tx, context, {
              id: input.id,
              proposedBy: row.proposedBy,
              content: row.content as SopContent,
              approved: false,
              note: input.note,
              now,
            });
          }
        );
        return { id: input.id, status: "rejected" } as const;
      }),
  },

  /**
   * Takes a procedure out of force: the farm raises no more of its work, by the clock, by what happens to an animal or
   * by hand, and the work it had raised that nobody has started is called off, each piece naming why. Work somebody
   * has taken or begun is theirs to finish, and its Versions, its card and everything done under it are kept — the
   * inspector's registers and the trail point at them. The Owner's, as publishing is.
   */
  retire: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ definitionId: z.string(), note }))
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      const existing = await requireProcedure(
        context.db,
        farmId,
        input.definitionId
      );
      if (existing.retiredAt) {
        return { definitionId: existing.id, calledOff: 0 };
      }
      const content = publishedContent(existing);
      const now = context.clock.now();
      const calledOff = await audited(context).write(
        {
          entity: "sop",
          entityId: existing.id,
          action: "update",
          before: (tx) => readStanding(tx, farmId, existing.id),
          after: (tx) => readStanding(tx, farmId, existing.id),
          reason: input.note,
        },
        async (tx, eventId) => {
          await tx
            .update(sopDefinition)
            .set({ retiredAt: now })
            .where(
              and(
                eq(sopDefinition.id, existing.id),
                eq(sopDefinition.farmId, farmId),
                isNull(sopDefinition.retiredAt)
              )
            );
          // Not what an act raised and still owes: a dose of a course the Vet prescribed, a report the livestock office
          // is owed. Those finish on the Version they were raised under — only the Vet stops a course (the Owner,
          // 2026-10-07). Retiring the treatment procedure called off every dose still to come on the farm, and nothing
          // raised them again.
          const called = await callOffWork(
            tx,
            farmId,
            and(
              eq(sopInstance.definitionId, existing.id),
              or(
                isNull(sopInstance.cause),
                and(
                  not(like(sopInstance.cause, "prescription:%")),
                  not(like(sopInstance.cause, "notifiable:%"))
                )
              )
            ) as SQL,
            {
              trail: audited(context).recordEvent,
              by: "sop_retired",
              unstartedOnly: true,
            }
          );
          await tellItsDoers(tx, farmId, "sop_retired", {
            eventId,
            definitionId: existing.id,
            content,
            now,
          });
          return called;
        }
      );
      return { definitionId: existing.id, calledOff: calledOff.length };
    }),

  /**
   * Puts a retired procedure back in force, as its last Version said it: its work is raised again from the next time
   * it comes due. What was called off when it was retired stays called off. Refused while another procedure does what
   * only one may — the one a prescription raises, the one a notifiable diagnosis raises.
   */
  restore: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ definitionId: z.string(), note }))
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      const now = context.clock.now();
      const existing = await requireProcedure(
        context.db,
        farmId,
        input.definitionId
      );
      if (!existing.retiredAt) {
        return { definitionId: existing.id };
      }
      const content = publishedContent(existing);
      await audited(context).write(
        {
          entity: "sop",
          entityId: existing.id,
          action: "update",
          before: (tx) => readStanding(tx, farmId, existing.id),
          after: (tx) => readStanding(tx, farmId, existing.id),
          reason: input.note,
        },
        async (tx, eventId) => {
          if (content) {
            await assertOneSuchProcedure(tx, farmId, existing.id, content);
            // Nor back beside one in force that has taken its name, or adopted its standard, while it was retired.
            await assertNameFree(tx, farmId, existing.id, content.name);
          }
          if (existing.standardKey) {
            await assertStandardFree(tx, farmId, existing.standardKey);
          }
          await tx
            .update(sopDefinition)
            .set({ retiredAt: null, restoredAt: now })
            .where(
              and(
                eq(sopDefinition.id, existing.id),
                eq(sopDefinition.farmId, farmId)
              )
            );
          await tellItsDoers(tx, farmId, "sop_restored", {
            eventId,
            definitionId: existing.id,
            content,
            now: context.clock.now(),
          });
        }
      );
      return { definitionId: existing.id };
    }),
};
