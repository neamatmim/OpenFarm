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
    /** How she went, for an animal who has left. */
    mortality: r.one.mortality({
      from: r.animal.id,
      to: r.mortality.animalId,
    }),
    /** How she arrived, for an animal the farm bought in. */
    intake: r.one.intake({ from: r.animal.id, to: r.intake.animalId }),
    /** Every time she has been on the scale. Fattening is the difference between them. */
    weighIns: r.many.weighIn({ from: r.animal.id, to: r.weighIn.animalId }),
    /** Every time she has been served, the ones that did not take included. */
    services: r.many.service({ from: r.animal.id, to: r.service.animalId }),
    /** Every pregnancy she lost before calving. */
    abortions: r.many.abortion({ from: r.animal.id, to: r.abortion.animalId }),
    /** Every answer somebody gave when she was raised as a Repeat Breeder. */
    repeatBreederAnswers: r.many.repeatBreederAnswer({
      from: r.animal.id,
      to: r.repeatBreederAnswer.animalId,
    }),
    /** Every time she has calved. */
    calvings: r.many.calving({ from: r.animal.id, to: r.calving.damId }),
    /** Her mother, for a calf born on this farm. */
    dam: r.one.animal({ from: r.animal.damId, to: r.animal.id }),
    /** Every time the Vet checked whether she was carrying, the negatives included. */
    pregnancyChecks: r.many.pregnancyCheck({
      from: r.animal.id,
      to: r.pregnancyCheck.animalId,
    }),
    /** How she left, for an animal sold to a buyer. */
    sale: r.one.sale({ from: r.animal.id, to: r.sale.animalId }),
    /** The Manager's last word on a Ready-for-Sale suggestion about her. */
    readySetAside: r.one.readySetAside({
      from: r.animal.id,
      to: r.readySetAside.animalId,
    }),
  },
  service: {
    animal: r.one.animal({
      from: r.service.animalId,
      to: r.animal.id,
      optional: false,
    }),
    /** The farm's own bull, for a natural service. */
    sire: r.one.animal({ from: r.service.sireAnimalId, to: r.animal.id }),
  },
  moneyEvent: {
    category: r.one.moneyCategory({
      from: r.moneyEvent.categoryId,
      to: r.moneyCategory.id,
      optional: false,
    }),
    counterparty: r.one.counterparty({
      from: r.moneyEvent.counterpartyId,
      to: r.counterparty.id,
    }),
    approver: r.one.user({ from: r.moneyEvent.approvedBy, to: r.user.id }),
    receipt: r.one.moneyReceipt({
      from: r.moneyEvent.id,
      to: r.moneyReceipt.moneyEventId,
    }),
    /** The Venture whose money this was, where it was not the Farm's. */
    purse: r.one.venture({
      from: r.moneyEvent.purseVentureId,
      to: r.venture.id,
    }),
  },
  medicinePurchase: {
    product: r.one.drugProduct({
      from: r.medicinePurchase.drugProductId,
      to: r.drugProduct.id,
      optional: false,
    }),
    seller: r.one.counterparty({
      from: r.medicinePurchase.counterpartyId,
      to: r.counterparty.id,
      optional: false,
    }),
  },
  vetFee: {
    animals: r.many.vetFeeAnimal({
      from: r.vetFee.id,
      to: r.vetFeeAnimal.vetFeeId,
    }),
  },
  vetFeeAnimal: {
    animal: r.one.animal({
      from: r.vetFeeAnimal.animalId,
      to: r.animal.id,
      optional: false,
    }),
  },
  dispatch: {
    buyer: r.one.counterparty({
      from: r.dispatch.buyerId,
      to: r.counterparty.id,
      optional: false,
    }),
  },
  stockCount: {
    feedItem: r.one.feedItem({
      from: r.stockCount.feedItemId,
      to: r.feedItem.id,
      optional: false,
    }),
    /** Who counted. */
    counter: r.one.user({ from: r.stockCount.countedBy, to: r.user.id }),
  },
  feedIn: {
    feedItem: r.one.feedItem({
      from: r.feedIn.feedItemId,
      to: r.feedItem.id,
      optional: false,
    }),
    /** Who the farm bought it from — the seller, as on an Intake. Null for a Harvest. */
    seller: r.one.counterparty({
      from: r.feedIn.counterpartyId,
      to: r.counterparty.id,
    }),
  },
  calving: {
    dam: r.one.animal({
      from: r.calving.damId,
      to: r.animal.id,
      optional: false,
    }),
    /** What was born — twins are two. */
    calves: r.many.animal({ from: r.calving.id, to: r.animal.calvingId }),
  },
  pregnancyCheck: {
    animal: r.one.animal({
      from: r.pregnancyCheck.animalId,
      to: r.animal.id,
      optional: false,
    }),
    /** The first service of the attempt checked. */
    service: r.one.service({
      from: r.pregnancyCheck.serviceId,
      to: r.service.id,
      optional: false,
    }),
  },
  sale: {
    animal: r.one.animal({
      from: r.sale.animalId,
      to: r.animal.id,
      optional: false,
    }),
    /** Who took her. */
    buyer: r.one.counterparty({
      from: r.sale.counterpartyId,
      to: r.counterparty.id,
      optional: false,
    }),
    recorder: r.one.user({ from: r.sale.recordedBy, to: r.user.id }),
  },
  readySetAside: {
    animal: r.one.animal({
      from: r.readySetAside.animalId,
      to: r.animal.id,
      optional: false,
    }),
    decidedBy: r.one.user({ from: r.readySetAside.setAsideBy, to: r.user.id }),
  },
  weighIn: {
    animal: r.one.animal({
      from: r.weighIn.animalId,
      to: r.animal.id,
      optional: false,
    }),
    weigher: r.one.user({ from: r.weighIn.recordedBy, to: r.user.id }),
  },
  intake: {
    animal: r.one.animal({
      from: r.intake.animalId,
      to: r.animal.id,
      optional: false,
    }),
    /** Who the farm bought her from. */
    seller: r.one.counterparty({
      from: r.intake.counterpartyId,
      to: r.counterparty.id,
    }),
    /** The outing she came home on, when she came home on one. */
    buyingTrip: r.one.buyingTrip({
      from: r.intake.buyingTripId,
      to: r.buyingTrip.id,
    }),
    recorder: r.one.user({ from: r.intake.recordedBy, to: r.user.id }),
  },
  buyingTrip: {
    /** The Animals that came home on it. */
    intakes: r.many.intake({
      from: r.buyingTrip.id,
      to: r.intake.buyingTripId,
    }),
  },
  mortality: {
    animal: r.one.animal({
      from: r.mortality.animalId,
      to: r.animal.id,
      optional: false,
    }),
    /** Who wrote it down: a mortality is evidence, so its author is part of it. */
    recorder: r.one.user({ from: r.mortality.recordedBy, to: r.user.id }),
    /** What she is said to have died of, when a Vet concluded it — and through it, the report
     *  the farm owed the office. */
    diagnosis: r.one.diagnosis({
      from: r.mortality.diagnosisId,
      to: r.diagnosis.id,
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
    mover: r.one.user({ from: r.animalMove.movedBy, to: r.user.id }),
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
    /** The course it belongs to, for a dose somebody prescribed. */
    prescription: r.one.prescription({
      from: r.treatment.prescriptionId,
      to: r.prescription.id,
    }),
    /** What went into her — a campaign's Version names it, a Prescription names it, and the
     *  Withdrawal is worked out from it either way. */
    product: r.one.drugProduct({
      from: r.treatment.productId,
      to: r.drugProduct.id,
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
  campaignLotNumber: {
    instance: r.one.sopInstance({
      from: r.campaignLotNumber.instanceId,
      to: r.sopInstance.id,
      optional: false,
    }),
  },
  notifiableDisease: {
    /** Who put it on the list — the list is evidence, so its author is part of it. */
    addedByPerson: r.one.user({
      from: r.notifiableDisease.addedBy,
      to: r.user.id,
    }),
  },
  dlsReport: {
    diagnosis: r.one.diagnosis({
      from: r.dlsReport.diagnosisId,
      to: r.diagnosis.id,
      optional: false,
    }),
    /** The work raised to report it, when the farm has a procedure for it. */
    instance: r.one.sopInstance({
      from: r.dlsReport.instanceId,
      to: r.sopInstance.id,
    }),
    /** Which of the farm's listed diseases it was reported as. */
    disease: r.one.notifiableDisease({
      from: r.dlsReport.diseaseId,
      to: r.notifiableDisease.id,
    }),
    deliverer: r.one.user({ from: r.dlsReport.deliveredBy, to: r.user.id }),
  },
  roleAssignment: {
    user: r.one.user({ from: r.roleAssignment.userId, to: r.user.id }),
  },
  vetCase: {
    animal: r.one.animal({
      from: r.vetCase.animalId,
      to: r.animal.id,
      optional: false,
    }),
    vet: r.one.user({ from: r.vetCase.vetId, to: r.user.id, optional: false }),
    opener: r.one.user({ from: r.vetCase.openedBy, to: r.user.id }),
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
    /** The report it owed the office, when the farm's list says it is notifiable. */
    report: r.one.dlsReport({
      from: r.diagnosis.id,
      to: r.dlsReport.diagnosisId,
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
    /** The Lot Number a vaccination Campaign was given from. */
    campaignLotNumber: r.one.campaignLotNumber({
      from: r.sopInstance.id,
      to: r.campaignLotNumber.instanceId,
    }),
    /** The report this work is about, when a notifiable Diagnosis raised it. */
    report: r.one.dlsReport({
      from: r.sopInstance.id,
      to: r.dlsReport.instanceId,
    }),
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
    /** The Step that recorded what was seen, when a round did. */
    completion: r.one.stepCompletion({
      from: r.observation.completionId,
      to: r.stepCompletion.id,
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
