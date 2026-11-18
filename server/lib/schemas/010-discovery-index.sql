-- Up
CREATE TABLE catalogueSuggestions (
  entryId INTEGER PRIMARY KEY REFERENCES catalogueEntries(entryId) ON DELETE CASCADE,
  data TEXT NOT NULL,
  model TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE TABLE artistContexts (
  artist TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE TABLE catalogueStars (
  entryId INTEGER NOT NULL REFERENCES catalogueEntries(entryId) ON DELETE CASCADE,
  userId INTEGER NOT NULL REFERENCES users(userId) ON DELETE CASCADE,
  PRIMARY KEY(entryId,userId)
);
CREATE VIRTUAL TABLE catalogueSearch USING fts5(artist,title,content='catalogueEntries',content_rowid='entryId',tokenize='unicode61 remove_diacritics 2');
INSERT INTO catalogueSearch(catalogueSearch) VALUES ('rebuild');
CREATE TRIGGER catalogueSearchInsert AFTER INSERT ON catalogueEntries BEGIN
  INSERT INTO catalogueSearch(rowid,artist,title) VALUES (new.entryId,new.artist,new.title);
END;
CREATE TRIGGER catalogueSearchDelete AFTER DELETE ON catalogueEntries BEGIN
  INSERT INTO catalogueSearch(catalogueSearch,rowid,artist,title) VALUES ('delete',old.entryId,old.artist,old.title);
END;
CREATE TRIGGER catalogueSearchUpdate AFTER UPDATE OF artist,title ON catalogueEntries BEGIN
  INSERT INTO catalogueSearch(catalogueSearch,rowid,artist,title) VALUES ('delete',old.entryId,old.artist,old.title);
  INSERT INTO catalogueSearch(rowid,artist,title) VALUES (new.entryId,new.artist,new.title);
END;
CREATE VIEW catalogueBrowse AS
SELECT e.entryId,e.artist,e.title,e.librarySongId,
  COALESCE(sc.data,json_extract(e.data,'$.approved'),json_extract(s.data,'$.categories'),'{}') AS categories,
  COALESCE(json_extract(s.data,'$.popularity'),0) AS popularity,
  COALESCE(json_extract(e.data,'$.discoveryFeatured'),0) AS featured,
  CASE WHEN sc.data IS NOT NULL THEN 'library' WHEN json_extract(e.data,'$.approved') IS NOT NULL THEN 'reviewed' WHEN s.entryId IS NOT NULL THEN 'suggested' ELSE 'unknown' END AS categorySource,
  COALESCE(json_extract(s.data,'$.styleBasis'),'') AS styleBasis,
  EXISTS(SELECT 1 FROM media m INNER JOIN paths p ON p.pathId=m.pathId WHERE m.songId=e.librarySongId) AS available
FROM catalogueEntries e LEFT JOIN catalogueSuggestions s ON s.entryId=e.entryId LEFT JOIN songCategories sc ON sc.songId=e.librarySongId;
-- Down
DROP VIEW catalogueBrowse;
DROP TRIGGER catalogueSearchUpdate;
DROP TRIGGER catalogueSearchDelete;
DROP TRIGGER catalogueSearchInsert;
DROP TABLE catalogueSearch;
DROP TABLE catalogueStars;
DROP TABLE artistContexts;
DROP TABLE catalogueSuggestions;
