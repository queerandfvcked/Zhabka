import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './Toast.css'

export default function Toast({ show, message = 'Changes saved' }) {
  const [visible, setVisible] = useState(show)
  const [closing, setClosing] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (show) {
      setVisible(true)
      setClosing(false)
    } else if (visible) {
      setClosing(true)
      timerRef.current = setTimeout(() => {
        setVisible(false)
        setClosing(false)
      }, 250)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [show, visible])

  if (!visible) return null

  return (
    <div className={`toast-container ${closing ? 'closing' : ''}`}>
      <div className="toast-content">
        <div className="toast-icon">
          <Check size={14} />
        </div>
        <span className="toast-text">{message}</span>
      </div>
    </div>
  )
}