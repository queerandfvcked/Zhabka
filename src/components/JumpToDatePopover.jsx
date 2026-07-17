import { useState, useRef, useEffect } from 'react'
import { Calendar, X } from 'lucide-react'
import MiniCalendar from './MiniCalendar'
import './JumpToDatePopover.css'

export default function JumpToDatePopover({ selectedDate, onDateSelect, availableDates }) {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="jump-to-date-wrapper" ref={popoverRef}>
      <button
        type="button"
        className={`calendar-trigger-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Jump to date"
      >
        <Calendar size={20} />
      </button>

      {isOpen && (
        <div className="jump-to-date-popover">
          <div className="popover-header">
            <span className="popover-title">JUMP TO DATE</span>
            <button
              type="button"
              className="popover-close-btn"
              onClick={() => setIsOpen(false)}
            >
              <X size={14} />
            </button>
          </div>

          <MiniCalendar
            selectedDate={selectedDate}
            onDateSelect={(date) => {
              onDateSelect(date)
              setIsOpen(false)
            }}
            availableDates={availableDates}
          />
        </div>
      )}
    </div>
  )
}
