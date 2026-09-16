import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, Page, PageHeader } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

const DevicesPage = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState<{ code: string; minutes: number } | null>(
    null
  );
  const phones = useQuery(orpc.devices.list.queryOptions());

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.devices.key() });
  const onError = (error: Error) => toast.error(sayWhy(error, t));

  const enrol = useMutation(
    orpc.devices.enrol.mutationOptions({
      onSuccess: (result) => {
        setCode({ code: result.code, minutes: result.expiresInMinutes });
        setName("");
        refresh();
      },
      onError,
    })
  );
  const revoke = useMutation(
    orpc.devices.revoke.mutationOptions({ onSuccess: refresh, onError })
  );

  const status = (phone: {
    claimedAt: Date | null;
    revokedAt: Date | null;
  }) => {
    if (phone.revokedAt) {
      return t("device.revoked");
    }
    return phone.claimedAt ? t("device.claimed") : t("device.unclaimed");
  };

  return (
    <Page width="default" className="max-w-4xl">
      <PageHeader title={t("device.title")} />

      <form
        className="surface flex items-end gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          enrol.mutate({ name });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="phone-name">{t("device.name")}</Label>
          <Input
            id="phone-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <Button type="submit" variant="outline">
          {t("device.add")}
        </Button>
      </form>

      {code ? (
        <div className="border-success/40 rounded-lg border-2 p-4 text-center">
          <p className="font-mono text-4xl font-bold tracking-widest">
            {code.code}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("device.codeHelp", { minutes: code.minutes })}
          </p>
        </div>
      ) : null}

      {phones.data?.length ? (
        <ul className="space-y-2">
          {phones.data.map((phone) => (
            <li
              key={phone.id}
              className="surface flex items-center justify-between p-4"
            >
              <div>
                <p className="font-medium">{phone.name}</p>
                <p className="text-muted-foreground text-sm">
                  {status(phone)}
                  {phone.lastSeenAt
                    ? ` · ${t("device.lastSeen", {
                        when: formatDate(
                          new Date(phone.lastSeenAt),
                          language,
                          "dateTime"
                        ),
                      })}`
                    : ""}
                </p>
              </div>
              {phone.revokedAt ? null : (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => revoke.mutate({ id: phone.id })}
                >
                  {t("device.revoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Smartphone} title={t("device.none")} />
      )}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/devices")({
  component: DevicesPage,
});
