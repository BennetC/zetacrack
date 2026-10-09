from copy import deepcopy
from fastapi.testclient import TestClient
import pytest
from server.app import create_app

def configuration():
    return {"version":1,"operations":[{"id":"addition","version":1,"share":"100","groups":[{"id":"g1","version":1,"name":"Addition","share":"100","first":{"min":"10","max":"99","decimalPlaces":0},"second":{"min":"10","max":"99","decimalPlaces":0},"allowNegative":False}]}],"session":{"format":"timed","durationSeconds":"120","countdown":False}}

@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "test.sqlite3")) as session:
        yield session

def test_presets_restore_rename_update_delete_and_duplicate_names(client):
    config=configuration()
    assert client.get('/api/setup').json()=={"presets":[],"lastConfig":None}
    created=client.post('/api/presets',json={"name":"My setup","config":config})
    assert created.status_code==201
    identity=created.json()['id']
    assert client.post('/api/presets',json={"name":"my setup","config":config}).status_code==409
    assert client.put('/api/last-config',json=config).status_code==200
    assert client.get('/api/setup').json()['lastConfig']==config
    assert client.patch('/api/presets/'+identity,json={"name":"Renamed"}).status_code==200
    config['session']['durationSeconds']='30'
    assert client.put('/api/presets/'+identity,json={"name":"Renamed","config":config}).status_code==200
    assert client.get('/api/setup').json()['presets'][0]['config']==config
    assert client.delete('/api/presets/'+identity).status_code==200
    assert client.get('/api/setup').json()['presets']==[]

def test_snapshot_is_immutable_after_preset_update_and_delete(client):
    config=configuration()
    preset=client.post('/api/presets',json={"name":"Original","config":config}).json()['id']
    identity=client.post('/api/sessions',json={"config":config,"seed":"replay","generatorVersion":"exact-grid-v1","policyVersion":"hierarchical-shares-v1"}).json()['id']
    revised=deepcopy(config);revised['operations'][0]['groups'][0]['first']['min']='50'
    client.put('/api/presets/'+preset,json={"name":"Changed","config":revised})
    client.delete('/api/presets/'+preset)
    assert client.get('/api/sessions/'+identity).json()['config']==config

@pytest.mark.parametrize('change', ['share','groups','precision','bounds','zero_divisor','impossible_subtraction','duration','duplicate_id'])
def test_invalid_configs_are_rejected_server_side(client,change):
    config=configuration();op=config['operations'][0];group=op['groups'][0]
    if change=='share':op['share']='99.99'
    if change=='groups':group['share']='0'
    if change=='precision':group['first']['decimalPlaces']=4
    if change=='bounds':group['first']['min']='1.1'
    if change=='zero_divisor':op['id']='division';group['first']['min']=group['first']['max']='0'
    if change=='impossible_subtraction':op['id']='subtraction';group['first']['min']=group['first']['max']='1';group['second']['min']=group['second']['max']='2'
    if change=='duration':config['session']['durationSeconds']='1.5'
    if change=='duplicate_id':op['groups'].append(deepcopy(group));op['groups'][0]['share']=op['groups'][1]['share']='50'
    assert client.put('/api/last-config',json=config).status_code==422
    assert client.post('/api/presets',json={"name":"Bad","config":config}).status_code==422

def test_observations_are_idempotent_ordered_and_preserve_unfinished_work(client):
    identity=client.post('/api/sessions',json={"config":configuration(),"seed":"trace","generatorVersion":"exact-grid-v1","policyVersion":"hierarchical-shares-v1"}).json()['id']
    events=[{"sequence":i,"type":kind,"elapsedMs":float(i*100),"payload":payload} for i,(kind,payload) in enumerate([
        ('session-started',{'wallAt':'2026-10-08T12:00:00Z'}),('question-presented',{'question':{'id':'q0','left':'10','right':'11','expected':'21'}}),('input-changed',{'questionId':'q0','value':'2'}),('input-changed',{'questionId':'q0','value':'21'}),('answer-accepted',{'questionId':'q0'}),('question-presented',{'question':{'id':'q1','left':'99','right':'11','expected':'110'}}),('session-ended',{'reason':'focus-loss','unfinishedQuestionId':'q1'})])]
    for _ in range(2):assert client.post('/api/sessions/'+identity+'/observations',json={'events':events}).status_code==200
    result=client.get('/api/sessions/'+identity).json();assert result['events']==events;assert result['status']=='ended';assert result['seed']=='trace'
    changed=deepcopy(events[0]);changed['payload']['wallAt']='changed'
    assert client.post('/api/sessions/'+identity+'/observations',json={'events':[changed]}).status_code==409

def test_local_database_survives_app_restart(tmp_path):
    path=tmp_path/'durable.sqlite3'
    with TestClient(create_app(path)) as first:first.post('/api/presets',json={'name':'Durable','config':configuration()})
    with TestClient(create_app(path)) as second:assert second.get('/api/setup').json()['presets'][0]['name']=='Durable'

def test_nonlocal_browser_origins_cannot_modify_private_local_records(client):
    assert client.put('/api/last-config',json=configuration(),headers={'Origin':'https://example.com'}).status_code==403
