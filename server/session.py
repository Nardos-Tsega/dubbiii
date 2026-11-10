"""Durable Gemini session: cookie sources, cache sync, keep-alive, recovery.

Cookie behavior follows the current gemini-webapi README:
- `await client.init(..., auto_refresh=True)` refreshes `__Secure-1PSIDTS` in the background
- `GEMINI_COOKIE_PATH` is where the library persists rotated cookies
- Optional `browser-cookie3` can supply cookies from a local browser profile
"""

from __future__ import annotations

import asyncio
import importlib
import json
import os
import stat
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
import gemini_webapi.client as gemini_client_mod
import gemini_webapi.utils as gemini_utils_mod
from gemini_webapi import GeminiClient
from gemini_webapi.exceptions import AuthError, GeminiError

# utils/__init__.py re-exports rotate_1psidts as a function, which shadows the
# submodule for normal "import ...rotate_1psidts" — use importlib for the module.
rotate_mod = importlib.import_module("gemini_webapi.utils.rotate_1psidts")

load_dotenv()

SERVER_DIR = Path(__file__).resolve().parent
LIB_COOKIE_DIR = SERVER_DIR / "cookie_store"


def app_cookie_cache_path() -> Path:
    """COOKIE_CACHE_PATH from env; default ./.cookie_cache.json under the server dir."""
    raw = (os.getenv("COOKIE_CACHE_PATH", "./.cookie_cache.json") or "./.cookie_cache.json").strip()
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = (SERVER_DIR / path).resolve()
    return path

SessionState = Literal["ok", "reconnecting", "expired"]
CookieSource = Literal["cache", "env", "browser"]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _log(message: str) -> None:
    print(f"[{_utc_now_iso()}] {message}", flush=True)


def _chmod_owner_rw(path: Path) -> None:
    try:
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass


def _proxy() -> str | None:
    return (
        os.getenv("GEMINI_PROXY", "").strip()
        or os.getenv("HTTPS_PROXY", "").strip()
        or os.getenv("HTTP_PROXY", "").strip()
        or None
    )


def _init_timeout() -> float:
    return float(os.getenv("GEMINI_TIMEOUT", "90"))


@dataclass
class CookiePair:
    psid: str
    psidts: str
    source: CookieSource


def read_app_cookie_cache() -> CookiePair | None:
    cache_path = app_cookie_cache_path()
    if not cache_path.is_file():
        return None
    try:
        data = json.loads(cache_path.read_text(encoding="utf-8"))
        psid = str(data.get("psid") or data.get("PSID") or "").strip()
        psidts = str(data.get("psidts") or data.get("PSIDTS") or "").strip()
        if psid:
            return CookiePair(psid=psid, psidts=psidts, source="cache")
    except Exception as exc:  # noqa: BLE001
        _log(f"Cookie cache read failed (ignored): {exc}")
    return None


def write_app_cookie_cache(psid: str, psidts: str) -> None:
    """Persist cookies to our app cache with restrictive permissions. Never logs values."""
    cache_path = app_cookie_cache_path()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "psid": psid.strip(),
        "psidts": (psidts or "").strip(),
        "updated_at": _utc_now_iso(),
    }
    tmp = cache_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _chmod_owner_rw(tmp)
    tmp.replace(cache_path)
    _chmod_owner_rw(cache_path)


def read_env_cookies() -> CookiePair | None:
    psid = os.getenv("PSID", "").strip()
    psidts = os.getenv("PSIDTS", "").strip()
    if psid:
        return CookiePair(psid=psid, psidts=psidts, source="env")
    return None


