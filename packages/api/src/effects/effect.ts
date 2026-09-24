import type { RoleName } from "@OpenFarm/db/schema/farm";
import type {
  FeedingEntryLine,
  MilkDestination,
  PregnancyCheckResult,
  STEP_EFFECT_KINDS,
  ServiceMethod,
  Step,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Trail, Tx } from "../audit";
import type { PregnancyTimes } from "../breeding-store";
import type { CalvingRecorded } from "../calving-store";
import type { CalvingWorkFollowed } from "../calving-work";
import type { RenewalEntry } from "../registration-store";
import type { Refusal } from "../roles";
import { forbidden } from "../roles";
import type { StockAdjustment, StockCountLine } from "../stock-store";
import { calvingEffect } from "./calving";
import { dlsReportEffect } from "./dls-report";
import { dryOffEffect } from "./dry-off";
import { feedingEffect } from "./feeding";
import { lotNumberEffect } from "./lot-number";
import { bulkTotalEffect, milkRecordEffect } from "./milk";
import { moveEffect } from "./move";
import { observationEffect } from "./observation";
import { pregnancyCheckEffect } from "./pregnancy-check";
import { renewalEffect } from "./registration-renewal";
import { releaseEffect } from "./release";
import { serviceEffect } from "./service";
import { stockCountEffect } from "./stock-count";
import { treatmentEffect } from "./treatment";
import { weighInEffect } from "./weigh-in";

/**
 * What a Step wrote into the farm's records beyond the Evidence itself — reported back so
 * the phone can show the person what the gate decided, and so the Audit Event's `after`
 * says what actually happened rather than what was asked for.
 */
export type EffectResult =
  | { kind: "milk_record"; destination: MilkDestination; forced: boolean }
  | {
      kind: "registration_renewal";
      expiresOn: Date;
      previousExpiresOn: Date | null;
      /** The Registration has moved on since this renewal, so the newer one is put right instead. */
      standsAside: StandingAside | null;
    }
  | {
      kind: "feeding";
      /** What the Pen was owed, and how far under it the session came. */
      shortfallPercent: number;
      flagged: boolean;
      /** The Pen is on no Ration now, so what was fed cannot be set against one. */
      standsAside: StandingAside | null;
    }
  | {
      kind: "observation";
      /** What was seen, as the Version's own choice value. */
      saw: string;
      /** True when this replaced one a Correction withdrew. */
      supersedes: boolean;
    }
  | {
      kind: "lot_number";
      /** The Lot Number the Campaign was given from. */
      lotNumber: string;
    }
  | {
      kind: "dls_report";
      /** What the office filed it under. Null when a Correction took the delivery back. */
      reference: string | null;
      /** False when a Correction took the delivery back: the report is owed again. */
      delivered: boolean;
    }
  | {
      kind: "treatment";
      /** Which dose of the course this was — 3 of 6 — so the phone can say where it got to. */
      number: number;
      of: number;
      /** False when the dose was skipped: what the course owes is still owed. */
      given: boolean;
      /** When her milk may go to the tank again. */
      milkWithdrawalUntil: Date | null;
    }
  | {
      kind: "move";
      fromPenId: string | null;
      toPenId: string;
      /** False when she was already standing there: the Step was done, no journey was made. */
      moved: boolean;
      /** She has been moved again since: the Effect left her where the farm last saw her. */
      standsAside: StandingAside | null;
    }
  | {
      kind: "bulk_total";
      sumBulkLitres: number;
      differenceLitres: number;
      differencePercent: number;
      flagged: boolean;
    }
  | {
      kind: "weigh_in";
      /** What the scale said, as the record now holds it. */
      weightKg: number;
      /** True when the farm doubted it and put it in front of the Manager. */
      flagged: boolean;
    }
  /** A service or a check — or, with nothing, one taken back — and the calving work that followed the
   *  date it changed. */
  | ({
      kind: "service";
      method: ServiceMethod | null;
      /** Taken back, but the Vet has checked it: the service stands, and the check is corrected first. */
      standsAside: StandingAside | null;
    } & CalvingWorkFollowed)
  | ({
      kind: "pregnancy_check";
      result: PregnancyCheckResult | null;
    } & CalvingWorkFollowed)
  | ({ kind: "calving"; standsAside: StandingAside | null } & Omit<
      CalvingRecorded,
      "actedOn"
    >)
  | {
      kind: "stock_count";
      /** The Feed Items whose count differed from what the store was thought to hold. */
      adjustments: StockAdjustment[];
    }
  | {
      kind: "dry_off";
      /** False when she was already Dry: the same Step again dries nobody twice. */
      dried: boolean;
      /** Corrected to a skip, but she cannot be put back in milk from here: what she was before,
       *  and since when, is the trail's to say and a person's to decide. */
      standsAside: StandingAside | null;
    }
  | {
      kind: "release";
      /** False when he was already out of Quarantine: the same Step again releases nobody twice. */
      released: boolean;
      /** The Pen whose Ration's Weight Band suits him, where he was walked; nothing where none does. */
      toPenId: string | null;
      /** Corrected to a skip, but he cannot be put back in Quarantine from here. */
      standsAside: StandingAside | null;
    }
  | null;

