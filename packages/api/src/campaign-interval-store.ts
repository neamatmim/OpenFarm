import type { Database } from "@OpenFarm/db";
import { and, eq, inArray, isNotNull, sql } from "@OpenFarm/db/operators";
import { treatment } from "@OpenFarm/db/schema/health";
import type { SopContent } from "@OpenFarm/domain";
import {
  CAMPAIGN_SOON_DAYS,
  EXIT_STATES,
  OPEN_INSTANCE_STATES,
  appliesToAnimal,
  campaignDueOf,
  campaignIntervalTriggerOf,
  campaignProductOf,
  dayMoved,
  dueForACampaign,
  farmDayOf,
  notDueSince,
  penDueBy,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { DueSlot } from "./instances-store";
import { dueAtFor } from "./instances-store";
import { contentOf } from "./sop-content";
import type { SopInForce } from "./sops-in-force";

/** A Campaign that comes round: the months, the product its last dose is looked for by, and since when the interval
 *  has stood without a break, whatever its months. */
export interface CampaignComingRound {
  definitionId: string;
  versionId: string;
  content: SopContent;
  months: number;
  productId: string;
  countingSince: Date;
}

/** The procedures in force that come round by a Campaign Interval and give a product to count it by. */
export const campaignsComingRound = (
  sops: readonly SopInForce[]
): CampaignComingRound[] =>
  sops.flatMap((sop) => {
    const interval = campaignIntervalTriggerOf(sop.content);
    const productId = campaignProductOf(sop.content);
    if (interval === null || productId === null) {
      return [];
    }
    return [
      {
        definitionId: sop.definitionId,
        versionId: sop.versionId,
        content: sop.content,
        months: interval.months,
        productId,
        countingSince: sop.intervalInForceSince ?? sop.triggersInForceSince,
      },
    ];
  });

/** An animal on the farm, as a Campaign weighs her: where she stands, and when she came. */
export interface HerdMember {
  id: string;
  tagNumber: string;
  penId: string;
  side: string;
  state: string;
  createdAt: Date;
}

/** The animals on the farm — those who have left read out by the database, not afterwards. */
export const herdOnTheFarm = (
  db: Pick<Database, "query">,
  farmId: string
): Promise<HerdMember[]> =>
  db.query.animal.findMany({
    where: { farmId, state: { notIn: [...EXIT_STATES] } },
    columns: {
      id: true,
      tagNumber: true,
      penId: true,
      side: true,
      state: true,
      createdAt: true,
    },
  });

/** One animal due a Campaign, or coming due within the fortnight, with the day her next dose falls due. */
export interface OwedACampaign {
  animalId: string;
  tagNumber: string;
  penId: string;
  /** The farm day of her last dose of the product, or nothing for none given on the farm. */
  lastGivenOn: string | null;
  dueOn: string;
  standing: "due" | "soon";
}

/** A few days' room on the instant every animal is first weighed against, so a month's end read either way round still
 *  lets her through to be counted exactly. */
const ROOM_DAYS = 3;

/**
 * For each Campaign, every animal on the farm it concerns whose next dose has come or comes within the fortnight: the
 * interval after her last dose of its product, whichever procedure gave it, or — none given — after she was first
 * counted. Two reads whatever the herd's size — the animals are the caller's — and each animal weighed by instants first,
 * so only those near their day have their day worked out.
 */
export const owedTheirCampaigns = async (
  db: Pick<Database, "select">,
  farmId: string,
  campaigns: readonly CampaignComingRound[],
  herd: readonly HerdMember[],
  now: Date
): Promise<Map<string, OwedACampaign[]>> => {
  const owed = new Map<string, OwedACampaign[]>();
  if (campaigns.length === 0) {
    return owed;
  }
  const products = [...new Set(campaigns.map((one) => one.productId))];
  const doses = await db
    .select({
      animalId: treatment.animalId,
      productId: treatment.productId,
      lastGivenAt: sql<Date>`max(${treatment.givenAt})`.mapWith(
        treatment.givenAt
      ),
    })
    .from(treatment)
    .where(
      and(
        eq(treatment.farmId, farmId),
        inArray(treatment.productId, products),
        isNotNull(treatment.givenAt)
      )
    )
    .groupBy(treatment.animalId, treatment.productId);
  const lastGiven = new Map(
    doses.map((dose) => [
      `${dose.animalId}:${dose.productId}`,
      dose.lastGivenAt,
    ])
  );
  const today = farmDayOf(now);
  for (const campaign of campaigns) {
    // Anything she was last given, or first counted, on or after this is too recent to be near her day.
    const nearItBefore = startOfFarmDay(
      dayMoved(today, {
        months: -campaign.months,
        days: CAMPAIGN_SOON_DAYS + ROOM_DAYS,
      })
    );
    const counting = campaign.countingSince;
    owed.set(
      campaign.definitionId,
      herd.flatMap((beast) => {
        if (!appliesToAnimal(campaign.content.appliesTo, beast as never)) {
          return [];
        }
        const given = lastGiven.get(`${beast.id}:${campaign.productId}`);
        const counted = beast.createdAt > counting ? beast.createdAt : counting;
        if ((given ?? counted) >= nearItBefore) {
          return [];
        }
        const lastGivenOn = given ? farmDayOf(given) : null;
        const dueOn = campaignDueOf({
          lastGivenOn,
          countedFrom: farmDayOf(counted),
          months: campaign.months,
        });
        const standing = dueForACampaign(dueOn, today);
        return standing
          ? [
              {
                animalId: beast.id,
                tagNumber: beast.tagNumber,
                penId: beast.penId,
                lastGivenOn,
                dueOn,
                standing,
              },
            ]
          : [];
      })
    );
  }
  return owed;
};

/**
 * The Pens each Campaign's own work stands open in, as "definition:pen": the Pen's Campaign raised by hand or by the
 * turn, never one animal's dose put off — her dose alone owed is hers, and keeps no Pen from coming round.
 */
export const campaignsOpen = async (
  db: Pick<Database, "query">,
  farmId: string,
  definitionIds: readonly string[]
): Promise<Set<string>> => {
  if (definitionIds.length === 0) {
    return new Set();
  }
  const open = await db.query.sopInstance.findMany({
    where: {
      farmId,
      definitionId: { in: [...definitionIds] },
      state: { in: [...OPEN_INSTANCE_STATES] },
      animalId: { isNull: true },
    },
    columns: { definitionId: true, penId: true },
  });
  return new Set(open.map((one) => `${one.definitionId}:${one.penId}`));
};

/** The hour a Campaign the turn raises is wanted by: the morning's, or now for one raised later in the day. */
const CAMPAIGN_DUE_TIME = "09:00";

/**
 * The Campaigns the farm's day owes: one in each Pen holding an animal whose day has come, unless its own work already
 * stands there. Keyed on the Pen and the latest day one of its animals came due: the same while the same animals are
 * owed it, so a round is raised once, and one left Missed is not raised again by itself until a later day comes — the
 * rest coming round, or another animal's day — and one animal left undosed never pins the Pen to her old day.
 */
export const campaignSlotsFor = (
  now: Date,
  campaigns: readonly CampaignComingRound[],
  owed: ReadonlyMap<string, readonly OwedACampaign[]>,
  open: ReadonlySet<string>
): DueSlot[] => {
  const today = farmDayOf(now);
  const morning = dueAtFor(now, CAMPAIGN_DUE_TIME);
  const dueAt = morning > now ? morning : now;
  const slots: DueSlot[] = [];
  for (const campaign of campaigns) {
    const byPen = new Map<string, string[]>();
    for (const beast of owed.get(campaign.definitionId) ?? []) {
      byPen.set(beast.penId, [...(byPen.get(beast.penId) ?? []), beast.dueOn]);
    }
    for (const [penId, days] of byPen) {
      const by = penDueBy(days, today);
      if (by === null || open.has(`${campaign.definitionId}:${penId}`)) {
        continue;
      }
      slots.push({
        definitionId: campaign.definitionId,
        versionId: campaign.versionId,
        penId,
        dueAt,
        graceMinutes: campaign.content.graceMinutes,
        assignedRole: campaign.content.assignedRole,
        checkerRole: campaign.content.checkerRole,
        cause: `interval:${penId}:${by}`,
      });
    }
  }
  return slots;
};

/** The animals due or coming due, soonest first, then by tag. */
export const soonestFirst = (
  animals: readonly OwedACampaign[]
): OwedACampaign[] =>
  animals.toSorted(
    (a, b) =>
      a.dueOn.localeCompare(b.dueOn) || a.tagNumber.localeCompare(b.tagNumber)
  );

/**
 * Where an animal on a Campaign's walk is still covered by her last dose of its product: the farm day she was dosed, for
 * each animal whose next dose has not come. Nothing for a Campaign that does not come round — it has no interval to be
 * covered by — and nothing for an animal never given it.
 */
export const notDueOnTheWalk = async (
  db: Pick<Database, "select">,
  farmId: string,
  content: SopContent,
  animalIds: readonly string[],
  now: Date
): Promise<Map<string, string>> => {
  const covered = new Map<string, string>();
  const interval = campaignIntervalTriggerOf(content);
  const productId = campaignProductOf(content);
  if (interval === null || productId === null || animalIds.length === 0) {
    return covered;
  }
  const today = farmDayOf(now);
  const doses = await db
    .select({
      animalId: treatment.animalId,
      lastGivenAt: sql<Date>`max(${treatment.givenAt})`.mapWith(
        treatment.givenAt
      ),
    })
    .from(treatment)
    .where(
      and(
        eq(treatment.farmId, farmId),
        eq(treatment.productId, productId),
        inArray(treatment.animalId, [...animalIds]),
        isNotNull(treatment.givenAt)
      )
    )
    .groupBy(treatment.animalId);
  // One Pen's animals at most: each one's day read exactly, as the farm refuses a pass by the same rule.
  for (const dose of doses) {
    const since = notDueSince({
      lastGivenOn: farmDayOf(dose.lastGivenAt),
      months: interval.months,
      today,
    });
    if (since !== null) {
      covered.set(dose.animalId, since);
    }
  }
  return covered;
};

/**
 * Refuses an animal passed as not due on a Campaign's walk whose dose has in fact come: her last dose of its product no
 * longer covers her — or she was never given it, or the Campaign does not come round — and she is owed it now.
 */
export const assertStillCovered = async (
  tx: Pick<Database, "query" | "select">,
  farmId: string,
  instanceId: string,
  animalId: string,
  now: Date
): Promise<void> => {
  const work = await tx.query.sopInstance.findFirst({
    where: { id: instanceId, farmId },
    with: { version: { columns: { content: true } } },
  });
  const content = work?.version ? contentOf(work.version) : null;
  const covered = content
    ? await notDueOnTheWalk(tx, farmId, content, [animalId], now)
    : new Map<string, string>();
  if (!covered.has(animalId)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Her dose has come: give it, or say why it waits",
      data: { refusal: "dose_is_due" },
    });
  }
};
