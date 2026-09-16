import { verifyPin } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { PublicHeader } from "@/components/public-header";
import { useT } from "@/i18n/language-provider";
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
        className="surface mx-auto flex w-full max-w-sm flex-col gap-4 p-6 sm:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          claim.mutate({ code });
        }}
      >
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {t("device.setup")}
        </h1>
        <p className="text-muted-foreground">{t("device.setupHelp")}</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">{t("device.code")}</Label>
          <Input
            id="code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="text-center font-mono text-2xl tracking-widest"
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={claim.isPending}>
          {t("device.enrol")}
        </Button>
      </form>
    );
  }

  const locked = isLocked(active, autoLockMinutes);

  if (!locked && active) {
    return (
      <div className="surface mx-auto flex w-full max-w-sm flex-col gap-4 p-6 text-center sm:p-8">
        <p className="text-2xl font-semibold">
          {t("device.workingAs", { name: active.name })}
        </p>
        <p className="text-muted-foreground text-sm">
          {where.data?.device?.name}
        </p>
        <Button
          className="w-full"
          onClick={() => navigate({ to: "/today" })}
          size="lg"
        >
          {t("device.startWork")}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            void lockAndPutAway(queryClient);
            void lockOnTheFarm();
          }}
        >
          {t("device.lock")}
        </Button>
      </div>
    );
  }

  if (chosen) {
    return (
      <div className="surface mx-auto flex w-full max-w-sm flex-col gap-4 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {chosen.name}
        </h1>
        <Label htmlFor="pin">{t("device.enterPin")}</Label>
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_LENGTH}
          value={pin}
          onChange={(e) => {
            const next = e.target.value
              .replaceAll(/\D/gu, "")
              .slice(0, PIN_LENGTH);
            setPin(next);
            if (next.length === PIN_LENGTH) {
              void submitPin(chosen, next);
            }
          }}
          className="text-center font-mono text-3xl tracking-[0.5em]"
        />
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            setChosen(null);
            setPin("");
          }}
        >
          {t("device.whoAreYou")}
        </Button>
      </div>
    );
  }

  return (
    <div className="surface mx-auto flex w-full max-w-sm flex-col gap-4 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
        {t("device.whoAreYou")}
      </h1>
      {roster.isError ? (
        <p className="text-muted-foreground text-sm">
          {t("device.offlineRoster")}
        </p>
      ) : null}
      {people.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("device.noRoster")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((person) => (
            <li key={person.userId}>
              <Button
                variant="outline"
                className="h-16 w-full justify-start gap-3 text-lg"
                onClick={() => setChosen(person)}
              >
                <span className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-full text-base font-semibold">
                  {person.name.slice(0, 1)}
                </span>
                {person.name}
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
