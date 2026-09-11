import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import {
  ANIMAL_SOURCES,
  SEXES,
  animal,
  animalMove,
  animalPhoto,
  retag,
} from "@OpenFarm/db/schema/herd";
import type { AnimalState } from "@OpenFarm/domain";
import {
  ENTRY_STATES,
  EXIT_STATES,
  LIVE_STATES,
  PHOTO_MAX_BYTES,
  SIDES,
  STATES,
  canTransition,
  lactationView,
  sideOfState,
  stateAfterSideChange,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { applyMove } from "../completion-store";
import type { Context } from "../context";
import { parseCsvRecords } from "../csv";
import {
  assertPenIsTheirs,
  loadLiveAnimal,
  nextTagNumber,
  requireAnimal,
  requirePen,
} from "../herd-store";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

/** The opening register runs one transaction per row inside one request; a 100–500 head farm
 *  fits comfortably, and a larger register should be pasted in batches. */
const IMPORT_MAX_ROWS = 600;

const tagInput = z.string().trim().min(1).max(32);
const reasonInput = z.string().trim().min(1).max(200);

const animalFields = {
  sex: z.enum(SEXES),
  side: z.enum(SIDES),
  penId: z.string(),
  source: z.enum(ANIMAL_SOURCES),
  breed: z.string().trim().max(60).optional(),
  birthDate: z.coerce.date().optional(),
  officialTag: z.string().trim().max(60).optional(),
  aliases: z.array(z.string().trim().min(1).max(60)).default([]),
  /** When she last calved, for a cow already in milk when the register opens. Her Lactation
   *  number and days-in-milk are derived from it — until breeding arrives (increment 5) and
   *  Calving writes it, this seed is the only way the farm's history gets in. */
  calvedAt: z.coerce.date().optional(),
} as const;

/** A newly arriving Animal: only the States an animal can arrive in. */
const registerInput = z.object({
  ...animalFields,
  state: z.enum(ENTRY_STATES),
});

/** The opening register records a herd that already exists, so any live State is allowed. */
const importRowInput = z.object({
  ...animalFields,
  state: z.enum(LIVE_STATES),
});
type NewAnimal = z.infer<typeof importRowInput>;

const summaryColumns = {
  id: true,
  tagNumber: true,
  officialTag: true,
  aliases: true,
  sex: true,
  side: true,
  state: true,
  penId: true,
  source: true,
  breed: true,
  birthDate: true,
  photoUpdatedAt: true,
  lactationNumber: true,
  lactationStartedAt: true,
  milkWithdrawalUntil: true,
} as const;

/** Staff see only their assigned Pens; everyone else sees the Pen they asked for, or all. */
const penScope = (assigned: string[] | null, requested: string | undefined) => {
  if (assigned) {
    const visible = requested
      ? assigned.filter((id) => id === requested)
      : assigned;
    return { penId: { in: visible } };
  }
  return requested ? { penId: requested } : {};
};

/** A calving date is the one thing about a Lactation anyone gives us, so it is the one thing
 *  worth refusing when it is impossible. */
const assertCalvedInThePast = (calvedAt: Date | undefined, now: Date) => {
  if (calvedAt && calvedAt.getTime() > now.getTime()) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A calving date cannot be in the future",
    });
  }
};

/** The Lactation a newly recorded Animal is already in. An Animal registered straight into
 *  Milking — the opening register's dairy cows — is in her first recorded Lactation; nobody
 *  types the number. Without a seeded calving date the start stays unknown: registering her
 *  is not a calving, and dating it today would say she is on day 0 of a Lactation she may be
 *  two hundred days into. */
const openingLactation = (state: AnimalState, calvedAt: Date | undefined) =>
  state === "milking"
    ? { lactationNumber: 1, lactationStartedAt: calvedAt ?? null }
    : { lactationNumber: 0, lactationStartedAt: null };

