/**
 * The newest migration this code was written against, by its folder name under `migrations/`. Readiness asks the
 * database whether it has applied this one: an app built for a table the database does not have yet is not ready,
 * however well the database answers. A test fails when a new migration is generated and this is not moved on.
 */
export const LATEST_MIGRATION =
  "20260926202853_keeping_her_is_weighed_as_far_ahead_as_the_owner_says";
