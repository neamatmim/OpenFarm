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
import { KeyRound, Lock } from "lucide-react";
import { useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import type { SignInRefusal } from "@/components/auth/refused-notice";
import { RefusedNotice, refusalOf } from "@/components/auth/refused-notice";
import { DoorLinks, DoorRow } from "@/components/door-screen";
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
  const { ended } = Route.useSearch();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [refused, setRefused] = useState<SignInRefusal | null>(null);
  const [pending, setPending] = useState(false);
  const signIn = async () => {
    // Always pressable, as the farm's own sign-in is: a grey button says nothing about what it is waiting for.
    if (phone.trim() === "" || password === "") {
      setRefused({ message: t("portal.fillBoth"), home: null });
      return;
    }
    const email = investorLoginOf(phone);
    if (!email) {
      setRefused({ message: t("portal.phoneNotMobile"), home: null });
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
          setRefused(refusalOf(error.error, t("portal.signInRefused")));
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
        {ended && !refused ? (
          <Notice title={t("portal.endedTitle")} tone="info">
            {t("portal.endedHint")}
          </Notice>
        ) : null}
        {refused ? <RefusedNotice refusal={refused} /> : null}
        <FormField id="portal-phone" label={t("portal.phone")}>
          <Input
            autoComplete="tel"
            id="portal-phone"
            inputMode="tel"
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t("portal.phonePlaceholder")}
            type="tel"
            value={phone}
          />
        </FormField>
        {/* The password with its way back beside it, where every sign-in keeps it: a forgotten one is set again with
            a new code from the Owner, on the same page a first one is. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label
              className="text-sm font-medium"
              data-slot="form-label"
              htmlFor="portal-password"
            >
              {t("auth.password")}
            </label>
            <Link
              className="text-primary text-sm hover:underline"
              search={{ forgot: true }}
              to="/portal/join"
            >
              {t("portal.forgotLink")}
            </Link>
          </div>
          <PasswordInput
            autoComplete="current-password"
            id="portal-password"
            onChange={(event) => setPassword(event.target.value)}
            value={password}
          />
        </div>
        <Button
          className="h-12 w-full text-base md:h-10"
          disabled={pending}
          type="submit"
        >
          {pending ? <Spinner /> : null}
          {t("auth.signIn")}
        </Button>
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <Lock aria-hidden className="size-3.5" />
          {t("portal.sessionNote")}
        </p>
      </form>
      {/* The first way in, on a card under the form. Its title is the words the Welcome Letter tells an Investor to
          press, so it stays word for word what the letter prints. */}
      <DoorLinks>
        <DoorRow
          hint={t("portal.firstTimeHint")}
          icon={KeyRound}
          title={t("portal.haveCode")}
          to="/portal/join"
        />
      </DoorLinks>
    </PortalDoor>
  );
};

/** What the address may say: that the portal just ended a sign-in that had lasted its day. */
interface LoginSearch {
  ended?: true;
}

export const Route = createFileRoute("/portal/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch =>
    search.ended === true || search.ended === "true" ? { ended: true } : {},
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
