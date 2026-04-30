import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { thumbCache } from './HomePage'

// ─── Hang-in-there characters ──────────────────────────────
const HANG_TEXT = 'HANG IN THERE'
// Timings for transitions (in ms)
const TRANSITION_DELAY = 1000 // Delay after reaching 100% progress
const DONE_DELAY = 1000       // Duration of 'done' phase before screen fade
const FADE_OUT_DURATION = 600 // Duration of final screen fade out
const PYTHON_READY_TIMEOUT = 20000

type CheckStatus = 'pending' | 'checking' | 'ready' | 'missing' | 'warning'

type StartupCheck = {
  id: 'python' | 'qwen' | 'deps' | 'face'
  label: string
  required: boolean
  status: CheckStatus
  detail: string
}

const INITIAL_CHECKS: StartupCheck[] = [
  { id: 'python', label: 'Python engine', required: true, status: 'checking', detail: 'Starting AI engine' },
  { id: 'qwen', label: 'Qwen2-VL model', required: true, status: 'pending', detail: 'Waiting for engine' },
  { id: 'deps', label: 'AI dependencies', required: true, status: 'pending', detail: 'Waiting for engine' },
  { id: 'face', label: 'Face recognition', required: false, status: 'pending', detail: 'Waiting for engine' },
]

