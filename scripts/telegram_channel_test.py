"""
Минимальный прототип: проверяем, можно ли читать сообщения
из ПУБЛИЧНЫХ Telegram-каналов по username БЕЗ вступления/подписки.

Установка:
    pip install telethon

Перед запуском:
    1. Зайди на https://my.telegram.org, залогинься своим номером телефона.
    2. Раздел "API development tools" -> создай приложение (любое название/платформа).
    3. Получишь API_ID (число) и API_HASH (строка) -- впиши их ниже.

Первый запуск:
    - Скрипт спросит номер телефона (в международном формате, например +48...),
      затем код из Telegram (придёт в само приложение Telegram, не SMS),
      возможно пароль 2FA, если он у тебя включен.
    - После первого успешного логина создастся файл сессии (job_radar_session.session),
      и повторно логиниться не придётся.

Важно: этот скрипт НЕ вступает в каналы. Он резолвит канал по username
через client.get_entity() и читает историю сообщений напрямую.
"""

from telethon.sync import TelegramClient
from datetime import datetime, timedelta, timezone

# --- Заполни своими данными ---
API_ID = 37460353  # <-- твой api_id с my.telegram.org
API_HASH = "57b8f6086831f18134d4270fe6d34858"  # <-- твой api_hash

# Список публичных каналов для теста (без @, просто username)
CHANNELS_TO_TEST = ['mindset_jobs', 'uiux_jobs', 'hellonewjob', 'onaboka', 'reopsad', 'gingerbunjob', 'oh_kadrovichka', 'annaznamenskaya', 'jobforjunior', 'fordesigner', 'jun_hi_vacancies', 'uiux_jobs_resumes', 'juno_jobs', 'uptume', 'dashich_begi', 'junior_designers', 'newdirections', 'budujobs', 'etc_by_lukina', 'careerwithh', 'zdemcv', 'designer_ru', 'hireproproduct', 'kate_update2024', 'lenasokollova_careerwithoutbugs', 'growwithdaria', 'ivandoronin', 'artdesignjob', 'zloy_kollega', 'local_talent', 'koblovacoach', 'womenintechrus', 'mtsbankcareer', 'design_jobs_uxui', 'bezaspera', 'hcareers_jobs', 'duosapiens'
    "durov",       # пример публичного канала для проверки
    # "some_job_channel",  # <-- сюда впиши username реального канала с вакансиями
]

# За сколько часов назад забирать посты
HOURS_BACK = 72

SESSION_NAME = "job_radar_session"


def main():
    with TelegramClient(SESSION_NAME, API_ID, API_HASH) as client:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=HOURS_BACK)

        for username in CHANNELS_TO_TEST:
            print(f"\n=== Канал: {username} ===")
            try:
                entity = client.get_entity(username)
            except Exception as e:
                print(f"  Не удалось получить канал: {e}")
                continue

            messages = client.get_messages(entity, limit=20)
            fresh = [m for m in messages if m.date and m.date > cutoff and m.text]

            print(f"  Всего сообщений получено: {len(messages)}, "
                  f"свежих за {HOURS_BACK}ч: {len(fresh)}")

            for m in fresh[:5]:
                preview = m.text[:120].replace("\n", " ")
                print(f"  [{m.date}] {preview}...")


if __name__ == "__main__":
    main()
