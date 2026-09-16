import { farmDayOf } from "@OpenFarm/domain";

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
 * Something somebody wrote: a cause a death is put down to, a challan number, a note beside a figure. Cleared, it is
 * sent as nothing rather than as an empty note — the farm reads a challan set to nothing as one it no longer holds.
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
    couldBeSent: (typed) => typed !== "",
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
