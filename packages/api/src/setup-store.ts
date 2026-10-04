import type { Database } from "@OpenFarm/db";

/** The steps a farm is set up by, in the order the go-live checklist takes them. */
export const SETUP_STEPS = [
  "identity",
  "registration",
  "sheds",
  "people",
  "shedPhone",
  "register",
  "playbook",
] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/**
 * What is left to set the farm up, each step until the farm's records say it is done: who the farm is (its address and
 * phone, on every paper), its DLS registration, a Pen, Barn Staff, a Shed Phone, an animal, and a published procedure.
 * Nothing once all of them are — a farm running on the app is set up, and the overview stops saying so.
 */
export const setupLeftOn = async (
  db: Pick<Database, "query">,
  farm: {
    id: string;
    address: string | null;
    phone: string | null;
    registrationNumber: string | null;
  }
): Promise<SetupStep[]> => {
  const farmId = farm.id;
  const [pen, staff, phone, animal, sop] = await Promise.all([
    db.query.pen.findFirst({ where: { farmId }, columns: { id: true } }),
    db.query.roleAssignment.findFirst({
      where: { farmId, role: "staff", revokedAt: { isNull: true } },
      columns: { userId: true },
    }),
    db.query.shedPhone.findFirst({
      where: { farmId, revokedAt: { isNull: true } },
      columns: { id: true },
    }),
    db.query.animal.findFirst({ where: { farmId }, columns: { id: true } }),
    db.query.sopDefinition.findFirst({
      where: { farmId, retiredAt: { isNull: true } },
      columns: { id: true },
    }),
  ]);
  const done: Record<SetupStep, boolean> = {
    identity: Boolean(farm.address && farm.phone),
    registration: Boolean(farm.registrationNumber),
    sheds: Boolean(pen),
    people: Boolean(staff),
    shedPhone: Boolean(phone),
    register: Boolean(animal),
    playbook: Boolean(sop),
  };
  return SETUP_STEPS.filter((step) => !done[step]);
};
