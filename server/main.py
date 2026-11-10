import re
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import quote

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from gemini_webapi.exceptions import AuthError, GeminiError
from pydantic import BaseModel, Field

from export_utils import (
    CONTENT_TYPES,
    ExportFormat,
    build_download_filename,
    render_export,
)
from session import session_manager

load_dotenv()

SYSTEM_RULE = (
    "Reply only in Afaan Oromoo, even if I write in another language. "
    "Use simple, natural wording."
)

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
IMAGE_DIR = UPLOAD_DIR / "images"
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_EXTENSIONS = {
    ".pdf",
    ".txt",
    ".docx",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
}
POWERPOINT_EXTENSIONS = {".ppt", ".pptx"}


class ChatRequest(BaseModel):
    text: str = Field(..., min_length=1)


class ImageOut(BaseModel):
    id: str
    title: str
    alt: str = ""
    url: str


class ChatResponse(BaseModel):
    text: str
    images: list[ImageOut] = Field(default_factory=list)


class ExportRequest(BaseModel):
    text: str = Field(..., min_length=1)
    format: ExportFormat
    title: str = "Deebii Dubbii"


class CookiesRequest(BaseModel):
    psid: str = Field(..., min_length=1)
    psidts: str = ""


class UploadRejected(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _client_not_ready_response() -> JSONResponse:
    state = session_manager.state
    if state == "reconnecting":
        return JSONResponse(
            status_code=503,
            content={
                "error": "Session deebi'aa jira (reconnecting). Mee yeroo gabaabaa booda irra deebi'ii.",
                "state": state,
            },
        )
    return JSONResponse(
        status_code=401,
        content={
            "error": (
                "Session cookies didhabe / hin jiran. "
                "PSID fi PSIDTS haaromsiitii 'Haaromsi' tuqi."
            ),
            "state": state,
        },
    )


def _gemini_error_response(exc: Exception) -> JSONResponse:
    if isinstance(exc, AuthError):
        return JSONResponse(
            status_code=401,
            content={
                "error": (
                    "Session cookies hin fudhatamne. "
                    "Mee cookies haaromsi."
                ),
                "state": session_manager.state,
            },
        )
    if isinstance(exc, GeminiError):
        return JSONResponse(
            status_code=502,
            content={"error": f"Gaaffiin hin milkoofne: {exc}"},
        )
    return JSONResponse(
        status_code=500,
        content={"error": f"Dogoggorri serveeraa hin eegamne: {exc}"},
    )


def _is_auth_failure(exc: Exception) -> bool:
    if isinstance(exc, AuthError):
        return True
    message = str(exc).lower()
    return (
        "unauthenticated" in message
        or "permission denied" in message
        or (
            "cookie" in message
            and (
                "expir" in message
                or "invalid" in message
                or "denied" in message
                or "reject" in message
            )
        )
    )


def _extension_of(filename: str | None) -> str:
    return Path(filename or "").suffix.lower()


def _ensure_allowed_extension(filename: str | None) -> None:
    extension = _extension_of(filename)

    if extension in POWERPOINT_EXTENSIONS:
        raise UploadRejected(
            "Faayilli PowerPoint (.pptx) amma hin deeggaramu. Mee PDF taasisuun ergi."
        )

    if extension not in ALLOWED_EXTENSIONS:
        raise UploadRejected(
            "Gosti faayilaa hin deeggaramu. PDF, suuraa, .txt, ykn .docx qofa ergi."
        )


async def _save_upload_temporarily(upload: UploadFile) -> Path:
    _ensure_allowed_extension(upload.filename)

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(upload.filename or "upload").name.replace(" ", "_")
    temp_path = UPLOAD_DIR / f"{uuid.uuid4().hex}_{safe_name}"

    total = 0
    try:
        with temp_path.open("wb") as out:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_FILE_SIZE:
                    raise UploadRejected(
                        f"Faayilli '{upload.filename or 'faayila'}' guddaadha. "
                        "Hangamuu 20 MB qofa fudhatama."
                    )
                out.write(chunk)
    except UploadRejected:
        temp_path.unlink(missing_ok=True)
        raise
    except Exception as exc:  # noqa: BLE001
        temp_path.unlink(missing_ok=True)
        raise UploadRejected(f"Faayila kuusuu hin dandeenye: {exc}", status_code=500) from exc

    if total == 0:
        temp_path.unlink(missing_ok=True)
        raise UploadRejected(f"Faayilli '{upload.filename or 'faayila'}' duwwaa dha.")

    return temp_path


async def _extract_images(response: Any) -> list[ImageOut]:
    images_out: list[ImageOut] = []
    raw_images = getattr(response, "images", None) or []
    if not raw_images:
        return images_out

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    for index, image in enumerate(raw_images):
        file_stem = uuid.uuid4().hex
        try:
            saved_path = await image.save(
                path=str(IMAGE_DIR),
                filename=file_stem,
                verbose=False,
            )
            name = Path(saved_path).name
            images_out.append(
                ImageOut(
                    id=name,
                    title=getattr(image, "title", None) or f"Suuraa {index + 1}",
                    alt=getattr(image, "alt", None) or "",
                    url=f"/files/{name}",
                )
            )
        except Exception:  # noqa: BLE001
            remote = getattr(image, "url", None)
            if remote:
                images_out.append(
                    ImageOut(
                        id=f"remote-{index}-{file_stem}",
                        title=getattr(image, "title", None) or f"Suuraa {index + 1}",
                        alt=getattr(image, "alt", None) or "",
                        url=remote,
                    )
                )

    return images_out


def _content_disposition(filename: str) -> str:
    ascii_name = re.sub(r"[^\x20-\x7E]", "_", filename) or "download.bin"
    return (
        f'attachment; filename="{ascii_name}"; '
        f"filename*=UTF-8''{quote(filename)}"
    )


async def _send_with_auth_retry(send_coro_factory) -> Any:
    """Run a chat send; on auth failure recover once and retry once."""
    async with session_manager.chat_lock:
        chat = await session_manager.ensure_chat()
        try:
            return await send_coro_factory(chat)
        except Exception as first:  # noqa: BLE001
            if not _is_auth_failure(first):
                raise
            recovered = await session_manager.recover(force=True)
            if not recovered:
                raise
            chat = await session_manager.ensure_chat()
            return await send_coro_factory(chat)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    await session_manager.bootstrap()
    session_manager.start_keepalive()

    try:
        yield
    finally:
        await session_manager.shutdown()


app = FastAPI(title="dubbii-wrapper", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/status")
async def status_endpoint():
    return session_manager.status_payload()


@app.post("/cookies")
async def cookies_endpoint(body: CookiesRequest):
    try:
        await session_manager.set_cookies(body.psid, body.psidts)
    except AuthError:
        return JSONResponse(
            status_code=401,
            content={
                "error": "Cookies hin fudhatamne. Mee qabxii sirrii ta'an galchi.",
                "state": session_manager.state,
            },
        )
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            status_code=500,
            content={
                "error": f"Cookies haaromsuun hin milkoofne: {exc}",
                "state": session_manager.state,
            },
        )

    # Never echo cookie values back.
    return {
        "ok": True,
        "state": session_manager.state,
        "source": session_manager.source,
        "last_checked": session_manager.last_checked,
    }


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(body: ChatRequest):
    if not session_manager.ready_for_chat():
        # One recovery attempt before failing hard.
        recovered = await session_manager.recover(force=True)
        if not recovered or not session_manager.ready_for_chat():
            return _client_not_ready_response()

    prompt = f"{SYSTEM_RULE}\n\n{body.text}"

    try:
        response = await _send_with_auth_retry(
            lambda chat: chat.send_message(prompt)
        )
    except Exception as exc:  # noqa: BLE001
        return _gemini_error_response(exc)

    reply = (response.text or "").strip()
    images = await _extract_images(response)
    if not reply and not images:
        return JSONResponse(
            status_code=502,
            content={"error": "Deebiin duwwaa dhufe."},
        )

    return ChatResponse(text=reply or "", images=images)


@app.post("/chat-file", response_model=ChatResponse)
async def chat_file_endpoint(
    files: list[UploadFile] = File(...),
    text: str = Form(""),
):
    if not session_manager.ready_for_chat():
        recovered = await session_manager.recover(force=True)
        if not recovered or not session_manager.ready_for_chat():
            return _client_not_ready_response()

    if not files:
        return JSONResponse(
            status_code=400,
            content={
                "error": "Faayilli hin argamne. Mee faayila tokko ykn caalaa filadhu."
            },
        )

    saved_paths: list[Path] = []

    try:
        for upload in files:
            try:
                saved_paths.append(await _save_upload_temporarily(upload))
            except UploadRejected as exc:
                return JSONResponse(
                    status_code=exc.status_code,
                    content={"error": exc.message},
                )

        user_text = (text or "").strip() or "Faayiloota kana naaf ibsi."
        prompt = f"{SYSTEM_RULE}\n\n{user_text}"
        paths = [str(path) for path in saved_paths]

        try:
            response = await _send_with_auth_retry(
                lambda chat: chat.send_message(prompt, files=paths)
            )
        except Exception as exc:  # noqa: BLE001
            return _gemini_error_response(exc)
    finally:
        for path in saved_paths:
            path.unlink(missing_ok=True)

    reply = (response.text or "").strip()
    images = await _extract_images(response)
    if not reply and not images:
        return JSONResponse(
            status_code=502,
            content={"error": "Deebiin duwwaa dhufe."},
        )

    return ChatResponse(text=reply or "", images=images)


@app.post("/export")
async def export_endpoint(body: ExportRequest):
    title = (body.title or "Deebii Dubbii").strip() or "Deebii Dubbii"
    try:
        payload = render_export(body.text, body.format, title)
    except FileNotFoundError as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            status_code=500,
            content={"error": f"Faayila uumuu hin dandeenye: {exc}"},
        )

    filename = build_download_filename(title, body.format)
    return Response(
        content=payload,
        media_type=CONTENT_TYPES[body.format],
        headers={"Content-Disposition": _content_disposition(filename)},
    )


@app.get("/files/{filename}")
async def get_saved_file(filename: str):
    safe_name = Path(filename).name
    if safe_name != filename or ".." in filename:
        return JSONResponse(
            status_code=400,
            content={"error": "Maqaan faayilaa sirrii miti."},
        )

    path = IMAGE_DIR / safe_name
    if not path.is_file():
        return JSONResponse(
            status_code=404,
            content={"error": "Faayilli hin argamne."},
        )

    return FileResponse(path, filename=safe_name)


@app.post("/reset")
async def reset_endpoint():
    if not session_manager.ready_for_chat():
        recovered = await session_manager.recover(force=True)
        if not recovered or not session_manager.ready_for_chat():
            return _client_not_ready_response()

    async with session_manager.chat_lock:
        try:
            await session_manager.reset_chat()
        except Exception as exc:  # noqa: BLE001
            return JSONResponse(
                status_code=500,
                content={"error": f"Haasa'uu haaromsuun hin milkoofne: {exc}"},
            )

    return {"ok": True, "message": "Haasa'uun haaromfame."}