// ─── MAIN COMPONENT ─────────────────────────────────────────
export default function SplashScreen() {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'transition' | 'done'>('loading')
  const [charReveal, setCharReveal] = useState(0)
  const [checks, setChecks] = useState<StartupCheck[]>(INITIAL_CHECKS)
  const [checksDone, setChecksDone] = useState(false)
  const [missingRequiredModel, setMissingRequiredModel] = useState(false)
  const setCurrentScreen = useAppStore(s => s.setCurrentScreen)
  const isFirstLaunch = useAppStore(s => s.isFirstLaunch)
  const userName = useAppStore(s => s.userName)

  // ── Startup checks: Python, Qwen, dependencies, face support ─────────────
  useEffect(() => {
    let cancelled = false
    let completed = false
    let pollInterval: ReturnType<typeof setInterval> | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null

    const updateCheck = (id: StartupCheck['id'], updates: Partial<StartupCheck>) => {
      setChecks(prev => prev.map(check => check.id === id ? { ...check, ...updates } : check))
    }

    const finalizeChecks = (needsModelDownload: boolean) => {
      if (cancelled || completed) return
      completed = true
      setMissingRequiredModel(needsModelDownload)
      setChecksDone(true)
      if (pollInterval) clearInterval(pollInterval)
      if (timeoutTimer) clearTimeout(timeoutTimer)
    }

    const checkModels = async () => {
      if (cancelled || completed) return

      try {
        const pythonStatus = await window.electronAPI?.getPythonStatus?.()
        if (cancelled || completed) return

        if (!pythonStatus?.ready) {
          updateCheck('python', { status: 'checking', detail: 'Starting AI engine' })
          return
        }

        updateCheck('python', { status: 'ready', detail: 'Engine online' })
        updateCheck('qwen', { status: 'checking', detail: 'Checking model files' })
        updateCheck('deps', { status: 'checking', detail: 'Verifying runtime packages' })
        updateCheck('face', { status: 'checking', detail: 'Checking optional support' })

        const status: any = await window.electronAPI?.getModelStatus?.()
        if (cancelled || completed) return

        const qwenDownloaded = Boolean(status?.models?.['qwen2-vl']?.downloaded ?? status?.models_available)
        const torchReady = status?.dependencies?.torch !== false
        const transformersReady = status?.dependencies?.transformers !== false
        const depsReady = torchReady && transformersReady
        const faceReady = status?.dependencies?.face_recognition !== false

        updateCheck('qwen', {
          status: qwenDownloaded ? 'ready' : 'missing',
          detail: qwenDownloaded ? 'Installed and loaded' : 'Missing or failed to load',
        })

        updateCheck('deps', {
          status: depsReady ? 'ready' : 'missing',
          detail: depsReady ? 'PyTorch and Transformers available' : 'Missing required AI packages',
        })

        updateCheck('face', {
          status: faceReady ? 'ready' : 'warning',
          detail: faceReady ? 'Face library available' : 'Optional package not installed',
        })

        finalizeChecks(!qwenDownloaded || !depsReady)
      } catch {
        if (cancelled || completed) return
        updateCheck('qwen', { status: 'missing', detail: 'Could not verify model status' })
        updateCheck('deps', { status: 'missing', detail: 'Could not verify dependencies' })
        finalizeChecks(true)
      }
    }

    const unsubscribe = window.electronAPI?.onPythonReady?.((data: any) => {
      if (data?.ready) checkModels()
    })

    checkModels()
    pollInterval = setInterval(checkModels, 1200)
    timeoutTimer = setTimeout(() => {
      if (cancelled || completed) return
      updateCheck('python', { status: 'missing', detail: 'Engine startup timed out' })
      updateCheck('qwen', { status: 'missing', detail: 'Could not validate Qwen model' })
      updateCheck('deps', { status: 'missing', detail: 'Could not validate required packages' })
      updateCheck('face', { status: 'warning', detail: 'Face support not confirmed' })
      finalizeChecks(true)
    }, PYTHON_READY_TIMEOUT)

    return () => {
      cancelled = true
      unsubscribe?.()
      if (pollInterval) clearInterval(pollInterval)
      if (timeoutTimer) clearTimeout(timeoutTimer)
    }
  }, [])

  // ── Preload thumbnails ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // @ts-ignore
        const res: any = await window.electronAPI?.getImages()
        if (!cancelled && res?.success && Array.isArray(res.images)) {
          const recentImages = res.images
            .sort((a: any, b: any) => new Date(b.dateModified).getTime() - new Date(a.dateModified).getTime())
            .slice(0, 20)
          
          for (let i = 0; i < recentImages.length; i += 5) {
            if (cancelled) break
            const batch = recentImages.slice(i, i + 5)
            Promise.all(
              batch.map(async (img: any) => {
                if (thumbCache.has(img.id)) return
                try {
                  // @ts-ignore
                  const preview = await window.electronAPI?.getImageThumbnail(img.path)
                  if (preview && !cancelled) {
                    thumbCache.set(img.id, preview)
                  }
                } catch { /* skip */ }
              })
            )
          }
        }
      } catch (e) {
        console.error('[SplashScreen] Preload failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Progress tick ────────────
  useEffect(() => {
    const target = checksDone ? 100 : 92
    const smoothing = checksDone ? 0.22 : 0.045

    const timer = setInterval(() => {
      setProgress(prev => {
        const delta = target - prev
        if (Math.abs(delta) < 0.2) return target
        return prev + (delta * smoothing)
      })
    }, 16)

    return () => clearInterval(timer)
  }, [checksDone])

  // ── Phase transitions and final screen change ──────────────
  useEffect(() => {
    if (checksDone && progress >= 100 && phase === 'loading') {
      setPhase('transition')
      setTimeout(() => setPhase('done'), TRANSITION_DELAY)
      
      setTimeout(() => {
        setPhase('done')
        setTimeout(() => {
          if (isFirstLaunch || !userName) setCurrentScreen('name')
          else if (missingRequiredModel) setCurrentScreen('modelDownload')
          else setCurrentScreen('home')
        }, FADE_OUT_DURATION)
      }, TRANSITION_DELAY + DONE_DELAY)
    }
  }, [checksDone, progress, phase, isFirstLaunch, userName, missingRequiredModel, setCurrentScreen])

  // ── Character reveal: smoothly spans over the progress ──────────────
  useEffect(() => {
    const startProgress = 15
    const endProgress = 80
    const totalRange = endProgress - startProgress
    const currentProgress = progress - startProgress
    const mapped = Math.max(0, Math.min(1, currentProgress / totalRange))
    setCharReveal(Math.round(mapped * HANG_TEXT.length))
  }, [progress])

  // Derived state for styling
  const isInBluePhase = phase === 'transition' || phase === 'done'
  const finalScreenFade = phase === 'done' ? 1 : 0
  const bgGlow = Math.max(0, (progress - 60) / 40) // Glow starts from 60% progress

  return (
    <div style={rootStyle}>

      {/* ── Cinematic gradient background layer (starts black) ── */}
      <div style={{
        position: 'absolute', inset: 0,
        transition: 'background 1s cubic-bezier(0.16,1,0.3,1), backdrop-filter 1s ease, filter 1s ease',
        background: isInBluePhase
          ? 'radial-gradient(ellipse 130% 100% at 50% 65%, #2d1b69 0%, #110d2e 45%, #000000 100%)'
          : '#000000',
        backdropFilter: isInBluePhase ? 'blur(10px)' : 'blur(0px)',
        zIndex: 0,
      }} />

      {/* ── Subtle noise overlay ── */}
      <div style={noiseStyle} />

      {/* ── Purple ambient glow/light effects layer ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
        transition: 'opacity 0.7s ease, backdrop-filter 1s ease',
        background: 'radial-gradient(ellipse 80% 55% at 50% 38%, rgba(130,80,255,0.4) 0%, transparent 70%)',
        opacity: (isInBluePhase ? 1 : (bgGlow * 0.55)),
        backdropFilter: isInBluePhase ? 'blur(20px)' : 'blur(0px)',
      }} />

      {/* ── Central Vertical Light Beam effect ── */}
      {isInBluePhase && (
        <div style={{
          position: 'absolute', top: '-10%', left: '50%',
          transform: 'translateX(-50%)',
          width: '1px', height: '75%',
          background: 'linear-gradient(180deg, transparent, rgba(160,120,255,0.22), transparent)',
          filter: 'blur(18px)', zIndex: 2,
        }} />
      )}

      {/* ════════════ CENTRAL CONTENT ════════════ */}
      <div style={centreWrap}>

        {/* ── Inline SVG Logo Clip-Reveal ── */}
        <div style={logoWrap}>
          {/* Ghost outline */}
          <LogoSVG progress={100} isGhost />
          {/* Revealed filled mask */}
          <LogoSVG progress={progress} isBlue={isInBluePhase} />
        </div>

        {/* ── "HANG IN THERE" Text reveal ── */}
        <div style={hangWrap} aria-label={HANG_TEXT}>
          {HANG_TEXT.split('').map((ch, i) => (
            <span key={i} style={{
              ...hangChar,
              opacity: i < charReveal ? 1 : 0,
              transform: i < charReveal ? 'translateY(0px)' : 'translateY(7px)',
              transition: `opacity 0.22s ease ${i * 0.04}s, transform 0.22s ease ${i * 0.04}s`,
              color: isInBluePhase ? 'rgba(196,181,253,0.65)' : 'rgba(255,255,255,0.42)',
            }}>
              {ch === ' ' ? '\u00A0' : ch}
            </span>
          ))}
        </div>

        {/* ── Progress bar with shimmer effect ── */}
        <div style={barWrap}>
          <div style={barTrack}>
            <div style={{
              height: '100%', borderRadius: '2px',
              width: `${progress}%`,
              transition: 'width 0.1s linear, background 1s ease, box-shadow 1s ease',
              background: isInBluePhase
                ? 'linear-gradient(90deg,#6c3fff,#a78bfa,#c4b5fd)'
                : '#ffffff',
              boxShadow: isInBluePhase
                ? '0 0 14px rgba(167,139,250,0.75)'
                : '0 0 6px rgba(255,255,255,0.35)',
            }} />
            {phase === 'loading' && <div style={barShimmer} className="sm-shimmer" />}
          </div>
          <div style={barMeta}>
            <span style={{
              fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.14em',
              transition: 'color 0.6s ease',
              color: isInBluePhase ? 'rgba(196,181,253,0.55)' : 'rgba(255,255,255,0.35)',
            }}>
              {phase === 'done'
                ? 'Ready'
                : phase === 'transition'
                  ? 'Starting...'
                  : checksDone
                    ? 'Finalizing startup...'
                    : 'Checking AI startup...'}
            </span>
            <span style={barPercent}>{Math.round(progress)}%</span>
          </div>

          <div style={checksWrap}>
            {checks.map((check) => {
              const statusColor =
                check.status === 'ready'
                  ? 'rgba(134, 239, 172, 0.9)'
                  : check.status === 'missing'
                    ? 'rgba(252, 165, 165, 0.9)'
                    : check.status === 'warning'
                      ? 'rgba(253, 224, 71, 0.9)'
                      : 'rgba(255, 255, 255, 0.6)'

              const statusLabel =
                check.status === 'ready'
                  ? 'OK'
                  : check.status === 'missing'
                    ? 'MISSING'
                    : check.status === 'warning'
                      ? 'OPTIONAL'
                      : 'CHECKING'

              return (
                <div key={check.id} style={checkRowStyle}>
                  <div style={{ ...statusDotStyle, background: statusColor }} />
                  <div style={checkMainStyle}>
                    <span style={checkLabelStyle}>{check.label}</span>
                    <span style={checkDetailStyle}>{check.detail}</span>
                  </div>
                  <span style={{ ...checkTagStyle, color: statusColor }}>{statusLabel}</span>
                </div>
              )
            })}
          </div>
        </div>

      </div>

      <div style={footerStyle}>SmartMedia&nbsp;&nbsp;·&nbsp;&nbsp;© 2026</div>

      {/* Final Fade Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: '#000', zIndex: 9999,
        transition: `opacity ${FADE_OUT_DURATION}ms ease`,
        opacity: finalScreenFade,
        pointerEvents: 'none',
      }} />

      <style>{`
        @keyframes sm-shimmer {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(500%);  }
        }
        .sm-shimmer { animation: sm-shimmer 1.8s cubic-bezier(0.4,0,0.6,1) infinite; }
      `}</style>
    </div>
  )
}

// ════════════════════════════════════════════════════════
// PURE SVG LOGO COMPONENT
// ════════════════════════════════════════════════════════
function LogoSVG({ progress, isGhost, isBlue }: { progress: number, isGhost?: boolean, isBlue?: boolean }) {
  return (
    <svg
      width="100%" height="100%" viewBox="0 0 280 64"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{
        position: 'absolute', left: 0, top: 0,
        opacity: isGhost ? 0.08 : 1,
        clipPath: isGhost ? 'none' : `inset(0 ${100 - progress}% 0 0)`,
        filter: (!isGhost && isBlue)
          ? 'drop-shadow(0 0 16px rgba(167,139,250,0.6))'
          : (!isGhost ? 'drop-shadow(0 0 4px rgba(255,255,255,0.15))' : 'none'),
        transition: 'filter 1s ease',
      }}
    >
      <defs>
        <linearGradient id="textGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>
      </defs>

      {/* Geometric Icon */}
      <g transform="translate(10, 12)">
        <path d="M 0 0 H 40 L 20 20 H 0 V 0 Z" fill="#FFFFFF" />
        <path d="M 20 20 H 40 L 20 40 V 20 Z" fill="#FFFFFF" fillOpacity="0.5" />
      </g>

      {/* Typography */}
      <text
        x="66" y="44"
        fill={isBlue && !isGhost ? "url(#textGrad)" : "#FFFFFF"}
        fontSize="36"
        fontWeight="800"
        fontFamily='"Inter", "SF Pro Display", system-ui, sans-serif'
        letterSpacing="-1.5"
      >
        SmartMedia
      </text>
    </svg>
  )
}

// ════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════

const rootStyle: React.CSSProperties = {
  height: '100vh', width: '100vw',
  display: 'flex', flexDirection: 'column',
  justifyContent: 'center', alignItems: 'center',
  fontFamily: '"Inter","SF Pro Display",system-ui,sans-serif',
  overflow: 'hidden', position: 'relative', color: '#fff',
  background: '#000',
}

const noiseStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, opacity: 0.032,
  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
  backgroundSize: '200px 200px', pointerEvents: 'none', zIndex: 2,
}

const centreWrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', gap: '38px',
  zIndex: 10, position: 'relative',
}

const logoWrap: React.CSSProperties = {
  position: 'relative', width: '280px', height: '64px', // Matches the exact SVG dimensions
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const hangWrap: React.CSSProperties = { display: 'flex' }

const hangChar: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.22em',
  display: 'inline-block',
}

const barWrap: React.CSSProperties = {
  width: '320px', display: 'flex', flexDirection: 'column', gap: '11px',
}

const checksWrap: React.CSSProperties = {
  marginTop: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '7px',
}

const checkRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

const statusDotStyle: React.CSSProperties = {
  width: '6px',
  height: '6px',
  borderRadius: '999px',
  boxShadow: '0 0 8px rgba(255,255,255,0.2)',
  flexShrink: 0,
}

const checkMainStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
}

const checkLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.65)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const checkDetailStyle: React.CSSProperties = {
  fontSize: '10px',
  color: 'rgba(255,255,255,0.38)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const checkTagStyle: React.CSSProperties = {
  fontSize: '9px',
  fontWeight: 700,
  letterSpacing: '0.08em',
}

const barTrack: React.CSSProperties = {
  width: '100%', height: '2px',
  background: 'rgba(255,255,255,0.07)',
  borderRadius: '2px', overflow: 'hidden', position: 'relative',
}

const barShimmer: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0,
  width: '22%', height: '100%',
  background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.38),transparent)',
}

const barMeta: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}

const barPercent: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700,
  fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace',
  color: 'rgba(255,255,255,0.45)',
}

const footerStyle: React.CSSProperties = {
  position: 'absolute', bottom: '28px',
  fontSize: '11px', color: 'rgba(255,255,255,0.1)',
  fontWeight: 500, letterSpacing: '0.04em', zIndex: 10,
}