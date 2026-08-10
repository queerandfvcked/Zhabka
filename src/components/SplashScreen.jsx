import './SplashScreen.css'

// Сплэш держится минимум MIN_VISIBLE_MS, даже если данные пришли мгновенно —
// иначе на быстром бэкенде это будет не "оживление бренда", а дёрганье
// экрана на 50мс. Если бэкенд наоборот тормозит — ролик просто зацикливается
// дальше, никакого отдельного "завис" состояния городить не нужно.
export default function SplashScreen({ leaving }) {
  return (
    <div className={`splash ${leaving ? 'splash-leaving' : ''}`}>
      <video
        className="splash-video"
        src="/animation.webm"
        autoPlay
        muted
        loop
        playsInline
      />
    </div>
  )
}
