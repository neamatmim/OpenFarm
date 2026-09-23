import { translate } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import type { Investor } from "@/components/investors/investor-types";
import {
  FormField,
  FormSection,
  FormSheet,
  NativeSelect,
} from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** The people an Investor names as nominee almost every time, in the order a family is usually spoken of. */
const RELATIONS = [
  "wife",
  "husband",
  "son",
  "daughter",
  "father",
  "mother",
  "brother",
  "sister",
] as const;

type Relation = (typeof RELATIONS)[number];

/** Nothing chosen, one of the usual relations, or somebody else whose relation is written in words. */
type RelationChoice = "" | Relation | "other";

const isRelation = (value: string): value is Relation =>
  (RELATIONS as readonly string[]).includes(value);

interface Person {
  name: string;
  phone: string;
  address: string;
  nid: string;
  bankAccount: string;
  nomineeName: string;
  nomineePhone: string;
  nomineeRelation: RelationChoice;
  nomineeRelationInWords: string;
}

const NOBODY_YET: Person = {
  name: "",
  phone: "",
  address: "",
  nid: "",
  bankAccount: "",
  nomineeName: "",
  nomineePhone: "",
  nomineeRelation: "",
  nomineeRelationInWords: "",
};

/** A field left blank is a field the Owner did not answer, not an empty answer. */
const orNothing = (value: string) => (value.trim() === "" ? undefined : value);

/**
 * The relation as it is kept: a word, in Bangla whatever language the form was filled in, because the joining letter
 * prints it as it stands and the relations already on file are Bangla words.
 */
const relationWord = (person: Person) => {
  if (person.nomineeRelation === "other") {
    return orNothing(person.nomineeRelationInWords);
  }
  return person.nomineeRelation === ""
    ? undefined
    : translate("bn", `investors.relation.${person.nomineeRelation}`);
};

/** A relation as it was kept, back as the form offers it: one of the usual ones where the word is theirs, or
 *  somebody else, in the words that were written. */
const relationChoiceOf = (
  word: string | null | undefined
): Pick<Person, "nomineeRelation" | "nomineeRelationInWords"> => {
  const kept = word?.trim() ?? "";
  if (kept === "") {
    return { nomineeRelation: "", nomineeRelationInWords: "" };
  }
  const usual = RELATIONS.find(
    (relation) => translate("bn", `investors.relation.${relation}`) === kept
  );
  return usual
    ? { nomineeRelation: usual, nomineeRelationInWords: "" }
    : { nomineeRelation: "other", nomineeRelationInWords: kept };
};

/** What the farm has written down about somebody, as the form starts from when it is put right. */
const asWritten = (investor: Investor): Person => ({
  name: investor.name,
  phone: investor.phone,
  address: investor.address ?? "",
  nid: investor.nid ?? "",
  bankAccount: investor.bankAccount ?? "",
  nomineeName: investor.nominee?.name ?? "",
  nomineePhone: investor.nominee?.phone ?? "",
  ...relationChoiceOf(investor.nominee?.relation),
});

/** The record as the form now has it, in the shape both writing somebody down and putting them right take. */
const theRecord = (person: Person) => ({
  name: person.name,
  phone: person.phone,
  address: orNothing(person.address),
  nid: orNothing(person.nid),
  bankAccount: orNothing(person.bankAccount),
  nominee:
    person.nomineeName.trim() === ""
      ? undefined
      : {
          name: person.nomineeName,
          phone: orNothing(person.nomineePhone),
          relation: relationWord(person),
        },
});

/**
 * One Investor, written down once and reused for every Venture they join — or, given one already on file, put
 * right. The nominee is asked for here rather than on the Agreement, because it is the person the family would
 * come to the farm about, not a term of any one run.
 */
