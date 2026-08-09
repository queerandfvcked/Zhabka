import { useState, useRef, useEffect, useCallback } from 'react'
import { Calendar, X } from 'lucide-react'
import MiniCalendar from './MiniCalendar'
import './JumpToDatePopover.css'

export default function JumpToDatePopover({ selectedDate, onDateSelect, availableDates }) {
  const [isOpen, setIsOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const popoverRef = useRef(null)

  const close = useCallback(() => {
    if (!isOpen || closing) return
    setClosing(true)
    setTimeout(() => {
      setIsOpen(false)
      setClosing(false)
    }, 150)
  }, [isOpen, closing])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
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

  return (
    <div className="jump-to-date-wrapper" ref={popoverRef}>
      <button
        type="button"
        className={`calendar-trigger-btn ${isOpen ? 'active' : ''}`}
        onClick={toggle}
        title="Jump to date"
      >
        <Calendar size={20} />
      </button>

      {(isOpen || closing) && (
        <div className={`jump-to-date-popover ${closing ? 'closing' : ''}`}>
          <div className="popover-header">
            <span className="popover-title">JUMP TO DATE</span>
            <button
              type="button"
              className="popover-close-btn"
              onClick={close}
            >
              <X size={14} />
            </button>
          </div>

          <MiniCalendar
            selectedDate={selectedDate}
            onDateSelect={(date) => {
              onDateSelect(date)
              close()
            }}
            availableDates={availableDates}
          />
        </div>
      )}
    </div>
  )
}
