import { formatDate, formatDayField } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Certificate } from "@/components/certificate";
import { FarmParameters } from "@/components/farm-parameters";
import { Page, PageHeader } from "@/components/page";
import { useLanguage, useT } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/**
 * The farm's own identity: where it is, how it is reached, and its DLS registration.
 *
 * The Owner's or the Manager's to write — the roles matrix gives farm parameters to both, and
 * at go-live it is the Manager who has the certificate in hand. Separate from the Parameters
 * because those are numbers to tune and these are the words printed on papers that leave the
 * farm.
 */
const IdentityPage = () => {
  const t = useT();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const identity = useQuery(orpc.farm.identity.queryOptions());
  // Null until the farm has been read: the fields are filled from the record once, and are the
  // Manager's to edit after that.
  const [draft, setDraft] = useState<{
    address: string;
    phone: string;
    registrationNumber: string;
    registrationOffice: string;
    registrationIssuedOn: string;
    registrationExpiresOn: string;
  } | null>(null);

  const save = useMutation(
    orpc.farm.setIdentity.mutationOptions({
      onSuccess: () => {
        toast.success(t("identity.saved"));
        // Back to the record: what the farm holds is the answer, not what was typed at it.
        setDraft(null);
        queryClient.invalidateQueries({ queryKey: orpc.farm.key() });
      },
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );

  if (!identity.data) {
    return (
      <p className="p-6">
        {identity.isError ? t("common.error") : t("common.loading")}
      </p>
    );
  }

  const farm = identity.data;
  const fields = draft ?? {
    address: farm.address ?? "",
    phone: farm.phone ?? "",
    registrationNumber: farm.registrationNumber ?? "",
    registrationOffice: farm.registrationOffice ?? "",
    registrationIssuedOn: farm.registrationIssuedOn
      ? formatDayField(farm.registrationIssuedOn)
      : "",
    registrationExpiresOn: farm.registrationExpiresOn
      ? formatDayField(farm.registrationExpiresOn)
      : "",
  };
  const edit = (patch: Partial<typeof fields>) =>
    setDraft({ ...fields, ...patch });
  const expiresOn = farm.registrationExpiresOn;

  return (
    <Page width="narrow" className="max-w-3xl">
      <PageHeader description={t("identity.why")} title={t("identity.title")} />

      {/* What the farm should be told before an inspector tells it. */}
      {farm.registrationMissing ? (
        <p className="bg-warning-surface text-warning rounded-xl p-4">
          {t("identity.missing")}
        </p>
      ) : null}
      {expiresOn &&
      (farm.registrationExpired || farm.registrationEndingSoon) ? (
        <p
          className={`rounded-xl p-4 ${
            farm.registrationExpired
              ? "bg-destructive/10 text-destructive"
              : "bg-warning-surface text-warning"
          }`}
        >
          {t(
            farm.registrationExpired
              ? "identity.expired"
              : "identity.endingSoon",
            { when: formatDate(expiresOn, language, "date") }
          )}
        </p>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({
            address: fields.address || null,
            phone: fields.phone || null,
            registrationNumber: fields.registrationNumber || null,
            registrationOffice: fields.registrationOffice || null,
            registrationIssuedOn: fields.registrationIssuedOn || null,
            registrationExpiresOn: fields.registrationExpiresOn || null,
          });
        }}
      >
        {/* The name is the farm's, set when it was created, and not changed from here. */}
        <div className="space-y-1">
          <Label htmlFor="identity-name">{t("identity.name")}</Label>
          <Input disabled id="identity-name" value={farm.name} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="identity-address">{t("identity.address")}</Label>
          <Input
            id="identity-address"
            maxLength={300}
            onChange={(e) => edit({ address: e.target.value })}
            value={fields.address}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="identity-phone">{t("identity.phone")}</Label>
          <Input
            id="identity-phone"
            inputMode="tel"
            maxLength={20}
            onChange={(e) => edit({ phone: e.target.value })}
            value={fields.phone}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="identity-number">
            {t("identity.registrationNumber")}
          </Label>
          <Input
            id="identity-number"
            maxLength={60}
            onChange={(e) => edit({ registrationNumber: e.target.value })}
            value={fields.registrationNumber}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="identity-office">
            {t("identity.registrationOffice")}
          </Label>
          <Input
            id="identity-office"
            maxLength={200}
            onChange={(e) => edit({ registrationOffice: e.target.value })}
            value={fields.registrationOffice}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="identity-issued">
              {t("identity.registrationIssuedOn")}
            </Label>
            <Input
              id="identity-issued"
              onChange={(e) => edit({ registrationIssuedOn: e.target.value })}
              type="date"
              value={fields.registrationIssuedOn}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="identity-expires">
              {t("identity.registrationExpiresOn")}
            </Label>
            <Input
              id="identity-expires"
              onChange={(e) => edit({ registrationExpiresOn: e.target.value })}
              type="date"
              value={fields.registrationExpiresOn}
            />
          </div>
        </div>
        <Button disabled={save.isPending} type="submit">
          {t("identity.save")}
        </Button>
      </form>

      <Certificate updatedAt={farm.certificateUpdatedAt} />

      <FarmParameters />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/farm")({
  component: IdentityPage,
});
