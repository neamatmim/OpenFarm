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
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ImageOff, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { HealthRegisters } from "@/components/health-registers";
import {
  Notice,
  Page,
  PageHeader,
  Section,
  StatusBadge,
  TagChip,
} from "@/components/page";
import type { Tone } from "@/components/page";
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

/** Where the Registration stands, said beside its expiry — nothing when it is simply good. */
const STANDING_WORD: Record<RegistrationStanding, MessageKey | null> = {
  valid: null,
  ending_soon: "identity.endingSoon",
  expired: "identity.expired",
  unknown: null,
};

const Line = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5">
    <dt className="text-muted-foreground text-sm">{label}</dt>
    <dd className="text-right font-medium tabular-nums">{children}</dd>
  </div>
);

/** Where the Registration stands, as a status the inspector can read across the room. */
const STANDING_TONE: Record<RegistrationStanding, Tone> = {
  valid: "success",
  ending_soon: "warning",
  expired: "danger",
  unknown: "neutral",
};

/**
 * The Inspector View: the one screen the Manager opens for a DLS inspector. Every register on it is shown here
 * and handed over as a paper; the inspector never touches the phone. An inspection is a rehearsed five
 * minutes, not a scramble through the sheds' notebooks.
 */
const InspectorPage = () => {
  const { t, language } = useLanguage();
  const view = useQuery(orpc.inspector.view.queryOptions());
  // The very photograph the view named, so the printed Registration shows the certificate the screen does.
  const certificateId = view.data?.registration.certificate?.id;
  const certificate = useQuery({
    ...orpc.farm.certificate.queryOptions({ input: { id: certificateId } }),
    enabled: certificateId !== undefined,
  });
  const [paper, setPaper] = useState<{
    report: InspectorRegister;
    text: string;
  } | null>(null);
  const print = useMutation(
    orpc.inspector.print.mutationOptions({
      onSuccess: ({ text }, { report }) =>
        setPaper(text ? { report, text } : null),
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );

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
  const { registration, herd } = view.data;
  const standingWord = STANDING_WORD[registration.standing];
  const day = (at: Date | null) =>
    at ? formatDate(at, language, "date") : "—";
  const printButton = (report: InspectorRegister) => (
    <Button
      // The Registration waits for its certificate, so the paper is not printed without the photograph.
      disabled={
        print.isPending ||
        (report === "registration" &&
          certificateId !== undefined &&
          !certificate.data)
      }
      onClick={() => print.mutate({ report })}
      size="sm"
      variant="outline"
    >
      <Printer data-icon="inline-start" />
      {t("common.print")}
    </Button>
  );

  return (
    <Page>
      <PageHeader
        actions={
          <StatusBadge tone={STANDING_TONE[registration.standing]}>
            {standingWord
              ? t(standingWord, { when: day(registration.expiresOn) })
              : t(
                  registration.standing === "valid"
                    ? "inspector.standing.valid"
                    : "inspector.standing.unknown"
                )}
          </StatusBadge>
        }
        description={t("inspector.subtitle")}
        eyebrow={t("nav.group.compliance")}
        title={t("inspector.title")}
      />

      {registration.number === null ? (
        <Notice title={t("inspector.noNumber")} tone="warning">
          {t("inspector.noNumberHint")}
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
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
          {certificate.data ? (
            <img
              alt={t("certificate.title")}
              className="max-h-80 w-full rounded-lg border object-contain"
              src={`data:${certificate.data.contentType};base64,${certificate.data.data}`}
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

      <HealthRegisters
        onPrint={(report, asked) => print.mutate({ report, ...asked })}
        printing={print.isPending}
      />

      {paper ? (
        <Paper
          id={PAPER_OF[paper.report]}
          image={
            paper.report === "registration" && certificate.data
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
});
