import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  shed: {
    pens: r.many.pen({ from: r.shed.id, to: r.pen.shedId }),
  },
  pen: {
    shed: r.one.shed({ from: r.pen.shedId, to: r.shed.id, optional: false }),
    animals: r.many.animal({ from: r.pen.id, to: r.animal.penId }),
  },
  animal: {
    pen: r.one.pen({ from: r.animal.penId, to: r.pen.id, optional: false }),
    moves: r.many.animalMove({ from: r.animal.id, to: r.animalMove.animalId }),
    retags: r.many.retag({ from: r.animal.id, to: r.retag.animalId }),
    milkRecords: r.many.milkRecord({
      from: r.animal.id,
      to: r.milkRecord.animalId,
    }),
  },
  animalMove: {
    animal: r.one.animal({
      from: r.animalMove.animalId,
      to: r.animal.id,
      optional: false,
    }),
    toPen: r.one.pen({
      from: r.animalMove.toPenId,
      to: r.pen.id,
      optional: false,
    }),
  },
  sopDefinition: {
    versions: r.many.sopVersion({
      from: r.sopDefinition.id,
      to: r.sopVersion.definitionId,
    }),
    currentVersion: r.one.sopVersion({
      from: r.sopDefinition.currentVersionId,
      to: r.sopVersion.id,
    }),
  },
  sopVersion: {
    definition: r.one.sopDefinition({
      from: r.sopVersion.definitionId,
      to: r.sopDefinition.id,
      optional: false,
    }),
  },
  sopProposal: {
    definition: r.one.sopDefinition({
      from: r.sopProposal.definitionId,
      to: r.sopDefinition.id,
      optional: false,
    }),
    proposer: r.one.user({ from: r.sopProposal.proposedBy, to: r.user.id }),
  },
  deviceSwitch: {
    device: r.one.shedPhone({
      from: r.deviceSwitch.deviceId,
      to: r.shedPhone.id,
      optional: false,
    }),
  },
  sopInstance: {
    definition: r.one.sopDefinition({
      from: r.sopInstance.definitionId,
      to: r.sopDefinition.id,
      optional: false,
    }),
    version: r.one.sopVersion({
      from: r.sopInstance.versionId,
      to: r.sopVersion.id,
      optional: false,
    }),
    pen: r.one.pen({
      from: r.sopInstance.penId,
      to: r.pen.id,
      optional: false,
    }),
    completions: r.many.stepCompletion({
      from: r.sopInstance.id,
      to: r.stepCompletion.instanceId,
    }),
  },
  stepCompletion: {
    instance: r.one.sopInstance({
      from: r.stepCompletion.instanceId,
      to: r.sopInstance.id,
      optional: false,
    }),
    animal: r.one.animal({ from: r.stepCompletion.animalId, to: r.animal.id }),
  },
  milkingSession: {
    instance: r.one.sopInstance({
      from: r.milkingSession.instanceId,
      to: r.sopInstance.id,
      optional: false,
    }),
    pen: r.one.pen({
      from: r.milkingSession.penId,
      to: r.pen.id,
      optional: false,
    }),
    records: r.many.milkRecord({
      from: r.milkingSession.id,
      to: r.milkRecord.sessionId,
    }),
  },
  milkRecord: {
    session: r.one.milkingSession({
      from: r.milkRecord.sessionId,
      to: r.milkingSession.id,
      optional: false,
    }),
    animal: r.one.animal({
      from: r.milkRecord.animalId,
      to: r.animal.id,
      optional: false,
    }),
    completion: r.one.stepCompletion({
      from: r.milkRecord.completionId,
      to: r.stepCompletion.id,
      optional: false,
    }),
  },
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
