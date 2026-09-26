import { formatDate, formatDayField } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Certificate } from "@/components/certificate";
import {
  FarmParameters,
  PARAMETER_SECTIONS,
  SettingsSection,
} from "@/components/farm-parameters";
import { useIsOwner } from "@/components/money";
import { Notice, Page, PageHeader } from "@/components/page";
import { FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

type Identity = Awaited<ReturnType<typeof orpc.farm.identity.call>>;

/** How the farm is reached: the words under its name on every paper. */
interface Contact {
  address: string;
  phone: string;
}

/** The DLS Registration as the certificate prints it. */
interface Registration {
  registrationNumber: string;
  registrationOffice: string;
  registrationIssuedOn: string;
  registrationExpiresOn: string;
}

/** Saving the farm's identity, a part at a time: a field the part does not hold is left as it is. */
const useSaveIdentity = (onSaved: () => void) => {
  const { t } = useLanguage();
  const refused = useRefused();
  return useMutation(
    orpc.farm.setIdentity.mutationOptions({
      onSuccess: () => {
        toast.success(t("identity.saved"));
        // Back to the record: what the farm holds is the answer, not what was typed at it.
        onSaved();
      },
      onError: refused,
    })
  );
};

const differs = <T extends object>(draft: T | null, saved: T): boolean =>
  draft !== null &&
  (Object.keys(saved) as (keyof T)[]).some((key) => draft[key] !== saved[key]);

/** The farm's name, set when it was created, and how it is reached. */
const ContactSection = ({ farm }: { farm: Identity }) => {
  const { t } = useLanguage();
  // Null until somebody types: the fields show the record until then.
  const [draft, setDraft] = useState<Contact | null>(null);
  const save = useSaveIdentity(() => setDraft(null));
  const saved: Contact = {
    address: farm.address ?? "",
    phone: farm.phone ?? "",
  };
  const fields = draft ?? saved;
  const edit = (patch: Partial<Contact>) => setDraft({ ...fields, ...patch });
  return (
    <SettingsSection
      changed={differs(draft, saved)}
      description={t("identity.contactHint")}
      id="farm-contact"
      onReset={() => setDraft(null)}
      onSubmit={() =>
        save.mutate({
          address: fields.address || null,
          phone: fields.phone || null,
        })
      }
      pending={save.isPending}
      saveLabel={t("identity.save")}
      title={t("identity.contact")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {/* The name is the farm's, set when it was created, and not changed from here. */}
        <FormField
          className="sm:col-span-2"
          id="identity-name"
          label={t("identity.name")}
        >
          <Input disabled id="identity-name" value={farm.name} />
        </FormField>
        <FormField
          className="sm:col-span-2"
          id="identity-address"
          label={t("identity.address")}
        >
          <Input
            id="identity-address"
            maxLength={300}
            onChange={(e) => edit({ address: e.target.value })}
            value={fields.address}
          />
        </FormField>
        <FormField id="identity-phone" label={t("identity.phone")}>
          <Input
            id="identity-phone"
            inputMode="tel"
            maxLength={20}
            onChange={(e) => edit({ phone: e.target.value })}
            value={fields.phone}
          />
        </FormField>
      </div>
    </SettingsSection>
  );
};

/** The DLS Registration: its number, the office that issued it, and the days it runs between. */
const RegistrationSection = ({ farm }: { farm: Identity }) => {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<Registration | null>(null);
  const save = useSaveIdentity(() => setDraft(null));
  const saved: Registration = {
    registrationNumber: farm.registrationNumber ?? "",
    registrationOffice: farm.registrationOffice ?? "",
    registrationIssuedOn: farm.registrationIssuedOn
      ? formatDayField(farm.registrationIssuedOn)
      : "",
    registrationExpiresOn: farm.registrationExpiresOn
      ? formatDayField(farm.registrationExpiresOn)
      : "",
  };
  const fields = draft ?? saved;
  const edit = (patch: Partial<Registration>) =>
    setDraft({ ...fields, ...patch });
  return (
    <SettingsSection
      changed={differs(draft, saved)}
      description={t("identity.registrationHint")}
      id="farm-registration"
      onReset={() => setDraft(null)}
      onSubmit={() =>
        save.mutate({
          registrationNumber: fields.registrationNumber || null,
          registrationOffice: fields.registrationOffice || null,
          registrationIssuedOn: fields.registrationIssuedOn || null,
          registrationExpiresOn: fields.registrationExpiresOn || null,
        })
      }
      pending={save.isPending}
      saveLabel={t("identity.save")}
      title={t("identity.registration")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="identity-number"
          label={t("identity.registrationNumber")}
        >
          <Input
            id="identity-number"
            maxLength={60}
            onChange={(e) => edit({ registrationNumber: e.target.value })}
            value={fields.registrationNumber}
          />
        </FormField>
        <FormField
          id="identity-office"
          label={t("identity.registrationOffice")}
        >
          <Input
            id="identity-office"
            maxLength={200}
            onChange={(e) => edit({ registrationOffice: e.target.value })}
            value={fields.registrationOffice}
          />
        </FormField>
        <FormField
          id="identity-issued"
          label={t("identity.registrationIssuedOn")}
        >
          <Input
            id="identity-issued"
            onChange={(e) => edit({ registrationIssuedOn: e.target.value })}
            type="date"
            value={fields.registrationIssuedOn}
          />
        </FormField>
        <FormField
          id="identity-expires"
          label={t("identity.registrationExpiresOn")}
        >
          <Input
            id="identity-expires"
            onChange={(e) => edit({ registrationExpiresOn: e.target.value })}
            type="date"
            value={fields.registrationExpiresOn}
          />
        </FormField>
      </div>
    </SettingsSection>
  );
};

/** What the farm should be told before an inspector tells it. */
const RegistrationNotices = ({ farm }: { farm: Identity }) => {
  const { t, language } = useLanguage();
  const expiresOn = farm.registrationExpiresOn;
  const when = expiresOn ? formatDate(expiresOn, language, "date") : "";
  return (
    <>
      {farm.registrationMissing ? (
        <Notice title={t("identity.missing")} tone="warning" />
      ) : null}
      {expiresOn && farm.registrationExpired ? (
        <Notice title={t("identity.expired", { when })} tone="danger" />
      ) : null}
      {expiresOn && !farm.registrationExpired && farm.registrationEndingSoon ? (
        <Notice title={t("identity.endingSoon", { when })} tone="warning" />
      ) : null}
    </>
  );
};

/** The parts of the page, listed beside it where there is room, each a jump to its place. */
const OnThisPage = () => {
  const { t } = useLanguage();
  const isOwner = useIsOwner();
  const parts = [
    { id: "farm-contact", title: t("identity.contact") },
    { id: "farm-registration", title: t("identity.registration") },
    { id: "farm-certificate", title: t("certificate.title") },
    ...PARAMETER_SECTIONS.filter((part) => !part.owner || isOwner).map(
      (part) => ({
        id: part.id,
        title: t(part.title),
      })
    ),
  ];
  return (
    <nav
      aria-label={t("identity.onThisPage")}
      className="hidden lg:sticky lg:top-6 lg:block"
    >
      <p className="text-muted-foreground mb-2 px-3 text-xs font-semibold tracking-wider uppercase">
        {t("identity.onThisPage")}
      </p>
      <ul className="flex flex-col gap-0.5 border-l">
        {parts.map((part) => (
          <li key={part.id}>
            <a
              className="text-muted-foreground hover:text-foreground hover:border-foreground focus-visible:ring-ring -ml-px block border-l-2 border-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-2"
              href={`#${part.id}`}
            >
              {part.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

/**
 * The farm's own identity and how it is tuned, a part at a time, each saved on its own: how it is reached, its DLS
 * Registration and the certificate's photograph, and the Parameters in their groups.
 *
 * The Owner's or the Manager's to write — the roles matrix gives farm parameters to both, and
 * at go-live it is the Manager who has the certificate in hand. The identity is kept apart from the Parameters
 * because those are numbers to tune and these are the words printed on papers that leave the farm.
 */
const IdentityPage = () => {
  const { t } = useLanguage();
  const identity = useQuery(orpc.farm.identity.queryOptions());

  if (!identity.data) {
    return (
      <Page>
        <PageHeader
          description={t("identity.why")}
          title={t("identity.title")}
        />
        {identity.isError ? (
          <Notice title={t("common.error")} tone="danger" />
        ) : (
          <Skeleton className="h-96 rounded-xl" />
        )}
      </Page>
    );
  }
  const farm = identity.data;

  return (
    <Page>
      <PageHeader description={t("identity.why")} title={t("identity.title")} />

      <div className="grid items-start gap-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <OnThisPage />
        <div className="flex min-w-0 flex-col gap-6">
          <RegistrationNotices farm={farm} />
          <ContactSection farm={farm} />
          <RegistrationSection farm={farm} />
          <Certificate
            id="farm-certificate"
            updatedAt={farm.certificateUpdatedAt}
          />
          <FarmParameters />
        </div>
      </div>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/farm")({
  component: IdentityPage,
});
