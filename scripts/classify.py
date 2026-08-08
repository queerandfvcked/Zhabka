"""
Классификация вакансий через бесплатный Gemini Flash.

Берёт сырые посты из raw_vacancies.json (результат collect_and_generate.py),
для каждого поста:
  1. пробует обогатить текст через resolver.py (hh.ru API / generic fetch),
  2. отправляет в Gemini вместе с profile.json,
  3. получает структурированный JSON — один пост может вернуть НЕСКОЛЬКО
     вакансий (для постов-дайджестов вида "Вакансии на сегодня: 1... 2...").

Результат сохраняется в src/data/vacancies.json — этот файл фронтенд
читает напрямую.

Установка:
    pip install requests beautifulsoup4 python-dotenv

Ключ хранится в .env (не в коде, не в git) — файл .env должен содержать
строку вида:
    GCP_API_KEY=твой_ключ_с_aistudio.google.com

Уточни на месте актуальное имя модели в разделе моделей — на момент
написания это семейство "gemini-*-flash", но версии обновляются.
"""

import json
import os
import re
import time
import hashlib
import difflib
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
PIPELINE_VERSION = "2026-08-08-v10"


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

   КРИТИЧЕСКИ ВАЖНО про привязку данных к своему пункту: title,
   sourceExcerpt, requirements, salary, experience для ОДНОЙ вакансии
   дайджеста должны браться СТРОГО из одного и того же пункта списка
   (например, если это пункт "3. Digital Designer в МТС" — все поля
   этого объекта берутся только из текста этого пункта 3 и его
   собственного "[Full details from ...]" блока, а не из пункта 5
   или 8). Перед тем как вернуть массив, мысленно проверь: title и
   sourceExcerpt каждого объекта описывают одну и ту же вакансию?
   Если нет — это ошибка, исправь перед ответом.

   НЕ создавай отдельный объект-вакансию из ссылок в блоках вида
   "Другие вакансии в этой компании:", "Похожие вакансии:", "Ещё
   вакансии:", "Смотрите также:" — это сноски/список ссылок для
   ознакомления, а не структурированные пункты дайджеста с их
   собственным грейдом/зарплатой/форматом. Настоящий пункт дайджеста
   обычно пронумерован и имеет свою структуру (грейд, зарплата,
   формат, ссылка) — сноска в конце поста без такой структуры не
   считается отдельной вакансией, даже если по названию она релевантна
   профилю пользователя.

2. НИКОГДА не выдумывай данные, которых нет в тексте. Если поле
   неизвестно — ставь null, а не предположение. Требования (requirements)
   бери как есть из текста, не сглаживай и не обобщай — если написано
   "Illustrator, After Effects, презентации" при тайтле "UX/UI Designer",
   именно так и перечисли, это важное несоответствие, а не шум.

