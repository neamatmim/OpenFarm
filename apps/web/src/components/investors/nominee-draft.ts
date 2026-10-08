import type { Nominee, NomineesProblem } from "@OpenFarm/domain";
import { isMinorOn, nomineesProblem } from "@OpenFarm/domain";

import type { RelationChoice } from "./relations";
import { relationChoiceOf, relationWord } from "./relations";

/**
 * One Nominee as the Owner writes them down: every box as typed, the relations as the form offers them. Turned into a
 * Nominee only to be checked and sent, so a half-typed row is never mistaken for one the farm holds.
 */
export interface NomineeDraft {
  name: string;
  relation: RelationChoice;
  relationInWords: string;
  bornOn: string;
  /** Their NID, or a minor's birth registration: one box, read by their age on the paper's day, so a date of birth put
   *  right keeps what was typed. */
  idNumber: string;
  phone: string;
  share: string;
  receiverName: string;
  receiverRelation: RelationChoice;
  receiverRelationInWords: string;
  receiverPhone: string;
  receiverNid: string;
}

/** A row nobody has typed in yet. */
export const EMPTY_DRAFT: NomineeDraft = {
  name: "",
  relation: "",
  relationInWords: "",
  bornOn: "",
  idNumber: "",
  phone: "",
  share: "",
  receiverName: "",
  receiverRelation: "",
  receiverRelationInWords: "",
  receiverPhone: "",
  receiverNid: "",
};

/** The list in force, back as the form offers it to be written again: a carried-over Nominee's missing date of birth
 *  or number left blank for the Owner to ask. */
export const draftsOf = (nominees: readonly Nominee[]): NomineeDraft[] =>
  nominees.map((one) => {
    const relation = relationChoiceOf(one.relation);
    const receiverRelation = relationChoiceOf(one.receiver?.relation);
    return {
      name: one.name,
      relation: relation.choice,
      relationInWords: relation.inWords,
      bornOn: one.bornOn ?? "",
      idNumber: one.nid ?? one.birthRegistration ?? "",
      phone: one.phone ?? "",
      share: String(one.sharePercent),
      receiverName: one.receiver?.name ?? "",
      receiverRelation: receiverRelation.choice,
      receiverRelationInWords: receiverRelation.inWords,
      receiverPhone: one.receiver?.phone ?? "",
      receiverNid: one.receiver?.nid ?? "",
    };
  });

/** Whether the row's Nominee is under eighteen on the day the paper is signed; nothing to judge before a date. */
export const minorOn = (draft: NomineeDraft, onDay: string) =>
  draft.bornOn !== "" && isMinorOn(draft.bornOn, onDay);

const orNull = (text: string) => (text.trim() === "" ? null : text.trim());

/**
 * The rows as the Nominees the paper names. A Receiver goes with a minor only: one written down for somebody who has
 * since turned out to be of age is left behind rather than refused. The number typed is an adult's NID or a minor's
 * birth registration. An empty share is not a share, and says so.
 */
export const nomineesOf = (
  drafts: readonly NomineeDraft[],
  onDay: string
): Nominee[] =>
  drafts.map((draft) => {
    const minor = minorOn(draft, onDay);
    return {
      name: draft.name.trim(),
      relation: relationWord(draft.relation, draft.relationInWords),
      phone: orNull(draft.phone),
      bornOn: draft.bornOn === "" ? null : draft.bornOn,
      nid: minor ? null : orNull(draft.idNumber),
      birthRegistration: minor ? orNull(draft.idNumber) : null,
      sharePercent:
        draft.share.trim() === "" ? Number.NaN : Number(draft.share),
      receiver: minor
        ? {
            name: draft.receiverName.trim(),
            relation: relationWord(
              draft.receiverRelation,
              draft.receiverRelationInWords
            ),
            phone: orNull(draft.receiverPhone),
            nid: orNull(draft.receiverNid),
          }
        : null,
    };
  });

/** What stops these rows being named on a paper signed on `onDay`: the domain's rule, the one the farm refuses by. */
export const draftsProblem = (
  drafts: readonly NomineeDraft[],
  onDay: string
): NomineesProblem | null => nomineesProblem(nomineesOf(drafts, onDay), onDay);

/** The shares typed so far, for the Owner to see them come to a hundred. */
export const sharesSoFar = (drafts: readonly NomineeDraft[]) =>
  drafts.reduce((sum, one) => sum + (Number(one.share) || 0), 0);
