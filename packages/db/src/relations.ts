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
    observations: r.many.observation({
      from: r.animal.id,
      to: r.observation.animalId,
    }),
    retags: r.many.retag({ from: r.animal.id, to: r.retag.animalId }),
    milkRecords: r.many.milkRecord({
      from: r.animal.id,
      to: r.milkRecord.animalId,
    }),
    diagnoses: r.many.diagnosis({
      from: r.animal.id,
      to: r.diagnosis.animalId,
    }),
    prescriptions: r.many.prescription({
      from: r.animal.id,
      to: r.prescription.animalId,
    }),
    treatments: r.many.treatment({
      from: r.animal.id,
      to: r.treatment.animalId,
    }),
  },
  animalMove: {
    animal: r.one.animal({
      from: r.animalMove.animalId,
      to: r.animal.id,
      optional: false,
    }),
    /** The Step that walked her, when the Playbook was what moved her. */
    completion: r.one.stepCompletion({
      from: r.animalMove.completionId,
      to: r.stepCompletion.id,
    }),
    toPen: r.one.pen({
      from: r.animalMove.toPenId,
      to: r.pen.id,
      optional: false,
    }),
    fromPen: r.one.pen({ from: r.animalMove.fromPenId, to: r.pen.id }),
  },
  penRation: {
    pen: r.one.pen({ from: r.penRation.penId, to: r.pen.id, optional: false }),
    ration: r.one.ration({
      from: r.penRation.rationId,
      to: r.ration.id,
      optional: false,
    }),
  },
  ration: {
    pens: r.many.penRation({ from: r.ration.id, to: r.penRation.rationId }),
    versions: r.many.rationVersion({
      from: r.ration.id,
      to: r.rationVersion.rationId,
    }),
    currentVersion: r.one.rationVersion({
      from: r.ration.currentVersionId,
      to: r.rationVersion.id,
    }),
  },
  rationVersion: {
    ration: r.one.ration({
      from: r.rationVersion.rationId,
      to: r.ration.id,
      optional: false,
    }),
  },
  drugProduct: {
    /** Who wrote the withdrawal days — evidence at slaughter, so it is kept with them. */
    setBy: r.one.user({ from: r.drugProduct.daysSetBy, to: r.user.id }),
  },
  prescription: {
    animal: r.one.animal({
      from: r.prescription.animalId,
      to: r.animal.id,
      optional: false,
    }),
    /** What it treats: a course is given for something the Vet concluded. */
    diagnosis: r.one.diagnosis({
      from: r.prescription.diagnosisId,
      to: r.diagnosis.id,
      optional: false,
    }),
    product: r.one.drugProduct({
      from: r.prescription.productId,
      to: r.drugProduct.id,
      optional: false,
    }),
    vet: r.one.user({
      from: r.prescription.prescribedBy,
      to: r.user.id,
      optional: false,
    }),
    /** The doses it calls for, given or still owed. */
    treatments: r.many.treatment({
      from: r.prescription.id,
      to: r.treatment.prescriptionId,
    }),
  },
  treatment: {
    prescription: r.one.prescription({
      from: r.treatment.prescriptionId,
      to: r.prescription.id,
      optional: false,
    }),
    animal: r.one.animal({
      from: r.treatment.animalId,
      to: r.animal.id,
      optional: false,
    }),
    /** The work raised for this dose, which says whether it is due, late or done. */
    instance: r.one.sopInstance({
      from: r.treatment.instanceId,
      to: r.sopInstance.id,
      optional: false,
    }),
    giver: r.one.user({ from: r.treatment.givenBy, to: r.user.id }),
  },
  diagnosis: {
    animal: r.one.animal({
      from: r.diagnosis.animalId,
      to: r.animal.id,
      optional: false,
    }),
    /** What the round saw, when this Diagnosis answers one. */
    answers: r.one.observation({
      from: r.diagnosis.observationId,
      to: r.observation.id,
    }),
    /** The Vet whose act it is. */
    vet: r.one.user({
      from: r.diagnosis.diagnosedBy,
      to: r.user.id,
      optional: false,
    }),
    /** What was ordered for it — the next link in the health chain. */
    prescriptions: r.many.prescription({
      from: r.diagnosis.id,
      to: r.prescription.diagnosisId,
    }),
  },
  sopTraining: {
    definition: r.one.sopDefinition({
      from: r.sopTraining.definitionId,
      to: r.sopDefinition.id,
      optional: false,
    }),
    version: r.one.sopVersion({
      from: r.sopTraining.versionId,
      to: r.sopVersion.id,
      optional: false,
    }),
    person: r.one.user({ from: r.sopTraining.userId, to: r.user.id }),
  },
  sopDefinition: {
    versions: r.many.sopVersion({
      from: r.sopDefinition.id,
      to: r.sopVersion.definitionId,
    }),
    instances: r.many.sopInstance({
      from: r.sopDefinition.id,
      to: r.sopInstance.definitionId,
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
    /** The animal this work is about, when something that happened to her raised it. */
    animal: r.one.animal({ from: r.sopInstance.animalId, to: r.animal.id }),
  },
  observation: {
    animal: r.one.animal({
      from: r.observation.animalId,
      to: r.animal.id,
      optional: false,
    }),
    /** The Step that recorded what was seen. */
    completion: r.one.stepCompletion({
      from: r.observation.completionId,
      to: r.stepCompletion.id,
      optional: false,
    }),
    /** The person who saw it. */
    observer: r.one.user({ from: r.observation.seenBy, to: r.user.id }),
    /** What the Vet made of it — the next link in the health chain. */
    diagnoses: r.many.diagnosis({
      from: r.observation.id,
      to: r.diagnosis.observationId,
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
  alert: {
    user: r.one.user({ from: r.alert.userId, to: r.user.id, optional: false }),
  },
  auditEvent: {
    actor: r.one.user({ from: r.auditEvent.actorId, to: r.user.id }),
  },
  pushSubscription: {
    owner: r.one.user({
      from: r.pushSubscription.userId,
      to: r.user.id,
      optional: false,
    }),
    device: r.one.shedPhone({
      from: r.pushSubscription.deviceId,
      to: r.shedPhone.id,
    }),
  },
  needsReview: {
    raisedBy: r.one.auditEvent({
      from: r.needsReview.auditEventId,
      to: r.auditEvent.id,
      optional: false,
    }),
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
