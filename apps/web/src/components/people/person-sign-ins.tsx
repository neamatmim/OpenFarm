import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpenCheck, LogOut, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import {
  EmptyState,
  Loaded,
  RecordList,
  RecordRow,
  Section,
} from "@/components/page";
import { useLanguage, useT } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

type SignIn = Awaited<ReturnType<typeof orpc.people.signedInOn.call>>[number];

const PHONE = /Android|iPhone|iPad|Mobile/u;

/** The browsers and systems a farm's people sign in from, as their makers name them, checked in this order: Edge and
 *  Opera say "Chrome" too, and Chrome says "Safari". */
const BROWSERS = [
  ["Edg/", "Edge"],
  ["OPR/", "Opera"],
  ["SamsungBrowser/", "Samsung Internet"],
  ["Firefox/", "Firefox"],
  ["Chrome/", "Chrome"],
  ["Safari/", "Safari"],
] as const;

const SYSTEMS = [
  ["Android", "Android"],
  ["iPhone", "iPhone"],
  ["iPad", "iPad"],
  ["Windows", "Windows"],
  ["Mac OS X", "Mac"],
  ["Linux", "Linux"],
] as const;

/** A browser's long self-description made readable — "Chrome · Mac" — or nothing when it is not one the farm knows. */
const deviceOf = (agent: string | null): string | null => {
  if (!agent) {
    return null;
  }
  const browser = BROWSERS.find(([mark]) => agent.includes(mark))?.[1];
  const system = SYSTEMS.find(([mark]) => agent.includes(mark))?.[1];
  const named = [browser, system].filter(Boolean).join(" · ");
  return named || null;
};

/** What turning out one of their sign-ins needs from the page. */
interface SigningOut {
  userId: string;
  pending: boolean;
  handleSignOut: (sessionId: string) => void;
}

interface SignInRow extends SignIn {
  signingOut: SigningOut;
}

const DeviceName = ({ row }: { row: SignIn }) => {
  const t = useT();
  const Icon = row.browser && PHONE.test(row.browser) ? Smartphone : Monitor;
  return (
    <span className="flex min-w-0 items-start gap-2">
      <Icon
        aria-hidden
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">
          {deviceOf(row.browser) ?? t("people.unknownDevice")}
        </span>
        {row.browser ? (
          <span
            className="text-muted-foreground line-clamp-1 text-xs break-all"
            title={row.browser}
          >
            {row.browser}
          </span>
        ) : null}
      </span>
    </span>
  );
};

const When = ({ at }: { at: Date }) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatDate(new Date(at), language, "dateTime")}
    </span>
  );
};

const SignOutButton = ({ row }: { row: SignInRow }) => {
  const t = useT();
  const { handleSignOut, pending } = row.signingOut;
  return (
    <Button
      disabled={pending}
      onClick={() => handleSignOut(row.id)}
      size="sm"
      type="button"
      variant="outline"
    >
      <LogOut aria-hidden data-icon="inline-start" />
      {t("people.signOut")}
    </Button>
  );
};

const DeviceCell = ({ row }: { row: { original: SignInRow } }) => (
  <DeviceName row={row.original} />
);

const SinceCell = ({ row }: { row: { original: SignInRow } }) => (
  <When at={row.original.since} />
);

const LastSeenCell = ({ row }: { row: { original: SignInRow } }) => (
  <When at={row.original.lastSeen} />
);

const FromCell = ({ row }: { row: { original: SignInRow } }) => (
  <span className="text-muted-foreground tabular-nums">
    {row.original.from ?? "—"}
  </span>
);

const SignOutCell = ({ row }: { row: { original: SignInRow } }) => (
  <SignOutButton row={row.original} />
);

