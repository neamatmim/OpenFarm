-- What the farm keeps as it was written — the trail of who did what, and every Version of a procedure, a ration and
-- the paper an Investor agreed to — is refused a change or a removal by the database itself, not only by the app's
-- habits: a stray script, a console session or a store written tomorrow is turned away the same.

CREATE FUNCTION "kept_as_written"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is kept as it was written: it is never changed or removed', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;--> statement-breakpoint

-- A paper's wording is fixed once published. Its review — who read it and when — is written once, after: that one
-- change is let through, and nothing else.
CREATE FUNCTION "paper_wording_kept"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD."reviewed_on" IS NULL
    AND to_jsonb(NEW) - 'reviewed_by' - 'reviewed_on' - 'review_recorded_by'
      = to_jsonb(OLD) - 'reviewed_by' - 'reviewed_on' - 'review_recorded_by'
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'paper_template_version is kept as it was written: only its review is written, once'
    USING ERRCODE = 'restrict_violation';
END
$$;--> statement-breakpoint

CREATE TRIGGER "audit_event_kept" BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION "kept_as_written"();--> statement-breakpoint
CREATE TRIGGER "audit_event_not_emptied" BEFORE TRUNCATE ON "audit_event"
  FOR EACH STATEMENT EXECUTE FUNCTION "kept_as_written"();--> statement-breakpoint

CREATE TRIGGER "sop_version_kept" BEFORE UPDATE OR DELETE ON "sop_version"
  FOR EACH ROW EXECUTE FUNCTION "kept_as_written"();--> statement-breakpoint
CREATE TRIGGER "sop_version_not_emptied" BEFORE TRUNCATE ON "sop_version"
  FOR EACH STATEMENT EXECUTE FUNCTION "kept_as_written"();--> statement-breakpoint

CREATE TRIGGER "ration_version_kept" BEFORE UPDATE OR DELETE ON "ration_version"
  FOR EACH ROW EXECUTE FUNCTION "kept_as_written"();--> statement-breakpoint
CREATE TRIGGER "ration_version_not_emptied" BEFORE TRUNCATE ON "ration_version"
  FOR EACH STATEMENT EXECUTE FUNCTION "kept_as_written"();--> statement-breakpoint

CREATE TRIGGER "paper_template_version_kept" BEFORE UPDATE OR DELETE ON "paper_template_version"
  FOR EACH ROW EXECUTE FUNCTION "paper_wording_kept"();--> statement-breakpoint
CREATE TRIGGER "paper_template_version_not_emptied" BEFORE TRUNCATE ON "paper_template_version"
  FOR EACH STATEMENT EXECUTE FUNCTION "kept_as_written"();
