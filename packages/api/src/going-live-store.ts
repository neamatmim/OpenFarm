import type { Database } from "@OpenFarm/db";
import { INVITE_LAPSE_DAYS } from "@OpenFarm/db/schema/farm";
import type { SopContent } from "@OpenFarm/domain";
import {
  EXIT_STATES,
  farmDayOf,
  standardPlaybook,
  whyNotPrescribable,
} from "@OpenFarm/domain";

/** The steps a farm is set up by, in the order the go-live checklist takes them. */
export const SETUP_STEPS = [
  "identity",
  "registration",
  "manager",
  "vet",
  "vetDays",
  "sheds",
  "people",
  "shedPhone",
  "backup",
  "register",
  "playbook",
] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** How recent a good copy must be for the farm to count as being copied: a night and a half, as the overdue Notice
 *  reads it (`backupGap`), so the card and the Notice never disagree about whether copies are being taken. */
const COPY_COUNTS_FOR_MS = 36 * 60 * 60 * 1000;

/** Whether a standard procedure gives a dose: one of its Steps records a Treatment, and it waits on the Vet's days. */
const givesADose = (content: SopContent): boolean =>
  content.steps.some((step) => step.effect?.kind === "treatment");

/** Which of the standard procedures give a dose — the ones that wait on the Vet's withdrawal days. Read once. */
const STANDARD = Object.entries(standardPlaybook()).map(([key, content]) => ({
  key,
  dose: givesADose(content),
}));

/** The whole days from one farm day to another, the first counted as day one. */
const dayNumber = (from: string, today: string): number =>
  Math.floor((Date.parse(today) - Date.parse(from)) / DAY_MS) + 1;

/** What the setup card needs to know of where the farm stands. */
interface Standing {
  identity: boolean;
  registration: boolean;
  manager: boolean;
  vet: boolean;
  medicines: { total: number; withDays: number };
  sheds: boolean;
  staff: { ready: number };
  phones: { setUp: number };
  copiedLately: boolean;
  openingCount: { counted: number; onRegister: number } | null;
  procedures: { published: number };
}

/**
 * What is left to set the farm up, each step until the farm's records say it is done — and not before: a milker with
 * no PIN or Pen cannot work, a phone that never took its code is not a phone, one animal is not a herd. The opening
 * register is in once the Owner's count of the sheds agrees with it. Nothing once all are done.
 */
export const setupLeftOf = (standing: Standing): SetupStep[] => {
  const done: Record<SetupStep, boolean> = {
    identity: standing.identity,
    registration: standing.registration,
    manager: standing.manager,
    vet: standing.vet,
    vetDays: standing.medicines.withDays === standing.medicines.total,
    sheds: standing.sheds,
    people: standing.staff.ready > 0,
    shedPhone: standing.phones.setUp > 0,
    backup: standing.copiedLately,
    register:
      standing.openingCount !== null &&
      standing.openingCount.counted === standing.openingCount.onRegister,
    playbook: standing.procedures.published > 0,
  };
  return SETUP_STEPS.filter((step) => !done[step]);
};

/**
 * Where the farm stands on its way to running on the app, read from its own records: the parts of the go-live
 * checklist a record can answer, and the Owner's word on the two it cannot — the herd counted in the sheds against the
 * register, and the day the paper register was put away.
 */
