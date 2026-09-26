-- Refused while any animal still has a breed typed and none from the farm's list: dropping the column would lose
-- the only record of it. The list's own migration carried every typed breed into it; this is the check that it did.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "animal" WHERE "breed" IS NOT NULL AND "breed_id" IS NULL) THEN
    RAISE EXCEPTION 'An animal has a breed typed but none from the farm''s list; add it to the list before dropping animal.breed';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "animal" DROP COLUMN "breed";
