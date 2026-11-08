"""Approved follow-up improvements; isolated databases and synthetic records only."""
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from server.app import create_app
from server.analytics import standard_config
from tests.test_stage1 import create, trace


def body(key="operation-one"):
    return dict(creationKey=key, config=standard_config(), seed="stable-seed",
                generatorVersion="zetamac-reverse-v1", policyVersion="equal-operations-v1",
                measurementVersion="response-timing-v1", mode="standard", contentVersion="zetamac-default-v1")


def test_retried_creation_returns_original_and_rejects_changed_request(tmp_path):
    with TestClient(create_app(tmp_path / "retry.sqlite3")) as client:
        first = client.post("/api/sessions", json=body()).json()
        assert client.post("/api/sessions", json=body()).json() == first
        assert client.get("/api/sessions").json()["total"] == 1
        conflict = client.post("/api/sessions", json={**body(), "seed": "different"})
        assert conflict.status_code == 409
        assert client.get(f'/api/sessions/{first["id"]}').json()["seed"] == "stable-seed"
        legacy = body(); legacy.pop("creationKey")
        assert client.post("/api/sessions", json=legacy).json() != client.post("/api/sessions", json=legacy).json()


def test_concurrent_creation_retries_are_one_atomic_operation(tmp_path):
    with TestClient(create_app(tmp_path / "concurrent.sqlite3")) as client:
        def submit(_):
            response = client.post("/api/sessions", json=body())
            assert response.status_code == 201
            return response.json()["id"]
        with ThreadPoolExecutor(max_workers=8) as pool:
            ids = list(pool.map(submit, range(16)))
        assert len(set(ids)) == 1
        assert client.get("/api/sessions").json()["total"] == 1


def test_filtered_deletion_preview_uses_all_matches_and_protects_open_rows(tmp_path):
    with TestClient(create_app(tmp_path / "preview.sqlite3")) as client:
        full = trace(client, create(client))["id"]
        partial = trace(client, create(client), reason="manual-end")["id"]
        custom = trace(client, create(client, standard=False), standard=False)["id"]
        create(client)
        preview = client.get("/api/sessions/deletion-preview?mode=standard&eligibleOnly=true").json()
        assert preview["sessionIds"] == [full] and preview["count"] == 1
        all_standard = client.get("/api/sessions/deletion-preview?mode=standard").json()
        assert set(all_standard["sessionIds"]) == {full, partial}
        assert all_standard["protectedCount"] == 1
        assert client.get("/api/sessions/deletion-preview?mode=custom").json()["sessionIds"] == [custom]
        assert client.get("/api/sessions/deletion-preview?before=1900-01-01").json()["count"] == 0
        # A newly arriving record after the preview is outside the exact scope.
        arriving = trace(client, create(client))["id"]
        assert client.request("DELETE", "/api/sessions", json={"sessionIds": preview["sessionIds"]}).status_code == 200
        assert client.get(f"/api/sessions/{arriving}").status_code == 200
        assert client.get(f"/api/sessions/{partial}").status_code == 200


def test_recent_score_windows_are_newest_first_and_exclude_partial_runs(tmp_path):
    with TestClient(create_app(tmp_path / "recent.sqlite3")) as client:
        for score in range(22):
            trace(client, create(client), times=(10,) * score)
        trace(client, create(client), times=(1,) * 30, reason="manual-end")
        data = client.get("/api/analytics?includePartial=true").json()
        stats = data["fullRunStatistics"]
        assert stats["bestScore"] == 21
        assert stats["recentRunCount"] == stats["previousRunCount"] == 10
        assert stats["recentMeanScore"] == 16.5
        assert stats["previousMeanScore"] == 6.5
        assert stats["recentScoreDifference"] == 10
        empty = client.get("/api/analytics?after=2999-01-01").json()
        assert empty["totalSavedSessionCount"] == 23
        assert empty["fullRunStatistics"]["bestScore"] is None
        assert empty["fullRunStatistics"]["recentRunCount"] == 0
        assert empty["fullRunStatistics"]["recentScoreDifference"] is None
