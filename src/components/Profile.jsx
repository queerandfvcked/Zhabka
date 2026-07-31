import { useState, useRef } from 'react'
import { FileText, X } from 'lucide-react'
import CustomSelect from './CustomSelect'
import { uploadResume, API_BASE } from '../api'
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
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const handleResumeClick = () => fileRef.current?.click()

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || file.type !== 'application/pdf') return
    setUploading(true)
    try {
      const result = await uploadResume(file)
      onUpdate({
        resume: {
          filename: result.filename,
          uploadedAt: new Date().toISOString(),
          url: result.url || '/uploads/resume.pdf',
        },
      })
    } catch {
      setUploading(false)
      return
    }
    setUploading(false)
  }

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
        <div className={`resume-area ${uploading ? 'uploading' : ''}`}>
          {profile.resume.filename ? (
            <>
              <div className="resume-name">
                <FileText size={16} />
                {/* Делаем название кликабельным */}
                <a
                  href={`${API_BASE}${profile.resume.url || '/uploads/resume.pdf'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="resume-filename-link"
                  title="Open resume in new tab"
                >
                  {uploading ? 'Uploading…' : profile.resume.filename}
                </a>
              </div>

              <div className="resume-actions">
                <button
                  type="button"
                  className="resume-replace"
                  onClick={handleResumeClick}
                  disabled={uploading}
                >
                  Replace
                </button>

                <button
                  type="button"
                  className="resume-delete"
                  onClick={() => onUpdate({ resume: { filename: null, uploadedAt: null, url: null } })}
                  title="Remove resume"
                  disabled={uploading}
                >
                  <X size={14} />
                </button>
              </div>
            </>
          ) : (
            <div
              className="resume-empty"
              onClick={!uploading ? handleResumeClick : undefined}
              role="button"
              tabIndex={0}
            >
              <FileText size={16} />
              <span>{uploading ? 'Uploading…' : 'Upload resume (PDF)'}</span>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          className="file-input-hidden"
          onChange={handleResumeUpload}
        />
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