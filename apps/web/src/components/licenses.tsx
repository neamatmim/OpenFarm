import type { LicenseKind } from "@OpenFarm/domain";
import { LICENSE_KINDS, licenseNamed } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatDayField } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileBadge, ImageOff } from "lucide-react";
import { useState } from "react";

import type { Tone } from "@/components/page";
import { EmptyState, Loaded, Section, StatusBadge } from "@/components/page";
import {
  FormField,
  FormSheet,
  NativeSelect,
  UploadButton,
} from "@/components/page-kit";
import { useRetireConfirm } from "@/components/retire-confirm";
import { useLanguage } from "@/i18n/language-provider";
import { photoProblem, shrink } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

type License = Awaited<ReturnType<typeof orpc.licenses.list.call>>[number];

/** The refusals writing a License meets, in the farm's words. */
const REFUSALS = {
  license_needs_a_name: "licenses.refused.needsAName",
  license_expires_before_issued: "licenses.refused.expiresBeforeIssued",
} as const;

/** What the form holds, as typed. */
interface Draft {
  kind: LicenseKind;
  name: string;
  number: string;
  issuer: string;
  issuedOn: string;
  expiresOn: string;
}

const EMPTY: Draft = {
  kind: "trade",
  name: "",
  number: "",
  issuer: "",
  issuedOn: "",
  expiresOn: "",
};

const draftOf = (license: License): Draft => ({
  kind: license.kind,
  name: license.name ?? "",
  number: license.number,
  issuer: license.issuer ?? "",
  issuedOn: license.issuedOn ? formatDayField(license.issuedOn) : "",
  expiresOn: license.expiresOn ? formatDayField(license.expiresOn) : "",
});

