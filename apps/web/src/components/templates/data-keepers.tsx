import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Section } from "@/components/page";
import { FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Keepers = Awaited<ReturnType<typeof client.farm.dataKeepers>>;

/** The three names as the form holds them: what the farm has written down, or nothing yet. */
const KeepersForm = ({ kept }: { kept: Keepers }) => {
  const { t } = useLanguage();
  const refused = useRefused({});
  const [dataHost, setDataHost] = useState(kept.dataHost ?? "");
  const [backupStore, setBackupStore] = useState(kept.backupStore ?? "");
  const [backupCountry, setBackupCountry] = useState(kept.backupCountry ?? "");
  const saving = useMutation(
    orpc.farm.setDataKeepers.mutationOptions({
      onError: refused,
      onSuccess: () => toast.success(t("templates.keepers.saved")),
    })
  );
  return (
    <form
      className="grid gap-4 md:grid-cols-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        saving.mutate({ dataHost, backupStore, backupCountry });
      }}
    >
      <FormField id="keepers-host" label={t("templates.keepers.dataHost")}>
        <Input
          id="keepers-host"
          maxLength={120}
          onChange={(event) => setDataHost(event.target.value)}
          value={dataHost}
        />
      </FormField>
      <FormField id="keepers-backup" label={t("templates.keepers.backupStore")}>
        <Input
          id="keepers-backup"
          maxLength={120}
          onChange={(event) => setBackupStore(event.target.value)}
          value={backupStore}
        />
      </FormField>
      <FormField
        id="keepers-country"
        label={t("templates.keepers.backupCountry")}
      >
        <Input
          id="keepers-country"
          maxLength={120}
          onChange={(event) => setBackupCountry(event.target.value)}
          value={backupCountry}
        />
      </FormField>
      <Button
        className="self-start md:col-span-3"
        disabled={saving.isPending}
        type="submit"
      >
        {saving.isPending ? <Spinner /> : null}
        {t("templates.keepers.save")}
      </Button>
    </form>
  );
};

/**
 * Who runs the server the farm's records are on, who keeps the nightly encrypted copy and where: the facts the
 * privacy notice tells an Investor. The Owner writes them down once they are chosen.
 */
export const DataKeepers = () => {
  const { t } = useLanguage();
  const kept = useQuery(orpc.farm.dataKeepers.queryOptions());
  return (
    <Section
      description={t("templates.keepers.hint")}
      title={t("templates.keepers.title")}
    >
      {kept.data ? <KeepersForm kept={kept.data} /> : null}
    </Section>
  );
};
