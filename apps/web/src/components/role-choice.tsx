import type { RoleName } from "@OpenFarm/api/roles";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Label } from "@OpenFarm/ui/components/label";

import { useT } from "@/i18n/language-provider";

/** What the farm calls a Role, in the reader's language. */
export const roleKey = (role: RoleName) => `role.${role}` as const;

/** A Role picked or not, with the shared checkbox and a label the whole row answers to. */
export const RoleChoice = ({
  role,
  checked,
  onToggle,
}: {
  role: RoleName;
  checked: boolean;
  onToggle: () => void;
}) => {
  const t = useT();
  return (
    <Label className="flex min-h-11 cursor-pointer items-center gap-2 font-normal md:min-h-8">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      {t(roleKey(role))}
    </Label>
  );
};

/** Adding a Role the person does not hold, or taking away one they do. */
export const toggled = (roles: RoleName[], role: RoleName) =>
  roles.includes(role) ? roles.filter((one) => one !== role) : [...roles, role];
