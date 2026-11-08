"""Independent synthetic patch-review oracles, not production fixtures."""
from pathlib import Path
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from collections import Counter
from fractions import Fraction
from time import time_ns
import csv, io, json, os, sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
SCRATCH = ROOT / 'data' / ('independent-recheck-' + str(time_ns()))
SCRATCH.mkdir(parents=True)
os.environ['ARITHMETIC_DB'] = str(SCRATCH / 'import.sqlite3')
from fastapi.testclient import TestClient
from server.app import create_app, ticks
from server.analytics import standard_config
from server.decimal_input import exact
from server.measurements import derive_session

OUT = {'synthetic': True, 'contention': {}, 'timingCases': {}, 'grammar': {}}
BODY = {'config': standard_config(), 'seed': 'independent-review', 'generatorVersion': 'zetamac-reverse-v1', 'policyVersion': 'equal-operations-v1', 'measurementVersion': 'response-timing-v1', 'mode': 'standard', 'contentVersion': 'zetamac-default-v1'}

def q(n):
    return {'id': 'q'+str(n), 'index': n, 'operation': 'addition', 'groupId': 'standard-addition', 'left': '2', 'right': '100', 'expected': '102', 'selection': {'operationBasisPoints':2500,'groupBasisPoints':10000,'validPairCount':'9801'}}
def ev(kind, at, payload): return {'sequence': 0, 'type':kind, 'elapsedMs':at, 'payload':payload}
def numbered(items):
    for i, event in enumerate(items): event['sequence'] = i
    return items
def basic():
    items=[ev('session-started',0,{})]
    for n in range(3):
        items += [ev('question-presented', n*20, {'question':q(n)}), ev('input-changed', n*20+10, {'questionId':'q'+str(n),'value':'102'}), ev('answer-accepted', n*20+10, {'questionId':'q'+str(n),'value':'102'})]
    return numbered(items + [ev('session-ended',120000,{'reason':'timeout','endTimeKnown':True})])
def create(client, body=BODY):
    response=client.post('/api/sessions',json=body)
    assert response.status_code==201, response.text
    return response.json()['id']

