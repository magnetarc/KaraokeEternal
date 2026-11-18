"""Create deterministic, balanced input shards for in-chat model classification."""
from pathlib import Path
import hashlib
import json
import sqlite3
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Catalogue' / 'LLM classification'
OUT.mkdir(exist_ok=True)
db = sqlite3.connect('file:' + str((ROOT / 'source/.test-instance/database.sqlite3').resolve()) + '?mode=ro', uri=True)
groups = {}
for entry_id, artist, title in db.execute('SELECT entryId,artist,title FROM catalogueEntries ORDER BY entryId'):
    groups.setdefault(artist, []).append([entry_id, artist, title])
shards = [[], [], []]
for artist, rows in sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0].casefold())):
    min(shards, key=len).extend(rows)
manifest = []
for i, rows in enumerate(shards):
    payload = json.dumps(rows, ensure_ascii=False, separators=(',', ':'))
    (OUT / f'input-{i}.json').write_text(payload, encoding='utf-8')
    (OUT / f'output-{i}').mkdir(exist_ok=True)
    manifest.append({'shard':i,'rows':len(rows),'sha256':hashlib.sha256(payload.encode()).hexdigest()})
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
