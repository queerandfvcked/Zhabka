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
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
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


def extract_telegram_post_id(url: str):
    """Ловит ссылки вида t.me/канал/123 — на другой пост в Telegram
    (не на бота, не на канал целиком — именно на конкретное сообщение)."""
    match = re.search(r"t\.me/([A-Za-z0-9_]+)/(\d+)(?:\?|$)", url)
    return match.group(0) if match else None


def fetch_telegram_post(url: str):
    """
    Ссылки на другой пост в Telegram (например, дайджест ссылается на
    более подробный пост в этом же канале) отдают через обычный fetch
    только урезанный превью-сниппет (~180 символов), не полный текст.
    У Telegram есть отдельный embed-виджет (?embed=1) — им пользуются
    сайты, которые встраивают посты Telegram себе на страницу, и он
    отдаёт HTML с полным текстом поста.
    """
    embed_url = url.split("?")[0] + "?embed=1"
    try:
        resp = requests.get(embed_url, headers=HEADERS, timeout=15)
    except requests.RequestException as e:
        print(f"    [resolver] {url} (telegram embed) -> ошибка запроса: {type(e).__name__}")
        return None

    if resp.status_code != 200:
        print(f"    [resolver] {url} (telegram embed) -> HTTP {resp.status_code}, пропускаю")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    # Специфичный класс виджета Telegram для текста поста
    msg = soup.find("div", class_="tgme_widget_message_text")
    if msg:
        text = msg.get_text(separator="\n").strip()
    else:
        # На случай если разметка виджета изменилась — общий fallback
        for tag in soup(["script", "style"]):
            tag.decompose()
        text = soup.get_text(separator="\n").strip()

    if len(text) < 50:
        print(f"    [resolver] {url} (telegram embed) -> получено всего "
              f"{len(text)} символов, пропускаю")
        return None

    return {"description": text}


def fetch_generic_page(url: str):
    """Универсальный fallback: любая публичная страница без логина."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
    except requests.RequestException as e:
        print(f"    [resolver] {url} -> ошибка запроса: {type(e).__name__}")
        return None

    if resp.status_code != 200:
        print(f"    [resolver] {url} -> HTTP {resp.status_code}, пропускаю")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    text = soup.get_text(separator="\n")
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    # Слишком короткий текст — вероятно, страница за логином, JS-рендерится
    # или заблокировала запрос
    if len(text) < 200:
        print(f"    [resolver] {url} -> получено всего {len(text)} символов, "
              f"похоже на JS-страницу или блокировку, пропускаю")
        return None

    return {"description": text}


LINK_PATTERN = re.compile(r"\[([^\]]+)\]\((https?://[^\)]+)\)")


def enrich_links_in_text(text: str, max_chars_per_link: int = 4000) -> str:
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

        if details is None and extract_telegram_post_id(url):
            result = fetch_telegram_post(url)
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