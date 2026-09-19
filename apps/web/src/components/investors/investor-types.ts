import type { orpc } from "@/utils/orpc";

/** One Investor as the list answers them. */
export type Investor = Awaited<
  ReturnType<typeof orpc.investors.list.call>
>["people"][number];

/**
 * Whether a person answers what the Owner typed into the search.
 *
 * Name and phone only: those are what somebody standing in front of her can tell her. An NID or a bank
 * account is on the page once the row is open, but nobody searches a list of twenty people by it, and a
 * bank account is not something to leave a page matching on.
 */
export const matching = (investor: Investor, looking: string) => {
  const wanted = looking.trim().toLowerCase();
  if (wanted === "") {
    return true;
  }
  return (
    investor.name.toLowerCase().includes(wanted) ||
    investor.phone.toLowerCase().includes(wanted)
  );
};
