import type { Database } from "@OpenFarm/db";
import { and, eq, inArray, isNotNull, sql } from "@OpenFarm/db/operators";
import { treatment } from "@OpenFarm/db/schema/health";
import type { SopContent } from "@OpenFarm/domain";
import {
  OPEN_INSTANCE_STATES,
  appliesToAnimal,
  campaignDueOf,
  campaignIntervalOf,
  campaignProductOf,
  dueForACampaign,
  farmDayOf,
  penDueSince,
} from "@OpenFarm/domain";

import type { DueSlot } from "./instances-store";
import { dueAtFor, isOnTheFarm, triggerKey } from "./instances-store";
import type { SopInForce } from "./sops-in-force";

/** A Campaign that comes round: the months, the product its last dose is looked for by, and since when the interval
 *  has stood without a break. */
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
    const months = campaignIntervalOf(sop.content);
    const productId = campaignProductOf(sop.content);
    const interval = sop.content.triggers.find(
      (trigger) => trigger.kind === "every_months"
    );
    if (months === null || productId === null || !interval) {
      return [];
    }
    return [
      {
        definitionId: sop.definitionId,
        versionId: sop.versionId,
        content: sop.content,
        months,
        productId,
        countingSince:
          sop.triggerInForceSince?.get(triggerKey(interval)) ??
          sop.triggersInForceSince,
      },
    ];
  });

/** One animal a Campaign concerns, with the day her next dose of it falls due. */
export interface OwedACampaign {
  animalId: string;
  tagNumber: string;
  penId: string;
  /** The farm day of her last dose of the product, or nothing for none given on the farm. */
  lastGivenOn: string | null;
  dueOn: string;
}

/**
 * For each Campaign, every animal on the farm it concerns and the day her next dose falls due: the interval after her
 * last dose of its product, whichever procedure gave it, or — none given — after she was first counted. Two reads
 * whatever the herd's size: the animals, and each one's last dose of each product.
 */
export const owedTheirCampaigns = async (
  db: Pick<Database, "query" | "select">,
  farmId: string,
  campaigns: readonly CampaignComingRound[]
): Promise<Map<string, OwedACampaign[]>> => {
  const owed = new Map<string, OwedACampaign[]>();
  if (campaigns.length === 0) {
    return owed;
  }
  const herd = await db.query.animal.findMany({
    where: { farmId },
    columns: {
      id: true,
      tagNumber: true,
      penId: true,
      side: true,
      state: true,
      createdAt: true,
    },
  });
  const animals = herd.filter(isOnTheFarm);
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
      farmDayOf(dose.lastGivenAt),
    ])
  );
  // Her first day on the farm, read once whatever the number of Campaigns.
  const firstDay = new Map(
    animals.map((beast) => [beast.id, farmDayOf(beast.createdAt)])
  );
  for (const campaign of campaigns) {
    const since = farmDayOf(campaign.countingSince);
    owed.set(
      campaign.definitionId,
      animals
        .filter((beast) => appliesToAnimal(campaign.content.appliesTo, beast))
        .map((beast) => {
          const lastGivenOn =
            lastGiven.get(`${beast.id}:${campaign.productId}`) ?? null;
          const came = firstDay.get(beast.id) ?? since;
          return {
            animalId: beast.id,
            tagNumber: beast.tagNumber,
            penId: beast.penId,
            lastGivenOn,
            dueOn: campaignDueOf({
              lastGivenOn,
              countedFrom: came > since ? came : since,
              months: campaign.months,
            }),
          };
        })
    );
  }
  return owed;
};

/** The Pens each Campaign has work open in, as "definition:pen": raised by hand or by the turn, it is not raised again
 *  while it stands. */
export const campaignsOpen = async (
  db: Pick<Database, "query">,
  farmId: string,
  campaigns: readonly CampaignComingRound[]
): Promise<Set<string>> => {
  if (campaigns.length === 0) {
    return new Set();
  }
  const open = await db.query.sopInstance.findMany({
    where: {
      farmId,
      definitionId: { in: campaigns.map((one) => one.definitionId) },
      state: { in: [...OPEN_INSTANCE_STATES] },
    },
    columns: { definitionId: true, penId: true },
  });
  return new Set(open.map((one) => `${one.definitionId}:${one.penId}`));
};

/** The hour a Campaign the turn raises is wanted by: the morning's, or now for one raised later in the day. */
const CAMPAIGN_DUE_TIME = "09:00";

/**
 * The Campaigns the farm's day owes: one in each Pen holding an animal whose day has come, unless its work already
 * stands there. Keyed on the Pen and the earliest day one of its animals came due, so the turn raises it once for that
 * turn — again only once they are dosed and come round, or an animal owed it on another day stands there. A Campaign
 * left Missed is not raised again by itself: its animals stay on the farm's list of those due, for the Manager to raise.
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
      const since = penDueSince(days, today);
      if (since === null || open.has(`${campaign.definitionId}:${penId}`)) {
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
        cause: `interval:${penId}:${since}`,
      });
    }
  }
  return slots;
};

/** How each animal stands for a Campaign on a day: those due or coming due, soonest first, then by tag. */
export const dueOrComingDue = (
  animals: readonly OwedACampaign[],
  today: string
): (OwedACampaign & { standing: "due" | "soon" })[] =>
  animals
    .flatMap((beast) => {
      const standing = dueForACampaign(beast.dueOn, today);
      return standing ? [{ ...beast, standing }] : [];
    })
    .toSorted(
      (a, b) =>
        a.dueOn.localeCompare(b.dueOn) || a.tagNumber.localeCompare(b.tagNumber)
    );
