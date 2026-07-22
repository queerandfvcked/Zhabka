import { useState } from 'react'
import { FileText, X } from 'lucide-react'
import CustomSelect from './CustomSelect'
import '../shared/Toggle.css'
import './Profile.css'

const workFormatKeys = ['remote', 'hybrid', 'office', 'relocate']

const currencyOptions = ['\u20BD', '$', '\u20AC']
const experienceOptions = ['Any experience', 'No experience', '0\u20131 years', '1\u20133 years', '3+ years']
const roleSuggestions = ['Product Designer', 'UX/UI Designer', 'Product + UX/UI']

function completenessInfo(profile) {
  const checks = [
    profile.role.length > 0,
    !!profile.experience,
    Object.values(profile.workFormat).some(Boolean),
    profile.minSalary !== null,
    !!profile.resume.filename,
  ]
  return { filled: checks.filter(Boolean).length, total: checks.length }
}

const noteColors = { exclude: 'bad', include: 'good', condition: 'warn' }

export default function Profile({ profile, onUpdate }) {
  const { filled, total } = completenessInfo(profile)
  const [roleInput, setRoleInput] = useState('')

  const toggleWF = (key) =>
    onUpdate({ workFormat: { ...profile.workFormat, [key]: !profile.workFormat[key] } })

  const activeCurrencyIdx = currencyOptions.indexOf(profile.salaryCurrency)

  const addRole = (role) => {
    const trimmed = role.trim()
    if (!trimmed || profile.role.includes(trimmed)) return
    onUpdate({ role: [...profile.role, trimmed] })
    setRoleInput('')
  }

  const removeRole = (role) =>
    onUpdate({ role: profile.role.filter((r) => r !== role) })

  return (
    <div className="profile">
      <div className="profile-title">Profile</div>
      <div className="profile-subtitle">
        Profile completeness: {filled} of {total} fields &mdash; more detail improves matching
      </div>

      {/* Resume */}
      <div className="section">
        <div className="section-head">Resume</div>
        <div className="resume-area">
          {profile.resume.filename ? (
            <>
              <div className="resume-name">
                <FileText size={16} />
                <span>{profile.resume.filename}</span>
              </div>
              <button className="resume-replace">Replace</button>
            </>
          ) : (
            <div className="resume-empty">
              <FileText size={16} />
              <span>No resume uploaded</span>
            </div>
          )}
        </div>
      </div>

      {/* AI Notes — read-only typed */}
      {profile.aiNotes.length > 0 && (
        <div className="section">
          <div className="section-head">AI understands</div>
          <div className="ai-notes">
            {profile.aiNotes.map((note, i) => (
              <div key={i} className="ai-note-item">
                <span className={`ai-note-dot ${noteColors[note.type] || 'warn'}`} />
                <span>{note.text}</span>
              </div>
            ))}
          </div>
          <div className="ai-notes-hint">To change, write in chat</div>
        </div>
      )}

      {/* Role — chip input */}
      <div className="section">
        <div className="section-head">Role</div>
        <div className="role-chips-input">
          {profile.role.map((r) => (
            <span key={r} className="role-chip">
              {r}
              <button type="button" onClick={() => removeRole(r)} aria-label={`Remove ${r}`}>
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            className="role-chip-input"
            type="text"
            placeholder={profile.role.length ? 'Add another…' : 'e.g. Product Designer'}
            value={roleInput}
            onChange={(e) => setRoleInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRole(roleInput) } }}
          />
        </div>
        <div className="role-suggestions">
          {roleSuggestions.filter((r) => !profile.role.includes(r)).map((r) => (
            <button key={r} type="button" className="role-pill" onClick={() => addRole(r)}>
              + {r}
            </button>
          ))}
        </div>
      </div>

      {/* Experience */}
      <div className="section">
        <div className="section-head">Experience</div>
        <CustomSelect
          value={profile.experience}
          onChange={(val) => onUpdate({ experience: val })}
          options={experienceOptions}
        />
      </div>

      {/* Work format */}
      <div className="section">
        <div className="section-head">Work format</div>
        <div className="checkbox-group">
          {workFormatKeys.map((key) => {
            const checked = profile.workFormat[key]
            const label = key.charAt(0).toUpperCase() + key.slice(1)
            return (
              <button
                type="button"
                key={key}
                className={`checkbox-label ${checked ? 'checked' : ''}`}
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggleWF(key)}
              >
                {label}
              </button>
            )
          })}
        </div>

        {(profile.workFormat.office || profile.workFormat.hybrid) && (
          <div className="office-locations">
            <div className="section-head" style={{ marginTop: 24, marginBottom: 12 }}>
              Preferred city
            </div>
            <input
              className="custom-input"
              type="text"
              placeholder="e.g. Warsaw"
              value={profile.officeLocations.join(', ')}
              onChange={(e) =>
                onUpdate({
                  officeLocations: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        )}
      </div>

      {/* Salary */}
      <div className="section">
        <div className="section-head">Salary</div>
        <div className="salary-row">
          <input
            className="custom-input"
            type="text"
            placeholder="Minimum"
            value={profile.minSalary ?? ''}
            onChange={(e) => onUpdate({ minSalary: e.target.value ? e.target.value : null })}
          />
          <div className="currency-selector">
            <div
              className="currency-thumb"
              style={{ transform: `translateX(${Math.max(0, activeCurrencyIdx) * 40}px)` }}
            />
            {currencyOptions.map((c) => (
              <button
                key={c}
                className={`currency-opt ${profile.salaryCurrency === c ? 'active' : ''}`}
                onClick={() => onUpdate({ salaryCurrency: c })}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="salary-toggle-row">
          <div className={`toggle ${profile.hideWithoutSalary ? 'on' : ''}`} onClick={() => onUpdate({ hideWithoutSalary: !profile.hideWithoutSalary })}>
            <div className="toggle-knob" />
          </div>
          <span className="salary-toggle-label">Hide vacancies without listed salary</span>
        </div>
      </div>
    </div>
  )
}