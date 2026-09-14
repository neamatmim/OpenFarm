import { Button } from "@OpenFarm/ui/components/button";
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

import { useT } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";
import { useInTheBrowser } from "@/lib/in-the-browser";
import {
  lockAndPutAway,
  lockOnTheFarm,
  useActiveWorker,
  useIsShedPhone,
} from "@/lib/shed-phone";
import { orpc } from "@/utils/orpc";

/** The first letters of a person's first two names, which is how a shared phone tells whose session it is at a glance. */
const initialsOf = (name: string) =>
  name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0])
    .join("")
    .toUpperCase();

const Initials = ({
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
              void navigate({ to: "/device" });
            }}
          >
            <Lock aria-hidden />
            {t("device.switchPerson")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (!inTheBrowser || isPending) {
    return <Skeleton className="h-9 w-28 rounded-md" />;
  }

  if (!session) {
    return (
      <Button render={<Link to="/login" />} variant="outline">
        {t("auth.signIn")}
      </Button>
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
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            authClient.signOut({
              fetchOptions: {
                onSuccess: () => {
                  navigate({ to: "/" });
                },
              },
            });
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