def read_browser_cookies() -> CookiePair | None:
    """Load __Secure-1PSID / __Secure-1PSIDTS via browser-cookie3 from a configured Chrome profile."""
    if (os.getenv("ENABLE_BROWSER_COOKIES", "") or "").strip().lower() != "true":
        return None

    try:
        import browser_cookie3 as bc3
    except ImportError:
        _log("browser-cookie3 not installed; skipping browser cookie source")
        return None

    browser_name = (os.getenv("COOKIE_BROWSER", "chrome") or "chrome").strip().lower()
    profile = (os.getenv("COOKIE_BROWSER_PROFILE", "") or "").strip()

    browser_fn = getattr(bc3, browser_name, None)
    if browser_fn is None:
        _log(f"Unknown COOKIE_BROWSER={browser_name!r}; skipping browser cookies")
        return None

    cookie_file: str | None = None
    if profile:
        profile_path = Path(profile).expanduser()
        if profile_path.is_file():
            cookie_file = str(profile_path)
        elif profile_path.is_dir():
            candidate = profile_path / "Cookies"
            cookie_file = str(candidate) if candidate.is_file() else None
        else:
            # Treat as Chrome profile name (e.g. Default, Profile 1) on macOS/Linux/Windows.
            home = Path.home()
            candidates = [
                home / "Library/Application Support/Google/Chrome" / profile / "Cookies",
                home / "Library/Application Support/Chromium" / profile / "Cookies",
                home / ".config/google-chrome" / profile / "Cookies",
                home / ".config/chromium" / profile / "Cookies",
                home
                / "AppData/Local/Google/Chrome/User Data"
                / profile
                / "Cookies",
            ]
            for candidate in candidates:
                if candidate.is_file():
                    cookie_file = str(candidate)
                    break

    try:
        kwargs: dict[str, Any] = {"domain_name": "google.com"}
        if cookie_file:
            kwargs["cookie_file"] = cookie_file
        jar = browser_fn(**kwargs)
    except Exception as exc:  # noqa: BLE001
        _log(f"Browser cookie load failed (source=browser): {exc}")
        return None

    psid = ""
    psidts = ""
    for cookie in jar:
        if cookie.name == "__Secure-1PSID":
            psid = cookie.value or ""
        elif cookie.name == "__Secure-1PSIDTS":
            psidts = cookie.value or ""

    if not psid:
        _log("Browser cookies found but __Secure-1PSID missing")
        return None

    return CookiePair(psid=psid, psidts=psidts, source="browser")


def iter_cookie_sources(
    preferred: CookiePair | None = None,
) -> list[CookiePair]:
    """Ordered sources: optional preferred, then cache → env → browser (deduped)."""
    ordered: list[CookiePair] = []
    seen: set[tuple[str, str, str]] = set()

    def add(pair: CookiePair | None) -> None:
        if not pair or not pair.psid:
            return
        key = (pair.source, pair.psid, pair.psidts)
        if key in seen:
            return
        seen.add(key)
        ordered.append(pair)

    add(preferred)
    add(read_app_cookie_cache())
    add(read_env_cookies())
    add(read_browser_cookies())
    return ordered


def extract_cookies_from_client(client: GeminiClient) -> tuple[str, str] | None:
    psid = ""
    psidts = ""
    try:
        jar = client.cookies.jar
    except Exception:  # noqa: BLE001
        return None
    for cookie in jar:
        if cookie.name == "__Secure-1PSID":
            psid = cookie.value or ""
        elif cookie.name == "__Secure-1PSIDTS":
            psidts = cookie.value or ""
    if not psid:
        return None
    return psid, psidts


def sync_app_cache_from_client(client: GeminiClient | None) -> bool:
    if client is None:
        return False
    pair = extract_cookies_from_client(client)
    if not pair:
        return False
    write_app_cookie_cache(pair[0], pair[1])
    return True


def install_cookie_save_hook(session: "SessionManager") -> None:
    """After library auto-refresh saves cookies (README), also write our app cache."""
    if getattr(rotate_mod, "_dubbii_save_hooked", False):
        return

    original = rotate_mod.save_cookies

    def hooked(cookies: Any, verbose: bool = False) -> None:
        original(cookies, verbose)
        try:
            psid = next(
                (c.value for c in cookies.jar if c.name == "__Secure-1PSID"),
                "",
            )
            psidts = next(
                (c.value for c in cookies.jar if c.name == "__Secure-1PSIDTS"),
                "",
            )
            if psid:
                write_app_cookie_cache(psid, psidts)
                _log("Synced app cookie cache after library auto-refresh")
                session.note_refresh_sync()
        except Exception as exc:  # noqa: BLE001
            _log(f"App cookie cache sync after refresh failed: {exc}")

    # Patch every binding the library keeps: module global (used by rotate_1psidts),
    # utils re-export, and client.py's import-time name.
    rotate_mod.save_cookies = hooked  # type: ignore[assignment]
    gemini_utils_mod.save_cookies = hooked  # type: ignore[assignment]
    gemini_client_mod.save_cookies = hooked  # type: ignore[assignment]
    rotate_mod._dubbii_save_hooked = True  # type: ignore[attr-defined]


