import { useState } from 'react'
import './Mascot.css'

const MASCOT_SRC = {
  neutral: '/mascot-neutral.webm',
  notfound: '/mascot-notfound.webm',
  splash: '/animation.webm',
}

// Универсальный маскот. variant — какой ролик показывать,
// blackBg — у ролика чёрный фон (смешиваем screen-блендингом,
// чтобы чёрный стал невидимым на тёмном бэкграунде приложения).
// Видео показываем только после onLoadedData — иначе браузер на
// долю секунды рисует чёрный прямоугольник вместо первого кадра.
//
// Важно: у ролика НЕ должно быть анимированных предков (opacity/transform) —
// они изолируют mix-blend-mode и чёрный фон пробивается. Поэтому у
// .scroll-wrapper убран viewFadeIn, а видео блендится против реального
// фона страницы, включая его градиент.
export default function Mascot({ variant = 'neutral', blackBg, size = 'md', className = '' }) {
  const [isReady, setIsReady] = useState(false)
  const hasBlackBg = blackBg !== undefined ? blackBg : variant !== 'splash'
  return (
    <video
      className={`mascot ${isReady ? 'mascot-visible' : ''} mascot-${size} ${hasBlackBg ? 'mascot-black-bg' : ''} ${className}`}
      src={MASCOT_SRC[variant] || MASCOT_SRC.neutral}
      autoPlay
      muted
      loop
      playsInline
      onLoadedData={() => setIsReady(true)}
    />
  )
}
