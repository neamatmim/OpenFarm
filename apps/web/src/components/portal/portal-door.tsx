import type { ReactNode } from "react";

import { PublicHeader } from "@/components/public-header";

/** The Investor portal's door: the bar across the top, and one card in the middle of the page. */
export const PortalDoor = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-svh flex-col">
    <PublicHeader />
    <main className="flex flex-1 items-start justify-center px-4 py-10 md:items-center">
      <div className="w-full max-w-md">{children}</div>
    </main>
  </div>
);
