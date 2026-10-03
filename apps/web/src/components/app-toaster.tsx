import { Toaster } from "@OpenFarm/ui/components/sonner";
import { useIsMobile } from "@OpenFarm/ui/hooks/use-mobile";

/** Clear of the phone's bar pinned at the top: 56px and a little air. */
const UNDER_THE_TOP_BAR = 64;
/** The gap a toast keeps from the window's edge on a desk. */
const FROM_THE_EDGE = 16;

/**
 * Where the app's toasts appear. On a desk, bottom right (Fluent places them there): an error toast stays until it is
 * closed, and at the top right it sat over a page's own actions, which WCAG 2.4.11 asks never to be hidden from the
 * person tabbing to them. On a phone, across the top under its bar, clear of the bar at the foot and of the action a
 * Step pins there.
 */
export const AppToaster = () => {
  const phone = useIsMobile();
  return (
    <Toaster
      offset={
        phone
          ? { top: UNDER_THE_TOP_BAR }
          : { right: FROM_THE_EDGE, bottom: FROM_THE_EDGE }
      }
      position={phone ? "top-center" : "bottom-right"}
      richColors
    />
  );
};