3. Определи строгость требования по опыту (strict: true/false) —
   различай "обязателен опыт от 3 лет" (true) и "опыт будет плюсом"
   или "готовы рассмотреть без опыта" (false). Если не указано явно —
   null.

   ВАЖНО: во многих постах-дайджестах авторы сами явно указывают грейд
   тегом вида "Грейд: #<любое_слово>" — это ОБЩИЙ ПАТТЕРН, не
   фиксированный список из трёх слов. Примеры реальных значений:
   #junior, #middle, #senior, #lead, #intern, #стажёр, #middle+,
   и любые другие подобные — что бы ни стояло после "Грейд:" (или
   "Level:"/"Grade:") с решёткой — это ПРЯМОЙ источник для
   experience.value, даже если это слово не входит ни в один из
   примеров выше. Не пиши null в experience.value, если грейд явно
   указан таким тегом в тексте поста — это такая же валидная
   информация, как обычная фраза "требуется опыт от 3 лет".

   ВАЖНО про приоритет источников: если по ссылке на площадку удалось
   получить и (а) общую категорию/грейд с сайта (например выпадающий
   список "опыт: 3-6 лет"), и (б) явную текстовую формулировку в
   разделе требований (например "опыт более 4-х лет в продуктовом
   дизайне") — приоритет ВСЕГДА за явной текстовой формулировкой (б),
   она конкретнее и надёжнее. Категория/лейбл площадки используется
   только тогда, когда явной текстовой формулировки в требованиях нет
   вообще. Если они расходятся — бери число из текста требований, а не
   из общей категории.

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
   - ОСОБЕННО ВАЖНО: любые управленческие/владельческие роли —
     "Product Manager", "Product Owner", "Project Manager", "Program
     Manager", "PM", "CPO", "Head of Product" и подобные. Слово
     "Product" в названии НЕ означает совпадение с "Product Designer" —
     это принципиально разные профессии: управление/координация
     продукта vs визуальное/UX-проектирование. Не давай слову "Product"
     само по себе перевешивать очевидный факт, что суть роли —
     менеджмент, а не дизайн-крафт. Формулировка в духе "Product
     Management role matches product-focused design skills" — это
     ошибка рассуждения, которую нужно не допускать: management-роль
     НЕ matches дизайн-профиль, даже если оба слова "product" совпали.
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

   ВАЖНО про формат работы и город — здесь, в отличие от опыта, снисходительность
   НЕ действует, если формат/город прямо указаны в тексте и противоречат
   профилю. Профиль содержит workFormat = {remote, hybrid, office, relocate}
   (булевы флаги) и officeLocations (список городов, релевантен только когда
   hybrid или office = true).

   Алгоритм:
   - Если по тексту вакансия ПОЛНОСТЬЮ удалённая (remote) — сверяй только
     с profile.workFormat.remote. Город вакансии в этом случае не имеет
     значения, даже если он не совпадает с officeLocations.
   - Если по тексту вакансия office или hybrid — сначала проверь
     соответствующий флаг профиля (workFormat.office / workFormat.hybrid).
     Если флаг false — show=false, это жёсткое условие, снисходительности
     здесь нет.
     Если флаг true — дополнительно сверь город вакансии со списком
     officeLocations (сравнение нестрогое, по вхождению/синонимам города,
     например "СПб" = "Санкт-Петербург" = "Питер"). Явное несовпадение
     города (например профиль просит Санкт-Петербург, а в вакансии указан
     Москва или другой конкретный город) — show=false, даже если по роли
     и опыту всё подходит. Если officeLocations пуст — считай любой город
     допустимым для office/hybrid, раз пользователь его не ограничил.
   - Если формат работы или город в посте вообще НЕ указаны (не удаётся
     определить по тексту) — вот здесь можно вернуться к общей
     снисходительности: не скрывай вакансию только из-за отсутствия этих
     данных, но добавь в reasons предупреждение type "warn" вида
     "Work format/location not stated — check original post".
   - Не путай "формат не указан в посте" с "формат указан и не подходит" —
     это разные случаи, снисходительность применима только к первому.

   В целом: при неоднозначности по ОПЫТУ склоняйся к show=true (см. выше).
   Формат работы и город, когда они явно указаны в тексте, — это НЕ повод
   для снисходительности, при явном противоречии всегда show=false.
   При неоднозначности по РОЛИ (это вообще не та профессия
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

7. Заполни sourceExcerpt — точную ДОСЛОВНУЮ цитату именно ТОГО фрагмента
   ИСХОДНОГО текста поста (не из блоков "[Full details from ...]", которые
   добавлены только для твоего понимания контекста — цитируй только
   оригинальный текст Telegram-поста), который относится к этой конкретной
   вакансии. Для постов с несколькими вакансиями это один пункт из списка,
   не весь пост; для постов с одной вакансией — может совпадать с полным
   текстом. НЕ включай в цитату общие рекламные футеры, ссылки на
   сторонние сервисы канала, призывы подписаться/перейти по ссылкам,
   даже если они физически расположены рядом в том же посте — только
   то, что описывает саму вакансию.

   КРИТИЧЕСКИ ВАЖНО: sourceExcerpt должен быть тем, что реально можно
   найти в тексте поста через прямой поиск (Ctrl+F). Если ты не можешь
   процитировать дословный фрагмент — значит такой вакансии в посте НЕТ,
   и её вообще не нужно включать в результат, даже если она кажется
   правдоподобной или похожей на то, что обычно бывает в таких постах.
   НИКОГДА не придумывай вакансию (включая title, company, salary), если
   её нет в исходном тексте — не заполняй правдоподобными, но
   несуществующими данными. Если в посте нет вообще ни одной вакансии,
   подходящей по роли — верни пустой массив [], это нормальный и частый
   результат, не считай его неудачей.

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
        try:
            resp = requests.post(GEMINI_URL, json=payload, timeout=30)
        except requests.exceptions.RequestException as e:
            # Таймаут, обрыв соединения и т.п. — не роняем весь скрипт,
            # ждём и пробуем снова, как при 429. Данные уже сохранённых
            # постов не теряются благодаря сохранению после каждого поста.
            print(f"  Сетевая ошибка ({type(e).__name__}), жду {wait}с и "
                  f"пробую снова (попытка {attempt + 1}/{max_retries})...")
            time.sleep(wait)
            wait *= 2
            continue

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


BARE_LINK_PATTERN = re.compile(r"^[—\-•]\s*\[[^\]]+\]\(https?://\S+\)\s*$")

NON_DESIGN_ROLE_PATTERN = re.compile(
    r"\b(product manager|project manager|program manager|product owner|"
    r"scrum master|delivery manager|business analyst|product analyst|"
    r"account manager|sales manager|hr\s?manager|marketing manager)\b",
    re.IGNORECASE,
)


def is_non_design_management_role(title: str, profile: dict) -> bool:
    """
    Механическая подстраховка: некоторые менеджерские роли ("Product
    Manager", "Product Owner" и т.п.) модель иногда путает с дизайном
    из-за общего слова "Product", несмотря на прямой запрет в промпте
    (уже дважды так случалось). Отсекаем по названию должности, если
    только пользователь явно не указал такую роль в своём профиле.
    """
    if not title or not NON_DESIGN_ROLE_PATTERN.search(title):
        return False
    user_roles = " ".join(profile.get("role", [])).lower()
    if NON_DESIGN_ROLE_PATTERN.search(user_roles):
        return False  # пользователь сам ищет такую роль — не отсекаем
    return True


# Синонимы городов для нестрогого сравнения officeLocations с текстом
# вакансии — модель и площадки пишут по-разному ("СПб", "Питер",
# "Санкт-Петербург"), точное совпадение строк тут бесполезно.
CITY_SYNONYMS = {
    "санкт-петербург": ["спб", "питер", "санкт петербург", "saint petersburg", "st petersburg", "st. petersburg"],
    "москва": ["мск", "moscow"],
}


def _city_variants(city: str) -> set[str]:
    norm = normalize_text(city)
    variants = {norm}
    for canonical, aliases in CITY_SYNONYMS.items():
        if norm == canonical or norm in aliases:
            variants.add(canonical)
            variants.update(aliases)
    return variants


def violates_work_location(v: dict, profile: dict) -> bool:
    """
    Механическая подстраховка на формат работы/город: модель иногда
    показывает офисные/гибридные вакансии не в том городе или из
    формата, выключенного в профиле, несмотря на инструкцию в промпте.
    Не полагаемся только на промпт (аналогично is_non_design_management_role) —
    если из текста вакансии явно следует office/hybrid с конкретным
    городом, а профиль это исключает, отсекаем принудительно.

    Осознанно консервативна: если данных недостаточно (город/формат не
    распознаны однозначно), НЕ блокирует — ложноположительное скрытие
    вредит продукту больше, чем случайный пропуск.
    """
    wf_profile = profile.get("workFormat", {}) or {}
    wf_text = normalize_text(v.get("workFormat") or "")
    location_text = normalize_text(v.get("location") or "")

    is_remote = bool(re.search(r"удал|remote", wf_text))
    if is_remote:
        return False  # remote не зависит от города

    is_office = bool(re.search(r"\bофис", wf_text))
    is_hybrid = bool(re.search(r"гибрид|hybrid", wf_text))
    if not is_office and not is_hybrid:
        return False  # формат не распознан из текста — не блокируем механически

    if is_office and not wf_profile.get("office") and not wf_profile.get("hybrid"):
        # Явно офис, а у пользователя office и hybrid оба выключены —
        # город можно даже не проверять, формат уже не подходит.
        return True
    if is_hybrid and not wf_profile.get("hybrid") and not wf_profile.get("office"):
        return True

    office_locations = profile.get("officeLocations") or []
    if not office_locations or not location_text:
        return False  # нечего сравнивать — не блокируем

    allowed_variants = set()
    for city in office_locations:
        allowed_variants |= _city_variants(city)

    if any(variant in location_text for variant in allowed_variants):
        return False  # город совпал

    return True


def is_bare_footer_link(v: dict) -> bool:
    """
    Ловит случаи вида "Другие вакансии в компании: — [Senior Product
    Designer](url)" — модель иногда всё равно превращает такую строчку
    в отдельную вакансию, несмотря на прямой запрет в промпте. Не
    полагаемся только на промпт — механически отсекаем: если excerpt —
    это ЦЕЛИКОМ одна строка "тире + markdown-ссылка" и вообще никаких
    других данных не извлечено (ни зарплаты, ни формата, ни опыта, ни
    требований) — это, почти наверняка, ссылка из сноски, а не реальный
    пункт дайджеста (у настоящих пунктов в этих каналах всегда есть
    хотя бы грейд/формат/зарплата рядом).
    """
    excerpt = (v.get("sourceExcerpt") or "").strip()
    if not BARE_LINK_PATTERN.match(excerpt):
        return False

    exp = v.get("experience") or {}
    has_any_data = (
        v.get("salary")
        or exp.get("value")
        or v.get("workFormat")
        or v.get("location")
        or v.get("requirements")
    )
    return not has_any_data


def excerpt_is_grounded(excerpt: str, source_text: str, threshold: float = 0.6) -> bool:
    """
    Проверяет, что sourceExcerpt реально взят из исходного текста поста,
    а не выдуман моделью. Не полагаемся на честность модели — это
    механическая проверка, независимая от промпта.
    """
    if not excerpt or not excerpt.strip():
        return False

    norm_excerpt = normalize_text(excerpt)
    norm_source = normalize_text(source_text)

    if norm_excerpt in norm_source:
        return True

    # Точного вхождения нет — считаем степень покрытия на случай
    # небольших расхождений в пробелах/пунктуации при цитировании
    matcher = difflib.SequenceMatcher(None, norm_excerpt, norm_source)
    matched_chars = sum(block.size for block in matcher.get_matching_blocks())
    coverage = matched_chars / max(len(norm_excerpt), 1)
    return coverage >= threshold


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

        try:
            # Обогащаем ВСЕ ссылки внутри текста поста (не только одну ссылку
            # на сам пост в Telegram) — для дайджестов это критично, там на
            # каждую вакансию своя ссылка на hh.ru/другую площадку.
            enriched_text = enrich_links_in_text(post["text"])

            vacancies = classify_post(enriched_text, profile)
        except Exception as e:
            # Что угодно неожиданное на одном посте — не должно ронять
            # весь прогон на оставшихся сотнях постов. Пропускаем и идём
            # дальше, уже сохранённое не теряется.
            print(f"  Неожиданная ошибка на этом посте, пропускаю: "
                  f"{type(e).__name__}: {e}")
            time.sleep(5)
            continue

        for v in vacancies:
            if not v.get("aiVerdict", {}).get("show", True):
                # AI решил не показывать — не сохраняем совсем, без архива.
                # При следующем сборе окно постов обновится естественным
                # образом, специально хранить отказы смысла нет.
                continue

            # Защита от галлюцинаций: проверяем, что sourceExcerpt реально
            # существует в исходном тексте поста, а не выдуман моделью.
            # Не полагаемся на честность модели — механическая проверка.
            if not excerpt_is_grounded(v.get("sourceExcerpt", ""), post["text"]):
                print(f"  Пропускаю '{v.get('title')}' — sourceExcerpt не "
                      f"найден в исходном посте (похоже на галлюцинацию)")
                continue

            # Защита от "других вакансий в компании" — модель иногда
            # превращает ссылку из сноски в отдельную вакансию, несмотря
            # на прямой запрет в промпте. Механическая подстраховка.
            if is_bare_footer_link(v):
                print(f"  Пропускаю '{v.get('title')}' — похоже на ссылку "
                      f"из сноски 'другие вакансии', а не реальный пункт")
                continue

            # Защита от менеджерских ролей (Product Manager/Owner и т.п.),
            # которые модель иногда путает с дизайном из-за слова "Product".
            if is_non_design_management_role(v.get("title", ""), profile):
                print(f"  Пропускаю '{v.get('title')}' — менеджерская роль, "
                      f"не дизайн (несмотря на слово 'Product' в названии)")
                continue

            # Защита от несовпадения формата работы/города с профилем —
            # модель иногда всё равно показывает офис/гибрид не в том
            # городе, несмотря на явную инструкцию в промпте.
            if violates_work_location(v, profile):
                print(f"  Пропускаю '{v.get('title')}' — формат/город "
                      f"({v.get('workFormat')}, {v.get('location')}) не "
                      f"подходит профилю")
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