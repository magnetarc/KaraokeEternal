import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const fixture = `
import assert from 'node:assert/strict';
const {initLogger}=await import('/app/build/server/lib/Log.js');initLogger('versions-ci',{console:{level:1},file:{level:0}});
const database=await import('/app/build/server/lib/Database.js');
const {default:Media}=await import('/app/build/server/Media/Media.js');
const {default:Queue}=await import('/app/build/server/Queue/Queue.js');
database.open({file:':memory:',ro:false});
const db=database.db;
try{
const put=(sql,args=[])=>Number(db.run(sql,args).lastID);
const a=put("INSERT INTO artists(name,nameNorm)VALUES('Fixture','fixture')");
const s=put("INSERT INTO songs(artistId,title,titleNorm)VALUES(?,'Fictional Song','fictional song')",[a]);
const p=put("INSERT INTO paths(path,priority)VALUES('/fixture',0)");
const u=put("INSERT INTO users(username,password,name,roleId)VALUES('fixture','x','Fixture',(SELECT roleId FROM roles WHERE name='standard'))");
const r=put("INSERT INTO rooms(name,status)VALUES('Fixture','open')");
const first=Media.add({songId:s,pathId:p,relPath:'default.mp4',duration:45});
const second=Media.add({songId:s,pathId:p,relPath:'selected.mp4',duration:48});
Media.setPreferred(first,true);Queue.add({roomId:r,songId:s,userId:u,mediaId:second});
const q=Queue.get(r);assert.equal(q.entities[q.result[0]].mediaId,second);assert.equal(q.entities[q.result[0]].selectedMediaId,second);
assert.throws(()=>Queue.add({roomId:r,songId:s,userId:u,mediaId:9999}));
assert.equal(db.get('PRAGMA quick_check').quick_check,'ok');
console.log('PASS: Linux image migration and exact-version queue selection preserve the requested backing track');
}finally{database.close()}
`
const result = spawnSync('docker', ['run', '--rm', process.argv[2] ?? 'karaoke-modern:ci', 'node', '--input-type=module', '-e', fixture], { encoding: 'utf8' })
assert.equal(result.status, 0, result.stdout + result.stderr)
console.log(result.stdout)
