import { atFarmTime, farmDayOf, farmTimeOf } from "@OpenFarm/domain";

// What putting a record right actually sends: the answers a Correction edits, what each one holds now, and what was
// typed into it. The farm refuses a Correction that changes nothing and one made against values somebody has since
// changed (ADR 0005), so which answers changed is a decision with consequences — made here, once, rather than by hand
// on each screen that puts something right.

/**
 * One field of a Correction: what the record holds, what the box shows, and what the farm is handed when it changes.
 *
 * `holds` and `shows` are two different things. A buyer is a name on the record and an object to the farm; a note the
 * farm keeps as nothing shows as an empty box. Each kind below says how its own field crosses that gap.
 */
export interface Answer<Held, Sent> {
  /** What the record holds, as the farm would say it back — this is what a Correction says it was shown. */
  holds: Held;
  /** What the box starts with, and what it shows when the dialog is opened again. */
  shows: string;
  /** What the farm is handed for this field, from what was typed. Nothing when what was typed cannot be sent. */
  sends: (typed: string) => Sent | undefined;
  /** Whether what was typed is the same as what the record holds, so nothing is sent for it. */
  same: (typed: string) => boolean;
  /** Whether what was typed is something the farm could take at all. A figure of nothing where the farm wants one,
   *  a name rubbed out: the farm would refuse it, and the phone knows that without asking. */
  couldBeSent: (typed: string) => boolean;
}

/** A figure the farm keeps as a number: litres, kilogrammes, taka. A record that holds none is not corrected here. */
export const figure = (
  held: number | null,
  /** The least the farm will take. A price or a weight is above nothing; a figure that may be nothing says so. */
  atLeast = 0
): Answer<number | null, number> => ({
  holds: held,
  shows: held === null ? "" : String(held),
  sends: (typed) => (typed.trim() === "" ? undefined : Number(typed)),
  same: (typed) => held === null || Number(typed) === held,
  couldBeSent: (typed) => {
    const figured = Number(typed);
    return typed.trim() !== "" && !Number.isNaN(figured) && figured >= atLeast;
  },
});

/** A figure a record may hold none of — the fat a collector did not measure: written in where nobody had, and an emptied
 *  box sent as nothing, which clears it. */
export const optionalFigure = (
  held: number | null
): Answer<number | null, number | null> => ({
  holds: held,
  shows: held === null ? "" : String(held),
  sends: (typed) => (typed.trim() === "" ? null : Number(typed)),
  same: (typed) =>
    typed.trim() === "" ? held === null : Number(typed) === held,
  couldBeSent: (typed) => {
    const figured = Number(typed);
    return typed.trim() === "" || (!Number.isNaN(figured) && figured >= 0);
  },
});

/** A figure the farm will not take as nothing: what a Sale fetched, what an Intake cost, what a Pen was given. */
export const amount = (held: number | null): Answer<number | null, number> =>
  figure(held, Number.MIN_VALUE);

/**
 * The Counterparty a record stands against — the seller on an Intake, the buyer on a Sale — which the record holds as
 * a name and the farm takes as the Counterparty it names. A blank box is nobody, and changes nothing.
 */
export const counterparty = (
  held: string | null
): Answer<string | null, { name: string }> => ({
  holds: held,
  shows: held ?? "",
  sends: (typed) => (typed.trim() === "" ? undefined : { name: typed.trim() }),
  same: (typed) => typed.trim() === "" || typed.trim() === (held ?? ""),
  // A name rubbed out is not a correction the farm can take: it is a buyer nobody named.
  couldBeSent: (typed) => typed.trim() !== "" || held === null,
});

/**
 * Something somebody wrote: a cause a death is put down to, a delivery note number, a note beside a figure. Cleared, it is
 * sent as nothing rather than as an empty note — the farm reads a delivery note set to nothing as one it no longer holds.
 */
export const note = (
  held: string | null
): Answer<string | null, string | null> => ({
  holds: held,
  shows: held ?? "",
  sends: (typed) => typed.trim() || null,
  same: (typed) => (typed.trim() || null) === held,
  couldBeSent: () => true,
});

/**
 * Something the farm keeps in both languages and a person types in one — a Disease as the Vet named it. The record
 * holds what it is called; the farm is handed the name, which it keeps as the Bangla of it.
 */
export const bilingual = (held: string): Answer<string, { bn: string }> => ({
  holds: held,
  shows: held,
  sends: (typed) => (typed.trim() === "" ? undefined : { bn: typed.trim() }),
  same: (typed) => typed.trim() === "" || typed.trim() === held,
  couldBeSent: (typed) => typed.trim() !== "",
});

/** A note the farm always holds: a cause, a reason. Cleared, it changes nothing — there is no such record without it. */
export const words = (held: string): Answer<string, string> => ({
  holds: held,
  shows: held,
  sends: (typed) => typed.trim(),
  same: (typed) => typed.trim() === "" || typed.trim() === held,
  couldBeSent: (typed) => typed.trim() !== "",
});

