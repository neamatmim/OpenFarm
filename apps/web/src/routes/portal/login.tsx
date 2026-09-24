import { investorLoginOf } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { Notice } from "@/components/page";
import { FormField } from "@/components/page-kit";
import { PortalDoor } from "@/components/portal/portal-door";
import { getUser } from "@/functions/get-user";
import { useLanguage } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";

/**
 * An Investor signing in to the portal: the phone they were written down with, and the password they chose when
 * they took up the Owner's invitation. The phone is written as the address their account signs in as here, by the
 * same rule the farm opened it by.
 */
const PortalLogin = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signIn = async () => {
    const email = investorLoginOf(phone);
    if (!email) {
      setRefused(t("portal.phoneNotMobile"));
      return;
    }
    setPending(true);
    setRefused(null);
    await authClient.signIn.email(
      { email, password },
      {
        onSuccess: () => {
          void navigate({ to: "/portal" });
        },
        onError: (error) => {
          setRefused(error.error.message || t("portal.signInRefused"));
        },
      }
    );
    setPending(false);
  };
  return (
    <PortalDoor>
      <form
        className="surface flex flex-col gap-5 p-6 sm:p-8"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void signIn();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("portal.signInTitle")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("portal.signInHint")}
          </p>
        </div>
        {refused ? (
          <Notice title={t("auth.refused")} tone="danger">
            {refused}
          </Notice>
        ) : null}
        <FormField id="portal-phone" label={t("portal.phone")}>
          <Input
            autoComplete="tel"
            id="portal-phone"
            inputMode="tel"
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            value={phone}
          />
        </FormField>
        <FormField id="portal-password" label={t("auth.password")}>
          <PasswordInput
            autoComplete="current-password"
            id="portal-password"
            onChange={(event) => setPassword(event.target.value)}
            value={password}
          />
        </FormField>
        <Button
          className="h-12 w-full text-base md:h-10"
          disabled={pending || phone.trim() === "" || password === ""}
          type="submit"
        >
          {pending ? <Spinner /> : null}
          {t("auth.signIn")}
        </Button>
        <Link
          className="text-primary self-center text-sm hover:underline"
          to="/portal/join"
        >
          {t("portal.haveCode")}
        </Link>
      </form>
    </PortalDoor>
  );
};

export const Route = createFileRoute("/portal/login")({
  // Somebody already signed in goes on to the portal, which sends anybody who is not an Investor to the farm.
  beforeLoad: async () => {
    let session: Awaited<ReturnType<typeof getUser>> = null;
    try {
      session = await getUser();
    } catch {
      return;
    }
    if (session) {
      throw redirect({ to: "/portal" });
    }
  },
  component: PortalLogin,
});
