import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Menu, Search, X } from 'lucide-react'
import Sidebar from './components/Sidebar'
import JobCard from './components/JobCard'
import ChatInput from './components/ChatInput'
import RightDrawer from './components/RightDrawer'
import Profile from './components/Profile'
import Settings from './components/Settings'
import JumpToDatePopover from './components/JumpToDatePopover'
import vacancies from './data/vacancies.json'
import { groupByDate, dateGroupLabels } from './utils/ai'
import './App.css'

const SEEN_KEY = 'zhabka:seenIds'

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
}

const vacancyId = (v) => v.id || v.link

function loadSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'))
  } catch { return new Set() }
}

function saveSeen(ids) {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]))
}

export default function App() {
  const [activeView, setActiveView] = useState('inbox')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedVacancy, setSelectedVacancy] = useState(null)
  const [bookmarked, setBookmarked] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [profile, setProfile] = useState(defaultProfile)
  const [lastSync, setLastSync] = useState('18:00')
  const [seenIds, setSeenIds] = useState(loadSeen)
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)

  const searchRef = useRef(null)
  const scrollWrapperRef = useRef(null)
  const seenDividerRef = useRef(null)

  const inboxCount = vacancies.length

  const uniqueDates = useMemo(() => {
    const set = new Set()
    vacancies.forEach((v) => {
      if (v.date) set.add(v.date.slice(0, 10))
    })
    return [...set].sort()
  }, [])

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
    if (selectedDate) {
      list = list.filter((v) => v.date && v.date.startsWith(selectedDate))
    }
    return list
  }, [searchQuery, selectedDate])

  // Реверсим массив для чатовой логики (снизу свежие)
  const sortedVacancies = useMemo(() => {
    return [...filteredVacancies].reverse()
  }, [filteredVacancies])

  const grouped = useMemo(() => groupByDate(sortedVacancies), [sortedVacancies])
  const orderedGroups = ['older', 'yesterday', 'today']

  const markSeen = useCallback((v) => {
    const id = vacancyId(v)
    setSeenIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      saveSeen(next)
      return next
    })
  }, [])

  const handleCardClick = useCallback((v) => {
    setSelectedVacancy(v)
    markSeen(v)
  }, [markSeen])

  const handleProfileUpdate = useCallback((patch) => {
    setProfile((prev) => (typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }))
  }, [])

  const handleChatSend = useCallback(
    (message) => {
      const lower = message.toLowerCase()
      const patch = {}
      const newNotes = [...profile.aiNotes]

      if (/product designer|продукт.*дизайн/.test(lower)) {
        if (!profile.role.includes('Product Designer')) {
          patch.role = [...profile.role, 'Product Designer']
        }
      } else if (/ux\/?ui/.test(lower)) {
        const trimmed = message.trim()
        if (!profile.role.includes(trimmed)) {
          patch.role = [...profile.role, trimmed]
        }
      } else if (/no.*(?:commercial )?experience|опыт[аа]?\s*нет/i.test(lower)) patch.experience = '0 years'

      if (/не.*аутсорс|no.*outsource/i.test(lower)) {
        if (!newNotes.find((n) => n.text.toLowerCase().includes('outsource')))
          newNotes.push({ type: 'exclude', text: 'Outsource' })
      }
      if (/relocat|релокац/i.test(lower)) {
        if (!newNotes.find((n) => n.text.toLowerCase().includes('relocat')))
          newNotes.push({ type: 'condition', text: 'Open to relocation' })
      }
      if (/b2b/i.test(lower)) {
        if (!newNotes.find((n) => n.text.toLowerCase().includes('b2b')))
          newNotes.push({ type: 'exclude', text: 'B2B' })
      }

      const structuredFields = ['role', 'experience']
      const hasStructuredChange = structuredFields.some((f) => f in patch)
      const hasNotesChange = newNotes.length > profile.aiNotes.length

      if (hasStructuredChange || hasNotesChange) {
        setProfile((prev) => ({ ...prev, ...patch, aiNotes: newNotes }))
      }

      const changes = []
      if (patch.role) changes.push(`role → ${patch.role.join(', ')}`)
      if (patch.experience) changes.push(`experience → ${patch.experience}`)
      if (hasNotesChange) changes.push('+1 preference noted')

      if (changes.length > 0) return `Got it. Updated: ${changes.join(', ')}.`
      return `Noted. I'll keep that in mind.`
    },
    [profile]
  )

  const handleSyncNow = useCallback(async () => {
    const now = new Date()
    setLastSync(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }))
    return 'Sync complete. No new vacancies found.'
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

  const activeSources = 7

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

  // Автоматический скролл к первому непрочитанному или в самый низ
  useEffect(() => {
    if (activeView !== 'inbox') return

    const timer = setTimeout(() => {
      if (seenDividerRef.current) {
        seenDividerRef.current.scrollIntoView({ block: 'top', behavior: 'smooth' })
      } else if (scrollWrapperRef.current) {
        scrollWrapperRef.current.scrollTop = scrollWrapperRef.current.scrollHeight
      }
    }, 50)

    return () => clearTimeout(timer)
  }, [activeView, filteredVacancies.length])

  const renderContent = () => {
    if (activeView === 'profile') {
      return (
        <div className="scroll-wrapper">
          <div className="view-page">
            <Profile profile={profile} onUpdate={handleProfileUpdate} />
          </div>
        </div>
      )
    }

    if (activeView === 'settings') {
      return (
        <div className="scroll-wrapper">
          <div className="view-page">
            <Settings />
          </div>
        </div>
      )
    }

    const items =
      activeView === 'bookmarks'
        ? vacancies.filter((v) => isBookmarked(v))
        : activeView === 'inbox'
          ? sortedVacancies
          : []

    const isMainInbox = activeView === 'inbox'

    // Находим индекс первой НЕПРОЧИТАННОЙ вакансии для разделителя
    let unseenIdx = -1
    if (isMainInbox) {
      for (let i = 0; i < items.length; i++) {
        if (!seenIds.has(vacancyId(items[i]))) {
          unseenIdx = i
          break
        }
      }
    }

    const renderCardList = () => {
      if (isMainInbox) {
        let totalRendered = 0
        return orderedGroups.map((key) => {
          const group = grouped[key] || []

          if (group.length === 0) {
            if (key === 'today') {
              return (
                <div key={key} className="date-group">
                  <div className="date-head">{dateGroupLabels[key]}</div>
                  <div className="empty-today">No vacancies today — check back later.</div>
                </div>
              )
            }
            return null
          }

          const groupCards = group.map((v, gi) => {
            const globalIdx = totalRendered + gi
            const isFirstUnseen = unseenIdx >= 0 && globalIdx === unseenIdx
            totalRendered++

            return (
              <div key={vacancyId(v)}>
                {isFirstUnseen && (
                  <div ref={seenDividerRef} className="seen-divider">
                    <span>Unread</span>
                  </div>
                )}
                <JobCard vacancy={v} onClick={() => handleCardClick(v)} />
              </div>
            )
          })

          return (
            <div key={key} className="date-group">
              <div className="date-head">{dateGroupLabels[key]}</div>
              <div className="feed">{groupCards}</div>
            </div>
          )
        })
      }

      return (
        <div className="feed">
          {items.map((v) => (
            <JobCard key={vacancyId(v)} vacancy={v} onClick={() => handleCardClick(v)} />
          ))}
        </div>
      )
    }

    return (
      <>
        {isMainInbox && (
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

        <div className="scroll-wrapper" ref={scrollWrapperRef}>
          <div className="main-inner">
            {activeView === 'bookmarks' && (
              <div className="bookmarks-header">
                <div className="bookmarks-title">Bookmarks</div>
                <div className="bookmarks-count">{items.length} vacancies</div>
              </div>
            )}

            {items.length === 0 ? (
              activeView === 'inbox' ? (
                <div className="empty-state">
                  No vacancies yet.<br />Zhabka is watching your sources.
                </div>
              ) : (
                <div className="empty-state">Nothing saved yet.</div>
              )
            ) : (
              renderCardList()
            )}
          </div>
        </div>

        {isMainInbox && (
          <div className="chat-area">
            <ChatInput onSend={handleChatSend} onSync={handleSyncNow} profile={profile} />
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
          <div className="topbar">
            <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <span className="topbar-title">
              {activeView === 'inbox' ? 'Inbox' : activeView === 'bookmarks' ? 'Bookmarks' : activeView === 'profile' ? 'Profile' : 'Settings'}
            </span>
          </div>

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
    </div>
  )
}