/** Everything a Step's Effect may be told about the Step; each kind names the facts it needs from it. */
export interface EffectInput {
  step: Step;
  instance: {
    id: string;
    farmId: string;
    /** Null for work about the whole farm. */
    penId: string | null;
    /** The animal this work is about, for work raised about one — a dose of a Prescription is
     *  hers alone. Null for work about the whole Pen. */
    animalId: string | null;
    dueAt: Date;
    /** When the work was raised, which is the moment its Ration is read as of. */
    raisedAt: Date;
    /** What raised it, for work a happening raised — a Service reads which Heat it answered. */
    cause: string | null;
  };
  completionId: string;
  animalId: string | null;
  evidence: unknown[];
  destination: MilkDestination | undefined;
  skipped: boolean;
  tolerancePercent: number;
  /** How far under its Feeding Target a Pen may come before the farm says so. */
  feedTolerancePercent: number;
  /** The Audit Event this Completion is being written under, for an effect that has to put
   *  something in front of the Manager in the same transaction. */
  eventId: string;
  /** The Role the Step is being recorded under, for a record an effect writes that names it. */
  roleUsed: RoleName | null;
  /** How long this farm's cows carry, and how long before calving its work falls — which Expected
   *  Calving, and the work that follows it, are worked out from. */
  pregnancyTimes: PregnancyTimes;
  /** What was actually put in front of the Pen, per Feed Item. */
  feeding: FeedingEntryLine[];
  /** What was counted of each Feed Item, for a Step that counts the store. */
  counts: StockCountLine[];
  /** The new expiry and the renewed certificate, for the Step that renews the Registration. */
  renewal?: RenewalEntry;
  /** How often this Playbook entry feeds — from the Version doing the feeding, so a farm with
   *  more than one feeding routine divides by the one that raised this work. */
  sessionsPerDay: number;
  recordedBy: string;
  recordedAt: Date;
  now: Date;
  /** The trail of the request recording it now — the person putting a Step right, not the one who first did it: work
   *  it calls off or raises again is written there. */
  trail: Trail;
}

/** Why an Effect stood aside: what the farm has learned since that the Step does not know. */
export type StandingAsideBecause =
  /** She has been walked on since the Step walked her. */
  | "moved_since"
  /** Corrected to a skip, but she cannot be put back in milk from here. */
  | "cannot_return_to_milk"
  /** Corrected to a skip, but he cannot be put back in Quarantine from here. */
  | "cannot_return_to_quarantine"
  /** Corrected in a way the farm has already acted on: a calf added, taken away, or since gone. */
  | "calving_acted_on"
  /** A service taken back that the Vet has already checked: the check is corrected first. */
  | "service_checked"
  /** The Pen is on no Ration now, so what was fed cannot be set against one. */
  | "no_ration"
  /** The Registration has moved on since this renewal: the newer one is put right instead. */
  | "renewal_superseded";

/**
 * An Effect the farm has moved past (the glossary's Effect, standing aside): it wrote nothing over the newer fact, and
 * says why. A Step arriving so is a late Entry, kept for a person; a Correction so is kept and raised as Needs Review.
 */
export interface StandingAside {
  because: StandingAsideBecause;
  /** What the Manager is shown about it, beside the work it is about. */
  params?: Record<string, unknown>;
}

/**
 * One kind of Step Effect: the facts it needs from the Step, and how it writes them into the farm's records — or stands
 * aside when the farm has moved past them.
 */
