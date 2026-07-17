import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import './MiniCalendar.css'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function MiniCalendar({ selectedDate, onDateSelect, availableDates }) {
  const today = new Date()
  const initialDate = selectedDate ? new Date(selectedDate + 'T00:00:00') : today
  const [year, setYear] = useState(initialDate.getFullYear())
  const [month, setMonth] = useState(initialDate.getMonth())

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7

  const availableSet = useMemo(() => {
    if (!availableDates) return null
    return new Set(availableDates)
  }, [availableDates])

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
  }

  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
  }

  const days = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const isAvailable = availableSet ? availableSet.has(dateStr) : true
    const isSelected = dateStr === selectedDate
    const isToday = dateStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    days.push({ day: d, dateStr, isAvailable, isSelected, isToday })
  }

  return (
    <div className="mini-calendar">
      <div className="mc-header">
        <button type="button" className="mc-nav" onClick={prevMonth}>
          <ChevronLeft size={16} />
        </button>
        <span className="mc-title">{MONTHS[month]} {year}</span>
        <button type="button" className="mc-nav" onClick={nextMonth}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mc-weekdays">
        {WEEKDAYS.map((wd) => (
          <span key={wd} className="mc-wd">{wd}</span>
        ))}
      </div>

      <div className="mc-grid">
        {days.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} className="mc-day empty" />
          return (
            <button
              key={cell.dateStr}
              type="button"
              className={`mc-day ${cell.isSelected ? 'selected' : ''} ${!cell.isAvailable ? 'muted' : ''} ${cell.isToday ? 'today' : ''}`}
              onClick={() => cell.isAvailable && onDateSelect(cell.dateStr)}
              disabled={!cell.isAvailable}
            >
              {cell.day}
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <button type="button" className="mc-clear" onClick={() => onDateSelect(null)}>
          Show all dates
        </button>
      )}
    </div>
  )
}
