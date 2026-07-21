export function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function getDateGroup(iso) {
  if (!iso) return 'older'
  const now = new Date()
  const date = new Date(iso)

  // Сравниваем строго по календарным дням (без учета часов/минут)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000

  const targetTime = date.getTime()

  if (targetTime >= todayStart) return 'today'
  if (targetTime >= yesterdayStart) return 'yesterday'
  return 'older'
}

export const dateGroupLabels = {
  today: "Today",
  yesterday: 'Yesterday',
  older: 'Older',
}

export function groupByDate(vacancies) {
  const groups = { today: [], yesterday: [], older: [] }
  vacancies.forEach((v) => {
    const key = getDateGroup(v.date)
    groups[key].push(v)
  })
  return groups
}