/** A cow reaching Milking has calved, so her next Lactation begins: the number goes up by
 *  one and the clock starts. Nothing else touches these — days-in-milk is derived from the
 *  start date, never entered. Going Dry ends the Lactation without forgetting it, so her
 *  total for it still reads back. */
const startingLactation = (
  current: { state: AnimalState; lactationNumber: number },
  next: AnimalState,
  calvedAt: Date | undefined,
  now: Date
) => {
  if (next !== "milking" || current.state === "milking") {
    return {};
  }
  assertCalvedInThePast(calvedAt, now);
  // She reached Milking, so she calved: today unless a date says otherwise.
  return {
    lactationNumber: current.lactationNumber + 1,
    lactationStartedAt: calvedAt ?? now,
  };
};

/** The Animal an entry State implies must belong to the Side it is registered on. */
const assertStateFitsSide = (side: string, state: AnimalState) => {
  if (sideOfState(state) !== side) {
    throw new ORPCError("BAD_REQUEST", {
      message: `An animal in state ${state} cannot be registered on the ${side} side`,
    });
  }
};

/** The Animal as the audit trail records it. Every animal-scoped event is keyed on the
 *  Animal's id — the same key `register` used — so its history reads back whole. */
const readAnimal = async (tx: Tx, animalId: string) => {
  const row = await tx.query.animal.findFirst({
    where: { id: animalId },
    columns: summaryColumns,
  });
  return row ?? null;
};

type FarmContext = Context & {
  farm: { id: string; name: string };
  actor: { id: string; name: string };
};

