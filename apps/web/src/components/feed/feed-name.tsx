import { useLanguage } from "@/i18n/language-provider";
import type { Named } from "@/lib/names-in";
import { namesIn } from "@/lib/names-in";

/** The name in the other language, small beneath the one the reader reads, where the farm gave both. */
export const OtherName = ({ named }: { named: Named }) => {
  const { language } = useLanguage();
  const { other } = namesIn(named, language);
  return other ? (
    <span className="text-muted-foreground text-xs">{other}</span>
  ) : null;
};

/** A Feed Item or a Ration in a list: its name in the reader's language, and the other language's beneath it. */
export const TwoNames = ({
  named,
  className,
}: {
  named: Named;
  className?: string;
}) => {
  const { language } = useLanguage();
  return (
    <div className="flex flex-col gap-0.5">
      <span className={className}>{namesIn(named, language).shown}</span>
      <OtherName named={named} />
    </div>
  );
};