const column = createListColumns<SignInRow>();
const signInColumns = column.columns([
  column.accessor((row) => deviceOf(row.browser) ?? undefined, {
    id: "device",
    header: listHeader("people.col.device"),
    cell: DeviceCell,
    meta: { className: "max-w-80" },
  }),
  column.accessor((row) => new Date(row.lastSeen).getTime(), {
    id: "lastSeen",
    header: listHeader("people.col.lastSeen"),
    cell: LastSeenCell,
  }),
  column.accessor((row) => new Date(row.since).getTime(), {
    id: "since",
    header: listHeader("people.col.since"),
    cell: SinceCell,
  }),
  column.accessor((row) => row.from ?? undefined, {
    id: "from",
    header: listHeader("people.col.from"),
    cell: FromCell,
  }),
  column.display({
    id: "signOut",
    header: ActionsHeader,
    cell: SignOutCell,
    meta: { align: "end" },
  }),
]);

/** One place they are signed in, on a phone: the device, when it was last used and since when, and the way out. */
const SignInCard = ({ row }: { row: SignInRow }) => {
  const t = useT();
  const { language } = useLanguage();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <DeviceName row={row} />
        <span className="text-muted-foreground ps-6 text-xs">
          {t("people.signedInSince", {
            date: formatDate(new Date(row.since), language, "dateTime"),
            seen: formatDate(new Date(row.lastSeen), language, "dateTime"),
          })}
          {row.from ? ` · ${row.from}` : ""}
        </span>
      </div>
      <SignOutButton row={row} />
    </div>
  );
};

const signInCard = (row: SignInRow) => <SignInCard row={row} />;

const SignInTable = ({
  rows,
  signingOut,
}: {
  rows: SignIn[];
  signingOut: SigningOut;
}) => {
  const table = useListTable({
    columns: signInColumns,
    data: rows.map((row) => ({ ...row, signingOut })),
    getRowId: (row) => row.id,
  });
  return (
    <DataTable card={signInCard} minWidth="52rem" pageSize={20} table={table} />
  );
};

/** Where they are signed in as themselves, and the way to turn one of them out — a phone left in a yard, a
 *  browser in a shop. Not Shed Phones, which the farm enrols and revokes as devices. */
export const SignInsTab = ({ userId }: { userId: string }) => {
  const t = useT();
  const refused = useRefused();
  const where = useQuery(
    orpc.people.signedInOn.queryOptions({ input: { userId } })
  );
  const signOut = useMutation(
    orpc.people.signOut.mutationOptions({
      onSuccess: () => {
        toast.success(t("people.signedOut"));
      },
      onError: refused,
    })
  );
  return (
    <Section
      description={t("people.signInsWhy")}
      title={t("people.signedInOn")}
    >
      <Loaded query={where}>
        {where.data?.length ? (
          <SignInTable
            rows={where.data}
            signingOut={{
              userId,
              pending: signOut.isPending,
              handleSignOut: (sessionId) =>
                signOut.mutate({ userId, sessionId }),
            }}
          />
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

/** What this person has been taught, newest first. Not a tick beside their name: a Version
 *  published this morning does not untrain anybody, and what they knew in March stays true. */
export const TrainingTab = ({
  training,
}: {
  training: {
    id: string;
    /** The procedure taught, whose card its name opens. */
    definitionId: string;
    sopName: { bn: string };
    versionNumber: number;
    trainedAt: Date;
  }[];
}) => {
  const { t, language } = useLanguage();
  return (
    <Section title={t("people.tab.training")}>
      {training.length === 0 ? (
        <EmptyState
          bare
          icon={BookOpenCheck}
          title={t("people.trainingNone")}
        />
      ) : (
        <RecordList>
          {training.map((row) => (
            <RecordRow
              key={row.id}
              leading={
                <span className="bg-success-surface text-success grid size-9 place-items-center rounded-lg">
                  <BookOpenCheck aria-hidden className="size-4" />
                </span>
              }
              meta={t("training.on", {
                number: row.versionNumber,
                date: formatDate(new Date(row.trainedAt), language, "date"),
              })}
              title={
                <Link
                  className="hover:underline"
                  params={{ definitionId: row.definitionId }}
                  to="/cards/$definitionId"
                >
                  {row.sopName.bn}
                </Link>
              }
            />
          ))}
        </RecordList>
      )}
    </Section>
  );
};
