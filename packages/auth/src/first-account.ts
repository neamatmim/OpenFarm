/**
 * Who may open the first account, before any Farm exists — the one account nobody invited, because whoever opens it
 * and names the Farm becomes its Owner.
 *
 * Left to whoever got there first, the Owner's first job at go-live is a race with anybody who found the address. So
 * the server names the Owner's address, and the door opens for that address alone. A production server that names
 * nobody opens for nobody: a setting forgotten is a refusal that says what to set, never a door left open. In
 * development and in tests, where there is no race to lose, a server that names nobody lets anybody set up.
 */
export type FirstAccount =
  | "open"
  | "not_the_owner"
  | "owner_not_named"
  | "setup_code_wrong";

/**
 * And on a production server, the address alone is not enough: nobody checks an address is the person's, and a new
 * certificate makes the farm's name public within minutes. So the account also needs the setup code the server printed
 * in its own log as it started, which only the Owner can read (the Owner, 2026-10-07).
 */
export const whoMayOpenTheFarm = (
  email: string,
  {
    ownerEmail,
    production,
    setupCodeRight = false,
  }: {
    ownerEmail: string | undefined;
    production: boolean;
    setupCodeRight?: boolean;
  }
): FirstAccount => {
  if (!ownerEmail) {
    return production ? "owner_not_named" : "open";
  }
  if (email.trim().toLowerCase() !== ownerEmail.trim().toLowerCase()) {
    return "not_the_owner";
  }
  return production && !setupCodeRight ? "setup_code_wrong" : "open";
};
