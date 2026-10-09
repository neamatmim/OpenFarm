import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { useState } from "react";

import { SignedInDoor } from "@/components/auth-screen";
import { CODE_FIELD } from "@/components/door-screen";
import { FLOW_CARD, FlowHead, Notice } from "@/components/page";
import { useT } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
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
  const [missing, setMissing] = useState(false);
  const accept = useMutation(
    orpc.people.acceptInvite.mutationOptions({
      onSuccess: async () => {
        toast.success(t("join.joined"));
        queryClient.removeQueries({ queryKey: orpc.people.me.queryKey() });
        await navigate({ to: "/" });
      },
      onError: refused,
    })
  );

  return (
    <SignedInDoor>
      <div className={FLOW_CARD}>
        <FlowHead hint={t("join.subtitle")} title={t("join.title")} />
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            // Always pressable, as every door's button is: an empty code is said rather than grayed out.
            if (code.trim().length < 4) {
              setMissing(true);
              return;
            }
            setMissing(false);
            accept.mutate({ code: code.trim() });
          }}
        >
          {missing ? (
            <Notice title={t("auth.formIncomplete")} tone="danger" />
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-code">{t("join.code")}</Label>
            <Input
              autoCapitalize="characters"
              autoComplete="off"
              className={CODE_FIELD}
              id="invite-code"
              maxLength={16}
              onChange={(event) => setCode(event.target.value)}
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
            className="mt-1 h-12 w-full text-base md:h-9 md:text-sm"
            disabled={accept.isPending}
            type="submit"
          >
            {accept.isPending ? <Spinner /> : null}
            {t("join.submit")}
          </Button>
        </form>
      </div>
    </SignedInDoor>
  );
};

export const Route = createFileRoute("/_authenticated/join")({
  component: JoinPage,
});
