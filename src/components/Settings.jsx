import { useState, useMemo, useEffect } from 'react'
import { Plus } from 'lucide-react'
import CustomSelect from './CustomSelect'
import { getSources, getProfile, saveProfile } from '../api'
import '../shared/Toggle.css'
import './Settings.css'

export default function Settings() {
  const [provider, setProvider] = useState('OpenRouter')
  const [apiKey, setApiKey] = useState('')
  const [sourceSearch, setSourceSearch] = useState('')
  const [newSource, setNewSource] = useState('')

  const [sources, setSources] = useState([])

  useEffect(() => {
    Promise.all([getSources(), getProfile()]).then(([srcList, prof]) => {
      const disabled = new Set(prof?.disabledSources || [])
      setSources(srcList.map((s) => ({ ...s, enabled: !disabled.has(s.username) })))
    })
  }, [])

  const toggleSource = async (username) => {
    const next = sources.map((s) =>
      s.username === username ? { ...s, enabled: !s.enabled } : s
    )
    setSources(next)
    const disabled = next.filter((s) => !s.enabled).map((s) => s.username)
    const prof = await getProfile()
    await saveProfile({ ...(prof || {}), disabledSources: disabled })
  }

  const handleAddSource = () => {
    const val = newSource.trim()
    if (!val) return
    const username = val.replace(/^@/, '').replace(/https?:\/\/t\.me\//, '').split('/')[0]
    if (username && !sources.find((s) => s.username === username)) {
      setSources((prev) => [
        ...prev,
        { username, title: username, enabled: true, count: 0 },
      ])
    }
    setNewSource('')
  }

  const filteredSources = useMemo(
    () =>
      sources.filter(
        (s) =>
          s.username.toLowerCase().includes(sourceSearch.toLowerCase()) ||
          s.title.toLowerCase().includes(sourceSearch.toLowerCase())
      ),
    [sources, sourceSearch]
  )

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAddSource()
  }

  const sourceCount = sources.length

  return (
    <div>
      <div className="settings-title">Settings</div>
      <div className="settings-subtitle">App config &amp; sources</div>

      {/* AI Provider */}
      <div className="settings-card">
        <div className="section-head">AI</div>
        <div className="field-group">
          <div className="field-label">Provider</div>
          <CustomSelect
            value={provider}
            onChange={setProvider}
            options={['OpenRouter', 'OpenAI', 'Anthropic']}
          />
        </div>
        <div className="field-group" style={{ marginTop: 16 }}>
          <div className="field-label">API Key</div>
          <input className="custom-input" type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>
      </div>

      {/* Sources */}
      <div className="settings-card">
        <div className="section-head">Sources <span className="source-count-badge">{sourceCount}</span></div>

        <div className="add-source-row">
          <input
            className="add-source-input"
            type="text"
            placeholder="@username or Telegram folder link"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="add-source-btn" onClick={handleAddSource} disabled={!newSource.trim()}>
            <Plus size={18} />
            <span>Add</span>
          </button>
        </div>

        <input
          className="source-search"
          type="text"
          placeholder="Search sources…"
          value={sourceSearch}
          onChange={(e) => setSourceSearch(e.target.value)}
        />

        <div className="source-list">
          {filteredSources.length === 0 && sourceSearch.trim() ? (
            <div className="source-empty">No sources match your search.</div>
          ) : (
            filteredSources.map((s) => (
              <div key={s.username} className={`source-item ${!s.enabled ? 'disabled' : ''}`} onClick={() => toggleSource(s.username)}>
                <div className={`toggle ${s.enabled ? 'on' : ''}`}>
                  <div className="toggle-knob" />
                </div>
                <span className="source-name">@{s.username}</span>
                <span className="source-count">{s.count}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
