import type {
  InspectorRegister,
  LiveState,
  RegistrationStanding,
  Side,
} from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRightLeft,
  BadgeCheck,
  FileImage,
  ImageOff,
  Printer,
  Skull,
  Stethoscope,
  Syringe,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import type {
  AskedPeriod,
  HealthRegisterName,
} from "@/components/health-registers";
import {
  HealthRegister,
  MovementLog,
  RegisterPeriod,
} from "@/components/health-registers";
import { Notice, Page, PageHeader, Section, TagChip } from "@/components/page";
import type { Tone } from "@/components/page";
import type { Figure, PageTab } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import { Paper } from "@/components/paper";
import type { PaperId } from "@/components/paper";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { orpc } from "@/utils/orpc";

const PAPER_OF: Record<InspectorRegister, PaperId> = {
  registration: "registration-record",
  herd_summary: "herd-summary",
  vaccination_register: "vaccination-register",
  treatment_register: "treatment-register",
  disease_history: "disease-history",
  mortality_register: "mortality-register",
};

const SIDE_WORD = {
  dairy: "animals.side.dairy",
  fattening: "animals.side.fattening",
} as const satisfies Record<Side, MessageKey>;

const STATE_WORD = {
  calf: "state.calf",
  heifer: "state.heifer",
  pregnant_heifer: "state.pregnant_heifer",
  milking: "state.milking",
  dry: "state.dry",
  quarantine: "state.quarantine",
  fattening: "state.fattening",
  ready_for_sale: "state.ready_for_sale",
} as const satisfies Record<LiveState, MessageKey>;

/** Where the Registration stands, in a word an inspector can read across the room. */
const STANDING_SHORT: Record<RegistrationStanding, MessageKey> = {
  valid: "inspector.kpi.valid",
  ending_soon: "inspector.kpi.endingSoon",
  expired: "inspector.kpi.expired",
  unknown: "inspector.kpi.unknown",
};

/** Where the Registration stands, as a colour beside its word. */
const STANDING_TONE: Record<RegistrationStanding, Tone> = {
  valid: "success",
  ending_soon: "warning",
  expired: "danger",
  unknown: "neutral",
};

const TABS = [
  "registration",
  "vaccinations",
  "treatments",
  "diseases",
  "deaths",
  "movements",
] as const;
type Tab = (typeof TABS)[number];

/** Each register's tab: its register, its word and its icon. */
const REGISTER_TABS: {
  value: Tab;
  register: HealthRegisterName;
  label: MessageKey;
  icon: LucideIcon;
}[] = [
  {
    value: "vaccinations",
    register: "vaccination_register",
    label: "inspector.tab.vaccinations",
    icon: Syringe,
  },
  {
    value: "treatments",
    register: "treatment_register",
    label: "inspector.tab.treatments",
    icon: Stethoscope,
  },
  {
    value: "diseases",
    register: "disease_history",
    label: "inspector.tab.diseases",
    icon: Activity,
  },
  {
    value: "deaths",
    register: "mortality_register",
    label: "inspector.tab.deaths",
    icon: Skull,
  },
];

type View = Awaited<ReturnType<typeof orpc.inspector.view.call>>;
type CertificatePhoto = Awaited<ReturnType<typeof orpc.farm.certificate.call>>;

const Line = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5">
    <dt className="text-muted-foreground text-sm">{label}</dt>
    <dd className="text-right font-medium tabular-nums">{children}</dd>
  </div>
);

/** The figures the inspector reads first: whether the Registration stands, how many animals, and the certificate. */
const useInspectorFigures = (
  view: View | undefined,
  hasPhoto: boolean
): Figure[] => {
  const { t, language } = useLanguage();
  if (!view) {
    return [];
  }
  const { registration, herd } = view;
  return [
    {
      label: t("inspector.registration"),
      value: t(STANDING_SHORT[registration.standing]),
      hint: registration.expiresOn
        ? t("inspector.kpi.expires", {
            date: formatDate(registration.expiresOn, language, "date"),
          })
        : t("inspector.standing.unknown"),
      icon: BadgeCheck,
      tone: STANDING_TONE[registration.standing],
    },
    {
      label: t("inspector.animals"),
      value: formatNumber(herd.total, language),
      hint: t("inspector.asOfLine", {
        date: formatDate(herd.asOf, language, "date"),
      }),
      icon: Users,
    },
    {
      label: t("certificate.title"),
      value: hasPhoto ? t("inspector.kpi.onFile") : t("inspector.kpi.noPhoto"),
      hint: hasPhoto ? undefined : t("certificate.none"),
      icon: FileImage,
      tone: hasPhoto ? "success" : "warning",
    },
  ];
};

