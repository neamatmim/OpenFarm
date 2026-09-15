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
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, KeyRound, MailCheck, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CorrectionDialog,
  CorrectionField,
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
import { useLanguage, useT } from "@/i18n/language-provider";
import { useInFlight } from "@/lib/in-flight";
import { orpc } from "@/utils/orpc";

const roleKey = (role: RoleName) => `role.${role}` as const;

const PeoplePage = () => {
  const t = useT();
  const queryClient = useQueryClient();
  const me = useQuery(orpc.people.me.queryOptions());
  const list = useQuery(orpc.people.list.queryOptions());
  const isOwner = me.data?.roles.includes("owner") ?? false;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.people.list.key() });
  const onError = () => toast.error(t("common.error"));
  const inFlight = useInFlight();
  /** A person's action waits from the moment it is asked until the farm answers that one. */
  const trackUser = (kind: string) => ({
    onMutate: ({ userId }: { userId: string }) =>
      inFlight.start(`${kind}:${userId}`),
    onSettled: (
      _data: unknown,
      _error: unknown,
      { userId }: { userId: string }
    ) => inFlight.end(`${kind}:${userId}`),
  });

  const approve = useMutation(
    orpc.people.approveInvite.mutationOptions({
      onMutate: ({ id }) => inFlight.start(`approve:${id}`),
      onSettled: (_data, _error, { id }) => inFlight.end(`approve:${id}`),
      onSuccess: () => {
        toast.success(t("people.approved"));
        refresh();
      },
      onError,
    })
  );
  const disable = useMutation(
    orpc.people.disable.mutationOptions({
      ...trackUser("access"),
      onSuccess: () => {
        toast.success(t("people.accessRemoved"));
        refresh();
      },
      onError,
    })
  );
  const enable = useMutation(
    orpc.people.enable.mutationOptions({
      ...trackUser("access"),
      onSuccess: () => {
        toast.success(t("people.accessRestored"));
        refresh();
      },
      onError,
    })
  );
  const setPin = useMutation(
    orpc.people.setPin.mutationOptions({
      ...trackUser("pin"),
      onSuccess: () => toast.success(t("people.pinSet")),
      onError,
    })
  );
  const [reissued, setReissued] = useState<{
    name: string;
    email: string;
    code: string;
  } | null>(null);
  const reissue = useMutation(
    orpc.people.reissueInviteCode.mutationOptions({
      onMutate: ({ id }) => inFlight.start(`code:${id}`),
      onSettled: (_data, _error, { id }) => inFlight.end(`code:${id}`),
      onSuccess: ({ id, code }) => {
        const waiting = list.data?.awaitingSignup.find((inv) => inv.id === id);
        setReissued({
          name: waiting?.name ?? "",
          email: waiting?.email ?? "",
          code,
        });
      },
      onError,
    })
  );
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((one) => ({ id: one.id, name: one.name, shed: shed.name }))
  );
  const assignPens = useMutation(
    orpc.people.assignPens.mutationOptions({
      ...trackUser("pens"),
      onSuccess: () => {
        toast.success(t("people.pensSaved"));
        refresh();
      },
      onError,
    })
  );
  const assign = useMutation(
    orpc.people.assignRoles.mutationOptions({
      ...trackUser("roles"),
      onSuccess: () => {
        toast.success(t("people.rolesSaved"));
        refresh();
      },
      onError,
    })
  );

  return (
    <Page width="default" className="max-w-4xl">
      <PageHeader title={t("people.title")} />

      <Section title={t("people.pending")}>
        <Loaded query={list}>
          {list.data?.pendingInvites.length ? (
            <ul className="space-y-2">
              {list.data.pendingInvites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{inv.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {inv.email} ·{" "}
                      {inv.roles.map((r) => t(roleKey(r))).join(", ")} ·{" "}
                      {t("people.invitedBy", {
                        role: t(roleKey(inv.invitedByRole)),
                      })}
                    </p>
                  </div>
                  {isOwner ? (
                    <Button
                      disabled={inFlight.has(`approve:${inv.id}`)}
                      onClick={() => approve.mutate({ id: inv.id })}
                    >
                      {inFlight.has(`approve:${inv.id}`) ? <Spinner /> : null}
                      {t("people.approve")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState bare icon={MailCheck} title={t("people.noPending")} />
          )}
        </Loaded>
      </Section>

      <Section title={t("people.roles")}>
        <Loaded query={list}>
          <ul className="space-y-3">
            {list.data?.people.map((person) => (
              <PersonRow
                key={`${person.id}:${person.roles.join(",")}:${person.disabledAt ? "off" : "on"}`}
                person={person}
                isOwner={isOwner}
                isSelf={person.id === me.data?.id}
                onSave={(roles) => assign.mutate({ userId: person.id, roles })}
                onSetPin={(pin) =>
                  setPin.mutateAsync({ userId: person.id, pin })
                }
                onDisable={() => disable.mutate({ userId: person.id })}
                onEnable={() => enable.mutate({ userId: person.id })}
                pens={pens}
                onSavePens={(add, remove) =>
                  assignPens.mutate({ userId: person.id, add, remove })
                }
                saving={{
                  roles: inFlight.has(`roles:${person.id}`),
                  pin: inFlight.has(`pin:${person.id}`),
                  access: inFlight.has(`access:${person.id}`),
                  pens: inFlight.has(`pens:${person.id}`),
                }}
              />
            ))}
          </ul>
        </Loaded>
      </Section>

      {list.data?.awaitingSignup.length ? (
        <Section title={t("people.awaitingSignup")}>
          {reissued ? <InviteCode {...reissued} /> : null}
          <ul className="divide-border flex flex-col divide-y text-sm">
            {list.data.awaitingSignup.map((inv) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 py-2"
                key={inv.id}
              >
                <span className="text-muted-foreground">
                  {inv.name} · {inv.email} ·{" "}
                  {inv.roles.map((r) => t(roleKey(r))).join(", ")}
                </span>
                <Button
                  disabled={inFlight.has(`code:${inv.id}`)}
                  onClick={() => reissue.mutate({ id: inv.id })}
                  size="sm"
                  variant="outline"
                >
                  {t("people.newCode")}
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <InviteForm ownerCanPickRoles={isOwner} onSent={refresh} />
    </Page>
  );
};

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

/** A role picked or not, with the shared checkbox and a label the whole row answers to. */
const RoleChoice = ({
  role,
  checked,
  onToggle,
}: {
  role: RoleName;
  checked: boolean;
  onToggle: () => void;
}) => {
  const t = useT();
  return (
    <Label className="flex min-h-11 cursor-pointer items-center gap-2 font-normal md:min-h-8">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      {t(roleKey(role))}
    </Label>
  );
};

/** The Owner putting a person's name right — a misspelling at sign-up, a name the farm knows them by. The old name stays
 *  in the trail beside the reason. */
const CorrectName = ({ userId, name }: { userId: string; name: string }) => {
  const t = useT();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(name);
  const correct = useMutation(orpc.people.correctName.mutationOptions({}));
  return (
    <CorrectionDialog
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: userId,
          changes: { name: { from: name, to: value.trim() } },
          reason,
        });
        await queryClient.invalidateQueries({ queryKey: orpc.people.key() });
      }}
      ready={value.trim() !== "" && value.trim() !== name}
      title={t("people.correctName")}
      trigger={t("people.correctName")}
    >
      <CorrectionField
        label={t("people.name")}
        onChange={setValue}
        value={value}
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
  const onError = (error: Error) =>
    toast.error(error.message || t("common.error"));
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

const toggled = (roles: RoleName[], role: RoleName) =>
  roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];

const PersonRow = ({
  person,
  isOwner,
  isSelf,
  onSave,
  onSetPin,
  onDisable,
  onEnable,
  saving,
  pens,
  onSavePens,
}: {
  person: {
    id: string;
    name: string;
    email: string;
    roles: RoleName[];
    penIds: string[];
    disabledAt: Date | null;
    visitUntil: Date | null;
  };
  pens: { id: string; name: string; shed: string }[];
  onSavePens: (add: string[], remove: string[]) => void;
  isOwner: boolean;
  isSelf: boolean;
  onSave: (roles: RoleName[]) => void;
  onSetPin: (pin: string) => Promise<unknown>;
  onDisable: () => void;
  onEnable: () => void;
  saving: { roles: boolean; pin: boolean; access: boolean; pens: boolean };
}) => {
  const t = useT();
  const [roles, setRoles] = useState<RoleName[]>(person.roles);
  const [pin, setPin] = useState("");
  const disabled = person.disabledAt !== null;
  const savePin = async () => {
    try {
      await onSetPin(pin);
      // Cleared only once the farm has it: a PIN that failed to save stays where it can be sent again.
      setPin("");
    } catch {
      // The mutation has already said what went wrong.
    }
  };

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{person.name}</p>
          <p className="text-muted-foreground truncate text-sm">
            {person.email}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isOwner ? (
            <CorrectName name={person.name} userId={person.id} />
          ) : null}
          {disabled ? (
            <StatusBadge icon={UserX} tone="danger">
              {t("people.disabled")}
            </StatusBadge>
          ) : (
            <StatusBadge tone="success">{t("people.active")}</StatusBadge>
          )}
        </div>
      </div>
      {person.visitUntil && !disabled ? (
        <VisitControls
          isOwner={isOwner}
          until={person.visitUntil}
          userId={person.id}
        />
      ) : null}
      <TrainedOn userId={person.id} />
      {/* A visiting Vet works Cases, not Pens. */}
      {disabled || person.visitUntil ? null : (
        <PenPicker
          held={person.penIds}
          onSave={onSavePens}
          pens={pens}
          saving={saving.pens}
        />
      )}
      {isOwner ? (
        <>
          <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <legend className="sr-only">{t("people.roles")}</legend>
            {ROLES.map((role) => (
              <RoleChoice
                checked={roles.includes(role)}
                key={role}
                onToggle={() => setRoles((current) => toggled(current, role))}
                role={role}
              />
            ))}
            <Button
              disabled={saving.roles || roles.length === 0}
              onClick={() => onSave(roles)}
              variant="outline"
            >
              {saving.roles ? <Spinner /> : null}
              {t("people.saveRoles")}
            </Button>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
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
              disabled={pin.length !== 4 || saving.pin}
              onClick={savePin}
              variant="outline"
            >
              {saving.pin ? <Spinner /> : <KeyRound aria-hidden />}
              {t("people.setPin")}
            </Button>
            {isSelf ? null : (
              <div className="ms-auto">
                <AccessButton
                  disabled={disabled}
                  name={person.name}
                  onDisable={onDisable}
                  onEnable={onEnable}
                  saving={saving.access}
                />
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm">
          {person.roles.map((r) => t(roleKey(r))).join(", ")}
        </p>
      )}
    </li>
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

/** The code to hand the invited person, shown once: they sign up with their email and enter it. */
const InviteCode = ({
  name,
  email,
  code,
}: {
  name: string;
  email: string;
  code: string;
}) => {
  const t = useT();
  return (
    <Notice
      icon={KeyRound}
      title={t("people.handOverTitle", { name })}
      tone="info"
    >
      <p>{t("people.handOverHow", { email })}</p>
      <p className="text-foreground mt-2 font-mono text-2xl font-semibold tracking-[0.3em]">
        {code}
      </p>
    </Notice>
  );
};

/** Which Roles an invite gives: the Owner picks; a Manager invites Barn Staff. */
const InviteRoles = ({
  ownerCanPickRoles,
  roles,
  onToggle,
}: {
  ownerCanPickRoles: boolean;
  roles: RoleName[];
  onToggle: (role: RoleName) => void;
}) => {
  const t = useT();
  if (!ownerCanPickRoles) {
    return (
      <p className="text-muted-foreground text-sm sm:col-span-2">
        {t("role.staff")}
      </p>
    );
  }
  return (
    <fieldset className="flex flex-wrap gap-x-5 gap-y-1 sm:col-span-2">
      <legend className="mb-1 text-sm font-medium">{t("people.roles")}</legend>
      {ROLES.map((role) => (
        <RoleChoice
          checked={roles.includes(role)}
          key={role}
          onToggle={() => onToggle(role)}
          role={role}
        />
      ))}
    </fieldset>
  );
};

/** Whether the person invited is a vet called in for a visit, and the last day it lasts. */
const VisitChoice = ({
  visiting,
  onVisiting,
  until,
  onUntil,
}: {
  visiting: boolean;
  onVisiting: (visiting: boolean) => void;
  until: string;
  onUntil: (day: string) => void;
}) => {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <label className="inline-flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={visiting}
          onCheckedChange={(checked) => onVisiting(Boolean(checked))}
        />
        {t("visit.invite")}
      </label>
      {visiting ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-visit-until">{t("visit.lastDay")}</Label>
          <Input
            className="w-44"
            id="invite-visit-until"
            onChange={(event) => onUntil(event.target.value)}
            required
            type="date"
            value={until}
          />
          <p className="text-muted-foreground text-xs">
            {t("visit.inviteHint")}
          </p>
        </div>
      ) : null}
    </div>
  );
};

const InviteForm = ({
  ownerCanPickRoles,
  onSent,
}: {
  ownerCanPickRoles: boolean;
  onSent: () => void;
}) => {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<RoleName[]>(["staff"]);
  // A vet called in for a visit: invited as a Vet, until a day.
  const [visiting, setVisiting] = useState(false);
  const [visitUntil, setVisitUntil] = useState("");
  const [handOver, setHandOver] = useState<{
    name: string;
    email: string;
    code: string;
  } | null>(null);
  const invite = useMutation(
    orpc.people.invite.mutationOptions({
      onSuccess: ({ code }) => {
        toast.success(t("people.inviteSent"));
        setHandOver({ name, email, code });
        setName("");
        setEmail("");
        onSent();
      },
      onError: () => toast.error(t("common.error")),
    })
  );

  return (
    <Section title={t("people.invite")}>
      {handOver ? <InviteCode {...handOver} /> : null}
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          invite.mutate(
            visiting
              ? { name, email, roles: ["vet"], visitUntil }
              : { name, email, roles }
          );
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="invite-name">{t("people.name")}</Label>
          <Input
            id="invite-name"
            onChange={(e) => setName(e.target.value)}
            required
            value={name}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="invite-email">{t("people.email")}</Label>
          <Input
            id="invite-email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <VisitChoice
          onUntil={setVisitUntil}
          onVisiting={setVisiting}
          until={visitUntil}
          visiting={visiting}
        />
        {visiting ? null : (
          <InviteRoles
            onToggle={(role) => setRoles((current) => toggled(current, role))}
            ownerCanPickRoles={ownerCanPickRoles}
            roles={roles}
          />
        )}
        <Button
          className="w-full sm:w-auto sm:justify-self-start"
          disabled={
            invite.isPending || (visiting ? !visitUntil : roles.length === 0)
          }
          type="submit"
        >
          {invite.isPending ? <Spinner /> : null}
          {t("people.inviteSend")}
        </Button>
      </form>
    </Section>
  );
};

export const Route = createFileRoute("/_auth/admin/people")({
  component: PeoplePage,
});
