"""
Общее состояние синка для collect_and_generate.py и classify.py.

Зачем: раньше сбор брал «посты за последние 24 часа» — жёстко, независимо
от того, когда был прошлый синк. Теперь окно сбора считается от момента
последнего ПОЛНОСТЬЮ успешного синка: прошло 3 часа — соберём за 3 часа,
прошло 5 дней — за 5 дней (но не глубже MAX_LOOKBACK_DAYS).

Как это работает:
  1. collect_and_generate.py в начале спрашивает compute_since() — с какого
     момента собирать, а после записи raw_vacancies.json вызывает
     mark_collected(время_начала_сбора).
  2. classify.py в самом конце, ТОЛЬКО если не было ни одной ошибки API,
     вызывает promote_success() — «этот сбор полностью обработан».
  3. Если ошибки были, граница не сдвигается: при следующем синке окно
     начнётся с прежнего места, и упавшие посты соберутся снова (а те, что
     уже обработаны, classify.py пропустит по processed_posts.json).

Состояние лежит в src/data/sync_state.json. Если файл удалить — следующий
синк просто будет «первым запуском».
"""

import json
import os
from datetime import datetime, timedelta, timezone

STATE_FILE = "src/data/sync_state.json"

# Глубже этого в прошлое не ходим, даже если с последнего синка прошло
# больше времени (старые вакансии в основном уже неактуальны, и это
# защита от многочасовой классификации тысяч постов).
MAX_LOOKBACK_DAYS = 14

# Окно самого первого запуска, когда истории синков ещё нет.
FIRST_RUN_LOOKBACK_DAYS = 1

# Небольшой запас назад от прошлого синка — на случай расхождения часов и
# постов, опубликованных прямо во время прошлого сбора. Дубли не страшны:
# classify.py пропускает уже обработанные посты.
OVERLAP_HOURS = 1


def _parse(ts):
    try:
        dt = datetime.fromisoformat(ts)
    except (TypeError, ValueError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def load_state() -> dict:
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(state: dict) -> None:
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    os.replace(tmp, STATE_FILE)


def compute_since(now: datetime | None = None):
    """Возвращает (с_какого_момента_собирать, причина).
    причина: 'first' | 'since_last' | 'capped'."""
    now = now or datetime.now(timezone.utc)
    floor = now - timedelta(days=MAX_LOOKBACK_DAYS)

    last = _parse(load_state().get("last_success_at"))
    if last is None or last > now:  # нет истории (или часы сбились)
        return now - timedelta(days=FIRST_RUN_LOOKBACK_DAYS), "first"

    since = last - timedelta(hours=OVERLAP_HOURS)
    if since < floor:
        return floor, "capped"
    return since, "since_last"


def mark_collected(started_at: datetime) -> None:
    """Сбор завершён и raw_vacancies.json записан. started_at — момент
    НАЧАЛА сбора (не конца): посты, вышедшие во время сбора, должны
    попасть в окно следующего синка."""
    state = load_state()
    state["pending_started_at"] = started_at.isoformat()
    save_state(state)


def promote_success() -> bool:
    """Вызывается classify.py, когда все посты обработаны без ошибок API.
    Возвращает True, если граница сдвинулась."""
    state = load_state()
    pending = _parse(state.get("pending_started_at"))
    if pending is None:
        return False
    last = _parse(state.get("last_success_at"))
    if last is not None and last >= pending:
        return False  # назад не двигаем
    state["last_success_at"] = pending.isoformat()
    save_state(state)
    return True
