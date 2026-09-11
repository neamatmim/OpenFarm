/** Where a cow's milk went. Its own module because both the Completion that records the act
 *  and the Milk Record the act writes are typed by it, and they import each other. */
export const MILK_DESTINATIONS = ["bulk", "calves", "discard"] as const;