export const InvestorSheet = ({
  open,
  onOpenChange,
  investor = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Somebody already on file, to put right; nobody, to write somebody new down. */
  investor?: Investor | null;
}) => {
  const { t } = useLanguage();
  const [person, setPerson] = useState<Person>(NOBODY_YET);
  // Started afresh each time the sheet opens, from what is on file now, so a correction abandoned half-typed
  // is not waiting there the next time, and one saved since is.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPerson(investor ? asWritten(investor) : NOBODY_YET);
    }
  }
  const done = (said: string) => {
    onOpenChange(false);
    toast.success(said);
  };
  const recording = useMutation(
    orpc.investors.record.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: () => done(t("investors.recorded")),
    })
  );
  const correcting = useMutation(
    orpc.investors.update.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: () => done(t("investors.updated")),
    })
  );
  const ready = person.name.trim() !== "" && person.phone.trim() !== "";
  return (
    <FormSheet
      description={
        investor ? t("investors.editHint") : t("investors.recordHint")
      }
      onOpenChange={onOpenChange}
      onSubmit={() =>
        investor
          ? correcting.mutate({ id: investor.id, ...theRecord(person) })
          : recording.mutate(theRecord(person))
      }
      open={open}
      pending={recording.isPending || correcting.isPending}
      ready={ready}
      submitLabel={investor ? t("investors.save") : t("investors.record")}
      title={
        investor
          ? t("investors.editTitle", { name: investor.name })
          : t("investors.record")
      }
      wide
    >
      <FormSection title={t("investors.section.who")}>
        <FormField
          className="sm:col-span-2"
          id="investor-name"
          label={t("investors.name")}
        >
          <Input
            autoComplete="off"
            id="investor-name"
            maxLength={120}
            onChange={(event) =>
              setPerson({ ...person, name: event.target.value })
            }
            required
            value={person.name}
          />
        </FormField>
        <FormField id="investor-phone" label={t("investors.phone")}>
          <Input
            id="investor-phone"
            inputMode="tel"
            maxLength={20}
            onChange={(event) =>
              setPerson({ ...person, phone: event.target.value })
            }
            required
            value={person.phone}
          />
        </FormField>
        <FormField id="investor-nid" label={t("investors.nid")}>
          <Input
            autoComplete="off"
            id="investor-nid"
            inputMode="numeric"
            maxLength={40}
            onChange={(event) =>
              setPerson({ ...person, nid: event.target.value })
            }
            value={person.nid}
          />
        </FormField>
        <FormField
          className="sm:col-span-2"
          id="investor-address"
          label={t("investors.address")}
        >
          <Textarea
            autoComplete="off"
            id="investor-address"
            maxLength={200}
            onChange={(event) =>
              setPerson({ ...person, address: event.target.value })
            }
            rows={2}
            value={person.address}
          />
        </FormField>
      </FormSection>
      <FormSection
        description={t("investors.bankHint")}
        title={t("investors.section.money")}
      >
        <FormField
          className="sm:col-span-2"
          id="investor-bank"
          label={t("investors.bank")}
        >
          <Textarea
            autoComplete="off"
            className="min-h-24"
            id="investor-bank"
            maxLength={300}
            onChange={(event) =>
              setPerson({ ...person, bankAccount: event.target.value })
            }
            placeholder={t("investors.bankPlaceholder")}
            rows={4}
            value={person.bankAccount}
          />
        </FormField>
      </FormSection>
      <FormSection
        description={t("investors.nomineeHint")}
        title={t("investors.nominee")}
      >
        <FormField id="investor-nominee" label={t("investors.nomineeName")}>
          <Input
            autoComplete="off"
            id="investor-nominee"
            maxLength={120}
            onChange={(event) =>
              setPerson({ ...person, nomineeName: event.target.value })
            }
            value={person.nomineeName}
          />
        </FormField>
        <FormField
          id="investor-nominee-phone"
          label={t("investors.nomineePhone")}
        >
          <Input
            id="investor-nominee-phone"
            inputMode="tel"
            maxLength={20}
            onChange={(event) =>
              setPerson({ ...person, nomineePhone: event.target.value })
            }
            value={person.nomineePhone}
          />
        </FormField>
        <FormField
          id="investor-nominee-relation"
          label={t("investors.nomineeRelation")}
        >
          <NativeSelect
            id="investor-nominee-relation"
            onChange={(event) => {
              const chosen = event.target.value;
              setPerson({
                ...person,
                nomineeRelation:
                  isRelation(chosen) || chosen === "other" ? chosen : "",
              });
            }}
            value={person.nomineeRelation}
          >
            <option value="">—</option>
            {RELATIONS.map((relation) => (
              <option key={relation} value={relation}>
                {t(`investors.relation.${relation}`)}
              </option>
            ))}
            <option value="other">{t("investors.relation.other")}</option>
          </NativeSelect>
        </FormField>
        {person.nomineeRelation === "other" ? (
          <FormField
            id="investor-nominee-relation-words"
            label={t("investors.relationInWords")}
          >
            <Input
              autoComplete="off"
              id="investor-nominee-relation-words"
              maxLength={60}
              onChange={(event) =>
                setPerson({
                  ...person,
                  nomineeRelationInWords: event.target.value,
                })
              }
              value={person.nomineeRelationInWords}
            />
          </FormField>
        ) : null}
      </FormSection>
    </FormSheet>
  );
};
