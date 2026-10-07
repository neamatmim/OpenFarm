import { Button, buttonVariants } from "@OpenFarm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@OpenFarm/ui/components/dropdown-menu";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Lock, LogOut, Settings } from "lucide-react";

import { PhonePreferences } from "@/components/shell/phone-preferences";
import { useT } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";
import { useInTheBrowser } from "@/lib/in-the-browser";
import { initialsOf } from "@/lib/initials";
import { phoneOutbox } from "@/lib/outbox-client";
import {
  lockAndPutAway,
  lockOnTheFarm,
  useActiveWorker,
  useIsShedPhone,
} from "@/lib/shed-phone";
import { signOutOfThisPhone } from "@/lib/sign-out";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

export const Initials = ({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) => (
  <span
    aria-hidden
    className={
      large
        ? "bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold"
        : "bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold"
    }
  >
    {initialsOf(name)}
  </span>
);

/** Who is signed in on this phone, what they may do here, and the way out. */
const UserMenu = () => {
  const navigate = useNavigate();
  const t = useT();
  const { data: session, isPending } = authClient.useSession();
  const me = useQuery(orpc.people.me.queryOptions());
  const inTheBrowser = useInTheBrowser();
  const isShedPhone = useIsShedPhone();
  const worker = useActiveWorker();
  const queryClient = useQueryClient();

  if (inTheBrowser && isShedPhone) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t("auth.myAccount")}
              className="gap-2 ps-1.5 pe-2"
              variant="ghost"
            />
          }
        >
          <Initials name={worker?.name ?? "?"} />
          <span className="hidden max-w-32 truncate sm:inline">
            {worker?.name ?? ""}
          </span>
          <ChevronDown aria-hidden className="text-muted-foreground size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="flex items-center gap-3 px-2 py-2.5">
            <Initials large name={worker?.name ?? "?"} />
            <div className="flex min-w-0 flex-col">
              <p className="truncate font-medium">{worker?.name}</p>
              <p className="text-muted-foreground truncate text-sm">
                {t("device.onShedPhone")}
              </p>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              void lockAndPutAway(queryClient);
              void lockOnTheFarm();
              void navigate({ to: "/shed-phone" });
            }}
          >
            <Lock aria-hidden />
            {t("device.switchPerson")}
          </DropdownMenuItem>
          <PhonePreferences />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (!inTheBrowser || isPending) {
    return <Skeleton className="h-9 w-28 rounded-md" />;
  }

  if (!session) {
    return (
      <Link className={buttonVariants({ variant: "outline" })} to="/sign-in">
        {t("auth.signIn")}
      </Link>
    );
  }

  const { name, email } = session.user;
  const roles = me.data?.roles ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("auth.myAccount")}
            className="gap-2 ps-1.5 pe-2"
            variant="ghost"
          />
        }
      >
        <Initials name={name} />
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
        <ChevronDown aria-hidden className="text-muted-foreground size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2 py-2.5">
          <Initials large name={name} />
          <div className="flex min-w-0 flex-col">
            <p className="truncate font-medium">{name}</p>
            <p className="text-muted-foreground truncate text-sm">{email}</p>
            {roles.length > 0 ? (
              <p className="text-muted-foreground truncate text-sm">
                {roles.map((role) => t(`role.${role}`)).join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/settings" />}>
            <Settings aria-hidden />
            {t("nav.settings")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <PhonePreferences />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            // Work still waiting goes when this person signs in on this device again, and never under the next
            // person's session: said now, so nobody signs out of the office computer thinking it went.
            const held = await phoneOutbox()?.state();
            await signOutOfThisPhone(queryClient);
            if (held && held.pending > 0) {
              toast.warning(t("outbox.waitsForYou", { count: held.pending }));
            }
            await navigate({ to: "/" });
          }}
          variant="destructive"
        >
          <LogOut aria-hidden />
          {t("auth.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
