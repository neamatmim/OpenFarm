import type { Database } from "@OpenFarm/db";
import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import {
  ANIMAL_SOURCES,
  SEXES,
  animal,
  animalPhoto,
  retag,
} from "@OpenFarm/db/schema/herd";
import type { AnimalState } from "@OpenFarm/domain";
import {
  DISPOSALS,
  HEAT,
  ENTRY_STATES,
  EXIT_STATES,
  MORTALITY_KINDS,
  LIVE_STATES,
  PHOTO_MAX_BYTES,
  SIDES,
  STATES,
  failedAttempts,
  farmDayOf,
  lactationView,
  mayCorrect,
  withdrawalView,
  sideOfState,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { pregnancyTimesOf } from "../breeding-store";
import type { CalvingWorkFollowed } from "../calving-work";
import { followExpectedCalving } from "../calving-work";
import type { Context } from "../context";
import { correctionWindows, reasonInput, refusalData } from "../corrections";
import { parseCsvRecords } from "../csv";
import { recordNow } from "../entries/entry";
import { moveEntry, moveInput } from "../entries/move";
import { farmDay } from "../farm-clock";
import { fatteningOf } from "../fattening-store";
import {
  theConclusionAndWhatFollowed,
  withPrescriptions,
} from "../health-store";
import {
  animalSummaryColumns,
  assertPenIsTheirs,
  calves,
  entersState,
  insertAnimal,
  loadLiveAnimal,
  readAnimal,
  requireAnimal,
} from "../herd-store";
import { protectedProcedure } from "../index";
import { causeOf, heatKeyOf } from "../instances-store";
import {
  correctMortality,
  mortalityOf,
  readMortality,
  recordMortality,
  writeDisposal,
} from "../mortality-store";
import { requireRole } from "../roles";
import { assertOnTheirCases, onTheirCases } from "../visiting-store";

/** The opening register runs one transaction per row inside one request; a 100–500 head farm
 *  fits comfortably, and a larger register should be pasted in batches. */
const IMPORT_MAX_ROWS = 600;

const DAY_MS = 24 * 60 * 60 * 1000;

const tagInput = z.string().trim().min(1).max(32);

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
  /** Her Expected Calving, for a cow bought in carrying or on the opening register already in
   *  calf: the one screen where somebody knows (Owner, 2026-09-13). A farm day, not an instant —
   *  nobody knows the hour a cow will calve. */
  expectedCalvingOn: farmDay.optional(),
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

/** How much of her treatment history a page shows. Longer than her Moves or her Observations,
 *  because a course of six doses twice a year is what this list is made of, and the question it
 *  answers — what has she been given — looks back further than the others. */
const DOSES_SHOWN = 40;

/** Two years of fortnights. Long enough to see a whole fattening cycle and the one before it. */
const WEIGH_INS_SHOWN = 52;

/** How she left, for a page that has to say where a cow went. Money in numeric columns comes
 *  back as strings, and is converted here at the edge like the litres. */
const saleView = (
  row:
    | {
        id: string;
        priceBdt: string;
        weightKg: string;
        destination: string;
        vehicle: string;
        driver: string;
        note: string | null;
        soldAt: Date;
        buyer: { name: string };
      }
    | null
    | undefined
) =>
  row
    ? {
        id: row.id,
        priceBdt: Number(row.priceBdt),
        weightKg: Number(row.weightKg),
        destination: row.destination,
        vehicle: row.vehicle,
        driver: row.driver,
        note: row.note,
        soldAt: row.soldAt,
        buyerName: row.buyer.name,
      }
    : null;

/** More calvings than any cow has in her working life. */
const CALVINGS_SHOWN = 20;

/** Every service a breeding cow is likely to have had in her working life, and then some. */
const SERVICES_SHOWN = 60;

/**
 * Every time she has been served, newest first — the ones that did not take included, because a
 * run of failed services is what a Repeat Breeder is counted from.
 *
 * The sire by his Tag Number for a natural service, so her page names a bull rather than an id.
 */
const servicesOf = async (db: Database, animalId: string) => {
  const rows = await db.query.service.findMany({
    where: { animalId },
    orderBy: { servedAt: "desc", id: "desc" },
    limit: SERVICES_SHOWN,
    columns: {
      id: true,
      method: true,
      sireStraw: true,
      servedBy: true,
      heatId: true,
      servedAt: true,
    },
    with: { sire: { columns: { tagNumber: true } } },
  });
  return rows.map(({ sire, ...one }) => ({
    ...one,
    sireTagNumber: sire?.tagNumber ?? null,
  }));
};

/**
 * Her Pregnancy Checks, newest first, each with the first service of the attempt it checked — and how
 * many of her attempts did not take, which is what the Repeat Breeder flag will count. Counted by
 * attempt, so a heat served twice and found empty is one failure, and a cow served again before her
 * check came is one too.
 */
const pregnancyChecksOf = async (db: Database, animalId: string) => {
  const checks = await db.query.pregnancyCheck.findMany({
    where: { animalId },
    orderBy: { checkedAt: "desc", id: "desc" },
    columns: { id: true, result: true, checkedAt: true, serviceId: true },
    with: { service: { columns: { servedAt: true } } },
  });
  const services = await db.query.service.findMany({
    where: { animalId },
    columns: { id: true, animalId: true, servedAt: true },
  });
  return {
    pregnancyChecks: checks.map(({ service, ...check }) => ({
      ...check,
      firstServedAt: service.servedAt,
    })),
    failedAttempts: failedAttempts(services, checks),
  };
};

/** Three years of three-weekly heats, which is more than a breeding cow's history needs. */
const HEATS_SHOWN = 60;

/**
 * Her Heats, newest first, each with the AI work it raised.
 *
 * Read on their own rather than picked out of her recent Observations: a twice-daily heat-watch
 * round writes one for every cow, so her last twenty Observations are about a week — and the heat
 * that matters after a failed service is three weeks old. Read off the round's own record rather
 * than kept twice, because a Heat *is* an Observation of oestrus.
 */
const heatsOf = async (db: Database, animalId: string) => {
  const sightings = await db.query.observation.findMany({
    where: { animalId, saw: HEAT, withdrawnAt: { isNull: true } },
    orderBy: { seenAt: "desc", id: "desc" },
    limit: HEATS_SHOWN,
    columns: { id: true, seenAt: true },
  });
  if (sightings.length === 0) {
    return [];
  }
  // A sighting of a heat already begun raised nothing, so it has no work to point to — and that
  // is the page telling the truth rather than a link going missing.
  const work = await db.query.sopInstance.findMany({
    where: {
      animalId,
      cause: { in: sightings.map((seen) => causeOf(heatKeyOf(seen.id), 0)) },
    },
    columns: { id: true, cause: true, state: true },
  });
  const byCause = new Map(work.map((one) => [one.cause, one]));
  return sightings.map((seen) => {
    const raised = byCause.get(causeOf(heatKeyOf(seen.id), 0));
    return {
      id: seen.id,
      seenAt: seen.seenAt,
      workId: raised?.id ?? null,
      workState: raised?.state ?? null,
    };
  });
};

/**
 * Her arrival as her page reads it. The money and the weights live in numeric columns and come
 * back as strings; they are converted here at the edge rather than left to drift as floats.
 */
const intakeView = (
  row:
    | {
        id: string;
        purchasePriceBdt: string;
        weightKg: string;
        targetWeightKg: string;
        estimatedAgeMonths: number;
        targetWindowStart: string;
        targetWindowEnd: string;
        arrivedAt: Date;
        seller: { name: string; address: string | null } | null;
      }
    | null
    | undefined
) =>
  row
    ? {
        id: row.id,
        purchasePriceBdt: Number(row.purchasePriceBdt),
        weightKg: Number(row.weightKg),
        targetWeightKg: Number(row.targetWeightKg),
        estimatedAgeMonths: row.estimatedAgeMonths,
        targetWindow: {
          start: row.targetWindowStart,
          end: row.targetWindowEnd,
        },
        arrivedAt: row.arrivedAt,
        sellerName: row.seller?.name ?? null,
        sellerAddress: row.seller?.address ?? null,
      }
    : null;

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

/** The States a cow can be carrying in. */
const CARRYING_STATES = new Set<AnimalState>([
  "pregnant_heifer",
  "milking",
  "dry",
]);

/** The farm day somebody said she will calve, refused when it has gone or is further off than a cow
 *  carries. */
const expectedCalvingWithinReach = (
  day: string,
  now: Date,
  gestationDays: number
): Date => {
  const due = startOfFarmDay(day);
  if (Number.isNaN(due.getTime())) {
    throw new ORPCError("BAD_REQUEST", { message: `"${day}" is not a day` });
  }
  if (due < startOfFarmDay(farmDayOf(now))) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That day has already gone",
      data: { refusal: "expected_calving_passed" },
    });
  }
  if (due.getTime() > now.getTime() + gestationDays * DAY_MS) {
    throw new ORPCError("BAD_REQUEST", {
      message: "No cow calves further off than a whole gestation",
      data: { refusal: "expected_calving_too_far" },
    });
  }
  return due;
};

