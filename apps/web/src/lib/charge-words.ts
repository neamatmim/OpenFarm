import type { MessageKey } from "@OpenFarm/i18n";

import type { orpc } from "@/utils/orpc";

/** A charge against a Venture, by the word the farm sends it under. */
export type ChargeWord = Awaited<
  ReturnType<typeof orpc.portal.venture.call>
>["spend"]["charges"][number]["word"];

/** What each charge against a Venture is called, in the reader's own language — on the Owner's Settlement and in an
 *  Investor's portal alike. */
export const CHARGE_WORD = {
  bought: "costs.bought",
  hasil: "costs.hasil",
  trips: "costs.trips",
  feed: "ventures.feed",
  medicine: "ventures.medicine",
  vet: "ventures.vet",
  herd: "ventures.herdCosts",
} as const satisfies Record<ChargeWord, MessageKey>;
