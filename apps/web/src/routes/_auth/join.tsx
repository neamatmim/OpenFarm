import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Page } from "@/components/page";
import { useT } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/**
 * Somebody signed in on a farm where they hold no Role yet: they were invited, and were handed a code. Entering it is
 * what gives them the invite's Roles — the email they signed up with alone does not.
 */
const JoinPage = () => {
  const t = useT();
  const refused = useRefused();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [code, setCode] = useState("");
  const accept = useMutation(
    orpc.people.acceptInvite.mutationOptions({
      onSuccess: async () => {
        toast.success(t("join.joined"));
        queryClient.removeQueries({ queryKey: orpc.people.me.queryKey() });
        await navigate({ to: "/dashboard" });
      },
      onError: refused,
    })
  );

  return (
    <Page width="narrow">
      <form
        className="surface mx-auto mt-8 flex w-full max-w-md flex-col gap-5 p-6 sm:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          accept.mutate({ code: code.trim() });
        }}
      >
        <span className="bg-secondary text-secondary-foreground grid size-12 place-items-center rounded-xl">
          <KeyRound aria-hidden className="size-6" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("join.title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("join.subtitle")}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-code">{t("join.code")}</Label>
          <Input
            autoCapitalize="characters"
            autoComplete="off"
            className="h-14 text-center font-mono text-2xl tracking-[0.3em] uppercase md:h-14 md:text-2xl"
            id="invite-code"
            maxLength={16}
            onChange={(event) => setCode(event.target.value)}
            required
            value={code}
          />
        </div>
        {session?.user.email ? (
          <p className="text-muted-foreground bg-muted/60 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
            <Mail aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 break-words">
              {t("join.wrongEmail", { email: session.user.email })}
            </span>
          </p>
        ) : null}
        <Button
          disabled={accept.isPending || code.trim().length < 4}
          className="h-12 text-base"
          type="submit"
        >
          {accept.isPending ? <Spinner /> : null}
          {t("join.submit")}
        </Button>
      </form>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/join")({
  component: JoinPage,
});
