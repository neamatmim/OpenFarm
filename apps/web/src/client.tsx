import { loadMessages } from "@OpenFarm/i18n";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

import { pageLanguage } from "@/lib/page-context";

/**
 * TanStack Start's own entry, with one step first: the words of the language the server wrote the page in are
 * fetched before the page is taken over, so it is drawn again in the same words. The browser holds one language's
 * words, not both (`@OpenFarm/i18n`'s `#catalog`).
 */
await loadMessages(pageLanguage());

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>
  );
});
