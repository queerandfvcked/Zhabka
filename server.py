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

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
PROFILE_FILE = BASE_DIR / "profile.json"
VACANCIES_FILE = BASE_DIR / "src" / "data" / "vacancies.json"
RESUME_DIR = BASE_DIR / "uploads"
RESUME_DIR.mkdir(exist_ok=True)

GEMINI_API_KEY = os.getenv("GCP_API_KEY")
MODEL_NAME = "gemini-3.1-flash-lite"  # держи синхронно с classify.py
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{MODEL_NAME}:generateContent?key={GEMINI_API_KEY}"
)

app = FastAPI()

# Vite dev server и FastAPI — разные порты, нужен CORS, иначе браузер
# заблокирует запросы с фронтенда к этому серверу.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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


# ---------- POST /refresh — запуск пайплайна в фоне ----------

pipeline_state = {
    "running": False,
    "log": [],
    "message": "",
    "last_finished_at": None,
}


def _run_pipeline():
    pipeline_state["running"] = True
    pipeline_state["log"] = []

    scripts = ["scripts/collect_and_generate.py", "scripts/classify.py"]
    try:
        for script in scripts:
            pipeline_state["message"] = f"Running {script}..."
            pipeline_state["log"].append(f"--- запускаю {script} ---")
            env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
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

    # Ставим fetchedAt + batchId на все собранные вакансии
    if VACANCIES_FILE.exists():
        now_iso = datetime.now(timezone.utc).isoformat()
        with open(VACANCIES_FILE, "r", encoding="utf-8") as f:
            vacs = json.load(f)
        for vac in vacs:
            vac["fetchedAt"] = now_iso
            vac["batchId"] = now_iso
        with open(VACANCIES_FILE, "w", encoding="utf-8") as f:
            json.dump(vacs, f, ensure_ascii=False, indent=2)


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
    }
    with open(PROFILE_FILE, "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)

    return {"status": "saved", "filename": file.filename}


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


def _call_gemini_chat(profile: dict, message: str) -> dict:
    user_content = (
        f"ТЕКУЩИЙ ПРОФИЛЬ:\n{json.dumps(profile, ensure_ascii=False)}\n\n"
        f"СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ:\n{message}"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": CHAT_SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_content}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }

    for attempt in range(3):
        try:
            resp = requests.post(GEMINI_URL, json=payload, timeout=20)
        except requests.exceptions.RequestException:
            time.sleep(3)
            continue

        if resp.status_code == 200:
            data = resp.json()
            raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
            decoder = json.JSONDecoder()
            parsed, _ = decoder.raw_decode(raw_text.strip())
            return parsed

        if resp.status_code == 429:
            time.sleep(5)
            continue

        break

    return {"profile_patch": {}, "reply": "Sorry, something went wrong — try again."}


@app.post("/chat")
def chat(payload: dict):
    message = payload.get("message", "").strip()
    if not message:
        return {"reply": "", "profile": {}}

    profile = {}
    if PROFILE_FILE.exists():
        with open(PROFILE_FILE, "r", encoding="utf-8") as f:
            profile = json.load(f)

    result = _call_gemini_chat(profile, message)
    patch = result.get("profile_patch", {}) or {}

    if patch:
        profile.update(patch)
        with open(PROFILE_FILE, "w", encoding="utf-8") as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)

    return {"reply": result.get("reply", ""), "profile": profile}
