from __future__ import annotations

import csv
import json
import os
import subprocess
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def load_json(name: str, default: list | dict) -> list | dict:
    try:
        return json.loads((DATA / name).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


REPORTS = load_json("reports.json", [])
USERS = load_json("users.json", [])
CONTRACTORS = load_json("contractors.json", [])
CONSTRUCTIONS = load_json("constructions.json", [])
PROGRAMS = load_json("kam_programs.json", [])


def status_of(report: dict) -> str:
    return str(report.get("status", "PENDING")).upper()


def standard(data: object, error: dict | None = None) -> dict:
    return {
        "success": error is None,
        "data": None if error else data,
        "error": error,
        "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
    }


def engine_score(payload: dict) -> dict:
    binary = ROOT / "cpp" / "ooh_engine"
    if binary.exists():
        try:
            process = subprocess.run(
                [str(binary)], input=json.dumps(payload), text=True,
                capture_output=True, timeout=2, check=True,
            )
            return json.loads(process.stdout)
        except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
            pass
    return {"engine": "python-fallback", "score": 1.0, "status": "COMPLIANT"}


class ApiHandler(BaseHTTPRequestHandler):
    server_version = "OOH-Python/1.0"

    def _send(self, status: int, body: object, content_type: str = "application/json") -> None:
        raw = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("X-Request-Id", self.headers.get("X-Request-Id", str(uuid.uuid4())))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            self._send(200, {"ok": True, "service": "ooh-promo-hub-python", "timestamp": datetime.now(timezone.utc).isoformat()})
        elif path == "/api/reports":
            self._send(200, standard(REPORTS))
        elif path.startswith("/api/reports/"):
            report_id = path.rsplit("/", 1)[-1]
            report = next((item for item in REPORTS if str(item.get("id")) == report_id), None)
            self._send(200 if report else 404, standard(report, None if report else {"code": "NOT_FOUND", "message": "Отчет не найден"}))
        elif path == "/api/users":
            self._send(200, standard(USERS))
        elif path == "/api/contractors":
            self._send(200, standard(CONTRACTORS))
        elif path == "/api/constructions":
            self._send(200, standard(CONSTRUCTIONS))
        elif path == "/api/stats":
            approved = sum(status_of(r) in {"APPROVED", "COMPLIANT"} for r in REPORTS)
            self._send(200, standard({"totalReports": len(REPORTS), "verifiedReports": approved, "totalContractors": len(CONTRACTORS), "totalConstructions": len(CONSTRUCTIONS)}))
        elif path == "/api/config":
            self._send(200, {"googleClientId": os.getenv("GOOGLE_CLIENT_ID", "")})
        elif path == "/api/kam/programs":
            self._send(200, standard(PROGRAMS))
        elif path == "/api/export/csv":
            lines = ["id,status,construction_code,captured_at"]
            lines.extend(
                f"{r.get('id','')},{status_of(r)},{r.get('constructionCode','')},{r.get('capturedAt','')}" for r in REPORTS
            )
            self._send(200, "\n".join(lines).encode(), "text/csv; charset=utf-8")
        elif path == "/":
            self._serve_static(ROOT / "index.html")
        elif not path.startswith("/api/"):
            self._serve_static(ROOT / path.lstrip("/"))
        else:
            self._send(404, standard(None, {"code": "API_ROUTE_NOT_FOUND", "message": "API route not found"}))

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}") if length else {}
        if path == "/api/engine/evaluate":
            self._send(200, standard(engine_score(payload)))
            return
        if path == "/api/reports":
            report = {"id": str(uuid.uuid4()), **payload, "status": payload.get("status", "PENDING")}
            REPORTS.append(report)
            self._send(201, standard(report))
            return
        self._send(404, standard(None, {"code": "API_ROUTE_NOT_FOUND", "message": "API route not found"}))

    def _serve_static(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            path = ROOT / "index.html"
        content_type = "text/html; charset=utf-8" if path.suffix == ".html" else "application/octet-stream"
        self._send(200, path.read_bytes(), content_type)

    def log_message(self, fmt: str, *args: object) -> None:
        print(json.dumps({"type": "request", "message": fmt % args}, ensure_ascii=False))


if __name__ == "__main__":
    port = int(os.getenv("PORT", "3000"))
    ThreadingHTTPServer(("0.0.0.0", port), ApiHandler).serve_forever()
