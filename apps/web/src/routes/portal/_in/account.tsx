import { PASSWORD_MIN_LENGTH } from "@OpenFarm/auth/password";
import { formatDate, formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LogOut, Monitor, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { PasswordInput } from "@/components/auth/password-input";
import { phoneLink } from "@/components/investors/investor-profile";
import {
  Loaded,
  Notice,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { FormField } from "@/components/page-kit";
import { deviceOf } from "@/components/people/person-sign-ins";
import { useLanguage } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

type Me = Awaited<ReturnType<typeof orpc.portal.me.call>>;

/** A phone's browser says so; anything else is a computer. */
const PHONE = /Android|iPhone|iPad|Mobile/u;

/** What the farm answers when a password has been guessed at too often: wait, rather than wrong. */
const TOO_MANY = 429;

/** One thing the farm holds, or plainly that it holds nothing. */
const Held = ({ label, children }: { label: string; children: ReactNode }) => {
  const { t } = useLanguage();
  const given = children !== null && children !== undefined && children !== "";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={
          given
            ? "text-sm break-words whitespace-pre-line tabular-nums"
            : "text-muted-foreground text-sm"
        }
      >
        {given ? children : t("investors.notGiven")}
      </dd>
    </div>
  );
};

/**
 * Their record as the farm holds it, to check against their own papers — the NID and the bank account with all but
 * their last digits hidden, enough to know them by. Put right by the Owner, never here: the portal changes nothing
 * the farm holds.
 */
const TheirDetails = ({ me }: { me: Me }) => {
  const { t } = useLanguage();
  const { record } = me;
  return (
    <Section
      description={t("portal.account.detailsHint")}
      title={t("portal.account.details")}
    >
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Held label={t("investors.name")}>{me.name}</Held>
        <Held label={t("investors.phone")}>{record.phone}</Held>
        <Held label={t("investors.address")}>{record.address}</Held>
        <Held label={t("investors.nid")}>{record.nid}</Held>
        <Held label={t("investors.bank")}>{record.bankAccount}</Held>
        <Held label={t("investors.nomineeName")}>
          {record.nominee
            ? [record.nominee.name, record.nominee.relation]
                .filter(Boolean)
                .join(" · ")
            : null}
        </Held>
      </dl>
    </Section>
  );
};

/** Who to ask about any of it: the farm, and how to reach it. */
const TheFarm = ({ me }: { me: Me }) => {
  const { t } = useLanguage();
  return (
    <Section
      description={t("portal.account.farmHint")}
      title={t("portal.account.farm")}
    >
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Held label={t("portal.account.farmName")}>{me.farm.name}</Held>
        <Held label={t("investors.phone")}>{phoneLink(me.farm.phone)}</Held>
        <Held label={t("investors.address")}>{me.farm.address}</Held>
      </dl>
    </Section>
  );
};

/**
 * Choosing a new password while signed in: the one they have now, to prove the phone in hand is theirs, and the new
 * one twice. Every other place they are signed in is signed out with it — the usual reason to change a password is
 * that somebody else may know it.
 */
const NewPassword = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pending, setPending] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const long = next.length >= PASSWORD_MIN_LENGTH;
  const same = next === again;
  const ready = current !== "" && long && same;
  // What the door said, in the reader's words: too many tries, a password everybody uses, or the wrong current one.
  const refusalOf = (error: { status: number; code?: string }) => {
    if (error.status === TOO_MANY) {
      return t("portal.account.tooMany");
    }
    return error.code === "PASSWORD_TOO_COMMON"
      ? t("auth.passwordTooCommon")
      : t("portal.account.wrongPassword");
  };
  const change = async () => {
    setPending(true);
    setRefused(null);
    await authClient.changePassword(
      {
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
          setAgain("");
          toast.success(t("portal.account.passwordChanged"));
          void queryClient.invalidateQueries({
            queryKey: orpc.portal.signedInOn.key(),
          });
        },
        onError: (error) => {
          setRefused(refusalOf(error.error));
        },
      }
    );
    setPending(false);
  };
  return (
    <Section
      description={t("portal.account.passwordHint")}
      title={t("portal.account.password")}
    >
      <form
        className="flex max-w-md flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) {
            void change();
          }
        }}
      >
        {refused ? (
          <Notice title={t("auth.refused")} tone="danger">
            {refused}
          </Notice>
        ) : null}
        <FormField id="account-current" label={t("portal.account.current")}>
          <PasswordInput
            autoComplete="current-password"
            id="account-current"
            onChange={(event) => setCurrent(event.target.value)}
            value={current}
          />
        </FormField>
        <FormField
          hint={t("auth.passwordTooShort", {
            min: formatDigits(PASSWORD_MIN_LENGTH, language),
          })}
          id="account-new"
          label={t("portal.account.new")}
        >
          <PasswordInput
            autoComplete="new-password"
            id="account-new"
            onChange={(event) => setNext(event.target.value)}
            value={next}
          />
        </FormField>
        <FormField
          hint={again !== "" && !same ? t("portal.notTheSame") : undefined}
          id="account-again"
          label={t("portal.passwordAgain")}
        >
          <PasswordInput
            autoComplete="new-password"
            id="account-again"
            onChange={(event) => setAgain(event.target.value)}
            value={again}
          />
        </FormField>
        <Button
          className="self-start"
          disabled={!ready || pending}
          type="submit"
        >
          {pending ? <Spinner /> : null}
          {t("portal.account.change")}
        </Button>
      </form>
    </Section>
  );
};

