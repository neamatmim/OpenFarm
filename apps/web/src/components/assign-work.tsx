import { mayTransition } from "@OpenFarm/domain";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRoundCheck } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

const SELECT =
  "bg-card border-input focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-md border px-3 text-base outline-none focus-visible:ring-[3px] md:h-9 md:max-w-xs md:text-sm";

/**
 * Pinning work to one person — the milker who knows that Pen, the vet who is coming on Thursday — or leaving it to
 * whoever holds its Role. Only for those who run the farm, and only while the work is still open.
 */
export const AssignWork = ({
  instanceId,
  assignedRole,
  assignedTo,
  state,
  className,
}: {
  className?: string;
  instanceId: string;
  assignedRole: string;
  assignedTo: string | null;
  state: string;
}) => {
  const t = useT();
  const id = useId();
  const queryClient = useQueryClient();
  const me = useQuery(orpc.people.me.queryOptions());
  const runsTheFarm = (me.data?.roles ?? []).some(
    (role) => role === "owner" || role === "manager"
  );
  // Only work still owed is given to somebody: finished work is done, and work closed as Missed or Called Off is not.
  const mayAssign = mayTransition("assign", state);
  const people = useQuery({
    ...orpc.people.list.queryOptions(),
    enabled: runsTheFarm && mayAssign,
  });
  const assign = useMutation(
    orpc.instances.assign.mutationOptions({
      onSuccess: async () => {
        toast.success(t("work.assigned"));
        await queryClient.invalidateQueries({ queryKey: orpc.instances.key() });
      },
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );

  if (!(runsTheFarm && mayAssign)) {
    return null;
  }
  const holders = (people.data?.people ?? []).filter(
    (person) =>
      !person.disabledAt && (person.roles as string[]).includes(assignedRole)
  );

  return (
    <div
      className={cn(
        "bg-card flex flex-col gap-2 rounded-xl border p-3 md:flex-row md:items-center md:gap-3",
        className
      )}
    >
      <Label className="inline-flex shrink-0 items-center gap-2" htmlFor={id}>
        <UserRoundCheck aria-hidden className="text-muted-foreground size-4" />
        {t("work.assignTo")}
      </Label>
      <select
        className={SELECT}
        disabled={assign.isPending || !people.data}
        id={id}
        onChange={(event) =>
          assign.mutate({ id: instanceId, userId: event.target.value || null })
        }
        value={assignedTo ?? ""}
      >
        <option value="">
          {t("work.anyoneInRole", {
            role: t(`role.${assignedRole}` as "role.staff"),
          })}
        </option>
        {holders.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
      {assign.isPending ? <Spinner /> : null}
    </div>
  );
};
