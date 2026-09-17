import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Ban, Clock, Hourglass, Smartphone, Wifi } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import type { Tone } from "@/components/page";
import { StatusBadge } from "@/components/page";
import { RowMenu } from "@/components/page-kit";
import { useLanguage, useT } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

export type ShedPhone = Awaited<
  ReturnType<typeof orpc.devices.list.call>
>[number];

/** Where a Shed Phone stands: waiting to be set up, its code run out before it was, in use, or revoked. */
type PhoneStanding = "unclaimed" | "expired" | "claimed" | "revoked";

const standingOf = (phone: ShedPhone): PhoneStanding => {
  if (phone.revokedAt) {
    return "revoked";
  }
  if (phone.claimedAt) {
    return "claimed";
  }
  const expiresAt = phone.enrolmentExpiresAt
    ? new Date(phone.enrolmentExpiresAt).getTime()
    : null;
  return expiresAt !== null && expiresAt < Date.now() ? "expired" : "unclaimed";
};

const STANDING = {
  unclaimed: { word: "device.unclaimed", tone: "info", icon: Hourglass },
  expired: { word: "device.expired", tone: "warning", icon: Clock },
  claimed: { word: "device.claimed", tone: "success", icon: Wifi },
  revoked: { word: "device.revoked", tone: "neutral", icon: Ban },
} as const satisfies Record<
  PhoneStanding,
  { word: string; tone: Tone; icon: typeof Ban }
>;

/** Sorted by status, phones waiting to be set up come first, then those in use, and revoked ones last. */
const STANDING_ORDER: Record<PhoneStanding, number> = {
  unclaimed: 0,
  expired: 1,
  claimed: 2,
  revoked: 3,
};

/** A Shed Phone's standing, as a word with its colour and icon. */
const PhoneStatus = ({ phone }: { phone: ShedPhone }) => {
  const t = useT();
  const { word, tone, icon } = STANDING[standingOf(phone)];
  return (
    <StatusBadge icon={icon} tone={tone}>
      {t(word)}
    </StatusBadge>
  );
};

/** Revoking a phone, offered only while it has not been revoked. */
interface Revoking {
  handleRevoke: (phone: ShedPhone) => void;
}

interface PhoneRow extends Revoking {
  id: string;
  phone: ShedPhone;
}

/** The menu at the end of a phone's row: revoking it, while it still works. */
const PhoneRowMenu = ({
  phone,
  onRevoke,
}: {
  phone: ShedPhone;
  onRevoke: (phone: ShedPhone) => void;
}) => {
  const t = useT();
  if (phone.revokedAt) {
    return null;
  }
  return (
    <RowMenu
      actions={[
        {
          label: t("device.revoke"),
          icon: Ban,
          destructive: true,
          handleSelect: () => onRevoke(phone),
        },
      ]}
      label={t("device.rowActions", { name: phone.name })}
    />
  );
};

/** When a phone was last used, or a dash for one never used. */
const LastUsed = ({ at }: { at: Date | null }) => {
  const { language } = useLanguage();
  return (
    <span className="text-muted-foreground whitespace-nowrap tabular-nums">
      {at ? formatDate(new Date(at), language, "dateTime") : "—"}
    </span>
  );
};

const NameCell = ({ row }: { row: { original: PhoneRow } }) => (
  <span className="flex items-center gap-2 font-medium">
    <Smartphone aria-hidden className="text-muted-foreground size-4" />
    {row.original.phone.name}
  </span>
);

const StatusCell = ({ row }: { row: { original: PhoneRow } }) => (
  <PhoneStatus phone={row.original.phone} />
);

const LastUsedCell = ({ row }: { row: { original: PhoneRow } }) => (
  <LastUsed at={row.original.phone.lastSeenAt} />
);

const MenuCell = ({ row }: { row: { original: PhoneRow } }) => (
  <div className="flex justify-end">
    <PhoneRowMenu
      onRevoke={row.original.handleRevoke}
      phone={row.original.phone}
    />
  </div>
);

const column = createListColumns<PhoneRow>();
const phoneColumns = column.columns([
  column.accessor((row) => row.phone.name, {
    id: "name",
    header: listHeader("device.name"),
    cell: NameCell,
  }),
  column.accessor((row) => STANDING_ORDER[standingOf(row.phone)], {
    id: "status",
    header: listHeader("people.status"),
    cell: StatusCell,
  }),
  column.accessor(
    (row) =>
      row.phone.lastSeenAt ? new Date(row.phone.lastSeenAt).getTime() : 0,
    {
      id: "lastUsed",
      header: listHeader("device.col.lastUsed"),
      cell: LastUsedCell,
    }
  ),
  column.display({
    id: "menu",
    header: ActionsHeader,
    cell: MenuCell,
    meta: { align: "end", className: "w-12" },
  }),
]);

/** One Shed Phone on a phone: its name and standing on one line, when it was last used beneath. */
const PhoneCard = ({ row }: { row: PhoneRow }) => {
  const { t, language } = useLanguage();
  const { phone } = row;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{phone.name}</span>
          <PhoneStatus phone={phone} />
        </div>
        {phone.lastSeenAt ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {t("device.lastSeen", {
              when: formatDate(
                new Date(phone.lastSeenAt),
                language,
                "dateTime"
              ),
            })}
          </span>
        ) : null}
      </div>
      <PhoneRowMenu onRevoke={row.handleRevoke} phone={phone} />
    </div>
  );
};

const phoneCard = (row: PhoneRow) => <PhoneCard row={row} />;

/** Revoking names the phone first: a phone revoked in a shed is dead until it is enrolled afresh. */
const RevokeDialog = ({
  phone,
  onOpenChange,
  onRevoke,
}: {
  phone: ShedPhone | null;
  onOpenChange: (open: boolean) => void;
  onRevoke: (phone: ShedPhone) => void;
}) => {
  const t = useT();
  return (
    <Dialog onOpenChange={onOpenChange} open={phone !== null}>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>
            {t("device.revokeTitle", { name: phone?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("device.revokeWhy")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {t("common.cancel")}
          </DialogClose>
          <Button
            onClick={() => {
              if (phone) {
                onRevoke(phone);
              }
              onOpenChange(false);
            }}
            variant="destructive"
          >
            <Ban aria-hidden data-icon="inline-start" />
            {t("device.revoke")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** The farm's Shed Phones as a table where there is room — name, status and last use — and as cards on a phone. Each
 *  row's menu revokes it, after asking. */
export const PhoneTable = ({
  phones,
  onRevoke,
}: {
  phones: ShedPhone[];
  onRevoke: (phone: ShedPhone) => void;
}) => {
  const [asking, setAsking] = useState<ShedPhone | null>(null);
  const table = useListTable({
    columns: phoneColumns,
    data: phones.map((phone) => ({
      id: phone.id,
      phone,
      handleRevoke: setAsking,
    })),
    getRowId: (row) => row.id,
  });
  return (
    <>
      <DataTable card={phoneCard} minWidth="36rem" table={table} />
      <RevokeDialog
        onOpenChange={(open) => {
          if (!open) {
            setAsking(null);
          }
        }}
        onRevoke={onRevoke}
        phone={asking}
      />
    </>
  );
};
