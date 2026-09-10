import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  auditEvent: {
    actor: r.one.user({ from: r.auditEvent.actorId, to: r.user.id }),
  },
  user: {
    roles: r.many.roleAssignment({
      from: r.user.id,
      to: r.roleAssignment.userId,
    }),
    penAssignments: r.many.penAssignment({
      from: r.user.id,
      to: r.penAssignment.userId,
    }),
    sessions: r.many.session({
      from: r.user.id,
      to: r.session.userId,
    }),
    accounts: r.many.account({
      from: r.user.id,
      to: r.account.userId,
    }),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
      optional: false,
    }),
  },
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
      optional: false,
    }),
  },
}));