export interface EffectKind<Facts> {
  kind: (typeof STEP_EFFECT_KINDS)[number];
  /**
   * The Roles that may record a Step of this kind, whatever the procedure's own gate lets in — the Owner may step into
   * any shift, but a Service is still the Manager's to record. Checked once, when the Step is first recorded; putting it
   * right is the Correction's to decide. Nobody but the procedure's gate, when unsaid.
   */
  recordableBy?: { roles: readonly RoleName[]; refusal: Refusal };
  apply: (tx: Tx, facts: Facts) => Promise<EffectResult>;
  /**
   * What it recorded beside the Evidence — the feed given, the store counted, the day renewed to — as a Step's answer
   * carries it, for a Correction to show, compare, and keep when it is not sent again. Nothing, for a kind whose Step
   * says it all in its Evidence.
   */
  recorded?: (
    db: Pick<Tx, "query">,
    completionId: string
  ) => Promise<StepFacts>;
  /**
   * Its facts as a Correction compares them, in the farm's order and rounding, so the same thing sent two ways reads the
   * same. Only its own: a kind with no facts beside its Evidence says nothing.
   */
  asShown?: (facts: StepFacts) => FactsAsShown;
}

/** The facts a Step carries beside its Evidence, as its answer does. */
export type StepFacts = Partial<
  Pick<EffectInput, "feeding" | "counts"> & { renewal: { expiresOn: string } }
>;

/** Every kind of Effect a Step may declare. */
const EFFECTS: Record<
  (typeof STEP_EFFECT_KINDS)[number],
  EffectKind<EffectInput>
> = {
  milk_record: milkRecordEffect,
  bulk_total: bulkTotalEffect,
  observation: observationEffect,
  treatment: treatmentEffect,
  lot_number: lotNumberEffect,
  dls_report: dlsReportEffect,
  weigh_in: weighInEffect,
  move: moveEffect,
  dry_off: dryOffEffect,
  release: releaseEffect,
  calving: calvingEffect,
  service: serviceEffect,
  pregnancy_check: pregnancyCheckEffect,
  feeding: feedingEffect,
  stock_count: stockCountEffect,
  registration_renewal: renewalEffect,
};

/** The Effect a Step declares, or nothing for a Step that writes only its Evidence. */
export const effectOf = (
  step: EffectInput["step"]
): EffectKind<EffectInput> | undefined =>
  step.effect ? EFFECTS[step.effect.kind] : undefined;

/** Refuses a Step of a kind the person may not record, whichever Role they hold that let them at the work. */
export const requireMayRecord = (
  step: EffectInput["step"],
  roles: readonly RoleName[]
): void => {
  const recordableBy = effectOf(step)?.recordableBy;
  if (
    recordableBy &&
    !recordableBy.roles.some((role) => roles.includes(role))
  ) {
    throw forbidden(recordableBy.refusal);
  }
};

/**
 * Runs the Effect a Step declares, inside the Completion's own transaction: if it fails, the Completion and its Audit
 * Event fail with it. Keyed on the Completion, so a Correction replaces what it wrote rather than adding to it.
 */
export const runEffect = (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  // Only a Step that writes a Milk Record has anywhere for milk to go. A tank reading filed as "calves" would be nonsense
  // the record then has to carry.
  if (input.destination && input.step.effect?.kind !== "milk_record") {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step does not record where the milk went",
    });
  }
  const kind = effectOf(input.step);
  return kind ? kind.apply(tx, input) : Promise.resolve(null);
};

/** Whether an Effect stood aside, and why. */
export const stoodAside = (result: EffectResult): StandingAside | null =>
  result && "standsAside" in result ? result.standsAside : null;

/** What a person is told of a Step refused as late because its Effect stood aside. */
export const STANDING_ASIDE_SAID: Record<StandingAsideBecause, string> = {
  moved_since: "She has been moved since this was done",
  cannot_return_to_milk: "She cannot be put back in milk from here",
  cannot_return_to_quarantine: "He cannot be put back in quarantine from here",
  calving_acted_on: "The farm has acted on this calving since",
  service_checked:
    "The Vet has checked this service; the check is put right first",
  no_ration:
    "This pen is on no ration now, so what was fed cannot be set against one",
  renewal_superseded:
    "The Registration has moved on since this renewal; put the newer one right instead",
};

/** Facts as a Correction compares them — plain values, part by part. */
export interface FactsAsShown {
  feeding?: { feedItemId: string; givenKg: number; leftoverKg: number }[];
  counts?: { feedItemId: string; counted: number; reason?: string }[];
  renewal?: { expiresOn: string };
}

/** What a Step recorded beside its Evidence, when its kind keeps facts there. */
export const recordedFactsOf = async (
  db: Pick<Tx, "query">,
  step: EffectInput["step"],
  completionId: string
): Promise<StepFacts> =>
  (await effectOf(step)?.recorded?.(db, completionId)) ?? {};

/** Facts as a Correction compares them, each kind saying how its own are shown. */
export const factsAsShown = (facts: StepFacts): FactsAsShown =>
  Object.assign(
    {},
    ...Object.values(EFFECTS).map((kind) => kind.asShown?.(facts))
  ) as FactsAsShown;