class SessionManager:
    def __init__(self) -> None:
        self.client: GeminiClient | None = None
        self.chat: Any = None
        self.state: SessionState = "expired"
        self.source: CookieSource | None = None
        self.last_checked: str | None = None
        self.last_error: str | None = None
        self._recovery_lock = asyncio.Lock()
        self._chat_lock = asyncio.Lock()
        self._attempt_times: deque[float] = deque()
        self._last_success_mono: float = 0.0
        self._keepalive_task: asyncio.Task[None] | None = None
        self._running = False

    @property
    def chat_lock(self) -> asyncio.Lock:
        return self._chat_lock

    def status_payload(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "last_checked": self.last_checked,
            "source": self.source,
        }

    def note_refresh_sync(self) -> None:
        # Keep source as-is; cookies still originate from the same channel.
        self.last_checked = _utc_now_iso()

    def _prune_attempts(self, now: float) -> None:
        while self._attempt_times and now - self._attempt_times[0] > 600:
            self._attempt_times.popleft()

    def _can_attempt(self) -> bool:
        now = time.monotonic()
        self._prune_attempts(now)
        return len(self._attempt_times) < 3

    def _record_attempt(self) -> None:
        now = time.monotonic()
        self._prune_attempts(now)
        self._attempt_times.append(now)

    async def _close_client(self) -> None:
        if self.client is None:
            return
        try:
            await self.client.close()
        except Exception:  # noqa: BLE001
            pass
        self.client = None
        self.chat = None

    async def _init_with_pair(self, pair: CookiePair) -> None:
        gemini = GeminiClient(pair.psid, pair.psidts, proxy=_proxy())
        await gemini.init(
            timeout=_init_timeout(),
            auto_close=False,
            close_delay=300,
            auto_refresh=True,
        )
        # Persist whatever the live session has after init (may include rotated TS).
        sync_app_cache_from_client(gemini)
        write_app_cookie_cache(pair.psid, pair.psidts)
        # Prefer live jar values if present.
        live = extract_cookies_from_client(gemini)
        if live:
            write_app_cookie_cache(live[0], live[1])

        old = self.client
        self.client = gemini
        self.chat = gemini.start_chat()
        self.state = "ok"
        self.source = pair.source
        self.last_checked = _utc_now_iso()
        self.last_error = None
        self._last_success_mono = time.monotonic()
        if old is not None and old is not gemini:
            try:
                await old.close()
            except Exception:  # noqa: BLE001
                pass
        _log(f"Gemini session ready (source={pair.source})")

    async def bootstrap(self) -> None:
        """Initial load: cache → env → browser. Sets GEMINI_COOKIE_PATH for library cache."""
        LIB_COOKIE_DIR.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("GEMINI_COOKIE_PATH", str(LIB_COOKIE_DIR))
        install_cookie_save_hook(self)
        self._running = True

        sources = iter_cookie_sources()
        if not sources:
            self.state = "expired"
            self.last_checked = _utc_now_iso()
            self.last_error = "No cookies available from cache, .env, or browser"
            _log(self.last_error)
            return

        last_exc: Exception | None = None
        for pair in sources:
            try:
                await self._init_with_pair(pair)
                return
            except AuthError as exc:
                last_exc = exc
                _log(f"Auth failed for source={pair.source}")
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                _log(f"Init failed for source={pair.source}: {exc}")

        self.state = "expired"
        self.last_checked = _utc_now_iso()
        self.last_error = str(last_exc) if last_exc else "Init failed"
        _log(f"All cookie sources failed; state=expired")

    async def recover(
        self,
        preferred: CookiePair | None = None,
        *,
        force: bool = False,
    ) -> bool:
        """Single recovery entrypoint with lock + rate limit (≤3 / 10 minutes)."""
        async with self._recovery_lock:
            # If another coroutine already recovered while we waited for the lock, skip.
            if self.state == "ok" and self.client is not None and preferred is None:
                recently_fixed = (time.monotonic() - self._last_success_mono) < 5
                if not force or recently_fixed:
                    return True

            if not self._can_attempt():
                self.state = "expired"
                self.last_checked = _utc_now_iso()
                self.last_error = "Recovery rate limited (max 3 attempts / 10 minutes)"
                _log(self.last_error)
                return False

            self.state = "reconnecting"
            self.last_checked = _utc_now_iso()
            _log("Recovery started")

            # 1) Re-init with current live cookies if possible
            current: CookiePair | None = None
            if self.client is not None:
                live = extract_cookies_from_client(self.client)
                if live:
                    current = CookiePair(psid=live[0], psidts=live[1], source=self.source or "cache")

            sources = iter_cookie_sources(preferred=preferred or current)
            if not sources:
                self._record_attempt()
                self.state = "expired"
                self.last_error = "No cookie sources available for recovery"
                self.last_checked = _utc_now_iso()
                _log(self.last_error)
                return False

            last_exc: Exception | None = None
            for pair in sources:
                if not self._can_attempt():
                    break
                self._record_attempt()
                try:
                    await self._close_client()
                    await self._init_with_pair(pair)
                    _log(f"Recovery succeeded (source={pair.source})")
                    return True
                except AuthError as exc:
                    last_exc = exc
                    _log(f"Recovery auth failed (source={pair.source})")
                except Exception as exc:  # noqa: BLE001
                    last_exc = exc
                    _log(f"Recovery failed (source={pair.source}): {exc}")

            self.state = "expired"
            self.last_checked = _utc_now_iso()
            self.last_error = str(last_exc) if last_exc else "Recovery failed"
            _log(f"Recovery exhausted; state=expired")
            return False

    async def verify_session(self) -> bool:
        """Lightweight keep-alive probe using a temporary generation (not saved to history)."""
        if self.client is None:
            return False
        try:
            await self.client.generate_content(".", temporary=True)
            sync_app_cache_from_client(self.client)
            self.state = "ok"
            self.last_checked = _utc_now_iso()
            self.last_error = None
            return True
        except AuthError:
            return False
        except GeminiError:
            # Model/server glitch — treat as still authenticated unless clearly auth.
            self.last_checked = _utc_now_iso()
            return True
        except Exception as exc:  # noqa: BLE001
            message = str(exc).lower()
            if "unauthenticated" in message or "cookie" in message or "auth" in message:
                return False
            self.last_checked = _utc_now_iso()
            _log(f"Keep-alive non-auth error (ignored): {exc}")
            return True

    async def keepalive_loop(self) -> None:
        interval = int(os.getenv("SESSION_KEEPALIVE_SECONDS", "1800"))
        _log(f"Keep-alive loop started (every {interval}s)")
        while self._running:
            await asyncio.sleep(interval)
            if not self._running:
                break
            try:
                ok = await self.verify_session()
                if ok:
                    _log(f"Keep-alive OK (source={self.source})")
                else:
                    _log("Keep-alive failed; running recovery")
                    recovered = await self.recover(force=True)
                    _log(
                        "Keep-alive recovery "
                        + ("succeeded" if recovered else "failed; state=expired")
                    )
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                _log(f"Keep-alive loop error: {exc}")

    def start_keepalive(self) -> None:
        if self._keepalive_task is None or self._keepalive_task.done():
            self._keepalive_task = asyncio.create_task(self.keepalive_loop())

    async def shutdown(self) -> None:
        self._running = False
        if self._keepalive_task is not None:
            self._keepalive_task.cancel()
            try:
                await self._keepalive_task
            except asyncio.CancelledError:
                pass
            self._keepalive_task = None
        await self._close_client()

    async def set_cookies(self, psid: str, psidts: str) -> None:
        """Validate cookies by init, save cache, swap live client (no process restart)."""
        pair = CookiePair(psid=psid.strip(), psidts=(psidts or "").strip(), source="cache")
        if not pair.psid:
            raise ValueError("psid is required")
        async with self._recovery_lock:
            self.state = "reconnecting"
            self.last_checked = _utc_now_iso()
            await self._close_client()
            await self._init_with_pair(pair)
            # Reset rate-limit window after an explicit user refresh succeeds.
            self._attempt_times.clear()

    def ready_for_chat(self) -> bool:
        return self.state == "ok" and self.client is not None and self.chat is not None

    async def ensure_chat(self) -> Any:
        if self.client is None:
            raise RuntimeError("Client not initialized")
        if self.chat is None:
            self.chat = self.client.start_chat()
        return self.chat

    async def reset_chat(self) -> None:
        if self.client is None:
            raise RuntimeError("Client not initialized")
        self.chat = self.client.start_chat()


session_manager = SessionManager()
