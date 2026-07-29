import { useState, useEffect } from 'react'

export default function TypewriterText({ text, speed = 12 }) {
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    let i = 0
    setDisplayed('')
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1))
        i++
      } else {
        clearInterval(timer)
      }
    }, speed)
    return () => clearInterval(timer)
  }, [text, speed])

  return (
    <span className="typewriter-text">
      {displayed}
      <span className="dots-flash">
        <span>.</span><span>.</span><span>.</span>
      </span>
    </span>
  )
}
