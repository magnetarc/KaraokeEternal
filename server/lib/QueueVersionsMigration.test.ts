import { expect, it } from 'vitest'
import { copyFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseWrapper } from './Database.js'

it('upgrades an existing pre-version database while retaining users, media and queued songs', () => {
  const source = path.resolve(import.meta.dirname, '../..')
  const schemas = path.join(import.meta.dirname, 'schemas')
  const qa = path.join(source, 'qa-artifacts')
  mkdirSync(qa, { recursive: true })
  const old = mkdtempSync(path.join(qa, 'pre-version-migrations-'))
  const files = readdirSync(schemas).filter(name => /^00\d-|^010-/.test(name))
  for (const name of files) copyFileSync(path.join(schemas, name), path.join(old, name))
  const database = new DatabaseWrapper(':memory:')
  try {
    database.migrate({ migrationsPath: old })
    database.exec(`INSERT INTO artists(artistId,name,nameNorm) VALUES(1,'Fixture','fixture');
      INSERT INTO songs(songId,artistId,title,titleNorm) VALUES(1,1,'Song','song');
      INSERT INTO paths(pathId,path,priority) VALUES(1,'/fixture',0);
      INSERT INTO media(mediaId,songId,pathId,relPath,duration) VALUES(1,1,1,'demo.mp4',45);
      INSERT INTO users(userId,username,password,name,roleId) VALUES(1,'fixture','not-a-real-password','Fixture',(SELECT roleId FROM roles WHERE name='standard'));
      INSERT INTO rooms(roomId,name,status) VALUES(1,'Fixture room','open');
      INSERT INTO queue(queueId,roomId,songId,userId,prevQueueId) VALUES(1,1,1,1,NULL);`)
    database.migrate({ migrationsPath: schemas })
    expect(database.get('SELECT queueId,roomId,songId,userId,prevQueueId,selectedMediaId FROM queue')).toEqual({ queueId: 1, roomId: 1, songId: 1, userId: 1, prevQueueId: null, selectedMediaId: null })
    for (const table of ['users', 'media', 'songs']) expect(database.get(`SELECT COUNT(*) AS n FROM ${table}`)).toEqual({ n: 1 })
    expect(database.get('PRAGMA quick_check')).toEqual({ quick_check: 'ok' })
    expect(database.all('PRAGMA foreign_key_check')).toEqual([])
    database.migrate({ migrationsPath: old })
    expect(database.all<{ name: string }>('PRAGMA table_info(queue)').some(column => column.name === 'selectedMediaId')).toBe(false)
    expect(database.get('SELECT COUNT(*) AS n FROM queue')).toEqual({ n: 1 })
    expect(database.get('PRAGMA quick_check')).toEqual({ quick_check: 'ok' })
  } finally {
    database.close()
    for (const name of files) unlinkSync(path.join(old, name))
    rmdirSync(old)
  }
})
