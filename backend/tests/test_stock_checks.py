"""Cek Fisik Stok (stock opname) backend tests - Klinik Suel Motor.

Covers: session create/resume, natural rack ordering, RBAC (403), item update
rules, submit/approve/reject/finish flows, stock adjustment on approve with
stock_movements reason 'CEK FISIK STOK', notifications, history list fields.

All tests live in ONE class because pytest.ini enforces `-n 2 --dist loadscope`
(xdist groups by class) and these tests are order-dependent.

Uses TESTCK-* parts which are soft-deleted in teardown; test sessions/items/
notifications are removed from MongoDB in teardown to keep user data clean.
"""
import os
import re
import uuid

import pytest
import requests


def _load_env(path):
    env = {}
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    return env


_fe = _load_env("/app/frontend/.env")
_be = _load_env("/app/backend/.env")
BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or _fe.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/") + "/api"
MONGO_URL = _be.get("MONGO_URL")
DB_NAME = _be.get("DB_NAME")


def _login(username: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/auth/login", json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {username} -> {r.status_code} {r.text}"
    return r.json()["access_token"]


def h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def rack_sort_key(rack: str):
    s = (rack or "").strip()
    if not s:
        return (1, [])
    return (0, [(1, int(t)) if t.isdigit() else (0, t) for t in re.findall(r"\d+|\D+", s.lower())])


SFX = uuid.uuid4().hex[:5].upper()
CODE_MATCH = f"TESTCK-A-{SFX}"   # rack A0.01, checked sesuai sistem (no diff)
CODE_MINUS = f"TESTCK-B-{SFX}"   # rack A0.02, selisih minus
CODE_PLUS = f"TESTCK-C-{SFX}"    # tanpa rak, selisih plus
TEST_CODES = [CODE_MATCH, CODE_MINUS, CODE_PLUS]


@pytest.fixture(scope="module")
def tokens():
    return {
        "owner": _login("owner", "owner123"),
        "kasir": _login("kasir", "kasir123"),
        "mekanik": _login("mekanik", "mekanik123"),
        "partman": _login("partman", "partman123"),
    }


@pytest.fixture(scope="module")
def ctx(tokens):
    """Create TESTCK parts, close any leftover PROSES session, yield state, cleanup at end."""
    pt = tokens["partman"]
    parts = {}
    for code, rack, stock in [(CODE_MATCH, "A0.01", 10), (CODE_MINUS, "A0.02", 20), (CODE_PLUS, "", 30)]:
        r = requests.post(f"{BASE_URL}/parts", headers=h(pt), timeout=15,
                          json={"code": code, "name": f"Test Cek Stok {code}", "price": 1000, "cost": 500,
                                "stock": stock, "rack": rack, "min_stock": 1})
        assert r.status_code == 200, r.text
        parts[code] = r.json()

    # Close any leftover PROSES session so a fresh one includes TEST parts
    r = requests.get(f"{BASE_URL}/stock-checks", headers=h(pt), timeout=15)
    assert r.status_code == 200, r.text
    state = {"parts": parts, "session_ids": []}
    for s in r.json():
        if s["status"] == "PROSES":
            fr = requests.post(f"{BASE_URL}/stock-checks/{s['id']}/finish", headers=h(pt), json={}, timeout=15)
            assert fr.status_code == 200, fr.text
    yield state

    # ---- teardown: soft-delete parts, remove test sessions/items/notifications/movements ----
    for p in parts.values():
        requests.put(f"{BASE_URL}/parts/{p['id']}", headers=h(pt), timeout=15,
                     json={"code": p["code"], "name": p["name"], "price": 1000, "cost": 500,
                           "stock": 0, "rack": "", "min_stock": 1, "active": False})
    try:
        from pymongo import MongoClient
        mc = MongoClient(MONGO_URL)
        db = mc[DB_NAME]
        ids = [p["id"] for p in parts.values()]
        db.parts.update_many({"id": {"$in": ids}}, {"$set": {"deleted_at": "TEST-CLEANUP", "active": False}})
        db.stock_check_items.delete_many({"check_id": {"$in": state["session_ids"]}})
        db.stock_checks.delete_many({"id": {"$in": state["session_ids"]}})
        db.notifications.delete_many({"meta.check_id": {"$in": state["session_ids"]}})
        db.stock_movements.delete_many({"part_id": {"$in": ids}})
        db.audit_logs.delete_many({"message": {"$regex": "Test Cek Stok TESTCK-"}})
        mc.close()
    except Exception as e:  # noqa
        print("CLEANUP WARNING:", e)


def _start_session(tokens, ctx) -> dict:
    r = requests.post(f"{BASE_URL}/stock-checks", headers=h(tokens["partman"]), json={}, timeout=30)
    assert r.status_code == 200, r.text
    s = r.json()
    if s["id"] not in ctx["session_ids"]:
        ctx["session_ids"].append(s["id"])
    return s


def _detail(tokens, cid) -> dict:
    r = requests.get(f"{BASE_URL}/stock-checks/{cid}", headers=h(tokens["partman"]), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _item(detail, code):
    return next(i for i in detail["items"] if i["part_code"] == code)


def _put_item(tokens, cid, iid, physical, checked=True):
    return requests.put(f"{BASE_URL}/stock-checks/{cid}/items/{iid}", headers=h(tokens["partman"]),
                        json={"physical": physical, "checked": checked}, timeout=15)


def _part_stock(tokens, code):
    r = requests.get(f"{BASE_URL}/parts", headers=h(tokens["owner"]), params={"q": code}, timeout=15)
    assert r.status_code == 200
    return next(p["stock"] for p in r.json() if p["code"] == code)


class TestStockChecks:
    # ---------------- session lifecycle ----------------
    def test_01_start_creates_proses_session_with_all_parts(self, tokens, ctx):
        s = _start_session(tokens, ctx)
        ctx["main_session"] = s["id"]
        assert s["status"] == "PROSES"
        r = requests.get(f"{BASE_URL}/parts", headers=h(tokens["partman"]), timeout=30)
        assert s["total_items"] == len(r.json())
        detail = _detail(tokens, s["id"])
        assert len(detail["items"]) == s["total_items"]
        for code in TEST_CODES:
            _item(detail, code)

    def test_02_natural_rack_ordering_no_rack_last(self, tokens, ctx):
        detail = _detail(tokens, ctx["main_session"])
        keys = [rack_sort_key(i["rack"]) for i in detail["items"]]
        assert keys == sorted(keys), "Items tidak terurut rak alami"
        racks = [i["rack"] for i in detail["items"]]
        if any(not r for r in racks):
            first_empty = next(idx for idx, r in enumerate(racks) if not r)
            assert all(not r for r in racks[first_empty:]), "Part tanpa rak tidak di akhir"
        seq = {i["part_code"]: i["seq"] for i in detail["items"]}
        assert seq[CODE_MATCH] < seq[CODE_MINUS] < seq[CODE_PLUS]

    def test_03_resume_returns_same_session(self, tokens, ctx):
        s2 = _start_session(tokens, ctx)
        assert s2["id"] == ctx["main_session"]

    # ---------------- RBAC ----------------
    def test_04_mekanik_kasir_cannot_start(self, tokens):
        # Post-RBAC-change (mekanik super-worker): only kasir must be blocked from /stock-checks POST.
        r = requests.post(f"{BASE_URL}/stock-checks", headers=h(tokens["kasir"]), json={}, timeout=15)
        assert r.status_code == 403, f"kasir POST stock-checks -> {r.status_code}"

    def test_05_mekanik_kasir_cannot_list_or_detail(self, tokens, ctx):
        # Post-RBAC-change: only kasir remains blocked from stock-check list/detail; mekanik allowed.
        assert requests.get(f"{BASE_URL}/stock-checks", headers=h(tokens["kasir"]), timeout=15).status_code == 403
        assert requests.get(f"{BASE_URL}/stock-checks/{ctx['main_session']}", headers=h(tokens["kasir"]), timeout=15).status_code == 403

    def test_06_kasir_cannot_update_item(self, tokens, ctx):
        detail = _detail(tokens, ctx["main_session"])
        it = _item(detail, CODE_MATCH)
        r = requests.put(f"{BASE_URL}/stock-checks/{ctx['main_session']}/items/{it['id']}",
                         headers=h(tokens["kasir"]), json={"physical": 10, "checked": True}, timeout=15)
        assert r.status_code == 403

    def test_07_partman_cannot_approve(self, tokens, ctx):
        r = requests.post(f"{BASE_URL}/stock-checks/{ctx['main_session']}/approve",
                          headers=h(tokens["partman"]), json={}, timeout=15)
        assert r.status_code == 403

    # ---------------- item updates & submit/approve ----------------
    def test_08_update_items_persisted(self, tokens, ctx):
        cid = ctx["main_session"]
        detail = _detail(tokens, cid)
        m, mn, pl = _item(detail, CODE_MATCH), _item(detail, CODE_MINUS), _item(detail, CODE_PLUS)
        r = _put_item(tokens, cid, m["id"], 10)   # sesuai sistem
        assert r.status_code == 200 and r.json()["diff"] == 0 and r.json()["checked"] is True
        r = _put_item(tokens, cid, mn["id"], 15)  # selisih -5
        assert r.status_code == 200 and r.json()["diff"] == -5
        r = _put_item(tokens, cid, pl["id"], 35)  # selisih +5
        assert r.status_code == 200 and r.json()["diff"] == 5
        detail = _detail(tokens, cid)
        assert detail["checked_count"] == 3 and detail["diff_count"] == 2
        assert _item(detail, CODE_MINUS)["stock_physical"] == 15
        assert _item(detail, CODE_PLUS)["stock_physical"] == 35

    def test_09_negative_physical_rejected(self, tokens, ctx):
        detail = _detail(tokens, ctx["main_session"])
        it = _item(detail, CODE_MATCH)
        r = _put_item(tokens, ctx["main_session"], it["id"], -1)
        assert r.status_code == 400

    def test_10_submit_marks_diajukan_stock_unchanged_notifies_owner(self, tokens, ctx):
        cid = ctx["main_session"]
        before = {c: _part_stock(tokens, c) for c in TEST_CODES}
        r = requests.post(f"{BASE_URL}/stock-checks/{cid}/submit", headers=h(tokens["partman"]), json={}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "DIAJUKAN"
        detail = _detail(tokens, cid)
        assert _item(detail, CODE_MINUS)["adj_status"] == "PENDING"
        assert _item(detail, CODE_PLUS)["adj_status"] == "PENDING"
        assert _item(detail, CODE_MATCH)["adj_status"] is None
        for c in TEST_CODES:
            assert _part_stock(tokens, c) == before[c], f"stok {c} berubah sebelum approval"
        r = requests.get(f"{BASE_URL}/notifications", headers=h(tokens["owner"]), timeout=15)
        notifs = [n for n in r.json()["items"] if n["kind"] == "CEK FISIK STOK" and n.get("meta", {}).get("check_id") == cid]
        assert notifs and "PERSETUJUAN" in notifs[0]["title"]
        assert CODE_MINUS in notifs[0]["body"] and CODE_PLUS in notifs[0]["body"]

    def test_11_update_locked_after_submit(self, tokens, ctx):
        cid = ctx["main_session"]
        detail = _detail(tokens, cid)
        it = _item(detail, CODE_MATCH)
        assert _put_item(tokens, cid, it["id"], 99).status_code == 400

    def test_12_owner_approve_applies_stock_and_movements(self, tokens, ctx):
        cid = ctx["main_session"]
        r = requests.post(f"{BASE_URL}/stock-checks/{cid}/approve", headers=h(tokens["owner"]), json={}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "DISETUJUI" and body["decided_by"] == "owner"
        assert _part_stock(tokens, CODE_MATCH) == 10
        assert _part_stock(tokens, CODE_MINUS) == 15
        assert _part_stock(tokens, CODE_PLUS) == 35
        r = requests.get(f"{BASE_URL}/stock-movements", headers=h(tokens["owner"]), timeout=15)
        mv = [m for m in r.json() if m["reason"] == "CEK FISIK STOK" and m["part_code"] in (CODE_MINUS, CODE_PLUS)]
        assert len(mv) == 2, f"movements: {mv}"
        mvn = next(m for m in mv if m["part_code"] == CODE_MINUS)
        assert mvn["qty"] == -5 and mvn["stock_before"] == 20 and mvn["stock_after"] == 15
        r = requests.get(f"{BASE_URL}/notifications", headers=h(tokens["partman"]), timeout=15)
        assert any(n["kind"] == "CEK FISIK STOK" and "DISETUJUI" in n["title"] and n.get("meta", {}).get("check_id") == cid
                   for n in r.json()["items"])

    def test_13_approve_again_400(self, tokens, ctx):
        r = requests.post(f"{BASE_URL}/stock-checks/{ctx['main_session']}/approve", headers=h(tokens["owner"]), json={}, timeout=15)
        assert r.status_code == 400

    # ---------------- submit-no-diff 400 + finish + reject ----------------
    def test_14_submit_without_diff_400_then_finish(self, tokens, ctx):
        s = _start_session(tokens, ctx)  # new PROSES session (previous DISETUJUI)
        ctx["finish_session"] = s["id"]
        assert s["id"] != ctx["main_session"]
        r = requests.post(f"{BASE_URL}/stock-checks/{s['id']}/submit", headers=h(tokens["partman"]), json={}, timeout=15)
        assert r.status_code == 400
        r = requests.post(f"{BASE_URL}/stock-checks/{s['id']}/finish", headers=h(tokens["partman"]), json={}, timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "SELESAI"
        assert requests.post(f"{BASE_URL}/stock-checks/{s['id']}/finish", headers=h(tokens["partman"]), json={}, timeout=15).status_code == 400

    def test_15_reject_keeps_stock_unchanged(self, tokens, ctx):
        s = _start_session(tokens, ctx)
        ctx["reject_session"] = s["id"]
        detail = _detail(tokens, s["id"])
        it = _item(detail, CODE_MINUS)  # stock_system now 15
        assert it["stock_system"] == 15
        assert _put_item(tokens, s["id"], it["id"], 12).status_code == 200
        r = requests.post(f"{BASE_URL}/stock-checks/{s['id']}/submit", headers=h(tokens["partman"]), json={}, timeout=15)
        assert r.status_code == 200
        r = requests.post(f"{BASE_URL}/stock-checks/{s['id']}/reject", headers=h(tokens["owner"]), json={}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "DITOLAK" and r.json()["decided_by"] == "owner"
        assert _part_stock(tokens, CODE_MINUS) == 15, "stok berubah padahal DITOLAK"
        detail = _detail(tokens, s["id"])
        assert _item(detail, CODE_MINUS)["adj_status"] == "DITOLAK"
        r = requests.get(f"{BASE_URL}/notifications", headers=h(tokens["partman"]), timeout=15)
        assert any(n["kind"] == "CEK FISIK STOK" and "DITOLAK" in n["title"] and n.get("meta", {}).get("check_id") == s["id"]
                   for n in r.json()["items"])

    # ---------------- history ----------------
    def test_16_list_has_summary_fields(self, tokens, ctx):
        r = requests.get(f"{BASE_URL}/stock-checks", headers=h(tokens["owner"]), timeout=15)
        assert r.status_code == 200
        sessions = [s for s in r.json() if s["id"] in ctx["session_ids"]]
        assert len(sessions) == len(ctx["session_ids"])
        for s in sessions:
            for f in ("date", "status", "checked_count", "diff_count", "total_items", "created_by"):
                assert f in s, f"field {f} hilang"
        main = next(s for s in sessions if s["id"] == ctx["main_session"])
        assert main["status"] == "DISETUJUI" and main["checked_count"] == 3 and main["diff_count"] == 2
