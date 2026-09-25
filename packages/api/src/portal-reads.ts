import {
  FIELDS_OF,
  factsMissing,
  farmDayOf,
  maskedDigits,
  readingOf,
} from "@OpenFarm/domain";
import type { TemplateContent } from "@OpenFarm/domain";

import type { Context } from "./context";
import { farmsOwnValues } from "./data-keepers";
import { howToPay } from "./how-to-pay";
import type { PaperMaking } from "./investor-papers";
import {
  joiningLetterFor,
  progressStatementFor,
  settlementStatementFor,
} from "./investor-papers";
import {
  hisStanding,
  theVentureOf,
  theirSpend,
} from "./investor-statement-store";
import { shareOfUnits } from "./investor-statement-words";
import { signedInOn } from "./membership";
import { ownerNameOf, requireTheirs } from "./portal-store";
import { theirRequests } from "./requests-to-join";
import { wordingInForce } from "./template-store";
import { theirAgreements } from "./their-agreements";
import { theirProgress } from "./venture-herd-store";
import { openVenturesFor } from "./venture-showing";

// What one Investor reads in the portal, page by page. Asked for by the Investor from their own sign-in, or by the
// Owner's Portal Preview for them: the answer is the same either way, so each page is read here once, and nothing here
// marks anything read — that is the Investor's own door's business.

/** Whose portal is being read, on which farm, and when. */
export interface PortalReader {
  db: Context["db"];
  clock: Context["clock"];
  farm: NonNullable<Context["farm"]>;
  investor: { id: string; name: string; phone: string };
}

/** Whom an Investor calls about any of it: the farm, by name, phone and address. What the portal's account page shows
 *  and the Welcome Letter prints, from here alone, so the two cannot give different numbers. */
export const farmToCall = (farm: PortalReader["farm"]) => ({
  name: farm.name,
  phone: farm.phone,
  address: farm.address,
});

/**
 * Who the portal is for, which farm's and how to reach it, and their own record as the farm holds it — the NID and
 * the bank account with all but their last digits hidden, enough to know them by on a screen somebody may be looking
 * over. They are put right by the Owner, not in the portal.
 */
export const theirRecord = async ({ db, farm, investor }: PortalReader) => {
  const theirs = await db.query.investor.findFirst({
    where: { id: investor.id, farmId: farm.id },
  });
  return {
    investorId: investor.id,
    name: investor.name,
    farm: farmToCall(farm),
    record: {
      phone: theirs?.phone ?? investor.phone,
      address: theirs?.address ?? null,
      nid: theirs?.nid ? maskedDigits(theirs.nid) : null,
      bankAccount: theirs?.bankAccount
        ? maskedDigits(theirs.bankAccount)
        : null,
      nominee: theirs?.nomineeName
        ? {
            name: theirs.nomineeName,
            relation: theirs.nomineeRelation,
            phone: theirs.nomineePhone,
          }
        : null,
    },
  };
};

/**
 * Their whole part in the farm's Ventures: each Agreement with the capital held on it and what a Settlement paid, and
 * every taka of theirs that moved — capital in, capital back, payouts — the latest first. Read from their side and
 * narrowed to them before anything is assembled, as the Owner's page of them is.
 */
export const theirPortfolio = ({ db, clock, farm, investor }: PortalReader) =>
  theirAgreements(db, farm.id, investor.id, farmDayOf(clock.now()));

/**
 * The Ventures still gathering capital that the Owner has shown in the portal (ADR 0008): their terms, the split the
 * farm signs on today, and the Owner's few words — never how many Units are left, who else has asked or anything off
 * an Agreement. None for a retired Investor, and none they are already signed for.
 */
export const theirOpenVentures = ({
  db,
  clock,
  farm,
  investor,
}: PortalReader) => openVenturesFor(db, farm, investor.id, clock.now());

/** Their own Requests to Join, the latest first, and where each stands. Never anybody else's. */
export const theirOwnRequests = ({ db, farm, investor }: PortalReader) =>
  theirRequests(db, farm.id, investor.id);

/**
 * Where their portal account is signed in now, the one being read on marked — none of them when it is the Owner
 * reading. Nothing for somebody who never took an invitation up.
 */
export const theirSignIns = async (
  { db, clock, farm, investor }: PortalReader,
  readingOn: string | null
) => {
  const access = await db.query.investorAccess.findFirst({
    where: { farmId: farm.id, investorId: investor.id },
    columns: { userId: true },
  });
  if (!access?.userId) {
    return [];
  }
  const places = await signedInOn(db, access.userId, clock.now());
  return places.map((one) => ({ ...one, here: one.id === readingOn }));
};

/**
 * One of their Ventures as it stands today, to draw rather than print: their part of it, how the animals are doing,
 * where the Venture's money has gone and what is left of its budgets. The same figures the progress statement says,
 * and no projection — days are counted, weights are read, nothing is forecast. Refused for an Agreement not theirs.
 */
