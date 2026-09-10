/** Where the API reads "now" from. Injected so time-based rules are testable. */
export interface Clock {
  now: () => Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
