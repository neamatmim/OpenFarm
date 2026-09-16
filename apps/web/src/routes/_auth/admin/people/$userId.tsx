import type { RoleName } from "@OpenFarm/api/roles";
import { ROLES } from "@OpenFarm/api/roles";
import { formatDate, formatDayField } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@OpenFarm/ui/components/dialog";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  ChevronLeft,
  KeyRound,
  Smartphone,
  UserX,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import {
  EmptyState,
  Loaded,
  Notice,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { RoleChoice, toggled } from "@/components/role-choice";
import { useLanguage, useT } from "@/i18n/language-provider";
import { words } from "@/lib/correcting";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** What this person has been taught, newest first. Not a tick beside their name: a Version
 *  published this morning does not untrain anybody, and what they knew in March stays true. */
const TrainedOn = ({ userId }: { userId: string }) => {
  const t = useT();
  const { language } = useLanguage();
  const person = useQuery(orpc.people.get.queryOptions({ input: { userId } }));
  const training = person.data?.training ?? [];
  if (training.length === 0) {
    return null;
  }
  return (
    <ul className="text-muted-foreground space-y-1 text-sm">
      {training.map((row) => (
        <li key={row.id}>
          {row.sopName.bn} ·{" "}
          {t("training.on", {
            number: row.versionNumber,
            date: formatDate(new Date(row.trainedAt), language, "date"),
          })}
        </li>
      ))}
    </ul>
  );
};

/** The Owner putting a person's name right — a misspelling at sign-up, a name the farm knows them by. The old name stays
 *  in the trail beside the reason. */
const CorrectName = ({ userId, name }: { userId: string; name: string }) => {
  const t = useT();
  const queryClient = useQueryClient();
  const correcting = useCorrecting({ name: words(name) });
  const correct = useMutation(orpc.people.correctName.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: userId,
          changes: correcting.changes(),
          reason,
        });
        await queryClient.invalidateQueries({ queryKey: orpc.people.key() });
      }}
      ready={correcting.changed}
      title={t("people.correctName")}
      trigger={t("people.correctName")}
    >
      <CorrectionAnswer
        label={t("people.name")}
        onChange={(value) => correcting.set("name", value)}
        value={correcting.typed.name ?? ""}
      />
    </CorrectionDialog>
  );
};

/** A visiting Vet's visit: when it ends, a later day from the Owner, or an end today from either who runs the farm. */
const VisitControls = ({
  userId,
  until,
  isOwner,
}: {
  userId: string;
  until: Date;
  isOwner: boolean;
}) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  // The visit's last farm day: it runs to the close of that day.
  const lastDay = formatDayField(new Date(new Date(until).getTime() - 60_000));
  const [day, setDay] = useState(lastDay);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.people.key() });
  const onError = (error: Error) => toast.error(sayWhy(error, t));
  const extend = useMutation(
    orpc.vetCases.setVisitUntil.mutationOptions({
      onSuccess: async () => {
        toast.success(t("visit.changed"));
        await refresh();
      },
      onError,
    })
  );
  const end = useMutation(
    orpc.vetCases.endVisit.mutationOptions({
      onSuccess: async () => {
        toast.success(t("visit.ended"));
        await refresh();
      },
      onError,
    })
  );
  return (
    <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <StatusBadge icon={CalendarClock} tone="warning">
        {t("visit.until", {
          // The last day it lasts, not the midnight it ends at.
          date: formatDate(
            new Date(new Date(until).getTime() - 60_000),
            language,
            "date"
          ),
        })}
      </StatusBadge>
      {isOwner ? (
        <span className="flex items-center gap-2">
          <Input
            aria-label={t("visit.lastDay")}
            className="w-40"
            onChange={(event) => setDay(event.target.value)}
            type="date"
            value={day}
          />
          <Button
            disabled={extend.isPending || !day || day === lastDay}
            onClick={() => extend.mutate({ userId, visitUntil: day })}
            size="sm"
            variant="outline"
          >
            {t("visit.change")}
          </Button>
        </span>
      ) : null}
      <Button
        className="ms-auto"
        disabled={end.isPending}
        onClick={() => end.mutate({ userId })}
        size="sm"
        variant="ghost"
      >
        {t("visit.end")}
      </Button>
    </div>
  );
};

