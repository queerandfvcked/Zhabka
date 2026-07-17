"""
Классификация вакансий через бесплатный Gemini Flash.

Берёт сырые посты из vacancies.json (результат collect_and_generate.py),
для каждого поста:
  1. пробует обогатить текст через resolver.py (hh.ru API / generic fetch),
  2. отправляет в Gemini вместе с profile.json,
  3. получает структурированный JSON — один пост может вернуть НЕСКОЛЬКО
     вакансий (для постов-дайджестов вида "Вакансии на сегодня: 1... 2...").

Результат сохраняется в vacancies_classified.json — именно этот файл
нужно скопировать в src/data/vacancies.json во фронтенд-проекте.

Установка:
    pip install requests beautifulsoup4

Получить API-ключ: https://aistudio.google.com -> API keys -> Create key.
Уточни на месте актуальное имя модели в разделе моделей — на момент
написания это семейство "gemini-*-flash", но версии обновляются.
"""

import json
import os
import re
import time
import hashlib
import requests
from dotenv import load_dotenv

from resolver import enrich_links_in_text

load_dotenv()

# --- Заполни своими данными ---
GEMINI_API_KEY = os.getenv("GCP_API_KEY")
MODEL_NAME = "gemini-3.1-flash-lite"  # проверь через scripts/list_models.py, что доступно именно тебе

GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{MODEL_NAME}:generateContent?key={GEMINI_API_KEY}"
)

INPUT_FILE = "src/data/raw_vacancies.json"
OUTPUT_FILE = "src/data/vacancies.json"
PROFILE_FILE = "profile.json"

# Версия пайплайна — меняй эту строку при ЛЮБОМ изменении промпта/схемы
# в этом файле или в resolver.py. Записи с другой версией считаются
# устаревшими и пересчитываются автоматически, без ручного удаления файла.
PIPELINE_VERSION = "2026-07-14-v3"


