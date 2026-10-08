import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import type { Investor } from "@/components/investors/investor-types";
import { SegmentedControl } from "@/components/page";
import { FormField, FormSection, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

type Kind = Investor["kind"];

/** Everything the form holds, for either kind: what a person has, what an Organization and its Signatory have. */
interface Draft {
  kind: Kind;
  name: string;
  phone: string;
  address: string;
  nid: string;
  bankAccount: string;
  tradeLicense: string;
  rjscNumber: string;
  tin: string;
  authority: string;
  authorityOn: string;
  signatoryName: string;
  signatoryNid: string;
  signatoryRole: string;
}

const NOBODY_YET: Draft = {
  kind: "person",
  name: "",
  phone: "",
  address: "",
  nid: "",
  bankAccount: "",
  tradeLicense: "",
  rjscNumber: "",
  tin: "",
  authority: "",
  authorityOn: "",
  signatoryName: "",
  signatoryNid: "",
  signatoryRole: "",
};

/** A field left blank is a field the Owner did not answer, not an empty answer. */
const orNothing = (value: string) => (value.trim() === "" ? undefined : value);

/** What the farm has written down about somebody, as the form starts from when it is put right. */
const asWritten = (investor: Investor): Draft => ({
  kind: investor.kind,
  name: investor.name,
  phone: investor.phone,
  address: investor.address ?? "",
  nid: investor.nid ?? "",
  bankAccount: investor.bankAccount ?? "",
  tradeLicense: investor.organization?.tradeLicense ?? "",
  rjscNumber: investor.organization?.rjscNumber ?? "",
  tin: investor.organization?.tin ?? "",
  authority: investor.organization?.authority ?? "",
  authorityOn: investor.organization?.authorityOn ?? "",
  signatoryName: investor.organization?.signatory.name ?? "",
  signatoryNid: investor.organization?.signatory.nid ?? "",
  signatoryRole: investor.organization?.signatory.role ?? "",
});

/** The record as the form now has it, in the shape both writing somebody down and putting them right take: a
 *  person's fields for a person, an Organization's for an Organization, never both. */
const theRecord = (draft: Draft) =>
  draft.kind === "organization"
    ? {
        kind: "organization" as const,
        name: draft.name,
        phone: draft.phone,
        address: orNothing(draft.address),
        bankAccount: orNothing(draft.bankAccount),
        tradeLicense: orNothing(draft.tradeLicense),
        rjscNumber: orNothing(draft.rjscNumber),
        tin: orNothing(draft.tin),
        authority: draft.authority,
        authorityOn: orNothing(draft.authorityOn),
        signatoryName: draft.signatoryName,
        signatoryNid: orNothing(draft.signatoryNid),
        signatoryRole: orNothing(draft.signatoryRole),
      }
    : {
        kind: "person" as const,
        name: draft.name,
        phone: draft.phone,
        address: orNothing(draft.address),
        nid: orNothing(draft.nid),
        bankAccount: orNothing(draft.bankAccount),
      };

/** Whether the form holds enough to write down: a name and a mobile, and for an Organization its Signatory and the
 *  paper that names them. */
const isReady = (draft: Draft) =>
  draft.name.trim() !== "" &&
  draft.phone.trim() !== "" &&
  (draft.kind === "person" ||
    (draft.signatoryName.trim() !== "" && draft.authority.trim() !== ""));

/**
 * One Investor, written down once and reused for every Venture they join — or, given one already on file, put
 * right. A person, or an Organization and its Signatory (ADR 0020), chosen when they are written down and not changed
 * afterwards. Never a person's Nominees: those are named on a paper the Investor signs, the Agreement or a
 * মনোনয়নপত্র, and shown on their page.
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
  const [draft, setDraft] = useState<Draft>(NOBODY_YET);
  // Started afresh each time the sheet opens, from what is on file now, so a correction abandoned half-typed
  // is not waiting there the next time, and one saved since is.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(investor ? asWritten(investor) : NOBODY_YET);
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
  const ready = isReady(draft);
  const organization = draft.kind === "organization";
  /** One text field of the draft, as every input here is wired. */
  const field = (key: Exclude<keyof Draft, "kind">) => ({
    onChange: (event: { target: { value: string } }) =>
      setDraft({ ...draft, [key]: event.target.value }),
    value: draft[key],
  });
  return (
    <FormSheet
      description={
        investor ? t("investors.editHint") : t("investors.recordHint")
      }
      onOpenChange={onOpenChange}
      onSubmit={() =>
        investor
          ? correcting.mutate({ id: investor.id, ...theRecord(draft) })
          : recording.mutate(theRecord(draft))
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
      {investor ? null : (
        <FormSection title={t("investors.kind.question")}>
          <div className="flex sm:col-span-2">
            <SegmentedControl
              label={t("investors.kind.question")}
              name="investor-kind"
              onChange={(kind) => setDraft({ ...draft, kind })}
              options={[
                { value: "person", label: t("investors.kind.person") },
                {
                  value: "organization",
                  label: t("investors.kind.organization"),
                },
              ]}
              value={draft.kind}
            />
          </div>
        </FormSection>
      )}
      {organization ? (
        <>
          <FormSection title={t("investors.section.organization")}>
            <FormField
              className="sm:col-span-2"
              id="investor-name"
              label={t("investors.organizationName")}
            >
              <Input
                autoComplete="off"
                id="investor-name"
                maxLength={120}
                required
                {...field("name")}
              />
            </FormField>
            <FormField
              id="investor-trade-license"
              label={t("investors.tradeLicense")}
            >
              <Input
                autoComplete="off"
                id="investor-trade-license"
                maxLength={40}
                {...field("tradeLicense")}
              />
            </FormField>
            <FormField id="investor-rjsc" label={t("investors.rjscNumber")}>
              <Input
                autoComplete="off"
                id="investor-rjsc"
                maxLength={40}
                {...field("rjscNumber")}
              />
            </FormField>
            <FormField id="investor-tin" label={t("investors.tin")}>
              <Input
                autoComplete="off"
                id="investor-tin"
                inputMode="numeric"
                maxLength={40}
                {...field("tin")}
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
                rows={2}
                {...field("address")}
              />
            </FormField>
          </FormSection>
          <FormSection
            description={t("investors.signatoryHint")}
            title={t("investors.section.signatory")}
          >
            <FormField
              className="sm:col-span-2"
              id="investor-signatory-name"
              label={t("investors.signatoryName")}
            >
              <Input
                autoComplete="off"
                id="investor-signatory-name"
                maxLength={120}
                required
                {...field("signatoryName")}
              />
            </FormField>
            <FormField
              id="investor-signatory-role"
              label={t("investors.signatoryRole")}
            >
              <Input
                autoComplete="off"
                id="investor-signatory-role"
                maxLength={80}
                placeholder={t("investors.signatoryRolePlaceholder")}
                {...field("signatoryRole")}
              />
            </FormField>
            <FormField
              id="investor-phone"
              label={t("investors.signatoryPhone")}
            >
              <Input
                id="investor-phone"
                inputMode="tel"
                maxLength={20}
                required
                {...field("phone")}
              />
            </FormField>
            <FormField
              id="investor-signatory-nid"
              label={t("investors.signatoryNid")}
            >
              <Input
                autoComplete="off"
                id="investor-signatory-nid"
                inputMode="numeric"
                maxLength={40}
                {...field("signatoryNid")}
              />
            </FormField>
            <FormField id="investor-authority" label={t("investors.authority")}>
              <Input
                autoComplete="off"
                id="investor-authority"
                maxLength={200}
                placeholder={t("investors.authorityPlaceholder")}
                required
                {...field("authority")}
              />
            </FormField>
            <FormField
              id="investor-authority-on"
              label={t("investors.authorityOn")}
            >
              <Input
                id="investor-authority-on"
                type="date"
                {...field("authorityOn")}
              />
            </FormField>
          </FormSection>
        </>
      ) : (
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
              required
              {...field("name")}
            />
          </FormField>
          <FormField id="investor-phone" label={t("investors.phone")}>
            <Input
              id="investor-phone"
              inputMode="tel"
              maxLength={20}
              required
              {...field("phone")}
            />
          </FormField>
          <FormField id="investor-nid" label={t("investors.nid")}>
            <Input
              autoComplete="off"
              id="investor-nid"
              inputMode="numeric"
              maxLength={40}
              {...field("nid")}
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
              rows={2}
              {...field("address")}
            />
          </FormField>
        </FormSection>
      )}
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
            placeholder={t("investors.bankPlaceholder")}
            rows={4}
            {...field("bankAccount")}
          />
        </FormField>
      </FormSection>
    </FormSheet>
  );
};
