import { useState, useMemo, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import CustomSelect from './CustomSelect'
import CustomTimePicker from './CustomTimePicker'
import { getSources, getProfile, saveProfile, getAiConfig, saveAiConfig, getSourcesConfig, saveSourcesConfig } from '../api'
import '../shared/Toggle.css'
import './Settings.css'

export default function Settings({ onToast }) {
  const [provider, setProvider] = useState('OpenRouter')
  const [apiKey, setApiKey] = useState('')
  const [sourceSearch, setSourceSearch] = useState('')
  const [newSource, setNewSource] = useState('')

  const [sources, setSources] = useState([])

  // Стейты авто-синхронизации
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [syncTimes, setSyncTimes] = useState(['09:00', '18:00'])

  const normalizeSource = (s) =>
    typeof s === 'string'
      ? { username: s.replace(/^@/, '').trim(), title: s.trim() }
      : { username: (s.username || '').replace(/^@/, '').trim(), title: s.title || s.username }

  useEffect(() => {
    Promise.all([getSources(), getProfile(), getSourcesConfig(), getAiConfig()]).then(([srcList, prof, srcCfg, ai]) => {
      const disabled = new Set(srcCfg?.disabledSources || [])
      const manual = (srcCfg?.manualSources || []).map(normalizeSource).filter((s) => s.username)
      const manualByUsername = new Set(manual.map((s) => s.username))

      const folder = srcList.map((s) => ({
        ...s,
        enabled: !disabled.has(s.username),
        isManual: manualByUsername.has(s.username),
      }))
      const manualOnly = manual
        .filter((s) => !srcList.some((x) => x.username === s.username))
        .map((s) => ({ ...s, enabled: !disabled.has(s.username), isManual: true, count: 0 }))

      setSources([...folder, ...manualOnly])

      if (prof?.autoSync !== undefined) setAutoSyncEnabled(prof.autoSync)
      if (prof?.syncTimes) setSyncTimes(prof.syncTimes)
      if (ai?.provider) setProvider(ai.provider)
      if (ai?.apiKey) setApiKey(ai.apiKey)
    })
  }, [])

  const toggleSource = async (username) => {
    const next = sources.map((s) =>
      s.username === username ? { ...s, enabled: !s.enabled } : s
    )
    setSources(next)
    const disabled = next.filter((s) => !s.enabled).map((s) => s.username)
    const cfg = await getSourcesConfig()
    await saveSourcesConfig({ ...(cfg || {}), disabledSources: disabled })
  }

  const handleToggleAutoSync = async () => {
    const nextState = !autoSyncEnabled
    setAutoSyncEnabled(nextState)
    const prof = await getProfile()
    await saveProfile({ ...(prof || {}), autoSync: nextState, syncTimes })
  }

  const handleTimeChange = async (index, newTime) => {
    const nextTimes = [...syncTimes]
    nextTimes[index] = newTime
    setSyncTimes(nextTimes)
    const prof = await getProfile()
    await saveProfile({ ...(prof || {}), syncTimes: nextTimes })
  }

  const handleAddTime = async () => {
    const nextTimes = [...syncTimes, '12:00']
    setSyncTimes(nextTimes)
    const prof = await getProfile()
    await saveProfile({ ...(prof || {}), syncTimes: nextTimes })
  }

  const handleRemoveTime = async (index) => {
    const nextTimes = syncTimes.filter((_, i) => i !== index)
    setSyncTimes(nextTimes)
    const prof = await getProfile()
    await saveProfile({ ...(prof || {}), syncTimes: nextTimes })
  }

  const handleProviderChange = async (val) => {
    setProvider(val)
    await saveAiConfig({ provider: val, apiKey })
    if (onToast) onToast()
  }

  const handleApiKeyBlur = async (e) => {
    const val = e.target.value.trim()
    setApiKey(val)
    await saveAiConfig({ provider, apiKey: val })
    if (onToast) onToast()
  }

  const handleAddSource = async () => {
    const val = newSource.trim()
    if (!val) return
    const username = val.replace(/^@/, '').replace(/https?:\/\/t\.me\//, '').split('/')[0].trim()
    if (!username || sources.find((s) => s.username === username)) {
      setNewSource('')
      return
    }
    const cfg = await getSourcesConfig()
    const manual = (cfg?.manualSources || []).map(normalizeSource)
    if (!manual.some((s) => s.username === username)) {
      const newManual = [...manual, { username, title: username }]
      await saveSourcesConfig({ ...(cfg || {}), manualSources: newManual })
      setSources((prev) => [
        ...prev,
        { username, title: username, enabled: true, isManual: true, count: 0 },
      ])
    }
    setNewSource('')
  }

  const handleRemoveSource = async (username) => {
    setSources((prev) => prev.filter((s) => s.username !== username))
    const cfg = await getSourcesConfig()
    const manual = (cfg?.manualSources || []).filter(
      (s) => normalizeSource(s).username !== username
    )
    const disabled = (cfg?.disabledSources || []).filter((u) => u !== username)
    await saveSourcesConfig({ ...(cfg || {}), manualSources: manual, disabledSources: disabled })
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

      {/* 1. AI Provider */}
      <div className="settings-card">
        <div className="section-head">AI</div>
        <div className="field-group">
          <div className="field-label">Provider</div>
          <CustomSelect
            value={provider}
            onChange={handleProviderChange}
            options={['Gemini', 'OpenRouter', 'OpenAI', 'Anthropic']}
          />
        </div>
        <div className="field-group" style={{ marginTop: 16 }}>
          <div className="field-label">API Key</div>
          <input
            className="custom-input"
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={handleApiKeyBlur}
          />
        </div>
      </div>

      {/* 2. Sources */}
      <div className="settings-card">
        <div className="section-head">
          Sources <span className="source-count-badge">{sourceCount}</span>
        </div>

        <div className="add-source-row">
          <input
            className="add-source-input"
            type="text"
            placeholder="@username or Telegram folder link"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="add-source-btn"
            onClick={handleAddSource}
            disabled={!newSource.trim()}
          >
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
              <div
                key={s.username}
                className={`source-item ${!s.enabled ? 'disabled' : ''}`}
                onClick={() => toggleSource(s.username)}
              >
                <div className={`toggle ${s.enabled ? 'on' : ''}`}>
                  <div className="toggle-knob" />
                </div>
                <span className="source-name">@{s.username}</span>
                <span className="source-count">{s.count}</span>
                {s.isManual && (
                  <button
                    className="source-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveSource(s.username)
                    }}
                    title="Remove manual source"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Auto Synchronization (теперь в самом конце) */}
      <div className="settings-card">
        <div className="sync-header">
          <div className="section-head" style={{ marginBottom: 0 }}>
            Auto Synchronization
          </div>
          <div
            className={`toggle ${autoSyncEnabled ? 'on' : ''}`}
            onClick={handleToggleAutoSync}
            style={{ cursor: 'pointer' }}
          >
            <div className="toggle-knob" />
          </div>
        </div>

        {autoSyncEnabled && (
          <div className="sync-slots-container">
            {syncTimes.map((time, idx) => (
              <CustomTimePicker
                key={idx}
                value={time}
                onChange={(newTime) => handleTimeChange(idx, newTime)}
                onRemove={() => handleRemoveTime(idx)}
                canRemove={syncTimes.length > 1}
              />
            ))}

            <button className="add-time-btn" onClick={handleAddTime}>
              <Plus size={14} /> Add time
            </button>
          </div>
        )}
      </div>
    </div>
  )
}