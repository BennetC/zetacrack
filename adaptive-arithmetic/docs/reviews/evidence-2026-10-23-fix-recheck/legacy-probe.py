"""Old-schema migration/read-only derivation with byte-preserved stored text."""
from pathlib import Path
import hashlib,json,os,sqlite3,sys,time
root=Path(__file__).resolve().parents[3];sys.path.insert(0,str(root))
scratch=root/'data'/('legacy-recheck-'+str(time.time_ns()));scratch.mkdir(parents=True)
os.environ['ARITHMETIC_DB']=str(scratch/'import.sqlite3')
from server.app import create_app
from fastapi.testclient import TestClient
from server.analytics import standard_config
database=scratch/'legacy.sqlite3'
config=standard_config();config['operations'][0]['groups'][0]['name']='Legacy Δ, "測定"\n'
def text(v):return json.dumps(v,ensure_ascii=False,indent=1)
with sqlite3.connect(database) as db:
    db.executescript('CREATE TABLE presets(id TEXT PRIMARY KEY,name TEXT,config TEXT); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE sessions(id TEXT PRIMARY KEY,config TEXT,seed TEXT,generator TEXT,policy TEXT,created_at TEXT,status TEXT); CREATE TABLE observations(session_id TEXT,sequence INTEGER,event TEXT,PRIMARY KEY(session_id,sequence));')
    db.execute('INSERT INTO presets VALUES(?,?,?)',('p','Legacy name',text(config)))
    db.execute('INSERT INTO settings VALUES(?,?)',('last-config',text(config)))
    for kind in ('missing-acceptance','bom-accepted','invalid-field'):
        db.execute('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)',(kind,text(config),'legacy-seed','exact-grid-v1','hierarchical-shares-v1','2026-09-01T12:00:00Z','ended'))
        q={'id':'old-q','index':0,'operation':'addition','groupId':'standard-addition','left':'2','right':'100','expected':'102','selection':{'operationBasisPoints':2500,'groupBasisPoints':10000,'validPairCount':'9801'}}
        raw=[('session-started',0,{}),('question-presented',0,{'question':q}),('input-changed',5,{'questionId':'old-q','value':False if kind=='invalid-field' else '\ufeff+00102.000\ufeff'}),('answer-accepted',10,{'questionId':'old-q',**({'value':'\ufeff+00102.000\ufeff'} if kind=='bom-accepted' else {})}),('session-ended',20,{'endTimeKnown':True,'reason':'manual-end'})]
        for n,(event,at,payload) in enumerate(raw):db.execute('INSERT INTO observations VALUES(?,?,?)',(kind,n,text({'sequence':n,'type':event,'elapsedMs':at,'payload':payload})))
def fingerprint():
    with sqlite3.connect(database) as db:
        rows={table:db.execute(query).fetchall() for table,query in {'presets':'SELECT * FROM presets ORDER BY id','settings':'SELECT * FROM settings ORDER BY key','sessions':'SELECT id,config,seed,generator,policy,created_at,status FROM sessions ORDER BY id','observations':'SELECT * FROM observations ORDER BY session_id,sequence'}.items()}
    return hashlib.sha256(text(rows).encode('utf-8')).hexdigest()
before=fingerprint();results=[]
with TestClient(create_app(database)) as client:
    for kind in ('missing-acceptance','bom-accepted','invalid-field'):
        saved=client.get('/api/sessions/'+kind).json()
        assert saved['measurementVersion'] is None and saved['mode'] is None and saved['contentVersion'] is None
        assert not saved['comparisonEligible']
        assert saved['summary']['validCorrectAnswerCount']==(0 if kind=='invalid-field' else 1)
        assert saved['questions'][0]['correctAnswerTimeMs']==(None if kind=='invalid-field' else 10)
        assert saved['config']==config
        assert client.get('/api/sessions/'+kind+'/export?format=json').json()['sessions']==[saved]
        results.append({'case':kind,'summary':saved['summary'],'unversioned':True,'comparisonEligible':False})
    client.get('/api/sessions');client.get('/api/analytics?includePartial=true');client.get('/api/exports/sessions?format=json');client.get('/api/exports/sessions?format=csv')
after=fingerprint();assert before==after
Path(__file__).with_name('legacy-probe.json').write_text(json.dumps({'synthetic':True,'beforeOriginalColumnHash':before,'afterOriginalColumnHash':after,'unchangedStoredTexts':True,'cases':results},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'legacyCases':len(results),'originalStoredTextsUnchanged':before==after}))
