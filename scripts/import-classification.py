"""Validate genuine in-chat model batches and import suggestions, never approvals."""
from pathlib import Path
from datetime import datetime, timezone
import collections
import hashlib
import json
import re
import sqlite3
ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / 'Catalogue/LLM classification'
DATA = ROOT / 'source/.test-instance'
GENRES = {'Pop','Rock','Country','R&B/Soul','Hip-Hop/Rap','Dance/Electronic','Jazz/Swing','Blues','Folk/Acoustic','Reggae/Ska','Latin','Classical/Opera','Musical Theatre','Film/TV',"Children's",'Gospel/Christian','World','Easy Listening','Punk','Metal','Disco','Funk'}
COLLECTIONS = {'Christmas','Party starters','Ballads','Wedding favourites','Family favourites','Musicals','Irish favourites'}

def strings(values, allowed=None, maximum=16):
    if not isinstance(values,list) or len(values)>maximum or any(not isinstance(v,str) or not v.strip() or len(v)>40 or re.search(r'[\x00-\x1f]',v) for v in values):
        raise ValueError('Invalid bounded string array')
    if allowed and any(v not in allowed for v in values): raise ValueError('Unrecognised category')
    return list(dict.fromkeys(values))

def load():
    all_rows={}; decisions={}; covered=set(); profiles=collections.defaultdict(collections.Counter); chunks=[]
    for shard in range(3):
        payload=(FOLDER/f'input-{shard}.json').read_bytes()
        rows=json.loads(payload)
        all_rows.update({r[0]:r for r in rows})
        previous=0
        for file in sorted((FOLDER/f'output-{shard}').glob('chunk-*.json')):
            data=json.loads(file.read_text(encoding='utf-8-sig'))
            offset=data['offset']; count=data['count']; expected=rows[offset:offset+count]
            if data.get('schema')!=1 or data.get('model')!='gpt-6-luna' or data.get('shard')!=shard or offset!=previous or count<1 or len(expected)!=count:
                raise ValueError(f'Invalid or nonconsecutive chunk {file}')
            ids={r[0] for r in expected}; artists={r[1] for r in expected}
            found=[]
            for row in data['songs']:
                if not isinstance(row,list) or len(row)!=7: raise ValueError(f'Bad song tuple in {file}')
                entry_id,genres,languages,decade,performance,coll,popularity=row
                if not isinstance(entry_id,int) or entry_id not in ids: raise ValueError(f'Unexpected ID in {file}')
                strings(genres,GENRES,3); strings(languages); strings(coll,COLLECTIONS,12)
                if not isinstance(decade,str) or (decade and not re.fullmatch(r'(18|19|20)\d0s',decade)): raise ValueError('Invalid decade')
                if performance not in ('','Solo','Duet','Group'): raise ValueError('Invalid arrangement')
                if type(popularity) is not int or popularity not in range(4): raise ValueError('Invalid editorial rank')
                decisions[entry_id]=row; found.append(entry_id)
            unknown=data['unknownIds']
            if not isinstance(unknown,list) or any(type(i) is not int for i in unknown): raise ValueError('Invalid unknown IDs')
            found+=unknown
            if len(found)!=count or len(set(found))!=count or set(found)!=ids or covered.intersection(ids): raise ValueError(f'Coverage mismatch in {file}')
            for artist,genres in data['profiles']:
                if artist not in artists: raise ValueError(f'Profile outside current slice: {artist}')
                strings(genres,GENRES,3); profiles[artist].update(genres)
            covered.update(ids); previous+=count
            chunks.append({'file':str(file.relative_to(FOLDER)),'rows':count,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
    return all_rows,decisions,covered,profiles,chunks

def main():
    rows,decisions,covered,profiles,chunks=load()
    audit_file=FOLDER/'Audit/proposed-patches.json'
    audit_applied=[]; audit_conflicts=[]
    if audit_file.exists():
        for patch in json.loads(audit_file.read_text(encoding='utf-8-sig'))['patches']:
            entry_id=patch['input'][0]
            if rows.get(entry_id)==patch['input'] and decisions.get(entry_id)==patch['suggestion']:
                decisions[entry_id]=patch['replacementSuggestion']
                audit_applied.append(entry_id)
            else: audit_conflicts.append(entry_id)
    supplemental=[]; supplemental_models={}
    for file in sorted((FOLDER/'Audit').glob('supplemental-recognition*.json')):
        data=json.loads(file.read_text(encoding='utf-8-sig'))
        shard=data.get('shard',2); start=data['coveredOffset']; count=data['count']
        input_rows=json.loads((FOLDER/f'input-{shard}.json').read_text(encoding='utf-8-sig'))[start:start+count]
        expected={row[0] for row in input_rows}; found=[]
        for decision in data['songs']:
            entry_id,genres,languages,decade,performance,coll,popularity=decision
            strings(genres,GENRES,3); strings(coll,COLLECTIONS,12)
            if languages or decade or performance or type(popularity) is not int or popularity not in range(4): raise ValueError('Supplement must contain discovery context only')
            if entry_id not in expected or entry_id in decisions: raise ValueError('Supplement overlaps existing decision')
            decisions[entry_id]=decision; supplemental_models[entry_id]=data['model']; found.append(entry_id)
        found+=data['unknownIds']+data.get('excludedIds',[])
        if len(found)!=count or set(found)!=expected or len(set(found))!=count: raise ValueError('Supplement coverage mismatch')
        supplemental.append({'file':file.name,'model':data['model'],'recognised':len(data['songs']),'unknown':len(data['unknownIds'])})
    if (DATA/'preview-server.pid').exists(): raise RuntimeError('Stop preview before suggestion import')
    db=sqlite3.connect(DATA/'database.sqlite3')
    db.execute('PRAGMA foreign_keys=ON')
    if db.execute("SELECT data FROM prefs WHERE key='modernTestInstance'").fetchone()!=('true',): raise RuntimeError('Unmarked database')
    if not db.execute("SELECT 1 FROM sqlite_master WHERE name='catalogueSuggestions'").fetchone(): raise RuntimeError('Run server migration 010 first')
    stamp=datetime.now(timezone.utc).isoformat()
    contexts={artist:json.loads(data) for artist,data in db.execute('SELECT artist,data FROM artistContexts')}
    metrics=collections.Counter()
    try:
        with db:
            for entry_id in sorted(covered):
                _,artist,title=rows[entry_id]
                decision=decisions.get(entry_id,[entry_id,[],[],'','',[],0])
                _,genres,languages,decade,performance,coll,popularity=decision
                # The independent focused audit found version/date/language
                # inference errors. Preserve raw output, but serve no model-only
                # factual fields until a host verifies the actual recording.
                held_facts={'languages':languages,'decade':decade,'performance':performance}
                languages=[]; decade=''; performance=''
                model_context=[g for g,_ in profiles[artist].most_common(3)]
                api_context=contexts.get(artist,{})
                api_styles=api_context.get('styles',[]) if api_context.get('state')=='candidate' else []
                context=api_styles or model_context
                if artist.casefold()=='chicago' or api_context.get('state')=='ambiguous': context=[]
                effective=genres or context
                basis='song_suggestion' if genres else 'artist_musicbrainz' if api_styles and context else 'artist_model' if context else 'unknown'
                categories={'genre':effective[0] if effective else '', 'genres':effective,'language':languages[0] if languages else '', 'languages':languages,'decade':decade,'performance':performance,'collections':coll}
                artist_reference={key:api_context.get(key) for key in ['artistId','url','retrievedAt','state']} if api_styles and context else None
                model=supplemental_models.get(entry_id,'gpt-6-luna')
                data={'categories':categories,'styleBasis':basis,'popularity':popularity,'heldFacts':held_facts,'provenance':{'model':model,'kind':'model_suggestion','artistContext':context,'artistSource':artist_reference,'reviewed':False,'policy':'Model-only language, decade and voices withheld after independent focused audit.'}}
                db.execute('INSERT INTO catalogueSuggestions(entryId,data,model,updatedAt) VALUES (?,?,?,?) ON CONFLICT(entryId) DO UPDATE SET data=excluded.data,model=excluded.model,updatedAt=excluded.updatedAt',(entry_id,json.dumps(data,ensure_ascii=False,separators=(',',':')),model,stamp))
                metrics['processed']+=1; metrics['withStyle']+=bool(effective); metrics['withSongStyle']+=bool(genres); metrics['withLanguage']+=bool(languages); metrics['withDecade']+=bool(decade); metrics['withArrangement']+=bool(performance); metrics['withCollections']+=bool(coll); metrics['withEditorialRank']+=popularity>0
    finally: db.close()
    report={'importedAt':stamp,'model':'gpt-6-luna','supplemental':supplemental,'total':len(rows),'covered':len(covered),'complete':len(covered)==len(rows),'metrics':dict(metrics),'artistProfiles':len(profiles),'artistProfilesWithStyles':sum(bool(profile) for profile in profiles.values()),'auditApplied':audit_applied,'auditConflicts':audit_conflicts,'chunks':chunks,'note':'Model genre/collection/editorial suggestions and artist context only. Model language/decade/voices quarantined; no factual verification or approvals implied.'}
    (FOLDER/'import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='chunks'},indent=2))

if __name__=='__main__': main()
