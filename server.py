"""
Локальный бэкенд для Zhabka — связывает интерфейс с уже существующими
скриптами (collect_and_generate.py, classify.py) вместо ручных запусков
и разрозненных файлов.

Установка:
    pip install fastapi uvicorn python-multipart

Запуск (из корня проекта, там же где profile.json и папка scripts/):
    uvicorn server:app --reload --port 8000

Фронтенд (Vite, обычно localhost:5173) стучится сюда на localhost:8000.
Нужно два терминала одновременно: один — npm run dev, другой — uvicorn.
"""

import json
import os
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
PROFILE_FILE = BASE_DIR / "profile.json"
AI_CONFIG_FILE = BASE_DIR / "ai_config.json"
SOURCES_CONFIG_FILE = BASE_DIR / "sources_config.json"
VACANCIES_FILE = BASE_DIR / "src" / "data" / "vacancies.json"
SOURCES_FILE = BASE_DIR / "src" / "data" / "sources.json"
RESUME_DIR = BASE_DIR / "uploads"
RESUME_DIR.mkdir(exist_ok=True)

DEFAULT_GEMINI_API_KEY = os.getenv("GCP_API_KEY")
MODEL_NAME = "gemini-3.1-flash-lite"  # держи синхронно с classify.py

app = FastAPI()

# Отдаём загруженные файлы (резюме) по HTTP, чтобы фронтенд мог
# открыть PDF в новой вкладке.
app.mount("/uploads", StaticFiles(directory=str(RESUME_DIR)), name="uploads")

# Vite dev server и FastAPI — разные порты, нужен CORS, иначе браузер
# заблокирует запросы с фронтенда к этому серверу. Локальный dev-бэкенд
# без cookie/credentials, поэтому разрешаем все origin — так фронтенд
# работает и с телефона (origin http://<LAN-IP>:5173 при запуске --host).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- GET /vacancies ----------

@app.get("/vacancies")
def get_vacancies():
    if not VACANCIES_FILE.exists():
        return []
    mtime = datetime.fromtimestamp(VACANCIES_FILE.stat().st_mtime, tz=timezone.utc).isoformat()
    with open(VACANCIES_FILE, "r", encoding="utf-8") as f:
        vacs = json.load(f)
    for vac in vacs:
        vac.setdefault("fetchedAt", mtime)
    return vacs


# ---------- GET /sources ----------

@app.get("/sources")
def get_sources():
    if not SOURCES_FILE.exists():
        return []
    with open(SOURCES_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)

    # merge with vacancy counts
    counts = {}
    if VACANCIES_FILE.exists():
        with open(VACANCIES_FILE, "r", encoding="utf-8") as f:
            for v in json.load(f):
                u = v.get("channel_username")
                if u:
                    counts[u] = counts.get(u, 0) + 1

    return [{**s, "count": counts.get(s.get("username"), 0)} for s in raw]


# ---------- GET/POST /profile ----------

