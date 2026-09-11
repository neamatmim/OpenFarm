import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import {
  askToBeTold,
  canBeTold,
  currentListener,
  stopBeingTold,
} from "@/lib/push";
import { orpc } from "@/utils/orpc";

/**
 * Whether this device gets told things when the app is closed.
 *
 * Per device, because that is what a browser can promise: a Manager with a phone in the yard
 * and a machine in the office says yes on both, and hears about late work wherever they are.
 */
const SettingsPage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const key = useQuery(orpc.alerts.pushKey.queryOptions());
  const listening = useQuery({
    queryKey: ["push", "listening"],
    queryFn: () => currentListener(),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["push", "listening"] });
  const onError = (error: Error) =>
    toast.error(error.message || t("common.error"));

  const listen = useMutation(
    orpc.alerts.listen.mutationOptions({ onSuccess: refresh, onError })
  );
  const stop = useMutation(
    orpc.alerts.stopListening.mutationOptions({ onSuccess: refresh, onError })
  );

  const agree = useMutation({
    mutationFn: async () => {
      const publicKey = key.data?.key;
      if (!publicKey) {
        throw new Error(t("push.unavailable"));
      }
      const browser = await askToBeTold(publicKey);
      if (!browser) {
        // The person said no, or the browser has notifications turned off. Neither is a
        // failure, and neither is worth an error.
        throw new Error(t("push.blocked"));
      }
      await listen.mutateAsync(browser);
    },
    onSuccess: refresh,
    onError,
  });

  const refuse = useMutation({
    mutationFn: async () => {
      const endpoint = await stopBeingTold();
      if (endpoint) {
        await stop.mutateAsync({ endpoint });
      }
    },
    onSuccess: refresh,
    onError,
  });

  const possible = canBeTold() && Boolean(key.data?.key);
  const already = Boolean(listening.data);

  return (
    <div className="container mx-auto max-w-xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{t("push.title")}</h1>
      <p className="text-muted-foreground text-sm">{t("push.why")}</p>
      {possible ? (
        <Button
          className="h-14 w-full text-lg"
          disabled={agree.isPending || refuse.isPending}
          onClick={() => (already ? refuse.mutate() : agree.mutate())}
          variant={already ? "outline" : "default"}
        >
          {already ? <BellOff size={18} /> : <BellRing size={18} />}
          {already ? t("push.stop") : t("push.enable")}
        </Button>
      ) : (
        <p className="rounded-xl bg-neutral-800 p-3 text-sm">
          {t("push.unavailable")}
        </p>
      )}
      {already ? (
        <p className="text-muted-foreground text-sm">{t("push.enabled")}</p>
      ) : null}
    </div>
  );
};

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsPage,
});
