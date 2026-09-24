import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Smartphone, SmartphoneNfc } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PhoneTable } from "@/components/devices/phone-table";
import { EmptyState, Loaded, Page, PageHeader } from "@/components/page";
import { FormDialog, FormField } from "@/components/page-kit";
import { OneTimeCode } from "@/components/people/one-time-code";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/** The enrolment code a new phone is given, with its name and how long it lasts. */
interface Enrolment {
  name: string;
  code: string;
  minutes: number;
}

/** Naming a new Shed Phone, in a dialog; the farm answers with the code to type into it. */
const EnrolDialog = ({
  open,
  onOpenChange,
  onEnrolled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnrolled: (enrolment: Enrolment) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [name, setName] = useState("");
  const enrol = useMutation(
    orpc.devices.enrol.mutationOptions({
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
      onSubmit={() => enrol.mutate({ name })}
      open={open}
      pending={enrol.isPending}
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
 * The farm's Shed Phones: enrol a new one, one button away, and hand it the code shown once; see which are in use,
 * which wait to be set up, and revoke one that is lost.
 */
const DevicesPage = () => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [adding, setAdding] = useState(false);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
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
        actions={addButton}
        description={t("device.subtitle")}
        title={t("device.title")}
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

      <EnrolDialog
        onEnrolled={setEnrolment}
        onOpenChange={setAdding}
        open={adding}
      />
      <OneTimeCode
        code={enrolment?.code ?? null}
        description={t("device.codeWhere")}
        note={
          enrolment
            ? t("device.codeHelp", { minutes: enrolment.minutes })
            : null
        }
        onDone={() => setEnrolment(null)}
        title={enrolment ? t("device.codeTitle", { name: enrolment.name }) : ""}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/devices")({
  component: DevicesPage,
});
