import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import './CustomSelect.css'

/**
 * Кастомный select — полностью заменяет нативный <select>/<option>,
 * которые рендерятся системным (не стилизуемым) UI операционной системы.
 * Используй везде, где раньше был <select> (Profile → Experience,
 * Settings → Provider), чтобы визуально не расходились.
 */
export default function CustomSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const wrapRef = useRef(null)

  const close = useCallback(() => {
    if (!open || closing) return
    setClosing(true)
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, 200)
  }, [open, closing])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [close])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (open) close()
      else setOpen(true)
    }
    if (e.key === 'Escape') close()
  }

  return (
    <div className="custom-select-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`custom-select-trigger ${open ? 'open' : ''}`}
        onClick={() => {
          if (open) close()
          else setOpen(true)
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{value || placeholder}</span>
        <ChevronDown size={14} className="custom-select-chevron" />
      </button>

      {(open || closing) && (
        <div className={`custom-select-menu ${closing ? 'closing' : ''}`}>
          {options.map((opt) => (
            <div
              key={opt}
              className={`custom-select-option ${opt === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt)
                close()
              }}
            >
              <span>{opt}</span>
              {opt === value && <Check size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
