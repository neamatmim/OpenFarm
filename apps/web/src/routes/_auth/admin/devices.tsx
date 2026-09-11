import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
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
  const onError = (error: Error) =>
    toast.error(error.message || t("common.error"));

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
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-bold">{t("device.title")}</h1>

      <form
        className="flex items-end gap-3 rounded-lg border p-4"
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
        <div className="rounded-lg border-2 border-emerald-500 p-4 text-center">
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
              className="flex items-center justify-between rounded-lg border p-3"
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
        <p className="text-muted-foreground text-sm">{t("device.none")}</p>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/devices")({
  component: DevicesPage,
});
