CREATE UNIQUE INDEX "investment_agreement_investor_uidx" ON "investment_agreement" ("id","investor_id");--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_supersedes_id_audit_event_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "audit_event"("id");--> statement-breakpoint
ALTER TABLE "feeding" ADD CONSTRAINT "feeding_instance_id_sop_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "sop_instance"("id");--> statement-breakpoint
ALTER TABLE "feeding" ADD CONSTRAINT "feeding_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id");--> statement-breakpoint
ALTER TABLE "ration" ADD CONSTRAINT "ration_current_version_id_ration_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "ration_version"("id");--> statement-breakpoint
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id");--> statement-breakpoint
ALTER TABLE "medicine_count" ADD CONSTRAINT "medicine_count_completion_id_step_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "step_completion"("id");--> statement-breakpoint
ALTER TABLE "animal" ADD CONSTRAINT "animal_dam_id_animal_id_fkey" FOREIGN KEY ("dam_id") REFERENCES "animal"("id");--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_superseded_by_id_observation_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "observation"("id");--> statement-breakpoint
ALTER TABLE "paper_template" ADD CONSTRAINT "paper_template_tw6Brnnn6Vq7_fkey" FOREIGN KEY ("current_version_id") REFERENCES "paper_template_version"("id");--> statement-breakpoint
ALTER TABLE "sop_definition" ADD CONSTRAINT "sop_definition_current_version_id_sop_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "sop_version"("id");--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_internal_sale_id_internal_sale_id_fkey" FOREIGN KEY ("internal_sale_id") REFERENCES "internal_sale"("id");--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_sale_id_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id");--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_intake_id_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "intake"("id");--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_handover_id_handover_id_fkey" FOREIGN KEY ("handover_id") REFERENCES "handover"("id");--> statement-breakpoint
ALTER TABLE "venture_movement" ADD CONSTRAINT "venture_movement_refunds_id_venture_movement_id_fkey" FOREIGN KEY ("refunds_id") REFERENCES "venture_movement"("id");--> statement-breakpoint
ALTER TABLE "venture_settlement" ADD CONSTRAINT "venture_settlement_advance_repaid_id_venture_movement_id_fkey" FOREIGN KEY ("advance_repaid_id") REFERENCES "venture_movement"("id");--> statement-breakpoint
ALTER TABLE "venture_settlement" ADD CONSTRAINT "venture_settlement_farm_share_paid_id_venture_movement_id_fkey" FOREIGN KEY ("farm_share_paid_id") REFERENCES "venture_movement"("id");--> statement-breakpoint
ALTER TABLE "venture_settlement_share" ADD CONSTRAINT "venture_settlement_share_investor_id_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investor"("id");--> statement-breakpoint
ALTER TABLE "venture_settlement_share" ADD CONSTRAINT "venture_settlement_share_QoEuwYpUZuui_fkey" FOREIGN KEY ("paid_movement_id") REFERENCES "venture_movement"("id");--> statement-breakpoint
ALTER TABLE "venture_settlement_share" ADD CONSTRAINT "venture_settlement_share_agreement_investor_fk" FOREIGN KEY ("agreement_id","investor_id") REFERENCES "investment_agreement"("id","investor_id");