@app.get("/profile")
def get_profile():
    if not PROFILE_FILE.exists():
        return {}
    with open(PROFILE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@app.post("/profile")
def save_profile(profile: dict):
    with open(PROFILE_FILE, "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)
    return {"status": "saved"}


# ---------- GET/POST /ai-config — отдельно от profile ----------

def _load_ai_config() -> dict:
    """Load ai_config.json with migration from profile.json."""
    if AI_CONFIG_FILE.exists():
        with open(AI_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    # migrate from legacy profile.json fields
    if PROFILE_FILE.exists():
        with open(PROFILE_FILE, "r", encoding="utf-8") as f:
            prof = json.load(f)
        migrated = {}
        if "provider" in prof:
            migrated["provider"] = prof["provider"]
        if "apiKey" in prof:
            migrated["apiKey"] = prof["apiKey"]
        if migrated:
            with open(AI_CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(migrated, f, ensure_ascii=False, indent=2)
            return migrated
    return {"provider": "Gemini", "apiKey": ""}


@app.get("/ai-config")
def get_ai_config():
    return _load_ai_config()


@app.post("/ai-config")
def save_ai_config(ai_config: dict):
    with open(AI_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(ai_config, f, ensure_ascii=False, indent=2)
    return {"status": "saved"}


# ---------- GET/POST /sources-config — отдельно от profile ----------

def _load_sources_config() -> dict:
    """Load sources_config.json with migration from profile.json."""
    if SOURCES_CONFIG_FILE.exists():
        with open(SOURCES_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    # migrate from legacy profile.json fields
    if PROFILE_FILE.exists():
        with open(PROFILE_FILE, "r", encoding="utf-8") as f:
            prof = json.load(f)
        migrated = {}
        if "disabledSources" in prof:
            migrated["disabledSources"] = prof["disabledSources"]
        if "manualSources" in prof:
            migrated["manualSources"] = prof["manualSources"]
        if migrated:
            with open(SOURCES_CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(migrated, f, ensure_ascii=False, indent=2)
            return migrated
    return {"disabledSources": [], "manualSources": []}


@app.get("/sources-config")
def get_sources_config():
    return _load_sources_config()


@app.post("/sources-config")
def save_sources_config(cfg: dict):
    with open(SOURCES_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    return {"status": "saved"}


# ---------- POST /refresh — запуск пайплайна в фоне ----------

pipeline_state = {
    "running": False,
    "log": [],
    "message": "",
    "last_finished_at": None,
}


def _vacancy_id(vac: dict) -> str:
    return vac.get("id") or vac.get("link")


def _load_vacancies_snapshot() -> dict:
    """id -> vac, для того что лежало в файле ДО запуска скриптов."""
    if not VACANCIES_FILE.exists():
        return {}
    with open(VACANCIES_FILE, "r", encoding="utf-8") as f:
        vacs = json.load(f)
    return {_vacancy_id(v): v for v in vacs if _vacancy_id(v)}


def _run_pipeline():
    pipeline_state["running"] = True
    pipeline_state["log"] = []

    # Снэпшот ДО запуска — нужен, чтобы после мёржа не потерять старые
    # вакансии и не перештамповать им fetchedAt, даже если скрипты
    # перезапишут vacancies.json только свежесобранным уловом.
    previous_by_id = _load_vacancies_snapshot()

    sources_cfg = _load_sources_config()
    disabled_sources = sources_cfg.get("disabledSources", [])
    manual_sources = sources_cfg.get("manualSources", [])
    ai_config = _load_ai_config()
    saved_api_key = ai_config.get("apiKey") or ""

    scripts = ["scripts/collect_and_generate.py", "scripts/classify.py"]
    base_env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    if disabled_sources:
        base_env["ZHABKA_DISABLED_SOURCES"] = json.dumps(disabled_sources)
    if manual_sources:
        base_env["ZHABKA_MANUAL_SOURCES"] = json.dumps(manual_sources)
    if saved_api_key:
        base_env["GCP_API_KEY"] = saved_api_key
    try:
        for script in scripts:
            pipeline_state["message"] = f"Running {script}"
            pipeline_state["log"].append(f"--- запускаю {script} ---")
            env = dict(base_env)
            proc = subprocess.Popen(
                [sys.executable, script],
                cwd=str(BASE_DIR),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                encoding="utf-8",
                env=env,
            )
            for line in proc.stdout:
                line_clean = line.rstrip()
                pipeline_state["log"].append(line_clean)
                pipeline_state["message"] = line_clean
                if len(pipeline_state["log"]) > 800:
                    pipeline_state["log"] = pipeline_state["log"][-800:]
            proc.wait()
            if proc.returncode != 0:
                pipeline_state["log"].append(
                    f"--- {script} завершился с ошибкой (код {proc.returncode}) ---"
                )
    finally:
        pipeline_state["running"] = False
        pipeline_state["message"] = ""
        pipeline_state["last_finished_at"] = datetime.now(timezone.utc).isoformat()

    # Мёржим то, что скрипты записали в vacancies.json, со снэпшотом,
    # снятым до запуска. Так:
    #  - у вакансий, которые уже были и остаются — fetchedAt/batchId
    #    НЕ трогаем (иначе они каждый раз "молодеют" и перескакивают
    #    в конец таймлайна, выше более ранних сообщений в чате);
    #  - у по-настоящему новых вакансий — проставляем текущее время;
    #  - вакансии, которые были раньше, но скрипт их в этот раз не
    #    вернул (например classify.py отсеял как несовпадение), не
    #    теряются — остаются в файле с прежним fetchedAt.
    if VACANCIES_FILE.exists():
        now_iso = datetime.now(timezone.utc).isoformat()
        with open(VACANCIES_FILE, "r", encoding="utf-8") as f:
            fresh_vacs = json.load(f)

        merged_by_id = dict(previous_by_id)  # стартуем со старого снэпшота
        for vac in fresh_vacs:
            vid = _vacancy_id(vac)
            if not vid:
                continue
            if vid in previous_by_id:
                # уже видели — сохраняем исходные fetchedAt/batchId,
                # но подхватываем остальные поля на случай, если
                # classify.py их обновил (например verdict/reasons)
                old = previous_by_id[vid]
                merged = {**vac, "fetchedAt": old.get("fetchedAt", now_iso),
                          "batchId": old.get("batchId", now_iso)}
            else:
                merged = {**vac, "fetchedAt": now_iso, "batchId": now_iso}
            merged_by_id[vid] = merged

        merged_vacs = list(merged_by_id.values())
        with open(VACANCIES_FILE, "w", encoding="utf-8") as f:
            json.dump(merged_vacs, f, ensure_ascii=False, indent=2)


@app.post("/refresh")
def refresh():
    if pipeline_state["running"]:
        return {"status": "already_running"}
    thread = threading.Thread(target=_run_pipeline, daemon=True)
    thread.start()
    return {"status": "started"}


@app.get("/refresh/status")
def refresh_status():
    return pipeline_state


# ---------- POST /resume — загрузка PDF резюме ----------

@app.post("/resume")
async def upload_resume(file: UploadFile = File(...)):
    dest = RESUME_DIR / "resume.pdf"
    with open(dest, "wb") as f:
        f.write(await file.read())

    profile = {}
    if PROFILE_FILE.exists():
        with open(PROFILE_FILE, "r", encoding="utf-8") as f:
            profile = json.load(f)

    profile["resume"] = {
        "filename": file.filename,
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
        "url": "/uploads/resume.pdf",
    }
    with open(PROFILE_FILE, "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)

    return {"status": "saved", "filename": file.filename, "url": "/uploads/resume.pdf"}


# ---------- POST /chat — обновление профиля через диалог ----------

CHAT_SYSTEM_PROMPT = """Ты помогаешь обновлять профиль поиска работы
пользователя на основе сообщений в чате. Тебе дан ТЕКУЩИЙ профиль в
формате JSON и НОВОЕ сообщение от пользователя (на русском или
английском).

Обнови ТОЛЬКО те поля, на изменение которых явно указывает сообщение.
Верни JSON-объект с двумя ключами:
{
  "profile_patch": { ...только поля для изменения, в том же формате,
                      что и во входном профиле... },
  "reply": "короткое подтверждение того, что изменилось, на языке
            сообщения пользователя"
}

Правила:
- role — массив строк. Если пользователь добавляет роль — верни ПОЛНЫЙ
  обновлённый массив (старые + новая), не только новую роль.
- aiNotes — массив объектов {type: exclude|include|condition, text}.
  Если добавляешь/меняешь заметку — верни ПОЛНЫЙ обновлённый массив
  aiNotes целиком (это операция замены, не добавления одной записи).
  Если в массиве уже есть заметка того же смысла — замени её, не
  дублируй.
- Если сообщение не подразумевает явного изменения профиля (вопрос,
  реплика не по теме) — profile_patch должен быть {}, а reply —
  вежливый ответ по существу.
- Не придумывай полей, которых нет в схеме входного профиля.
- Верни ТОЛЬКО валидный JSON, без markdown, без пояснений вокруг.
"""


def _load_provider_config():
    try:
        return _load_ai_config()
    except Exception:
        return {}


def _call_ai_chat(profile: dict, message: str) -> dict:
    pconf = _load_provider_config()
    provider = pconf.get("provider", "Gemini")
    api_key = pconf.get("apiKey") or DEFAULT_GEMINI_API_KEY

    user_content = (
        f"ТЕКУЩИЙ ПРОФИЛЬ:\n{json.dumps(profile, ensure_ascii=False)}\n\n"
        f"СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ:\n{message}"
    )

    last_error = ""
    for attempt in range(0, 3):
        try:
            if provider == "Gemini":
                url = (
                    f"https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{MODEL_NAME}:generateContent?key={api_key}"
                )
                payload = {
                    "systemInstruction": {"parts": [{"text": CHAT_SYSTEM_PROMPT}]},
                    "contents": [{"role": "user", "parts": [{"text": user_content}]}],
                    "generationConfig": {"responseMimeType": "application/json"},
                }
                resp = requests.post(url, json=payload, timeout=20)
                if resp.status_code != 200:
                    raise Exception(f"Gemini API error {resp.status_code}: {resp.text[:200]}")
                data = resp.json()
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"]

            elif provider == "OpenRouter":
                url = "https://openrouter.ai/api/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}"}
                payload = {
                    "model": "google/gemini-3.1-flash-lite",
                    "messages": [
                        {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                        {"role": "user", "content": user_content},
                    ],
                    "response_format": {"type": "json_object"},
                }
                resp = requests.post(url, json=payload, headers=headers, timeout=20)
                if resp.status_code != 200:
                    raise Exception(f"OpenRouter error {resp.status_code}: {resp.text[:200]}")
                raw_text = resp.json()["choices"][0]["message"]["content"]

            elif provider == "OpenAI":
                url = "https://api.openai.com/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}"}
                payload = {
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                        {"role": "user", "content": user_content},
                    ],
                    "response_format": {"type": "json_object"},
                }
                resp = requests.post(url, json=payload, headers=headers, timeout=20)
                if resp.status_code != 200:
                    raise Exception(f"OpenAI error {resp.status_code}: {resp.text[:200]}")
                raw_text = resp.json()["choices"][0]["message"]["content"]

            elif provider == "Anthropic":
                url = "https://api.anthropic.com/v1/messages"
                headers = {
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                }
                payload = {
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 2048,
                    "system": CHAT_SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": user_content}],
                }
                resp = requests.post(url, json=payload, headers=headers, timeout=20)
                if resp.status_code != 200:
                    raise Exception(f"Anthropic error {resp.status_code}: {resp.text[:200]}")
                raw_text = resp.json()["content"][0]["text"]

            else:
                raise Exception(f"Unknown provider: {provider}")

            decoder = json.JSONDecoder()
            parsed, _ = decoder.raw_decode(raw_text.strip())
            return parsed

        except requests.exceptions.RequestException as e:
            last_error = f"Connection error: {e}"
            time.sleep(3)
            continue
        except Exception as e:
            last_error = str(e) if str(e) else "Unknown error"
            if attempt == 2:
                break
            time.sleep(3)
            continue

    return {"error": last_error, "profile_patch": {}, "reply": "Sorry, something went wrong — try again."}


@app.post("/chat")
def chat(payload: dict):
    message = payload.get("message", "").strip()
    if not message:
        return {"reply": "", "profile": {}}

    profile = {}
    if PROFILE_FILE.exists():
        with open(PROFILE_FILE, "r", encoding="utf-8") as f:
            profile = json.load(f)

    result = _call_ai_chat(profile, message)
    patch = result.get("profile_patch", {}) or {}

    if patch:
        profile.update(patch)
        with open(PROFILE_FILE, "w", encoding="utf-8") as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)

    return {"reply": result.get("reply", ""), "profile": profile}