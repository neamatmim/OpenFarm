import { verifyPin } from "@OpenFarm/domain";
import { formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Delete,
  Lock,
  Smartphone,
  UserRound,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { EmptyState, Notice } from "@/components/page";
import { PublicHeader } from "@/components/public-header";
import { useLanguage, useT } from "@/i18n/language-provider";
import type { RosterEntry } from "@/lib/device";
import {
  getActiveUser,
  getDeviceToken,
  getRoster,
  clearHeldStint,
  holdUnprovedSwitch,
  isLocked,
  setActiveUser,
  setAutoLockMinutes,
  setDeviceToken,
  setRoster,
  setSwitchToken,
  subscribeDevice,
  touchActiveUser,
} from "@/lib/device";
import { phoneOutbox } from "@/lib/outbox-client";
import { currentListener } from "@/lib/push";
import { handOverThisPhone } from "@/lib/query-cache";
import { sayWhy } from "@/lib/saying";
import { lockAndPutAway, lockOnTheFarm } from "@/lib/shed-phone";
import { orpc } from "@/utils/orpc";

const PIN_LENGTH = 4;
const DEFAULT_AUTO_LOCK_MINUTES = 5;
const LOCK_TICK_MS = 15_000;
const PAD_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Every step of the Shed Phone's door is the same card: one thing asked of whoever is holding the phone. */
const CARD =
  "bg-card mx-auto flex w-full max-w-sm flex-col gap-5 rounded-2xl border p-6 shadow-sm sm:p-8";

/** What this step of the door is, with its picture and a line of help. */
const StepHead = ({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) => (
  <div className="flex flex-col items-center gap-3 text-center">
    <span className="bg-secondary text-secondary-foreground grid size-14 place-items-center rounded-2xl">
      {icon}
    </span>
    <div className="flex flex-col gap-1.5">
      <h1 className="text-2xl leading-tight font-semibold tracking-tight">
        {title}
      </h1>
      {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
    </div>
  </div>
);

/** A person's first letter in a circle, so a milker finds their own name by its shape before reading it. */
const Initial = ({
  name,
  size = "md",
}: {
  name: string;
  size?: "md" | "lg";
}) => (
  <span
    aria-hidden
    className={cn(
      "bg-primary text-primary-foreground grid shrink-0 place-items-center rounded-full font-semibold",
      size === "lg" ? "size-16 text-2xl" : "size-10 text-base"
    )}
  >
    {name.slice(0, 1)}
  </span>
);

/** One key of the pad, big enough for a thumb that has just come off a cow. */
const PadKey = ({
  label,
  children,
  onPress,
}: {
  label?: string;
  children: ReactNode;
  onPress: () => void;
}) => (
  <Button
    aria-label={label}
    className="h-16 text-2xl font-semibold tabular-nums md:h-16"
    onClick={onPress}
    type="button"
    variant="outline"
  >
    {children}
  </Button>
);

/** The PIN pad: the digits in the farm's own numerals, and a key to take one back. */
const PinPad = ({
  onDigit,
  onDelete,
}: {
  onDigit: (digit: number) => void;
  onDelete: () => void;
}) => {
  const { t, language } = useLanguage();
  return (
    <div className="grid grid-cols-3 gap-2">
      {PAD_DIGITS.map((digit) => (
        <PadKey
          key={digit}
          label={String(digit)}
          onPress={() => onDigit(digit)}
        >
          {formatDigits(digit, language)}
        </PadKey>
      ))}
      <span aria-hidden />
      <PadKey label="0" onPress={() => onDigit(0)}>
        {formatDigits(0, language)}
      </PadKey>
      <PadKey label={t("device.pinDelete")} onPress={onDelete}>
        <Delete aria-hidden className="size-6" />
      </PadKey>
    </div>
  );
};

/** The Shed Phone's own screen: set the phone up once, then PIN Switch between people.
 *  Everything after enrolment works with no signal (ADR 0003). */
const DevicePage = () => {
  const t = useT();
  const token = useSyncExternalStore(
    subscribeDevice,
    getDeviceToken,
    () => null
  );
  const active = useSyncExternalStore(
    subscribeDevice,
    getActiveUser,
    () => null
  );
  const [code, setCode] = useState("");
  const [chosen, setChosen] = useState<RosterEntry | null>(null);
  const [pin, setPin] = useState("");
  const [, forceTick] = useState(0);

  const where = useQuery({
    ...orpc.devices.current.queryOptions(),
    enabled: Boolean(token),
  });
  const autoLockMinutes =
    where.data?.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES;
  useEffect(() => {
    if (where.data?.autoLockMinutes) {
      setAutoLockMinutes(where.data.autoLockMinutes);
    }
  }, [where.data?.autoLockMinutes]);
  const navigate = useNavigate();

  // Refresh the roster whenever there is signal; fall back to what the phone saved.
  const roster = useQuery({
    ...orpc.people.roster.queryOptions(),
    enabled: Boolean(token),
    retry: false,
  });
  useEffect(() => {
    if (roster.data) {
      setRoster(roster.data);
    }
  }, [roster.data]);
  const people = roster.data ?? getRoster();

  const claim = useMutation(
    orpc.devices.claim.mutationOptions({
      onSuccess: (result) => {
        setDeviceToken(result.token);
        setCode("");
        toast.success(t("device.enrolled"));
      },
      onError: (error: Error) => toast.error(sayWhy(error, t)),
    })
  );

  // Re-render on a timer so the phone locks itself while nobody is touching it — and count
  // a tap anywhere as activity, so it never locks under someone's hands mid-task.
  useEffect(() => {
    const timer = window.setInterval(
      () => forceTick((n) => n + 1),
      LOCK_TICK_MS
    );
    const onActivity = () => touchActiveUser();
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, []);

  const queryClient = useQueryClient();
  const switchUser = useMutation(orpc.devices.switchUser.mutationOptions({}));
  const listenAgain = useMutation(orpc.push.listen.mutationOptions({}));

  const submitPin = useCallback(
    async (entry: RosterEntry, typed: string) => {
      setPin("");
      // Checked here first so a phone with no signal can still switch; the server proves it
      // again and issues the token that actually authorises writes (ADR 0003).
      const correctHere = await verifyPin(typed, entry.salt, entry.hash);
      if (!correctHere) {
        toast.error(t("device.wrongPin"));
        return;
      }
      try {
        const proved = await switchUser.mutateAsync({
          userId: entry.userId,
          pin: typed,
        });
        setSwitchToken(proved.token);
        clearHeldStint();
      } catch {
        // Offline: work is captured locally, and the PIN — held in memory, never stored — is proved to the farm
        // as soon as the phone finds signal.
        setSwitchToken(null);
        holdUnprovedSwitch({ userId: entry.userId, pin: typed });
      }
      const leaving = getActiveUser()?.userId;
      setActiveUser({
        userId: entry.userId,
        name: entry.name,
        lastSeenAt: Date.now(),
      });
      // Whatever this phone read for the last person is not this person's to see. A Shed
      // Phone is one device several milkers work from, and a cache kept across a PIN Switch
      // is one milker's work — and Alerts — on the next one's screen (ADR 0003). Their own,
      // put away when they last left the phone, comes back: it is what they work from offline.
      await handOverThisPhone(queryClient, leaving, entry.userId);
      // Somebody is signed in again, so whatever the Outbox stopped holding back can go.
      await phoneOutbox()?.resume();
      // And this handset now speaks for them: leaving its subscription under whoever last
      // held it would send one milker's work to the next one's pocket (ADR 0003).
      const browser = await currentListener();
      if (browser) {
        try {
          await listenAgain.mutateAsync(browser);
        } catch {
          // No signal, or this browser is not listening. Either way the Alert is still in
          // the app, and nobody needs telling about it.
        }
      }
      setChosen(null);
      await navigate({ to: "/today" });
    },
    [switchUser, listenAgain, queryClient, t, navigate]
  );

  if (!token) {
    return (
      <form
        className={CARD}
        onSubmit={(event) => {
          event.preventDefault();
          claim.mutate({ code });
        }}
      >
        <StepHead
          hint={t("device.setupHelp")}
          icon={<Smartphone aria-hidden className="size-7" />}
          title={t("device.setup")}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">{t("device.code")}</Label>
          <Input
            autoComplete="off"
            id="code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="h-16 text-center font-mono text-3xl tracking-widest md:h-16 md:text-3xl"
            required
          />
        </div>
        <Button
          type="submit"
          className="h-14 w-full text-lg"
          disabled={claim.isPending}
        >
          {claim.isPending ? <Spinner /> : null}
          {t("device.enrol")}
        </Button>
      </form>
    );
  }

  const locked = isLocked(active, autoLockMinutes);

  if (!locked && active) {
    return (
      <div className={cn(CARD, "items-center text-center")}>
        <Initial name={active.name} size="lg" />
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">
            {t("device.workingAs", { name: active.name })}
          </h1>
          {where.data?.device?.name ? (
            <p className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
              <Smartphone aria-hidden className="size-4" />
              {where.data.device.name}
            </p>
          ) : null}
        </div>
        <Button
          className="h-14 w-full text-lg"
          onClick={() => navigate({ to: "/today" })}
        >
          {t("device.startWork")}
          <ChevronRight data-icon="inline-end" />
        </Button>
        <Button
          variant="outline"
          className="h-12 w-full text-base"
          onClick={() => {
            void lockAndPutAway(queryClient);
            void lockOnTheFarm();
          }}
        >
          <Lock data-icon="inline-start" />
          {t("device.lock")}
        </Button>
      </div>
    );
  }

  if (chosen) {
    // Typed on the phone's keyboard or tapped on the pad, the PIN goes the same way: digits only, four of them, and
    // checked as soon as the fourth is in.
    const typePin = (typed: string) => {
      const next = typed.replaceAll(/\D/gu, "").slice(0, PIN_LENGTH);
      setPin(next);
      if (next.length === PIN_LENGTH) {
        void submitPin(chosen, next);
      }
    };
    return (
      <div className={CARD}>
        <button
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ms-2 -mt-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-2"
          onClick={() => {
            setChosen(null);
            setPin("");
          }}
          type="button"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {t("device.whoAreYou")}
        </button>
        <div className="flex flex-col items-center gap-3 text-center">
          <Initial name={chosen.name} size="lg" />
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">
            {chosen.name}
          </h1>
        </div>
        <div className="flex flex-col items-center gap-3">
          <Label htmlFor="pin">{t("device.enterPin")}</Label>
          <Input
            id="pin"
            type="password"
            // The pad below is the keyboard: the phone's own would cover it. A keyboard plugged in still types.
            inputMode="none"
            autoComplete="off"
            autoFocus
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={(e) => typePin(e.target.value)}
            className="h-16 w-56 text-center font-mono text-4xl tracking-[0.6em] md:h-16 md:text-4xl"
          />
        </div>
        <PinPad
          onDelete={() => setPin((current) => current.slice(0, -1))}
          onDigit={(digit) => typePin(`${pin}${digit}`)}
        />
      </div>
    );
  }

  return (
    <div className={CARD}>
      <StepHead
        icon={<UserRound aria-hidden className="size-7" />}
        title={t("device.whoAreYou")}
      />
      {roster.isError ? (
        <Notice icon={WifiOff} title={t("device.offlineRoster")} tone="info" />
      ) : null}
      {people.length === 0 ? (
        <EmptyState icon={UserRound} title={t("device.noRoster")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((person) => (
            <li key={person.userId}>
              <Button
                variant="outline"
                className="h-auto min-h-16 w-full justify-start gap-3 py-2 text-start text-lg whitespace-normal"
                onClick={() => setChosen(person)}
              >
                <Initial name={person.name} />
                <span className="min-w-0 flex-1">{person.name}</span>
                <ChevronRight
                  aria-hidden
                  className="text-muted-foreground size-5"
                />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** The Shed Phone's own door: the farm's name at the top, and the one card that asks who is working. */
const DeviceScreen = () => (
  <div className="flex min-h-svh flex-col">
    <PublicHeader />
    <main
      className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:items-center sm:pt-0"
      id="main"
    >
      <DevicePage />
    </main>
  </div>
);

export const Route = createFileRoute("/device")({
  component: DeviceScreen,
});