/** The Registration and the herd as they stand today, each with its paper to print. */
const RegistrationTab = ({
  view,
  photo,
  printButton,
}: {
  view: View;
  photo: CertificatePhoto | undefined;
  printButton: (register: InspectorRegister) => ReactNode;
}) => {
  const { t, language } = useLanguage();
  const { registration, herd } = view;
  const day = (at: Date | null) =>
    at ? formatDate(at, language, "date") : "—";
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Section
        action={printButton("registration")}
        id="registration"
        title={t("inspector.registration")}
      >
        <dl className="divide-border flex flex-col divide-y">
          <Line label={t("identity.registrationNumber")}>
            {registration.number ? (
              <TagChip>{registration.number}</TagChip>
            ) : (
              "—"
            )}
          </Line>
          <Line label={t("identity.registrationOffice")}>
            {registration.office ?? "—"}
          </Line>
          <Line label={t("identity.registrationIssuedOn")}>
            {day(registration.issuedOn)}
          </Line>
          <Line label={t("identity.registrationExpiresOn")}>
            {day(registration.expiresOn)}
          </Line>
        </dl>
        {photo ? (
          <img
            alt={t("certificate.title")}
            className="max-h-80 w-full rounded-lg border object-contain"
            src={`data:${photo.contentType};base64,${photo.data}`}
          />
        ) : (
          <p className="text-muted-foreground bg-muted/60 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm">
            <ImageOff aria-hidden className="size-4 shrink-0" />
            {t("certificate.none")}
          </p>
        )}
      </Section>

      <Section
        action={printButton("herd_summary")}
        description={t("inspector.asOfLine", { date: day(herd.asOf) })}
        id="herd"
        title={t("inspector.herd")}
      >
        <div className="flex items-end gap-3">
          <span className="text-5xl leading-none font-semibold tracking-tight tabular-nums">
            {formatNumber(herd.total, language)}
          </span>
          <span className="text-muted-foreground pb-1 text-sm">
            {t("inspector.animals")}
          </span>
        </div>
        {herd.bySideAndState.length ? (
          <dl className="divide-border flex flex-col divide-y">
            {herd.bySideAndState.map((line) => (
              <Line
                key={`${line.side}-${line.state}`}
                label={`${t(SIDE_WORD[line.side])} · ${t(STATE_WORD[line.state])}`}
              >
                {formatNumber(line.animals, language)}
              </Line>
            ))}
          </dl>
        ) : null}
        {herd.byPen.length ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">{t("inspector.byPen")}</h3>
            <dl className="divide-border flex flex-col divide-y">
              {herd.byPen.map((line) => (
                <Line key={line.penId} label={`${line.shed} · ${line.pen}`}>
                  {formatNumber(line.animals, language)}
                </Line>
              ))}
            </dl>
          </div>
        ) : null}
      </Section>
    </div>
  );
};

/** What the farm should be told before an inspector tells it: no number written down, or a Registration running out. */
const RegistrationNotices = ({ view }: { view: View }) => {
  const { t, language } = useLanguage();
  const { registration } = view;
  const when = registration.expiresOn
    ? formatDate(registration.expiresOn, language, "date")
    : "—";
  return (
    <>
      {registration.number === null ? (
        <Notice title={t("inspector.noNumber")} tone="warning">
          {t("inspector.noNumberHint")}
        </Notice>
      ) : null}
      {registration.standing === "expired" ? (
        <Notice title={t("identity.expired", { when })} tone="danger" />
      ) : null}
      {registration.standing === "ending_soon" ? (
        <Notice title={t("identity.endingSoon", { when })} tone="warning" />
      ) : null}
    </>
  );
};

