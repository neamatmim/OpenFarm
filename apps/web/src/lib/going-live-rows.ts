/** The thirty days without a paper register that go-live asks for. */
export const PAPER_FREE_DAYS = 30;

/** Each line of the go-live checklist the farm's records can answer, in the order the checklist takes them. */
export const GOING_LIVE_ROWS = [
  "identity",
  "certificate",
  "backup",
  "manager",
  "vet",
  "medicines",
  "staff",
  "phones",
  "monthlyCosts",
  "register",
  "photos",
  "count",
  "procedures",
  "doses",
  "training",
  "paper",
] as const;
export type GoingLiveRow = (typeof GOING_LIVE_ROWS)[number];

/** What the rows are read from: the farm's answer to where it stands. */
export interface GoingLiveStanding {
  identity: boolean;
  registration: boolean;
  certificate: boolean;
  copiedLately: boolean;
  manager: boolean;
  vet: boolean;
  medicines: { total: number; withDays: number };
  staff: { total: number; ready: number };
  phones: { setUp: number; waiting: number };
  monthlyCosts: number;
  herd: { onRegister: number; photographed: number };
  openingCount: { counted: number; onRegister: number } | null;
  procedures: {
    standardAdopted: number;
    doseAdopted: number;
    own: number;
  };
  trained: { people: number; of: number };
  paperPutAway: { day: number } | null;
}

/**
 * Whether each line of the checklist is done, as far as the records say: every medicine with the Vet's days, every
 * worker able to work, every phone that was given a code set up, every animal photographed, the Owner's count agreeing
 * with the register, thirty days without paper. A line with nothing to count yet — no workers, no animals — is not done:
 * a farm with no herd has not put its herd in.
 */
export const goingLiveDone = (
  live: GoingLiveStanding
): Record<GoingLiveRow, boolean> => ({
  identity: live.identity && live.registration,
  certificate: live.certificate,
  backup: live.copiedLately,
  manager: live.manager,
  vet: live.vet,
  medicines:
    live.medicines.total > 0 &&
    live.medicines.withDays === live.medicines.total,
  staff: live.staff.total > 0 && live.staff.ready === live.staff.total,
  phones: live.phones.setUp > 0 && live.phones.waiting === 0,
  monthlyCosts: live.monthlyCosts > 0,
  register: live.herd.onRegister > 0,
  photos:
    live.herd.onRegister > 0 && live.herd.photographed === live.herd.onRegister,
  count:
    live.openingCount !== null &&
    live.openingCount.counted === live.openingCount.onRegister,
  procedures: live.procedures.standardAdopted + live.procedures.own > 0,
  doses: live.procedures.doseAdopted > 0,
  training: live.trained.of > 0 && live.trained.people === live.trained.of,
  paper:
    live.paperPutAway !== null && live.paperPutAway.day > PAPER_FREE_DAYS - 1,
});

/** How many of the checklist's lines are done, of all of them. */
export const goingLiveProgress = (
  live: GoingLiveStanding
): { done: number; of: number } => {
  const done = goingLiveDone(live);
  return {
    done: GOING_LIVE_ROWS.filter((row) => done[row]).length,
    of: GOING_LIVE_ROWS.length,
  };
};
