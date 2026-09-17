import { DISPOSALS, MORTALITY_KINDS } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Beef, Milk, Shovel, TimerOff } from "lucide-react";
import type { ReactNode } from "react";

import {
  CorrectionAnswer,
  CorrectionChoice,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { TwoProjections } from "@/components/gain";
import { Notice, Section, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { choice, words } from "@/lib/correcting";
import { causeWord, disposalWord } from "@/lib/mortality-words";
import { orpc } from "@/utils/orpc";

import { Fact, FactGrid } from "./animal-facts";
import type { AnimalAct, AnimalDetail, AnimalPowers } from "./animal-types";
import { SideWord, StateBadge, ageWords } from "./animal-words";

/** Putting a mortality right: what the farm learned afterwards, or a hurried entry corrected. */
const PutItRight = ({
  detail,
  onDone,
}: {
  detail: {
    tagNumber: string;
    mortality: NonNullable<AnimalDetail["mortality"]>;
  };
  onDone: () => unknown;
}) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({
    kind: choice(detail.mortality.kind),
    cause: words(detail.mortality.cause),
    // Left as it is unless somebody chooses: a Correction to a stillborn calf's cause writes no disposal nobody said.
    disposal: choice(detail.mortality.disposal),
  });
  const correct = useMutation(
    orpc.animals.correctMortality.mutationOptions({})
  );
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          tagNumber: detail.tagNumber,
          changes: correcting.changes(),
          reason,
        });
        onDone();
      }}
      ready={correcting.changed}
      title={t("mortality.correct")}
      trigger={t("mortality.correct")}
    >
      <CorrectionChoice
        label={t("mortality.kind")}
        onChange={(value) => correcting.set("kind", value)}
        options={MORTALITY_KINDS.map((one) => ({
          value: one,
          label: t(`mortality.${one}`),
        }))}
        value={correcting.typed.kind ?? ""}
      />
      <CorrectionAnswer
        label={t("mortality.cause")}
        onChange={(value) => correcting.set("cause", value)}
        value={correcting.typed.cause ?? ""}
      />
      <CorrectionChoice
        label={t("mortality.disposal")}
        onChange={(value) => correcting.set("disposal", value)}
        options={DISPOSALS.map((one) => ({
          value: one,
          label: t(`mortality.${one}`),
        }))}
        unchosen={
          detail.mortality.disposal
            ? undefined
            : t("mortality.awaitingDisposal")
        }
        value={correcting.typed.disposal ?? ""}
      />
    </CorrectionDialog>
  );
};

/**
 * How she left the herd, for an animal who died or was culled: when, of what, and what was done with her. Disposal is
 * evidence an inspector may ask for, so a disposal nobody has written yet is said in the warning colour, with the way
 * to write it for those who may.
 */
const HowSheWent = ({
  detail,
  mayRecord,
  onAct,
  onDone,
}: {
  detail: AnimalDetail;
  mayRecord: boolean;
  onAct: (act: AnimalAct) => void;
  onDone: () => unknown;
}) => {
  const { t, language } = useLanguage();
  const gone = detail.mortality;
  if (!gone) {
    return null;
  }
  return (
    <Section
      action={
        mayRecord ? (
          <>
            {gone.disposal ? null : (
              <Button
                onClick={() => onAct("disposal")}
                size="sm"
                type="button"
                variant="outline"
              >
                <Shovel aria-hidden data-icon="inline-start" />
                {t("mortality.recordDisposal")}
              </Button>
            )}
            <PutItRight
              detail={{ tagNumber: detail.tagNumber, mortality: gone }}
              onDone={onDone}
            />
          </>
        ) : null
      }
      title={t(`mortality.${gone.kind}`)}
    >
      <FactGrid>
        <Fact label={t("mortality.happenedAt")}>
          {formatDate(new Date(gone.happenedAt), language, "dateTime")}
        </Fact>
        <Fact label={t("mortality.cause")}>{causeWord(gone.cause, t)}</Fact>
        <Fact label={t("mortality.disposal")}>
          {gone.disposal ? (
            disposalWord(gone.disposal, t)
          ) : (
            <StatusBadge tone="warning">
              {disposalWord(gone.disposal, t)}
            </StatusBadge>
          )}
        </Fact>
        {gone.disposalNote ? (
          <Fact label={t("mortality.disposalNote")}>{gone.disposalNote}</Fact>
        ) : null}
        {gone.recordedByName ? (
          <Fact label={t("animals.recordedBy")}>{gone.recordedByName}</Fact>
        ) : null}
      </FactGrid>
    </Section>
  );
};

/** One hold, milk or meat: until when, said in full — a date cut short is no use to a buyer — and whether it bites
 *  now. */
const HoldLine = ({
  icon: Icon,
  held,
  heldWord,
  children,
}: {
  icon: LucideIcon;
  held: boolean;
  heldWord: string;
  children: ReactNode;
}) => (
  <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
    <Icon
      aria-hidden
      className="text-muted-foreground mt-0.5 size-5 shrink-0"
    />
    <span className="min-w-0 flex-1 font-medium">{children}</span>
    {held ? <StatusBadge tone="warning">{heldWord}</StatusBadge> : null}
  </li>
);

/**
 * What is holding her back, and — for the Vet, and only the Vet — the way to shorten it.
 *
 * Both holds are shown whether or not they are in force: "held until Tuesday" and "fit for sale from the 30th" are the
 * two things anybody looking at a treated cow wants to know, and a page that only mentions them while they bite
 * teaches nobody to look.
 */
