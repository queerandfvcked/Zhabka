import { Inbox, Bookmark, User, Settings, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import './Sidebar.css'

const navItems = [
  { view: 'inbox', label: 'Inbox', icon: Inbox },
  { view: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
]

const bottomItems = [
  { view: 'profile', label: 'Profile', icon: User },
  { view: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({
  activeView,
  onViewChange,
  inboxCount,
  isMobileOpen,
  onMobileClose,
  activeSources,
  lastSync,
  onSync,
}) {
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    if (onSync) await onSync()
    setTimeout(() => setSyncing(false), 600)
  }

  const renderItem = (item) => {
    const Icon = item.icon
    return (
      <li
        key={item.view}
        className={`nav-item ${activeView === item.view ? 'active' : ''}`}
        onClick={() => {
          onViewChange(item.view)
          onMobileClose()
        }}
      >
        <Icon size={18} className="nav-icon" />
        <span>{item.label}</span>
        {item.view === 'inbox' && inboxCount > 0 && (
          <span className="count">{inboxCount}</span>
        )}
      </li>
    )
  }

  // Общий блок шапки (крестик рендерится только если showCloseBtn === true)
  const renderHeader = (showCloseBtn = false) => (
    <div className="sidebar-header">
      <div className="brand">
        <img src="/logo.svg" height="60" alt="Zhabka" style={{ flexShrink: 0 }} />
        Zhabka
      </div>
      {showCloseBtn && (
        <button className="close-btn" onClick={onMobileClose}>
          <X size={20} />
        </button>
      )}
    </div>
  )

  // Общий блок навигации и футера
  const renderNavigation = () => (
    <>
      <ul className="nav-list">{navItems.map(renderItem)}</ul>

      <hr className="divider" />

      <ul className="nav-list">{bottomItems.map(renderItem)}</ul>

      <div className="foot">
        <span
          className="foot-sources"
          onClick={() => { onViewChange('settings'); onMobileClose() }}
          title="Go to Settings"
        >
          {activeSources} sources
        </span>
        <span className="foot-sep">·</span>
        <span>Last sync {lastSync}</span>
        <button
          className={`foot-sync-btn ${syncing ? 'spinning' : ''}`}
          onClick={handleSync}
          title="Sync now"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Десктопный сайдбар (без крестика) */}
      <nav className="sidebar">
        {renderHeader(false)}
        {renderNavigation()}
      </nav>

      {/* Мобильный сайдбар (с крестиком) */}
      {isMobileOpen && (
        <div className="sidebar-mobile-overlay" onClick={onMobileClose}>
          <div className="sidebar-mobile" onClick={(e) => e.stopPropagation()}>
            {renderHeader(true)}
            {renderNavigation()}
          </div>
        </div>
      )}
    </>
  )
}