/** Creates one Animal and its arrival Move as a single audited write. */
const createAnimal = async (
  context: FarmContext,
  input: NewAnimal,
  now: Date,
  reason: string
): Promise<{ id: string; tagNumber: string }> => {
  assertCalvedInThePast(input.calvedAt, now);
  const id = newId(now);
  let tagNumber = "";
  await audited(context).write(
    {
      entity: "animal",
      entityId: id,
      action: "create",
      after: (tx) => readAnimal(tx, id),
    },
    async (tx) => {
      await requirePen(tx, context.farm.id, input.penId);
      tagNumber = await nextTagNumber(tx, context.farm.id, input.side);
      await tx.insert(animal).values({
        id,
        farmId: context.farm.id,
        tagNumber,
        officialTag: input.officialTag ?? null,
        aliases: input.aliases,
        sex: input.sex,
        side: input.side,
        state: input.state,
        penId: input.penId,
        source: input.source,
        breed: input.breed ?? null,
        birthDate: input.birthDate ?? null,
        ...openingLactation(input.state, input.calvedAt),
        stateChangedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(animalMove).values({
        id: newId(now),
        farmId: context.farm.id,
        animalId: id,
        fromPenId: null,
        toPenId: input.penId,
        fromSide: null,
        toSide: input.side,
        reason,
        movedBy: context.actor.id,
        movedAt: now,
      });
    }
  );
  return { id, tagNumber };
};

export const animalsRouter = {
  /** Staff see their assigned Pens; everyone who runs the farm sees the whole herd. */
  list: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(
      z
        .object({
          penId: z.string().optional(),
          side: z.enum(SIDES).optional(),
          includeExited: z.boolean().default(false),
        })
        .default({ includeExited: false })
    )
    .handler(({ context, input }) => {
      const scoped = context.roleUsed === "staff";
      if (scoped && context.penIds.length === 0) {
        return [];
      }
      return context.db.query.animal.findMany({
        where: {
          farmId: context.farm.id,
          ...penScope(scoped ? context.penIds : null, input.penId),
          ...(input.side ? { side: input.side } : {}),
          ...(input.includeExited
            ? {}
            : { state: { notIn: [...EXIT_STATES] } }),
        },
        columns: summaryColumns,
        orderBy: { tagNumber: "asc" },
      });
    }),

  /** Any signed-in person may look up any animal by Tag Number, read-only. */
  byTag: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ tagNumber: tagInput }))
    .handler(async ({ context, input }) => {
      const row = await context.db.query.animal.findFirst({
        where: {
          farmId: context.farm.id,
          tagNumber: input.tagNumber.toUpperCase(),
        },
        columns: summaryColumns,
        with: {
          pen: {
            columns: { id: true, name: true },
            with: { shed: { columns: { name: true } } },
          },
          moves: {
            orderBy: { movedAt: "desc" },
            limit: 20,
            // Both ends of the journey, and the work that walked her — so her history reads
            // as one story rather than as a Move nobody can account for.
            with: {
              completion: { columns: { instanceId: true } },
              fromPen: { columns: { name: true } },
              toPen: { columns: { name: true } },
            },
          },
          retags: { orderBy: { retaggedAt: "desc" }, limit: 20 },
          // What people have seen of her lately, withdrawn ones included: a Sighting that
          // was corrected is still something somebody said on the round.
          sightings: {
            orderBy: { seenAt: "desc" },
            limit: 20,
            with: {
              completion: { columns: { instanceId: true } },
              seer: { columns: { name: true } },
            },
          },
        },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND", {
          message: `No animal with tag ${input.tagNumber}`,
        });
      }
      return {
        ...row,
        moves: row.moves.map(({ completion, fromPen, toPen, ...move }) => ({
          ...move,
          fromPenName: fromPen?.name ?? null,
          toPenName: toPen.name,
          instanceId: completion?.instanceId ?? null,
        })),
        sightings: row.sightings.map(({ completion, seer, ...seen }) => ({
          ...seen,
          instanceId: completion.instanceId,
          seenByName: seer?.name ?? null,
          withdrawn: seen.withdrawnAt !== null,
        })),
        ...lactationView(row, context.clock.now()),
      };
    }),

  /** Registers an Animal and assigns the next Tag Number for the Side it came from. */
  register: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(registerInput)
    .handler(({ context, input }) => {
      assertStateFitsSide(input.side, input.state);
      return createAnimal(context, input, context.clock.now(), "registered");
    }),

  /** The only way an Animal's location changes. A Move changes the Pen; use changeSide to
   *  cross to the other Side. The Tag Number never changes either way. */
  move: protectedProcedure
    .use(requireRole("owner", "manager", "staff"))
    .input(
      z.object({
        tagNumber: tagInput,
        toPenId: z.string(),
        reason: reasonInput.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.tagNumber.toUpperCase();
      const target = await requireAnimal(
        context.db,
        context.farm.id,
        tagNumber
      );
      await audited(context).write(
        {
          entity: "animal",
          entityId: target.id,
          action: "update",
          before: (tx) => readAnimal(tx, target.id),
          after: (tx) => readAnimal(tx, target.id),
          reason: input.reason,
        },
        (tx) => applyMove(tx, context, input, now)
      );
      return { tagNumber, side: target.side, state: target.state };
    }),

  /** Moves an Animal to the other Side; the State the other Side implies comes with it. */
  changeSide: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        tagNumber: tagInput,
        toPenId: z.string(),
        toSide: z.enum(SIDES),
        reason: reasonInput.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.tagNumber.toUpperCase();
      const target = await requireAnimal(
        context.db,
        context.farm.id,
        tagNumber
      );
      await audited(context).write(
        {
          entity: "animal",
          entityId: target.id,
          action: "update",
          before: (tx) => readAnimal(tx, target.id),
          after: (tx) => readAnimal(tx, target.id),
          reason: input.reason,
        },
        async (tx) => {
          const current = await loadLiveAnimal(tx, context.farm.id, tagNumber);
          const nextState = stateAfterSideChange(current.state, input.toSide);
          if (!nextState) {
            throw new ORPCError("BAD_REQUEST", {
              message: `An animal in state ${current.state} cannot move to the ${input.toSide} side`,
            });
          }
          await requirePen(tx, context.farm.id, input.toPenId);
          await tx
            .update(animal)
            .set({
              penId: input.toPenId,
              side: input.toSide,
              state: nextState,
              ...(nextState === current.state ? {} : { stateChangedAt: now }),
              updatedAt: now,
            })
            .where(
              and(eq(animal.farmId, context.farm.id), eq(animal.id, current.id))
            );
          await tx.insert(animalMove).values({
            id: newId(now),
            farmId: context.farm.id,
            animalId: current.id,
            fromPenId: current.penId,
            toPenId: input.toPenId,
            fromSide: current.side,
            toSide: input.toSide,
            reason: input.reason ?? null,
            movedBy: context.actor.id,
            movedAt: now,
          });
        }
      );
      return { tagNumber };
    }),

  /** Advances an Animal's State. Illegal transitions are refused by name. */
  setState: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .input(
      z.object({
        tagNumber: tagInput,
        state: z.enum(STATES),
        reason: reasonInput.optional(),
        /** When she calved, for a cow entering Milking. Defaults to now. */
        calvedAt: z.coerce.date().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.tagNumber.toUpperCase();
      const target = await requireAnimal(
        context.db,
        context.farm.id,
        tagNumber
      );
      await audited(context).write(
        {
          entity: "animal",
          entityId: target.id,
          action: "update",
          before: (tx) => readAnimal(tx, target.id),
          after: (tx) => readAnimal(tx, target.id),
          reason: input.reason,
        },
        async (tx) => {
          const current = await loadLiveAnimal(tx, context.farm.id, tagNumber);
          if (!canTransition(current.state, input.state)) {
            throw new ORPCError("BAD_REQUEST", {
              message: `An animal cannot go from ${current.state} to ${input.state}`,
            });
          }
          await tx
            .update(animal)
            .set({
              state: input.state,
              side: sideOfState(input.state) ?? current.side,
              ...startingLactation(current, input.state, input.calvedAt, now),
              // When she reached it, so a State-triggered SOP can count its days from here
              // and tell this occasion apart from the last time she was in this State.
              stateChangedAt: now,
              updatedAt: now,
            })
            .where(
              and(eq(animal.farmId, context.farm.id), eq(animal.id, current.id))
            );
        }
      );
      return { tagNumber, state: input.state };
    }),

  /** A replacement Ear Tag carrying the same Tag Number. */
  retag: protectedProcedure
    .use(requireRole("owner", "manager", "staff"))
    .input(
      z.object({
        tagNumber: tagInput,
        reason: reasonInput,
        officialTag: z.string().trim().max(60).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.tagNumber.toUpperCase();
      const target = await requireAnimal(
        context.db,
        context.farm.id,
        tagNumber
      );
      assertPenIsTheirs(context, target.penId);
      await audited(context).write(
        {
          entity: "animal",
          entityId: target.id,
          action: "update",
          before: (tx) => readAnimal(tx, target.id),
          after: (tx) => readAnimal(tx, target.id),
          reason: input.reason,
        },
        async (tx) => {
          const current = await loadLiveAnimal(tx, context.farm.id, tagNumber);
          await tx.insert(retag).values({
            id: newId(now),
            farmId: context.farm.id,
            animalId: current.id,
            reason: input.reason,
            retaggedBy: context.actor.id,
            retaggedAt: now,
          });
          if (input.officialTag !== undefined) {
            await tx
              .update(animal)
              .set({ officialTag: input.officialTag, updatedAt: now })
              .where(eq(animal.id, current.id));
          }
        }
      );
      return { tagNumber };
    }),

  setPhoto: protectedProcedure
    .use(requireRole("owner", "manager", "staff"))
    .input(
      z.object({
        tagNumber: tagInput,
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        data: z.string().min(1).max(PHOTO_MAX_BYTES),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.tagNumber.toUpperCase();
      const target = await requireAnimal(
        context.db,
        context.farm.id,
        tagNumber
      );
      assertPenIsTheirs(context, target.penId);
      await audited(context).write(
        {
          entity: "animal",
          entityId: target.id,
          action: "update",
          before: (tx) => readAnimal(tx, target.id),
          after: (tx) => readAnimal(tx, target.id),
        },
        async (tx) => {
          const current = await loadLiveAnimal(tx, context.farm.id, tagNumber);
          await tx
            .insert(animalPhoto)
            .values({
              animalId: current.id,
              farmId: context.farm.id,
              contentType: input.contentType,
              data: input.data,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: animalPhoto.animalId,
              set: {
                contentType: input.contentType,
                data: input.data,
                updatedAt: now,
              },
            });
          await tx
            .update(animal)
            .set({ photoUpdatedAt: now, updatedAt: now })
            .where(eq(animal.id, current.id));
        }
      );
      return { tagNumber, photoUpdatedAt: now };
    }),

  photo: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ tagNumber: tagInput }))
    .handler(async ({ context, input }) => {
      const target = await requireAnimal(
        context.db,
        context.farm.id,
        input.tagNumber.toUpperCase()
      );
      const photo = await context.db.query.animalPhoto.findFirst({
        where: { animalId: target.id },
      });
      return photo
        ? { contentType: photo.contentType, data: photo.data }
        : null;
    }),

  /** The opening register: one row per Animal, old marks kept as aliases. Rows that cannot be
   *  imported are reported with their source line and reason; the rest are still created. */
  importRegister: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ csv: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const records = parseCsvRecords(input.csv);
      if (records.length > IMPORT_MAX_ROWS) {
        throw new ORPCError("BAD_REQUEST", {
          message: `At most ${IMPORT_MAX_ROWS} rows at a time`,
        });
      }
      const pens = await context.db.query.pen.findMany({
        where: { farmId: context.farm.id },
        columns: { id: true, name: true },
        with: { shed: { columns: { name: true } } },
      });
      const penByName = new Map(
        pens.flatMap((p) => [
          [p.name.toLowerCase(), p.id] as const,
          [`${p.shed.name}/${p.name}`.toLowerCase(), p.id] as const,
        ])
      );

      const imported: { line: number; tagNumber: string }[] = [];
      const failed: { line: number; reason: string }[] = [];
      const now = context.clock.now();

      for (const record of records) {
        const { line, values } = record;
        const parsed = importRowInput.safeParse({
          sex: values.sex,
          side: values.side,
          state: values.state,
          penId: penByName.get((values.pen ?? "").toLowerCase()) ?? "",
          source: values.source,
          breed: values.breed || undefined,
          birthDate: values.birth_date || undefined,
          calvedAt: values.calved_at || undefined,
          officialTag: values.official_tag || undefined,
          aliases: (values.alias ?? values.old_mark ?? "")
            .split(/[;|]/u)
            .map((value) => value.trim())
            .filter(Boolean),
        });
        if (!parsed.success) {
          failed.push({
            line,
            reason: parsed.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; "),
          });
          continue;
        }
        if (!parsed.data.penId) {
          failed.push({ line, reason: `unknown pen "${values.pen ?? ""}"` });
          continue;
        }
        if (sideOfState(parsed.data.state) !== parsed.data.side) {
          failed.push({
            line,
            reason: `state ${parsed.data.state} does not belong to the ${parsed.data.side} side`,
          });
          continue;
        }
        try {
          // Deliberately sequential: each row is its own audited transaction (one bad row
          // cannot undo the good ones) and tag numbers must be taken in file order.
          // oxlint-disable-next-line no-await-in-loop
          const created = await createAnimal(
            context,
            parsed.data,
            now,
            "opening register"
          );
          imported.push({ line, tagNumber: created.tagNumber });
        } catch (error) {
          failed.push({
            line,
            reason: error instanceof Error ? error.message : "could not import",
          });
        }
      }
      return { imported, failed, total: records.length };
    }),
};
