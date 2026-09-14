import type { Database } from "@OpenFarm/db";

import { addDays, clientOf, openAccount } from "./runtime";
import type { SeedClock } from "./runtime";
import type { Farm } from "./standing";

/** The vet the Manager called in this week about a lame cow: a visiting Vet, until a fortnight from today. */
export const VISITING_VET = {
  role: "vet (visiting)",
  name: "ডা. তানভীর রহমান",
  email: "visitingvet@openfarm.test",
} as const;

/**
 * Calls a visiting Vet in, the way the farm does it: the Manager invites them for a visit, the Owner approves, they
 * take it up with the code, and the Manager opens a Case on the cow most recently seen lame.
 */
export const callInAVisitingVet = async (
  farm: Farm,
  db: Database,
  clock: SeedClock,
  today: string
): Promise<void> => {
  const invited = await farm.as.manager.people.invite({
    email: VISITING_VET.email,
    name: VISITING_VET.name,
    roles: ["vet"],
    visitUntil: addDays(today, 14),
  });
  await farm.as.owner.people.approveInvite({ id: invited.id });
  const account = await openAccount(db, { ...VISITING_VET, role: "vet" });
  const vet = await clientOf(db, account, clock);
  await vet.people.acceptInvite({ code: invited.code });

  const lame = await db.query.observation.findFirst({
    where: { saw: "lame", withdrawnAt: { isNull: true } },
    orderBy: { seenAt: "desc" },
    with: { animal: { columns: { tagNumber: true, state: true } } },
  });
  const tagNumber = lame?.animal.tagNumber;
  if (tagNumber) {
    await farm.as.manager.vetCases.open({
      tagNumber,
      vetId: account.session.user.id,
      reason: "খোঁড়াচ্ছে — খুর দেখে যাবেন",
    });
  }
};
