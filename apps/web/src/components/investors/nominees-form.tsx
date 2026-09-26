import { MOST_NOMINEES } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Plus, X } from "lucide-react";

import { FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

import type { NomineeDraft } from "./nominee-draft";
import {
  EMPTY_DRAFT,
  draftsProblem,
  minorOn,
  sharesSoFar,
} from "./nominee-draft";
import type { RelationChoice } from "./relations";
import { RELATIONS, isRelation } from "./relations";

/** A relation as the form offers it: one of the usual ones, or somebody else in words. */
const RelationField = ({
  id,
  label,
  choice,
  inWords,
  onChange,
}: {
  id: string;
  label: string;
  choice: RelationChoice;
  inWords: string;
  onChange: (next: { choice: RelationChoice; inWords: string }) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <FormField id={id} label={label}>
        <NativeSelect
          id={id}
          onChange={(event) => {
            const chosen = event.target.value;
            onChange({
              choice: isRelation(chosen) || chosen === "other" ? chosen : "",
              inWords,
            });
          }}
          value={choice}
        >
          <option value="">—</option>
          {RELATIONS.map((relation) => (
            <option key={relation} value={relation}>
              {t(`investors.relation.${relation}`)}
            </option>
          ))}
          <option value="other">{t("investors.relation.other")}</option>
        </NativeSelect>
      </FormField>
      {choice === "other" ? (
        <FormField id={`${id}-words`} label={t("investors.relationInWords")}>
          <Input
            autoComplete="off"
            id={`${id}-words`}
            maxLength={60}
            onChange={(event) =>
              onChange({ choice, inWords: event.target.value })
            }
            value={inWords}
          />
        </FormField>
      ) : null}
    </>
  );
};

/** One Nominee's boxes, and — once their date of birth makes them a minor on the day — their Receiver's. */
const NomineeRowFields = ({
  draft,
  place,
  onDay,
  onChange,
  onRemove,
}: {
  draft: NomineeDraft;
  place: number;
  onDay: string;
  onChange: (next: NomineeDraft) => void;
  onRemove: () => void;
}) => {
  const { t } = useLanguage();
  const id = `nominee-${place}`;
  const minor = minorOn(draft, onDay);
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-medium">
          {t("nominees.place", { place })}
        </legend>
        <Button
          aria-label={t("nominees.remove")}
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`${id}-name`} label={t("nominees.name")}>
          <Input
            autoComplete="off"
            id={`${id}-name`}
            maxLength={120}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
            value={draft.name}
          />
        </FormField>
        <RelationField
          choice={draft.relation}
          id={`${id}-relation`}
          inWords={draft.relationInWords}
          label={t("nominees.relation")}
          onChange={({ choice, inWords }) =>
            onChange({ ...draft, relation: choice, relationInWords: inWords })
          }
        />
        <FormField id={`${id}-born`} label={t("nominees.bornOn")}>
          <Input
            id={`${id}-born`}
            max={onDay}
            onChange={(event) =>
              onChange({ ...draft, bornOn: event.target.value })
            }
            type="date"
            value={draft.bornOn}
          />
        </FormField>
        <FormField id={`${id}-phone`} label={t("nominees.phone")}>
          <Input
            id={`${id}-phone`}
            inputMode="tel"
            maxLength={20}
            onChange={(event) =>
              onChange({ ...draft, phone: event.target.value })
            }
            value={draft.phone}
          />
        </FormField>
        <FormField id={`${id}-share`} label={t("nominees.sharePercent")}>
          <Input
            id={`${id}-share`}
            inputMode="numeric"
            min={1}
            onChange={(event) =>
              onChange({ ...draft, share: event.target.value })
            }
            type="number"
            value={draft.share}
          />
        </FormField>
      </div>
      {minor ? (
        <div className="bg-muted/50 flex flex-col gap-3 rounded-md p-3">
          <p className="text-sm font-medium">{t("nominees.receiverHeading")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              id={`${id}-receiver-name`}
              label={t("nominees.receiverName")}
            >
              <Input
                autoComplete="off"
                id={`${id}-receiver-name`}
                maxLength={120}
                onChange={(event) =>
                  onChange({ ...draft, receiverName: event.target.value })
                }
                value={draft.receiverName}
              />
            </FormField>
            <RelationField
              choice={draft.receiverRelation}
              id={`${id}-receiver-relation`}
              inWords={draft.receiverRelationInWords}
              label={t("nominees.receiverRelation")}
              onChange={({ choice, inWords }) =>
                onChange({
                  ...draft,
                  receiverRelation: choice,
                  receiverRelationInWords: inWords,
                })
              }
            />
            <FormField
              id={`${id}-receiver-phone`}
              label={t("nominees.receiverPhone")}
            >
              <Input
                id={`${id}-receiver-phone`}
                inputMode="tel"
                maxLength={20}
                onChange={(event) =>
                  onChange({ ...draft, receiverPhone: event.target.value })
                }
                value={draft.receiverPhone}
              />
            </FormField>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
};

/**
 * The Nominees a paper will name, written down by the Owner: up to the most one paper may name, each with the share
 * they collect and, while a minor on `onDay`, who collects it for them. What is wrong with the list is said as it is
 * typed, by the domain's own rule — the same one the farm refuses by.
 */
export const NomineesForm = ({
  drafts,
  onDay,
  onChange,
}: {
  drafts: NomineeDraft[];
  onDay: string;
  onChange: (next: NomineeDraft[]) => void;
}) => {
  const { t } = useLanguage();
  const problem = draftsProblem(drafts, onDay);
  const roomForMore = drafts.length < MOST_NOMINEES;
  const noNominees = drafts.length === 0;
  return (
    <div className="flex flex-col gap-3">
      {drafts.map((draft, index) => (
        <NomineeRowFields
          // The order is the paper's; a row is only ever added at the end or taken off.
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
          draft={draft}
          onChange={(next) =>
            onChange(drafts.map((one, at) => (at === index ? next : one)))
          }
          onDay={onDay}
          onRemove={() => onChange(drafts.filter((_, at) => at !== index))}
          place={index + 1}
        />
      ))}
      {noNominees ? (
        <p className="text-muted-foreground text-sm">{t("nominees.noneYet")}</p>
      ) : (
        <p className="text-muted-foreground text-sm tabular-nums">
          {t("nominees.total", { total: sharesSoFar(drafts) })}
        </p>
      )}
      {problem ? (
        <output className="text-warning text-sm">
          {problem.at ? `${t("nominees.place", { place: problem.at })}: ` : ""}
          {t(`nominees.problem.${problem.code}`)}
        </output>
      ) : null}
      {roomForMore ? (
        <Button
          className="self-start"
          onClick={() => onChange([...drafts, EMPTY_DRAFT])}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden data-icon="inline-start" />
          {t("nominees.add")}
        </Button>
      ) : null}
    </div>
  );
};
