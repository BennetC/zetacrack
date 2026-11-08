"""Read optimization regressions using isolated synthetic observations."""
from fastapi.testclient import TestClient
from server.app import create_app
from tests.test_stage1 import create, trace


def test_history_and_graphs_skip_replay_and_reuse_unchanged_derivations(tmp_path, monkeypatch):
    import server.app as module
    import server.analytics as analytics_module
    with TestClient(create_app(tmp_path / "reads.db")) as client:
        saved = trace(client, create(client))

        def unexpected(*args, **kwargs):
            raise AssertionError("List/graph reads must not rebuild a cached run or replay")

        monkeypatch.setattr(module, "derive_session", unexpected)
        monkeypatch.setattr(analytics_module, "describe_run", unexpected)
        for _ in range(2):
            history = client.get("/api/sessions?eligibleOnly=true").json()
            graph = client.get("/api/analytics").json()
            assert history["total"] == 1
            assert history["sessions"][0]["score"] == saved["score"]
            assert "runAnalytics" not in history["sessions"][0]
            assert graph["fullRunStatistics"]["meanScore"] == saved["score"]
            assert graph["summary"] == saved["summary"]
        assert client.get("/api/sessions/deletion-preview").json()["count"] == 1


def test_cache_observes_other_worker_appends_annotations_and_deletion(tmp_path, monkeypatch):
    import server.app as module
    database = tmp_path / "workers.db"
    with TestClient(create_app(database)) as reader, TestClient(create_app(database)) as writer:
        identity = create(writer)
        original = reader.get(f"/api/sessions/{identity}").json()
        assert original["events"] == []
        saved = trace(writer, identity)
        refreshed = reader.get(f"/api/sessions/{identity}").json()
        assert refreshed == saved and refreshed["score"] == 2
        # Unchanged reads hit; a sidecar label update with no new observation
        # must still invalidate the cached annotation view.
        derive = module.derive_session
        calls = []
        def counted(session):
            calls.append(session["id"])
            return derive(session)
        monkeypatch.setattr(module, "derive_session", counted)
        reader.get("/api/analytics").raise_for_status()
        assert calls == []
        sequence = saved["questions"][0]["presentationSequence"]
        writer.put(f"/api/sessions/{identity}/annotations/{sequence}", json={
            "label": "mistyped", "expectedRevision": 0,
        }).raise_for_status()
        labelled = reader.get(f"/api/sessions/{identity}").json()
        assert calls == [identity]
        assert labelled["annotations"][0]["label"] == "mistyped"
        assert labelled["events"] == saved["events"]
        exported = reader.get(f"/api/sessions/{identity}/export?format=json").json()["sessions"][0]
        assert exported == labelled
        writer.delete(f"/api/sessions/{identity}").raise_for_status()
        assert reader.get("/api/sessions").json()["total"] == 0
        assert reader.get(f"/api/sessions/{identity}").status_code == 404


def test_comparison_payload_contains_exact_completion_times_without_replay(tmp_path):
    with TestClient(create_app(tmp_path / "pace.db")) as client:
        earlier = trace(client, create(client), times=(0.125, 300.25))
        current = trace(client, create(client))
        comparison = client.get(f'/api/explorer/{current["id"]}').json()["comparisons"][0]
        assert comparison["id"] == earlier["id"]
        assert comparison["runAnalytics"]["questions"] == [
            {"acceptedMs": q["acceptedMs"]} for q in earlier["runAnalytics"]["questions"]
            if q["acceptedMs"] is not None
        ]
        assert comparison["score"] == 2
        assert all("frames" not in q for q in comparison["runAnalytics"]["questions"])
