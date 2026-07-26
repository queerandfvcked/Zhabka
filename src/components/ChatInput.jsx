import { useState, useRef, useCallback } from 'react'
import { ArrowUp, Paperclip, Loader, RefreshCw } from 'lucide-react'
import { uploadResume } from '../api'
import './ChatInput.css'

export default function ChatInput({ onSend, onSync, setMessages }) {
  const [value, setValue] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [processing, setProcessing] = useState(false)
  const ref = useRef(null)
  const fileRef = useRef(null)

  const handleSend = async () => {
    const trimmed = value.trim()
    if (!trimmed) return

    setValue('')
    if (ref.current) ref.current.style.height = 'auto'
    await onSend(trimmed)
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
  }, [setMessages])

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

  return (
    <div
      className={`chat-wrapper ${dragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`chat-pill ${processing ? 'processing' : ''}`}>
        <button className="pill-icon-btn" onClick={handleAttach} title="Add CV (PDF)">
          {processing ? <Loader size={16} className="spin" /> : <Paperclip size={16} />}
        </button>
        <button className="pill-icon-btn" onClick={onSync} title="Sync now">
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