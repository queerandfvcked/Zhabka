import { useState, useRef, useCallback } from 'react'
import { ArrowUp, Paperclip, Loader, RefreshCw } from 'lucide-react'
import { uploadResume } from '../api'
import './ChatInput.css'

export default function ChatInput({ onSend, onSync, profile }) {
  const [value, setValue] = useState('')
  const [messages, setMessages] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [processing, setProcessing] = useState(false)
  const ref = useRef(null)
  const fileRef = useRef(null)

  const handleSend = async () => {
    const trimmed = value.trim()
    if (!trimmed) return

    const userMsg = { type: 'user', text: trimmed }
    const response = await onSend(trimmed)
    const aiMsg = { type: 'ai', text: response }

    setMessages((prev) => [...prev, userMsg, aiMsg])
    setValue('')
    if (ref.current) ref.current.style.height = 'auto'
  }

  const handleSync = async () => {
    const response = await onSync()
    setMessages((prev) => [...prev, { type: 'ai', text: response }])
  }

  const handleAttach = () => {
    fileRef.current?.click()
  }

  const handleFile = useCallback(async (file) => {
    if (!file || file.type !== 'application/pdf') return
    setProcessing(true)
    try {
      const result = await uploadResume(file)
      setMessages((prev) => [
        ...prev,
        { type: 'user', text: `Uploaded CV: ${file.name}` },
        { type: 'ai', text: `Got it. Resume "${result.filename}" saved. I'll use it to improve matching.` },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        { type: 'ai', text: 'Failed to upload resume — is the backend running?' },
      ])
    } finally {
      setProcessing(false)
    }
  }, [])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    handleFile(file)
    e.target.value = ''
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  const FrogIcon = () => (
    <svg width="16" height="12" viewBox="0 0 34 20" style={{ flexShrink: 0 }}>
      <circle cx="9" cy="10" r="9" fill="var(--accent-soft)" />
      <circle cx="25" cy="10" r="9" fill="var(--accent-soft)" />
      <circle cx="9" cy="10" r="3.5" fill="var(--accent)" />
      <circle cx="25" cy="10" r="3.5" fill="var(--accent)" />
    </svg>
  )

  return (
    <div
      className={`chat-wrapper ${dragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Messages */}
      {messages.length > 0 && (
        <div className="messages">
          {messages.map((msg, i) => {
            if (msg.type === 'user') {
              return (
                <div key={i} className="msg-user">
                  {msg.text}
                </div>
              )
            }
            if (msg.type === 'ai') {
              return (
                <div key={i} className="msg-ai">
                  <div className="msg-ai-icon">
                    <FrogIcon />
                  </div>
                  <div className="msg-ai-text">{msg.text}</div>
                </div>
              )
            }
            if (msg.type === 'card') {
              return (
                <div key={i} className="msg-card" />
              )
            }
            return null
          })}
        </div>
      )}

      {/* Unified pill input */}
      <div className={`chat-pill ${processing ? 'processing' : ''}`}>
        <button className="pill-icon-btn" onClick={handleAttach} title="Add CV (PDF)">
          {processing ? <Loader size={16} className="spin" /> : <Paperclip size={16} />}
        </button>
        <button className="pill-icon-btn" onClick={handleSync} title="Sync now">
          <RefreshCw size={16} />
        </button>
        <textarea
          ref={ref}
          className="pill-input"
          placeholder="Ask AI…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          rows={1}
        />
        <button className="pill-send" onClick={handleSend} disabled={!value.trim()}>
          <ArrowUp size={18} />
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        className="file-input-hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
