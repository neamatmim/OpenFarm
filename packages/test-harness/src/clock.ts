/** A clock tests can set and advance. Structurally matches the API's Clock. */
export class FakeClock {
  private current: Date;

  constructor(start: Date | string = "2026-09-11T05:00:00.000Z") {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(to: Date | string): void {
    this.current = new Date(to);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
