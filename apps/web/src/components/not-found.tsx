import { useT } from "@/i18n/language-provider";

const NotFound = () => {
  const t = useT();
  return <div className="p-4">{t("common.notFound")}</div>;
};

export default NotFound;
