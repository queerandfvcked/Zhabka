"""
Собирает посты из всех каналов публичной папки Telegram и генерирует
готовую HTML-страницу (inbox.html) с этими постами -- без вступления
в каналы, без сервера, без npm. Просто открой inbox.html в браузере.

Установка:
    pip install telethon

Использует тот же файл сессии, что и предыдущие спайки
(job_radar_session.session) -- если уже логинился, логиниться заново
не придётся.
"""

import json
from datetime import datetime, timedelta, timezone

from telethon.sync import TelegramClient
from telethon.tl.functions.chatlists import CheckChatlistInviteRequest
from telethon.tl.types.chatlists import ChatlistInvite, ChatlistInviteAlready

# --- Заполни своими данными ---
API_ID = 37460353
API_HASH = "57b8f6086831f18134d4270fe6d34858"

SESSION_NAME = "job_radar_session"

FOLDER_LINK = "https://t.me/addlist/jyx71VPASmJjNmJl"
HOURS_BACK = 24
MESSAGES_PER_CHANNEL = 20


def extract_slug(link: str) -> str:
    return link.rstrip("/").split("/")[-1]


def get_channels_from_folder(client, folder_link: str):
    slug = extract_slug(folder_link)
    result = client(CheckChatlistInviteRequest(slug=slug))

    if isinstance(result, (ChatlistInvite, ChatlistInviteAlready)):
        chats = result.chats
    else:
        raise RuntimeError(f"Неожиданный ответ от Telegram: {type(result)}")

    channels = []
    for chat in chats:
        username = getattr(chat, "username", None)
        title = getattr(chat, "title", "Без названия")
        if username:
            channels.append({"username": username, "title": title})
    return channels