/** The Pens whose work is this person's, grouped by shed; saved as what was added and what was taken away. */
const PenPicker = ({
  held,
  pens,
  onSave,
  saving,
}: {
  held: string[];
  pens: { id: string; name: string; shed: string }[];
  onSave: (add: string[], remove: string[]) => void;
  saving: boolean;
}) => {
  const t = useT();
  const [chosen, setChosen] = useState(() => new Set(held));
  const add = [...chosen].filter((id) => !held.includes(id));
  const remove = held.filter((id) => !chosen.has(id));
  const sheds = [...new Set(pens.map((pen) => pen.shed))];
  return (
    <fieldset className="flex flex-col gap-2 border-t pt-3">
      <legend className="mb-1 text-sm font-medium">{t("people.pens")}</legend>
      {held.length === 0 ? (
        <p className="text-warning text-sm">{t("people.pensNone")}</p>
      ) : null}
      {sheds.map((shed) => (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1" key={shed}>
          <span className="text-muted-foreground w-full text-sm">{shed}</span>
          {pens
            .filter((pen) => pen.shed === shed)
            .map((pen) => (
              <Label
                className="flex min-h-11 cursor-pointer items-center gap-2 font-normal md:min-h-8"
                key={pen.id}
              >
                <Checkbox
                  checked={chosen.has(pen.id)}
                  onCheckedChange={() =>
                    setChosen((current) => {
                      const next = new Set(current);
                      if (next.has(pen.id)) {
                        next.delete(pen.id);
                      } else {
                        next.add(pen.id);
                      }
                      return next;
                    })
                  }
                />
                {pen.name}
              </Label>
            ))}
        </div>
      ))}
      <Button
        className="w-fit"
        disabled={saving || (add.length === 0 && remove.length === 0)}
        onClick={() => onSave(add, remove)}
        variant="outline"
      >
        {saving ? <Spinner /> : null}
        {t("people.pensSave")}
      </Button>
    </fieldset>
  );
};

/** Restoring access is one press. Removing it names the person first: a phone signed out mid-shift is not undone by
 *  pressing the button again. */
