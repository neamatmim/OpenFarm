import type { DiagnosisRow } from "./disease-history";
import { DISEASE_HISTORY } from "./disease-history";
import type { DeathRow } from "./mortality";
import { MORTALITY_REGISTER } from "./mortality";
import type { MovementRow } from "./movement-log";
import { MOVEMENT_LOG } from "./movement-log";
import type { Register, RegisterName } from "./register";
import type { TreatmentRow } from "./treatment";
import { TREATMENT_REGISTER } from "./treatment";
import type { VaccinationRow } from "./vaccination";
import { VACCINATION_REGISTER } from "./vaccination";

/** What each register's rows hold, by the name the trail records it under. */
export interface RegisterRows {
  vaccination_register: VaccinationRow;
  treatment_register: TreatmentRow;
  disease_history: DiagnosisRow;
  mortality_register: DeathRow;
  movement_log: MovementRow;
}

/**
 * Every register the farm keeps for an inspector, each declared in a file of its own.
 *
 * This list and the files it names are the whole of what a register is: the Inspector View's screen, its
 * papers, its spreadsheets and the Exports that record them are all worked out from here.
 */
export const REGISTERS: { [K in RegisterName]: Register<RegisterRows[K]> } = {
  vaccination_register: VACCINATION_REGISTER,
  treatment_register: TREATMENT_REGISTER,
  disease_history: DISEASE_HISTORY,
  mortality_register: MORTALITY_REGISTER,
  movement_log: MOVEMENT_LOG,
};
