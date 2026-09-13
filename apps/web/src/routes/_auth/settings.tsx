import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BellOff, BellRing } from "lucide-react";
import { useState } from "react";
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
  const [said, setSaid] = useState<string | null>(null);
  const key = useQuery(orpc.push.key.queryOptions());
  // Asked of the browser, through the query cache rather than during render: the server
  // renders this same component and has no browser to ask, and an answer that differs
  // between the two is a hydration mismatch.
  const possibleHere = useQuery({
    queryKey: ["push", "possible"],
    queryFn: () => canBeTold(),
    initialData: false,
  });
  const listening = useQuery({
    queryKey: ["push", "listening"],
    queryFn: () => currentListener(),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["push", "listening"] });
  const onError = (error: Error) =>
    toast.error(error.message || t("common.error"));

  const listen = useMutation(
    orpc.push.listen.mutationOptions({ onSuccess: refresh, onError })
  );
  const stop = useMutation(
    orpc.push.stopListening.mutationOptions({ onSuccess: refresh, onError })
  );

  const agree = useMutation({
    mutationFn: async () => {
      const publicKey = key.data?.key;
      if (!publicKey) {
        setSaid(t("push.unavailable"));
        return;
      }
      const browser = await askToBeTold(publicKey);
      if (!browser) {
        // The person said no, or the browser has notifications turned off. Neither is a
        // failure, and neither belongs in an error: it is an answer, and the screen says so.
        setSaid(t("push.blocked"));
        return;
      }
      setSaid(null);
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

  const possible = possibleHere.data && Boolean(key.data?.key);
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
        <p className="bg-muted rounded-xl p-3 text-sm">
          {t("push.unavailable")}
        </p>
      )}
      {said ? (
        <p className="bg-warning-surface text-warning rounded-xl p-3 text-sm">
          {said}
        </p>
      ) : null}
      {already ? (
        <p className="text-muted-foreground text-sm">{t("push.enabled")}</p>
      ) : null}

      <MyNumber />
    </div>
  );
};

/**
 * The number the farm can text.
 *
 * Only two notices ever go this way — a Withdrawal ending and a notifiable Diagnosis — and only
 * to whoever runs the farm. Everything else is a push and an entry in the app, which cost
 * nothing and are enough.
 */
const MyNumber = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const me = useQuery(orpc.people.me.queryOptions());
  const [phone, setPhone] = useState<string | null>(null);
  const save = useMutation(
    orpc.people.setPhone.mutationOptions({
      onSuccess: () => {
        toast.success(t("sms.saved"));
        void queryClient.invalidateQueries({ queryKey: orpc.people.key() });
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const mine = phone ?? me.data?.phone ?? "";

  return (
    <form
      className="space-y-2 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ phone: mine.trim() || null });
      }}
    >
      <Label htmlFor="my-phone">{t("sms.myNumber")}</Label>
      <p className="text-muted-foreground text-sm">{t("sms.why")}</p>
      <Input
        id="my-phone"
        inputMode="tel"
        onChange={(event) => setPhone(event.target.value)}
        value={mine}
      />
      <Button type="submit" variant="outline">
        {t("sms.save")}
      </Button>
    </form>
  );
};

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsPage,
});
