export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function getDateGroup(iso) {
  const now = new Date()
  const date = new Date(iso)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date >= today) return 'today'
  if (date >= yesterday) return 'yesterday'
  return 'older'
}

export const dateGroupLabels = {
  today: "Today's jobs",
  yesterday: 'Yesterday',
  older: 'Older',
}

export function groupByDate(vacancies) {
  const groups = { today: [], yesterday: [], older: [] }
  vacancies.forEach((v) => groups[getDateGroup(v.date)].push(v))
  return groups
}
