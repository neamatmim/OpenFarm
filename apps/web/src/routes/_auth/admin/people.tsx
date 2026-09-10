import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const ROLES = ["owner", "manager", "staff", "vet"] as const;
type RoleName = (typeof ROLES)[number];

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

  const approve = useMutation(
    orpc.people.approveInvite.mutationOptions({
      onSuccess: () => {
        toast.success(t("people.approved"));
        refresh();
      },
      onError,
    })
  );
  const disable = useMutation(
    orpc.people.disable.mutationOptions({
      onSuccess: () => {
        toast.success(t("people.accessRemoved"));
        refresh();
      },
      onError,
    })
  );
  const enable = useMutation(
    orpc.people.enable.mutationOptions({
      onSuccess: () => {
        toast.success(t("people.accessRestored"));
        refresh();
      },
      onError,
    })
  );
  const assign = useMutation(
    orpc.people.assignRoles.mutationOptions({
      onSuccess: () => {
        toast.success(t("people.rolesSaved"));
        refresh();
      },
      onError,
    })
  );

  return (
    <div className="container mx-auto max-w-3xl space-y-8 px-4 py-6">
      <h1 className="text-2xl font-bold">{t("people.title")}</h1>

      <section className="space-y-3">
        <h2 className="font-medium">{t("people.pending")}</h2>
        {list.data?.pendingInvites.length ? (
          <ul className="space-y-2">
            {list.data.pendingInvites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between rounded-lg border p-3"
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
                    size="sm"
                    onClick={() => approve.mutate({ id: inv.id })}
                  >
                    {t("people.approve")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("people.noPending")}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("people.roles")}</h2>
        <ul className="space-y-2">
          {list.data?.people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              isOwner={isOwner}
              isSelf={person.id === me.data?.id}
              onSave={(roles) => assign.mutate({ userId: person.id, roles })}
              onDisable={() => disable.mutate({ userId: person.id })}
              onEnable={() => enable.mutate({ userId: person.id })}
            />
          ))}
        </ul>
      </section>

      <InviteForm ownerCanPickRoles={isOwner} onSent={refresh} />
    </div>
  );
};

const PersonRow = ({
  person,
  isOwner,
  isSelf,
  onSave,
  onDisable,
  onEnable,
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
  onDisable: () => void;
  onEnable: () => void;
}) => {
  const t = useT();
  const [roles, setRoles] = useState<RoleName[]>(person.roles);
  const toggle = (role: RoleName) =>
    setRoles((current) =>
      current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role]
    );
  const disabled = person.disabledAt !== null;

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{person.name}</p>
          <p className="text-muted-foreground text-sm">{person.email}</p>
        </div>
        <span
          className={`text-sm ${disabled ? "text-red-500" : "text-green-600"}`}
        >
          {disabled ? t("people.disabled") : t("people.active")}
        </span>
      </div>
      {isOwner ? (
        <div className="flex flex-wrap items-center gap-3">
          {ROLES.map((role) => (
            <label key={role} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => toggle(role)}
              />
              {t(roleKey(role))}
            </label>
          ))}
          <Button size="sm" variant="outline" onClick={() => onSave(roles)}>
            {t("people.saveRoles")}
          </Button>
          {isSelf ? null : (
            <AccessButton
              disabled={disabled}
              onDisable={onDisable}
              onEnable={onEnable}
            />
          )}
        </div>
      ) : (
        <p className="text-sm">
          {person.roles.map((r) => t(roleKey(r))).join(", ")}
        </p>
      )}
    </li>
  );
};

const AccessButton = ({
  disabled,
  onDisable,
  onEnable,
}: {
  disabled: boolean;
  onDisable: () => void;
  onEnable: () => void;
}) => {
  const t = useT();
  if (disabled) {
    return (
      <Button size="sm" variant="outline" onClick={onEnable}>
        {t("people.enable")}
      </Button>
    );
  }
  return (
    <Button size="sm" variant="destructive" onClick={onDisable}>
      {t("people.disable")}
    </Button>
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
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        invite.mutate({ name, email, roles });
      }}
    >
      <h2 className="font-medium">{t("people.invite")}</h2>
      <div className="space-y-1">
        <Label htmlFor="invite-name">{t("people.name")}</Label>
        <Input
          id="invite-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invite-email">{t("people.email")}</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      {ownerCanPickRoles ? (
        <div className="flex flex-wrap gap-3">
          {ROLES.map((role) => (
            <label key={role} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() =>
                  setRoles((current) =>
                    current.includes(role)
                      ? current.filter((r) => r !== role)
                      : [...current, role]
                  )
                }
              />
              {t(roleKey(role))}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("role.staff")}</p>
      )}
      <Button type="submit" disabled={invite.isPending || roles.length === 0}>
        {t("people.inviteSend")}
      </Button>
    </form>
  );
};

export const Route = createFileRoute("/_auth/admin/people")({
  component: PeoplePage,
});