/**
 * Where they are signed in to the portal now — this phone marked — and one act: signing every other place out, for a
 * phone lost or a computer somebody else sits at. A sign-in lasts a working day, and the page says so.
 */
const SignedIn = () => {
  const { t, language } = useLanguage();
  const places = useQuery(orpc.portal.signedInOn.queryOptions());
  const [pending, setPending] = useState(false);
  const others = (places.data ?? []).filter((one) => !one.here).length;
  const signOutOthers = async () => {
    setPending(true);
    await authClient.revokeOtherSessions(undefined, {
      onSuccess: () => {
        toast.success(t("portal.account.othersSignedOut"));
        void places.refetch();
      },
      onError: () => {
        toast.error(t("portal.account.othersNotSignedOut"));
      },
    });
    setPending(false);
  };
  return (
    <Section
      action={
        others > 0 ? (
          <Button
            disabled={pending}
            onClick={() => {
              void signOutOthers();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <LogOut aria-hidden data-icon="inline-start" />
            {t("portal.account.signOutOthers")}
          </Button>
        ) : null
      }
      description={t("portal.account.signedInHint")}
      title={t("portal.account.signedIn")}
    >
      <Loaded
        query={places}
        skeleton={<Skeleton className="h-16 rounded-lg" />}
      >
        <ul className="flex flex-col divide-y rounded-lg border">
          {(places.data ?? []).map((one) => {
            const Icon = PHONE.test(one.browser ?? "") ? Smartphone : Monitor;
            return (
              <li className="flex items-center gap-3 px-3 py-2.5" key={one.id}>
                <Icon aria-hidden className="text-muted-foreground size-5" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">
                    {deviceOf(one.browser) ?? t("portal.account.aBrowser")}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t("portal.account.since", {
                      when: formatDate(
                        new Date(one.since),
                        language,
                        "dateTime"
                      ),
                    })}
                  </span>
                </span>
                {one.here ? (
                  <StatusBadge tone="success">
                    {t("portal.account.here")}
                  </StatusBadge>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Loaded>
    </Section>
  );
};

/** An Investor's own account: their record as the farm holds it, the farm to ask, their password, and where they are
 *  signed in. */
const PortalAccount = () => {
  const { t } = useLanguage();
  const me = useQuery(orpc.portal.me.queryOptions());
  return (
    <Page>
      <PageHeader
        description={t("portal.account.hint")}
        title={t("portal.account.title")}
      />
      <Loaded query={me} skeleton={<Skeleton className="h-40 rounded-xl" />}>
        {me.data ? (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <TheirDetails me={me.data} />
            <TheFarm me={me.data} />
            <NewPassword />
            <SignedIn />
          </div>
        ) : null}
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute("/portal/_in/account")({
  component: PortalAccount,
});
