import { verifyPin } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/language-provider";
import type { RosterEntry } from "@/lib/device";
import {
  getActiveUser,
  getDeviceToken,
  getRoster,
  isLocked,
  setActiveUser,
  setDeviceToken,
  setRoster,
  subscribeDevice,
} from "@/lib/device";
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
      onError: (error: Error) =>
        toast.error(error.message || t("common.error")),
    })
  );

  // Re-render on a timer so the phone locks itself while nobody is touching it.
  useEffect(() => {
    const timer = window.setInterval(
      () => forceTick((n) => n + 1),
      LOCK_TICK_MS
    );
    return () => window.clearInterval(timer);
  }, []);

  const submitPin = useCallback(
    async (entry: RosterEntry, typed: string) => {
      const correct = await verifyPin(typed, entry.salt, entry.hash);
      setPin("");
      if (!correct) {
        toast.error(t("device.wrongPin"));
        return;
      }
      setActiveUser({
        userId: entry.userId,
        name: entry.name,
        lastSeenAt: Date.now(),
      });
      setChosen(null);
    },
    [t]
  );

  if (!token) {
    return (
      <form
        className="mx-auto mt-10 w-full max-w-sm space-y-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          claim.mutate({ code });
        }}
      >
        <h1 className="text-2xl font-bold">{t("device.setup")}</h1>
        <p className="text-muted-foreground">{t("device.setupHelp")}</p>
        <div className="space-y-1">
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
      <div className="mx-auto mt-10 w-full max-w-sm space-y-4 p-6 text-center">
        <p className="text-2xl font-bold">
          {t("device.workingAs", { name: active.name })}
        </p>
        <p className="text-muted-foreground text-sm">
          {where.data?.device?.name}
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setActiveUser(null)}
        >
          {t("device.lock")}
        </Button>
      </div>
    );
  }

  if (chosen) {
    return (
      <div className="mx-auto mt-10 w-full max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-bold">{chosen.name}</h1>
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
    <div className="mx-auto mt-10 w-full max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-bold">{t("device.whoAreYou")}</h1>
      {roster.isError ? (
        <p className="text-muted-foreground text-sm">
          {t("device.offlineRoster")}
        </p>
      ) : null}
      {people.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("device.noRoster")}</p>
      ) : (
        <ul className="space-y-2">
          {people.map((person) => (
            <li key={person.userId}>
              <Button
                variant="outline"
                className="h-14 w-full justify-start text-lg"
                onClick={() => setChosen(person)}
              >
                {person.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const Route = createFileRoute("/device")({
  component: DevicePage,
});
