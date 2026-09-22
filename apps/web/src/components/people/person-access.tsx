import type { RoleName } from "@OpenFarm/api/roles";
import { ROLES } from "@OpenFarm/api/roles";
import { formatDate, formatDayField, numberAsTyped } from "@OpenFarm/i18n";
import { Badge } from "@OpenFarm/ui/components/badge";
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
} from "@OpenFarm/ui/components/dialog";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarX,
  KeyRound,
  PencilLine,
  UserCheck,
  UserX,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { Section, StatusBadge } from "@/components/page";
import { FormDialog, FormField } from "@/components/page-kit";
import { RoleChoice, toggled } from "@/components/role-choice";
import { useLanguage, useT } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { reachesTheirAccess } from "@/lib/their-access";
import { orpc } from "@/utils/orpc";

import { OneTimeCode } from "./one-time-code";
import { RoleBadges } from "./people-table";

/** One thing about a person on their page: what it is, why it matters, how it stands now, and the button that changes
 *  it. */
const AccessRow = ({
  title,
  description,
  children,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) => (
  <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <h3 className="font-medium">{title}</h3>
      {description ? (
        <p className="text-muted-foreground text-sm">{description}</p>
      ) : null}
      {children ? <div className="mt-1.5">{children}</div> : null}
    </div>
    {action ? (
      <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
    ) : null}
  </div>
);

/** The button that opens a row's dialog. */
const ChangeButton = ({
  label,
  onClick,
  icon: Icon = PencilLine,
}: {
  label: ReactNode;
  onClick: () => void;
  icon?: typeof PencilLine;
}) => (
  <Button
    className="w-full sm:w-auto"
    onClick={onClick}
    type="button"
    variant="outline"
  >
    <Icon aria-hidden data-icon="inline-start" />
    {label}
  </Button>
);

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

/** The visit's last farm day: it runs to the close of that day, not the midnight it ends at. */
const lastDayOf = (until: Date) => new Date(new Date(until).getTime() - 60_000);

/** A later last day for a visit, set by the Owner in a dialog. */
const VisitDialog = ({
  userId,
  until,
  open,
  onOpenChange,
}: {
  userId: string;
  until: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const { said, onError } = useSaying();
  const lastDay = formatDayField(lastDayOf(until));
  const [day, setDay] = useState(lastDay);
  const saySaved = said(t("visit.changed"));
  const extend = useMutation(
    orpc.vetCases.setVisitUntil.mutationOptions({
      onSuccess: async () => {
        onOpenChange(false);
        await saySaved();
      },
      onError,
    })
  );
  return (
    <FormDialog
      description={t("visit.until", {
        date: formatDate(lastDayOf(until), language, "date"),
      })}
      onOpenChange={onOpenChange}
      onSubmit={() => extend.mutate({ userId, visitUntil: day })}
      open={open}
      pending={extend.isPending}
      ready={day !== "" && day !== lastDay}
      submitLabel={t("visit.change")}
      title={t("visit.lastDay")}
    >
      <FormField id="visit-last-day" label={t("visit.lastDay")}>
        <Input
          id="visit-last-day"
          onChange={(event) => setDay(event.target.value)}
          type="date"
          value={day}
        />
      </FormField>
    </FormDialog>
  );
};

/** A visiting Vet's visit: when it ends, a later day from the Owner, or an end today from either who runs the farm. */
const VisitRow = ({
  userId,
  until,
  isOwner,
}: {
  userId: string;
  until: Date;
  isOwner: boolean;
}) => {
  const { t, language } = useLanguage();
  const { said, onError } = useSaying();
  const [changing, setChanging] = useState(false);
  const end = useMutation(
    orpc.vetCases.endVisit.mutationOptions({
      onSuccess: said(t("visit.ended")),
      onError,
    })
  );
  return (
    <AccessRow
      action={
        <>
          {isOwner ? (
            <ChangeButton
              icon={CalendarClock}
              label={t("visit.change")}
              onClick={() => setChanging(true)}
            />
          ) : null}
          <Button
            className="w-full sm:w-auto"
            disabled={end.isPending}
            onClick={() => end.mutate({ userId })}
            type="button"
            variant="outline"
          >
            {end.isPending ? (
              <Spinner />
            ) : (
              <CalendarX aria-hidden data-icon="inline-start" />
            )}
            {t("visit.end")}
          </Button>
          {isOwner ? (
            <VisitDialog
              key={String(changing)}
              onOpenChange={setChanging}
              open={changing}
              until={until}
              userId={userId}
            />
          ) : null}
        </>
      }
      title={t("visit.lastDay")}
    >
      <StatusBadge icon={CalendarClock} tone="warning">
        {t("visit.until", {
          date: formatDate(lastDayOf(until), language, "date"),
        })}
      </StatusBadge>
    </AccessRow>
  );
};

/** The Roles they hold, chosen in a dialog; the Owner's to set. */
const RolesDialog = ({
  userId,
  roles,
  open,
  onOpenChange,
}: {
  userId: string;
  roles: RoleName[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const t = useT();
  const { said, onError } = useSaying();
  const [held, setHeld] = useState<RoleName[]>(roles);
  const saySaved = said(t("people.rolesSaved"));
  const assign = useMutation(
    orpc.people.assignRoles.mutationOptions({
      onSuccess: async () => {
        onOpenChange(false);
        await saySaved();
      },
      onError,
    })
  );
  return (
    <FormDialog
      description={t("people.rolesWhy")}
      onOpenChange={onOpenChange}
      onSubmit={() => assign.mutate({ userId, roles: held })}
      open={open}
      pending={assign.isPending}
      ready={held.length > 0}
      submitLabel={t("people.saveRoles")}
      title={t("people.roles")}
    >
      <fieldset className="grid grid-cols-2 gap-x-5">
        <legend className="sr-only">{t("people.roles")}</legend>
        {ROLES.map((role) => (
          <RoleChoice
            checked={held.includes(role)}
            key={role}
            onToggle={() => setHeld((current) => toggled(current, role))}
            role={role}
          />
        ))}
      </fieldset>
    </FormDialog>
  );
};

const RolesRow = ({ userId, roles }: { userId: string; roles: RoleName[] }) => {
  const t = useT();
  const [changing, setChanging] = useState(false);
  return (
    <AccessRow
      action={
        <>
          <ChangeButton
            label={t("people.change")}
            onClick={() => setChanging(true)}
          />
          <RolesDialog
            key={`${String(changing)}:${roles.join(",")}`}
            onOpenChange={setChanging}
            open={changing}
            roles={roles}
            userId={userId}
          />
        </>
      }
      description={t("people.rolesWhy")}
      title={t("people.roles")}
    >
      <RoleBadges roles={roles} />
    </AccessRow>
  );
};

interface PenChoice {
  id: string;
  name: string;
  shed: string;
}

/** The farm's Pens as the page names them: each with the shed it is in. */
const usePens = (): PenChoice[] => {
  const sheds = useQuery(orpc.herd.list.queryOptions());
  return (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((pen) => ({ id: pen.id, name: pen.name, shed: shed.name }))
  );
};

/** One Pen that may be ticked. */
const PenChoiceBox = ({
  pen,
  checked,
  onToggle,
}: {
  pen: PenChoice;
  checked: boolean;
  onToggle: (id: string) => void;
}) => (
  <Label className="flex min-h-11 cursor-pointer items-center gap-2 font-normal md:min-h-8">
    <Checkbox checked={checked} onCheckedChange={() => onToggle(pen.id)} />
    {pen.name}
  </Label>
);

/** The Pens whose work is this person's, grouped by shed, in a dialog; saved as what was added and what was taken
 *  away. */
const PensDialog = ({
  userId,
  held,
  pens,
  open,
  onOpenChange,
}: {
  userId: string;
  held: string[];
  pens: PenChoice[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const t = useT();
  const { said, onError } = useSaying();
  const [chosen, setChosen] = useState(() => new Set(held));
  const add = [...chosen].filter((id) => !held.includes(id));
  const remove = held.filter((id) => !chosen.has(id));
  const sheds = [...new Set(pens.map((pen) => pen.shed))];
  const saySaved = said(t("people.pensSaved"));
  const assignPens = useMutation(
    orpc.people.assignPens.mutationOptions({
      onSuccess: async () => {
        onOpenChange(false);
        await saySaved();
      },
      onError,
    })
  );
  const handleToggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  return (
    <FormDialog
      className="sm:max-w-lg"
      description={t("people.pensWhy")}
      onOpenChange={onOpenChange}
      onSubmit={() => assignPens.mutate({ userId, add, remove })}
      open={open}
      pending={assignPens.isPending}
      ready={add.length > 0 || remove.length > 0}
      submitLabel={t("people.pensSave")}
      title={t("people.pens")}
    >
      <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
        {sheds.map((shed) => (
          <fieldset className="flex flex-col gap-1" key={shed}>
            <legend className="text-muted-foreground mb-1 text-sm font-medium">
              {shed}
            </legend>
            <div className="grid gap-x-5 sm:grid-cols-2">
              {pens
                .filter((pen) => pen.shed === shed)
                .map((pen) => (
                  <PenChoiceBox
                    checked={chosen.has(pen.id)}
                    key={pen.id}
                    onToggle={handleToggle}
                    pen={pen}
                  />
                ))}
            </div>
          </fieldset>
        ))}
      </div>
    </FormDialog>
  );
};

/** The Pens whose work is theirs. A visiting Vet works Cases, not Pens, and has none of this. */
const PensRow = ({ userId, held }: { userId: string; held: string[] }) => {
  const t = useT();
  const pens = usePens();
  const [changing, setChanging] = useState(false);
  const theirs = pens.filter((pen) => held.includes(pen.id));
  return (
    <AccessRow
      action={
        <>
          <ChangeButton
            label={t("people.change")}
            onClick={() => setChanging(true)}
          />
          <PensDialog
            held={held}
            key={`${String(changing)}:${held.join(",")}`}
            onOpenChange={setChanging}
            open={changing}
            pens={pens}
            userId={userId}
          />
        </>
      }
      description={t("people.pensWhy")}
      title={t("people.pens")}
    >
      {held.length === 0 ? (
        <StatusBadge tone="warning">{t("people.pensNone")}</StatusBadge>
      ) : (
        <span className="flex flex-wrap gap-1">
          {theirs.map((pen) => (
            <Badge key={pen.id} variant="outline">
              {pen.name}
            </Badge>
          ))}
        </span>
      )}
    </AccessRow>
  );
};

/** The four digits they PIN Switch on a Shed Phone with, typed in a dialog. Never read back: the farm keeps a salt and
 *  a hash. */
const PinDialog = ({
  userId,
  open,
  onOpenChange,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const t = useT();
  const { said, onError } = useSaying();
  const [pin, setPin] = useState("");
  const saySet = said(t("people.pinSet"));
  const setThePin = useMutation(
    orpc.people.setPin.mutationOptions({
      onSuccess: async () => {
        // Cleared only once the farm has it: a PIN that failed to save stays where it can be sent again.
        setPin("");
        onOpenChange(false);
        await saySet();
      },
      onError,
    })
  );
  return (
    <FormDialog
      description={t("people.pinWhy")}
      onOpenChange={onOpenChange}
      onSubmit={() => setThePin.mutate({ userId, pin })}
      open={open}
      pending={setThePin.isPending}
      ready={pin.length === 4}
      submitLabel={t("people.setPin")}
      title={t("people.setPin")}
    >
      <FormField
        hint={t("people.pinHelp")}
        id="their-pin"
        label={t("people.pin")}
      >
        <Input
          autoComplete="off"
          className="w-40 font-mono text-lg tracking-[0.4em]"
          id="their-pin"
          inputMode="numeric"
          maxLength={4}
          onChange={(event) =>
            setPin(
              numberAsTyped(event.target.value)
                .replaceAll(/\D/gu, "")
                .slice(0, 4)
            )
          }
          value={pin}
        />
      </FormField>
    </FormDialog>
  );
};

const PinRow = ({ userId }: { userId: string }) => {
  const t = useT();
  const [setting, setSetting] = useState(false);
  return (
    <AccessRow
      action={
        <>
          <ChangeButton
            icon={KeyRound}
            label={t("people.setPin")}
            onClick={() => setSetting(true)}
          />
          <PinDialog
            key={String(setting)}
            onOpenChange={setSetting}
            open={setting}
            userId={userId}
          />
        </>
      }
      description={t("people.pinWhy")}
      title={t("people.pin")}
    />
  );
};

/** A code for somebody who has forgotten their password, shown once. The farm never sets a password for
 *  anybody: one somebody else has seen is one that signs work in their name. */
const PasswordRow = ({ userId, name }: { userId: string; name: string }) => {
  const t = useT();
  const [code, setCode] = useState<string | null>(null);
  const issue = useMutation(
    orpc.people.newPasswordCode.mutationOptions({
      onSuccess: (given) => setCode(given.code),
      onError: (error: Error) => toast.error(sayWhy(error, t)),
    })
  );
  return (
    <AccessRow
      action={
        <>
          <Button
            className="w-full sm:w-auto"
            disabled={issue.isPending}
            onClick={() => issue.mutate({ userId })}
            type="button"
            variant="outline"
          >
            {issue.isPending ? (
              <Spinner />
            ) : (
              <KeyRound aria-hidden data-icon="inline-start" />
            )}
            {t("people.newPasswordCode")}
          </Button>
          <OneTimeCode
            code={code}
            description={t("people.passwordCodeWhy")}
            onDone={() => setCode(null)}
            title={t("people.handOverTitle", { name })}
          />
        </>
      }
      description={t("people.passwordCodeWhy")}
      title={t("people.passwordCode")}
    />
  );
};

/** Removing access names the person first: a phone signed out mid-shift is not undone by pressing the button again. */
const RemoveAccessDialog = ({
  name,
  open,
  onOpenChange,
  onRemove,
}: {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
}) => {
  const t = useT();
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
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
              onOpenChange(false);
              onRemove();
            }}
            variant="destructive"
          >
            <UserX aria-hidden data-icon="inline-start" />
            {t("people.disable")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Ending somebody's Membership, and bringing them back, set apart at the foot of their page. Restoring is one press;
 *  removing asks first. Not their own to end. */
const MembershipSection = ({
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
  const [asking, setAsking] = useState(false);
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
  const saving = disable.isPending || enable.isPending;
  return (
    <Section
      action={
        gone ? (
          <Button
            className="w-full sm:w-auto"
            disabled={saving}
            onClick={() => enable.mutate({ userId })}
            type="button"
            variant="outline"
          >
            {saving ? (
              <Spinner />
            ) : (
              <UserCheck aria-hidden data-icon="inline-start" />
            )}
            {t("people.enable")}
          </Button>
        ) : (
          <Button
            className="w-full sm:w-auto"
            disabled={saving}
            onClick={() => setAsking(true)}
            type="button"
            variant="destructive"
          >
            {saving ? (
              <Spinner />
            ) : (
              <UserX aria-hidden data-icon="inline-start" />
            )}
            {t("people.disable")}
          </Button>
        )
      }
      className={cn(!gone && "border-danger/30")}
      description={gone ? t("people.enableWhy") : t("people.disableWhy")}
      title={gone ? t("people.enable") : t("people.disable")}
    >
      <RemoveAccessDialog
        name={name}
        onOpenChange={setAsking}
        onRemove={() => disable.mutate({ userId })}
        open={asking}
      />
    </Section>
  );
};

/** What a person may do and where, a row for each with the button that changes it; ending their access set apart
 *  beneath. Each row is shown to whoever may change it, as the farm allows. */
export const AccessTab = ({
  userId,
  name,
  roles,
  penIds,
  visitUntil,
  gone,
  isOwner,
  isSelf,
}: {
  userId: string;
  name: string;
  roles: RoleName[];
  penIds: string[];
  visitUntil: Date | null;
  gone: boolean;
  isOwner: boolean;
  isSelf: boolean;
}) => (
  <div className="flex flex-col gap-6">
    <Section>
      <div className="divide-border flex flex-col divide-y">
        {visitUntil && !gone ? (
          <VisitRow isOwner={isOwner} until={visitUntil} userId={userId} />
        ) : null}
        {isOwner ? <RolesRow roles={roles} userId={userId} /> : null}
        {gone || visitUntil ? null : <PensRow held={penIds} userId={userId} />}
        {/* A PIN and a password code are both ways in, shown only to whoever may give them. */}
        {reachesTheirAccess(isOwner, roles) ? (
          <>
            <PinRow userId={userId} />
            <PasswordRow name={name} userId={userId} />
          </>
        ) : null}
      </div>
    </Section>
    {/* Taking somebody's access away, or giving it back, is the Owner's alone. */}
    {isSelf || !isOwner ? null : (
      <MembershipSection gone={gone} name={name} userId={userId} />
    )}
  </div>
);
