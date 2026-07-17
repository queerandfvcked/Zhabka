import { useState, useRef, useEffect } from 'react'
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
  const wrapRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen((o) => !o)
    }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="custom-select-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`custom-select-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
      >
        <span>{value || placeholder}</span>
        <ChevronDown size={16} className="custom-select-chevron" />
      </button>

      {open && (
        <div className="custom-select-menu">
          {options.map((opt) => (
            <div
              key={opt}
              className={`custom-select-option ${opt === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt)
                setOpen(false)
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