const Withdrawals = ({
  detail,
  mayShorten,
  onAct,
}: {
  detail: AnimalDetail;
  mayShorten: boolean;
  onAct: (act: AnimalAct) => void;
}) => {
  const { t, language } = useLanguage();
  if (!(detail.milkWithdrawalUntil || detail.meatWithdrawalUntil)) {
    return null;
  }
  return (
    <Section
      action={
        mayShorten ? (
          <Button
            onClick={() => onAct("shorten")}
            size="sm"
            type="button"
            variant="outline"
          >
            <TimerOff aria-hidden data-icon="inline-start" />
            {t("withdrawal.shorten")}
          </Button>
        ) : null
      }
      title={t("animals.withdrawal")}
    >
      <ul className="divide-border flex flex-col divide-y">
        {detail.milkWithdrawalUntil ? (
          <HoldLine
            held={detail.underMilkWithdrawal}
            heldWord={t("animals.milkHeld")}
            icon={Milk}
          >
            {t("animals.milkHeldUntil", {
              date: formatDate(
                new Date(detail.milkWithdrawalUntil),
                language,
                "dateTime"
              ),
            })}
          </HoldLine>
        ) : null}
        {detail.meatWithdrawalUntil ? (
          <HoldLine
            held={detail.underMeatWithdrawal}
            heldWord={t("animals.meatHeld")}
            icon={Beef}
          >
            {t("animals.meatHeldUntil", {
              date: formatDate(
                new Date(detail.meatWithdrawalUntil),
                language,
                "date"
              ),
            })}
          </HoldLine>
        ) : null}
      </ul>
      {detail.shortened ? (
        <Notice
          title={t("animals.withdrawalShortened", {
            reason: detail.shortened.reason ?? "",
          })}
          tone="warning"
        >
          {/* What her doses alone said. A shortened hold is the thing a slaughter vet asks about, so the figure it
              was shortened from stays on the page. */}
          {detail.shortened.wasMilkUntil
            ? t("animals.withdrawalWas", {
                date: formatDate(
                  new Date(detail.shortened.wasMilkUntil),
                  language,
                  "dateTime"
                ),
              })
            : null}
        </Notice>
      ) : null}
    </Section>
  );
};

/** Her Lactation as a fact: which one, and how many days into it a cow in milk is. */
const lactationWords = (
  detail: AnimalDetail,
  t: ReturnType<typeof useLanguage>["t"]
) => {
  const which = t("calving.lactation", { number: detail.lactationNumber });
  return detail.daysInMilk === null
    ? which
    : `${which} · ${t("animals.daysInMilk", { days: detail.daysInMilk })}`;
};

/** Who she is, as facts: everything her register says about her, and what her records work out. */
const AboutHer = ({ detail }: { detail: AnimalDetail }) => {
  const { t, language } = useLanguage();
  const [latest] = detail.weighIns;
  return (
    <Section title={t("animals.about")}>
      <FactGrid className="lg:grid-cols-4">
        <Fact label={t("animals.state")}>
          <StateBadge state={detail.state} />
        </Fact>
        <Fact label={t("animals.side")}>
          <SideWord side={detail.side} />
        </Fact>
        <Fact label={t("animals.pen")}>
          {detail.pen.shed.name} / {detail.pen.name}
        </Fact>
        <Fact label={t("animals.sex")}>{t(`animals.sex.${detail.sex}`)}</Fact>
        <Fact label={t("animals.breed")}>{detail.breed ?? "—"}</Fact>
        <Fact label={t("animals.birthDate")}>
          {detail.birthDate
            ? `${formatDate(new Date(detail.birthDate), language, "date")} · ${ageWords(t, detail.birthDate)}`
            : "—"}
        </Fact>
        <Fact label={t("animals.source")}>
          {t(`animals.source.${detail.source}`)}
        </Fact>
        {detail.officialTag ? (
          <Fact label={t("animals.officialTag")}>{detail.officialTag}</Fact>
        ) : null}
        {detail.lactationNumber > 0 ? (
          <Fact label={t("calving.col.lactation")}>
            {lactationWords(detail, t)}
          </Fact>
        ) : null}
        {detail.expectedCalvingAt ? (
          <Fact label={t("pregnancy.expectedOn")}>
            {formatDate(new Date(detail.expectedCalvingAt), language, "date")}
          </Fact>
        ) : null}
        {latest ? (
          <Fact label={t("gain.now")}>
            {t("intake.kg", { kg: formatNumber(latest.weightKg, language) })}
            <span className="text-muted-foreground font-normal">
              {" · "}
              {formatDate(new Date(latest.weighedAt), language, "date")}
            </span>
          </Fact>
        ) : null}
      </FactGrid>
    </Section>
  );
};

/** Her page at a glance: how she left, if she has; what holds her back; how a fattening animal is gaining; and who she
 *  is. */
export const OverviewTab = ({
  detail,
  powers,
  onAct,
  onChanged,
}: {
  detail: AnimalDetail;
  powers: AnimalPowers;
  onAct: (act: AnimalAct) => void;
  onChanged: () => unknown;
}) => (
  <div className="flex flex-col gap-6">
    <HowSheWent
      detail={detail}
      mayRecord={powers.runsTheFarm}
      onAct={onAct}
      onDone={onChanged}
    />
    <Withdrawals detail={detail} mayShorten={powers.fullVet} onAct={onAct} />
    {detail.fattening ? <TwoProjections view={detail.fattening} /> : null}
    <AboutHer detail={detail} />
  </div>
);
