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

export default function JobCard({ vacancy, onClick }) {
  const v = vacancy

  return (
    <div className="card" onClick={onClick}>
      <div className="card-meta">
        <span className="card-channel">@{v.channel_username}</span>
        <span className="card-time">{timeAgo(v.date)}</span>
      </div>

      {v.title && <div className="card-title">{v.title}</div>}

      {v.experience?.value && (
        <div className="card-experience">
          <span>{v.experience.value}</span>
          {v.experience.strict === true && (
            <span className="exp-badge exp-required">required</span>
          )}
          {v.experience.strict === false && (
            <span className="exp-badge exp-not-strict">not strict</span>
          )}
        </div>
      )}

      {v.requirements?.length > 0 && (
        <>
          <hr className="card-divider" />
          <div className="card-reqs">
            {v.requirements.map((req, i) => (
              <div key={i} className="card-req">
                <span className="card-req-bullet">•</span>
                <span>{req}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {v.aiVerdict?.reasons?.length > 0 && (
        <>
          {(v.requirements?.length > 0) && <hr className="card-divider" />}
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
        </>
      )}

      <div className="card-bottom">
        {v.company && <span className="bottom-company">{v.company}</span>}
        {v.salary && <span className="card-tag">{v.salary}</span>}
        {v.workFormat && <span className="card-tag">{v.workFormat}</span>}
        {v.location && <span className="card-tag">{v.location}</span>}
      </div>
    </div>
  )
}
