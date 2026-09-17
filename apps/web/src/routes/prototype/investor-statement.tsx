// PROTOTYPE — throwaway route. Three investor statements, ?variant=A|B|C.
import { createFileRoute } from "@tanstack/react-router";

import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { Joining, name as nameA } from "@/prototype/investor-statement-joining";
import {
  Progress,
  name as nameB,
} from "@/prototype/investor-statement-progress";
import {
  Settlement,
  name as nameC,
} from "@/prototype/investor-statement-settlement";

const VARIANTS = [
  { key: "A", name: nameA },
  { key: "B", name: nameB },
  { key: "C", name: nameC },
] as const;

export const Route = createFileRoute("/prototype/investor-statement")({
  validateSearch: (s: Record<string, unknown>) => ({
    variant:
      typeof s.variant === "string" && ["A", "B", "C"].includes(s.variant)
        ? s.variant
        : "A",
  }),
  component: Page,
});

const Page = () => {
  const { variant } = Route.useSearch();
  return (
    <div className="min-h-dvh bg-neutral-200 py-2 print:bg-white print:py-0">
      {variant === "A" ? <Joining /> : null}
      {variant === "B" ? <Progress /> : null}
      {variant === "C" ? <Settlement /> : null}
      <div className="print:hidden">
        <PrototypeSwitcher variants={VARIANTS} current={variant} />
      </div>
    </div>
  );
};
