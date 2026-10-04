import type { RoleName } from "@OpenFarm/domain";
import { ROLES } from "@OpenFarm/domain";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { StatusBadge } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { RoleChoice, roleKey, toggled } from "@/components/role-choice";
import { useT } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** Who was invited, and the code to hand them. */
export interface HandOver {
  name: string;
  email: string;
  code: string;
}

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
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("people.roles")}</span>
        <StatusBadge tone="neutral">{t(roleKey("staff"))}</StatusBadge>
      </div>
    );
  }
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium">{t("people.roles")}</legend>
      <div className="grid grid-cols-2 gap-x-5">
        {ROLES.map((role) => (
          <RoleChoice
            checked={roles.includes(role)}
            key={role}
            onToggle={() => onToggle(role)}
            role={role}
          />
        ))}
      </div>
    </fieldset>
  );
};

/** Whether the person works only on the shed phones, by PIN, with no email or login of their own (ADR 0003). */
const ShedPhoneOnlyChoice = ({
  shedPhoneOnly,
  onShedPhoneOnly,
}: {
  shedPhoneOnly: boolean;
  onShedPhoneOnly: (shedPhoneOnly: boolean) => void;
}) => {
  const t = useT();
  return (
    <div className="bg-muted/40 flex flex-col gap-1 rounded-lg border p-3">
      <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium md:min-h-8">
        <Checkbox
          checked={shedPhoneOnly}
          onCheckedChange={(checked) => onShedPhoneOnly(Boolean(checked))}
        />
        {t("people.shedPhoneOnly")}
      </label>
      <p className="text-muted-foreground text-sm">
        {t("people.shedPhoneOnlyHint")}
      </p>
    </div>
  );
};

/** Adding somebody who works only on the shed phones: by name alone, told whether the Owner still has to approve. */
const useAddForShedPhones = (done: () => void) => {
  const t = useT();
  const refused = useRefused();
  return useMutation(
    orpc.people.addForShedPhones.mutationOptions({
      onSuccess: ({ status }) => {
        toast.success(
          t(
            status === "approved"
              ? "people.shedPhoneOnlyAdded"
              : "people.shedPhoneOnlyWaiting"
          )
        );
        done();
      },
      onError: refused,
    })
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
    <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-3">
      <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium md:min-h-8">
        <Checkbox
          checked={visiting}
          onCheckedChange={(checked) => onVisiting(Boolean(checked))}
        />
        {t("visit.invite")}
      </label>
      {visiting ? (
        <FormField
          hint={t("visit.inviteHint")}
          id="invite-visit-until"
          label={t("visit.lastDay")}
        >
          <Input
            className="sm:w-44"
            id="invite-visit-until"
            onChange={(event) => onUntil(event.target.value)}
            required
            type="date"
            value={until}
          />
        </FormField>
      ) : null}
    </div>
  );
};

/**
 * Inviting somebody to the farm, in a sheet beside the list: their name and email, and what they will do — Roles the
 * Owner picks, Barn Staff from a Manager, or a vet called in until a day. The code to hand them comes back once, and the
 * page shows it the moment the sheet closes. Or Barn Staff with no email, added by name to work only on the shed phones:
 * no code, since they have no login.
 */
export const InviteSheet = ({
  open,
  onOpenChange,
  ownerCanPickRoles,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerCanPickRoles: boolean;
  onSent: (handOver: HandOver) => void;
}) => {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<RoleName[]>(["staff"]);
  // A vet called in for a visit: invited as a Vet, until a day.
  const [visiting, setVisiting] = useState(false);
  const [visitUntil, setVisitUntil] = useState("");
  // Somebody with no email of their own, added to work only on the shed phones.
  const [shedPhoneOnly, setShedPhoneOnly] = useState(false);
  const refused = useRefused();
  const addForShedPhones = useAddForShedPhones(() => {
    setName("");
    setShedPhoneOnly(false);
    onOpenChange(false);
  });
  const invite = useMutation(
    orpc.people.invite.mutationOptions({
      onSuccess: ({ code }) => {
        toast.success(t("people.inviteSent"));
        onSent({ name, email, code });
        setName("");
        setEmail("");
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  const invitedReady =
    email.includes("@") && (visiting ? visitUntil !== "" : roles.length > 0);
  const ready = name.trim() !== "" && (shedPhoneOnly || invitedReady);
  const handleSubmit = () => {
    if (shedPhoneOnly) {
      addForShedPhones.mutate({ name });
      return;
    }
    invite.mutate(
      visiting
        ? { name, email, roles: ["vet"], visitUntil }
        : { name, email, roles }
    );
  };

  return (
    <FormSheet
      wide
      description={t("people.inviteWhy")}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      open={open}
      pending={invite.isPending || addForShedPhones.isPending}
      ready={ready}
      submitLabel={
        shedPhoneOnly ? t("people.shedPhoneOnlyAdd") : t("people.inviteSend")
      }
      title={t("people.invite")}
    >
      <FormField id="invite-name" label={t("people.name")}>
        <Input
          autoComplete="off"
          id="invite-name"
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </FormField>
      <ShedPhoneOnlyChoice
        onShedPhoneOnly={setShedPhoneOnly}
        shedPhoneOnly={shedPhoneOnly}
      />
      {shedPhoneOnly ? (
        <InviteRoles
          onToggle={() => null}
          ownerCanPickRoles={false}
          roles={["staff"]}
        />
      ) : (
        <>
          <FormField id="invite-email" label={t("people.email")}>
            <Input
              autoComplete="off"
              id="invite-email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </FormField>
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
        </>
      )}
    </FormSheet>
  );
};
