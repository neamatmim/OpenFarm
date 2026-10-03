import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BookOpenCheck,
  MonitorSmartphone,
  ShieldCheck,
  UserX,
} from "lucide-react";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import {
  BackLink,
  Loaded,
  Page,
  PageHeader,
  StatusBadge,
} from "@/components/page";
import { PageTabs } from "@/components/page-kit";
import { RoleBadges } from "@/components/people/people-table";
import { AccessTab } from "@/components/people/person-access";
import { SignInsTab, TrainingTab } from "@/components/people/person-sign-ins";
import { useT } from "@/i18n/language-provider";
import { words } from "@/lib/correcting";
import { onlyFor } from "@/lib/guard";
import { initialsOf } from "@/lib/initials";
import { reachesTheirAccess } from "@/lib/their-access";
import { orpc } from "@/utils/orpc";

const TABS = ["access", "signIns", "training"] as const;
type Tab = (typeof TABS)[number];

/** The Owner putting a person's name right — a misspelling at sign-up, a name the farm knows them by. The old name stays
 *  in the trail beside the reason. */
const CorrectName = ({ userId, name }: { userId: string; name: string }) => {
  const t = useT();
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
      <BackLink to="/farm/people">{t("nav.people")}</BackLink>
      <Loaded query={person}>
        {them ? (
          <>
            <PageHeader
              eyebrow={t("nav.identity")}
              actions={
                isOwner ? (
                  <CorrectName name={them.name} userId={userId} />
                ) : null
              }
              // A person's record leads with their initials, as an animal's leads with her photo: whose page it is,
              // at a glance, in the user menu's own mark (greyed for one whose access is off).
              leading={
                <span
                  aria-hidden
                  className={cn(
                    "grid size-14 shrink-0 place-items-center rounded-full text-lg font-semibold",
                    gone
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary text-primary-foreground"
                  )}
                >
                  {initialsOf(them.name)}
                </span>
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

export const Route = createFileRoute("/_authenticated/farm/people/$userId")({
  /** For those who run the farm: the Owner and the Farm Managers. */
  beforeLoad: onlyFor("runsTheFarm"),
  component: PersonPage,
  /** Which tab, kept in the address so the page comes back as it was left. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) && search.tab !== "access"
      ? { tab: search.tab as Tab }
      : {},
});
