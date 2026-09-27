"""Backend regression tests for Excel import (POST /api/import/{entity}) — iteration 5 bug fix.

Covers:
- POST /api/import/parts with valid .xlsx -> 200, insert new part, verify persistence + rack
- Re-import same code with changed stock -> updated=1 and stock_movements entry 'IMPORT EXCEL'
- POST with non-xlsx file -> 400
- POST with kasir (non-owner) token -> 403
"""
import io
import os
import uuid

import pytest
import requests
from openpyxl import Workbook

_fe = {}
_fe_path = "/app/frontend/.env"
if os.path.exists(_fe_path):
    for _line in open(_fe_path):
        if "=" in _line and not _line.strip().startswith("#"):
            _k, _v = _line.split("=", 1)
            _fe[_k.strip()] = _v.strip().strip('"')
BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or _fe.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/")

HEADERS = ["Kode", "Nama Part", "Barcode", "Harga Jual", "Harga Beli", "Stok", "Stok Minimum", "Satuan", "Lokasi Rak"]
TEST_CODE = "TSTIMP-" + uuid.uuid4().hex[:6].upper()


def make_xlsx(rows):
    wb = Workbook()
    ws = wb.active
    ws.title = "Stok Barang"
    ws.append(HEADERS)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


@pytest.fixture(scope="module")
def api_client():
    # NOTE: do NOT set a global Content-Type — requests sets it automatically
    # (application/json for json=, multipart/form-data for files=)
    return requests.Session()


def login(client, username, password):
    r = client.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"login {username} failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_token(api_client):
    return login(api_client, "owner", "owner123")


@pytest.fixture(scope="module")
def kasir_token(api_client):
    return login(api_client, "kasir", "kasir123")


class TestImportParts:
    """Excel import for parts (stok barang)"""

    def test_01_import_valid_xlsx_inserts_new_part(self, api_client, owner_token):
        xlsx = make_xlsx([[TEST_CODE, "Test Import Part", "BC-TEST-1", 25000, 15000, 10, 2, "pcs", "R9-T1"]])
        r = api_client.post(
            f"{BASE_URL}/api/import/parts",
            headers={"Authorization": f"Bearer {owner_token}"},
            files={"file": ("import_test.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["inserted"] == 1, data
        assert data["updated"] == 0

    def test_02_imported_part_persisted_with_rack(self, api_client, owner_token):
        r = api_client.get(f"{BASE_URL}/api/parts?q={TEST_CODE}", headers={"Authorization": f"Bearer {owner_token}"})
        assert r.status_code == 200
        parts = [p for p in r.json() if p["code"] == TEST_CODE]
        assert len(parts) == 1
        p = parts[0]
        assert p["name"] == "Test Import Part"
        assert p["stock"] == 10
        assert p.get("rack") == "R9-T1"
        assert p["price"] == 25000

    def test_03_reimport_same_code_updates_and_logs_stock_movement(self, api_client, owner_token):
        # change stock 10 -> 25, update price
        xlsx = make_xlsx([[TEST_CODE, "Test Import Part", "BC-TEST-1", 27000, 15000, 25, 2, "pcs", "R9-T1"]])
        r = api_client.post(
            f"{BASE_URL}/api/import/parts",
            headers={"Authorization": f"Bearer {owner_token}"},
            files={"file": ("import_test.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["updated"] == 1, data
        assert data["inserted"] == 0

        # verify persistence of update
        r2 = api_client.get(f"{BASE_URL}/api/parts?q={TEST_CODE}", headers={"Authorization": f"Bearer {owner_token}"})
        p = [x for x in r2.json() if x["code"] == TEST_CODE][0]
        assert p["stock"] == 25
        assert p["price"] == 27000

        # verify stock movement 'IMPORT EXCEL' recorded
        r3 = api_client.get(f"{BASE_URL}/api/parts/{p['id']}/movements", headers={"Authorization": f"Bearer {owner_token}"})
        assert r3.status_code == 200
        movs = [m for m in r3.json() if m.get("reason") == "IMPORT EXCEL"]
        assert movs, "expected IMPORT EXCEL stock movement"
        m = movs[0]
        assert m["qty"] == 15
        assert m["stock_before"] == 10
        assert m["stock_after"] == 25

    def test_04_import_non_xlsx_file_rejected_400(self, api_client, owner_token):
        r = api_client.post(
            f"{BASE_URL}/api/import/parts",
            headers={"Authorization": f"Bearer {owner_token}"},
            files={"file": ("notexcel.txt", b"this is not an excel file", "text/plain")},
        )
        assert r.status_code == 400, r.text
        assert "Excel" in r.json().get("detail", "")

    def test_05_import_forbidden_for_kasir_403(self, api_client, kasir_token):
        xlsx = make_xlsx([["XXX-1", "Should Fail", "", 1, 1, 1, 1, "pcs", ""]])
        r = api_client.post(
            f"{BASE_URL}/api/import/parts",
            headers={"Authorization": f"Bearer {kasir_token}"},
            files={"file": ("import_test.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert r.status_code == 403, r.text

    def test_99_cleanup_soft_delete_test_part(self, api_client, owner_token):
        r = api_client.get(f"{BASE_URL}/api/parts?q={TEST_CODE}", headers={"Authorization": f"Bearer {owner_token}"})
        parts = [p for p in r.json() if p["code"] == TEST_CODE]
        if not parts:
            pytest.skip("test part not found")
        p = parts[0]
        payload = {k: p.get(k) for k in ("code", "name", "barcode", "price", "cost", "stock", "min_stock", "unit", "rack", "active") if k in p}
        payload["active"] = False
        r2 = api_client.put(f"{BASE_URL}/api/parts/{p['id']}", json=payload, headers={"Authorization": f"Bearer {owner_token}"})
        assert r2.status_code in (200, 204), r2.text
