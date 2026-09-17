import { ClipboardCheck, FolderOpen } from "lucide-react";

import { EmptyState, Loaded, Section } from "@/components/page";
import type { RepeatBreederRow } from "@/components/repeat-breeder";
import { RepeatBreeder } from "@/components/repeat-breeder";
import { useLanguage } from "@/i18n/language-provider";

import { AnimalLink } from "./vet-types";

/** A visiting Vet's open Case, as the page reads it. */
interface OpenCase {
  id: string;
  tagNumber: string;
  reason: string;
}

interface Answerable {
  data: unknown;
  isError: boolean;
  refetch: () => unknown;
}

/** A visiting Vet's open Cases: the animals they were called in for, each a way to her page, and why. */
export const CasesTab = ({
  query,
  cases,
}: {
  query: Answerable;
  cases: OpenCase[];
}) => {
  const { t } = useLanguage();
  return (
    <Section description={t("cases.mineHint")} title={t("cases.mine")}>
      <Loaded query={query}>
        {cases.length ? (
          <ul className="divide-border flex flex-col divide-y">
            {cases.map((row) => (
              <li
                className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
                key={row.id}
              >
                <AnimalLink tagNumber={row.tagNumber} />
                <span className="text-muted-foreground min-w-0 text-sm">
                  {row.reason}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState bare icon={FolderOpen} title={t("cases.mineNone")} />
        )}
      </Loaded>
    </Section>
  );
};

/** The cows that will not settle, for the Vet to decide on as well as the Manager. */
export const RepeatTab = ({
  query,
  rows,
}: {
  query: Answerable;
  rows: RepeatBreederRow[];
}) => {
  const { t } = useLanguage();
  return (
    <Section title={t("repeatBreeder.title")}>
      <Loaded query={query}>
        {rows.length ? (
          <ul className="divide-border flex flex-col divide-y">
            {rows.map((row) => (
              <li className="py-4 first:pt-0 last:pb-0" key={row.tagNumber}>
                <RepeatBreeder mayAnswer row={row} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            bare
            icon={ClipboardCheck}
            title={t("vet.noRepeatBreeders")}
          />
        )}
      </Loaded>
    </Section>
  );
};
