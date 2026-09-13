import type { RoleName } from "@OpenFarm/api/roles";
import { ROLES } from "@OpenFarm/api/roles";
import { formatDate } from "@OpenFarm/i18n";
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
import { KeyRound, MailCheck, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  Loaded,
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
                saving={{
                  roles: inFlight.has(`roles:${person.id}`),
                  pin: inFlight.has(`pin:${person.id}`),
                  access: inFlight.has(`access:${person.id}`),
                }}
              />
            ))}
          </ul>
        </Loaded>
      </Section>

      {list.data?.awaitingSignup.length ? (
        <Section title={t("people.awaitingSignup")}>
          <ul className="space-y-1 text-sm">
            {list.data.awaitingSignup.map((inv) => (
              <li key={inv.id} className="text-muted-foreground">
                {inv.name} · {inv.email} ·{" "}
                {inv.roles.map((r) => t(roleKey(r))).join(", ")}
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
}: {
  person: {
    id: string;
    name: string;
    email: string;
    roles: RoleName[];
    disabledAt: Date | null;
  };
  isOwner: boolean;
  isSelf: boolean;
  onSave: (roles: RoleName[]) => void;
  onSetPin: (pin: string) => Promise<unknown>;
  onDisable: () => void;
  onEnable: () => void;
  saving: { roles: boolean; pin: boolean; access: boolean };
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
        {disabled ? (
          <StatusBadge icon={UserX} tone="danger">
            {t("people.disabled")}
          </StatusBadge>
        ) : (
          <StatusBadge tone="success">{t("people.active")}</StatusBadge>
        )}
      </div>
      <TrainedOn userId={person.id} />
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
      <DialogContent>
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
  const invite = useMutation(
    orpc.people.invite.mutationOptions({
      onSuccess: () => {
        toast.success(t("people.inviteSent"));
        setName("");
        setEmail("");
        onSent();
      },
      onError: () => toast.error(t("common.error")),
    })
  );

  return (
    <Section title={t("people.invite")}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          invite.mutate({ name, email, roles });
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
        {ownerCanPickRoles ? (
          <fieldset className="flex flex-wrap gap-x-5 gap-y-1 sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">
              {t("people.roles")}
            </legend>
            {ROLES.map((role) => (
              <RoleChoice
                checked={roles.includes(role)}
                key={role}
                onToggle={() => setRoles((current) => toggled(current, role))}
                role={role}
              />
            ))}
          </fieldset>
        ) : (
          <p className="text-muted-foreground text-sm sm:col-span-2">
            {t("role.staff")}
          </p>
        )}
        <Button
          className="w-full sm:w-auto sm:justify-self-start"
          disabled={invite.isPending || roles.length === 0}
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
