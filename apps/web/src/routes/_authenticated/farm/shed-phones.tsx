import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Smartphone, SmartphoneNfc } from "lucide-react";
import { useState } from "react";

import { PhoneTable } from "@/components/devices/phone-table";
import { EmptyState, Loaded, Page, PageHeader } from "@/components/page";
import { FormDialog, FormField } from "@/components/page-kit";
import { OneTimeCode } from "@/components/people/one-time-code";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** The enrollment code a new phone is given, with its name and how long it lasts. */
interface Enrollment {
  name: string;
  code: string;
  minutes: number;
}

/** Naming a new Shed Phone, in a dialog; the farm answers with the code to type into it. */
const EnrollDialog = ({
  open,
  onOpenChange,
  onEnrolled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnrolled: (enrollment: Enrollment) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [name, setName] = useState("");
  const enroll = useMutation(
    orpc.devices.enroll.mutationOptions({
      onSuccess: (result) => {
        onEnrolled({
          name: result.name,
          code: result.code,
          minutes: result.expiresInMinutes,
        });
        setName("");
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormDialog
      description={t("device.addWhy")}
      onOpenChange={onOpenChange}
      onSubmit={() => enroll.mutate({ name })}
      open={open}
      pending={enroll.isPending}
      ready={name.trim() !== ""}
      submitLabel={t("device.add")}
      title={t("device.add")}
    >
      <FormField id="phone-name" label={t("device.name")}>
        <Input
          autoComplete="off"
          id="phone-name"
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </FormField>
    </FormDialog>
  );
};

/**
 * The farm's Shed Phones: enroll a new one, one button away, and hand it the code shown once; see which are in use,
 * which wait to be set up, and revoke one that is lost.
 */
const DevicesPage = () => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [adding, setAdding] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const phones = useQuery(orpc.devices.list.queryOptions());

  const revoke = useMutation(
    orpc.devices.revoke.mutationOptions({
      onSuccess: () => {
        toast.success(t("device.revoked"));
      },
      onError: refused,
    })
  );

  const addButton = (
    <Button onClick={() => setAdding(true)} type="button">
      <SmartphoneNfc aria-hidden data-icon="inline-start" />
      {t("device.add")}
    </Button>
  );

  return (
    <Page>
      <PageHeader
        eyebrow={t("nav.identity")}
        actions={addButton}
        description={t("device.subtitle")}
        title={t("nav.devices")}
      />

      <Loaded query={phones}>
        {phones.data?.length ? (
          <div className="surface p-4 md:p-5">
            <PhoneTable
              onRevoke={(phone) => revoke.mutate({ id: phone.id })}
              phones={phones.data}
            />
          </div>
        ) : (
          <EmptyState
            action={addButton}
            icon={Smartphone}
            title={t("device.none")}
          />
        )}
      </Loaded>

      <EnrollDialog
        onEnrolled={setEnrollment}
        onOpenChange={setAdding}
        open={adding}
      />
      <OneTimeCode
        code={enrollment?.code ?? null}
        description={t("device.codeWhere")}
        note={
          enrollment
            ? t("device.codeHelp", { minutes: enrollment.minutes })
            : null
        }
        onDone={() => setEnrollment(null)}
        title={
          enrollment ? t("device.codeTitle", { name: enrollment.name }) : ""
        }
      />
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/farm/shed-phones")({
  /** For those who run the farm: the Owner and the Farm Managers. */
  beforeLoad: onlyFor("runsTheFarm"),
  component: DevicesPage,
});
