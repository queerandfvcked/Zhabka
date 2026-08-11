import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Menu, Search, X, ArrowDown } from 'lucide-react'
import Sidebar from './components/Sidebar'
import JobCard from './components/JobCard'
import ChatInput from './components/ChatInput'
import RightDrawer from './components/RightDrawer'
import Profile from './components/Profile'
import Settings from './components/Settings'
import JumpToDatePopover from './components/JumpToDatePopover'
import Toast from './components/Toast'
import TypewriterText from './components/TypewriterText'
import SplashScreen from './components/SplashScreen'
import Mascot from './components/Mascot'
import { getVacancies, getProfile, saveProfile, startRefresh, getRefreshStatus, sendChatMessage, getSources } from './api'
import './App.css'

const SEEN_KEY = 'zhabka:seenIds'
const MESSAGES_KEY = 'zhabka:messages'
const LASTSYNC_KEY = 'zhabka:lastSync'

const defaultProfile = {
  role: [],
  experience: '1-3 years',
  workFormat: { remote: true, hybrid: false, office: false, relocate: false },
  officeLocations: [],
  minSalary: null,
  salaryCurrency: '₽',
  hideWithoutSalary: false,
  resume: { filename: null, uploadedAt: null },
  aiNotes: [],
  disabledSources: [],
}

const vacancyId = (v) => v.id || v.link

function getDateLabel(date) {
  const d = new Date(date)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function loadSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'))
  } catch { return new Set() }
}

function saveSeen(ids) {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]))
}

function loadMessages() {
  try {
    return JSON.parse(localStorage.getItem(MESSAGES_KEY) || '[]')
  } catch { return [] }
}

function saveMessages(msgs) {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs))
}

function loadLastSync() {
  try {
    return localStorage.getItem(LASTSYNC_KEY) || '—'
  } catch { return '—' }
}

function saveLastSync(val) {
  localStorage.setItem(LASTSYNC_KEY, val)
}

const FrogIcon = () => (
  <svg width="16" height="12" viewBox="0 0 34 20" style={{ flexShrink: 0 }}>
    <circle cx="9" cy="10" r="9" fill="var(--accent-soft)" />
    <circle cx="25" cy="10" r="9" fill="var(--accent-soft)" />
    <circle cx="9" cy="10" r="3.5" fill="var(--accent)" />
    <circle cx="25" cy="10" r="3.5" fill="var(--accent)" />
  </svg>
)