/**
 * The Inspector View: the one screen the Manager opens for a DLS inspector. Every register on it is shown here
 * and handed over as a paper; the inspector never touches the phone. An inspection is a rehearsed five
 * minutes, not a scramble through the sheds' notebooks: where the Registration stands first, then the Registration
 * and the herd, and each register in a tab of its own over the period asked. The tab is kept in the address.
 */
const InspectorPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab = "registration" } = Route.useSearch();
  const view = useQuery(orpc.inspector.view.queryOptions());
  // The very photograph the view named, so the printed Registration shows the certificate the screen does.
  const certificateId = view.data?.registration.certificate?.id;
  const certificate = useQuery({
    ...orpc.farm.certificate.queryOptions({ input: { id: certificateId } }),
    enabled: certificateId !== undefined,
  });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const asked: AskedPeriod = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const [paper, setPaper] = useState<{
    register: InspectorRegister;
    text: string;
  } | null>(null);
  const print = useMutation(
    orpc.inspector.print.mutationOptions({
      onSuccess: ({ text }, { register }) => {
        // The movement log is a spreadsheet and comes back with no paper to show.
        if (!text || register === "movement_log") {
          setPaper(null);
          return;
        }
        setPaper({ register, text });
        // The paper is drawn below the tabs: take the reader to it.
        requestAnimationFrame(() =>
          document
            .querySelector(`#${PAPER_OF[register]}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        );
      },
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  const figures = useInspectorFigures(view.data, certificateId !== undefined);

  if (!view.data) {
    return (
      <Page>
        <PageHeader
          eyebrow={t("nav.group.compliance")}
          title={t("inspector.title")}
        />
        {view.isError ? (
          <Notice title={t("common.error")} tone="danger" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        )}
      </Page>
    );
  }
  const printButton = (register: InspectorRegister) => (
    <Button
      // The Registration waits for its certificate, so the paper is not printed without the photograph.
      disabled={
        print.isPending ||
        (register === "registration" &&
          certificateId !== undefined &&
          !certificate.data)
      }
      onClick={() => print.mutate({ register })}
      size="sm"
      variant="outline"
    >
      <Printer aria-hidden data-icon="inline-start" />
      {t("common.print")}
    </Button>
  );
  const period = (
    <RegisterPeriod from={from} onFrom={setFrom} onTo={setTo} to={to} />
  );
  const tabs: PageTab<Tab>[] = [
    {
      value: "registration",
      label: t("inspector.tab.registration"),
      icon: BadgeCheck,
      content: (
        <RegistrationTab
          photo={certificate.data}
          printButton={printButton}
          view={view.data}
        />
      ),
    },
    ...REGISTER_TABS.map((one) => ({
      value: one.value,
      label: t(one.label),
      icon: one.icon,
      content: (
        <div className="flex flex-col gap-4">
          {period}
          <HealthRegister
            asked={asked}
            onPrint={(register, when) => print.mutate({ register, ...when })}
            printing={print.isPending}
            register={one.register}
          />
        </div>
      ),
    })),
    {
      value: "movements",
      label: t("inspector.tab.movements"),
      icon: ArrowRightLeft,
      content: (
        <div className="flex flex-col gap-4">
          {period}
          <MovementLog asked={asked} />
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        description={t("inspector.subtitle")}
        eyebrow={t("nav.group.compliance")}
        title={t("inspector.title")}
      />

      <RegistrationNotices view={view.data} />

      <SummaryFigures figures={figures} />

      <PageTabs
        onChange={(value) =>
          navigate({
            replace: true,
            search: value === "registration" ? {} : { tab: value },
          })
        }
        tabs={tabs}
        value={tab}
      />

      {paper ? (
        <Paper
          id={PAPER_OF[paper.register]}
          image={
            paper.register === "registration" && certificate.data
              ? { ...certificate.data, alt: t("certificate.title") }
              : undefined
          }
          text={paper.text}
        />
      ) : null}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/inspector")({
  beforeLoad: ({ context }) => {
    // What the farm shows an inspector is the Owner's and the Manager's to show.
    const { roles } = context.me;
    if (!(roles.includes("owner") || roles.includes("manager"))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: InspectorPage,
  /** Which tab, kept in the address so the page comes back as it was left. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) && search.tab !== "registration"
      ? { tab: search.tab as Tab }
      : {},
});
