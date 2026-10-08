import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { emailLooksRight } from "@/components/investors/investor-sheet";
import type { Investor } from "@/components/investors/investor-types";
import { FormField, FormSection, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** The new Signatory as the form holds them: who they are, their mobile, and the paper that names them. */
interface NewSignatory {
  name: string;
  role: string;
  phone: string;
  email: string;
  nid: string;
  authority: string;
  authorityOn: string;
}

const NOBODY_YET: NewSignatory = {
  name: "",
  role: "",
  phone: "",
  email: "",
  nid: "",
  authority: "",
  authorityOn: "",
};

/** A field left blank is a field the Owner did not answer, not an empty answer. */
const orNothing = (value: string) => (value.trim() === "" ? undefined : value);

/**
 * An Organization's Signatory changed for another person (ADR 0020). Not putting the record right — that is the edit
 * sheet's, for the same person — so it says first what it ends: the old Signatory's portal sign-in and their Portal
 * Consent. The new one signs a consent of their own before they are invited.
 */
export const SignatorySheet = ({
  open,
  onOpenChange,
  investor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investor: Investor;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [next, setNext] = useState<NewSignatory>(NOBODY_YET);
  // Started afresh each time the sheet opens, so a change abandoned half-typed is not waiting there the next time.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setNext(NOBODY_YET);
    }
  }
  const changing = useMutation(
    orpc.investors.changeSignatory.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("investors.signatoryChanged"));
      },
    })
  );
  /** One text field of the form, as every input here is wired. */
  const field = (key: keyof NewSignatory) => ({
    onChange: (event: { target: { value: string } }) =>
      setNext({ ...next, [key]: event.target.value }),
    value: next[key],
  });
  const ready =
    next.name.trim() !== "" &&
    next.phone.trim() !== "" &&
    emailLooksRight(next.email) &&
    next.authority.trim() !== "";
  return (
    <FormSheet
      description={t("investors.changeSignatoryHint", {
        name: investor.organization?.signatory.name ?? "",
      })}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        changing.mutate({
          id: investor.id,
          phone: next.phone,
          email: orNothing(next.email),
          authority: next.authority,
          authorityOn: orNothing(next.authorityOn),
          signatoryName: next.name,
          signatoryNid: orNothing(next.nid),
          signatoryRole: orNothing(next.role),
        })
      }
      open={open}
      pending={changing.isPending}
      ready={ready}
      submitLabel={t("investors.changeSignatory")}
      title={t("investors.changeSignatoryTitle", { name: investor.name })}
      wide
    >
      <FormSection title={t("investors.section.newSignatory")}>
        <FormField
          className="sm:col-span-2"
          id="signatory-name"
          label={t("investors.signatoryName")}
        >
          <Input
            autoComplete="off"
            id="signatory-name"
            maxLength={120}
            required
            {...field("name")}
          />
        </FormField>
        <FormField id="signatory-role" label={t("investors.signatoryRole")}>
          <Input
            autoComplete="off"
            id="signatory-role"
            maxLength={80}
            placeholder={t("investors.signatoryRolePlaceholder")}
            {...field("role")}
          />
        </FormField>
        <FormField id="signatory-phone" label={t("investors.signatoryPhone")}>
          <Input
            id="signatory-phone"
            inputMode="tel"
            maxLength={20}
            required
            {...field("phone")}
          />
        </FormField>
        <FormField
          error={
            emailLooksRight(next.email) ? undefined : t("investors.emailWrong")
          }
          hint={t("investors.emailHint")}
          id="signatory-email"
          label={t("investors.signatoryEmail")}
        >
          <Input
            autoComplete="off"
            id="signatory-email"
            inputMode="email"
            maxLength={254}
            type="email"
            {...field("email")}
          />
        </FormField>
        <FormField id="signatory-nid" label={t("investors.signatoryNid")}>
          <Input
            autoComplete="off"
            id="signatory-nid"
            inputMode="numeric"
            maxLength={40}
            {...field("nid")}
          />
        </FormField>
        <FormField id="signatory-authority" label={t("investors.authority")}>
          <Input
            autoComplete="off"
            id="signatory-authority"
            maxLength={200}
            placeholder={t("investors.authorityPlaceholder")}
            required
            {...field("authority")}
          />
        </FormField>
        <FormField
          id="signatory-authority-on"
          label={t("investors.authorityOn")}
        >
          <Input
            id="signatory-authority-on"
            type="date"
            {...field("authorityOn")}
          />
        </FormField>
      </FormSection>
    </FormSheet>
  );
};