SYSTEM_PROMPT = """Ты — модуль извлечения структуры из постов о вакансиях
для приложения Zhabka. Тебе дан текст одного поста из Telegram-канала
(иногда обогащённый полным текстом со страницы вакансии) и профиль
пользователя, который ищет работу.

ПРАВИЛА:

1. Один пост может содержать ОДНУ вакансию или НЕСКОЛЬКО (пост-дайджест
   вида "Вакансии на сегодня: 1... 2... 3..."). Верни массив объектов —
   по одному на каждую найденную вакансию, даже если она всего одна.
   В тексте поста рядом с некоторыми ссылками может встретиться блок вида
   "[Full details from Headhunter]: ..." — это подтянутый полный текст
   именно ТОЙ вакансии, к пункту которой он приписан (стоит сразу после
   её ссылки), используй его для заполнения полей именно этого пункта
   дайджеста, не путай с другими пунктами.

2. НИКОГДА не выдумывай данные, которых нет в тексте. Если поле
   неизвестно — ставь null, а не предположение. Требования (requirements)
   бери как есть из текста, не сглаживай и не обобщай — если написано
   "Illustrator, After Effects, презентации" при тайтле "UX/UI Designer",
   именно так и перечисли, это важное несоответствие, а не шум.

3. Определи строгость требования по опыту (strict: true/false) —
   различай "обязателен опыт от 3 лет" (true) и "опыт будет плюсом"
   или "готовы рассмотреть без опыта" (false). Если не указано явно —
   null.

4. Реши, стоит ли вообще показывать вакансию пользователю — одним
   булевым полем aiVerdict.show. false, если выполняется любое из:
   - роль вообще не про дизайн (backend, QA, DevOps, продажи и т.д.);
   - явно противоречит жёстким условиям профиля (формат работы,
     минимальная зарплата, если указана и известна зарплата вакансии);
   - вакансия попадает под exclude из aiNotes профиля (например, Gamedev).

   ВАЖНО про роль — здесь НЕ надо быть снисходительным, в отличие от
   опыта (см. ниже). Профиль пользователя — Product Designer / UX/UI
   Designer. Это НЕ включает:
   - смежные, но другие профессии, даже если они упоминают "продукт"
     или "дизайн" в названии — например "Продуктовый аналитик" (это
     аналитика/исследования, не дизайн), "Дизайнер интерьера",
     "Бренд-дизайнер", "Иллюстратор", "Моушн-дизайнер", "Полиграфический
     дизайнер" — если профиль явно не просит эти специализации через
     role или aiNotes include, считай их show=false;
   - формулировки вроде "требует продуктового мышления" или
     "качественные/количественные исследования" НЕ делают роль
     дизайнерской сами по себе — оценивай именно название и суть роли,
     а не отдельные ключевые слова из описания задач.
   Product/UX/UI/Web/Interaction/Interface Design — да, засчитывается.
   Любая другая специализация дизайна или смежная профессия — нет, если
   явно не указана в профиле.

   ВАЖНО про опыт — это самый частый источник ошибочного скрытия
   подходящих вакансий, будь особенно осторожен здесь:
   - Требование опыта НЕ является жёстким основанием для show=false,
     если оно не сформулировано явно и однозначно в тексте требований
     (например "обязателен коммерческий опыт от 3 лет",
     "только специалисты с опытом в продуктовой команде").
   - Категория/грейд вакансии на площадке (например "3-6 лет" на hh.ru)
     — это НЕ то же самое, что явное текстовое требование. Если в самом
     тексте требований строгой формулировки нет — считай опыт нестрогим.
   - Учитывай aiNotes профиля про реальный опыт пользователя (например,
     самостоятельная практика вместо коммерческого опыта) — это
     полноценный опыт для целей сравнения, а не "опыта нет".

   В целом: при неоднозначности по ОПЫТУ И УСЛОВИЯМ склоняйся к
   show=true. При неоднозначности по РОЛИ (это вообще не та профессия
   или явно другая специализация дизайна) — склоняйся к show=false.
   Пользователь ищет работу без коммерческого опыта, релевантных вакансий
   и так мало каждый день — лучше показать пограничный случай по опыту с
   честной пометкой "требует уточнения", чем молча скрыть то, что могло
   подойти. Но захламлять подборку вакансиями другой профессии — это
   ровно то, чего продукт должен избегать по своей исходной идее.

5. Сформируй reasons — список причин, объясняющих, почему вакансия
   показана (или что вызывает сомнение), БЕЗ категориального лейбла
   сверху вроде "Good match"/"Worth applying". Пользователь должен
   понять решение по списку причин, а не по абстрактной оценке.
   Например:
   [
     {"type": "good", "text": "Product Design"},
     {"type": "good", "text": "Remote"},
     {"type": "warn", "text": "3+ years required"}
   ]
   Если в посте недостаточно данных для оценки — не выдумывай, а добавь
   причину с type "warn" вида "Not enough details in the post — open
   original to check". Обязательно включи причину с type "warn" вида
   "Title says X, but requirements are Y", если есть явное несоответствие
   между заголовком вакансии и реальными требованиями (например, тайтл
   "UX/UI Designer", а в требованиях Illustrator/After Effects/
   презентации — это графический дизайн, не UX/UI).

6. aiNotes профиля (exclude/condition/include) должны явно влиять на
   show (см. пункт 4) и попадать в reasons, если сработали.

7. Заполни sourceExcerpt — точную цитату именно ТОГО фрагмента исходного
   текста, который относится к этой конкретной вакансии (для постов с
   несколькими вакансиями это один пункт из списка, не весь пост; для
   постов с одной вакансией — это может совпадать с полным текстом).
   Это нужно, чтобы в интерфейсе не приходилось вручную искать нужный
   пункт среди остальных при просмотре оригинала.

8. Верни ТОЛЬКО валидный JSON-массив, без markdown-разметки, без ```json,
   без пояснительного текста до или после.

Схема одного объекта в массиве:
{
  "title": string | null,
  "company": string | null,
  "salary": string | null,
  "experience": { "value": string | null, "strict": boolean | null },
  "workFormat": string | null,
  "location": string | null,
  "requirements": [string],
  "sourceExcerpt": string,
  "aiVerdict": {
    "show": boolean,
    "reasons": [{"type": "good"|"warn"|"bad", "text": string}]
  }
}
"""


def classify_post(post_text: str, profile: dict, max_retries: int = 4) -> list[dict]:
    user_content = (
        f"ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ:\n{json.dumps(profile, ensure_ascii=False)}\n\n"
        f"ТЕКСТ ПОСТА:\n{post_text}"
    )

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_content}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }

    wait = 15  # стартовая пауза при 429, растёт с каждой повторной попыткой
    for attempt in range(max_retries):
        resp = requests.post(GEMINI_URL, json=payload, timeout=30)

        if resp.status_code == 200:
            data = resp.json()
            raw_text = None
            try:
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
                # json.loads падает, если после валидного JSON есть ещё
                # текст (иногда модель добавляет что-то лишнее в конце).
                # raw_decode берёт только первый валидный JSON-кусок,
                # остальное просто игнорирует.
                decoder = json.JSONDecoder()
                parsed, _ = decoder.raw_decode(raw_text.strip())
                return parsed if isinstance(parsed, list) else [parsed]
            except (KeyError, IndexError, json.JSONDecodeError) as e:
                print(f"  Не удалось разобрать ответ модели: {e}")
                if raw_text is not None:
                    print(f"  Сырой ответ (первые 300 символов): {raw_text[:300]!r}")
                else:
                    print(f"  Сырой ответ API: {str(data)[:300]!r}")
                return []

        if resp.status_code == 429:
            print(f"  429 (лимит), жду {wait}с и пробую снова "
                  f"(попытка {attempt + 1}/{max_retries})...")
            time.sleep(wait)
            wait *= 2  # экспоненциальный backoff: 15 -> 30 -> 60 -> 120
            continue

        print(f"  Ошибка API ({resp.status_code}): {resp.text[:200]}")
        return []

    print("  Не удалось получить ответ после всех попыток, пропускаю пост")
    return []