/** A farm day, as the farm writes one down and as a date box shows it. */
export const day = (
  held: Date | string | null
): Answer<string | null, string> => {
  const said = held === null ? null : farmDayOf(new Date(held));
  return {
    holds: said,
    shows: said ?? "",
    sends: (typed) => (typed === "" ? undefined : typed),
    same: (typed) => typed === (said ?? ""),
    // A day rubbed out is not one the farm can take; a box that was empty and still is changes nothing — a Sale paid
    // in full holds no day the buyer promised to pay by, and the rest of it can still be put right.
    couldBeSent: (typed) => typed !== "" || said === null,
  };
};

/**
 * A moment, as a date-and-time box shows it on the farm's own clock: when a lorry collected the milk. The record's
 * moment is what the farm is told it was shown, to the second; what is typed is sent as that farm day and time — a
 * collection typed in after midnight is put back on the day it left.
 */
export const moment = (held: Date | string): Answer<string, Date> => {
  const at = new Date(held);
  const shows = `${farmDayOf(at)}T${farmTimeOf(at)}`;
  return {
    holds: at.toISOString(),
    shows,
    sends: (typed) =>
      typed === ""
        ? undefined
        : atFarmTime(
            typed.slice(0, "YYYY-MM-DD".length),
            typed.slice("YYYY-MM-DDT".length)
          ),
    same: (typed) => typed === shows,
    // A moment rubbed out is not one the farm can take: the milk left at some time.
    couldBeSent: (typed) => typed !== "",
  };
};

/**
 * Voiding a record written against the wrong animal — the Owner's alone: chosen, it sends that it is void; left alone,
 * nothing. Never undone from here: a void is the record taken off the books.
 */
export const voiding = (): Answer<boolean, true> => ({
  holds: false,
  shows: "",
  sends: (typed) => (typed === "void" ? true : undefined),
  same: (typed) => typed !== "void",
  couldBeSent: () => true,
});

/** A Target Window as two date boxes type it into one answer: its first day and its last, `start|end`. */
const daysOf = (typed: string) => {
  const [start = "", end = ""] = typed.split("|");
  return { start, end };
};

/** Both days of a typed window, in order: a window the farm would take. */
export const isWholeWindow = (typed: string): boolean => {
  const { start, end } = daysOf(typed);
  return start !== "" && end !== "" && start <= end;
};

/** One day of a typed window set, the other kept: what a date box writes into the answer. */
export const withWindowDay = (
  typed: string,
  which: "start" | "end",
  value: string
): string => {
  const days = { ...daysOf(typed), [which]: value };
  return `${days.start}|${days.end}`;
};

/**
 * The Target Window an animal is sold in. Asked afresh — the boxes blank, and whatever is typed sent — where the one
 * she is on was never the Farm's choice: a Venture's, for an animal a Correction is making the Farm's own.
 */
export const targetWindow = (
  held: { start: string; end: string },
  { askedAfresh = false } = {}
): Answer<{ start: string; end: string }, { start: string; end: string }> => {
  const shows = askedAfresh ? "" : `${held.start}|${held.end}`;
  return {
    holds: held,
    shows,
    sends: (typed) => (isWholeWindow(typed) ? daysOf(typed) : undefined),
    same: (typed) => (askedAfresh ? !isWholeWindow(typed) : typed === shows),
    couldBeSent: (typed) =>
      isWholeWindow(typed) ||
      (askedAfresh && daysOf(typed).start === "" && daysOf(typed).end === ""),
  };
};

/** One of a fixed few words the farm uses: how she went, how a service was made. Nothing chosen changes nothing. */
export const choice = <Word extends string>(
  held: Word | null
): Answer<Word | null, Word> => ({
  holds: held,
  shows: held ?? "",
  sends: (typed) => (typed === "" ? undefined : (typed as Word)),
  same: (typed) => typed === "" || typed === held,
  couldBeSent: () => true,
});

/** The answers a Correction edits, by the name the farm's own procedure calls each one. */
export type Answers = Record<string, Answer<unknown, unknown>>;

/** What each box shows when the dialog opens: the record as it stands, every time. */
export const asShown = (answers: Answers): Record<string, string> =>
  Object.fromEntries(
    Object.entries(answers).map(([name, field]) => [name, field.shows])
  );

/**
 * What to send the farm: the answers that changed, each with what it was shown as and what it should hold now.
 *
 * A field nobody touched is not sent at all — the farm reads a Correction as the answers it names — and a Correction
 * that names none of them is not one, so `changesFrom` says so and the dialog does not send it.
 */
export const changesFrom = (
  answers: Answers,
  typed: Record<string, string>
): Record<string, { from: unknown; to: unknown }> =>
  Object.fromEntries(
    Object.entries(answers).flatMap(([name, field]) => {
      const said = typed[name] ?? field.shows;
      if (field.same(said)) {
        return [];
      }
      const sending = field.sends(said);
      return sending === undefined
        ? []
        : [[name, { from: field.holds, to: sending }]];
    })
  );

/**
 * Whether this is a Correction the farm could take: something was changed, and everything typed is something the farm
 * would have. A price of nothing is not a Correction of the price — it is a box somebody emptied.
 */
export const readyToSend = (
  answers: Answers,
  typed: Record<string, string>
): boolean =>
  Object.keys(changesFrom(answers, typed)).length > 0 &&
  Object.entries(answers).every(([name, field]) =>
    field.couldBeSent(typed[name] ?? field.shows)
  );
