-- Up
CREATE TABLE catalogueEntries (
  entryId INTEGER PRIMARY KEY,
  identityKey TEXT NOT NULL UNIQUE,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  librarySongId INTEGER REFERENCES songs(songId) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'new',
  data TEXT NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  nextAttempt INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX catalogueState ON catalogueEntries(state, nextAttempt, entryId);
CREATE TABLE catalogueSources (
  entryId INTEGER NOT NULL REFERENCES catalogueEntries(entryId) ON DELETE CASCADE,
  sourceKey TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(entryId, sourceKey)
);
CREATE TABLE musicbrainzCache (
  url TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  retrievedAt TEXT NOT NULL
);
CREATE TABLE categoryProtection (
  songId INTEGER PRIMARY KEY REFERENCES songs(songId) ON DELETE CASCADE,
  locked INTEGER NOT NULL DEFAULT 1,
  evidence TEXT NOT NULL DEFAULT '{}'
);
-- Existing curated categories count as manual decisions, including blanks.
INSERT INTO categoryProtection(songId) SELECT songId FROM songCategories;
CREATE TABLE catalogueReviews (
  reviewId INTEGER PRIMARY KEY,
  entryId INTEGER NOT NULL REFERENCES catalogueEntries(entryId) ON DELETE CASCADE,
  userId INTEGER,
  reviewedAt TEXT NOT NULL,
  action TEXT NOT NULL,
  data TEXT NOT NULL
);
-- Down
DROP TABLE catalogueReviews;
DROP TABLE categoryProtection;
DROP TABLE musicbrainzCache;
DROP TABLE catalogueSources;
DROP TABLE catalogueEntries;
