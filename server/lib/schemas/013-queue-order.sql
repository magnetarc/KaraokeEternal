-- Up
CREATE TABLE queueOrderMoves (
  moveId INTEGER PRIMARY KEY AUTOINCREMENT,
  roomId INTEGER NOT NULL REFERENCES rooms(roomId) ON DELETE CASCADE,
  queueId INTEGER NOT NULL REFERENCES queue(queueId) ON DELETE CASCADE,
  afterQueueId INTEGER REFERENCES queue(queueId) ON DELETE SET NULL
);
CREATE INDEX queueOrderMovesRoom ON queueOrderMoves(roomId,moveId);

-- Down
DROP TABLE queueOrderMoves;