const AccessButton = ({
  disabled,
  name,
  onDisable,
  onEnable,
  saving,
}: {
  disabled: boolean;
  name: string;
  onDisable: () => void;
  onEnable: () => void;
  saving: boolean;
}) => {
  const t = useT();
  const [asking, setAsking] = useState(false);
  if (disabled) {
    return (
      <Button disabled={saving} onClick={onEnable} variant="outline">
        {saving ? <Spinner /> : null}
        {t("people.enable")}
      </Button>
    );
  }
  return (
    <Dialog onOpenChange={setAsking} open={asking}>
      <DialogTrigger
        render={
          <Button disabled={saving} variant="destructive">
            {saving ? <Spinner /> : <UserX aria-hidden />}
            {t("people.disable")}
          </Button>
        }
      />
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("people.disableTitle", { name })}</DialogTitle>
          <DialogDescription>{t("people.disableWhy")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {t("common.cancel")}
          </DialogClose>
          <Button
            onClick={() => {
              setAsking(false);
              onDisable();
            }}
            variant="destructive"
          >
            {t("people.disable")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Where they are signed in as themselves, and the way to turn one of them out — a phone left in a yard, a
 *  browser in a shop. Not Shed Phones, which the farm enrols and revokes as devices. */
const SignedInOn = ({ userId }: { userId: string }) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const where = useQuery(
    orpc.people.signedInOn.queryOptions({ input: { userId } })
  );
  const signOut = useMutation(
    orpc.people.signOut.mutationOptions({
      onSuccess: async () => {
        toast.success(t("people.signedOut"));
        await queryClient.invalidateQueries({
          queryKey: orpc.people.signedInOn.key(),
        });
      },
      onError: (error: Error) => toast.error(sayWhy(error, t)),
    })
  );
  const when = (at: Date) => formatDate(new Date(at), language, "dateTime");
  return (
    <Section title={t("people.signedInOn")}>
      <Loaded query={where}>
        {where.data?.length ? (
          <ul className="divide-border flex flex-col divide-y">
            {where.data.map((one) => (
              <li
                className="flex flex-wrap items-center gap-2 py-2 text-sm"
                key={one.id}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {one.browser ?? t("people.signedInOn")}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {t("people.signedInSince", {
                      date: when(one.since),
                      seen: when(one.lastSeen),
                    })}
                    {one.from ? ` · ${one.from}` : ""}
                  </span>
                </span>
                <Button
                  disabled={signOut.isPending}
                  onClick={() => signOut.mutate({ userId, sessionId: one.id })}
                  size="sm"
                  variant="outline"
                >
                  {t("people.signOut")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            bare
            icon={Smartphone}
            title={t("people.signedInNowhere")}
          />
        )}
      </Loaded>
    </Section>
  );
};

/** A code for somebody who has forgotten their password, shown once. The farm never sets a password for
 *  anybody: one somebody else has seen is one that signs work in their name. */
const PasswordCode = ({ userId, name }: { userId: string; name: string }) => {
  const t = useT();
  const [code, setCode] = useState<string | null>(null);
  const issue = useMutation(
    orpc.people.newPasswordCode.mutationOptions({
      onSuccess: (given) => setCode(given.code),
      onError: (error: Error) => toast.error(sayWhy(error, t)),
    })
  );
  return (
    <Section title={t("people.passwordCode")}>
      <p className="text-muted-foreground text-sm">
        {t("people.passwordCodeWhy")}
      </p>
      {code ? (
        <Notice
          icon={KeyRound}
          title={t("people.handOverTitle", { name })}
          tone="info"
        >
          <p className="text-foreground mt-2 font-mono text-2xl font-semibold tracking-[0.3em]">
            {code}
          </p>
        </Notice>
      ) : null}
      <Button
        className="w-fit"
        disabled={issue.isPending}
        onClick={() => issue.mutate({ userId })}
        variant="outline"
      >
        {issue.isPending ? <Spinner /> : <KeyRound aria-hidden />}
        {t("people.newPasswordCode")}
      </Button>
    </Section>
  );
};

/** Whatever the farm answers for one change about one person: say it, and read them again. */
const useSaying = () => {
  const t = useT();
  const queryClient = useQueryClient();
  return {
    said: (message: string) => async () => {
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: orpc.people.key() });
    },
    onError: (error: Error) => toast.error(sayWhy(error, t)),
  };
};

/** What Roles they hold, which is the Owner's to set. */
const TheirRoles = ({
  userId,
  roles,
}: {
  userId: string;
  roles: RoleName[];
}) => {
  const t = useT();
  const { said, onError } = useSaying();
  const [wanted, setWanted] = useState<RoleName[] | null>(null);
  const held = wanted ?? roles;
  const assign = useMutation(
    orpc.people.assignRoles.mutationOptions({
      onSuccess: said(t("people.rolesSaved")),
      onError,
    })
  );
  return (
    <Section title={t("people.roles")}>
      <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <legend className="sr-only">{t("people.roles")}</legend>
        {ROLES.map((role) => (
          <RoleChoice
            checked={held.includes(role)}
            key={role}
            onToggle={() =>
              setWanted((current) => toggled(current ?? roles, role))
            }
            role={role}
          />
        ))}
        <Button
          disabled={assign.isPending || held.length === 0}
          onClick={() => assign.mutate({ userId, roles: held })}
          variant="outline"
        >
          {assign.isPending ? <Spinner /> : null}
          {t("people.saveRoles")}
        </Button>
      </fieldset>
    </Section>
  );
};

/** The Pens whose work is theirs. A visiting Vet works Cases, not Pens, and has none of this. */
const TheirPens = ({ userId, held }: { userId: string; held: string[] }) => {
  const t = useT();
  const { said, onError } = useSaying();
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const assignPens = useMutation(
    orpc.people.assignPens.mutationOptions({
      onSuccess: said(t("people.pensSaved")),
      onError,
    })
  );
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((pen) => ({ id: pen.id, name: pen.name, shed: shed.name }))
  );
  return (
    <Section title={t("people.pens")}>
      <PenPicker
        held={held}
        onSave={(add, remove) => assignPens.mutate({ userId, add, remove })}
        pens={pens}
        saving={assignPens.isPending}
      />
    </Section>
  );
};

/** The four digits they PIN Switch on a Shed Phone with. Never read back: the farm keeps a salt and a hash. */
const TheirPin = ({ userId }: { userId: string }) => {
  const t = useT();
  const { said, onError } = useSaying();
  const [pin, setPin] = useState("");
  const setThePin = useMutation(
    orpc.people.setPin.mutationOptions({
      onSuccess: said(t("people.pinSet")),
      onError,
    })
  );
  return (
    <Section title={t("people.pin")}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t("people.pin")}
          className="w-32"
          inputMode="numeric"
          maxLength={4}
          onChange={(event) =>
            setPin(event.target.value.replaceAll(/\D/gu, "").slice(0, 4))
          }
          placeholder={t("people.pinHelp")}
          value={pin}
        />
        <Button
          disabled={pin.length !== 4 || setThePin.isPending}
          onClick={async () => {
            await setThePin.mutateAsync({ userId, pin });
            // Cleared only once the farm has it: a PIN that failed to save stays where it can be sent again.
            setPin("");
          }}
          variant="outline"
        >
          {setThePin.isPending ? <Spinner /> : <KeyRound aria-hidden />}
          {t("people.setPin")}
        </Button>
      </div>
    </Section>
  );
};

/** Ending somebody's Membership, and bringing them back. Not their own to end. */
const TheirMembership = ({
  userId,
  name,
  gone,
}: {
  userId: string;
  name: string;
  gone: boolean;
}) => {
  const t = useT();
  const { said, onError } = useSaying();
  const disable = useMutation(
    orpc.people.disable.mutationOptions({
      onSuccess: said(t("people.disabled")),
      onError,
    })
  );
  const enable = useMutation(
    orpc.people.enable.mutationOptions({
      onSuccess: said(t("people.active")),
      onError,
    })
  );
  return (
    <Section title={t("people.disable")}>
      <AccessButton
        disabled={gone}
        name={name}
        onDisable={() => disable.mutate({ userId })}
        onEnable={() => enable.mutate({ userId })}
        saving={disable.isPending || enable.isPending}
      />
    </Section>
  );
};

const PersonPage = () => {
  const { userId } = Route.useParams();
  const t = useT();
  const me = useQuery(orpc.people.me.queryOptions());
  const person = useQuery(orpc.people.get.queryOptions({ input: { userId } }));
  const isOwner = me.data?.roles.includes("owner") ?? false;
  const isSelf = me.data?.id === userId;
  const them = person.data;
  const gone = Boolean(them?.disabledAt);

  return (
    <Page className="max-w-3xl" width="default">
      <Link
        className="text-muted-foreground hover:text-foreground flex min-h-11 w-fit items-center gap-1 text-sm"
        to="/admin/people"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("people.backToPeople")}
      </Link>
      <Loaded query={person}>
        {them ? (
          <>
            <PageHeader
              actions={
                isOwner ? (
                  <CorrectName name={them.name} userId={userId} />
                ) : null
              }
              title={them.name}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-sm">
                {them.email}
              </span>
              {gone ? (
                <StatusBadge icon={UserX} tone="danger">
                  {t("people.disabled")}
                </StatusBadge>
              ) : (
                <StatusBadge tone="success">{t("people.active")}</StatusBadge>
              )}
            </div>

            {them.visitUntil && !gone ? (
              <VisitControls
                isOwner={isOwner}
                until={them.visitUntil}
                userId={userId}
              />
            ) : null}

            {isOwner ? <TheirRoles roles={them.roles} userId={userId} /> : null}
            {gone || them.visitUntil ? null : (
              <TheirPens held={them.penIds} userId={userId} />
            )}
            {isOwner ? <TheirPin userId={userId} /> : null}

            <SignedInOn userId={userId} />
            <PasswordCode name={them.name} userId={userId} />

            <Section title={t("training.title")}>
              <TrainedOn userId={userId} />
            </Section>

            {isSelf ? null : (
              <TheirMembership gone={gone} name={them.name} userId={userId} />
            )}
          </>
        ) : null}
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/people/$userId")({
  component: PersonPage,
});
