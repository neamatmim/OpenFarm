import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import type { FormEvent } from "react";
import { useId, useState, useSyncExternalStore } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { useT } from "@/i18n/language-provider";
import { answerTheAsking, isAsking, onAsking } from "@/lib/password-again";
import { sayWhy } from "@/lib/saying";
import { client } from "@/utils/orpc";

const PASSWORD_WORDS = {
  password_wrong: "passwordAgain.wrong",
  account_slowed: "passwordAgain.slowed",
} as const;

/**
 * Asks for the password again when an act that pays money out, approves money, opens the portal or copies an
 * Investor's data was refused for want of it; given, the act is sent again as it was. Drawn once, in the shell.
 */
export const PasswordAgainDialog = () => {
  const t = useT();
  const asking = useSyncExternalStore(onAsking, isAsking, () => false);
  const [password, setPassword] = useState("");
  const [why, setWhy] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const field = useId();

  const close = (given: boolean) => {
    setPassword("");
    setWhy(null);
    answerTheAsking(given);
  };

  const give = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    const refused = await client.people
      .givePassword({ password })
      .then(() => null)
      .catch((error: unknown) => sayWhy(error, t, PASSWORD_WORDS));
    setSending(false);
    if (refused) {
      setWhy(refused);
      return;
    }
    close(true);
  };

  return (
    <Dialog
      onOpenChange={(opening) => {
        if (!opening) {
          close(false);
        }
      }}
      open={asking}
    >
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("passwordAgain.title")}</DialogTitle>
          <DialogDescription>{t("passwordAgain.why")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={give}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={field}>{t("passwordAgain.label")}</Label>
            <PasswordInput
              aria-describedby={why ? `${field}-why` : undefined}
              aria-invalid={why ? true : undefined}
              autoComplete="current-password"
              autoFocus
              id={field}
              onChange={(event) => setPassword(event.target.value)}
              required
              value={password}
            />
            {why ? (
              <p className="text-destructive text-sm" id={`${field}-why`}>
                {why}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => close(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button disabled={sending || password === ""} type="submit">
              {sending ? <Spinner /> : null}
              {t("passwordAgain.give")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
