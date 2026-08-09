import { Check, AlertTriangle, X } from 'lucide-react'
import { timeAgo } from '../utils/ai'
import './JobCard.css'

const reasonIcon = (type) => {
  if (type === 'good') return Check
  if (type === 'bad') return X
  return AlertTriangle
}

const reasonClass = (type) => {
  if (type === 'good') return 'reason-good'
  if (type === 'bad') return 'reason-bad'
  return 'reason-warn'
}

function highlightText(text, query) {
  if (!query || !text) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="search-highlight">{part}</mark>
      : part
  )
}

function hl(value, query) {
  if (!query) return value
  return highlightText(value, query)
}

export default function JobCard({ vacancy, onClick, searchQuery, style }) {
  const v = vacancy;
  const q = searchQuery?.trim()

  return (
    <div className="card" onClick={onClick} style={style}>
      {/* Шапка */}
      <div className="card-meta">
        <span className="card-channel">@{hl(v.channel_username, q)}</span>
        <span className="card-time">{timeAgo(v.date)}</span>
      </div>

      {/* Контентная часть — заменили инлайн стили на класс */}
      <div className="card-header-group">
        {v.title && <div className="card-title">{hl(v.title, q)}</div>}

        {v.experience?.value && (
          <div className="card-experience">
            <span>{hl(v.experience.value, q)}</span>
            {v.experience.strict === true && (
              <span className="exp-badge exp-required">required</span>
            )}
            {v.experience.strict === false && (
              <span className="exp-badge exp-not-strict">not strict</span>
            )}
          </div>
        )}
      </div>

      {/* Требования */}
      {v.requirements?.length > 0 && (
        <div className="card-reqs">
          {v.requirements.map((req, i) => (
            <div key={i} className="card-req">
              <span className="card-req-bullet">●</span>
              <span>{hl(req, q)}</span>
            </div>
          ))}
        </div>
      )}

      {/* AI Вердикт (в симпатичном мягком блоке) */}
      {v.aiVerdict?.reasons?.length > 0 && (
        <div className="reasons-section">
          {v.aiVerdict.reasons.map((r, i) => {
            const Icon = reasonIcon(r.type)
            return (
              <div key={i} className={`reason-row ${reasonClass(r.type)}`}>
                <Icon size={13} className="reason-icon" />
                <span>{r.text}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Подвал */}
      <div className="card-bottom">
        {v.company && <span className="bottom-company">{hl(v.company, q)}</span>}
        {v.salary && <span className="card-tag">{v.salary}</span>}
        {v.workFormat && <span className="card-tag">{hl(v.workFormat, q)}</span>}
        {v.location && <span className="card-tag">{hl(v.location, q)}</span>}
      </div>
    </div>
  )
}