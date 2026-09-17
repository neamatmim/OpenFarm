import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, Page, PageHeader } from "@/components/page";
import { useLanguage, useT } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

type ShedPhone = Awaited<ReturnType<typeof orpc.devices.list.call>>[number];

/** Where a Shed Phone stands: waiting to be set up, in use, or revoked. */
const PhoneStatus = ({ phone }: { phone: ShedPhone }) => {
  const t = useT();
  if (phone.revokedAt) {
    return t("device.revoked");
  }
  return phone.claimedAt ? t("device.claimed") : t("device.unclaimed");
};

/** Revoking a phone, offered only while it has not been revoked. */
interface Revoking {
  onRevoke: (id: string) => void;
}

const RevokeButton = ({ phone, onRevoke }: Revoking & { phone: ShedPhone }) => {
  const t = useT();
  if (phone.revokedAt) {
    return null;
  }
  return (
    <Button onClick={() => onRevoke(phone.id)} size="sm" variant="destructive">
      {t("device.revoke")}
    </Button>
  );
};

/** One Shed Phone on a phone: its name, how it stands and when it was last used. */
const PhoneCard = ({ phone, onRevoke }: Revoking & { phone: ShedPhone }) => {
  const { t, language } = useLanguage();
  return (
    <li className="surface flex items-center justify-between p-4">
      <div>
        <p className="font-medium">{phone.name}</p>
        <p className="text-muted-foreground text-sm">
          <PhoneStatus phone={phone} />
          {phone.lastSeenAt
            ? ` · ${t("device.lastSeen", {
                when: formatDate(
                  new Date(phone.lastSeenAt),
                  language,
                  "dateTime"
                ),
              })}`
            : ""}
        </p>
      </div>
      <RevokeButton onRevoke={onRevoke} phone={phone} />
    </li>
  );
};

interface PhoneRow extends Revoking {
  id: string;
  phone: ShedPhone;
}

const NameCell = ({ row }: { row: { original: PhoneRow } }) => (
  <span className="font-medium">{row.original.phone.name}</span>
);

const StatusCell = ({ row }: { row: { original: PhoneRow } }) => (
  <PhoneStatus phone={row.original.phone} />
);

const LastUsedCell = ({ row }: { row: { original: PhoneRow } }) => {
  const { language } = useLanguage();
  const { lastSeenAt } = row.original.phone;
  return (
    <span className="text-muted-foreground whitespace-nowrap tabular-nums">
      {lastSeenAt
        ? formatDate(new Date(lastSeenAt), language, "dateTime")
        : "—"}
    </span>
  );
};

const RevokeCell = ({ row }: { row: { original: PhoneRow } }) => {
  const { onRevoke, phone } = row.original;
  return <RevokeButton onRevoke={onRevoke} phone={phone} />;
};

/** Sorted by status, phones waiting to be set up come first, then those in use, and revoked ones last. */
const statusOrder = (phone: ShedPhone): number => {
  if (phone.revokedAt) {
    return 2;
  }
  return phone.claimedAt ? 1 : 0;
};

const column = createListColumns<PhoneRow>();
const phoneColumns = column.columns([
  column.accessor((row) => row.phone.name, {
    id: "name",
    header: listHeader("device.name"),
    cell: NameCell,
  }),
  column.accessor((row) => statusOrder(row.phone), {
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
    id: "revoke",
    header: ActionsHeader,
    cell: RevokeCell,
    meta: { align: "end" },
  }),
]);

/** The farm's Shed Phones as a table where there is room: name, status and last use side by side. */
const PhoneTable = ({
  phones,
  onRevoke,
}: Revoking & { phones: ShedPhone[] }) => {
  const table = useListTable({
    columns: phoneColumns,
    data: phones.map((phone) => ({ id: phone.id, phone, onRevoke })),
    getRowId: (row) => row.id,
  });
  return (
    <div className="bg-card hidden rounded-xl border md:block">
      <DataTable bare minWidth="36rem" table={table} />
    </div>
  );
};

const DevicesPage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState<{ code: string; minutes: number } | null>(
    null
  );
  const phones = useQuery(orpc.devices.list.queryOptions());

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.devices.key() });
  const onError = (error: Error) => toast.error(sayWhy(error, t));

  const enrol = useMutation(
    orpc.devices.enrol.mutationOptions({
      onSuccess: (result) => {
        setCode({ code: result.code, minutes: result.expiresInMinutes });
        setName("");
        refresh();
      },
      onError,
    })
  );
  const revoke = useMutation(
    orpc.devices.revoke.mutationOptions({ onSuccess: refresh, onError })
  );
  const handleRevoke = (id: string) => revoke.mutate({ id });

  return (
    <Page width="default" className="max-w-4xl">
      <PageHeader title={t("device.title")} />

      <form
        className="surface flex items-end gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          enrol.mutate({ name });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="phone-name">{t("device.name")}</Label>
          <Input
            id="phone-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <Button type="submit" variant="outline">
          {t("device.add")}
        </Button>
      </form>

      {code ? (
        <div className="border-success/40 rounded-lg border-2 p-4 text-center">
          <p className="font-mono text-4xl font-bold tracking-widest">
            {code.code}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("device.codeHelp", { minutes: code.minutes })}
          </p>
        </div>
      ) : null}

      {phones.data?.length ? (
        <>
          <ul className="space-y-2 md:hidden">
            {phones.data.map((phone) => (
              <PhoneCard key={phone.id} onRevoke={handleRevoke} phone={phone} />
            ))}
          </ul>
          <PhoneTable onRevoke={handleRevoke} phones={phones.data} />
        </>
      ) : (
        <EmptyState icon={Smartphone} title={t("device.none")} />
      )}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/devices")({
  component: DevicesPage,
});
