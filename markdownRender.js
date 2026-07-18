/**
 * Лёгкий рендер telegram-style markdown в HTML — без внешних библиотек.
 * Посты из Telegram используют упрощённый markdown (**bold**,
 * [text](url)), не полный CommonMark — этого достаточно.
 *
 * Экранируем HTML ДО применения своей разметки, чтобы случайный '<'/'>'
 * в тексте поста не сломал вёрстку и не создавал риск инъекции.
 */

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderTelegramMarkdown(text) {
  if (!text) return ''

  let html = escapeHtml(text)

  // **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // [text](url) — markdown-ссылки
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  )

  // переносы строк
  html = html.replace(/\n/g, '<br/>')

  return html
}
