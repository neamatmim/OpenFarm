import { createFileRoute } from "@tanstack/react-router";

import { FarmParameters } from "@/components/farm-parameters";
import { useIsOwner } from "@/components/money";
import { Page, PageHeader } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { PARAMETER_SECTIONS } from "@/lib/parameter-groups";

/** The groups of rules, listed beside them where there is room, each a jump to its place. */
const OnThisPage = () => {
  const { t } = useLanguage();
  const isOwner = useIsOwner();
  const parts = PARAMETER_SECTIONS.filter((part) => !part.owner || isOwner);
  return (
    <nav
      aria-label={t("identity.onThisPage")}
      className="hidden xl:sticky xl:top-20 xl:block"
    >
      <p className="text-muted-foreground mb-2 px-3 text-xs font-semibold tracking-wider uppercase">
        {t("identity.onThisPage")}
      </p>
      <ul className="flex flex-col gap-0.5 border-l">
        {parts.map((part) => (
          <li key={part.id}>
            <a
              className="text-muted-foreground hover:text-foreground hover:border-foreground focus-visible:ring-ring -ml-px block border-l-2 border-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-2"
              href={`#${part.id}`}
            >
              {t(part.title)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

/** How the farm behaves: when its digest goes and its quiet hours, how far a reading may drift, how long before late
 *  work is told, when a cow is put on the cull list — the Parameters in their groups, each saved on its own. */
const RulesPage = () => {
  const { t } = useLanguage();
  return (
    <Page>
      <PageHeader
        description={t("settings.rulesWhy")}
        eyebrow={t("nav.identity")}
        title={t("settings.section.rules")}
      />
      <div className="grid items-start gap-8 xl:grid-cols-[12rem_minmax(0,1fr)]">
        <OnThisPage />
        <div className="flex min-w-0 flex-col gap-6">
          <FarmParameters />
        </div>
      </div>
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/farm/rules")({
  component: RulesPage,
});
