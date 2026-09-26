-- Refused while any Venture still has prices set before plans existed and no plan: dropping the table would lose the
-- only prices it is projected from. Write that Venture a plan first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "venture_projection" p
    WHERE NOT EXISTS (SELECT 1 FROM "venture_plan" v WHERE v."venture_id" = p."venture_id")
  ) THEN
    RAISE EXCEPTION 'A Venture has projection prices but no Venture Plan; write it a plan before dropping venture_projection';
  END IF;
END $$;
--> statement-breakpoint
DROP TABLE "venture_projection";
