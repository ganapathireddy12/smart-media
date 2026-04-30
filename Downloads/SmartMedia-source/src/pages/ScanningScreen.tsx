import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useAppStore } from '../store/appStore'
import {
  Check,
  Tag,
  MessageSquare,
  User,
  LayoutGrid,
  BrainCircuit,
  Image as ImageIcon,
  SkipForward,
  Layers,
  Video,
  Music,
  FileText,
  Zap,
  Eye,
} from 'lucide-react'

// ─── Media type helper ────────────────────────────────────────────────────────
function getMediaType(filename: string): 'image' | 'video' | 'audio' | 'document' {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'm4v', '3gp'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'].includes(ext)) return 'audio'
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'rtf', 'log'].includes(ext)) return 'document'
  return 'image'
}

// ─── Media placeholder icon ───────────────────────────────────────────────────
const mediaConfig = {
  video:    { Icon: Video,    color: 'text-sky-400',    label: 'Video File',  bg: 'bg-sky-500/10' },
  audio:    { Icon: Music,    color: 'text-violet-400', label: 'Audio File',  bg: 'bg-violet-500/10' },
  document: { Icon: FileText, color: 'text-amber-400',  label: 'Document',    bg: 'bg-amber-500/10' },
  image:    { Icon: ImageIcon,color: 'text-zinc-500',   label: 'Loading…',    bg: 'bg-zinc-800/60' },
}

// ─── Animated scan line ───────────────────────────────────────────────────────
function ScanLine() {
  return (
    <motion.div
      className="absolute inset-x-0 h-px pointer-events-none z-20"
      style={{ background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.8), transparent)' }}
      initial={{ top: '0%' }}
      animate={{ top: '100%' }}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
    />
  )
}

// ─── Glowing corner dots ──────────────────────────────────────────────────────
function CornerDots() {
  const pos = ['top-2 left-2', 'top-2 right-2', 'bottom-2 left-2', 'bottom-2 right-2']
  return (
    <>
      {pos.map((p, i) => (
        <motion.span
          key={i}
          className={`absolute w-1 h-1 rounded-full bg-sky-400/60 ${p}`}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.3 }}
        />
      ))}
    </>
  )
}

// ─── Animated tag pill ────────────────────────────────────────────────────────
function TagPill({ label, index }: { label: string; index: number }) {
  return (
    <motion.span
      key={label}
      layout
      initial={{ opacity: 0, scale: 0.7, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28, delay: index * 0.03 }}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                 bg-white/[0.05] border border-white/[0.1] text-white/80
                 text-[10px] font-medium tracking-wide whitespace-nowrap
                 hover:bg-white/[0.09] hover:border-sky-500/40 transition-colors duration-200"
    >
      <span className="w-1 h-1 rounded-full bg-sky-400/70 shrink-0" />
      {label}
    </motion.span>
  )
}

