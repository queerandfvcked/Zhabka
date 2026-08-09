import { useState, useRef, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import './CustomTimePicker.css'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

export default function CustomTimePicker({ value, onChange, onRemove, canRemove }) {
  const [isOpen, setIsOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const containerRef = useRef(null)

  const [currentHour, currentMinute] = (value || '09:00').split(':')

  const close = useCallback(() => {
    if (!isOpen || closing) return
    setClosing(true)
    setTimeout(() => {
      setIsOpen(false)
      setClosing(false)
    }, 180)
  }, [isOpen, closing])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        close()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [close])

  const toggle = () => {
    if (isOpen) close()
    else setIsOpen(true)
  }

  const handleSelectHour = (h) => {
    onChange(`${h}:${currentMinute || '00'}`)
  }

  const handleSelectMinute = (m) => {
    onChange(`${currentHour || '09'}:${m}`)
  }

  return (
    <div className="time-picker-wrap" ref={containerRef}>
      {/* Кнопка-пилюля */}
      <div
        className={`time-picker-trigger ${isOpen ? 'open' : ''} ${canRemove ? 'has-remove' : ''}`}
        onClick={toggle}
      >
        <span className="time-picker-val">{value}</span>

        {canRemove && (
          <button
            type="button"
            className="time-picker-remove"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            title="Remove time"
          >
            <X size={13} />
          </button>
        )}

        {/* Нативный скрытый инпут для смартфонов (вызовет барабан) */}
        <input
          type="time"
          className="time-picker-mobile-native"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>

      {/* Выпадающее меню для десктопа */}
      {(isOpen || closing) && (
        <div className={`time-picker-menu ${closing ? 'closing' : ''}`}>
          <div className="time-picker-cols">
            {/* Часы */}
            <div className="time-picker-col">
              <div className="time-picker-col-title">HOURS</div>
              <div className="time-picker-list">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className={`time-picker-item ${h === currentHour ? 'selected' : ''}`}
                    onClick={() => handleSelectHour(h)}
                  >
                    {h}
                  </div>
                ))}
              </div>
            </div>

            <div className="time-picker-divider" />

            {/* Минуты */}
            <div className="time-picker-col">
              <div className="time-picker-col-title">MINS</div>
              <div className="time-picker-list">
                {MINUTES.map((m) => (
                  <div
                    key={m}
                    className={`time-picker-item ${m === currentMinute ? 'selected' : ''}`}
                    onClick={() => handleSelectMinute(m)}
                  >
                    {m}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}