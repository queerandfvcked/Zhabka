export const API_BASE = 'http://localhost:8000'

export async function getVacancies() {
  const res = await fetch(`${API_BASE}/vacancies`)
  return res.json()
}

export async function getSources() {
  const res = await fetch(`${API_BASE}/sources`)
  return res.json()
}

export async function getProfile() {
  const res = await fetch(`${API_BASE}/profile`)
  return res.json()
}

export async function saveProfile(profile) {
  const res = await fetch(`${API_BASE}/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  return res.json()
}

export async function startRefresh() {
  const res = await fetch(`${API_BASE}/refresh`, { method: 'POST' })
  return res.json()
}

export async function getRefreshStatus() {
  const res = await fetch(`${API_BASE}/refresh/status`)
  return res.json()
}

export async function sendChatMessage(message) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  return res.json()
}

export async function uploadResume(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/resume`, {
    method: 'POST',
    body: formData,
  })
  return res.json()
}

export async function getAiConfig() {
  const res = await fetch(`${API_BASE}/ai-config`)
  return res.json()
}

export async function saveAiConfig(config) {
  const res = await fetch(`${API_BASE}/ai-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  return res.json()
}
