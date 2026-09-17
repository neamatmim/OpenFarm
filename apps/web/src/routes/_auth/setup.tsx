import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, CircleCheck, Sprout } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Page } from "@/components/page";
import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** First run: the signed-in person names the Farm and becomes its Owner. */
const SetupPage = () => {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const current = useQuery(orpc.farm.current.queryOptions());
  const bootstrap = useMutation(
    orpc.farm.bootstrap.mutationOptions({
      onSuccess: async () => {
        toast.success(t("setup.done"));
        // Who they are was last asked before the farm existed, and the screens behind sign-in read that answer
        // before asking again: left in place, it sends the new Owner straight back here. Forget it, so the
        // dashboard asks afresh and finds the farm and the Owner's Role.
        queryClient.removeQueries({ queryKey: orpc.people.me.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.farm.key() });
        await navigate({ to: "/dashboard" });
      },
      onError: () => toast.error(t("common.error")),
    })
  );

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
