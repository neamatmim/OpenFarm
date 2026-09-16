import { farmDayOf } from "@OpenFarm/domain";

// What putting a record right actually sends: the fields a Correction edits, what each one holds now, and what was
// typed into it. The farm refuses a Correction that changes nothing and one made against values somebody has since
// changed (ADR 0005), so which fields changed is a decision with consequences — made here, once, rather than by hand
// on each screen that puts something right.

/**
 * One field of a Correction: what the record holds, what the box shows, and what the farm is handed when it changes.
 *
 * `holds` and `shows` are two different things. A buyer is a name on the record and an object to the farm; a note the
 * farm keeps as nothing shows as an empty box. Each kind below says how its own field crosses that gap.
 */
export interface Field<Held, Sent> {
  /** What the record holds, as the farm would say it back — this is what a Correction says it was shown. */
  holds: Held;
  /** What the box starts with, and what it shows when the dialog is opened again. */
  shows: string;
  /** What the farm is handed for this field, from what was typed. Nothing when what was typed cannot be sent. */
  sends: (typed: string) => Sent | undefined;
  /** Whether what was typed is the same as what the record holds, so nothing is sent for it. */
  same: (typed: string) => boolean;
}

/** A figure the farm keeps as a number: litres, kilogrammes, taka. A record that holds none is not corrected here. */
export const figure = (held: number | null): Field<number | null, number> => ({
  holds: held,
  shows: held === null ? "" : String(held),
  sends: (typed) => (typed.trim() === "" ? undefined : Number(typed)),
  same: (typed) => held === null || Number(typed) === held,
});

/**
 * Somebody the farm deals with — a buyer, a seller — which the record holds as a name and the farm takes as the person
 * it names. A blank box is somebody nobody named, and changes nothing.
 */
export const person = (
  held: string | null
): Field<string | null, { name: string }> => ({
  holds: held,
  shows: held ?? "",
  sends: (typed) => (typed.trim() === "" ? undefined : { name: typed.trim() }),
  same: (typed) => typed.trim() === "" || typed.trim() === (held ?? ""),
});

/**
 * Something somebody wrote: a cause a death is put down to, a challan number, a note beside a figure. Cleared, it is
 * sent as nothing rather than as an empty note — the farm reads a challan set to nothing as one it no longer holds.
 */
export const note = (
  held: string | null
): Field<string | null, string | null> => ({
  holds: held,
  shows: held ?? "",
  sends: (typed) => typed.trim() || null,
  same: (typed) => (typed.trim() || null) === held,
});

/**
 * Something the farm keeps in both languages and a person types in one — a Disease as the Vet named it. The record
 * holds what it is called; the farm is handed the name, which it keeps as the Bangla of it.
 */
export const bilingual = (held: string): Field<string, { bn: string }> => ({
  holds: held,
  shows: held,
  sends: (typed) => (typed.trim() === "" ? undefined : { bn: typed.trim() }),
  same: (typed) => typed.trim() === "" || typed.trim() === held,
});

/** A note the farm always holds: a cause, a reason. Cleared, it changes nothing — there is no such record without it. */
export const words = (held: string): Field<string, string> => ({
  holds: held,
  shows: held,
  sends: (typed) => typed.trim(),
  same: (typed) => typed.trim() === "" || typed.trim() === held,
});

/** A farm day, as the farm writes one down and as a date box shows it. */
export const day = (
  held: Date | string | null
): Field<string | null, string> => {
  const said = held === null ? null : farmDayOf(new Date(held));
  return {
    holds: said,
    shows: said ?? "",
    sends: (typed) => (typed === "" ? undefined : typed),
    same: (typed) => typed === (said ?? ""),
  };
};

/** One of a fixed few words the farm uses: how she went, how a service was made. Nothing chosen changes nothing. */
export const choice = <Word extends string>(
  held: Word | null
): Field<Word | null, Word> => ({
  holds: held,
  shows: held ?? "",
  sends: (typed) => (typed === "" ? undefined : (typed as Word)),
  same: (typed) => typed === "" || typed === held,
});

/** The fields a Correction edits, by the name the farm's own procedure calls each one. */
export type Fields = Record<string, Field<unknown, unknown>>;

/** What each box shows when the dialog opens: the record as it stands, every time. */
export const asShown = (fields: Fields): Record<string, string> =>
  Object.fromEntries(
    Object.entries(fields).map(([name, field]) => [name, field.shows])
  );

/**
 * What to send the farm: the fields that changed, each with what it was shown as and what it should hold now.
 *
 * A field nobody touched is not sent at all — the farm reads a Correction as the fields it names — and a Correction
 * that names none of them is not one, so `changesFrom` says so and the dialog does not send it.
 */
export const changesFrom = (
  fields: Fields,
  typed: Record<string, string>
): Record<string, { from: unknown; to: unknown }> =>
  Object.fromEntries(
    Object.entries(fields).flatMap(([name, field]) => {
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

/** Whether anything was actually changed, which is what the farm asks before it takes a Correction. */
export const anythingChanged = (
  fields: Fields,
  typed: Record<string, string>
): boolean => Object.keys(changesFrom(fields, typed)).length > 0;
