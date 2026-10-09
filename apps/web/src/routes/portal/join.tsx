import { PASSWORD_MIN_LENGTH } from "@OpenFarm/auth/password";
import { phoneExample } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Circle, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { sayAuthRefusal } from "@/components/auth/refused-notice";
import { BackToSignIn, CODE_FIELD } from "@/components/door-screen";
import { FLOW_CARD, FlowHead, Notice } from "@/components/page";
import { FormField } from "@/components/page-kit";
import { PortalDoor } from "@/components/portal/portal-door";
import { useLanguage } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** Why the farm would not take up an invitation, in the reader's words. */
const REFUSALS: Record<string, MessageKey> = {
  wrong_code: "portal.refused.wrongCode",
  portal_closed: "portal.refused.closed",
  // An account another Investor still signs in with on that phone: theirs, never handed on.
  phone_has_portal: "portal.refused.phoneHasPortal",
  password_too_short: "portal.refused.passwordTooShort",
  password_too_common: "auth.passwordTooCommon",
};

/** A part of the form, named above its fields: who the Investor is, then the password they choose. */
const SectionLabel = ({
  children,
  first = false,
}: {
  children: ReactNode;
  first?: boolean;
}) => (
  <p
    className={cn(
      "text-muted-foreground text-xs font-medium",
      !first && "border-t pt-4"
    )}
  >
    {children}
  </p>
);

/** One thing the password needs, and whether it has it yet. */
const Check = ({ met, children }: { met: boolean; children: ReactNode }) => (
  <li
    className={cn(
      "flex items-center gap-2",
      met ? "text-success" : "text-muted-foreground"
    )}
  >
    {met ? (
      <CircleCheck aria-hidden className="size-4 shrink-0" />
    ) : (
      <Circle aria-hidden className="size-4 shrink-0" />
    )}
    {children}
  </li>
);

/**
 * An Investor taking up the Owner's invitation: the phone they were written down with, the code the Owner handed
 * them, and a password of their own, twice. Taken up, they are signed in and sent to their Ventures.
 */
const PortalJoin = () => {
  const { t, language } = useLanguage();
  const { forgot } = Route.useSearch();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const join = useMutation(
    orpc.portal.join.mutationOptions({
      onSuccess: async ({ loginEmail }) => {
        await authClient.signIn.email(
          { email: loginEmail, password },
          {
            onSuccess: () => {
              void navigate({ to: "/portal" });
            },
            onError: (error) =>
              setRefused(
                sayAuthRefusal(error.error, t, t("portal.signInRefused"))
              ),
          }
        );
      },
      onError: (error) => setRefused(sayWhy(error, t, REFUSALS)),
    })
  );
  const long = password.length >= PASSWORD_MIN_LENGTH;
  const same = password === again;
  const ready = phone.trim() !== "" && code.trim() !== "" && long && same;
  return (
    <PortalDoor>
      <form
        className={FLOW_CARD}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          // Always pressable: what is still missing is said, as the two needs of the password are ticked off.
          if (!ready) {
            setRefused(t("portal.fillAll"));
            return;
          }
          setRefused(null);
          join.mutate({ phone, code, password });
        }}
      >
        <FlowHead
          hint={t(forgot ? "portal.forgot" : "portal.joinHint")}
          title={t(forgot ? "portal.resetTitle" : "portal.joinTitle")}
        />
        {refused ? (
          <Notice title={t("auth.refused")} tone="danger">
            {refused}
          </Notice>
        ) : null}
        <SectionLabel first>{t("portal.whoYouAre")}</SectionLabel>
        <FormField id="join-phone" label={t("portal.phone")}>
          <Input
            autoComplete="tel"
            id="join-phone"
            inputMode="tel"
            onChange={(event) => setPhone(event.target.value)}
            placeholder={phoneExample(language)}
            type="tel"
            value={phone}
          />
        </FormField>
        <FormField id="join-code" label={t("portal.code")}>
          <Input
            autoCapitalize="characters"
            autoComplete="one-time-code"
            className={CODE_FIELD}
            id="join-code"
            onChange={(event) => setCode(event.target.value)}
            value={code}
          />
        </FormField>
        <SectionLabel>{t("portal.passwordSection")}</SectionLabel>
        <FormField id="join-password" label={t("portal.newPassword")}>
          <PasswordInput
            autoComplete="new-password"
            id="join-password"
            onChange={(event) => setPassword(event.target.value)}
            value={password}
          />
        </FormField>
        <FormField id="join-again" label={t("portal.passwordAgain")}>
          <PasswordInput
            autoComplete="new-password"
            id="join-again"
            onChange={(event) => setAgain(event.target.value)}
            value={again}
          />
        </FormField>
        {/* What the password still needs, ticked off as it is typed, rather than a refusal after the button. */}
        <ul aria-live="polite" className="flex flex-col gap-1 text-sm">
          <Check met={long}>
            {t("portal.passwordLongEnough", {
              min: formatDigits(PASSWORD_MIN_LENGTH, language),
            })}
          </Check>
          <Check met={again !== "" && same}>{t("portal.passwordsMatch")}</Check>
        </ul>
        <Button
          className="h-12 w-full text-base md:h-10"
          disabled={join.isPending}
          type="submit"
        >
          {join.isPending ? <Spinner /> : null}
          {t("portal.join")}
        </Button>
        <BackToSignIn to="/portal/sign-in">
          {t("portal.haveAccount")}
        </BackToSignIn>
      </form>
    </PortalDoor>
  );
};

/** What the address may say: that the Investor came for a forgotten password, which is set again the same way. */
interface JoinSearch {
  forgot?: true;
}

export const Route = createFileRoute("/portal/join")({
  validateSearch: (search: Record<string, unknown>): JoinSearch =>
    search.forgot === true || search.forgot === "true" ? { forgot: true } : {},
  component: PortalJoin,
});