/**
 * The Expected Calving somebody gave for a cow already in calf when she reached this farm, as the
 * day it begins on the farm's clock — or nothing, for a cow nobody said was carrying.
 *
 * A Pregnant Heifer has to have one: registered carrying, she has no service on this farm to work a
 * date out from, and without one nothing would ever fall due for her — she would calve without
 * anybody having walked her to the calving pen. A cow in milk or Dry may be in calf or not, so hers is
 * given when somebody knows it.
 */
const enteredCalving = (
  state: AnimalState,
  day: string | undefined,
  now: Date,
  gestationDays: number
): { expectedCalvingAt: Date; expectedCalvingServiceId: null } | null => {
  if (!day) {
    if (state === "pregnant_heifer") {
      throw new ORPCError("BAD_REQUEST", {
        message: "A Pregnant Heifer needs the day she is expected to calve",
        data: { refusal: "expected_calving_needed" },
      });
    }
    return null;
  }
  if (!CARRYING_STATES.has(state)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `An animal in state ${state} is not carrying a calf`,
      data: { refusal: "expected_calving_without_pregnancy" },
    });
  }
  return {
    expectedCalvingAt: expectedCalvingWithinReach(day, now, gestationDays),
    expectedCalvingServiceId: null,
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

type FarmContext = Context & {
  farm: { id: string; name: string; gestationDays: number };
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
  const calving = enteredCalving(
    input.state,
    input.expectedCalvingOn,
    now,
    context.farm.gestationDays
  );
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
      const made = await insertAnimal(tx, {
        id,
        farmId: context.farm.id,
        actorId: context.actor.id,
        input,
        now,
        reason,
        extra: {
          ...openingLactation(input.state, input.calvedAt),
          ...calving,
        },
      });
      ({ tagNumber } = made);
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
      // Barn Staff who are also a visiting Vet see their Pens and their Cases together.
      const alsoCases =
        scoped && context.visiting && context.caseAnimalIds.length > 0;
      if (scoped && context.penIds.length === 0 && !alsoCases) {
        return [];
      }
      const theirs = alsoCases
        ? {
            OR: [
              penScope(context.penIds, input.penId),
              {
                id: { in: context.caseAnimalIds },
                ...(input.penId ? { penId: input.penId } : {}),
              },
            ],
          }
        : penScope(scoped ? context.penIds : null, input.penId);
      return context.db.query.animal.findMany({
        where: {
          farmId: context.farm.id,
          ...theirs,
          // A visiting Vet's herd is their Cases.
          ...(onTheirCases(context)
            ? { id: { in: context.caseAnimalIds } }
            : {}),
          ...(input.side ? { side: input.side } : {}),
          ...(input.includeExited
            ? {}
            : { state: { notIn: [...EXIT_STATES] } }),
        },
        columns: animalSummaryColumns,
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
        columns: animalSummaryColumns,
        with: {
          pen: {
            columns: { id: true, name: true },
            with: { shed: { columns: { name: true } } },
          },
          moves: {
            // ids are UUIDv7: time-ordered, so they break the tie when two Moves share an
            // instant — registering an animal walks her to her first Pen in the same
            // transaction as a Move recorded a moment later, and her history should not
            // depend on which row the database happens to hand back first.
            orderBy: { movedAt: "desc", id: "desc" },
            limit: 20,
            // Both ends of the journey, and the work that walked her — so her history reads
            // as one story rather than as a Move nobody can account for.
            with: {
              completion: { columns: { instanceId: true } },
              fromPen: { columns: { name: true } },
              toPen: { columns: { name: true } },
            },
          },
          retags: { orderBy: { retaggedAt: "desc", id: "desc" }, limit: 20 },
          // Every pregnancy she lost before calving, as the Vet recorded it.
          abortions: {
            orderBy: { abortedAt: "desc", id: "desc" },
            columns: {
              id: true,
              abortedAt: true,
              stageMonths: true,
              note: true,
              expectedCalvingAt: true,
            },
          },
          // Her mother, for a calf born here: a calf's page names who she came from.
          dam: { columns: { tagNumber: true } },
          // Every time she has calved, newest first, with what was born — a stillborn calf
          // included, because a calving history with a gap in it is not one.
          calvings: {
            orderBy: { calvedAt: "desc", id: "desc" },
            limit: CALVINGS_SHOWN,
            columns: {
              id: true,
              calvedAt: true,
              ease: true,
              lactationNumber: true,
            },
            with: {
              calves: {
                columns: {
                  tagNumber: true,
                  sex: true,
                  state: true,
                  calfOutcome: true,
                },
                orderBy: { calfPosition: "asc", id: "asc" },
              },
            },
          },
          // What people have seen of her lately, withdrawn ones included: an Observation
          // that was corrected is still something somebody said on the round.
          observations: {
            orderBy: { seenAt: "desc" },
            limit: 20,
            with: {
              completion: { columns: { instanceId: true } },
              observer: { columns: { name: true } },
              // What the Vet made of it, so her page reads as one chain — what the round
              // saw, and the conclusion drawn from it — rather than as two lists the reader
              // has to line up by date themselves.
              diagnoses: {
                orderBy: { diagnosedAt: "asc" },
                with: {
                  vet: { columns: { name: true } },
                  ...withPrescriptions,
                },
              },
            },
          },
          /** Every dose she has actually had, a course's or a campaign's. This is what a
           *  slaughter vet asks for: per animal, not per campaign. */
          /** How she went, for an animal who has left. */
          mortality: {
            with: {
              recorder: { columns: { name: true } },
              /** What she is said to have died of, and the report the farm owed for it. */
              diagnosis: {
                columns: { disease: true },
                with: { report: { columns: { reference: true } } },
              },
            },
          },
          treatments: {
            where: { givenAt: { isNotNull: true } },
            orderBy: { givenAt: "desc" },
            limit: DOSES_SHOWN,
            with: {
              product: { columns: { nameBn: true, nameEn: true } },
              giver: { columns: { name: true } },
            },
          },
          /** How she arrived, for an animal the farm bought in: what she cost, what she
           *  weighed off the lorry, and what she is being fed towards. */
          intake: {
            with: { seller: { columns: { name: true, address: true } } },
          },
          /** How she left, for an animal sold to a buyer: what she fetched, who took her,
           *  and what carried her. */
          sale: { with: { buyer: { columns: { name: true } } } },
          /** Every time she has been on the scale, newest first: her page answers "what does
           *  she weigh now" before it answers anything else. */
          weighIns: {
            orderBy: { weighedAt: "desc", id: "desc" },
            limit: WEIGH_INS_SHOWN,
            with: { weigher: { columns: { name: true } } },
          },
          /** The Vet came for something else and found this: a Diagnosis answering no
           *  Observation still belongs to her history. */
          diagnoses: {
            where: { observationId: { isNull: true } },
            orderBy: { diagnosedAt: "desc" },
            limit: 20,
            with: { vet: { columns: { name: true } }, ...withPrescriptions },
          },
        },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND", {
          message: `No animal with tag ${input.tagNumber}`,
        });
      }
      assertOnTheirCases(context, row.id);
      // Barn Staff record what they see and give the doses they are told to give; the
      // conclusions drawn from them are not theirs to read (roles matrix: Staff read
      // treatment instances only). They still see the round's own Observations.
      // Barn Staff who are also the visiting Vet on her Case read what a Vet would.
      const onTheirCase =
        context.visiting && context.caseAnimalIds.includes(row.id);
      const readsTheClinicalRecord =
        context.roleUsed !== "staff" || onTheirCase;
      // A separate question from the clinical one, and a separate row of the matrix: money is
      // the Owner's and the Manager's whoever else may read her history.
      const readsWhatSheCost =
        context.roleUsed === "owner" || context.roleUsed === "manager";
      return {
        ...row,
        moves: row.moves.map(({ completion, fromPen, toPen, ...move }) => ({
          ...move,
          fromPenName: fromPen?.name ?? null,
          toPenName: toPen.name,
          instanceId: completion?.instanceId ?? null,
        })),
        observations: row.observations.map(
          ({ completion, observer, diagnoses, ...seen }) => ({
            ...seen,
            instanceId: completion?.instanceId ?? null,
            seenByName: observer?.name ?? null,
            withdrawn: seen.withdrawnAt !== null,
            diagnoses: readsTheClinicalRecord
              ? diagnoses.map(theConclusionAndWhatFollowed)
              : [],
          })
        ),
        diagnoses: readsTheClinicalRecord
          ? row.diagnoses.map(theConclusionAndWhatFollowed)
          : [],
        mortality: row.mortality
          ? {
              kind: row.mortality.kind,
              happenedAt: row.mortality.happenedAt,
              cause: row.mortality.cause,
              disposal: row.mortality.disposal,
              disposalNote: row.mortality.disposalNote,
              recordedByName: row.mortality.recorder?.name ?? null,
              /** For the mortality register: what she died of, and the office's reference for
               *  it when the farm had to report it. */
              disease: row.mortality.diagnosis?.disease ?? null,
              reportReference:
                row.mortality.diagnosis?.report?.reference ?? null,
            }
          : null,
        /** Barn Staff give the doses, so they may read what has been given (roles matrix:
         *  treatment instances). What the Vet concluded stays the clinical record's own. */
        treatments: row.treatments.map(({ product, giver, ...dose }) => ({
          id: dose.id,
          givenAt: dose.givenAt,
          number: dose.number,
          fromPrescription: dose.prescriptionId !== null,
          productNameBn: product.nameBn,
          productNameEn: product.nameEn,
          givenByName: giver?.name ?? null,
        })),
        /** What the farm paid and who it bought her from is the Intake row of the roles
         *  matrix — `R` to the Owner, `C R U` to the Manager, and nothing to anybody else.
         *  A milker weighs her and a Vet treats her without being told what she cost. */
        intake: readsWhatSheCost ? intakeView(row.intake) : null,
        /** What she fetched is the money row too: the Owner's and the Manager's. */
        sale: readsWhatSheCost ? saleView(row.sale) : null,
        heats: await heatsOf(context.db, row.id),
        services: await servicesOf(context.db, row.id),
        ...(await pregnancyChecksOf(context.db, row.id)),
        /** What the scale means, which anybody who may see her may see. Null for an animal
         *  who is not on the Fattening side: "days on feed" about a milking cow is a number
         *  about nothing. */
        fattening:
          row.side === "fattening"
            ? fatteningOf(row.intake, row.weighIns, context.clock.now())
            : null,
        /** Kilogrammes live in a numeric column and come back as strings; converted here at
         *  the edge, like the litres, rather than left to drift as floats. */
        weighIns: row.weighIns.map(({ weigher, ...reading }) => ({
          id: reading.id,
          weightKg: Number(reading.weightKg),
          method: reading.method,
          weighedAt: reading.weighedAt,
          /** What the farm found doubtful about it, and null for one it did not doubt. */
          flagged: reading.flaggedNote !== null,
          flaggedNote: reading.flaggedNote,
          weighedByName: weigher?.name ?? null,
        })),
        ...lactationView(row, context.clock.now()),
        ...withdrawalView(row, context.clock.now()),
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

  /** The only way an Animal's location changes: to another Pen, or across to the other Side into one. The Tag Number
   *  never changes either way. */
  move: protectedProcedure
    .use(requireRole(...moveEntry.roles))
    .input(moveInput)
    .handler(async ({ context, input }) => {
      const tagNumber = input.tagNumber.toUpperCase();
      await recordNow(context, moveEntry, input);
      const moved = await requireAnimal(context.db, context.farm.id, tagNumber);
      return { tagNumber, side: moved.side, state: moved.state };
    }),

  /**
   * Records that an Animal died or was culled: when, the cause as far as the farm knows it, and
   * what was done with the carcass.
   *
   * The Owner's and the Manager's act, and nobody else's (roles matrix). It is one act, so it
   * is one transaction: she reaches her exit State and the mortality is written together, and
   * from that moment she is off the pen boards, out of the day's work and out of the
   * headcounts — everywhere at once, because everywhere reads the same State.
   *
   * Nothing of hers is removed. Her litres, her Treatments, her Moves and her Observations stay
   * exactly where they are: the farm's mortality register is read from this row, and the
   * six-month disease history an inspector asks for is read from the ones beside it.
   */
  recordMortality: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        tagNumber: tagInput,
        kind: z.enum(MORTALITY_KINDS),
        /** What the farm knows, not a diagnosis: a Vet's conclusion is a Diagnosis. */
        cause: z.string().trim().min(1).max(300),
        /** The Vet's conclusion the farm attributes it to, when there is one: this is how the
         *  mortality register reaches the DLS report reference for a notifiable death. */
        diagnosisId: z.string().optional(),
        disposal: z.enum(DISPOSALS),
        disposalNote: z.string().trim().max(300).optional(),
        /** When she went, if it was not now — the morning round finds her, the record is
         *  written at noon. */
        happenedAt: z.coerce.date().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.tagNumber.toUpperCase();
      const happenedAt = input.happenedAt ?? now;
      if (happenedAt > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "An animal cannot have died in the future",
        });
      }
      const id = newId(now);
      let closed = 0;
      await audited(context).write(
        {
          // Keyed on the Mortality, not on the animal, so that putting it right later is a
          // Correction pointing at this event rather than an edit nothing links back to. What
          // it says about her is in the snapshot, where the trail can read it.
          entity: "mortality",
          entityId: id,
          action: "create",
          after: (tx) => readMortality(tx, id),
        },
        async (tx) => {
          // Live, because an animal who has already left cannot leave again — and recording a
          // second exit over the first would lose which one the farm stands behind.
          const her = await loadLiveAnimal(tx, context.farm.id, tagNumber);
          ({ workClosed: closed } = await recordMortality(
            tx,
            {
              farmId: context.farm.id,
              recordedBy: context.actor.id,
              recordedByRole: context.roleUsed,
              now,
            },
            her,
            {
              id,
              kind: input.kind,
              happenedAt,
              cause: input.cause,
              diagnosisId: input.diagnosisId,
              disposal: input.disposal,
              disposalNote: input.disposalNote,
            }
          ));
        }
      );
      return { tagNumber, state: input.kind, workClosed: closed };
    }),

  /**
   * What was done with a carcass whose death was written before anybody could say: a stillborn calf, whose calving
   * recorded her death and left the disposal for the Manager (the Owner's decision, 2026-09-13). Written once; a
   * disposal already written is put right by a Correction, with its reason.
   */
  recordDisposal: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        tagNumber: tagInput,
        disposal: z.enum(DISPOSALS),
        disposalNote: z.string().trim().max(300).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const tagNumber = input.tagNumber.toUpperCase();
      const { existing } = await mortalityOf(
        context.db,
        context.farm.id,
        tagNumber
      );
      await audited(context).write(
        {
          entity: "mortality",
          entityId: existing.id,
          action: "update",
          before: (tx) => readMortality(tx, existing.id),
          after: (tx) => readMortality(tx, existing.id),
        },
        (tx) =>
          writeDisposal(tx, existing.id, {
            disposal: input.disposal,
            disposalNote: input.disposalNote,
          })
      );
      return { tagNumber, disposal: input.disposal };
    }),

  /**
   * Puts a mortality right: the cause the farm learned afterwards, the disposal written down
   * wrong, the morning it actually happened.
   *
   * A Correction like any other — it carries a reason, it is bounded by the Role's Correction
   * Window, and the trail holds what the record said before.
   *
   * Whether she died or was culled can be put right too: it is her exit State as well as this
   * row, so both move together, and a death written up as a cull by somebody in a hurry is a
   * mistake the farm can correct rather than live with.
   */
  correctMortality: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        tagNumber: tagInput,
        kind: z.enum(MORTALITY_KINDS).optional(),
        cause: z.string().trim().min(1).max(300).optional(),
        disposal: z.enum(DISPOSALS).optional(),
        disposalNote: z.string().trim().max(300).optional(),
        happenedAt: z.coerce.date().optional(),
        reason: reasonInput,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.tagNumber.toUpperCase();
      const { her, existing } = await mortalityOf(
        context.db,
        context.farm.id,
        tagNumber
      );
      if (input.happenedAt && input.happenedAt > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "An animal cannot have died in the future",
        });
      }
      const verdict = mayCorrect({
        roles: context.roles,
        isOwnEntry: existing.recordedBy === context.actor.id,
        recordedAt: existing.recordedAt,
        now,
        windows: correctionWindows(context.farm),
      });
      if (!verdict.allowed) {
        throw new ORPCError("FORBIDDEN", {
          message: "The correction window for that entry has closed",
          data: { refusal: refusalData(verdict.refusal) },
        });
      }
      const audit = audited(context);
      const previous = await audit.latestEventFor(
        context.db,
        "mortality",
        existing.id
      );
      await audit.write(
        {
          entity: "mortality",
          entityId: existing.id,
          action: "correct",
          reason: input.reason,
          roleUsed: verdict.role,
          supersedesId: previous?.id,
          before: (tx) => readMortality(tx, existing.id),
          after: (tx) => readMortality(tx, existing.id),
        },
        (tx) =>
          correctMortality(
            tx,
            context.farm.id,
            existing.id,
            her,
            {
              kind: input.kind,
              cause: input.cause,
              disposal: input.disposal,
              disposalNote: input.disposalNote,
              happenedAt: input.happenedAt,
            },
            now
          )
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
          // Every way out of the herd is an act with a record behind it — a death or a cull
          // has a cause and a disposal, a sale has a buyer, a price and a lorry — so none of
          // them is a State somebody sets, which would leave the farm saying a cow is gone and
          // nothing saying where. Sold was the exception until the Sale arrived; it is not any
          // more, and a gate on one door and not the others is no gate.
          if ((EXIT_STATES as readonly string[]).includes(input.state)) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "An animal leaves the herd by the record of how she went, not by a change of state",
              data: { refusal: "exit_needs_a_record", state: input.state },
            });
          }
          // Readiness is a judgement with a gate behind it: an animal inside her meat
          // Withdrawal may not be made ready at all. A gate on one door and not the other is
          // no gate, so this door sends the caller to the one that checks.
          if (input.state === "ready_for_sale") {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Readiness for sale is confirmed against the withdrawal record, not set as a state",
              data: { refusal: "ready_needs_confirming" },
            });
          }
          // She reaches it when this is recorded — or, for a cow reaching Milking, when she calved, which begins her
          // next Lactation and puts the calving the farm expected behind her.
          // Already there is nothing to do: a cow in milk set to Milking again has not calved again.
          if (input.state === current.state) {
            return;
          }
          if (input.state === "milking") {
            assertCalvedInThePast(input.calvedAt, now);
            await calves(tx, context.farm.id, current, {
              at: input.calvedAt ?? now,
              now,
              calvingLeadDays: pregnancyTimesOf(context.farm).calvingLeadDays,
            });
            return;
          }
          await entersState(tx, context.farm.id, current, {
            state: input.state,
            at: now,
            now,
          });
        }
      );
      return { tagNumber, state: input.state };
    }),

  /**
   * Puts right the Expected Calving somebody gave for a cow bought in carrying, and takes her open calving
   * work to the new day. Only a day that was entered: one worked out from a Pregnancy Check is put
   * right by correcting the service or the check it came from, never typed over.
   */
  correctExpectedCalving: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        tagNumber: tagInput,
        expectedCalvingOn: farmDay,
        reason: reasonInput,
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
      let followed: CalvingWorkFollowed | null = null;
      await audited(context).write(
        {
          entity: "animal",
          entityId: target.id,
          action: "correct",
          reason: input.reason,
          before: (tx) => readAnimal(tx, target.id),
          after: async (tx) => ({
            ...(await readAnimal(tx, target.id)),
            ...followed,
          }),
        },
        async (tx) => {
          const her = await loadLiveAnimal(tx, context.farm.id, tagNumber);
          if (!her.expectedCalvingAt) {
            throw new ORPCError("BAD_REQUEST", {
              message: `${tagNumber} is not expected to calve`,
              data: { refusal: "no_calving_expected" },
            });
          }
          if (her.expectedCalvingServiceId) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Her Expected Calving is worked out from her service; correct the service or the check instead",
              data: { refusal: "calving_is_derived" },
            });
          }
          const expectedCalvingAt = expectedCalvingWithinReach(
            input.expectedCalvingOn,
            now,
            context.farm.gestationDays
          );
          await tx
            .update(animal)
            .set({ expectedCalvingAt, updatedAt: now })
            .where(eq(animal.id, her.id));
          followed = await followExpectedCalving(
            tx,
            { ...her, expectedCalvingAt },
            pregnancyTimesOf(context.farm).calvingLeadDays,
            { expectedAgain: false }
          );
        }
      );
      return { tagNumber };
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
      assertOnTheirCases(context, target.id);
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
          expectedCalvingOn: values.expected_calving || undefined,
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
