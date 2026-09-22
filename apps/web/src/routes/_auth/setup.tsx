import type { StandardKind } from "@OpenFarm/domain";
import {
  STANDARD_DRUGS,
  STANDARD_FEED_ITEMS,
  STANDARD_KINDS,
  STANDARD_NOTIFIABLE_DISEASES,
  STANDARD_RATIONS,
} from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, ChevronRight, CircleCheck, Sprout } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { Page } from "@/components/page";
import { useLanguage, useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** One standard list to start with or not, with what it would bring. */
const StandardChoice = ({
  kind,
  checked,
  disabled,
  onToggle,
}: {
  kind: StandardKind;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) => {
  const { t, language } = useLanguage();
  const count = (n: number) => formatNumber(n, language);
  const hint = {
    feed: t("setup.standard.feedHint", {
      count: count(Object.keys(STANDARD_FEED_ITEMS).length),
    }),
    rations: t("setup.standard.rationsHint", {
      count: count(Object.keys(STANDARD_RATIONS).length),
    }),
    health: t("setup.standard.healthHint", {
      drugs: count(Object.keys(STANDARD_DRUGS).length),
      diseases: count(STANDARD_NOTIFIABLE_DISEASES.length),
    }),
  }[kind];
  return (
    <Label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal">
      <Checkbox
        checked={checked}
        className="mt-0.5"
        disabled={disabled}
        onCheckedChange={onToggle}
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{t(`setup.standard.${kind}`)}</span>
        <span className="text-muted-foreground text-sm">{hint}</span>
      </span>
    </Label>
  );
};

/**
 * The Owner's second step: the farm starts with the standard lists, or empty. Offered again whenever the Owner comes
 * back here — asking twice adds nothing, so there is nothing to guard.
 */
const StandardStep = () => {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [kinds, setKinds] = useState<StandardKind[]>([...STANDARD_KINDS]);
  const goOn = () => navigate({ to: "/dashboard" });
  const start = useMutation(
    orpc.farm.startWithStandard.mutationOptions({
      onSuccess: async () => {
        toast.success(t("setup.standard.done"));
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.feed.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.drugs.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.notifiable.key() }),
        ]);
        await goOn();
      },
      onError: () => toast.error(t("common.error")),
    })
  );
  const toggle = (kind: StandardKind) =>
    setKinds((now) =>
      now.includes(kind) ? now.filter((one) => one !== kind) : [...now, kind]
    );

  return (
    <Page width="narrow">
      <form
        className="surface mx-auto mt-8 flex w-full max-w-md flex-col gap-5 p-6 sm:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          start.mutate({ kinds });
        }}
      >
        <span className="bg-success-surface text-success grid size-12 place-items-center rounded-xl">
          <CircleCheck aria-hidden className="size-6" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="text-success text-sm font-medium">{t("setup.done")}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("setup.standard.title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("setup.standard.intro")}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {STANDARD_KINDS.map((kind) => (
            <StandardChoice
              checked={kinds.includes(kind)}
              disabled={start.isPending}
              key={kind}
              kind={kind}
              onToggle={() => toggle(kind)}
            />
          ))}
        </div>
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <BookOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("setup.standard.playbook")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            className="h-12 text-base sm:flex-1 md:h-10"
            disabled={start.isPending || kinds.length === 0}
            type="submit"
          >
            {start.isPending ? <Spinner /> : null}
            {t("setup.standard.start")}
          </Button>
          <Button
            className="h-12 text-base sm:flex-1 md:h-10"
            disabled={start.isPending}
            onClick={goOn}
            type="button"
            variant="outline"
          >
            {t("setup.standard.skip")}
          </Button>
        </div>
      </form>
    </Page>
  );
};

/** First run: the signed-in person names the Farm and becomes its Owner, then chooses what it starts with. */
const SetupPage = () => {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const current = useQuery(orpc.farm.current.queryOptions());
  const me = useQuery(orpc.people.me.queryOptions());
  const isOwner = me.data?.roles.includes("owner") ?? false;
  const bootstrap = useMutation(
    orpc.farm.bootstrap.mutationOptions({
      onSuccess: async () => {
        toast.success(t("setup.done"));
        // Who they are was last asked before the farm existed, and the screens behind sign-in read that answer
        // before asking again: left in place, it sends the new Owner straight back here. Forget it, so this
        // page asks afresh, finds the farm and the Owner's Role, and offers the standard lists.
        queryClient.removeQueries({ queryKey: orpc.people.me.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.farm.key() });
      },
      onError: () => toast.error(t("common.error")),
    })
  );

  // Whose the farm is, asked again once it exists: until the answer is in, neither step is right.
  if (current.data && !me.data) {
    return <Loader />;
  }

  if (current.data && isOwner) {
    return <StandardStep />;
  }

  if (current.data) {
    return (
      <Page width="narrow">
        <div className="surface mx-auto mt-8 flex w-full max-w-md flex-col items-center gap-4 p-8 text-center">
          <span className="bg-success-surface text-success grid size-14 place-items-center rounded-2xl">
            <CircleCheck aria-hidden className="size-7" />
          </span>
          <p className="text-lg font-semibold">{t("setup.done")}</p>
          <Button
            className="h-12 w-full text-base md:h-10"
            onClick={() => navigate({ to: "/dashboard" })}
          >
            {t("setup.goOn")}
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <form
        className="surface mx-auto mt-8 flex w-full max-w-md flex-col gap-5 p-6 sm:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          bootstrap.mutate({ name });
        }}
      >
        <span className="bg-primary text-primary-foreground grid size-12 place-items-center rounded-xl">
          <Sprout aria-hidden className="size-6" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("setup.title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("setup.intro")}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="farm-name">{t("setup.farmName")}</Label>
          <Input
            autoComplete="organization"
            className="h-12 text-base md:h-10"
            id="farm-name"
            onChange={(e) => setName(e.target.value)}
            required
            value={name}
          />
        </div>
        <Button
          className="h-12 text-base md:h-10"
          disabled={bootstrap.isPending}
          type="submit"
        >
          {bootstrap.isPending ? <Spinner /> : null}
          {t("setup.create")}
        </Button>
      </form>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/setup")({
  component: SetupPage,
});
