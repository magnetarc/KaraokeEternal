-- Up
CREATE TABLE songCategories (
  songId INTEGER PRIMARY KEY REFERENCES songs(songId) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}'
);

-- Down
DROP TABLE songCategories;
