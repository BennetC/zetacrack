import os,sys,json,sqlite3,threading,time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
root=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root))
scratch=root/'data/review-2026-10-14-correctness'
scratch.mkdir(exist_ok=True)
stamp=str(time.time_ns())
os.environ['ARITHMETIC_DB']=str(scratch/f'race-import-{stamp}.sqlite3')
from fastapi.testclient import TestClient
import server.app as module
from server.analytics import standard_config
body={'config':standard_config(),'seed':'race','generatorVersion':'zetamac-reverse-v1','policyVersion':'equal-operations-v1','measurementVersion':'response-timing-v1','mode':'standard','contentVersion':'zetamac-default-v1'}
with TestClient(module.create_app(scratch/f'race-{stamp}.sqlite3'),raise_server_exceptions=False) as client:
 identity=client.post('/api/sessions',json=body).json()['id']
 barrier=threading.Barrier(2)
 original=sqlite3.connect
 class RaceConnection(sqlite3.Connection):
  def execute(self,sql,*args,**kwargs):
   cursor=super().execute(sql,*args,**kwargs)
   if sql.startswith('SELECT event FROM observations WHERE session_id=? AND sequence=?'):barrier.wait(5)
   return cursor
 def connected(*args,**kwargs):return original(*args,**kwargs,factory=RaceConnection)
 module.sqlite3.connect=connected
 payload={'events':[{'sequence':0,'type':'session-started','elapsedMs':0,'payload':{}}]}
 try:
  with ThreadPoolExecutor(max_workers=2) as pool: responses=list(pool.map(lambda _:client.post(f'/api/sessions/{identity}/observations',json=payload),range(2)))
 finally:module.sqlite3.connect=original
 out={'synthetic':True,'schedule':'Two SELECTs for the same absent sequence complete before either INSERT.','responses':[{'status':r.status_code,'body':r.text} for r in responses],'stored':client.get(f'/api/sessions/{identity}').json()['events']}
 assert sorted(r.status_code for r in responses)==[200,500],out
 Path(__file__).with_name('concurrent-identical-append.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
 # Unmodified application path; no barriers, connection wrappers or delays.
 trials=[]
 with ThreadPoolExecutor(max_workers=8) as pool:
  for i in range(25):
   identity=client.post('/api/sessions',json=body).json()['id']
   batch={'events':[{'sequence':0,'type':'session-started','elapsedMs':0,'payload':{}},{'sequence':1,'type':'session-ended','elapsedMs':0,'payload':{'reason':'manual-end','endTimeKnown':True}}]}
   responses=list(pool.map(lambda _:client.post(f'/api/sessions/{identity}/observations',json=batch),range(8)))
   trials.append([r.status_code for r in responses])
 out={'synthetic':True,'runtimeCodeUnmodified':True,'attempts':200,'status500Count':sum(s==500 for row in trials for s in row),'trials':trials}
 Path(__file__).with_name('concurrent-identical-unmodified.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
 print(json.dumps(out))
