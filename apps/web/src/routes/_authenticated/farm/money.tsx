import { createFileRoute } from "@tanstack/react-router";

import { MarketPrice } from "@/components/fattening/animal-prices";
import { CategoriesTab } from "@/components/money/categories-tab";
import { FarmAccounts } from "@/components/money/farm-accounts";
import { Page, PageHeader } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/**
 * How the farm's money is set up: the Farm Accounts it takes and pays through, the Categories every entry is written
 * under, and the market price a kilo its own animals are priced at. The accounts and the price are the Owner's and
 * say so themselves; the price is also shown where animals are priced (Fattening, Ready for sale).
 */
const MoneySettingsPage = () => {
  const { t } = useLanguage();
  return (
    <Page>
      <PageHeader
        description={t("settings.moneyWhy")}
        eyebrow={t("nav.identity")}
        title={t("settings.section.money")}
      />
      <FarmAccounts id="farm-accounts" />
      <CategoriesTab />
      <MarketPrice />
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/farm/money")({
  component: MoneySettingsPage,
});