with TestClient(create_app(SCRATCH/'probes.sqlite3'), raise_server_exceptions=False) as client:
    # 32 synchronized callers, mixed compatible suffixes, not just identical starts.
    short=numbered([ev('session-started',0,{})])
    long=numbered([*deepcopy(short),ev('session-ended',0,{'endTimeKnown':True,'reason':'manual-end'})])
    statuses=[]
    with ThreadPoolExecutor(max_workers=32) as pool:
        for trial in range(12):
            identity=create(client)
            barrier=Barrier(32)
            def append(i):
                barrier.wait(20)
                return client.post(f'/api/sessions/{identity}/observations',json={'events':long if i%2 else short}).status_code
            statuses += list(pool.map(append, range(32)))
            saved=client.get(f'/api/sessions/{identity}').json()
            assert saved['events']==long and saved['status']=='ended'
    assert statuses==[200]*384, Counter(statuses)
    # Mutually disagreeing writers: one immutable winner, exactly 409 otherwise.
    conflict_status=[]
    for trial in range(8):
        identity=create(client); barrier=Barrier(16)
        def conflict(i):
            batch=deepcopy(short); batch[0]['payload']={'writer':i}
            barrier.wait(20)
            return i,client.post(f'/api/sessions/{identity}/observations',json={'events':batch}).status_code
        with ThreadPoolExecutor(max_workers=16) as pool: outcomes=list(pool.map(conflict,range(16)))
        assert Counter(s for _,s in outcomes)=={200:1,409:15},outcomes
        winner=next(i for i,s in outcomes if s==200)
        saved=client.get(f'/api/sessions/{identity}').json()
        assert saved['events'][0]['payload']=={'writer':winner} and saved['status']=='open'
        # A new terminal before conflicting prefix must roll back as a whole.
        wrong=deepcopy(short[0]); wrong['payload']={'writer':-1}
        response=client.post(f'/api/sessions/{identity}/observations',json={'events':[long[1],wrong]})
        assert response.status_code==409
        assert client.get(f'/api/sessions/{identity}').json()==saved
        conflict_status += [s for _,s in outcomes]
    OUT['contention']={'compatibleRequests':len(statuses),'compatibleStatusCounts':dict(Counter(statuses)),'conflictingRequests':len(conflict_status),'conflictingStatusCounts':dict(Counter(conflict_status)),'atomicRollbackTrials':8}

    # Revisit the original six traces separately using their repaired oracles.
    old_cases={'valid':1,'unknown-reference':0,'invalid-value':0,'invalid-index':0,'stale-after-complete':1,'gap-after-complete':1}
    cases=[]
    for name, count in old_cases.items():
        raw=basic()[:4]
        if name=='unknown-reference': raw.insert(2,ev('input-changed',5,{'questionId':'absent','value':'x'}))
        if name=='invalid-value': raw.insert(2,ev('input-changed',5,{'questionId':'q0','value':False}))
        if name=='invalid-index': raw[1]['payload']['question']['index']=False
        if name in ('stale-after-complete','gap-after-complete'):
            raw += [ev('question-presented',20,{'question':q(1)})]
            if name=='stale-after-complete': raw += [ev('input-changed',25,{'questionId':'q0','value':'x'}),ev('answer-accepted',30,{'questionId':'q1','value':'102'})]
        raw=numbered(raw+[ev('session-ended',120000,{'endTimeKnown':True,'reason':'timeout'})])
        if name=='gap-after-complete':
            for e in raw[4:]: e['sequence'] += 1
        cases.append((name,raw,[10 if count else None]+([None] if name in ('stale-after-complete','gap-after-complete') else [])))

    for label,value in [('false',False),('true',True),('list',[]),('object',{}),('number',123),('null',None)]:
        for kind in ('input-changed','answer-accepted'):
            raw=basic(); raw[2 if kind=='input-changed' else 3]['payload']['value']=value
            cases.append((kind+'-malformed-'+label,raw,[None,10,10]))
    for value in (False,-1,None,'0',0.5):
        raw=basic(); raw[1]['payload']['question']['index']=value
        cases.append(('index-'+repr(value),raw,[None,10,10]))
    for ref in (None,False,[],{},'unseen','q0'):
        raw=basic();raw.insert(5,ev('input-changed',25,{'questionId':ref,'value':'x'}));numbered(raw)
        cases.append(('current-reference-'+repr(ref),raw,[10,None,None]))
    for label,extra in [('repeated-accept',ev('answer-accepted',11,{'questionId':'q0','value':'102'})),('stale-between',ev('input-changed',11,{'questionId':'q0','value':'x'})),('unknown-between',ev('input-changed',11,{'questionId':'unknown','value':'x'})),('repeated-start',ev('session-started',11,{}))]:
        raw=basic();raw.insert(4,extra);numbered(raw);cases.append((label,raw,[10,None,None]))
    for first_damage in (3,4,5,7):
        raw=basic()
        for e in raw[first_damage:]: e['sequence'] += 2
        expected=[None,None,None] if first_damage==3 else [10,None,None] if first_damage in (4,5) else [10,10,None]
        cases.append(('gap-start-'+str(first_damage),raw,expected))
    raw=basic();raw[4]['elapsedMs']=9;cases.append(('clock-just-after-acceptance',raw,[10,None,None]))
    raw=basic();raw[4]['payload']['question']=q(0);raw[5]['payload']['questionId']='q0';raw[6]['payload']['questionId']='q0';cases.append(('duplicate-presentation-identity',raw,[None,None,None]))
    cumulative=0
    for name,raw,expected in cases:
        identity=create(client)
        assert client.post(f'/api/sessions/{identity}/observations',json={'events':raw}).status_code==200
        before=deepcopy(raw)
        saved=client.get(f'/api/sessions/{identity}').json()
        actual=[q['correctAnswerTimeMs'] for q in saved['questions']]
        assert actual==expected,(name,actual,expected)
        assert saved['events']==before
        assert saved['config']==BODY['config']
        assert saved==client.get(f'/api/sessions/{identity}/export?format=json').json()['sessions'][0]
        rows=list(csv.DictReader(io.StringIO(client.get(f'/api/sessions/{identity}/export?format=csv').text)))
        assert [float(row['correctAnswerTimeMs']) if row['correctAnswerTimeMs'] else None for row in rows]==expected
        assert saved['summary']==saved['analysis']['summary']
        cumulative+=sum(value is not None for value in expected)
        analysis=client.get('/api/analytics',params={'cohort':saved['cohortKey'],'includePartial':'true'}).json()
        assert analysis['summary']['validCorrectAnswerCount']==cumulative
        assert sum(b['count'] for b in analysis['histogram'])==cumulative
        assert sum(g['validCorrectAnswerCount'] for g in analysis['breakdown'] if g['level']=='operation')==cumulative
        OUT['timingCases'][name]={'expected':expected,'actual':actual,'warnings':saved['dataQualityWarnings'],'rawRetained':True,'summaryCsvJsonGraphAgreement':True}

    # Explicit finite grammar rather than Python strip() or JS trim() assumptions.
    allowed=[9,10,11,12,13,32,160,5760,*range(8192,8203),8232,8233,8239,8287,12288,65279]
    rejected=[0,28,29,30,31,133,6158,8203,8288,1633,65297]
    for cp in allowed:
        text=chr(cp)+'+00102.000'+chr(cp)
        assert exact(text)==102 and ticks(text,2)==10200
    for cp in rejected:
        try: exact(chr(cp)+'102'+chr(cp))
        except ValueError: pass
        else: raise AssertionError(('unexpected grammar acceptance',cp))
    huge='9'*300+'.125'
    assert exact('\ufeff'+huge+'\ufeff')==Fraction(int('9'*300)*1000+125,1000)
    assert ticks(huge,3)==int('9'*300+'125')
    OUT['grammar']={'allowedCodePoints':allowed,'rejectedCodePoints':rejected,'hugeExactDigits':303,'hugeExactValid':True}

OUT['timingCaseCount']=len(OUT['timingCases'])
Path(__file__).with_name('independent-probes.json').write_text(json.dumps(OUT,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({key:value for key,value in OUT.items() if key!='timingCases'},ensure_ascii=False))
