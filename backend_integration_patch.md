# Точечная задача: подключить фронтенд к локальному бэкенду

Бэкенд (`server.py`) уже готов и даёт 5 эндпоинтов: `GET /vacancies`,
`GET/POST /profile`, `POST /refresh` + `GET /refresh/status`,
`POST /chat`, `POST /resume`. Эта задача — заменить статичные
данные/заглушки во фронтенде на реальные вызовы этих эндпоинтов.

Положи `api.js` в `src/api.js` — все fetch-вызовы уже там, компоненты
их просто импортируют.

## 1. App.jsx — вакансии больше не статичный импорт

Убрать:
```jsx
import vacancies from './data/vacancies.json'
```

Добавить:
```jsx
import { getVacancies, getProfile, saveProfile, startRefresh, getRefreshStatus, sendChatMessage } from './api'

const [vacancies, setVacancies] = useState([])

useEffect(() => {
  getVacancies().then(setVacancies)
}, [])
```

Везде, где в коде используется `vacancies` (константа верхнего уровня) —
это теперь `vacancies` из state, ничего в остальной логике компонента
менять не нужно, имя переменной то же самое.

## 2. App.jsx — профиль больше не только локальный state

Сейчас:
```jsx
const [profile, setProfile] = useState(defaultProfile)
```

Оставить как есть (это стартовое значение до загрузки), но добавить
загрузку реального профиля при монтировании:
```jsx
useEffect(() => {
  getProfile().then((p) => {
    if (p && Object.keys(p).length > 0) setProfile(p)
  })
}, [])
```

`handleProfileUpdate` — сейчас только обновляет локальный state.
Добавить сохранение на бэкенд после обновления:
```jsx
const handleProfileUpdate = useCallback((patch) => {
  setProfile((prev) => {
    const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
    saveProfile(next)
    return next
  })
}, [])
```

## 3. App.jsx — handleSyncNow вызывает реальный /refresh

Заменить текущую заглушку:
```jsx
const handleSyncNow = useCallback(async () => {
  const res = await startRefresh()
  if (res.status === 'already_running') {
    return 'Sync already in progress.'
  }

  // Опрашиваем статус, пока пайплайн не завершится
  return new Promise((resolve) => {
    const poll = setInterval(async () => {
      const status = await getRefreshStatus()
      if (!status.running) {
        clearInterval(poll)
        const freshVacancies = await getVacancies()
        setVacancies(freshVacancies)
        setLastSync(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }))
        resolve('Sync complete. Check the feed for new vacancies.')
      }
    }, 3000)
  })
}, [])
```

Учти: пайплайн может идти несколько минут (сбор + классификация),
поэтому сообщение в чате должно появиться не сразу — это ожидаемо,
не баг.

## 4. App.jsx — handleChatSend вызывает реальный AI, не regex

Заменить ВЕСЬ текущий блок regex-парсинга (`/product designer|продукт.*дизайн/` и т.д.) на:
```jsx
const handleChatSend = useCallback(async (message) => {
  const result = await sendChatMessage(message)
  if (result.profile) setProfile(result.profile)
  return result.reply
}, [])
```

Проверь, что `ChatInput.jsx` умеет работать с `onSend`, возвращающим
Promise (сейчас, возможно, ожидается синхронный возврат строки) —
если `handleSend` в `ChatInput.jsx` не ждёт `await`, добавь `await`
перед вызовом `onSend(trimmed)`.

## 5. ChatInput.jsx — реальная загрузка резюме вместо симуляции

Заменить текущий `handleFile` (с `setTimeout` и фейковым сообщением) на:
```jsx
import { uploadResume } from '../api'

const handleFile = useCallback(async (file) => {
  if (!file || file.type !== 'application/pdf') return
  setProcessing(true)
  try {
    const result = await uploadResume(file)
    setMessages((prev) => [
      ...prev,
      { type: 'user', text: `Uploaded CV: ${file.name}` },
      { type: 'ai', text: `Got it. Resume "${result.filename}" saved. I'll use it to improve matching.` },
    ])
  } catch {
    setMessages((prev) => [
      ...prev,
      { type: 'ai', text: 'Failed to upload resume — is the backend running?' },
    ])
  } finally {
    setProcessing(false)
  }
}, [])
```

## Не менять

`defaultProfile`, структуру `Profile.jsx`/`Settings.jsx` (они получают
`profile`/`onUpdate` как пропсы — это уже совместимо, менять их не
нужно). Логику группировки по датам, JobCard, RightDrawer — не трогать.

## Напоминание перед запуском

Нужно два терминала одновременно:
```
uvicorn server:app --reload --port 8000
npm run dev
```
Если бэкенд не запущен — фронтенд получит ошибки fetch, это ожидаемо,
не баг во фронтенде.
