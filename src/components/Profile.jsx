import { FileText } from 'lucide-react'
import CustomSelect from './CustomSelect'
import '../shared/Toggle.css'
import './Profile.css'

const workFormatKeys = ['remote', 'hybrid', 'office', 'relocate']
const locations = ['Warsaw', 'Berlin', 'Saint Petersburg', 'Tbilisi', 'London']
const currencyOptions = ['\u20BD', '$', '\u20AC']
const experienceOptions = ['0 years', '0\u20132 years', '1\u20133 years', '3+ years']

function completenessInfo(profile) {
  const checks = [
    !!profile.role,
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

  const toggleWF = (key) =>
    onUpdate({ workFormat: { ...profile.workFormat, [key]: !profile.workFormat[key] } })

  const toggleOfficeLocation = (loc) => {
    const next = profile.officeLocations.includes(loc)
      ? profile.officeLocations.filter((l) => l !== loc)
      : [...profile.officeLocations, loc]
    onUpdate({ officeLocations: next })
  }

  const activeCurrencyIdx = currencyOptions.indexOf(profile.salaryCurrency)

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

      {/* Role — text input + pills */}
      <div className="section">
        <div className="section-head">Role</div>
        <input
          className="custom-input"
          type="text"
          placeholder="e.g. Product Designer"
          value={profile.role}
          onChange={(e) => onUpdate({ role: e.target.value })}
        />

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
              <label key={key} className={`checkbox-label ${checked ? 'checked' : ''}`} onClick={() => toggleWF(key)}>
                <input type="checkbox" checked={checked} readOnly />
                {label}
              </label>
            )
          })}
        </div>

        {profile.workFormat.office && (
          <div className="office-locations">
            <div className="section-head" style={{ marginTop: 12, marginBottom: 8 }}>
              Preferred city
            </div>
            <div className="checkbox-group">
              {locations.map((loc) => {
                const checked = profile.officeLocations.includes(loc)
                return (
                  <label key={loc} className={`checkbox-label ${checked ? 'checked' : ''}`} onClick={() => toggleOfficeLocation(loc)}>
                    <input type="checkbox" checked={checked} readOnly />
                    {loc}
                  </label>
                )
              })}
            </div>
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
            <div className="currency-thumb" style={{ transform: `translateX(${Math.max(0, activeCurrencyIdx) * 100}%)` }} />
            {currencyOptions.map((c, i) => (
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
