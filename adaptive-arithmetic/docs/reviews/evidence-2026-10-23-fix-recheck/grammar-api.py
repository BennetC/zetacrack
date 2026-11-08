"""Consume independent client-generated decimal fixtures through real API paths."""
from pathlib import Path
from copy import deepcopy
import csv, io, json, os, sys, time
root=Path(__file__).resolve().parents[3];sys.path.insert(0,str(root))
scratch=root/'data'/('grammar-recheck-'+str(time.time_ns()));scratch.mkdir(parents=True)
os.environ['ARITHMETIC_DB']=str(scratch/'import.sqlite3')
from fastapi.testclient import TestClient
from server.app import create_app
source=json.loads(Path(__file__).with_name('grammar-fixtures.json').read_text(encoding='utf-8'))
out=[]
with TestClient(create_app(scratch/'grammar.sqlite3')) as client:
    for fixture in source['fixtures']:
        body={'config':fixture['config'],'seed':'independent-grammar','generatorVersion':'exact-grid-v1','policyVersion':'hierarchical-shares-v1','measurementVersion':'response-timing-v1','mode':'custom','contentVersion':'custom-grid-v1'}
        r=client.post('/api/sessions',json=body);assert r.status_code==201,(fixture['cp'],r.text)
        identity=r.json()['id'];q=fixture['q'];value=fixture['input']
        raw=[{'sequence':0,'type':'session-started','elapsedMs':0,'payload':{}},{'sequence':1,'type':'question-presented','elapsedMs':0.125,'payload':{'question':q}},{'sequence':2,'type':'input-changed','elapsedMs':0.125,'payload':{'questionId':q['id'],'value':value,'inputType':'insertFromPaste'}},{'sequence':3,'type':'answer-accepted','elapsedMs':2.75,'payload':{'questionId':q['id'],'value':value}},{'sequence':4,'type':'session-ended','elapsedMs':120000,'payload':{'endTimeKnown':True,'reason':'timeout'}}]
        assert client.post(f'/api/sessions/{identity}/observations',json={'events':raw}).status_code==200
        saved=client.get(f'/api/sessions/{identity}').json()
        assert saved['config']==fixture['config'] and saved['events']==raw
        assert saved['comparisonEligible'] and saved['score']==1
        assert saved['questions'][0]['firstInputTimeMs']==0 and saved['questions'][0]['correctAnswerTimeMs']==2.625
        assert saved['summary']['validCorrectAnswerCount']==1
        assert client.get(f'/api/sessions/{identity}/export?format=json').json()['sessions']==[saved]
        row=next(csv.DictReader(io.StringIO(client.get(f'/api/sessions/{identity}/export?format=csv').text)))
        assert json.loads(row['acceptedInputJson'])==value and json.loads(row['lastInputJson'])==value
        assert json.loads(row['configJson'])==fixture['config'] and row['expected']==q['expected']
        analysis=client.get('/api/analytics',params={'cohort':saved['cohortKey']}).json()
        assert analysis['summary']==saved['summary'] and sum(b['count'] for b in analysis['histogram'])==1
        out.append({'codePoint':fixture['cp'],'eligible':True,'rawAndExactPreserved':True,'savedSummaryJsonCsvGraphAgree':True})
    for cp in source['rejected']:
        body['config']=deepcopy(source['fixtures'][0]['config'])
        body['config']['operations'][0]['groups'][0]['first']['min']=chr(cp)+'10'+chr(cp)
        assert client.post('/api/sessions',json=body).status_code==422
Path(__file__).with_name('grammar-api.json').write_text(json.dumps({'synthetic':True,'acceptedFixtures':out,'rejectedConfigurationCodePoints':source['rejected']},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'acceptedClientApiFixtures':len(out),'rejectedConfigurations':len(source['rejected']),'hugeProductExact':True}))
