"""
Резолвер: обогащает пост вакансии полным текстом со страницы по ссылке,
если она есть в посте.

Два уровня:
1. Известные платформы с настоящим API (пока только hh.ru) — надёжно,
   структурированно.
2. Универсальный fallback — забираем страницу как есть и чистим HTML
   до простого текста. Работает для любой публично доступной страницы
   без логина (HireHi, карьерные страницы компаний и т.д.).

Если ни то, ни другое не сработало (нет ссылки, страница приватная,
заблокирована, таймаут) — используем исходный текст из Telegram как
есть, без попытки притвориться, что данных больше, чем на самом деле.

Установка:
    pip install requests beautifulsoup4
"""

import re
import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "ZhabkaJobBot/1.0 (personal project; contact: your_email@example.com)"
}


def extract_hh_id(url: str):
    match = re.search(r"hh\.ru/vacancy/(\d+)", url)
    return match.group(1) if match else None


def fetch_hh_vacancy(vacancy_id: str):
    """Официальный открытый API hh.ru, без авторизации, но с User-Agent."""
    resp = requests.get(
        f"https://api.hh.ru/vacancies/{vacancy_id}", headers=HEADERS, timeout=10
    )
    if resp.status_code != 200:
        return None

    data = resp.json()
    description = re.sub("<[^>]+>", " ", data.get("description", ""))
    return {
        "title": data.get("name"),
        "salary": data.get("salary"),
        "skills": [s["name"] for s in data.get("key_skills", [])],
        "description": description.strip(),
    }


def fetch_generic_page(url: str):
    """Универсальный fallback: любая публичная страница без логина."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
    except requests.RequestException:
        return None

    if resp.status_code != 200:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    text = soup.get_text(separator="\n")
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    # Слишком короткий текст — вероятно, страница за логином или заблокировала запрос
    if len(text) < 200:
        return None

    return {"description": text}


LINK_PATTERN = re.compile(r"\[([^\]]+)\]\((https?://[^\)]+)\)")


def enrich_links_in_text(text: str, max_chars_per_link: int = 1500) -> str:
    """
    Находит ВСЕ markdown-ссылки внутри текста поста (актуально для
    постов-дайджестов, где на каждую из нескольких вакансий — своя
    ссылка на hh.ru/другую площадку) и подставляет обогащённый текст
    сразу после соответствующей ссылки — так AI видит, к какому именно
    пункту дайджеста относится каждое обогащение.

    В отличие от enrich_vacancy(), эта функция не привязана к одной
    ссылке на весь пост — обрабатывает по одной ссылке за раз, каждую
    там, где она встретилась в тексте.
    """

    def replace(match: re.Match) -> str:
        label, url = match.group(1), match.group(2)

        details = None
        hh_id = extract_hh_id(url)
        if hh_id:
            result = fetch_hh_vacancy(hh_id)
            if result:
                details = result["description"]

        if details is None:
            result = fetch_generic_page(url)
            if result:
                details = result["description"]

        if not details:
            return match.group(0)  # ничего не нашли — оставляем как есть

        details = details[:max_chars_per_link]
        return f"{match.group(0)}\n[Full details from {label}]:\n{details}\n"

    return LINK_PATTERN.sub(replace, text)


def enrich_vacancy(telegram_text: str, link: str | None):
    """
    Возвращает (обогащённый_текст, источник_обогащения).
    источник_обогащения полезно сохранить рядом с вакансией — чтобы
    честно показывать в интерфейсе, откуда взялись данные:
    'hh.ru API' / 'generic fetch' / 'telegram only'.
    """
    if not link:
        return telegram_text, "telegram only"

    hh_id = extract_hh_id(link)
    if hh_id:
        enriched = fetch_hh_vacancy(hh_id)
        if enriched:
            combined = (
                f"{telegram_text}\n\n---\nПолный текст вакансии (hh.ru):\n"
                f"{enriched['description']}"
            )
            return combined, "hh.ru API"

    enriched = fetch_generic_page(link)
    if enriched:
        combined = (
            f"{telegram_text}\n\n---\nПолный текст страницы:\n"
            f"{enriched['description']}"
        )
        return combined, "generic fetch"

    return telegram_text, "telegram only (link not resolved)"
