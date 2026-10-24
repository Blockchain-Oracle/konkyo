-- Every folder knows the space (top-level folder) it belongs to (plan §16.9 decision 1).
-- Back-fill first, then the triggers keep it current for every insert path and every move.
WITH RECURSIVE tree AS (
  SELECT id, id AS root FROM folders WHERE parent_id IS NULL
  UNION ALL
  SELECT f.id, tree.root FROM folders f JOIN tree ON f.parent_id = tree.id
)
UPDATE folders f SET space_id = tree.root FROM tree WHERE f.id = tree.id;
--> statement-breakpoint
-- On insert or a new parent: a top-level folder is its own space; anything else takes its parent's.
-- Column defaults are evaluated before BEFORE triggers, so new.id is already set.
CREATE OR REPLACE FUNCTION folders_set_space() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF new.parent_id IS NULL THEN
    new.space_id := new.id;
  ELSE
    SELECT space_id INTO new.space_id FROM folders WHERE id = new.parent_id;
  END IF;
  RETURN new;
END $$;
--> statement-breakpoint
CREATE TRIGGER folders_space_biu BEFORE INSERT OR UPDATE OF parent_id ON folders
  FOR EACH ROW EXECUTE FUNCTION folders_set_space();
--> statement-breakpoint
-- When a folder changes space (it was moved: a column trigger fires only for columns named in the
-- UPDATE, so it listens to parent_id too), its whole subtree follows. The depth guard stops
-- the subtree's own updates from cascading again.
CREATE OR REPLACE FUNCTION folders_cascade_space() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR new.space_id IS NOT DISTINCT FROM old.space_id THEN
    RETURN NULL;
  END IF;
  WITH RECURSIVE below AS (
    SELECT id FROM folders WHERE parent_id = new.id
    UNION ALL
    SELECT f.id FROM folders f JOIN below ON f.parent_id = below.id
  )
  UPDATE folders SET space_id = new.space_id WHERE id IN (SELECT id FROM below);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER folders_space_au AFTER UPDATE OF parent_id, space_id ON folders
  FOR EACH ROW EXECUTE FUNCTION folders_cascade_space();
