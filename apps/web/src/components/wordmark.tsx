import { cn } from "@OpenFarm/ui/lib/utils";

import { useT } from "@/i18n/language-provider";

/**
 * OPENFARM, as the farm's mark: Latin capitals, spaced, in Inter, at one size and on one line height whatever the
 * language — a mark is the same shape in Bangla and in English, and it must not move when the language changes. Its
 * size is written out rather than taken from the type scale, which Bangla enlarges, and its font is Inter's rather
 * than the Bangla font's own Latin letters. Spaced by a property rather than a tracking class, which Bangla resets.
 */
export const Wordmark = ({
  size = "base",
  className,
}: {
  size?: "base" | "lg";
  className?: string;
}) => (
  <span
    className={cn(
      "font-sans font-semibold [letter-spacing:0.08em] uppercase",
      size === "lg" ? "text-[1.125rem] leading-7" : "text-[1rem] leading-6",
      className
    )}
  >
    {useT()("app.name")}
  </span>
);
