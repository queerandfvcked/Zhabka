import { useState } from 'react'
import { X, Bookmark, ExternalLink, Check, AlertTriangle, X as XIcon, ChevronDown, ChevronUp } from 'lucide-react'
import './RightDrawer.css'

const reasonIcon = (type) => {
  if (type === 'good') return Check
  if (type === 'bad') return XIcon
  return AlertTriangle
}

const reasonClass = (type) => {
  if (type === 'good') return 'reason-good'
  if (type === 'bad') return 'reason-bad'
  return 'reason-warn'
}

export default function RightDrawer({ vacancy, onClose, isBookmarked, onToggleBookmark }) {
  const [showFull, setShowFull] = useState(false)
  const v = vacancy
  const ai = v.aiVerdict

  const hasDetails =
    v.salary || v.experience?.value || v.workFormat || v.location

  const excerpt = v.sourceExcerpt || v.original_text
  const hasFull = v.sourceExcerpt && v.sourceExcerpt !== v.original_text

  return (
    <div className="drawer">
        <div className="drawer-header">
          <div className="drawer-header-left">
            <div>
              {v.company && (
                <div className="drawer-company">{v.company}</div>
              )}
              <div className="drawer-job-title">{v.title || 'Vacancy'}</div>
            </div>
          </div>
          <div className="drawer-actions">
            <button className="drawer-icon-btn" onClick={onToggleBookmark}>
              <Bookmark size={18} fill={isBookmarked ? 'var(--accent)' : 'none'} />
            </button>
            <button className="drawer-icon-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="drawer-body">
          <div className="drawer-handle" />

          {ai && ai.reasons && (
            <div className="drawer-reasons">
              {ai.reasons.map((r, i) => {
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

          {hasDetails && (
            <>
              {v.salary && (
                <div className="field">
                  <div className="field-label">Salary</div>
                  <div className="field-value mono">{v.salary}</div>
                </div>
              )}

              {v.experience?.value && (
                <div className="field">
                  <div className="field-label">Experience</div>
                  <div className="field-value">
                    {v.experience.value}
                    {v.experience.strict === true && ' \u00B7 required'}
                    {v.experience.strict === false && ' \u00B7 not strict'}
                  </div>
                </div>
              )}

              {v.workFormat && (
                <div className="field">
                  <div className="field-label">Work format</div>
                  <div className="field-value">{v.workFormat}</div>
                </div>
              )}

              {v.location && (
                <div className="field">
                  <div className="field-label">Location</div>
                  <div className="field-value">{v.location}</div>
                </div>
              )}
            </>
          )}

          {v.requirements?.length > 0 && (
            <div className="field">
              <div className="field-label">Requirements</div>
              <div className="list-value">
                {v.requirements.map((req, i) => (
                  <div key={i} className="list-item">
                    <span className="list-bullet">\u2022</span>
                    <span>{req}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <hr className="divider" />

          <div className="field-label" style={{ marginBottom: 8 }}>Original post</div>
          <div className="original-block">
            {showFull || !hasFull ? v.original_text : excerpt}
          </div>

          {hasFull && (
            <button className="show-full-toggle" onClick={() => setShowFull(!showFull)}>
              {showFull ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showFull ? 'Show excerpt' : 'Show full post'}
            </button>
          )}

          <a
            className="source-link"
            href={v.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={14} />
            Open source
          </a>
        </div>
      </div>
  )
}