def collect_posts(client, channels, hours_back: int):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours_back)
    posts = []

    for ch in channels:
        try:
            entity = client.get_entity(ch["username"])
            messages = client.get_messages(entity, limit=MESSAGES_PER_CHANNEL)
        except Exception as e:
            print(f"  Пропускаю @{ch['username']}: {e}")
            continue

        for m in messages:
            if m.date and m.date > cutoff and m.text:
                posts.append({
                    "channel_username": ch["username"],
                    "channel_title": ch["title"],
                    "date": m.date.isoformat(),
                    "text": m.text,
                    "link": f"https://t.me/{ch['username']}/{m.id}",
                })

    posts.sort(key=lambda p: p["date"], reverse=True)
    return posts


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>жабка</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0F1B14;
    --sidebar-bg: #0A130E;
    --card: #F7F3E8;
    --accent: #9FD13B;
    --accent-deep: #2F5233;
    --ink: #1C2A1D;
    --muted-dark: #6E8F72;
    --muted-card: #7C8A78;
    --line: rgba(255,255,255,0.07);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--card);
    font-family: 'Inter', sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .app { display: flex; height: 100vh; overflow: hidden; }

  /* ---------- Sidebar ---------- */
  .sidebar {
    width: 264px; flex-shrink: 0;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--line);
    display: flex; flex-direction: column;
    padding: 20px 14px;
    overflow-y: auto;
  }
  .brand {
    display: flex; align-items: center; gap: 9px;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700; font-size: 21px; letter-spacing: -0.02em;
    color: var(--card);
    padding: 6px 8px 20px;
    cursor: pointer; user-select: none;
  }
  .frog-eyes circle.iris { fill: var(--card); }
  .frog-eyes circle.pupil { fill: var(--accent); }

  .day-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .day-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 10px; border-radius: 8px;
    font-size: 14px; color: var(--muted-dark);
    cursor: pointer; border-left: 2px solid transparent;
  }
  .day-item:hover { background: rgba(255,255,255,0.04); color: var(--card); }
  .day-item.active {
    background: rgba(159,209,59,0.12);
    color: var(--card);
    border-left: 2px solid var(--accent);
  }
  .day-item .count {
    font-family: 'IBM Plex Mono', monospace; font-size: 11px;
    color: var(--muted-dark); background: rgba(255,255,255,0.06);
    padding: 1px 7px; border-radius: 20px;
  }
  .day-item.active .count { color: var(--accent); }

  .sidebar-foot {
    margin-top: auto; padding: 12px 10px 4px;
    font-family: 'IBM Plex Mono', monospace; font-size: 11px;
    color: var(--muted-dark); border-top: 1px dashed var(--line);
  }

  /* ---------- Main ---------- */
  .main { flex: 1; overflow-y: auto; }
  .main-inner { max-width: 640px; margin: 0 auto; padding: 32px 24px 80px; }

  .topbar { display: none; }

  .main-header { margin-bottom: 22px; }
  .main-title {
    font-family: 'Space Grotesk', sans-serif; font-weight: 700;
    font-size: 26px; letter-spacing: -0.02em; margin: 0 0 12px;
  }
  .receipt {
    font-family: 'IBM Plex Mono', monospace; font-size: 13px;
    color: var(--muted-dark);
    border-top: 1px dashed var(--muted-dark);
    border-bottom: 1px dashed var(--muted-dark);
    padding: 10px 0;
    display: flex; justify-content: space-between;
  }

  .feed { display: flex; flex-direction: column; gap: 14px; margin-top: 22px; }

  .card {
    background: var(--card);
    color: var(--ink);
    border-radius: 14px;
    padding: 18px 20px;
    box-shadow: 0 1px 0 rgba(0,0,0,0.04);
  }
  .card-meta {
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    color: var(--muted-card);
    margin-bottom: 10px;
  }
  .card-meta .channel { color: var(--accent-deep); font-weight: 500; }
  .card-text {
    font-size: 15px; line-height: 1.5;
    white-space: pre-wrap;
    margin: 0 0 12px;
    max-height: 8.4em;
    overflow: hidden;
  }
  .card-text.expanded { max-height: none; }
  .card-footer { display: flex; justify-content: space-between; align-items: center; }
  .toggle {
    background: none; border: none; padding: 0;
    font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500;
    color: var(--accent-deep); cursor: pointer; text-decoration: underline;
  }
  .open-link {
    font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600;
    color: var(--ink); text-decoration: none;
    background: var(--accent); padding: 6px 12px; border-radius: 8px;
  }
  .open-link:hover { opacity: 0.85; }

  .empty {
    margin-top: 60px; text-align: center; color: var(--muted-dark);
    font-family: 'Space Grotesk', sans-serif; font-size: 18px;
  }

  /* ---------- Mobile: sidebar becomes fullscreen page ---------- */
  @media (max-width: 768px) {
    .sidebar {
      position: fixed; inset: 0; width: 100%;
      transform: translateX(-100%);
      transition: transform 0.22s ease;
      z-index: 20;
      padding-top: 24px;
    }
    .sidebar.open { transform: translateX(0); }

    .topbar {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; border-bottom: 1px solid var(--line);
      position: sticky; top: 0; background: var(--bg); z-index: 5;
    }
    .menu-btn {
      background: none; border: none; color: var(--card);
      font-size: 20px; cursor: pointer; padding: 4px 6px;
      font-family: 'Space Grotesk', sans-serif;
    }
    .topbar-title {
      font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px;
    }
    .main-inner { padding: 20px 16px 60px; }
  }
</style>
</head>
<body>
<div class="app">
  <nav class="sidebar" id="sidebar">
    <div class="brand" onclick="selectDay('__all__')">
      <svg class="frog-eyes" width="30" height="18" viewBox="0 0 34 20">
        <circle class="iris" cx="9" cy="10" r="9"></circle>
        <circle class="iris" cx="25" cy="10" r="9"></circle>
        <circle class="pupil" cx="9" cy="10" r="3.5"></circle>
        <circle class="pupil" cx="25" cy="10" r="3.5"></circle>
      </svg>
      жабка
    </div>
    <ul class="day-list" id="day-list"></ul>
    <div class="sidebar-foot" id="sidebar-foot"></div>
  </nav>

  <main class="main">
    <div class="topbar">
      <button class="menu-btn" onclick="toggleSidebar(true)">&#9776;</button>
      <span class="topbar-title" id="topbar-title">жабка</span>
    </div>
    <div class="main-inner">
      <div class="main-header">
        <h1 class="main-title" id="main-title">Всё</h1>
        <div class="receipt">
          <span id="receipt-left"></span>
          <span id="receipt-right"></span>
        </div>
      </div>
      <div class="feed" id="feed"></div>
      <div class="empty" id="empty" style="display:none;">Пока пусто. Жабка ждёт.</div>
    </div>
  </main>
