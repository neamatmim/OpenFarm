import { describe, expect, it } from "vitest";

import { doneToday, groupTheDay, nextInPen, owedNowBy } from "./work-groups";

/** Six in the morning on the farm (00:00Z is 06:00 in Dhaka). */
const SIX_AM = new Date("2089-03-10T00:00:00.000Z");

const work = (
  id: string,
  dueAt: string,
  more: Partial<{
    state: string;
    overdue: boolean;
    penId: string | null;
    assignedTo: string | null;
    claimedBy: string | null;
  }> = {}
) => ({
  id,
  dueAt,
  state: "due",
  overdue: false,
  penId: "pen-1",
  assignedTo: null,
  claimedBy: null,
  ...more,
});

describe("the day's list, as now and later", () => {
  it("puts work already due or due within the hour under now, and the evening's under later", () => {
    const day = groupTheDay(
      [
        work("morning-milking", "2089-03-09T23:00:00.000Z", { overdue: true }),
        work("morning-feed", "2089-03-10T00:30:00.000Z"),
        work("evening-milking", "2089-03-10T11:00:00.000Z"),
      ],
      { now: SIX_AM, finishedHere: new Set() }
    );

    expect(day.now.map((one) => one.id)).toEqual([
      "morning-milking",
      "morning-feed",
    ]);
    expect(day.later.map((one) => one.id)).toEqual(["evening-milking"]);
  });

  it("keeps work somebody has started, or that came back, under now whenever it falls due", () => {
    const day = groupTheDay(
      [
        work("begun-early", "2089-03-10T11:00:00.000Z", {
          state: "in_progress",
        }),
        work("sent-back", "2089-03-10T11:00:00.000Z", { state: "sent_back" }),
      ],
      { now: SIX_AM, finishedHere: new Set() }
    );

    expect(day.now.map((one) => one.id)).toEqual(["begun-early", "sent-back"]);
    expect(day.later).toEqual([]);
  });

  it("takes work finished on this phone, still on its way to the farm, off what is owed", () => {
    const day = groupTheDay(
      [
        work("finished-in-the-shed", "2089-03-09T23:00:00.000Z", {
          state: "in_progress",
        }),
        work("evening-milking", "2089-03-10T11:00:00.000Z"),
      ],
      { now: SIX_AM, finishedHere: new Set(["finished-in-the-shed"]) }
    );

    expect(day.now).toEqual([]);
    expect(day.finishedHere.map((one) => one.id)).toEqual([
      "finished-in-the-shed",
    ]);
    expect(day.later.map((one) => one.id)).toEqual(["evening-milking"]);
  });
});

describe("what was done today", () => {
  it("is what the farm says was done and what this phone finished and has not sent, each once", () => {
    expect(
      doneToday(
        [{ id: "cleaning" }, { id: "feeding" }],
        [{ id: "milking" }, { id: "feeding" }]
      ).map((one) => one.id)
    ).toEqual(["milking", "feeding", "cleaning"]);
  });
});

describe("the next job after a Finish", () => {
  const ME = "rahim";

  it("is the free work owed now in the same Pen, before anything later or anywhere else", () => {
    const list = [
      work("milking", "2089-03-09T23:00:00.000Z", { claimedBy: ME }),
      work("evening-feed", "2089-03-10T11:00:00.000Z"),
      work("other-pen-feed", "2089-03-10T00:10:00.000Z", { penId: "pen-2" }),
      work("taken-feed", "2089-03-10T00:10:00.000Z", { claimedBy: "karim" }),
      work("pinned-clean", "2089-03-10T00:15:00.000Z", { assignedTo: "karim" }),
      work("morning-feed", "2089-03-10T00:20:00.000Z"),
    ];

    expect(
      nextInPen(list, {
        finishedId: "milking",
        penId: "pen-1",
        me: ME,
        now: SIX_AM,
        finishedHere: new Set(["milking"]),
      })?.id
    ).toBe("morning-feed");
  });

  it("falls to the Pen's later work when nothing more is owed now, and to nothing when the Pen is done", () => {
    const later = [
      work("milking", "2089-03-09T23:00:00.000Z"),
      work("evening-feed", "2089-03-10T11:00:00.000Z"),
    ];
    const asked = {
      finishedId: "milking",
      penId: "pen-1",
      me: ME,
      now: SIX_AM,
      finishedHere: new Set<string>(),
    };

    expect(nextInPen(later, asked)?.id).toBe("evening-feed");
    expect(nextInPen([later[0] ?? work("x", "")], asked)).toBeNull();
  });
});

describe("the count on Today's work", () => {
  it("is the work owed now that the person holding the phone may start, not the evening's or somebody else's", () => {
    const list = [
      work("milking", "2089-03-09T23:00:00.000Z", { overdue: true }),
      work("mine-begun", "2089-03-10T11:00:00.000Z", {
        state: "in_progress",
        claimedBy: "rahim",
      }),
      work("karims", "2089-03-10T00:10:00.000Z", { claimedBy: "karim" }),
      work("evening", "2089-03-10T11:00:00.000Z"),
      work("sent-already", "2089-03-10T00:10:00.000Z"),
    ];

    expect(
      owedNowBy(list, {
        me: "rahim",
        now: SIX_AM,
        finishedHere: new Set(["sent-already"]),
      })
    ).toBe(2);
  });
});
