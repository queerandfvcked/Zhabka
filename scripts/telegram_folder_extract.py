"""
Спайк №2: получаем список каналов, входящих в публичную ПАПКУ Telegram
(ссылка вида https://t.me/addlist/XXXXXXXXXXXXXXXX), БЕЗ вступления
в саму папку и без вступления в отдельные каналы.

Используем сырой метод Telegram API chatlists.checkChatlistInvite --
он как раз предназначен для "превью" содержимого папки до того,
как пользователь решит на неё подписаться.

Установка:
    pip install telethon

Использует тот же API_ID/API_HASH и файл сессии, что и предыдущий скрипт
(telegram_channel_test.py) -- если ты уже логинился там, здесь логиниться
заново не придётся (сессия переиспользуется).
"""

from telethon.sync import TelegramClient
from telethon.tl.functions.chatlists import CheckChatlistInviteRequest
from telethon.tl.types.chatlists import ChatlistInvite, ChatlistInviteAlready

# --- Заполни своими данными (те же, что в telegram_channel_test.py) ---
API_ID = 37460353
API_HASH = "57b8f6086831f18134d4270fe6d34858"

SESSION_NAME = "job_radar_session"  # тот же файл сессии, что и в первом скрипте

# Ссылка на папку -- можно вставить целиком, слаг вытащим сами
FOLDER_LINK = "https://t.me/addlist/FDJaOUlv0-ozNTRi"


def extract_slug(link: str) -> str:
    return link.rstrip("/").split("/")[-1]


def main():
    slug = extract_slug(FOLDER_LINK)
    print(f"Слаг папки: {slug}")

    with TelegramClient(SESSION_NAME, API_ID, API_HASH) as client:
        result = client(CheckChatlistInviteRequest(slug=slug))

        if isinstance(result, ChatlistInviteAlready):
            print("Похоже, ты уже подписан на эту папку (или на часть чатов).")
            chats = result.already_peers  # уже добавленные
            missing = result.missing_peers  # ещё не добавленные
            all_chats = result.chats
        elif isinstance(result, ChatlistInvite):
            print(f"Папка: {result.title}")
            all_chats = result.chats
        else:
            print("Неожиданный тип ответа:", type(result))
            return

        print(f"\nВсего чатов/каналов в папке: {len(all_chats)}\n")

        usernames = []
        for chat in all_chats:
            username = getattr(chat, "username", None)
            title = getattr(chat, "title", "???")
            if username:
                usernames.append(username)
                print(f"  @{username}  --  {title}")
            else:
                print(f"  (без публичного username)  --  {title}")

        print(f"\nИтоговый список публичных username-ов ({len(usernames)} шт.):")
        print(usernames)


if __name__ == "__main__":
    main()
