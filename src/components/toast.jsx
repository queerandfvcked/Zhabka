import { Check } from 'lucide-react'
import './Toast.css'

export default function Toast({ show, message = 'Changes saved' }) {
  if (!show) return null

  return (
    <div className="toast-container">
      <div className="toast-content">
        <div className="toast-icon">
          <Check size={14} />
        </div>
        <span className="toast-text">{message}</span>
      </div>
    </div>
  )
}