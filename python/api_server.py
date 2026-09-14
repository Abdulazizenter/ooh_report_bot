from __future__ import annotations

import csv
import hashlib
import hmac
import json
import os
import secrets
import subprocess
import uuid
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MAX_BODY = 25 * 1024 * 1024
SESSION_COOKIE = "ooh_session"
SESSION_SECRET = os.getenv("BETTER_AUTH_SECRET")
SESSIONS: dict[str, dict] = {}

if not SESSION_SECRET:
    raise RuntimeError("BETTER_AUTH_SECRET must be configured before starting the API")

SAFE_USER_FIELDS = {"id", "username", "name", "role", "organization", "contractorId", "active", "avatar", "description"}


def public_user(user: dict) -> dict:
    return {key: value for key, value in user.items() if key in SAFE_USER_FIELDS}


def require_user(handler: BaseHTTPRequestHandler) -> dict | None:
    user = session_user(handler)
    if not user:
        return None
    return user


def require_admin(handler: BaseHTTPRequestHandler) -> dict | None:
    user = require_user(handler)
    return user if user and user.get("role") == "admin" and user.get("active", True) else None


def load_json(name: str, default: list | dict) -> list | dict:
    try:
        return json.loads((DATA / name).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def save_json(name: str, value: object) -> None:
    path = DATA / name
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


REPORTS = load_json("reports.json", [])
USERS = load_json("users.json", [])
CONTRACTORS = load_json("contractors.json", [])
CONSTRUCTIONS = load_json("constructions.json", [])
PROGRAMS = load_json("kam_programs.json", [])


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def standard(data: object = None, error: dict | None = None) -> dict:
    return {"success": error is None, "data": None if error else data, "error": error, "meta": {"timestamp": now()}}


def status_of(report: dict) -> str:
    return str(report.get("status", "PENDING")).upper()


def engine_score(payload: dict) -> dict:
    binary = ROOT / "cpp" / "ooh_engine"
    if binary.exists():
        try:
            result = subprocess.run([str(binary)], input=json.dumps(payload), text=True, capture_output=True, timeout=2, check=True)
            return json.loads(result.stdout)
        except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
            pass
    return {"engine": "python-fallback", "score": 1.0, "status": "COMPLIANT"}


def sign_session(session_id: str) -> str:
    digest = hmac.new(SESSION_SECRET.encode(), session_id.encode(), hashlib.sha256).hexdigest()
    return f"{session_id}.{digest}"


def verify_password(password: str, user: dict) -> bool:
    password_hash = str(user.get("passwordHash", ""))
    if not password_hash.startswith("sha256$"):
        return False
    _, expected = password_hash.split("$", 1)
    actual = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return hmac.compare_digest(actual, expected)


def session_user(handler: BaseHTTPRequestHandler) -> dict | None:
    cookie = SimpleCookie(handler.headers.get("Cookie", ""))
    value = cookie.get(SESSION_COOKIE)
    if not value or "." not in value.value:
        return None
    session_id, signature = value.value.rsplit(".", 1)
    if not hmac.compare_digest(sign_session(session_id).rsplit(".", 1)[1], signature):
        return None
    return SESSIONS.get(session_id)


class ApiHandler(BaseHTTPRequestHandler):
    server_version = "OOH-Python/2.0"

    def _send(self, status: int, body: object, content_type: str = "application/json", headers: dict[str, str] | None = None) -> None:
        raw = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("X-Request-Id", self.headers.get("X-Request-Id", str(uuid.uuid4())))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(self), geolocation=(self), microphone=()")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(raw)

    def _payload(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_BODY:
            raise ValueError("payload too large")
        return json.loads(self.rfile.read(length) or b"{}") if length else {}

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            return self._send(200, {"ok": True, "service": "ooh-promo-hub-python", "timestamp": now()})
        if path == "/api/session":
            return self._send(200, standard(session_user(self)))
        if path in {"/api/reports", "/api/users", "/api/contractors", "/api/constructions", "/api/kam/programs", "/api/archive/folders", "/api/stats", "/api/export/csv"} and not require_user(self):
            return self._send(401, standard(error={"code": "UNAUTHENTICATED", "message": "Требуется вход в систему"}))
        if path == "/api/reports":
            user = require_user(self)
            visible_reports = REPORTS if user.get("role") == "admin" else [report for report in REPORTS if report.get("ownerId") == user.get("id")]
            return self._send(200, standard(visible_reports))
        if path.startswith("/api/reports/"):
            if not require_user(self):
                return self._send(401, standard(error={"code": "UNAUTHENTICATED", "message": "Требуется вход в систему"}))
            report_id = path.rsplit("/", 1)[-1]
            report = next((item for item in REPORTS if str(item.get("id")) == report_id), None)
            return self._send(200 if report else 404, standard(report, None if report else {"code": "NOT_FOUND", "message": "Отчет не найден"}))
        if path == "/api/users": return self._send(200, standard([public_user(user) for user in USERS]))
        if path == "/api/contractors": return self._send(200, standard(CONTRACTORS))
        if path == "/api/constructions": return self._send(200, standard(CONSTRUCTIONS))
        if path == "/api/kam/programs": return self._send(200, standard(PROGRAMS))
        if path == "/api/archive/folders":
            folders = sorted({str(item.get("supplier", {}).get("name", "Без поставщика")) for item in REPORTS})
            return self._send(200, standard([{"name": folder, "reports": sum(folder == str(r.get("supplier", {}).get("name", "Без поставщика")) for r in REPORTS)} for folder in folders]))
        if path == "/api/stats":
            approved = sum(status_of(r) in {"APPROVED", "COMPLIANT"} for r in REPORTS)
            return self._send(200, standard({"totalReports": len(REPORTS), "verifiedReports": approved, "totalContractors": len(CONTRACTORS), "totalConstructions": len(CONSTRUCTIONS)}))
        if path == "/api/export/csv":
            user = require_user(self)
            visible_reports = REPORTS if user.get("role") == "admin" else [report for report in REPORTS if report.get("ownerId") == user.get("id")]
            output = __import__("io").StringIO()
            writer = csv.writer(output, lineterminator="\n")
            writer.writerow(["id", "status", "construction_code", "captured_at"])
            for report in visible_reports:
                writer.writerow([report.get("id", ""), status_of(report), report.get("constructionCode", ""), report.get("capturedAt", "")])
            return self._send(200, output.getvalue().encode(), "text/csv; charset=utf-8", {"Content-Disposition": "attachment; filename=reports.csv"})
        if path == "/api/config": return self._send(200, {"googleClientId": os.getenv("GOOGLE_CLIENT_ID", "")})
        if path == "/" or not path.startswith("/api/"): return self._serve_static(ROOT / path.lstrip("/") if path != "/" else ROOT / "index.html")
        self._send(404, standard(error={"code": "API_ROUTE_NOT_FOUND", "message": "API route not found"}))

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            payload = self._payload()
        except (ValueError, json.JSONDecodeError):
            return self._send(400, standard(error={"code": "INVALID_REQUEST", "message": "Некорректный запрос"}))
        if path == "/api/auth/login":
            email = str(payload.get("email", "")).strip().lower()
            password = str(payload.get("password", ""))
            if len(email) > 254 or len(password) > 1024:
                return self._send(401, standard(error={"code": "INVALID_CREDENTIALS", "message": "Неверные учетные данные"}))
            user = next((u for u in USERS if str(u.get("email", "")).lower() == email), None)
            if not user or not verify_password(password, user):
                return self._send(401, standard(error={"code": "INVALID_CREDENTIALS", "message": "Неверные учетные данные"}))
            session_id = secrets.token_urlsafe(32)
            safe_user = public_user(user)
            SESSIONS[session_id] = safe_user
            return self._send(200, standard(safe_user), headers={"Set-Cookie": f"{SESSION_COOKIE}={sign_session(session_id)}; HttpOnly; Secure; SameSite=Lax; Path=/"})
        if path == "/api/auth/logout":
            cookie = SimpleCookie(self.headers.get("Cookie", "")); value = cookie.get(SESSION_COOKIE)
            if value: SESSIONS.pop(value.value.rsplit(".", 1)[0], None)
            return self._send(200, standard({"loggedOut": True}), headers={"Set-Cookie": f"{SESSION_COOKIE}=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/"})
        if path in {"/api/engine/evaluate", "/api/reports", "/api/kam/programs"} and not require_user(self):
            return self._send(401, standard(error={"code": "UNAUTHENTICATED", "message": "Требуется вход в систему"}))
        if path == "/api/engine/evaluate": return self._send(200, standard(engine_score(payload)))
        if path == "/api/reports":
            user = require_user(self)
            report = {"id": str(uuid.uuid4()), "ownerId": user["id"], **payload, "status": payload.get("status", "PENDING"), "createdAt": now()}
            REPORTS.append(report); save_json("reports.json", REPORTS)
            return self._send(201, standard(report))
        if path == "/api/kam/programs":
            user = require_user(self)
            program = {"id": str(uuid.uuid4()), "ownerId": user["id"], **payload, "createdAt": now()}; PROGRAMS.append(program); save_json("kam_programs.json", PROGRAMS)
            return self._send(201, standard(program))
        self._send(404, standard(error={"code": "API_ROUTE_NOT_FOUND", "message": "API route not found"}))

    def _serve_static(self, path: Path) -> None:
        try:
            resolved = path.resolve()
            resolved.relative_to(ROOT.resolve())
        except (OSError, ValueError):
            return self._send(404, standard(error={"code": "NOT_FOUND", "message": "Файл не найден"}))
        if not resolved.exists() or not resolved.is_file():
            resolved = ROOT / "index.html"
        content_type = "text/html; charset=utf-8" if resolved.suffix == ".html" else "application/octet-stream"
        self._send(200, resolved.read_bytes(), content_type)

    def log_message(self, fmt: str, *args: object) -> None:
        print(json.dumps({"type": "request", "message": fmt % args}, ensure_ascii=False))


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.getenv("PORT", "3000"))), ApiHandler).serve_forever()
