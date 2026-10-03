-- An Investor signs in as their mobile number the way the whole world writes it, without its +: 8801711234567, not the
-- 01711234567 a farm in Bangladesh writes. Every one so far was a Bangladeshi number, so each takes 880 for its 0.
UPDATE "user" SET "email" = '88' || "email"
WHERE "email" ~ '^01[0-9]{9}@investor\.openfarm\.invalid$';--> statement-breakpoint
UPDATE "investor_access" SET "login_email" = '88' || "login_email"
WHERE "login_email" ~ '^01[0-9]{9}@investor\.openfarm\.invalid$';
