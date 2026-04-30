import { useState, useMemo, useCallback, useEffect, memo, useRef } from 'react'
import { motion, AnimatePresence, LazyMotion, domAnimation } from 'framer-motion'
import { useAppStore, ImageMetadata } from '../store/appStore'
import PhotoViewer from '../components/PhotoViewer'
import {
  Heart, Grid3X3, LayoutGrid, Trash2, Play, Pause, ArrowUpDown,
  SortAsc, SortDesc, X, CheckCircle2, Image as ImageIcon,
  ChevronLeft, ChevronRight, Calendar, FileText, HardDrive,
  ZoomIn, ZoomOut, ChevronUp, Share2, Video as VideoIcon, Music as AudioIcon, FolderOpen
} from 'lucide-react'

// ─── ULTRA-DARK ENTERPRISE THEME ──────────────────────────────
const T = {
  bg:       '#000000',
  surface:  '#0a0a0a',
  raised:   '#121212',
  border:   '#1f1f22',
  accent:   '#0066ff',
} as const

// ─── LAZY THUMBNAIL ─────────────────────────────────────────
const thumbCache = new Map<string, string>()

function useLazyThumb(id: string, path: string) {
  const [src, setSrc] = useState<string | null>(() => thumbCache.get(id) ?? null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (src) return
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      if (thumbCache.has(id)) { setSrc(thumbCache.get(id)!); return }
      ;(async () => {
        try {
          // @ts-ignore
          const t = await window.electronAPI?.getImageThumbnail(path)
          if (t) { thumbCache.set(id, t); setSrc(t) }
        } catch {}
      })()
    }, { rootMargin: '800px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [id, path, src])

  return { ref, src }
}

// ─── TYPES ──────────────────────────────────────────────────
type ViewMode = 'grid' | 'masonry'
type SortOption = 'date' | 'name' | 'size'

// ─── PHOTO CARD (Matched to Pro Gallery Style) ──────────────
const PhotoCard = memo(({
  image, viewMode, isSelected, isSelectionMode, onClick, onToggleSelect, onUnfavorite,
}: {
  image: ImageMetadata; viewMode: ViewMode; isSelected: boolean
  isSelectionMode: boolean; onClick: () => void; onToggleSelect: () => void
  onUnfavorite: () => void
}) => {
  const { ref, src } = useLazyThumb(image.id, image.path)
  const [hovered, setHovered] = useState(false)
  
  const mediaType = image.mediaType || (image as any).media_type || 'image'
  const isVideo = mediaType === 'video'
  const isAudio = mediaType === 'audio'
  const isDocument = mediaType === 'document'
  const ext = image.filename?.toLowerCase().split('.').pop() || ''
  
  const docMeta = (() => {
    if (ext === 'pdf') return { color: 'text-red-500', bg: 'from-red-950/40 to-black' }
    if (['doc','docx'].includes(ext)) return { color: 'text-blue-500', bg: 'from-blue-950/40 to-black' }
    if (['xls','xlsx','csv'].includes(ext)) return { color: 'text-green-500', bg: 'from-green-950/40 to-black' }
    return { color: 'text-zinc-500', bg: 'from-zinc-900/40 to-black' }
  })()
  
  const fmtDuration = (sec?: number) => {
    if (!sec) return null
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden cursor-pointer group transition-all duration-300 rounded-2xl
        ${viewMode === 'grid' ? 'aspect-square' : ''}
        ${isSelected ? 'ring-2 ring-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)]' : 'ring-1 ring-[#1f1f22] hover:ring-zinc-600 shadow-lg'}`}
      style={{ background: T.surface }}
      onClick={isSelectionMode ? onToggleSelect : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Media Content */}
      {src && (mediaType === 'image' || isVideo || isAudio) ? (
        <>
          <img
            src={src}
            alt={image.filename}
            className={`w-full h-full object-cover transition-transform duration-500 ease-out will-change-transform
              ${hovered && !isSelectionMode ? 'scale-[1.05]' : 'scale-100'}
              ${isSelected ? 'opacity-70 grayscale-[30%] scale-[0.96]' : 'brightness-90'}`}
            loading="lazy" decoding="async" draggable={false}
          />
          {(isVideo || isAudio) && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-lg bg-black/80 backdrop-blur-xl px-2 py-1 border border-white/10 shadow-lg">
              {isVideo ? <VideoIcon size={12} className="text-white" /> : <AudioIcon size={12} className="text-white" />}
              {image.duration != null && <span className="text-[10px] text-white font-bold tabular-nums tracking-wide">{fmtDuration(image.duration)}</span>}
            </div>
          )}
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
              <div className={`w-14 h-14 rounded-full bg-black/40 backdrop-blur-xl flex items-center justify-center transition-all duration-300 border border-white/20 shadow-2xl ${hovered ? 'scale-110 bg-black/60' : 'scale-100'}`}>
                <Play size={24} className="text-white ml-1" fill="white" />
              </div>
            </div>
          )}
        </>
      ) : isDocument ? (
        <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${docMeta.bg} border border-white/5`}>
          <FileText size={42} className={`${docMeta.color} mb-4 drop-shadow-xl`} />
          <p className="text-[13px] text-white/90 font-medium truncate max-w-[85%] text-center px-3">{image.filename}</p>
        </div>
      ) : isVideo ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-950/30 to-black border border-white/5">
          <VideoIcon size={42} className="text-purple-500 mb-4 drop-shadow-xl" />
          <p className="text-[13px] text-white/90 font-medium truncate max-w-[85%] text-center px-3">{image.filename}</p>
        </div>
      ) : isAudio ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-950/30 to-black border border-white/5">
          <AudioIcon size={42} className="text-pink-500 mb-4 drop-shadow-xl" />
          <p className="text-[13px] text-white/90 font-medium truncate max-w-[85%] text-center px-3">{image.filename}</p>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a]">
          <div className="w-6 h-6 rounded-full bg-zinc-800 animate-pulse" />
        </div>
      )}

      {/* Gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent pointer-events-none transition-opacity duration-300 flex flex-col justify-end p-4
        ${hovered || isSelectionMode ? 'opacity-100' : 'opacity-0'}`}>
         
         {/* Hover bottom info */}
         {!isSelectionMode && hovered && (
           <>
             <p className="text-[13px] text-white font-bold truncate drop-shadow-md mb-2">{image.caption || image.filename}</p>
             <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-300 bg-zinc-800/80 backdrop-blur-xl px-2 py-0.5 rounded border border-zinc-700">{mediaType}</span>
                <span className="text-[10px] text-zinc-400 font-bold">{new Date(image.dateScanned || image.dateModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
             </div>
           </>
         )}
      </div>

      {/* Selection checkbox */}
      <div className={`absolute top-3 left-3 z-10 transition-all duration-200
        ${isSelectionMode || hovered || isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
          className={`w-[26px] h-[26px] rounded-full flex items-center justify-center transition-all border
            ${isSelected ? 'bg-blue-600 border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-black/60 border-zinc-500 backdrop-blur-xl hover:bg-black/80'}`}
        >
          {isSelected && <CheckCircle2 size={14} className="text-white" strokeWidth={3} />}
        </button>
      </div>

      {/* Favorite badge — always visible unless quick-action overrides */}
      <div className="absolute top-3 right-3 z-10 transition-opacity duration-200">
        {!hovered || isSelectionMode ? (
          <div className="bg-black/60 backdrop-blur-xl p-2 rounded-full border border-white/5 shadow-md">
            <Heart size={14} fill="#ef4444" className="text-red-500" />
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onUnfavorite() }}
            className="p-2 rounded-full bg-red-900/80 backdrop-blur-xl border border-red-500/50 text-white hover:bg-red-600 hover:scale-105 transition-all shadow-lg"
            title="Remove from favorites"
          >
            <X size={14} strokeWidth={3} />
          </button>
        )}
      </div>
    </div>
  )
})

// ─── HIGH-FIDELITY SLIDESHOW ────────────────────────────────
const Slideshow = memo(({ images, startIndex, onClose }: {
  images: ImageMetadata[]; startIndex: number; onClose: () => void
}) => {
  const [index, setIndex] = useState(startIndex)
  const [isPlaying, setIsPlaying] = useState(true)
  const [showControls, setShowControls] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const controlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const current = images[index]
  const preview = thumbCache.get(current?.id || '')

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => { setIndex(i => (i + 1) % images.length) }, 4000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isPlaying, images.length])

  const resetControlTimer = useCallback(() => {
    setShowControls(true)
    if (controlTimerRef.current) clearTimeout(controlTimerRef.current)
    controlTimerRef.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

  useEffect(() => {
    resetControlTimer()
    return () => { if (controlTimerRef.current) clearTimeout(controlTimerRef.current) }
  }, [resetControlTimer])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      resetControlTimer()
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIndex(i => i > 0 ? i - 1 : images.length - 1)
      if (e.key === 'ArrowRight') setIndex(i => (i + 1) % images.length)
      if (e.key === ' ') { e.preventDefault(); setIsPlaying(p => !p) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, images.length, resetControlTimer])

  if (!current) return null

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center select-none"
      onMouseMove={resetControlTimer}
      onClick={resetControlTimer}
    >
      {/* Blurred background (Cinema Mode) */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 blur-[80px] scale-125 transition-all duration-1000"
          style={{ backgroundImage: `url(${preview || current.path})` }}
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>

      <AnimatePresence mode="wait">
        <motion.img
          key={current.id}
          src={preview || current.path}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-h-[85vh] max-w-[90vw] object-contain z-10 drop-shadow-2xl"
          draggable={false}
        />
      </AnimatePresence>

      {/* Top Header */}
      <motion.div
        animate={{ opacity: showControls ? 1 : 0, y: showControls ? 0 : -20 }}
        className="absolute top-0 inset-x-0 h-24 flex items-center justify-between px-8 z-20"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}
      >
        <div className="flex items-center gap-4">
          <span className="text-[14px] text-white/50 font-bold tabular-nums tracking-widest">{index + 1} / {images.length}</span>
          <span className="text-[14px] text-white/30">|</span>
          <span className="text-[15px] font-bold text-white truncate max-w-[400px] drop-shadow-md">{current.caption || current.filename}</span>
        </div>
        <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-xl border border-white/10">
          <X size={20} strokeWidth={2.5} />
        </button>
      </motion.div>

      {/* Bottom Controls */}
      <motion.div
        animate={{ opacity: showControls ? 1 : 0, y: showControls ? 0 : 20 }}
        className="absolute bottom-12 inset-x-0 flex justify-center items-center gap-6 z-20"
      >
        <button onClick={() => setIndex(i => i > 0 ? i - 1 : images.length - 1)} className="w-12 h-12 rounded-full flex items-center justify-center bg-black/60 hover:bg-black/80 text-white transition-all backdrop-blur-xl border border-white/10 shadow-lg">
          <ChevronLeft size={24} />
        </button>
        <button onClick={() => setIsPlaying(p => !p)} className="w-16 h-16 rounded-full flex items-center justify-center bg-white text-black hover:scale-105 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] active:scale-95">
          {isPlaying ? <Pause size={24} fill="black" /> : <Play size={24} fill="black" className="ml-1" />}
        </button>
        <button onClick={() => setIndex(i => (i + 1) % images.length)} className="w-12 h-12 rounded-full flex items-center justify-center bg-black/60 hover:bg-black/80 text-white transition-all backdrop-blur-xl border border-white/10 shadow-lg">
          <ChevronRight size={24} />
        </button>
      </motion.div>

      {/* Progress bar */}
      <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10 z-20">
        <motion.div
          className="h-full bg-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.8)]"
          animate={{ width: `${((index + 1) / images.length) * 100}%` }}
          transition={{ duration: 0.4, ease: "linear" }}
        />
      </div>
    </motion.div>
  )
})

// ═════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════
export default function FavoritesPage() {
  const { toggleFavorite, moveToTrash, setImages } = useAppStore()
  const rawFavorites = useAppStore(s => s.images.filter(img => img.isFavorite && !img.isDeleted))

  useEffect(() => {
    ;(async () => {
      try {
        // @ts-ignore
        const res = await window.electronAPI?.getImages()
        if (res?.success && Array.isArray(res.images)) setImages(res.images)
      } catch {}
    })()
  }, [setImages])

  const [selectedImage, setSelectedImage] = useState<ImageMetadata | null>(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState(-1)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortOption>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showSlideshow, setShowSlideshow] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  const zoomLevels = [3, 4, 5, 6, 8]
  const [zoomIdx, setZoomIdx] = useState(2)
  const cols = zoomLevels[zoomIdx]

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setShowScrollTop(el.scrollTop > 400)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (selectedIds.size > 0 && !isSelectionMode) setIsSelectionMode(true)
    if (selectedIds.size === 0 && isSelectionMode) setIsSelectionMode(false)
  }, [selectedIds.size])

  useEffect(() => {
    if (!showSortMenu) return
    const close = () => setShowSortMenu(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [showSortMenu])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedImage) setSelectedImage(null)
        else if (selectedIds.size > 0) setSelectedIds(new Set())
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !selectedImage) {
        e.preventDefault()
        setSelectedIds(new Set(sortedFavorites.map(i => i.id)))
      }
      if (e.key === '+' || e.key === '=') setZoomIdx(i => Math.max(0, i - 1))
      if (e.key === '-') setZoomIdx(i => Math.min(zoomLevels.length - 1, i + 1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedImage, selectedIds])

  const sortedFavorites = useMemo(() => {
    return [...rawFavorites].sort((a, b) => {
      let res = 0
      if (sortBy === 'date') res = new Date(b.dateScanned || b.dateModified).getTime() - new Date(a.dateScanned || a.dateModified).getTime()
      else if (sortBy === 'name') res = a.filename.localeCompare(b.filename)
      else if (sortBy === 'size') res = (b.size || 0) - (a.size || 0)
      return sortOrder === 'asc' ? -res : res
    })
  }, [rawFavorites, sortBy, sortOrder])

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const handleBatchAction = useCallback(async (action: 'unfavorite' | 'delete') => {
    for (const id of Array.from(selectedIds)) {
      if (action === 'unfavorite') toggleFavorite(id)
      if (action === 'delete') await moveToTrash(id)
    }
    setSelectedIds(new Set())
  }, [selectedIds, toggleFavorite, moveToTrash])

  const handleUnfavorite = useCallback((id: string) => toggleFavorite(id), [toggleFavorite])

  const scrollToTop = useCallback(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), [])

  // ─── RENDER ───────────────────────────────────────────────
  return (
    <LazyMotion features={domAnimation}>
      <div className="h-screen w-full flex flex-col text-white relative overflow-hidden bg-black selection:bg-blue-500/30">

        {/* ━━━ PRO HEADER ━━━ */}
        <header className="h-[72px] shrink-0 flex items-center justify-between px-6 border-b z-20 bg-black/80 backdrop-blur-2xl border-[#1f1f22]">
          
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-red-900/20 border border-red-500/30 flex items-center justify-center">
               <Heart size={20} fill="#ef4444" className="text-red-500 drop-shadow-md" />
            </div>
            <div>
              <h1 className="text-[17px] font-bold tracking-tight leading-tight">Favorites</h1>
              <p className="text-[12px] font-bold text-zinc-500 tabular-nums">{sortedFavorites.length} Assets Curated</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View tabs */}
            <div className="flex h-10 rounded-xl border border-[#1f1f22] bg-[#0a0a0a] p-1 shadow-sm">
              <button onClick={() => setViewMode('grid')} className={`px-4 flex items-center justify-center rounded-lg transition-all ${viewMode === 'grid' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-white hover:bg-zinc-900'}`} title="Grid View">
                <Grid3X3 size={16} />
              </button>
              <button onClick={() => setViewMode('masonry')} className={`px-4 flex items-center justify-center rounded-lg transition-all ${viewMode === 'masonry' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-white hover:bg-zinc-900'}`} title="Masonry View">
                <LayoutGrid size={16} />
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex h-10 items-center rounded-xl border border-[#1f1f22] bg-[#0a0a0a] p-1 shadow-sm hidden sm:flex">
              <button onClick={() => setZoomIdx(i => Math.min(zoomLevels.length - 1, i + 1))} className="px-2.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors"><ZoomOut size={14} /></button>
              <span className="text-[11px] font-bold text-zinc-400 font-mono w-6 text-center tabular-nums">{cols}</span>
              <button onClick={() => setZoomIdx(i => Math.max(0, i - 1))} className="px-2.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors"><ZoomIn size={14} /></button>
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSortMenu(p => !p) }}
                className={`h-10 px-4 rounded-xl border text-[13px] font-bold flex items-center gap-2 transition-all shadow-sm
                  ${showSortMenu ? 'bg-zinc-800 text-white border-zinc-700' : 'bg-[#0a0a0a] border-[#1f1f22] text-zinc-400 hover:text-white'}`}
              >
                <ArrowUpDown size={14} /> <span className="hidden md:inline capitalize">{sortBy}</span>
              </button>

              <AnimatePresence>
                {showSortMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: .95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: .95 }}
                    transition={{ duration: 0.1 }}
                    className="absolute right-0 top-full mt-2 w-48 rounded-2xl border shadow-2xl z-50 py-1.5 overflow-hidden bg-[#0a0a0a]/95 backdrop-blur-2xl border-zinc-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-500 font-extrabold">Sort By</div>
                    {([
                      { key: 'date', icon: Calendar, label: 'Date' },
                      { key: 'name', icon: FileText, label: 'Name' },
                      { key: 'size', icon: HardDrive, label: 'Size' },
                    ] as const).map(opt => (
                      <button
                        key={opt.key} onClick={() => { setSortBy(opt.key); setShowSortMenu(false) }}
                        className={`w-full text-left px-4 py-2.5 text-[13px] font-bold flex items-center justify-between hover:bg-blue-600/20 hover:text-white transition-colors
                          ${sortBy === opt.key ? 'text-blue-500' : 'text-zinc-300'}`}
                      >
                        <span className="flex items-center gap-3"><opt.icon size={14} /> {opt.label}</span>
                        {sortBy === opt.key && <CheckCircle2 size={14} />}
                      </button>
                    ))}
                    <div className="h-px mx-3 my-1.5 bg-zinc-800" />
                    <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')} className="w-full text-left px-4 py-2.5 text-[13px] font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 flex items-center gap-3 transition-colors">
                      {sortOrder === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />} {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="h-6 w-px bg-[#1f1f22] mx-1 hidden sm:block" />

            {/* Slideshow */}
            {sortedFavorites.length > 0 && (
              <button
                onClick={() => setShowSlideshow(true)}
                className="h-10 px-4 rounded-xl border bg-blue-600 hover:bg-blue-500 border-blue-500 text-white flex items-center gap-2 text-[13px] font-bold transition-all shadow-[0_0_20px_rgba(37,99,235,0.25)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)]"
              >
                <Play size={14} fill="currentColor" /> <span className="hidden md:inline">Present</span>
              </button>
            )}

            {/* Select Toggle */}
            <button
              onClick={() => { setIsSelectionMode(p => !p); setSelectedIds(new Set()) }}
              className={`h-10 w-10 flex items-center justify-center rounded-xl border transition-all shadow-sm
                ${isSelectionMode ? 'bg-white text-black border-white' : 'bg-[#0a0a0a] border-[#1f1f22] text-zinc-400 hover:text-white'}`}
              title="Select Multiple (Ctrl+A)"
            >
              <CheckCircle2 size={18} strokeWidth={isSelectionMode ? 3 : 2} />
            </button>
          </div>
        </header>

        {/* ━━━ CONTENT ━━━ */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth pb-32">
          {sortedFavorites.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="w-28 h-28 rounded-[2rem] bg-[#0a0a0a] border border-[#1f1f22] flex items-center justify-center mb-8 shadow-2xl">
                <Heart size={48} className="text-zinc-700" />
              </div>
              <h2 className="text-2xl font-extrabold text-white mb-3 tracking-tight">No Favorites Yet</h2>
              <p className="text-[15px] text-zinc-500 max-w-sm leading-relaxed">
                Curate your best media here. Tap the heart icon on any photo or video to add it to this collection.
              </p>
            </div>
          ) : (
            <div className="p-6">
              {viewMode === 'grid' ? (
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                  {sortedFavorites.map((img, idx) => (
                    <PhotoCard
                      key={img.id}
                      image={img}
                      viewMode="grid"
                      isSelected={selectedIds.has(img.id)}
                      isSelectionMode={isSelectionMode}
                      onClick={() => { setSelectedImage(img); setSelectedImageIndex(idx) }}
                      onToggleSelect={() => handleToggleSelect(img.id)}
                      onUnfavorite={() => handleUnfavorite(img.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="gap-4" style={{ columns: cols, columnGap: '1rem' }}>
                  {sortedFavorites.map((img, idx) => (
                    <div key={img.id} className="mb-4 break-inside-avoid">
                      <PhotoCard
                        image={img}
                        viewMode="masonry"
                        isSelected={selectedIds.has(img.id)}
                        isSelectionMode={isSelectionMode}
                        onClick={() => { setSelectedImage(img); setSelectedImageIndex(idx) }}
                        onToggleSelect={() => handleToggleSelect(img.id)}
                        onUnfavorite={() => handleUnfavorite(img.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ━━━ MULTI-SELECT BATCH ACTION BAR ━━━ */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="absolute bottom-12 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-4 px-5 py-3 rounded-2xl border shadow-[0_20px_40px_rgba(0,0,0,0.8)] bg-[#0a0a0a]/95 backdrop-blur-2xl border-zinc-700"
            >
              <div className="flex items-center gap-3 border-r pr-4 border-zinc-800">
                <span className="bg-blue-600 text-white text-[13px] font-black px-3 py-1 rounded-lg min-w-[32px] text-center tabular-nums shadow-inner">{selectedIds.size}</span>
                <span className="text-[14px] font-bold text-zinc-300">selected</span>
              </div>

              <div className="flex items-center gap-1">
                <button onClick={() => handleBatchAction('unfavorite')} className="flex items-center gap-2 px-3 py-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-900/20 text-[13px] font-bold transition-colors">
                  <Heart size={16} /> <span className="hidden sm:inline">Unfavorite</span>
                </button>
                <div className="w-px h-6 bg-zinc-800 mx-2" />
                <button onClick={() => handleBatchAction('delete')} className="flex items-center gap-2 px-3 py-2 rounded-xl text-red-500 hover:text-red-400 hover:bg-red-900/30 text-[13px] font-bold transition-colors">
                  <Trash2 size={16} /> <span className="hidden sm:inline">Delete</span>
                </button>
              </div>

              <div className="border-l pl-4 ml-1 border-zinc-800 flex items-center gap-2">
                <button onClick={() => setSelectedIds(new Set(sortedFavorites.map(i => i.id)))} className="text-[11px] font-bold text-zinc-500 hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-all uppercase tracking-wider">All</button>
                <button onClick={() => setSelectedIds(new Set())} className="text-[11px] font-bold text-zinc-500 hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-all uppercase tracking-wider">Clear</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SCROLL TO TOP ── */}
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              onClick={scrollToTop}
              className="fixed bottom-12 right-8 z-[60] w-12 h-12 rounded-full flex items-center justify-center bg-zinc-800/90 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all shadow-2xl backdrop-blur-xl"
            >
              <ChevronUp size={24} strokeWidth={2.5} />
            </motion.button>
          )}
        </AnimatePresence>

        {/* ━━━ MODALS ━━━ */}
        <AnimatePresence>
          {selectedImage && (
            <PhotoViewer
              image={selectedImage}
              imagePreview={thumbCache.get(selectedImage.id)}
              onClose={() => { setSelectedImage(null); setSelectedImageIndex(-1) }}
              onPrevious={() => {
                if (selectedImageIndex > 0) {
                  const prev = sortedFavorites[selectedImageIndex - 1]
                  setSelectedImage(prev); setSelectedImageIndex(i => i - 1)
                }
              }}
              onNext={() => {
                if (selectedImageIndex < sortedFavorites.length - 1) {
                  const next = sortedFavorites[selectedImageIndex + 1]
                  setSelectedImage(next); setSelectedImageIndex(i => i + 1)
                }
              }}
              hasPrevious={selectedImageIndex > 0}
              hasNext={selectedImageIndex < sortedFavorites.length - 1}
              onFavorite={toggleFavorite}
              filmstrip={sortedFavorites.slice(Math.max(0, selectedImageIndex - 10), selectedImageIndex + 10).map(i => ({ id: i.id, preview: thumbCache.get(i.id) }))}
              currentIndex={0} 
              onJumpTo={() => {}} 
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showSlideshow && (
            <Slideshow
              images={sortedFavorites}
              startIndex={0}
              onClose={() => setShowSlideshow(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </LazyMotion>
  )
}