export default function App() {
  const [activeView, setActiveView] = useState('inbox')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedVacancy, setSelectedVacancy] = useState(null)
  const [bookmarked, setBookmarked] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [profile, setProfile] = useState(defaultProfile)
  const [lastSync, _setLastSync] = useState(loadLastSync)
  const setLastSync = useCallback((val) => {
    _setLastSync(val)
    saveLastSync(val)
  }, [])
  const [seenIds, setSeenIds] = useState(loadSeen)
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [vacancies, setVacancies] = useState([])
  const [sources, setSources] = useState([])

  // Стейт для сообщений чата
  const [messages, setMessages] = useState(loadMessages)

  // Стейт для живого статуса синхронизации
  const [syncStatus, setSyncStatus] = useState(null)

  // Стейт для ошибок AI (неверный ключ, таймаут и т.п.)
  const [aiError, setAiError] = useState(null)

  // Стейт для навигации по поисковым совпадениям
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0)

  // Показываем кнопку «вниз», когда ускроллили от низа
  const [showJumpToBottom, setShowJumpToBottom] = useState(false)

  // Toast state & ref
  const [showToast, setShowToast] = useState(false)
  const toastTimerRef = useRef(null)

  const searchRef = useRef(null)
  const scrollWrapperRef = useRef(null)
  // Флаг: синк только что завершился — следующий скролл должен идти
  // не вниз (как для обычных сообщений), а к первым непрочитанным вакансиям
  const justSyncedRef = useRef(false)

  const inboxCount = vacancies.filter((v) => !seenIds.has(vacancyId(v))).length

  const triggerToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setShowToast(true)
    toastTimerRef.current = setTimeout(() => {
      setShowToast(false)
    }, 2500)
  }, [])

  // Даты для календаря — берём из того же поля, по которому группируется
  // таймлайн (fetchedAt || date), чтобы заголовок дня в ленте всегда
  // существовал для любой доступной в календаре даты.
  const uniqueDates = useMemo(() => {
    const set = new Set()
    vacancies.forEach((v) => {
      const d = new Date(v.fetchedAt || v.date)
      if (isNaN(d.getTime())) return
      set.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      )
    })
    return [...set].sort()
  }, [vacancies])

  const filteredVacancies = useMemo(() => {
    let list = vacancies
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((v) => {
        const searchable = [
          v.title, v.company,
          v.channel_username, v.channel_title,
          v.workFormat, v.location,
          ...(v.requirements || []),
          v.original_text,
        ].filter(Boolean).join(' ').toLowerCase()
        return searchable.includes(q)
      })
    }
    return list
  }, [vacancies, searchQuery])

  const matchCount = filteredVacancies.length

  useEffect(() => {
    setCurrentMatchIdx(0)
  }, [searchQuery])

  const navigateToMatch = useCallback((delta) => {
    setCurrentMatchIdx((prev) => {
      const next = prev + delta
      if (next < 0) return matchCount - 1
      if (next >= matchCount) return 0
      return next
    })
  }, [matchCount])

  useEffect(() => {
    const vac = filteredVacancies[currentMatchIdx]
    if (!vac) return
    const id = `timeline-item-vac-${vacancyId(vac)}`
    const el = document.getElementById(id)
    if (el) {
      const wrapper = el.closest('.scroll-wrapper')
      if (wrapper) {
        const top = el.offsetTop - wrapper.offsetTop - 120
        wrapper.scrollTo({ top, behavior: 'smooth' })
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [currentMatchIdx, filteredVacancies])

  const timeline = useMemo(() => {
    const items = []

    // 1. Сообщения
    messages.forEach((msg, i) => {
      const rawTime = msg._ts || msg.timestamp || msg.createdAt
      let ms = typeof rawTime === 'number' ? rawTime : new Date(rawTime).getTime()

      if (isNaN(ms) || !rawTime) {
        ms = 0
      }

      items.push({
        id: `msg-${msg._ts || i}`,
        type: 'message',
        sortTime: new Date(ms), // Передаем обратно полноценный Date
        data: msg,
      })
    })

    // 2. Вакансии
    filteredVacancies.forEach((vac) => {
      const rawDate = vac.fetchedAt || vac.date
      const ms = new Date(rawDate).getTime()

      items.push({
        id: `vac-${vacancyId(vac)}`,
        type: 'vacancy',
        sortTime: new Date(isNaN(ms) ? 0 : ms), // Передаем обратно полноценный Date
        data: vac,
      })
    })

    // 3. Сортировка через .getTime() (гарантирует корректное сравнение чисел)
    return items.sort((a, b) => a.sortTime.getTime() - b.sortTime.getTime())
  }, [messages, filteredVacancies])

  const markSeenById = useCallback((id) => {
    setSeenIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      saveSeen(next)
      return next
    })
  }, [])

  const markSeen = useCallback((v) => markSeenById(vacancyId(v)), [markSeenById])

  // Ref-карта на DOM-узлы карточек вакансий в таймлайне (id вакансии -> элемент)
  const vacancyRefs = useRef(new Map())
  const setVacancyRef = useCallback((id) => (el) => {
    if (el) vacancyRefs.current.set(id, el)
    else vacancyRefs.current.delete(id)
  }, [])

  // Сплэш-скрин при старте: держим, пока не готовы (а) данные и (б) минимальное
  // время показа — раздельно, чтобы быстрый бэкенд не "мигал" сплэшем на 50мс,
  // а медленный не держал пользователя дольше необходимого.
  const [vacanciesReady, setVacanciesReady] = useState(false)
  const [profileReady, setProfileReady] = useState(false)
  const dataReady = vacanciesReady && profileReady
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  const [splashGone, setSplashGone] = useState(false)
  const showSplash = !splashGone
  const splashLeaving = dataReady && minTimeElapsed

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), 900)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!splashLeaving) return
    // Ждём конца CSS-перехода (0.3s в SplashScreen.css) перед размонтированием,
    // иначе фейд-аут не успеет доиграть.
    const timer = setTimeout(() => setSplashGone(true), 320)
    return () => clearTimeout(timer)
  }, [splashLeaving])

  useEffect(() => {
    getVacancies()
      .then((v) => {
        setVacancies(v)
        setVacanciesReady(true)
      })
      .catch(() => setVacanciesReady(true))
  }, [])

  useEffect(() => {
    getSources().then(setSources)
  }, [])

  useEffect(() => {
    saveMessages(messages)
  }, [messages])

  useEffect(() => {
    getProfile().then((p) => {
      if (p && Object.keys(p).length > 0) setProfile(p)
      setProfileReady(true)
    }).catch(() => setProfileReady(true))
  }, [])

  const handleCardClick = useCallback((v) => {
    setSelectedVacancy(v)
    markSeen(v)
  }, [markSeen])

  const handleProfileUpdate = useCallback((patch) => {
    setProfile((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      saveProfile(next)
      return next
    })
    triggerToast()
  }, [triggerToast])

  const handleChatSend = useCallback(async (message) => {
    setMessages((prev) => [...prev, { type: 'user', text: message, _ts: Date.now() }])
    try {
      const result = await sendChatMessage(message)
      if (result.error) {
        setAiError(`AI error: ${result.error}`)
        setTimeout(() => setAiError(null), 8000)
      } else {
        setAiError(null)
      }
      if (result.profile) setProfile(result.profile)
      setMessages((prev) => [...prev, { type: 'ai', text: result.reply, _ts: Date.now() }])
    } catch {
      setAiError('AI request failed — is the backend running?')
      setTimeout(() => setAiError(null), 8000)
      setMessages((prev) => [...prev, { type: 'ai', text: 'Network error — try again later.', _ts: Date.now() }])
    }
  }, [])

  const handleSyncNow = useCallback(async () => {
    try {
      const res = await startRefresh()
      if (res.status === 'already_running') {
        setMessages((prev) => [...prev, { type: 'ai', text: 'Sync already in progress.', _ts: Date.now() }])
        return
      }
    } catch {
      setMessages((prev) => [...prev, { type: 'ai', text: 'Failed to start sync — is the backend running?', _ts: Date.now() }])
      return
    }

    setSyncStatus('Starting sync...')

    return new Promise((resolve) => {
      const poll = setInterval(async () => {
        try {
          const status = await getRefreshStatus()
          if (status.message) setSyncStatus(status.message)
          if (!status.running) {
            clearInterval(poll)
            setSyncStatus(null)
            const log = status.log || []
            const errors = log.filter((l) => l.includes('ошибкой'))
            const tail = log.slice(-6).join('\n')
            let msg
            if (errors.length > 0) {
              msg = `Sync finished with errors:\n\`\`\`\n${tail}\n\`\`\``
            } else {
              msg = 'Sync complete. Check the feed for new vacancies.'
            }
            const freshVacancies = await getVacancies()
            justSyncedRef.current = true
            setVacancies(freshVacancies)
            setLastSync(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }))
            setMessages((prev) => [...prev, { type: 'ai', text: msg, _ts: Date.now() }])
            resolve()
          }
        } catch {
          clearInterval(poll)
          setSyncStatus(null)
          setMessages((prev) => [...prev, { type: 'ai', text: 'Sync failed — network error.', _ts: Date.now() }])
          resolve()
        }
      }, 2000)
    })
  }, [])

  const handleBookmark = () => {
    if (!selectedVacancy) return
    setBookmarked((prev) => {
      const next = new Set(prev)
      const id = vacancyId(selectedVacancy)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const activeSources = sources.length

  const handleSearchToggle = () => {
    setSearchOpen((prev) => {
      if (!prev) setTimeout(() => searchRef.current?.focus(), 100)
      return !prev
    })
    if (searchOpen) setSearchQuery('')
  }

  const handleSearchBlur = () => {
    if (!searchQuery) setSearchOpen(false)
  }

  const isBookmarked = (v) => bookmarked.has(vacancyId(v))

  // Автоскролл вниз при появлении новых сообщений
  useEffect(() => {
    if (messages.length > 0 && scrollWrapperRef.current) {
      scrollWrapperRef.current.scrollTo({
        top: scrollWrapperRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [messages])

  useEffect(() => {
    if (activeView !== 'inbox' || !scrollWrapperRef.current) return
    scrollWrapperRef.current.scrollTop = scrollWrapperRef.current.scrollHeight
  }, [activeView, filteredVacancies.length])

  // После завершения синка скроллим не вниз (к сообщению чата), а вверх —
  // к первой непрочитанной вакансии (Unread-разделитель). Эффект стоит
  // ПОСЛЕ двух scroll-to-bottom эффектов выше, поэтому выполняется позже
  // и переопределяет их скролл в рамках того же коммита.
  useEffect(() => {
    if (!justSyncedRef.current) return
    justSyncedRef.current = false
    const wrapper = scrollWrapperRef.current
    if (!wrapper) return
    requestAnimationFrame(() => {
      const target = document.getElementById('unread-divider')
      if (target) {
        const top = target.offsetTop - wrapper.offsetTop - 100
        wrapper.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      }
      // Если непрочитанных нет (новых вакансий не пришло) — оставляем как есть
    })
  }, [vacancies])

  // Jump to date: плавно скроллим к заголовку выбранного дня, не фильтруя ленту.
  useEffect(() => {
    if (!selectedDate || activeView !== 'inbox') return
    const wrapper = scrollWrapperRef.current
    const el = document.getElementById(`date-head-${selectedDate}`)
    if (!wrapper || !el) return
    const wrapperTop = wrapper.getBoundingClientRect().top
    const elTop = el.getBoundingClientRect().top
    const target = wrapper.scrollTop + (elTop - wrapperTop) - 96
    wrapper.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [selectedDate, activeView])

  // Показываем кнопку «вниз», если юзер ускроллил от низа более чем на 600px
  useEffect(() => {
    const wrapper = scrollWrapperRef.current
    if (activeView !== 'inbox' || !wrapper) return
    const onScroll = () => {
      const dist = wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight
      setShowJumpToBottom(dist > 600)
    }
    wrapper.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => wrapper.removeEventListener('scroll', onScroll)
  }, [activeView, filteredVacancies.length, messages.length])

  // Помечаем вакансию прочитанной, когда её карточку полностью проскроллили —
  // то есть она целиком ушла за верхнюю границу scroll-wrapper.
  useEffect(() => {
    const wrapper = scrollWrapperRef.current
    if (activeView !== 'inbox' || !wrapper) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.dataset.vacancyId
          if (!id) return
          const rootTop = entry.rootBounds?.top ?? 0
          // Не пересекается с вьюпортом И ушла именно вверх (а не ещё не доскроллена снизу)
          if (!entry.isIntersecting && entry.boundingClientRect.bottom < rootTop) {
            markSeenById(id)
          }
        })
      },
      { root: wrapper, threshold: 0 }
    )

    vacancyRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [activeView, timeline, markSeenById])

  const handleJumpToBottom = () => {
    const wrapper = scrollWrapperRef.current
    if (!wrapper) return
    wrapper.scrollTo({ top: wrapper.scrollHeight, behavior: 'smooth' })
  }

  const renderContent = () => {
    if (activeView === 'profile') {
      return (
        <div className="scroll-wrapper" key="view-profile">
          <div className="view-page">
            <Profile profile={profile} onUpdate={handleProfileUpdate} />
          </div>
        </div>
      )
    }

    if (activeView === 'settings') {
      return (
        <div className="scroll-wrapper" key="view-settings">
          <div className="view-page">
            <Settings onToast={triggerToast} />
          </div>
        </div>
      )
    }

    const isMainInbox = activeView === 'inbox'

    const items =
      activeView === 'bookmarks'
        ? vacancies.filter((v) => isBookmarked(v))
        : []

    const renderTimelineItem = (item, delay = 0) => {
      if (item.type === 'message') {
        const msg = item.data
        if (msg.type === 'user') {
          return (
            <div className="msg-row msg-row-user">
              <div className="msg-bubble msg-bubble-user">
                {msg.text}
              </div>
            </div>
          )
        }
        return (
          <div className="msg-row msg-row-ai">
            <div className="msg-avatar">
              <FrogIcon />
            </div>
            <div className="msg-bubble msg-bubble-ai">
              {msg.text}
            </div>
          </div>
        )
      }
      return (
        <JobCard
          vacancy={item.data}
          onClick={() => handleCardClick(item.data)}
          searchQuery={searchQuery}
          style={{ animationDelay: `${delay}s` }}
        />
      )
    }

    return (
      <>
        <div className="scroll-wrapper" ref={scrollWrapperRef} key={`view-${activeView}`}>
          <div className="main-inner">
            {activeView === 'bookmarks' && (
              <div className="bookmarks-header">
                <div className="bookmarks-title">Bookmarks</div>
                <div className="bookmarks-count">{items.length} vacancies</div>
              </div>
            )}

            {activeView === 'inbox' ? (
              searchQuery.trim() && matchCount === 0 ? (
                <div className="empty-state">
                  <Mascot variant="notfound" />
                  <p>Nothing found.</p>
                </div>
              ) : timeline.length === 0 ? (
                <div className="empty-state">
                  <Mascot variant="neutral" />
                  <p>No vacancies yet.<br />Zhabka is watching your sources.</p>
                </div>
              ) : (
                <div className="timeline">
                  {(() => {
                    const elements = []
                    let lastDateStr = null
                    let msgBuffer = []
                    let seenUnreadDivider = false
                    let vacIdx = 0

                    const flushMsgBuffer = () => {
                      if (msgBuffer.length > 0) {
                        elements.push(
                          <div key={`msg-group-${msgBuffer[0].id}`} className="messages-container">
                            {msgBuffer.map((item) => (
                              <div key={item.id}>{renderTimelineItem(item)}</div>
                            ))}
                          </div>
                        )
                        msgBuffer = []
                      }
                    }

                    timeline.forEach((item) => {
                      const dateStr = item.sortTime.toDateString()
                      const dateKey = `${item.sortTime.getFullYear()}-${String(item.sortTime.getMonth() + 1).padStart(2, '0')}-${String(item.sortTime.getDate()).padStart(2, '0')}`

                      // Date section header when day changes
                      if (dateStr !== lastDateStr) {
                        flushMsgBuffer()
                        lastDateStr = dateStr
                        elements.push(
                          <div key={`date-${dateStr}`} id={`date-head-${dateKey}`} className="date-head-sm">
                            {getDateLabel(item.sortTime)}
                          </div>
                        )
                      }

                      // "Unread" divider before first unseen vacancy
                      if (!seenUnreadDivider && item.type === 'vacancy' && !seenIds.has(vacancyId(item.data))) {
                        flushMsgBuffer()
                        seenUnreadDivider = true
                        elements.push(
                          <div key="unread-divider" id="unread-divider" className="seen-divider">
                            <span>Unread</span>
                          </div>
                        )
                      }

                      if (item.type === 'message') {
                        msgBuffer.push(item)
                      } else {
                        flushMsgBuffer()
                        const vId = vacancyId(item.data)
                        const currentVac = searchQuery.trim() ? filteredVacancies[currentMatchIdx] : null
                        const isCurrent = currentVac && vId === vacancyId(currentVac)
                        elements.push(
                          <div
                            key={item.id}
                            id={`timeline-item-${item.id}`}
                            ref={setVacancyRef(vId)}
                            data-vacancy-id={vId}
                            className={isCurrent ? 'timeline-item current-match' : 'timeline-item'}
                          >
                            {renderTimelineItem(item, Math.min(vacIdx++, 10) * 0.05)}
                          </div>
                        )
                      }
                    })
                    flushMsgBuffer()
                    return elements
                  })()}
                </div>
              )
            ) : items.length === 0 ? (
              <div className="empty-state">
                <Mascot variant="neutral" />
                <p>Nothing saved yet.</p>
              </div>
            ) : (
              <div className="feed">
                {items.map((v, i) => (
                  <JobCard
                    key={vacancyId(v)}
                    vacancy={v}
                    onClick={() => handleCardClick(v)}
                    style={{ animationDelay: `${Math.min(i, 10) * 0.05}s` }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {isMainInbox && (
          <div className="chat-area" key={`chat-${activeView}`}>
            {syncStatus && (
              <div className="sync-status-bubble">
                <span className="sync-status-dot" />
                <TypewriterText text={syncStatus} />
              </div>
            )}
            {aiError && (
              <div className="sync-status-bubble error">
                <span className="sync-status-dot error" />
                {aiError}
              </div>
            )}
            {showJumpToBottom && (
              <button className="jump-bottom-btn" onClick={handleJumpToBottom} title="Jump to latest">
                <ArrowDown size={18} />
              </button>
            )}
            <ChatInput
              onSend={handleChatSend}
              onSync={handleSyncNow}
              profile={profile}
              setMessages={setMessages}
            />
          </div>
        )}
      </>
    )
  }

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      if (searchOpen) setSearchOpen(false)
      else setSelectedVacancy(null)
    }
  }, [searchOpen])

  useEffect(() => {
    if (selectedVacancy) markSeen(selectedVacancy)
  }, [selectedVacancy, markSeen])

  return (
    <>
      {showSplash && <SplashScreen leaving={splashLeaving} />}
      <div className="app" onKeyDown={handleKeyDown}>
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        inboxCount={inboxCount}
        isMobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        activeSources={activeSources}
        lastSync={lastSync}
        onSync={handleSyncNow}
      />

      <div className="content-area">
        <main className="main">
          {/* Mobile top bar (mobile only) */}
          <div className={`mobile-top-bar ${searchOpen ? 'search-active' : ''}`}>
            <div className="mobile-nav-left">
              <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                <Menu size={18} />
              </button>
              <span className="mobile-title-pill">
                {activeView === 'inbox' ? 'Inbox' : activeView === 'bookmarks' ? 'Bookmarks' : activeView === 'profile' ? 'Profile' : 'Settings'}
              </span>
            </div>
          </div>

          {/* Floating header — search + calendar (desktop: sticky, mobile: in flow) */}
          {activeView === 'inbox' && (
            <div className="floating-header">
              <div className={`floating-btn search-btn ${searchOpen ? 'expanded' : ''}`} onClick={searchOpen ? undefined : handleSearchToggle}>
                <Search size={20} />
                <input
                  ref={searchRef}
                  className={`floating-search-input ${searchOpen ? 'visible' : ''}`}
                  type="text"
                  placeholder="Search vacancies…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onBlur={handleSearchBlur}
                  onKeyDown={(e) => e.key === 'Escape' && handleSearchToggle()}
                />
                {searchOpen && searchQuery.trim() && matchCount > 0 && (
                  <div className="search-nav-controls">
                    <span className="search-match-count">
                      {currentMatchIdx + 1}/{matchCount}
                    </span>
                    <button className="search-nav-btn" onClick={() => navigateToMatch(-1)} tabIndex={-1} title="Previous match">
                      ▲
                    </button>
                    <button className="search-nav-btn" onClick={() => navigateToMatch(1)} tabIndex={-1} title="Next match">
                      ▼
                    </button>
                  </div>
                )}
                {searchOpen && (
                  <button className="floating-search-close" onClick={handleSearchToggle} tabIndex={-1}>
                    <X size={16} />
                  </button>
                )}
              </div>
              <JumpToDatePopover
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
                availableDates={uniqueDates}
              />
            </div>
          )}

          {renderContent()}
        </main>

        {selectedVacancy && (
          <RightDrawer
            vacancy={selectedVacancy}
            onClose={() => setSelectedVacancy(null)}
            isBookmarked={isBookmarked(selectedVacancy)}
            onToggleBookmark={handleBookmark}
          />
        )}
      </div>

      <Toast show={showToast} message="Changes saved" />
    </div>
    </>
  )
}