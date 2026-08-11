import './Mascot.css'

const MASCOT_SRC = {
  neutral: '/mascot-neutral.webm',
  notfound: '/mascot-notfound.webm',
  splash: '/animation.webm',
}

// Универсальный маскот. variant — какой ролик показывать,
// blackBg — у ролика чёрный фон (смешиваем screen-блендингом,
// чтобы чёрный стал невидимым на тёмном бэкграунде приложения).
export default function Mascot({ variant = 'neutral', blackBg, size = 'md', className = '' }) {
  const hasBlackBg = blackBg !== undefined ? blackBg : variant !== 'splash'
  return (
    <video
      className={`mascot mascot-${size} ${hasBlackBg ? 'mascot-black-bg' : ''} ${className}`}
      src={MASCOT_SRC[variant] || MASCOT_SRC.neutral}
      autoPlay
      muted
      loop
      playsInline
    />
  )
}
