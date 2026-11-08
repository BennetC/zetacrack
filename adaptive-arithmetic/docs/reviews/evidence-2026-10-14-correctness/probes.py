import sys,os,json,random,tempfile
from pathlib import Path
from copy import deepcopy
root=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root))
scratch=root/'data'/'review-2026-10-14-correctness'
scratch.mkdir(exist_ok=True)
os.environ['ARITHMETIC_DB']=str(scratch/'probes-import.sqlite3')
from fastapi.testclient import TestClient
from server.app import create_app
from server.analytics import standard_config,analytics,histogram
from server.content import valid_pair_count
from tests.test_measurements import events,START
q={'id':'q0','index':0,'operation':'addition','groupId':'standard-addition','left':'2','right':'100','expected':'102','selection':{'operationBasisPoints':2500,'groupBasisPoints':10000,'validPairCount':'9801'}}
body={'config':standard_config(),'seed':'probe','generatorVersion':'zetamac-reverse-v1','policyVersion':'equal-operations-v1','measurementVersion':'response-timing-v1','mode':'standard','contentVersion':'zetamac-default-v1'}
results={}
with TestClient(create_app(scratch/'targeted.sqlite3'),raise_server_exceptions=False) as client:
  for case in ['valid','unknown-reference','invalid-value','invalid-index','correct-after-stale-reference','gap-after-correct']:
    raw=[START,('question-presented',0,{'question':deepcopy(q)})]
    if case=='unknown-reference': raw+=[('input-changed',5,{'questionId':'missing','value':'x'})]
    if case=='invalid-value': raw+=[('input-changed',5,{'questionId':'q0','value':False})]
    if case=='invalid-index': raw[1][2]['question']['index']=False
    raw+=[('input-changed',10,{'questionId':'q0','value':'102'}),('answer-accepted',10,{'questionId':'q0','value':'102'})]
    if case in ['correct-after-stale-reference','gap-after-correct']:
      raw+=[('question-presented',20,{'question':{**deepcopy(q),'id':'q1','index':1}})]
      if case=='correct-after-stale-reference': raw +=[('input-changed',30,{'questionId':'q0','value':'x'}),('input-changed',40,{'questionId':'q1','value':'102'}),('answer-accepted',40,{'questionId':'q1','value':'102'})]
    raw+=[('session-ended',120000,{'reason':'timeout','endTimeKnown':True,'wallAt':'2026-10-14T00:02:00Z'})]
    record=events(raw)
    if case=='gap-after-correct':
      for event in record[4:]:event['sequence']+=1
    identity=client.post('/api/sessions',json=body).json()['id']
    assert client.post(f'/api/sessions/{identity}/observations',json={'events':record}).status_code==200
    saved=client.get(f'/api/sessions/{identity}').json()
    exported=client.get(f'/api/sessions/{identity}/export?format=json').json()['sessions'][0]
    assert saved==exported and saved['events']==record
    included=client.get('/api/analytics',params={'includePartial':'true','cohort':saved['cohortKey']}).json()
    results[case]={'summary':saved['summary'],'questionTimes':[{k:x[k] for k in ['id','index','correctAnswerTimeMs','firstInputTimeMs','firstInputElapsedMs','inputChangeCount']} for x in saved['questions']],'comparisonEligible':saved['comparisonEligible'],'warnings':saved['dataQualityWarnings'],'cumulativePartialValidTimes':included['summary']['validCorrectAnswerCount']}
  assert results['invalid-value']['questionTimes'][0]['firstInputTimeMs']==5
  assert results['invalid-index']['summary']['validCorrectAnswerCount']==1
  assert results['correct-after-stale-reference']['questionTimes'][1]['correctAnswerTimeMs']==20
  # Standard/custom metadata pairing and atomic rollback, idempotence, count previews.
  assert client.post('/api/sessions',json={**body,'policyVersion':'hierarchical-shares-v1'}).status_code==422
  openid=client.post('/api/sessions',json=body).json()['id']
  preview=client.get('/api/sessions/deletion-preview').json()
  denied=client.request('DELETE','/api/sessions',json={'sessionIds':[preview['sessionIds'][0],openid]})
  assert denied.status_code==409 and client.get('/api/sessions/'+preview['sessionIds'][0]).status_code==200
  results['APIInvariantChecks']=['read/export equality for every case','raw events unchanged','fixed standard metadata rejected when inconsistent','mixed protected bulk scope rolls back']
# Independent randomized exact enumeration covers precision 0-3 signed bounds.
rng=random.Random(143828)
for _ in range(10000):
 p_a,p_b=rng.randrange(4),rng.randrange(4);lo_a,lo_b=rng.randrange(-80,81),rng.randrange(-80,81);hi_a,hi_b=lo_a+rng.randrange(9),lo_b+rng.randrange(9)
 def decimal(n,p): return ('-' if n<0 else '')+str(abs(n)//10**p)+('.'+str(abs(n)%10**p).zfill(p) if p else '')
 group={'first':{'min':decimal(lo_a,p_a),'max':decimal(hi_a,p_a),'decimalPlaces':p_a},'second':{'min':decimal(lo_b,p_b),'max':decimal(hi_b,p_b),'decimalPlaces':p_b},'allowNegative':False}
 for operation in ['addition','subtraction','multiplication','division']:
  expected=sum((a*10**p_b>=b*10**p_a if operation=='subtraction' else a!=0 if operation=='division' else True) for a in range(lo_a,hi_a+1) for b in range(lo_b,hi_b+1))
  assert valid_pair_count(operation,group)==expected
results['independentPairCountCases']=40000
for _ in range(1000):
 values=[rng.random()*rng.randrange(1,10000) for i in range(rng.randrange(30))]
 bins=histogram(values)
 assert sum(b['count'] for b in bins)==len(values)
 for b in bins:assert b['count']==sum(b['lowerMs']<=v and (v<=b['upperMs'] if b['upperInclusive'] else v<b['upperMs']) for v in values)
results['independentHistogramCases']=1000
out=Path(__file__).with_name('targeted-api-probes.json');out.write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
