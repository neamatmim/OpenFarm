import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** First run: the signed-in person names the Farm and becomes its Owner. */
const SetupPage = () => {
  const t = useT();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const current = useQuery(orpc.farm.current.queryOptions());
  const bootstrap = useMutation(
    orpc.farm.bootstrap.mutationOptions({
      onSuccess: () => {
        toast.success(t("setup.done"));
        navigate({ to: "/dashboard" });
      },
      onError: () => toast.error(t("common.error")),
    })
  );

  if (current.data) {
    return <p className="p-6">{t("setup.done")}</p>;
  }

  return (
    <form
      className="mx-auto mt-10 w-full max-w-md space-y-4 p-6"
      onSubmit={(event) => {
        event.preventDefault();
        bootstrap.mutate({ name });
      }}
    >
      <h1 className="text-2xl font-bold">{t("setup.title")}</h1>
      <p className="text-muted-foreground">{t("setup.intro")}</p>
      <div className="space-y-1">
        <Label htmlFor="farm-name">{t("setup.farmName")}</Label>
        <Input
          id="farm-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={bootstrap.isPending}>
        {t("setup.create")}
      </Button>
    </form>
  );
};

export const Route = createFileRoute("/_auth/setup")({
  component: SetupPage,
});
