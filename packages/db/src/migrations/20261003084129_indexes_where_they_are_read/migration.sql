DROP INDEX "step_completion_instance_idx";--> statement-breakpoint
DROP INDEX "drug_product_farm_idx";--> statement-breakpoint
DROP INDEX "notifiable_disease_farm_idx";--> statement-breakpoint
CREATE INDEX "animal_owner_venture_idx" ON "animal" ("owner_venture_id");--> statement-breakpoint
CREATE INDEX "sop_instance_animal_idx" ON "sop_instance" ("animal_id");--> statement-breakpoint
CREATE INDEX "step_completion_animal_idx" ON "step_completion" ("animal_id");--> statement-breakpoint
CREATE INDEX "investment_agreement_investor_idx" ON "investment_agreement" ("investor_id");--> statement-breakpoint
CREATE INDEX "venture_movement_agreement_idx" ON "venture_movement" ("agreement_id");