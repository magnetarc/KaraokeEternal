-- Up
-- Keep a missing selection's ID so a removed file never silently substitutes
-- another backing track. Queue.get already excludes unavailable media while
-- retaining their positions as anchors in the queue chain.
ALTER TABLE queue ADD COLUMN selectedMediaId INTEGER
  CHECK (selectedMediaId IS NULL OR (typeof(selectedMediaId) = 'integer' AND selectedMediaId > 0));

-- Down
ALTER TABLE queue DROP COLUMN selectedMediaId;
