import { useState } from 'react'
import { X, Bookmark, ExternalLink, Check, AlertTriangle, X as XIcon, ChevronDown, ChevronUp } from 'lucide-react'
import { renderTelegramMarkdown } from '../utils/markdownRender'
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
  const [closing, setClosing] = useState(false)
  const v = vacancy
  const ai = v.aiVerdict

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => onClose(), 250) // Время совпадает с длительностью анимации slideOut
  }

  const hasDetails =
    v.salary || v.experience?.value || v.workFormat || v.location

  const excerpt = v.sourceExcerpt || v.original_text
  const hasFull = v.sourceExcerpt && v.sourceExcerpt !== v.original_text

  return (
    <>
      {/* Затемняющий фон под панелью (на десктопе скрыт через CSS, на мобилке плавно проявляется) */}
      <div className={`drawer-overlay ${closing ? 'closing' : ''}`} onClick={handleClose} />

      <div className={`drawer ${closing ? 'closing' : ''}`}>
        {/* Шапка */}
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
            <button className="drawer-icon-btn" onClick={onToggleBookmark} type="button">
              <Bookmark size={18} fill={isBookmarked ? 'var(--accent)' : 'none'} />
            </button>
            <button className="drawer-icon-btn" onClick={handleClose} type="button">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Тело */}
        <div className="drawer-body" key={`${v.id || ''}${v.link || ''}`}>
          {/* Хэндл виден только на мобилке */}
          <div className="drawer-handle" />

          {/* Вердикт AI */}
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

          {/* Сетка параметров вакансии */}
          {hasDetails && (
            <div className="details-grid">
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
            </div>
          )}

          {/* Требования */}
          {v.requirements?.length > 0 && (
            <div className="field">
              <div className="field-label">Requirements</div>
              <div className="list-value">
                {v.requirements.map((req, i) => (
                  <div key={i} className="list-item">
                    <span className="list-bullet">●</span>
                    <span>{req}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Оригинальный пост */}
          <div className="original-section">
            <div className="field-label">Original post</div>
            <div
              className="original-block"
              dangerouslySetInnerHTML={{
                __html: renderTelegramMarkdown(showFull || !hasFull ? v.original_text : excerpt),
              }}
            />

            {hasFull && (
              <button className="show-full-toggle" onClick={() => setShowFull(!showFull)} type="button">
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
      </div>
    </>
  )
}