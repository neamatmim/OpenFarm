ALTER TABLE "feed_purchase_order" RENAME CONSTRAINT "feed_purchase_order_state_ck" TO "feed_purchase_order_state_known";--> statement-breakpoint
ALTER TABLE "feed_in" ADD CONSTRAINT "feed_in_paid_at_delivery_money_not_negative" CHECK ("paid_at_delivery_money" >= 0);--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_quantity_not_negative" CHECK ("quantity" >= 0);--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_unit_price_money_not_negative" CHECK ("unit_price_money" >= 0);--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_budget_money_not_negative" CHECK ("budget_money" >= 0);--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_lead_days_not_negative" CHECK ("lead_days" >= 0);--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_buffer_days_not_negative" CHECK ("buffer_days" >= 0);--> statement-breakpoint
ALTER TABLE "feed_purchase_order" ADD CONSTRAINT "feed_purchase_order_credit_days_not_negative" CHECK ("credit_days" >= 0);--> statement-breakpoint
ALTER TABLE "supplier_payment" ADD CONSTRAINT "supplier_payment_amount_money_not_negative" CHECK ("amount_money" >= 0);--> statement-breakpoint
ALTER TABLE "supplier_payment" ADD CONSTRAINT "supplier_payment_payment_method_known" CHECK ("payment_method" IN ('cash', 'mobile_money', 'bank'));--> statement-breakpoint
ALTER TABLE "supplier_payment" ADD CONSTRAINT "supplier_payment_recorded_by_role_known" CHECK ("recorded_by_role" IN ('owner', 'manager', 'staff', 'vet'));--> statement-breakpoint
ALTER TABLE "supplier_profile" ADD CONSTRAINT "supplier_profile_credit_days_not_negative" CHECK ("credit_days" >= 0);