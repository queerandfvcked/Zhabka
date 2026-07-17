"""
Разовая проверка: какие модели Gemini реально доступны твоему ключу
прямо сейчас. Модели у Google обновляются часто, надёжнее спросить
API напрямую, чем полагаться на имя из статьи/документации.

Запуск:
    python scripts\\list_models.py
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GCP_API_KEY")

resp = requests.get(
    f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"
)

if resp.status_code != 200:
    print(f"Ошибка: {resp.status_code} {resp.text[:300]}")
else:
    models = resp.json().get("models", [])
    print(f"Доступно моделей: {len(models)}\n")
    for m in models:
        name = m["name"].replace("models/", "")
        methods = m.get("supportedGenerationMethods", [])
        if "generateContent" in methods:
            print(f"  {name}")
