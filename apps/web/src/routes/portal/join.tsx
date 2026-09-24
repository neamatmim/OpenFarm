import { PASSWORD_MIN_LENGTH } from "@OpenFarm/auth/password";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { Notice } from "@/components/page";
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
  password_too_short: "portal.refused.passwordTooShort",
  password_too_common: "portal.refused.passwordTooCommon",
};

/**
 * An Investor taking up the Owner's invitation: the phone they were written down with, the code the Owner handed
 * them, and a password of their own, twice. Taken up, they are signed in and sent to their Ventures.
 */
const PortalJoin = () => {
  const { t, language } = useLanguage();
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
            onError: (error) => setRefused(error.error.message),
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
        className="surface flex flex-col gap-5 p-6 sm:p-8"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) {
            setRefused(null);
            join.mutate({ phone, code, password });
          }
        }}
      >
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("portal.joinTitle")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("portal.joinHint")}
          </p>
        </div>
        {refused ? (
          <Notice title={t("auth.refused")} tone="danger">
            {refused}
          </Notice>
        ) : null}
        <FormField id="join-phone" label={t("portal.phone")}>
          <Input
            autoComplete="tel"
            id="join-phone"
            inputMode="tel"
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            value={phone}
          />
        </FormField>
        <FormField id="join-code" label={t("portal.code")}>
          <Input
            autoCapitalize="characters"
            autoComplete="one-time-code"
            className="font-mono tracking-widest uppercase"
            id="join-code"
            onChange={(event) => setCode(event.target.value)}
            value={code}
          />
        </FormField>
        <FormField
          hint={t("auth.passwordTooShort", {
            min: formatDigits(PASSWORD_MIN_LENGTH, language),
          })}
          id="join-password"
          label={t("portal.newPassword")}
        >
          <PasswordInput
            autoComplete="new-password"
            id="join-password"
            onChange={(event) => setPassword(event.target.value)}
            value={password}
          />
        </FormField>
        <FormField
          hint={again !== "" && !same ? t("portal.notTheSame") : undefined}
          id="join-again"
          label={t("portal.passwordAgain")}
        >
          <PasswordInput
            autoComplete="new-password"
            id="join-again"
            onChange={(event) => setAgain(event.target.value)}
            value={again}
          />
        </FormField>
        <Button
          className="h-12 w-full text-base md:h-10"
          disabled={!ready || join.isPending}
          type="submit"
        >
          {join.isPending ? <Spinner /> : null}
          {t("portal.join")}
        </Button>
        <Link
          className="text-primary self-center text-sm hover:underline"
          to="/portal/login"
        >
          {t("portal.haveAccount")}
        </Link>
      </form>
    </PortalDoor>
  );
};

export const Route = createFileRoute("/portal/join")({
  component: PortalJoin,
});