</div>

<script>
  const POSTS = __DATA_JSON__;

  const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

  function dateKey(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }
  function dayLabel(iso) {
    const d = new Date(iso);
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    if (dateKey(iso) === dateKey(today.toISOString())) return 'Сегодня';
    if (dateKey(iso) === dateKey(yest.toISOString())) return 'Вчера';
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
  function timeStr(iso) {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  // группировка по дням, сохраняя порядок появления (уже отсортировано по убыванию даты)
  const dayMap = new Map(); // key -> { label, posts: [] }
  POSTS.forEach(p => {
    const key = dateKey(p.date);
    if (!dayMap.has(key)) dayMap.set(key, { label: dayLabel(p.date), posts: [] });
    dayMap.get(key).posts.push(p);
  });

  let activeDay = '__all__';

  function renderSidebar() {
    const list = document.getElementById('day-list');
    list.innerHTML = '';

    const allItem = document.createElement('li');
    allItem.className = 'day-item' + (activeDay === '__all__' ? ' active' : '');
    allItem.innerHTML = `<span>Всё</span><span class="count">${POSTS.length}</span>`;
    allItem.onclick = () => selectDay('__all__');
    list.appendChild(allItem);

    for (const [key, group] of dayMap.entries()) {
      const item = document.createElement('li');
      item.className = 'day-item' + (activeDay === key ? ' active' : '');
      item.innerHTML = `<span>${group.label}</span><span class="count">${group.posts.length}</span>`;
      item.onclick = () => selectDay(key);
      list.appendChild(item);
    }

    const channelsCount = new Set(POSTS.map(p => p.channel_username)).size;
    document.getElementById('sidebar-foot').textContent = `источников: ${channelsCount}`;
  }

  function renderMain() {
    const posts = activeDay === '__all__' ? POSTS : dayMap.get(activeDay).posts;
    const title = activeDay === '__all__' ? 'Всё' : dayMap.get(activeDay).label;

    document.getElementById('main-title').textContent = title;
    document.getElementById('topbar-title').textContent = title;
    document.getElementById('receipt-left').textContent = `улов: ${posts.length} постов`;
    document.getElementById('receipt-right').textContent = `источников: ${new Set(posts.map(p => p.channel_username)).size}`;

    const feed = document.getElementById('feed');
    const empty = document.getElementById('empty');
    feed.innerHTML = '';
    empty.style.display = posts.length === 0 ? 'block' : 'none';

    posts.forEach((post, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-meta">
          <span class="channel">@${post.channel_username}</span>
          <span>${timeStr(post.date)}</span>
        </div>
        <p class="card-text" id="text-${i}">${post.text.replace(/</g, '&lt;')}</p>
        <div class="card-footer">
          <button class="toggle" onclick="toggleText(${i})">развернуть</button>
          <a class="open-link" href="${post.link}" target="_blank" rel="noopener">Открыть в Telegram</a>
        </div>
      `;
      feed.appendChild(card);
    });
  }

  function selectDay(key) {
    activeDay = key;
    renderSidebar();
    renderMain();
    toggleSidebar(false);
  }

  function toggleSidebar(open) {
    document.getElementById('sidebar').classList.toggle('open', open);
  }

  function toggleText(i) {
    document.getElementById(`text-${i}`).classList.toggle('expanded');
  }

  renderSidebar();
  renderMain();
</script>
</body>
</html>
"""


def main():
    with TelegramClient(SESSION_NAME, API_ID, API_HASH) as client:
        print("Получаю список каналов из папки...")
        channels = get_channels_from_folder(client, FOLDER_LINK)
        print(f"Найдено каналов с публичным username: {len(channels)}")

        print(f"Собираю посты за последние {HOURS_BACK}ч...")
        posts = collect_posts(client, channels, HOURS_BACK)
        print(f"Собрано постов: {len(posts)}")

    data_path = "src/data/raw_vacancies.json"
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
    print(f"Сохранено: {data_path}")

    html = HTML_TEMPLATE.replace("__DATA_JSON__", json.dumps(posts, ensure_ascii=False))
    inbox_path = "public/inbox.html"
    with open(inbox_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Сохранено: {inbox_path} — открой его в браузере")


if __name__ == "__main__":
    main()
