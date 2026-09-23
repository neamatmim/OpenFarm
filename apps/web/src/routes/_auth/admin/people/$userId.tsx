import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BookOpenCheck,
  ChevronLeft,
  MonitorSmartphone,
  ShieldCheck,
  UserX,
} from "lucide-react";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { Loaded, Page, PageHeader, StatusBadge } from "@/components/page";
import { PageTabs } from "@/components/page-kit";
import { RoleBadges } from "@/components/people/people-table";
import { AccessTab } from "@/components/people/person-access";
import { SignInsTab, TrainingTab } from "@/components/people/person-sign-ins";
import { useT } from "@/i18n/language-provider";
import { words } from "@/lib/correcting";
import { reachesTheirAccess } from "@/lib/their-access";
import { orpc } from "@/utils/orpc";

const TABS = ["access", "signIns", "training"] as const;
type Tab = (typeof TABS)[number];

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

/**
 * One person of the farm, by what somebody came to them for: what they may do and where — Roles, Pens, their PIN, a
 * forgotten password, and their access itself — where they are signed in, and what they have been taught. Who they are
 * and how they stand heads every tab. The tab is kept in the address, so the page comes back as it was left.
 */
const PersonPage = () => {
  const { userId } = Route.useParams();
  const { tab = "access" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const t = useT();
  const me = useQuery(orpc.people.me.queryOptions());
  const person = useQuery(orpc.people.get.queryOptions({ input: { userId } }));
  const isOwner = me.data?.roles.includes("owner") ?? false;
  const isSelf = me.data?.id === userId;
  const them = person.data;
  const gone = Boolean(them?.disabledAt);
  const seesSignIns = reachesTheirAccess(isOwner, them?.roles ?? []);

  return (
    <Page>
      <Link
        className="text-muted-foreground hover:text-foreground -mb-4 flex min-h-11 w-fit items-center gap-1 text-sm md:-mb-6"
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
              meta={
                <>
                  <span className="break-all">{them.email}</span>
                  {gone ? (
                    <StatusBadge icon={UserX} tone="danger">
                      {t("people.disabled")}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="success">
                      {t("people.active")}
                    </StatusBadge>
                  )}
                  <RoleBadges roles={them.roles ?? []} />
                </>
              }
              title={them.name}
            />

            <PageTabs
              onChange={(value) =>
                navigate({
                  replace: true,
                  search: value === "access" ? {} : { tab: value },
                })
              }
              tabs={[
                {
                  value: "access",
                  label: t("people.tab.access"),
                  icon: ShieldCheck,
                  content: (
                    <AccessTab
                      gone={gone}
                      isOwner={isOwner}
                      isSelf={isSelf}
                      name={them.name}
                      penIds={them.penIds ?? []}
                      roles={them.roles ?? []}
                      userId={userId}
                      visitUntil={them.visitUntil ?? null}
                    />
                  ),
                },
                // Where somebody is signed in is shown only to whoever may sign them out of it.
                ...(seesSignIns
                  ? [
                      {
                        value: "signIns" as const,
                        label: t("people.tab.signIns"),
                        icon: MonitorSmartphone,
                        content: <SignInsTab userId={userId} />,
                      },
                    ]
                  : []),
                {
                  value: "training",
                  label: t("people.tab.training"),
                  icon: BookOpenCheck,
                  content: <TrainingTab training={them.training ?? []} />,
                },
              ]}
              value={tab === "signIns" && !seesSignIns ? "access" : tab}
            />
          </>
        ) : null}
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/people/$userId")({
  component: PersonPage,
  /** Which tab, kept in the address so the page comes back as it was left. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) && search.tab !== "access"
      ? { tab: search.tab as Tab }
      : {},
});