def normalize_text(text: str) -> str:
    """Для сравнения на точное совпадение — убираем разницу в пробелах/регистре."""
    return re.sub(r"\s+", " ", text.strip().lower())


def already_processed_key(post: dict) -> str:
    """Уникальный ключ поста для проверки, классифицирован ли он уже."""
    return f"{post['channel_username']}|{post['date']}|{post['text'][:50]}"


def main():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        raw_posts = json.load(f)

    with open(PROFILE_FILE, "r", encoding="utf-8") as f:
        profile = json.load(f)

    # Дедупликация: один и тот же пост нередко репостят в несколько каналов.
    # Сравниваем по точному тексту (без учёта пробелов/регистра) — не
    # пытаемся судить о смысле, только про буквальный повтор, чтобы не
    # тратить AI-квоту дважды на одно и то же.
    seen_texts = set()
    deduped_posts = []
    for p in raw_posts:
        norm = normalize_text(p["text"])
        if norm in seen_texts:
            continue
        seen_texts.add(norm)
        deduped_posts.append(p)

    if len(deduped_posts) < len(raw_posts):
        print(f"Дублей отброшено: {len(raw_posts) - len(deduped_posts)}")
    raw_posts = deduped_posts

    # Если уже есть результат с прошлого запуска — загружаем его, но
    # оставляем только записи текущей версии пайплайна. Всё, что
    # классифицировано по устаревшему промпту/схеме, выбрасываем из
    # results и пересчитываем заново — без этого старые записи тихо
    # тянутся из запуска в запуск, даже когда промпт уже изменился.
    results = []
    processed_keys = set()
    try:
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            loaded = json.load(f)
        stale_count = 0
        for v in loaded:
            if v.get("pipeline_version") != PIPELINE_VERSION:
                stale_count += 1
                continue
            results.append(v)
            processed_keys.add(
                f"{v['channel_username']}|{v['date']}|{v.get('original_text', '')[:50]}"
            )
        print(f"Найден предыдущий результат: {len(results)} вакансий актуальной "
              f"версии пропускаю пересчёт, {stale_count} устаревших будут "
              f"пересчитаны заново.")
    except FileNotFoundError:
        pass

    posts_to_process = [
        p for p in raw_posts if already_processed_key(p) not in processed_keys
    ]
    print(f"К обработке: {len(posts_to_process)} из {len(raw_posts)} постов.")

    for i, post in enumerate(posts_to_process):
        print(f"[{i + 1}/{len(posts_to_process)}] @{post['channel_username']}...")

        # Обогащаем ВСЕ ссылки внутри текста поста (не только одну ссылку
        # на сам пост в Telegram) — для дайджестов это критично, там на
        # каждую вакансию своя ссылка на hh.ru/другую площадку.
        enriched_text = enrich_links_in_text(post["text"])

        vacancies = classify_post(enriched_text, profile)

        for v in vacancies:
            if not v.get("aiVerdict", {}).get("show", True):
                # AI решил не показывать — не сохраняем совсем, без архива.
                # При следующем сборе окно постов обновится естественным
                # образом, специально хранить отказы смысла нет.
                continue
            v["channel_username"] = post["channel_username"]
            v["channel_title"] = post["channel_title"]
            v["date"] = post["date"]
            v["link"] = post["link"]
            v["original_text"] = post["text"]
            v["pipeline_version"] = PIPELINE_VERSION

            # Стабильный ID — не зависит от позиции в массиве и не
            # меняется при повторной классификации того же контента.
            # Нужен фронтенду для отметок "просмотрено"/закладок.
            id_source = f"{post['channel_username']}|{post['date']}|{v.get('sourceExcerpt', '')[:80]}"
            v["id"] = hashlib.sha256(id_source.encode("utf-8")).hexdigest()[:16]

            results.append(v)

        # сохраняем прогресс после каждого поста — если скрипт прервётся
        # или упрётся в лимит, уже классифицированное не потеряется
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        time.sleep(5)  # бесплатный тир Gemini ограничен по запросам в минуту

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\nГотово: {len(results)} вакансий -> {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
