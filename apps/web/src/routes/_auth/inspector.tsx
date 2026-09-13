import type {
  InspectorRegister,
  LiveState,
  RegistrationStanding,
  Side,
} from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { HealthRegisters } from "@/components/health-registers";
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
  <div className="flex justify-between gap-2">
    <span className="text-muted-foreground">{label}</span>
    <span>{children}</span>
  </div>
);

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
      <p className="p-6">
        {view.isError ? t("common.error") : t("common.loading")}
      </p>
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
      {t("common.print")}
    </Button>
  );

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-lg font-medium">{t("inspector.title")}</h1>

      <section className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t("inspector.registration")}</h2>
          {printButton("registration")}
        </div>
        <Line label={t("identity.registrationNumber")}>
          {registration.number ?? "—"}
        </Line>
        <Line label={t("identity.registrationOffice")}>
          {registration.office ?? "—"}
        </Line>
        <Line label={t("identity.registrationIssuedOn")}>
          {day(registration.issuedOn)}
        </Line>
        <Line label={t("identity.registrationExpiresOn")}>
          {day(registration.expiresOn)}
          {standingWord ? (
            <span className="block text-amber-400">
              {t(standingWord, { when: day(registration.expiresOn) })}
            </span>
          ) : null}
        </Line>
        {certificate.data ? (
          <img
            alt={t("certificate.title")}
            className="max-h-96 rounded-lg"
            src={`data:${certificate.data.contentType};base64,${certificate.data.data}`}
          />
        ) : (
          <p className="text-muted-foreground">{t("certificate.none")}</p>
        )}
      </section>

      <section className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t("inspector.herd")}</h2>
          {printButton("herd_summary")}
        </div>
        <Line label={t("inspector.asOf")}>{day(herd.asOf)}</Line>
        <Line label={t("inspector.animals")}>
          {formatNumber(herd.total, language)}
        </Line>
        {herd.bySideAndState.map((line) => (
          <Line
            key={`${line.side}-${line.state}`}
            label={`${t(SIDE_WORD[line.side])} · ${t(STATE_WORD[line.state])}`}
          >
            {formatNumber(line.animals, language)}
          </Line>
        ))}
        <h3 className="pt-2 font-medium">{t("inspector.byPen")}</h3>
        {herd.byPen.map((line) => (
          <Line key={line.penId} label={`${line.shed} · ${line.pen}`}>
            {formatNumber(line.animals, language)}
          </Line>
        ))}
      </section>

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
    </div>
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
