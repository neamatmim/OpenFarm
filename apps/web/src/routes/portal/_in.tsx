import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { LogOut, Sprout } from "lucide-react";

import LanguageToggle from "@/components/language-toggle";
import { ThemeMenu } from "@/components/theme-menu";
import { Wordmark } from "@/components/wordmark";
import { getUser } from "@/functions/get-user";
import { useLanguage } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

/**
 * The portal an Investor reads their Ventures in (ADR 0007): its own bar — the farm's name, whose portal it is, the
 * reader's settings and signing out — and none of the farm's own screens, which an Investor's account could not
 * open anyway.
 */
const PortalShell = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const me = useQuery(orpc.portal.me.queryOptions());
  return (
    <div className="flex min-h-svh flex-col">
      <header
        className="bg-card flex h-16 items-center gap-3 border-b px-4 md:px-8"
        data-app-chrome
      >
        <Link
          className="focus-visible:ring-ring flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2"
          to="/portal"
        >
          <span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-lg">
            <Sprout aria-hidden className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <Wordmark className="truncate" />
            <span className="text-muted-foreground truncate text-xs">
              {me.data?.farm.name ?? t("portal.title")}
            </span>
          </span>
        </Link>
        <div className="ms-auto flex items-center gap-1">
          <span className="text-muted-foreground me-2 hidden text-sm sm:inline">
            {me.data?.name}
          </span>
          <LanguageToggle />
          <ThemeMenu />
          <Button
            aria-label={t("auth.signOut")}
            onClick={() => {
              void authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    void navigate({ to: "/portal/login" });
                  },
                },
              });
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <LogOut aria-hidden />
          </Button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  );
};

export const Route = createFileRoute("/portal/_in")({
  ssr: false,
  // Signed in, and as an Investor the farm has let in; anybody else is sent where they belong.
  beforeLoad: async ({ context }) => {
    let session: Awaited<ReturnType<typeof getUser>> = null;
    try {
      session = await getUser();
    } catch {
      throw redirect({ to: "/portal/login" });
    }
    if (!session) {
      throw redirect({ to: "/portal/login" });
    }
    const me = await context.queryClient.fetchQuery({
      ...context.orpc.people.me.queryOptions(),
      staleTime: 0,
    });
    if (!me.investor) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: PortalShell,
});
