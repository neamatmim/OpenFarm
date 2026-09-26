import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import type { Investor } from "@/components/investors/investor-types";
import { FormField, FormSection, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

interface Person {
  name: string;
  phone: string;
  address: string;
  nid: string;
  bankAccount: string;
}

const NOBODY_YET: Person = {
  name: "",
  phone: "",
  address: "",
  nid: "",
  bankAccount: "",
};

/** A field left blank is a field the Owner did not answer, not an empty answer. */
const orNothing = (value: string) => (value.trim() === "" ? undefined : value);

/** What the farm has written down about somebody, as the form starts from when it is put right. */
const asWritten = (investor: Investor): Person => ({
  name: investor.name,
  phone: investor.phone,
  address: investor.address ?? "",
  nid: investor.nid ?? "",
  bankAccount: investor.bankAccount ?? "",
});

/** The record as the form now has it, in the shape both writing somebody down and putting them right take. */
const theRecord = (person: Person) => ({
  name: person.name,
  phone: person.phone,
  address: orNothing(person.address),
  nid: orNothing(person.nid),
  bankAccount: orNothing(person.bankAccount),
});

/**
 * One Investor, written down once and reused for every Venture they join — or, given one already on file, put
 * right. Never their Nominees: those are named on a paper the Investor signs, the Agreement or a মনোনয়নপত্র, and
 * shown on their page.
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
  const refused = useRefused();
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
      onError: refused,
      onSuccess: () => done(t("investors.recorded")),
    })
  );
  const correcting = useMutation(
    orpc.investors.update.mutationOptions({
      onError: refused,
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
    </FormSheet>
  );
};