export const theirVentureToday = async (
  { db, clock, farm, investor }: PortalReader,
  agreementId: string
) => {
  await requireTheirs(db, farm.id, investor.id, agreementId);
  const now = clock.now();
  const standing = await hisStanding(db, farm.id, agreementId, farmDayOf(now));
  const run = await theVentureOf(db, farm.id, standing.venture.id);
  const [theirs, spend, paying] = await Promise.all([
    theirProgress(db, farm.id, run, now),
    theirSpend(db, farm.id, run),
    howToPay(db, farm.id, agreementId, run),
  ]);
  return {
    agreementId,
    venture: { name: standing.venture.name, state: run.state },
    his: {
      units: standing.agreement.units,
      sharePercent: shareOfUnits(standing.agreement.units, spend.signedUnits),
      capitalBdt: standing.capitalBdt,
      investorsPercent: standing.agreement.investorsPercent,
      amendedOn: standing.agreement.amendedOn,
    },
    window: {
      start: standing.agreement.targetWindowStart,
      end: standing.agreement.targetWindowEnd,
      daysTo: theirs.daysToWindow,
    },
    herd: {
      standing: theirs.standingCount,
      sold: theirs.soldCount,
      died: theirs.diedCount,
      weighed: theirs.weighedCount,
      averageIntakeKg: theirs.averageIntakeKg,
      averageLatestKg: theirs.averageLatestKg,
      gainKgPerDay: theirs.gainKgPerDay,
      animals: theirs.animals
        .filter((one) => one.standing)
        .map((one) => ({
          tagNumber: one.tagNumber,
          intakeKg: one.intakeKg,
          latestKg: one.latestKg,
          dailyGainKg: one.dailyGainKg,
        })),
    },
    spend: {
      charges: spend.charges.map((one) => ({ word: one.word, bdt: one.bdt })),
      chargedBdt: spend.chargedBdt,
      cattleBudgetBdt: spend.cattleBudgetBdt,
      cattleBudgetLeftBdt: spend.cattleBudgetLeftBdt,
      runningBudgetBdt: spend.runningBudgetBdt,
      runningSpentBdt: spend.runningSpentBdt,
    },
    /** Where to pay and how much is left, while their capital is still owed; nothing once it is all in. */
    howToPay: paying,
  };
};

/** The three papers the portal shows an Investor. */
export const PORTAL_PAPER_KINDS = [
  "joining",
  "progress",
  "settlement",
] as const;
export type PortalPaperKind = (typeof PORTAL_PAPER_KINDS)[number];

/**
 * One of their own papers, as the Owner would print it: the joining letter, the progress statement, or — once the
 * Settlement is approved — the settlement statement. An Export in the trail, attributed to whoever `making` names:
 * the Investor in the portal, the Owner in the Preview.
 */
export const theirPaper = async (
  making: PaperMaking,
  investorId: string,
  agreementId: string,
  kind: PortalPaperKind
) => {
  await requireTheirs(making.db, making.farm.id, investorId, agreementId);
  if (kind === "joining") {
    const { text } = await joiningLetterFor(
      making,
      agreementId,
      await ownerNameOf(making.db, making.farm.id)
    );
    return { text, photos: [] };
  }
  if (kind === "progress") {
    const { text, photos } = await progressStatementFor(making, agreementId);
    return { text, photos };
  }
  const { text } = await settlementStatementFor(making, agreementId);
  return { text, photos: [] };
};

/**
 * What fills the privacy notice's wording — the farm's own facts, signed for by its Owner — and whether every fact it
 * names is written down: a notice with a blank in it tells an Investor nothing, so it is shown or handed over whole,
 * or not at all.
 */
export const noticeFilling = async (
  db: Context["db"],
  farm: NonNullable<Context["farm"]>,
  content: TemplateContent
) => {
  const values = await farmsOwnValues(db, farm, await ownerNameOf(db, farm.id));
  const whole =
    factsMissing(content, values, FIELDS_OF.privacy_notice).length === 0;
  return { values, whole };
};

/**
 * «আপনার তথ্য», the privacy notice, as a page of the portal reads it: the Version in force with the farm's own facts
 * in it, in Bangla. Nothing while any fact it names is still unwritten (`noticeFilling`) — only the farm to ask, by
 * name and phone where it has one.
 */
export const theNoticeToRead = async (
  db: Context["db"],
  farm: NonNullable<Context["farm"]>
) => {
  const content = await wordingInForce(db, farm.id, "privacy_notice");
  const { values, whole } = await noticeFilling(db, farm, content);
  return {
    notice: whole ? readingOf(content, values) : null,
    farm: { name: farm.name, phone: farm.phone },
  };
};
