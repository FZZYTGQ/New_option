ALTER TABLE history ADD COLUMN updated_at TEXT;

UPDATE history SET updated_at = created_at WHERE updated_at IS NULL;
