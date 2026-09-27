import { buttonVariants } from "@OpenFarm/ui/components/button";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { CircleAlert, MapPinOff, RotateCw } from "lucide-react";

import { EmptyState } from "@/components/page";
import { useT } from "@/i18n/language-provider";

/** Where somebody lost goes back to: the portal's start for a portal page, the farm's for everything else. */
const useStart = (): "/" | "/portal" => {
  const { pathname } = useLocation();
  return pathname.startsWith("/portal") ? "/portal" : "/";
};

/**
 * A page that is not there, said plainly with the way back to the start. The same card whether it is drawn inside the
 * farm's menus or on a page of its own, so it carries no bar of its own.
 */
const NotFound = () => {
  const t = useT();
  const start = useStart();
  return (
    <div className="flex min-h-[60svh] items-center justify-center px-4 py-10">
      <EmptyState
        action={
          <Link className={buttonVariants({ variant: "outline" })} to={start}>
            {t("common.goToStart")}
          </Link>
        }
        className="w-full max-w-md"
        description={t("common.notFoundHint")}
        icon={MapPinOff}
        title={t("common.notFound")}
      />
    </div>
  );
};

/**
 * Something failed while a page was being drawn: said in the reader's language, with the page tried again and the way
 * back to the start — never the router's own English, and never a blank screen.
 */
export const PageFailed = () => {
  const t = useT();
  const router = useRouter();
  const start = useStart();
  return (
    <div className="flex min-h-[60svh] items-center justify-center px-4 py-10">
      <EmptyState
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button
              className={buttonVariants()}
              onClick={() => {
                void router.invalidate();
              }}
              type="button"
            >
              <RotateCw aria-hidden data-icon="inline-start" />
              {t("common.retry")}
            </button>
            <Link className={buttonVariants({ variant: "outline" })} to={start}>
              {t("common.goToStart")}
            </Link>
          </div>
        }
        className="w-full max-w-md"
        description={t("common.errorHint")}
        icon={CircleAlert}
        title={t("common.error")}
      />
    </div>
  );
};

export default NotFound;
