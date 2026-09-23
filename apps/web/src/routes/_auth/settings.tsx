import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BellOff, BellRing, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Page, PageHeader, Section, StatusBadge } from "@/components/page";
import { FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import {
  askToBeTold,
  canBeTold,
  currentListener,
  stopBeingTold,
} from "@/lib/push";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/** How this device stands for being told: told, not told, refused by the browser, or unable to be told at all. */
const PushStanding = ({
  possible,
  already,
  said,
}: {
  possible: boolean;
  already: boolean;
  said: string | null;
}) => {
  const { t } = useLanguage();
  if (!possible) {
    return (
      <StatusBadge icon={BellOff} tone="neutral">
        {t("push.unavailable")}
      </StatusBadge>
    );
  }
  if (already) {
    return (
      <StatusBadge icon={BellRing} tone="success">
        {t("push.enabled")}
      </StatusBadge>
    );
  }
  if (said) {
    return (
      <StatusBadge icon={BellOff} tone="warning">
        {said}
      </StatusBadge>
    );
  }
  return (
    <StatusBadge icon={BellOff} tone="neutral">
      {t("push.notTold")}
    </StatusBadge>
  );
};

/**
 * Whether this device gets told things when the app is closed.
 *
 * Per device, because that is what a browser can promise: a Manager with a phone in the yard
 * and a machine in the office says yes on both, and hears about late work wherever they are.
 */
const BeingTold = () => {
  const { t } = useLanguage();
  const refused = useRefused();
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
  const onError = refused;

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
  const pending = agree.isPending || refuse.isPending;

  return (
    <Section
      action={
        possible ? (
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={() => (already ? refuse.mutate() : agree.mutate())}
            type="button"
            variant={already ? "outline" : "default"}
          >
            {pending ? <Spinner /> : null}
            {!pending && already ? (
              <BellOff aria-hidden data-icon="inline-start" />
            ) : null}
            {!pending && !already ? (
              <BellRing aria-hidden data-icon="inline-start" />
            ) : null}
            {already ? t("push.stop") : t("push.enable")}
          </Button>
        ) : null
      }
      description={t("push.why")}
      id="being-told"
      title={t("push.title")}
    >
      <div>
        <PushStanding already={already} possible={possible} said={said} />
      </div>
    </Section>
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
  const refused = useRefused();
  const me = useQuery(orpc.people.me.queryOptions());
  const [phone, setPhone] = useState<string | null>(null);
  const save = useMutation(
    orpc.people.setPhone.mutationOptions({
      onSuccess: () => {
        toast.success(t("sms.saved"));
      },
      onError: refused,
    })
  );
  const mine = phone ?? me.data?.phone ?? "";

  return (
    <Section description={t("sms.why")} id="my-number" title={t("sms.title")}>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ phone: mine.trim() || null });
        }}
      >
        <FormField className="sm:w-72" id="my-phone" label={t("sms.myNumber")}>
          <div className="relative">
            <Phone
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            />
            <Input
              autoComplete="tel"
              className="ps-9"
              id="my-phone"
              inputMode="tel"
              onChange={(event) => setPhone(event.target.value)}
              type="tel"
              value={mine}
            />
          </div>
        </FormField>
        <Button disabled={save.isPending} type="submit" variant="outline">
          {save.isPending ? <Spinner /> : null}
          {t("sms.save")}
        </Button>
      </form>
    </Section>
  );
};

/** What each person sets for themselves: whether this device is told things, and the number the farm may text. */
const SettingsPage = () => {
  const { t } = useLanguage();
  return (
    <Page>
      <PageHeader
        description={t("settings.subtitle")}
        title={t("nav.settings")}
      />
      <BeingTold />
      <MyNumber />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsPage,
});
