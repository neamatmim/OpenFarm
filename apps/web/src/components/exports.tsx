import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";

import { SUBHEADING } from "@/components/page";

/**
 * The things a page hands over — a paper to print, a CSV for somebody's spreadsheet — one to a line: its mark, what it
 * is and what it holds, and the ways it goes out on the right. Every page that exports lists them so, so the accountant's
 * papers read like the milk records' and every one says what it holds before anybody presses anything.
 */
export const ExportList = ({ children }: { children: ReactNode }) => (
  <ul className="divide-y">{children}</ul>
);

/** One thing a page hands over: what it is and holds, and how it goes out — on paper, as a CSV, or both. */
export const ExportRow = ({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description: ReactNode;
  /** Its ways out: a Print, a CSV, each a button. */
  children: ReactNode;
}) => {
  const titleId = useId();
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="bg-secondary text-secondary-foreground grid size-8 shrink-0 place-items-center rounded-lg">
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className={SUBHEADING} id={titleId}>
            {title}
          </p>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      {/* Named by its line, so "Print" and "Download CSV" are heard as whose they are, beside another line's. */}
      <fieldset
        aria-labelledby={titleId}
        className="flex min-w-0 shrink-0 flex-wrap gap-2 pl-11 sm:pl-0"
      >
        {children}
      </fieldset>
    </li>
  );
};