// ─── Spring progress bar ──────────────────────────────────────────────────────
function SpringProgress({ value, complete }: { value: number; complete: boolean }) {
  const raw = useMotionValue(0)
  const smooth = useSpring(raw, { stiffness: 60, damping: 18 })
  const width = useTransform(smooth, (v) => `${v}%`)

  useEffect(() => { raw.set(value) }, [value, raw])

  return (
    <div className="relative h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
      {/* track shimmer */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className={`h-full rounded-full ${complete ? 'bg-emerald-400' : 'bg-sky-500'}`}
        style={{ width }}
      />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ScanningScreen() {
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null)
  const [previewLoadingIndex, setPreviewLoadingIndex] = useState(-1)
  const [imgLoaded, setImgLoaded] = useState(false)

  const discoveredImages = useAppStore((s) => s.discoveredImages)
  const scanProgress    = useAppStore((s) => s.scanProgress)
  const setScanProgress = useAppStore((s) => s.setScanProgress)
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen)
  const skipCurrentImage = useAppStore((s) => s.skipCurrentImage)

  const isComplete = scanProgress.status === 'completed'
  const isPaused   = scanProgress.status === 'paused'
  const isScanning = scanProgress.status === 'scanning'

  const progress = useMemo(
    () => (scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0),
    [scanProgress.current, scanProgress.total]
  )

  const currentMediaType = useMemo(
    () => getMediaType(scanProgress.currentImage || ''),
    [scanProgress.currentImage]
  )

  const detectedObjectsList = useMemo(
    () => scanProgress.detectedObjects.slice(0, 10),
    [scanProgress.detectedObjects]
  )

  // ── Start scan ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (scanProgress.status === 'idle' && discoveredImages.length > 0) {
      setScanProgress({ status: 'scanning', total: discoveredImages.length, current: 0 })
    }
  }, [discoveredImages.length, scanProgress.status, setScanProgress])

  // ── Load preview ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (previewLoadingIndex === scanProgress.current) return
    setPreviewLoadingIndex(scanProgress.current)
    setImgLoaded(false)

    const load = async () => {
      if (scanProgress.current >= discoveredImages.length) return
      const imagePath = discoveredImages[scanProgress.current]
      const mType = getMediaType(imagePath.split('\\').pop() || imagePath.split('/').pop() || '')
      if (mType !== 'image') { setCurrentImagePreview(null); return }

      try {
        if (imagePath.startsWith('blob:')) {
          setCurrentImagePreview(imagePath)
        } else {
          // @ts-ignore
          const preview = await window.electronAPI?.getImageThumbnail(imagePath)
          setCurrentImagePreview(preview ?? null)
        }
      } catch { setCurrentImagePreview(null) }
    }
    load()
  }, [scanProgress.current, discoveredImages, previewLoadingIndex])

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSkipImage = useCallback(() => {
    if (isScanning && !isComplete) skipCurrentImage()
  }, [isScanning, isComplete, skipCurrentImage])

  const handleProcessInBackground = useCallback(async () => {
    const remaining = discoveredImages.slice(scanProgress.current + 1)
    if (!remaining.length) { setCurrentScreen('home'); return }

    const existing = localStorage.getItem('background-processing')
    if (existing && JSON.parse(existing).isProcessing) { setCurrentScreen('home'); return }

    setScanProgress({ status: 'paused' })
    localStorage.setItem('background-processing', JSON.stringify({
      isProcessing: true, current: 0, total: remaining.length, timestamp: Date.now(),
    }))
    // @ts-ignore
    if (window.electronAPI?.queueImages) {
      try { await window.electronAPI.queueImages(remaining) } catch {}
    }
    setCurrentScreen('home')
  }, [discoveredImages, scanProgress.current, setScanProgress, setCurrentScreen])

  const handleGoToGallery = useCallback(() => setCurrentScreen('home'), [setCurrentScreen])

  // ── Short filename ──────────────────────────────────────────────────────────
  const shortName = useMemo(() => {
    if (!scanProgress.currentImage) return 'Initializing…'
    const parts = scanProgress.currentImage.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || scanProgress.currentImage
  }, [scanProgress.currentImage])

  const { Icon: PlaceholderIcon, color: placeholderColor, label: placeholderLabel, bg: placeholderBg } =
    mediaConfig[currentMediaType]

  return (
    <div
      className="relative h-full flex flex-col overflow-hidden select-none"
      style={{ background: '#080a0f', fontFamily: "'DM Sans', 'Geist', 'Inter', sans-serif" }}
    >
      {/* ── Ambient background ─────────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-20"
             style={{ background: 'radial-gradient(circle, #0ea5e9 0%, transparent 70%)' }} />
        <div className="absolute -bottom-24 -left-24 w-[400px] h-[400px] rounded-full opacity-10"
             style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
        {/* subtle grid */}
        <div className="absolute inset-0 opacity-[0.025]"
             style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* ── Main layout ────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col h-full p-4 gap-3 max-w-5xl mx-auto w-full">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <motion.div
          className="flex items-center gap-3 shrink-0"
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {/* Icon badge */}
          <div className="relative">
            <motion.div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)' }}
              animate={isComplete ? {} : { boxShadow: ['0 0 0px rgba(14,165,233,0)', '0 0 14px rgba(14,165,233,0.35)', '0 0 0px rgba(14,165,233,0)'] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <AnimatePresence mode="wait">
                {isComplete
                  ? <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                      <Check className="text-emerald-400" size={18} strokeWidth={2.5} />
                    </motion.div>
                  : <motion.div key="brain" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <BrainCircuit className="text-sky-400" size={18} />
                    </motion.div>
                }
              </AnimatePresence>
            </motion.div>
            {/* Pulse ring */}
            {isScanning && (
              <motion.div
                className="absolute inset-0 rounded-xl border border-sky-400/40"
                animate={{ scale: [1, 1.5], opacity: [0.4, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.h1
                key={isComplete ? 'done' : 'proc'}
                className="text-[13px] font-semibold tracking-tight text-white leading-tight"
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.2 }}
              >
                {isComplete ? 'Analysis Complete' : isPaused ? 'Processing Paused' : 'Analyzing Library'}
              </motion.h1>
            </AnimatePresence>
            <p className="text-[11px] text-white/35 mt-0.5">
              {isComplete ? 'All media tagged and indexed.' : 'On-device AI is running locally.'}
            </p>
          </div>

          {/* Live badge */}
          {isScanning && (
            <motion.div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium text-sky-300"
              style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)' }}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            >
              <motion.span
                className="w-1.5 h-1.5 rounded-full bg-sky-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              LIVE
            </motion.div>
          )}
        </motion.div>

        {/* ── BODY: Preview + Data Feed ──────────────────────────────────── */}
        <div className="flex-1 flex gap-3 min-h-0">

          {/* ── LEFT: Image Preview ──────────────────────────────────────── */}
          <motion.div
            className="flex-[2] flex flex-col rounded-2xl overflow-hidden min-w-0"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08, ease: 'easeOut' }}
          >
            {/* Preview area */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-[#0c0e14]">
              
              <AnimatePresence mode="wait">
                {currentImagePreview ? (
                  <motion.img
                    key={`img-${scanProgress.current}`}
                    src={currentImagePreview}
                    alt="Processing"
                    onLoad={() => setImgLoaded(true)}
                    initial={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
                    animate={{ opacity: imgLoaded ? 1 : 0, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 0.98, filter: 'blur(4px)' }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="w-full h-full object-contain p-3 will-change-transform"
                    loading="eager"
                  />
                ) : (
                  <motion.div
                    key="placeholder"
                    className={`flex flex-col items-center gap-3 p-6 rounded-2xl ${placeholderBg}`}
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.25 }}
                  >
                    <PlaceholderIcon size={44} className={placeholderColor} strokeWidth={1.5} />
                    <span className={`text-[10px] uppercase tracking-[0.15em] font-semibold ${placeholderColor} opacity-70`}>
                      {placeholderLabel}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Corner dots */}
              {isScanning && <CornerDots />}

              {/* Animated scan line */}
              {isScanning && <ScanLine />}

              {/* Vignette */}
              <div className="absolute inset-0 pointer-events-none"
                   style={{ background: 'radial-gradient(ellipse at center, transparent 60%, rgba(8,10,15,0.6) 100%)' }} />

              {/* Eye indicator top-right */}
              {isScanning && (
                <motion.div
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] text-white/50"
                  style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Eye size={10} />
                  Analyzing
                </motion.div>
              )}
            </div>

            {/* Filename bar */}
            <div className="px-3 py-2.5 flex justify-between items-center gap-2"
                 style={{ background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <AnimatePresence mode="wait">
                <motion.span
                  key={shortName}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.2 }}
                  className="text-[10px] font-mono text-white/30 truncate flex-1 min-w-0"
                >
                  {shortName}
                </motion.span>
              </AnimatePresence>
              <span className="shrink-0 text-[9px] uppercase tracking-widest text-white/15 font-semibold">
                Live Preview
              </span>
            </div>
          </motion.div>

          {/* ── RIGHT: Data feed ─────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col gap-3 min-w-[220px] max-w-[300px]">

            {/* Detected Objects */}
            <motion.div
              className="flex-1 rounded-2xl p-3 flex flex-col min-h-0 overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.12, ease: 'easeOut' }}
            >
              <div className="flex items-center gap-1.5 mb-2.5 shrink-0">
                <div className="w-5 h-5 rounded-md flex items-center justify-center"
                     style={{ background: 'rgba(14,165,233,0.12)' }}>
                  <Tag size={10} className="text-sky-400" />
                </div>
                <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
                  Detected
                </span>
                {detectedObjectsList.length > 0 && (
                  <motion.span
                    className="ml-auto text-[9px] font-mono text-sky-400/60"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  >
                    {detectedObjectsList.length}
                  </motion.span>
                )}
              </div>

              <div className="flex-1 flex flex-wrap gap-1.5 content-start overflow-hidden">
                <AnimatePresence mode="popLayout">
                  {detectedObjectsList.map((obj, i) => (
                    <TagPill key={`${obj}-${i}`} label={obj} index={i} />
                  ))}
                </AnimatePresence>
                {detectedObjectsList.length === 0 && !isComplete && (
                  <div className="flex items-center gap-2">
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="h-5 rounded-full bg-white/[0.04]"
                        style={{ width: `${48 + i * 18}px` }}
                        animate={{ opacity: [0.3, 0.7, 0.3] }}
                        transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Caption / Context */}
            <motion.div
              className="rounded-2xl p-3 flex flex-col shrink-0"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', minHeight: '96px' }}
              initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.18, ease: 'easeOut' }}
            >
              <div className="flex items-center gap-1.5 mb-2 shrink-0">
                <div className="w-5 h-5 rounded-md flex items-center justify-center"
                     style={{ background: 'rgba(99,102,241,0.12)' }}>
                  <MessageSquare size={10} className="text-indigo-400" />
                </div>
                <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
                  Context
                </span>
              </div>
              <AnimatePresence mode="wait">
                {scanProgress.generatedCaption ? (
                  <motion.p
                    key={scanProgress.generatedCaption}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                    className="text-[11px] text-white/55 leading-relaxed line-clamp-3 flex-1"
                  >
                    {scanProgress.generatedCaption}
                  </motion.p>
                ) : (
                  <motion.div
                    key="caption-skeleton"
                    className="flex flex-col gap-1.5 flex-1"
                    animate={{ opacity: [0.4, 0.7, 0.4] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  >
                    {[100, 80, 60].map((w, i) => (
                      <div key={i} className="h-2 rounded bg-white/[0.06]" style={{ width: `${w}%` }} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Faces */}
            <motion.div
              className="rounded-2xl p-3 flex items-center justify-between shrink-0"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.22, ease: 'easeOut' }}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md flex items-center justify-center"
                     style={{ background: 'rgba(251,191,36,0.1)' }}>
                  <User size={10} className="text-amber-400" />
                </div>
                <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
                  Faces
                </span>
              </div>
              <motion.div
                className="px-3 py-1 rounded-full text-[12px] font-bold text-white/80 font-mono"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                key={scanProgress.detectedFaces}
                initial={{ scale: 1.3, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                {scanProgress.detectedFaces || 0}
              </motion.div>
            </motion.div>

          </div>
        </div>

        {/* ── FOOTER: Progress + Controls ─────────────────────────────────── */}
        <motion.div
          className="shrink-0 rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.28, ease: 'easeOut' }}
        >
          {/* Stats row */}
          <div className="flex items-end justify-between mb-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={isComplete ? 'c' : isPaused ? 'p' : 's'}
                    className={`text-[12px] font-semibold ${isComplete ? 'text-emerald-400' : isPaused ? 'text-amber-400' : 'text-white/80'}`}
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {isComplete ? '✓ Complete' : isPaused ? '⏸ Paused' : '⚡ Processing'}
                  </motion.span>
                </AnimatePresence>
              </div>
              <p className="text-[10px] text-white/25 font-mono">
                {scanProgress.current.toLocaleString()} / {scanProgress.total.toLocaleString()} files
              </p>
            </div>
            <motion.span
              className={`text-2xl font-bold tabular-nums tracking-tight ${isComplete ? 'text-emerald-400' : 'text-white/70'}`}
              key={Math.round(progress)}
              initial={{ opacity: 0.6, y: 4 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
            >
              {Math.round(progress)}<span className="text-sm font-medium text-white/25">%</span>
            </motion.span>
          </div>

          {/* Spring progress bar */}
          <div className="mb-4">
            <SpringProgress value={progress} complete={isComplete} />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 flex-wrap">
            {!isComplete && (
              <>
                <motion.button
                  onClick={handleSkipImage}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium text-white/50
                             transition-colors hover:text-white/80"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <SkipForward size={12} strokeWidth={2} />
                  Skip
                </motion.button>

                <motion.button
                  onClick={handleProcessInBackground}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-semibold text-white
                             transition-colors"
                  style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.8), rgba(139,92,246,0.8))', border: '1px solid rgba(139,92,246,0.4)' }}
                >
                  <Layers size={12} strokeWidth={2} />
                  Background
                </motion.button>
              </>
            )}

            <motion.button
              onClick={handleGoToGallery}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[11px] font-semibold
                         transition-all ${isComplete
                           ? 'text-white'
                           : 'text-white/60 hover:text-white/80'
                         }`}
              style={isComplete
                ? { background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', border: '1px solid rgba(14,165,233,0.5)', boxShadow: '0 0 16px rgba(14,165,233,0.3)' }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              <LayoutGrid size={12} strokeWidth={2} />
              {isComplete ? 'View Gallery' : 'Gallery'}
            </motion.button>
          </div>
        </motion.div>

      </div>
    </div>
  )
}