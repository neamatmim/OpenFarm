import { PASSWORD_MIN_LENGTH } from "@OpenFarm/auth/password";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PasswordInput } from "@/components/auth/password-input";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/** Why the farm would not set the password they chose, in their words. */
const REFUSALS = {
  password_too_common: "auth.passwordTooCommon",
} as const;

/**
 * Setting a password with the code the farm handed over, which is done signed out — somebody who has forgotten
 * theirs cannot sign in to change it.
 *
 * The farm never sets a password for anybody: one somebody else has seen is one that signs work in their name.
 * So whoever runs the farm reads out a code, and the person chooses their own password here.
 */
export const ForgotPasswordForm = ({ onDone }: { onDone: () => void }) => {
  const { t, language } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const set = useMutation(
    orpc.people.setPasswordWithCode.mutationOptions({
      onSuccess: () => {
        toast.success(t("auth.passwordSet"));
        onDone();
      },
      onError: refused,
    })
  );
  const ready =
    email.includes("@") &&
    code.length >= 4 &&
    newPassword.length >= PASSWORD_MIN_LENGTH;

  return (
    <div className="surface flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("auth.forgotTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("auth.forgotHint")}</p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          set.mutate({ email, code, newPassword });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="forgot-email">{t("auth.email")}</Label>
          <Input
            autoComplete="username"
            id="forgot-email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="forgot-code">{t("auth.code")}</Label>
          <Input
            // Read out across a shed and typed in: the farm's codes have no letters anybody misreads.
            autoCapitalize="characters"
            autoComplete="one-time-code"
            className="font-mono tracking-[0.2em] uppercase"
            id="forgot-code"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            required
            value={code}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="forgot-password">{t("auth.newPassword")}</Label>
          <PasswordInput
            aria-describedby="forgot-password-hint"
            autoComplete="new-password"
            id="forgot-password"
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            value={newPassword}
          />
          <p
            className="text-muted-foreground text-xs"
            id="forgot-password-hint"
          >
            {t("auth.passwordTooShort", {
              min: formatNumber(PASSWORD_MIN_LENGTH, language),
            })}
          </p>
        </div>
        <Button
          className="mt-1 h-12 w-full text-base md:h-10"
          disabled={!ready || set.isPending}
          type="submit"
        >
          {set.isPending ? <Spinner /> : null}
          {t("auth.forgotTitle")}
        </Button>
      </form>

      <div className="text-center">
        <Button onClick={onDone} variant="link">
          <ChevronLeft data-icon="inline-start" />
          {t("auth.backToSignIn")}
        </Button>
      </div>
    </div>
  );
};