/** Writing a License down, or putting one right: its kind — fixed once written — its number, issuer and days. */
const LicenseSheet = ({
  editing,
  open,
  onOpenChange,
}: {
  /** The License put right; nothing for a new one. */
  editing: License | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [draft, setDraft] = useState<Draft>(() =>
    editing ? draftOf(editing) : EMPTY
  );
  const edit = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const done = () => {
    toast.success(t("licenses.saved"));
    onOpenChange(false);
  };
  const add = useMutation(
    orpc.licenses.add.mutationOptions({ onSuccess: done, onError: refused })
  );
  const update = useMutation(
    orpc.licenses.update.mutationOptions({ onSuccess: done, onError: refused })
  );
  const fields = {
    name: draft.kind === "other" ? draft.name.trim() || null : null,
    number: draft.number.trim(),
    issuer: draft.issuer.trim() || null,
    issuedOn: draft.issuedOn || null,
    expiresOn: draft.expiresOn || null,
  };
  const named = draft.kind !== "other" || draft.name.trim() !== "";
  return (
    <FormSheet
      description={t("licenses.sheetWhy")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        editing
          ? update.mutate({ id: editing.id, ...fields })
          : add.mutate({ kind: draft.kind, ...fields })
      }
      open={open}
      pending={add.isPending || update.isPending}
      ready={fields.number !== "" && named}
      submitLabel={t("licenses.save")}
      title={editing ? t("licenses.edit") : t("licenses.add")}
    >
      <FormField id="license-kind" label={t("licenses.kind")}>
        <NativeSelect
          disabled={editing !== null}
          id="license-kind"
          onChange={(event) =>
            edit({
              kind:
                LICENSE_KINDS.find((kind) => kind === event.target.value) ??
                "other",
            })
          }
          value={draft.kind}
        >
          {LICENSE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind === "other"
                ? t("licenses.kindOther")
                : licenseNamed({ kind, name: null }, language)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {draft.kind === "other" ? (
        <FormField id="license-name" label={t("licenses.name")}>
          <Input
            id="license-name"
            maxLength={100}
            onChange={(event) => edit({ name: event.target.value })}
            required
            value={draft.name}
          />
        </FormField>
      ) : null}
      <FormField id="license-number" label={t("licenses.number")}>
        <Input
          id="license-number"
          maxLength={60}
          onChange={(event) => edit({ number: event.target.value })}
          required
          value={draft.number}
        />
      </FormField>
      <FormField
        hint={t("licenses.issuerHint")}
        id="license-issuer"
        label={t("licenses.issuer")}
      >
        <Input
          id="license-issuer"
          maxLength={200}
          onChange={(event) => edit({ issuer: event.target.value })}
          value={draft.issuer}
        />
      </FormField>
      <FormField id="license-issued" label={t("licenses.issuedOn")}>
        <Input
          id="license-issued"
          onChange={(event) => edit({ issuedOn: event.target.value })}
          type="date"
          value={draft.issuedOn}
        />
      </FormField>
      <FormField
        hint={t("licenses.expiresHint")}
        id="license-expires"
        label={t("licenses.expiresOn")}
      >
        <Input
          id="license-expires"
          onChange={(event) => edit({ expiresOn: event.target.value })}
          type="date"
          value={draft.expiresOn}
        />
      </FormField>
    </FormSheet>
  );
};

/** How a License stands: run out, within the renewal lead, good, or never running out. */
const standingOf = (license: License): { tone: Tone; word: MessageKey } => {
  if (license.expiresOn === null) {
    return { tone: "neutral", word: "licenses.standing.noExpiry" };
  }
  if (license.expired) {
    return { tone: "danger", word: "licenses.standing.expired" };
  }
  return license.endingSoon
    ? { tone: "warning", word: "licenses.standing.endingSoon" }
    : { tone: "success", word: "licenses.standing.valid" };
};

/** A License's certificate, shown when asked for and when there is one. */
const LicenseCertificate = ({ license }: { license: License }) => {
  const { t } = useLanguage();
  const photo = useQuery({
    ...orpc.licenses.certificate.queryOptions({
      input: { licenseId: license.id },
    }),
    enabled: license.certificateTakenAt !== null,
  });
  return license.certificateTakenAt && photo.data ? (
    <img
      alt={t("licenses.certificate")}
      className="bg-muted/40 max-h-72 w-full rounded-lg border object-contain"
      src={`data:${photo.data.contentType};base64,${photo.data.data}`}
    />
  ) : (
    <div className="text-muted-foreground bg-muted/40 flex items-center gap-2 rounded-lg border border-dashed px-4 py-4 text-sm">
      <ImageOff aria-hidden className="size-5" />
      {t("licenses.noCertificate")}
    </div>
  );
};

/** One License: what it is and its number, who issued it, its days, how it stands, its certificate, and its acts. */
const LicenseCard = ({
  license,
  onEdit,
  onRetire,
}: {
  license: License;
  onEdit: () => void;
  onRetire: () => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [showing, setShowing] = useState(false);
  const take = useMutation(
    orpc.licenses.setCertificate.mutationOptions({
      onSuccess: () => toast.success(t("certificate.taken")),
      onError: refused,
    })
  );
  const standing = standingOf(license);
  const day = (at: Date | null) =>
    at ? formatDate(at, language, "date") : "—";
  return (
    <li className="flex flex-col gap-3 border-b py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium break-words">
            {`${licenseNamed(license, language)} · ${license.number}`}
          </span>
          {license.issuer ? (
            <span className="text-muted-foreground text-sm break-words">
              {license.issuer}
            </span>
          ) : null}
          <span className="text-muted-foreground text-xs">
            {t("licenses.days", {
              issued: day(license.issuedOn),
              expires: day(license.expiresOn),
            })}
          </span>
        </div>
        <StatusBadge tone={standing.tone}>{t(standing.word)}</StatusBadge>
      </div>
      {showing ? <LicenseCertificate license={license} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onEdit} size="sm" variant="outline">
          {t("licenses.edit")}
        </Button>
        {license.certificateTakenAt ? (
          <Button
            onClick={() => setShowing(!showing)}
            size="sm"
            variant="outline"
          >
            {showing
              ? t("licenses.hideCertificate")
              : t("licenses.showCertificate")}
          </Button>
        ) : null}
        <UploadButton
          busy={take.isPending}
          id={`license-photo-${license.id}`}
          label={t("certificate.take")}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            try {
              take.mutate({ licenseId: license.id, ...(await shrink(file)) });
            } catch (error) {
              toast.error(t(photoProblem(error)));
            }
          }}
        />
        <Button onClick={onRetire} size="sm" variant="ghost">
          {t("licenses.retire")}
        </Button>
      </div>
    </li>
  );
};

/**
 * The farm's **Licenses** beside its DLS Registration — the trade license, the environmental clearance, the fire
 * license, any other — each with its number, issuer, days and certificate. Renewed as the Registration is: the renewal
 * work raised for the Owner the farm's renewal lead before one runs out (ADR 0030).
 */
export const LicensesSection = ({ id }: { id?: string }) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const licenses = useQuery(orpc.licenses.list.queryOptions());
  const [sheet, setSheet] = useState<{ editing: License | null } | null>(null);
  const retire = useMutation(
    orpc.licenses.retire.mutationOptions({
      onSuccess: () => toast.success(t("licenses.retired")),
      onError: refused,
    })
  );
  const retiring = useRetireConfirm({
    retire: (licenseId) => retire.mutate({ id: licenseId }),
    pending: retire.isPending,
    title: (name) => t("licenses.retireTitle", { name }),
    description: t("licenses.retireWhy"),
    confirmLabel: t("licenses.retire"),
  });
  return (
    <Section
      action={
        <Button onClick={() => setSheet({ editing: null })} variant="outline">
          {t("licenses.add")}
        </Button>
      }
      className="scroll-mt-6"
      description={t("licenses.why")}
      id={id}
      title={t("licenses.title")}
    >
      <Loaded query={licenses}>
        {licenses.data?.length ? (
          <ul className="flex flex-col">
            {licenses.data.map((license) => (
              <LicenseCard
                key={license.id}
                license={license}
                onEdit={() => setSheet({ editing: license })}
                onRetire={() =>
                  retiring.ask(
                    license.id,
                    `${licenseNamed(license, language)} ${license.number}`
                  )
                }
              />
            ))}
          </ul>
        ) : (
          <EmptyState bare icon={FileBadge} title={t("licenses.none")} />
        )}
      </Loaded>
      {sheet ? (
        <LicenseSheet
          editing={sheet.editing}
          key={sheet.editing?.id ?? "new"}
          onOpenChange={(open) => {
            if (!open) {
              setSheet(null);
            }
          }}
          open
        />
      ) : null}
      {retiring.dialog}
    </Section>
  );
};