export const goingLiveOf = async (
  db: Pick<Database, "query">,
  farmId: string,
  now: Date
) => {
  const [
    farm,
    roles,
    invites,
    medicines,
    pen,
    pins,
    assignments,
    phones,
    lastGoodCopy,
    animals,
    photos,
    procedures,
    training,
    monthlyCosts,
    certificate,
  ] = await Promise.all([
    db.query.farm.findFirst({
      where: { id: farmId },
      columns: {
        address: true,
        phone: true,
        registrationNumber: true,
        openingCount: true,
        openingCountRegister: true,
        openingCountedOn: true,
        paperPutAwayOn: true,
      },
    }),
    db.query.roleAssignment.findMany({
      where: { farmId, revokedAt: { isNull: true } },
      columns: { userId: true, role: true, scope: true },
      with: { user: { columns: { disabledAt: true } } },
    }),
    db.query.invite.findMany({
      where: {
        farmId,
        status: { ne: "revoked" },
        acceptedAt: { isNull: true },
      },
      columns: { roles: true, codeIssuedAt: true, createdAt: true },
    }),
    db.query.drugProduct.findMany({
      where: { farmId, retiredAt: { isNull: true } },
      columns: {
        milkWithdrawalDays: true,
        meatWithdrawalDays: true,
        retiredAt: true,
      },
    }),
    db.query.pen.findFirst({ where: { farmId }, columns: { id: true } }),
    db.query.staffPin.findMany({
      where: { farmId },
      columns: { userId: true },
    }),
    db.query.penAssignment.findMany({
      where: { farmId, endedAt: { isNull: true } },
      columns: { userId: true },
    }),
    db.query.shedPhone.findMany({
      where: { farmId, revokedAt: { isNull: true } },
      columns: { claimedAt: true },
    }),
    // One install, one farm: the nightly job copies the whole database and writes no farm on its row. A copy dated
    // after now is a copy this clock has not reached.
    db.query.backupRun.findFirst({
      where: { ok: "yes", startedAt: { lte: now } },
      orderBy: { startedAt: "desc", id: "desc" },
      columns: { startedAt: true },
    }),
    db.query.animal.findMany({
      where: { farmId, state: { notIn: [...EXIT_STATES] } },
      columns: { id: true },
    }),
    db.query.animalPhoto.findMany({
      where: { farmId },
      columns: { animalId: true },
    }),
    db.query.sopDefinition.findMany({
      where: {
        farmId,
        retiredAt: { isNull: true },
        currentVersionId: { isNotNull: true },
      },
      columns: { standardKey: true },
    }),
    db.query.sopTraining.findMany({
      where: { farmId },
      columns: { userId: true },
    }),
    db.query.moneyCategory.findMany({
      where: {
        farmId,
        paidMonthlySince: { isNotNull: true },
        retiredAt: { isNull: true },
      },
      columns: { id: true },
    }),
    db.query.registrationCertificate.findFirst({
      where: { farmId },
      columns: { id: true },
    }),
  ]);

  const working = roles.filter((one) => !one.user?.disabledAt);
  const holding = (role: string) =>
    working.filter((one) => one.role === role).map((one) => one.userId);
  const staff = [...new Set(holding("staff"))];
  const pinned = new Set(pins.map((one) => one.userId));
  const assigned = new Set(assignments.map((one) => one.userId));
  const lapsedBefore = now.getTime() - INVITE_LAPSE_DAYS * DAY_MS;
  // A Vet called in for a visit comes and goes; the farm's own Vet is the one whose days the medicines wait on.
  const ownVet =
    working.some((one) => one.role === "vet" && one.scope !== "visiting") ||
    invites.some(
      (one) =>
        one.roles.includes("vet") &&
        (one.codeIssuedAt ?? one.createdAt).getTime() > lapsedBefore
    );
  const onFarm = new Set(animals.map((one) => one.id));
  const adopted = new Set(
    procedures.flatMap((one) => (one.standardKey ? [one.standardKey] : []))
  );
  // Those who do the procedures: Barn Staff and the Managers who run them. The Owner and the Vet are not taught them.
  const teaching = new Set(
    working
      .filter((one) => one.role === "staff" || one.role === "manager")
      .map((one) => one.userId)
  );
  const today = farmDayOf(now);
  const openingCount =
    farm?.openingCount === null ||
    farm?.openingCount === undefined ||
    farm.openingCountRegister === null ||
    farm.openingCountedOn === null
      ? null
      : {
          counted: farm.openingCount,
          onRegister: farm.openingCountRegister,
          countedOn: farm.openingCountedOn,
        };

  const live = {
    identity: Boolean(farm?.address && farm.phone),
    registration: Boolean(farm?.registrationNumber),
    certificate: Boolean(certificate),
    manager: holding("manager").length > 0,
    vet: ownVet,
    medicines: {
      total: medicines.length,
      withDays: medicines.filter((one) => whyNotPrescribable(one) === null)
        .length,
    },
    sheds: Boolean(pen),
    staff: {
      total: staff.length,
      /** With a PIN to switch in on a Shed Phone, and a Pen whose work is theirs. */
      ready: staff.filter((id) => pinned.has(id) && assigned.has(id)).length,
    },
    phones: {
      setUp: phones.filter((one) => one.claimedAt !== null).length,
      waiting: phones.filter((one) => one.claimedAt === null).length,
    },
    lastGoodCopyAt: lastGoodCopy?.startedAt ?? null,
    copiedLately:
      lastGoodCopy !== undefined &&
      now.getTime() - lastGoodCopy.startedAt.getTime() < COPY_COUNTS_FOR_MS,
    herd: {
      onRegister: onFarm.size,
      photographed: photos.filter((one) => onFarm.has(one.animalId)).length,
    },
    openingCount,
    procedures: {
      published: procedures.length,
      standardAdopted: STANDARD.filter((one) => adopted.has(one.key)).length,
      standardTotal: STANDARD.length,
      doseAdopted: STANDARD.filter((one) => one.dose && adopted.has(one.key))
        .length,
      doseTotal: STANDARD.filter((one) => one.dose).length,
      own: procedures.filter((one) => one.standardKey === null).length,
    },
    trained: {
      /** The Barn Staff and Managers taught at least one procedure, of all of them. */
      people: new Set(
        training.map((one) => one.userId).filter((id) => teaching.has(id))
      ).size,
      of: teaching.size,
    },
    monthlyCosts: monthlyCosts.length,
    paperPutAway: farm?.paperPutAwayOn
      ? {
          on: farm.paperPutAwayOn,
          day: dayNumber(farm.paperPutAwayOn, today),
        }
      : null,
  };
  return { ...live, left: setupLeftOf(live) };
};
