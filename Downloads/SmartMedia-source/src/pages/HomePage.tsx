import { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react'
import { LazyMotion, domAnimation, AnimatePresence, m } from 'framer-motion'
import { Masonry as VirtualMasonry } from 'masonic'
import { useAppStore, ImageMetadata } from '../store/appStore'
import PhotoViewer from '../components/PhotoViewer'
import { useDebounce } from '../hooks/useDebounce'
import {
  Search, Tag, X, Trash2, Image as ImageIcon, Heart, Grid3X3, LayoutGrid,
  FolderSearch, Plus, LayoutTemplate, Check, SortAsc, SortDesc,
  Calendar, FileText, ArrowUpDown, HardDrive, Upload,
  Copy, ExternalLink, Eye, MoreHorizontal, Layers,
  Star, ChevronUp, FolderOpen,
  Video as VideoIcon, Music as AudioIcon, Play, Cpu
} from 'lucide-react'

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   THEME
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const T = {
  bg:       '#050505',
  surface:  '#1c1c1c',
  raised:   '#252525',
  border:   '#2a2a2a',
  accent:   '#0067c0',
  accentH:  '#0076db',
  text:     '#fafafa',
  text2:    '#a1a1aa',
  text3:    '#71717a',
  text4:    '#52525b',
} as const

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HELPERS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const safeParseDate = (s?: string): Date => {
  if (!s) return new Date()
  try {
    if (s.match(/^\d{4}:\d{2}:\d{2}/)) {
      const n = s.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
      const d = new Date(n)
      return isNaN(d.getTime()) ? new Date() : d
    }
    const d = new Date(s)
    return isNaN(d.getTime()) ? new Date() : d
  } catch { return new Date() }
}

const formatDateGroup = (s: string) => {
  const d = safeParseDate(s)
  const diff = Math.ceil(Math.abs(Date.now() - d.getTime()) / 864e5)
  if (diff <= 1) return 'Today'
  if (diff <= 2) return 'Yesterday'
  if (diff <= 7) return 'This Week'
  if (diff <= 30) return 'This Month'
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const fmtSize = (b?: number) => {
  if (!b) return '—'
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB'
  return (b / 1073741824).toFixed(2) + ' GB'
}

const fmtDuration = (sec?: number) => {
  if (!sec) return null
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const resolveMediaType = (img: any): string =>
  img.mediaType || img.media_type || 'image'

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   THUMBNAIL CACHE & LAZY LOADING
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export const thumbCache = new Map<string, string>()
const thumbQueue   = new Set<string>()
const aspectCache  = new Map<string, number>()

function stableAspect(id: string): number {
  if (!aspectCache.has(id)) {
    let h = 0
    for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0
    aspectCache.set(id, 0.72 + (Math.abs(h) % 50) / 100)
  }
  return aspectCache.get(id)!
}

function useLazyThumb(id: string, path: string, meta?: any, eager = false) {
  const [src, setSrc] = useState<string | null>(() => thumbCache.get(id) ?? null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!eager || src || thumbQueue.has(id)) return
    thumbQueue.add(id)
    ;(async () => {
      const c = thumbCache.get(id)
      if (c) { setSrc(c); thumbQueue.delete(id); return }
      try {
        // @ts-ignore
        const p = await window.electronAPI?.getImageThumbnail(path, meta)
        if (p) { thumbCache.set(id, p); setSrc(p) }
      } catch { /* skip */ }
      thumbQueue.delete(id)
    })()
  }, [id, path, meta, eager, src])

  useEffect(() => {
    if (src || eager) return
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      if (thumbQueue.has(id)) return
      thumbQueue.add(id)
      ;(async () => {
        const c = thumbCache.get(id)
        if (c) { setSrc(c); thumbQueue.delete(id); return }
        try {
          // @ts-ignore
          const p = await window.electronAPI?.getImageThumbnail(path, meta)
          if (p) { thumbCache.set(id, p); setSrc(p) }
        } catch { /* skip */ }
        thumbQueue.delete(id)
      })()
    }, { rootMargin: '600px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [id, path, meta, src, eager])

  return { ref, src }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   THUMBNAIL CONTENT RENDERER (shared by both card types)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function ThumbnailContent({
  src, filename, mediaType, duration, hovered, isSelected, isSelectionMode,
}: {
  src: string | null; filename: string; mediaType: string
  duration?: number; hovered: boolean; isSelected: boolean; isSelectionMode: boolean
}) {
  const isVideo = mediaType === 'video'
  const isAudio = mediaType === 'audio'
  const isDoc   = mediaType === 'document'
  const ext = filename?.toLowerCase().split('.').pop() || ''

  /* document colours */
  const docMeta = (() => {
    if (ext === 'pdf')                       return { color: 'text-red-400',  bg: 'from-red-950/40  to-red-900/20' }
    if (['doc','docx'].includes(ext))        return { color: 'text-blue-400', bg: 'from-blue-950/40 to-blue-900/20' }
    if (['xls','xlsx','csv'].includes(ext))  return { color: 'text-green-400',bg: 'from-green-950/40 to-green-900/20' }
    return { color: 'text-zinc-400', bg: 'from-zinc-900/40 to-zinc-800/20' }
  })()

  /* Loaded image / video thumb / audio thumb */
  if (src && (mediaType === 'image' || isVideo || isAudio)) {
    return (
      <>
        <img
          src={src}
          alt={filename}
          className={`w-full h-full object-cover transition-transform duration-500 ease-out will-change-transform
            ${hovered && !isSelectionMode ? 'scale-[1.03]' : 'scale-100'}
            ${isSelected ? 'brightness-[.55]' : ''}`}
          loading="lazy" decoding="async" draggable={false}
          style={{ backfaceVisibility: 'hidden' }}
        />
        {/* media‑type badge */}
        {(isVideo || isAudio) && (
          <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 rounded-md bg-black/60 backdrop-blur-sm px-2 py-0.5">
            {isVideo ? <VideoIcon size={12} className="text-white/90" /> : <AudioIcon size={12} className="text-white/90" />}
            {duration != null && <span className="text-[10px] text-white/80 font-medium tabular-nums">{fmtDuration(duration)}</span>}
          </div>
        )}
        {/* centred play icon for video */}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
            <div className={`w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center transition-transform duration-200 ${hovered ? 'scale-110' : 'scale-100'}`}>
              <Play size={18} className="text-white ml-0.5" fill="white" />
            </div>
          </div>
        )}
      </>
    )
  }

  /* Document placeholder */
  if (isDoc) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${docMeta.bg}`}>
        <FileText size={36} className={`${docMeta.color} mb-2 opacity-80`} />
        <p className="text-[11px] text-white/60 font-medium truncate max-w-[85%] text-center">{filename}</p>
        <span className="mt-1 text-[9px] uppercase tracking-wider text-white/30 font-semibold">{ext}</span>
      </div>
    )
  }

  /* Video without thumb */
  if (isVideo) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-950/30 to-indigo-950/30">
        <VideoIcon size={36} className="text-purple-400/80 mb-2" />
        <p className="text-[11px] text-white/50 font-medium truncate max-w-[85%] text-center">{filename}</p>
        {duration != null && <span className="mt-1 text-[10px] text-white/30 tabular-nums">{fmtDuration(duration)}</span>}
      </div>
    )
  }

  /* Audio without thumb */
  if (isAudio) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-950/30 to-orange-950/30">
        <AudioIcon size={36} className="text-pink-400/80 mb-2" />
        <p className="text-[11px] text-white/50 font-medium truncate max-w-[85%] text-center">{filename}</p>
        {duration != null && <span className="mt-1 text-[10px] text-white/30 tabular-nums">{fmtDuration(duration)}</span>}
      </div>
    )
  }

  /* Skeleton */
  return <div className="w-full h-full bg-zinc-900 animate-pulse" />
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MASONRY CARD
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const MasonryCard = memo(({ data, width }: { data: any; width: number }) => {
  if (!data?.id) return <div />

  const {
    _onFavorite, _onSetBanner, _onClick, _onContextMenu,
    _isSelectionMode, _selectedIds, _onToggleSelect, _index,
    ...image
  } = data

  const { ref, src } = useLazyThumb(image.id, image.path, image.metadata)
  const [hovered, setHovered] = useState(false)
  const isSelected = _selectedIds.has(image.id)
  const cardH = Math.round(width * stableAspect(image.id))
  const mt = resolveMediaType(image)

  return (
    <div
      ref={ref}
      className={`relative group rounded-xl overflow-hidden cursor-pointer select-none transition-all duration-200
        ${isSelected
          ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[#09090b]'
          : 'ring-1 ring-transparent hover:ring-white/10'}`}
      style={{ height: cardH, background: T.surface }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={e => { e.preventDefault(); _onContextMenu(e, image) }}
      onClick={e => _isSelectionMode ? (e.stopPropagation(), _onToggleSelect(image.id)) : _onClick(image, _index)}
    >
      <ThumbnailContent
        src={src} filename={image.filename} mediaType={mt}
        duration={image.duration} hovered={hovered}
        isSelected={isSelected} isSelectionMode={_isSelectionMode}
      />

      {/* gradient overlay */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent
          pointer-events-none transition-opacity duration-200
          ${hovered || _isSelectionMode ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* selection checkbox */}
      <div className={`absolute top-2.5 left-2.5 z-20 transition-all duration-150
        ${_isSelectionMode || hovered || isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'}`}>
        <button
          onClick={e => { e.stopPropagation(); _onToggleSelect(image.id) }}
          className={`w-[22px] h-[22px] rounded-md flex items-center justify-center transition-all
            ${isSelected
              ? 'bg-blue-500 shadow-lg shadow-blue-500/30'
              : 'bg-black/40 border border-white/30 backdrop-blur-sm'}`}
        >
          {isSelected && <Check size={13} className="text-white" strokeWidth={3} />}
        </button>
      </div>

      {/* favourite badge (when not hovered) */}
      {image.isFavorite && !hovered && (
        <div className="absolute top-2.5 right-2.5 z-10">
          <Heart size={13} fill="#ef4444" className="text-red-500 drop-shadow" />
        </div>
      )}

      {/* hover info bar */}
      {!_isSelectionMode && (
        <div className={`absolute bottom-0 inset-x-0 px-3 pb-2.5 pt-6 z-10 transition-all duration-200
          ${hovered ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0 pointer-events-none'}`}>
          <p className="text-[13px] text-white font-medium truncate mb-1.5 leading-tight drop-shadow">
            {image.caption || image.filename}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-white/50 bg-white/10 backdrop-blur px-1.5 py-[1px] rounded">
                {mt}
              </span>
              {image.size != null && (
                <span className="text-[10px] text-white/40 tabular-nums">{fmtSize(image.size)}</span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={e => { e.stopPropagation(); _onFavorite(image.id) }}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/60 hover:text-white transition-colors"
              >
                <Heart size={13} fill={image.isFavorite ? '#ef4444' : 'none'} className={image.isFavorite ? 'text-red-500' : ''} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); _onSetBanner(image) }}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/60 hover:text-white transition-colors"
                title="Set as banner"
              >
                <LayoutTemplate size={13} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); _onContextMenu(e, image) }}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/60 hover:text-white transition-colors"
              >
                <MoreHorizontal size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GRID CARD
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const GridCard = memo(({
  image, isSelectionMode, isSelected, onFavorite, onSetBanner, onClick, onContextMenu, onToggleSelect,
}: {
  image: ImageMetadata; isSelectionMode: boolean; isSelected: boolean
  onFavorite: (id: string) => void; onSetBanner: (i: ImageMetadata) => void
  onClick: (i: ImageMetadata) => void; onContextMenu: (e: React.MouseEvent, i: ImageMetadata) => void
  onToggleSelect: (id: string) => void
}) => {
  const { ref, src } = useLazyThumb(image.id, image.path, image.metadata)
  const [hovered, setHovered] = useState(false)
  const mt = resolveMediaType(image)

  return (
    <div
      ref={ref}
      className={`relative group rounded-xl overflow-hidden cursor-pointer select-none aspect-[4/5] transition-all duration-200
        ${isSelected
          ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[#09090b]'
          : 'ring-1 ring-transparent hover:ring-white/10'}`}
      style={{ background: T.surface }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e, image) }}
      onClick={() => isSelectionMode ? onToggleSelect(image.id) : onClick(image)}
    >
      <ThumbnailContent
        src={src} filename={image.filename} mediaType={mt}
        duration={image.duration} hovered={hovered}
        isSelected={isSelected} isSelectionMode={isSelectionMode}
      />

      <div className={`absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent pointer-events-none transition-opacity duration-200
        ${hovered || isSelectionMode ? 'opacity-100' : 'opacity-0'}`} />

      <div className={`absolute top-2.5 left-2.5 z-20 transition-all duration-150
        ${isSelectionMode || hovered || isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'}`}>
        <button
          onClick={e => { e.stopPropagation(); onToggleSelect(image.id) }}
          className={`w-[22px] h-[22px] rounded-md flex items-center justify-center transition-all
            ${isSelected ? 'bg-blue-500 shadow-lg shadow-blue-500/30' : 'bg-black/40 border border-white/30 backdrop-blur-sm'}`}
        >
          {isSelected && <Check size={13} className="text-white" strokeWidth={3} />}
        </button>
      </div>

      {image.isFavorite && !hovered && (
        <div className="absolute top-2.5 right-2.5 z-10">
          <Heart size={13} fill="#ef4444" className="text-red-500" />
        </div>
      )}

      {!isSelectionMode && (
        <div className={`absolute bottom-0 inset-x-0 px-3 pb-2.5 pt-5 z-10 transition-all duration-200
          ${hovered ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0 pointer-events-none'}`}>
          <p className="text-[12px] text-white font-medium truncate mb-1 leading-tight">{image.caption || image.filename}</p>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-white/50 bg-white/10 backdrop-blur px-1.5 py-[1px] rounded">
              {mt}
            </span>
            <div className="flex gap-0.5">
              <button onClick={e => { e.stopPropagation(); onFavorite(image.id) }} className="p-1 rounded-lg hover:bg-white/15 text-white/60 transition-colors">
                <Heart size={12} fill={image.isFavorite ? '#ef4444' : 'none'} className={image.isFavorite ? 'text-red-500' : ''} />
              </button>
              <button onClick={e => { e.stopPropagation(); onSetBanner(image) }} className="p-1 rounded-lg hover:bg-white/15 text-white/60 transition-colors">
                <LayoutTemplate size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MAIN  —  HomePage
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function HomePage() {
  const {
    images, searchQuery, setSearchQuery, selectedTags, setSelectedTags,
    moveToTrash, setDiscoveredImages, setScanProgress,
    toggleFavorite, setCurrentScreen, setImages,
  } = useAppStore()

  /* ── Python engine status ── */
  const [engineStatus, setEngineStatus] = useState<'starting' | 'ready' | 'hidden'>('starting')
  useEffect(() => {
    // Check immediately in case Python was already ready before this page mounted
    // @ts-ignore
    window.electronAPI?.getPythonStatus?.().then((s: any) => {
      if (s?.ready) setEngineStatus('ready')
    }).catch(() => {})

    // @ts-ignore
    const unsubscribe = window.electronAPI?.onPythonReady?.((data: any) => {
      if (data?.ready) setEngineStatus('ready')
    })
    return () => unsubscribe?.()
  }, [])

  // Auto-hide "ready" badge after 4 seconds
  useEffect(() => {
    if (engineStatus !== 'ready') return
    const t = setTimeout(() => setEngineStatus('hidden'), 4000)
    return () => clearTimeout(t)
  }, [engineStatus])

  /* ── initial load ── */
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        // @ts-ignore
        const res = await window.electronAPI?.getImages()
        if (!dead && res?.success && Array.isArray(res.images)) {
          setImages(res.images)
          const vis = res.images.slice(0, 40).filter((i: any) => i?.id && !thumbCache.has(i.id))
          for (let i = 0; i < vis.length; i += 3) {
            if (dead) break
            await Promise.all(
              vis.slice(i, i + 3).map(async (img: any) => {
                try {
                  // @ts-ignore
                  const p = await window.electronAPI?.getImageThumbnail(img.path, img.metadata)
                  if (p && !dead) thumbCache.set(img.id, p)
                } catch { /* skip */ }
              })
            )
            await new Promise(r => setTimeout(r, 50))
          }
        }
      } catch (e) { console.error('[HomePage] Load failed:', e) }
    })()
    return () => { dead = true }
  }, [setImages])

  /* ── queue processing refresh ── */
  useEffect(() => {
    let timer: NodeJS.Timeout
    // @ts-ignore
    const rm = window.electronAPI?.onQueueResult?.((r: any) => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        try {
          // @ts-ignore
          const res = await window.electronAPI?.getImages()
          if (res?.success && Array.isArray(res.images)) setImages(res.images)
        } catch { /* skip */ }
      }, 500)
    })
    return () => { clearTimeout(timer); rm?.() }
  }, [setImages])

  /* ── state ── */
  const [selectedImage, setSelectedImage]       = useState<ImageMetadata | null>(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState(-1)
  const [searchInput, setSearchInput]           = useState('')
  const [contextMenu, setContextMenu]           = useState<{ x: number; y: number; image: ImageMetadata } | null>(null)
  const [viewMode, setViewMode]                 = useState<'masonry' | 'grid'>(() => (localStorage.getItem('gallery_viewMode') as any) || 'masonry')
  const [groupBy, setGroupBy]                   = useState<'none' | 'date'>('none')
  const [sortBy, setSortBy]                     = useState<'date' | 'name' | 'size'>('date')
  const [sortOrder, setSortOrder]               = useState<'asc' | 'desc'>('desc')
  const [mediaTypeFilter, setMediaTypeFilter]   = useState<'all' | 'image' | 'video' | 'audio' | 'document'>('all')
  const [customBanner, setCustomBanner]         = useState<string | null>(localStorage.getItem('gallery_banner'))
  const [isSelectionMode, setIsSelectionMode]   = useState(false)
  const [selectedIds, setSelectedIds]           = useState<Set<string>>(new Set())
  const [showSortMenu, setShowSortMenu]         = useState(false)
  const [isDragOver, setIsDragOver]             = useState(false)
  const [showScrollTop, setShowScrollTop]       = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const debouncedSearch = useDebounce(searchInput, 300)
  const filteredRef = useRef<ImageMetadata[]>([])

  /* ── side‑effects ── */
  useEffect(() => localStorage.setItem('gallery_viewMode', viewMode), [viewMode])
  useEffect(() => setSearchQuery(debouncedSearch), [debouncedSearch])
  useEffect(() => {
    if (selectedIds.size > 0 && !isSelectionMode)  setIsSelectionMode(true)
    if (selectedIds.size === 0 && isSelectionMode) setIsSelectionMode(false)
  }, [selectedIds.size])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true) }
  }, [contextMenu])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const fn = () => setShowScrollTop(el.scrollTop > 400)
    el.addEventListener('scroll', fn, { passive: true })
    return () => el.removeEventListener('scroll', fn)
  }, [])

  /* ── keyboard ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedImage) { setSelectedImage(null); setSelectedImageIndex(-1) }
        else if (selectedIds.size > 0) setSelectedIds(new Set())
        else if (contextMenu) setContextMenu(null)
        else if (mediaTypeFilter !== 'all') setMediaTypeFilter('all')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !selectedImage) {
        e.preventDefault()
        setSelectedIds(new Set(filteredRef.current.map(i => i.id)))
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault(); setCurrentScreen('search')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedImage, selectedIds, contextMenu, mediaTypeFilter])

  /* ── filtering + sorting ── */
  const filteredImages = useMemo(() => {
    let r = images

    if (mediaTypeFilter !== 'all') {
      r = r.filter(i => resolveMediaType(i) === mediaTypeFilter)
    }
    if (searchQuery || selectedTags.length > 0) {
      const q = searchQuery.toLowerCase()
      r = r.filter(i => {
        const mq = !q
          || i.caption?.toLowerCase().includes(q)
          || i.tags?.some(t => t.toLowerCase().includes(q))
          || i.filename?.toLowerCase().includes(q)
          || i.metadata?.album_category?.toLowerCase().includes(q)
          || i.objects?.some((o: string) => o.toLowerCase().includes(q))
          || i.extractedText?.toLowerCase().includes(q)
          || i.metadata?.extracted_text?.toLowerCase().includes(q)
        const mt = selectedTags.length === 0 || selectedTags.every(tag => i.tags.includes(tag))
        return mq && mt
      })
    }

    const sorted = [...r].sort((a, b) => {
      let vA: any, vB: any
      if (sortBy === 'date')      { vA = a.dateModified; vB = b.dateModified }
      else if (sortBy === 'name') { vA = a.filename;     vB = b.filename }
      else                        { vA = a.size || 0;    vB = b.size || 0 }
      return vA < vB ? (sortOrder === 'asc' ? -1 : 1) : vA > vB ? (sortOrder === 'asc' ? 1 : -1) : 0
    })
    filteredRef.current = sorted
    return sorted
  }, [images, searchQuery, selectedTags, mediaTypeFilter, sortBy, sortOrder])

  const groupedImages = useMemo(() => {
    if (groupBy === 'none') return { All: filteredImages }
    const g: Record<string, ImageMetadata[]> = {}
    filteredImages.forEach(i => { const k = formatDateGroup(i.dateModified); (g[k] ??= []).push(i) })
    return g
  }, [filteredImages, groupBy])

  /* ── callbacks ── */
  const handleFavorite     = useCallback((id: string) => toggleFavorite(id), [toggleFavorite])
  const handleSetBanner    = useCallback((img: ImageMetadata) => {
    const p = thumbCache.get(img.id)
    if (p) { setCustomBanner(p); localStorage.setItem('gallery_banner', p) }
  }, [])
  const handleCardClick    = useCallback((img: ImageMetadata, idx: number) => { setSelectedImage(img); setSelectedImageIndex(idx) }, [])
  const handleContextMenu  = useCallback((e: React.MouseEvent, image: ImageMetadata) => {
    e.preventDefault(); e.stopPropagation()
    setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 320), image })
  }, [])
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const handleDragDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/'))
    if (files.length) {
      setDiscoveredImages(files.map(f => (f as any).path))
      setScanProgress({ status: 'scanning', total: files.length, current: 0 })
      setCurrentScreen('scanning')
    }
  }, [setDiscoveredImages, setScanProgress, setCurrentScreen])

  const scrollToTop = useCallback(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), [])

  /* ── masonry items ── */
  const masonryItems = useMemo(() => {
    if (!filteredImages.length) return []
    return filteredImages
      .filter(i => i?.id && typeof i.id === 'string')
      .map((img, i) => ({
        ...img,
        _onFavorite: handleFavorite,
        _onSetBanner: handleSetBanner,
        _onClick: handleCardClick,
        _onContextMenu: handleContextMenu,
        _isSelectionMode: isSelectionMode,
        _selectedIds: selectedIds,
        _onToggleSelect: handleToggleSelect,
        _index: i,
      }))
  }, [filteredImages, handleFavorite, handleSetBanner, handleCardClick, handleContextMenu, isSelectionMode, selectedIds, handleToggleSelect])

  /* ── stats ── */
  const stats = useMemo(() => ({
    total: images.length,
    favorites: images.filter(i => i.isFavorite).length,
    totalSize: images.reduce((a, i) => a + (i.size || 0), 0),
    tags: new Set(images.flatMap(i => i.tags || [])).size,
    categories: new Set(images.map(i => i.metadata?.album_category).filter(Boolean)).size,
    images:    images.filter(i => resolveMediaType(i) === 'image').length,
    videos:    images.filter(i => resolveMediaType(i) === 'video').length,
    audios:    images.filter(i => resolveMediaType(i) === 'audio').length,
    documents: images.filter(i => resolveMediaType(i) === 'document').length,
  }), [images])

  /* sort‑options data */
  const sortOptions: { key: 'date' | 'name' | 'size'; label: string; icon: React.ReactNode }[] = [
    { key: 'date', label: 'Date modified', icon: <Calendar size={14} /> },
    { key: 'name', label: 'File name',     icon: <FileText size={14} /> },
    { key: 'size', label: 'File size',     icon: <HardDrive size={14} /> },
  ]

  /* media‑type pills data */
  const mediaPills: { key: typeof mediaTypeFilter; label: string; count: number }[] = [
    { key: 'all',      label: 'All',       count: stats.total },
    { key: 'image',    label: 'Images',    count: stats.images },
    { key: 'video',    label: 'Videos',    count: stats.videos },
    { key: 'audio',    label: 'Audio',     count: stats.audios },
    { key: 'document', label: 'Documents', count: stats.documents },
  ]

  /* ━━━━━━━━━━━━━ RENDER ━━━━━━━━━━━━━ */
  return (
    <LazyMotion features={domAnimation}>
      <div
        className="h-full w-full flex flex-col relative text-white font-sans overflow-hidden min-w-0"
        style={{ background: T.bg }}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDragDrop}
      >
        {/* ── DRAG OVERLAY ── */}
        <AnimatePresence>
          {isDragOver && (
            <m.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            >
              <div className="border-2 border-dashed border-blue-500/60 rounded-2xl p-16 text-center">
                <Upload size={40} className="text-blue-400 mx-auto mb-4" />
                <p className="text-lg font-semibold text-white">Drop files to import</p>
                <p className="text-sm text-zinc-400 mt-1">Supported: images, videos, audio</p>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* ━━━ HEADER ━━━ */}
        <header className="border-b shrink-0 z-40" style={{ borderColor: T.border, background: T.bg }}>

          {/* ── Python engine status banner ── */}
          <AnimatePresence>
            {engineStatus !== 'hidden' && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className={`flex items-center gap-2 px-4 py-1.5 text-[12px] font-medium border-b
                  ${engineStatus === 'ready'
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40'
                    : 'bg-amber-950/40 text-amber-400 border-amber-900/40'}`}
                >
                  {engineStatus === 'ready' ? (
                    <>
                      <Cpu size={12} className="shrink-0" />
                      AI Engine ready
                    </>
                  ) : (
                    <>
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                      AI Engine starting…
                    </>
                  )}
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* ── Row 1: Search + Controls ── */}
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 h-[52px]">

            {/* Title — desktop only */}
            <h1 className="hidden lg:block text-[15px] font-semibold text-white tracking-tight shrink-0 mr-1 select-none">
              Library
            </h1>

            {/* Search */}
            <button
              onClick={() => setCurrentScreen('search')}
              className="flex items-center h-[34px] px-3 rounded-lg border flex-1 max-w-md min-w-0 transition-colors hover:border-zinc-600 group"
              style={{ borderColor: T.border, background: T.surface }}
            >
              <Search size={14} className="text-zinc-500 mr-2 shrink-0 group-hover:text-zinc-400 transition-colors" />
              <span className="text-[13px] text-zinc-500 truncate text-left flex-1">Search assets…</span>
              <kbd className="hidden md:flex items-center text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 ml-2 shrink-0 font-mono">
                ⌘K
              </kbd>
            </button>

            {/* Spacer */}
            <div className="flex-1 hidden xl:block" />

            {/* Controls */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">

              {/* Sort dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu(p => !p)}
                  className={`h-[34px] px-2 sm:px-2.5 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 transition-all
                    ${showSortMenu ? 'bg-zinc-800 text-white border-zinc-600' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
                  style={!showSortMenu ? { borderColor: T.border, background: T.surface } : undefined}
                >
                  <ArrowUpDown size={13} />
                  <span className="hidden sm:inline">Sort</span>
                </button>
                <AnimatePresence>
                  {showSortMenu && (
                    <m.div
                      initial={{ opacity: 0, y: -4, scale: .97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: .97 }}
                      transition={{ duration: .12 }}
                      className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border shadow-2xl shadow-black/60 z-50 py-1 text-[13px] overflow-hidden"
                      style={{ background: T.surface, borderColor: T.border }}
                      onMouseLeave={() => setShowSortMenu(false)}
                    >
                      <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-zinc-500 font-semibold select-none">
                        Sort by
                      </div>
                      {sortOptions.map(s => (
                        <button
                          key={s.key}
                          onClick={() => { setSortBy(s.key); setShowSortMenu(false) }}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-zinc-800 transition-colors
                            ${sortBy === s.key ? 'text-blue-400' : 'text-zinc-300'}`}
                        >
                          <span className="flex items-center gap-2.5">{s.icon}{s.label}</span>
                          {sortBy === s.key && <Check size={13} />}
                        </button>
                      ))}
                      <div className="border-t my-1 mx-2" style={{ borderColor: T.border }} />
                      <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-zinc-500 font-semibold select-none">
                        Direction
                      </div>
                      <button
                        onClick={() => { setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); setShowSortMenu(false) }}
                        className="w-full text-left px-3 py-2 text-zinc-300 hover:bg-zinc-800 flex items-center gap-2.5 transition-colors"
                      >
                        {sortOrder === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />}
                        {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                      </button>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>

              {/* View toggle */}
              <div className="flex h-[34px] rounded-lg border overflow-hidden" style={{ background: T.surface, borderColor: T.border }}>
                {([
                  { key: 'masonry' as const, icon: <LayoutGrid size={14} />, label: 'Masonry' },
                  { key: 'grid'    as const, icon: <Grid3X3 size={14} />,    label: 'Grid' },
                ] as const).map(v => (
                  <button
                    key={v.key}
                    onClick={() => setViewMode(v.key)}
                    className={`px-2.5 flex items-center gap-1.5 text-[12px] font-medium transition-colors
                      ${viewMode === v.key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'}`}
                    title={v.label}
                  >
                    {v.icon}
                    <span className="hidden xl:inline">{v.label}</span>
                  </button>
                ))}
              </div>

              {/* Group by date */}
              <button
                onClick={() => setGroupBy(p => p === 'none' ? 'date' : 'none')}
                className={`h-[34px] px-2 sm:px-2.5 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 transition-all
                  ${groupBy === 'date'
                    ? 'bg-blue-600/15 text-blue-400 border-blue-500/30'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'}`}
                style={groupBy !== 'date' ? { borderColor: T.border, background: T.surface } : undefined}
                title="Group by date"
              >
                <Layers size={13} />
                <span className="hidden sm:inline">Group</span>
              </button>

              {/* Select all */}
              <button
                onClick={() => selectedIds.size === filteredImages.length
                  ? setSelectedIds(new Set())
                  : setSelectedIds(new Set(filteredImages.map(i => i.id)))}
                className="h-[34px] px-2 rounded-lg border text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-all hidden sm:flex items-center gap-1.5 text-[12px] font-medium"
                style={{ borderColor: T.border, background: T.surface }}
                title="Select all  (Ctrl+A)"
              >
                <Check size={13} />
                <span className="hidden xl:inline">Select</span>
              </button>

              <div className="h-5 w-px bg-zinc-800 mx-0.5 shrink-0" />

              {/* Upload */}
              <button
                onClick={() => document.getElementById('file-upload')?.click()}
                className="h-[34px] flex items-center gap-2 px-3 sm:px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[13px] font-medium transition-all active:scale-[.97] shadow-sm shadow-blue-600/20"
              >
                <Plus size={15} strokeWidth={2.5} />
                <span className="hidden sm:inline">Upload</span>
              </button>
              <input
                id="file-upload" type="file" multiple className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md,.log,.csv,.rtf"
                onChange={e => {
                  const f = Array.from(e.target.files || []).map(f => (f as any).path)
                  if (f.length) {
                    setDiscoveredImages(f)
                    setScanProgress({ status: 'scanning', total: f.length, current: 0 })
                    setCurrentScreen('scanning')
                  }
                }}
              />
            </div>
          </div>

          {/* ── Row 2: Media‑type pills + summary ── */}
          <div className="flex items-center justify-between gap-3 px-3 sm:px-5 pb-2.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>

            {/* Pills */}
            <div className="flex items-center gap-0.5 p-[3px] rounded-lg border shrink-0" style={{ background: T.surface, borderColor: T.border }}>
              {mediaPills.filter(p => p.key === 'all' || p.count > 0).map(p => (
                <button
                  key={p.key}
                  onClick={() => setMediaTypeFilter(p.key)}
                  className={`px-2.5 py-[5px] rounded-md text-[12px] font-medium transition-all flex items-center gap-1.5 whitespace-nowrap
                    ${mediaTypeFilter === p.key
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[.04]'}`}
                >
                  {p.label}
                  <span className={`tabular-nums text-[11px] ${mediaTypeFilter === p.key ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    {p.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Summary */}
            <div className="hidden sm:flex items-center gap-3 shrink-0 select-none">
              {stats.favorites > 0 && (
                <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <Heart size={11} className="text-red-400/70" />
                  <span className="tabular-nums">{stats.favorites}</span>
                  favourites
                </span>
              )}
              <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <HardDrive size={11} className="text-zinc-600" />
                {fmtSize(stats.totalSize)}
              </span>
              {stats.tags > 0 && (
                <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <Tag size={11} className="text-zinc-600" />
                  <span className="tabular-nums">{stats.tags}</span>
                  tags
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ━━━ SCROLLABLE MAIN ━━━ */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth min-w-0 w-full"
          style={{ scrollbarWidth: 'thin', scrollbarColor: `${T.border} transparent` }}
        >
          <div className="px-3 sm:px-5 pt-4 pb-28">

            {/* Active tags */}
            {selectedTags.length > 0 && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-xs text-zinc-500 font-medium">Filtered by:</span>
                {selectedTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTags(selectedTags.filter(t => t !== tag))}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-blue-600/10 text-blue-300 border border-blue-500/20 hover:bg-blue-600/20 transition-colors"
                  >
                    <Tag size={10} /> {tag} <X size={10} className="ml-0.5 opacity-60" />
                  </button>
                ))}
                <button
                  onClick={() => setSelectedTags([])}
                  className="text-xs text-zinc-600 hover:text-white ml-1 transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Results count bar */}
            {(searchQuery || mediaTypeFilter !== 'all') && (
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] text-zinc-500">
                  <span className="text-white font-semibold tabular-nums">{filteredImages.length}</span>
                  {' '}{filteredImages.length === 1 ? 'result' : 'results'}
                  {searchQuery && <span className="text-zinc-400"> for "<span className="text-white">{searchQuery}</span>"</span>}
                </p>
                <div className="flex items-center gap-2">
                  {mediaTypeFilter !== 'all' && (
                    <button
                      onClick={() => setMediaTypeFilter('all')}
                      className="text-[11px] text-zinc-500 hover:text-white flex items-center gap-1 px-2 py-1 rounded-md hover:bg-zinc-800 transition-all"
                    >
                      <X size={11} /> Clear filter
                    </button>
                  )}
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchInput(''); setSearchQuery('') }}
                      className="text-[11px] text-zinc-500 hover:text-white flex items-center gap-1 px-2 py-1 rounded-md hover:bg-zinc-800 transition-all"
                    >
                      <X size={11} /> Clear search
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── CONTENT ── */}
            {images.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-zinc-700/60 flex items-center justify-center mb-6">
                  <FolderSearch size={32} className="text-zinc-700" />
                </div>
                <h2 className="text-lg font-semibold text-zinc-300 mb-2">No assets yet</h2>
                <p className="text-sm text-zinc-600 mb-8 max-w-xs leading-relaxed">
                  Drag & drop files here or click below to start building your media library.
                </p>
                <button
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium active:scale-[.97] transition-all shadow-lg shadow-blue-600/20"
                >
                  <Upload size={16} /> Upload Files
                </button>
              </div>
            ) : filteredImages.length === 0 ? (
              /* No results */
              <div className="flex flex-col items-center justify-center py-28 text-center">
                <Search size={28} className="text-zinc-700 mb-4" />
                <h2 className="text-base font-semibold text-zinc-400 mb-1">No matching assets</h2>
                <p className="text-sm text-zinc-600">Try adjusting your search or filters.</p>
              </div>
            ) : (
              /* Asset grid */
              Object.entries(groupedImages).map(([groupName, groupItems]) => {
                if (!groupItems.length) return null

                const groupMasonry = groupBy === 'none' ? masonryItems : groupItems
                  .filter(i => i?.id && typeof i.id === 'string')
                  .map((img, i) => ({
                    ...img,
                    _onFavorite: handleFavorite,
                    _onSetBanner: handleSetBanner,
                    _onClick: handleCardClick,
                    _onContextMenu: handleContextMenu,
                    _isSelectionMode: isSelectionMode,
                    _selectedIds: selectedIds,
                    _onToggleSelect: handleToggleSelect,
                    _index: filteredImages.indexOf(img),
                  }))

                return (
                  <div key={groupName} className="mb-6">
                    {groupBy !== 'none' && (
                      <div
                        className="flex items-center gap-3 mb-3 sticky top-0 z-30 py-2.5 -mx-3 sm:-mx-5 px-3 sm:px-5 backdrop-blur-md border-b"
                        style={{ background: `${T.bg}e8`, borderColor: `${T.border}80` }}
                      >
                        <Calendar size={13} className="text-zinc-500 shrink-0" />
                        <h3 className="text-[14px] font-semibold text-white">{groupName}</h3>
                        <span
                          className="text-[11px] text-zinc-500 tabular-nums px-2 py-0.5 rounded-full border"
                          style={{ background: T.surface, borderColor: T.border }}
                        >
                          {groupItems.length}
                        </span>
                      </div>
                    )}

                    {viewMode === 'masonry' ? (
                      <VirtualMasonry
                        key={`${groupName}-${groupMasonry.length}`}
                        items={groupMasonry}
                        render={MasonryCard}
                        columnWidth={240}
                        columnGutter={8}
                        rowGutter={8}
                        overscanBy={4}
                        itemKey={(d: any) => d.id}
                      />
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2">
                        {groupItems.map(img => (
                          <GridCard
                            key={img.id}
                            image={img}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedIds.has(img.id)}
                            onFavorite={handleFavorite}
                            onSetBanner={handleSetBanner}
                            onClick={i => handleCardClick(i, filteredImages.indexOf(i))}
                            onContextMenu={handleContextMenu}
                            onToggleSelect={handleToggleSelect}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── SCROLL TO TOP ── */}
        <AnimatePresence>
          {showScrollTop && (
            <m.button
              initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .8 }}
              onClick={scrollToTop}
              className="fixed bottom-20 right-6 z-40 w-10 h-10 rounded-full bg-zinc-800/90 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all shadow-xl shadow-black/40 backdrop-blur-sm"
            >
              <ChevronUp size={18} />
            </m.button>
          )}
        </AnimatePresence>

        {/* ━━━ BATCH ACTION BAR ━━━ */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <m.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2 flex items-center gap-3 z-50 border shadow-2xl shadow-black/50 backdrop-blur-xl"
              style={{ background: `${T.surface}f0`, borderColor: T.border }}
            >
              <div className="flex items-center gap-2 border-r pr-3" style={{ borderColor: T.border }}>
                <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[22px] text-center tabular-nums">
                  {selectedIds.size}
                </span>
                <span className="text-[13px] font-medium text-zinc-300 whitespace-nowrap">selected</span>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => { selectedIds.forEach(id => toggleFavorite(id)); setSelectedIds(new Set()) }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 text-[12px] font-medium transition-colors"
                >
                  <Heart size={14} /> <span className="hidden sm:inline">Favourite</span>
                </button>
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 text-[12px] font-medium transition-colors">
                  <ExternalLink size={14} /> <span className="hidden sm:inline">Export</span>
                </button>
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 text-[12px] font-medium transition-colors">
                  <Copy size={14} /> <span className="hidden sm:inline">Copy</span>
                </button>
                <div className="w-px h-5 bg-zinc-700 mx-1" />
                <button
                  onClick={async () => { for (const id of Array.from(selectedIds)) await moveToTrash(id); setSelectedIds(new Set()) }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-900/20 text-[12px] font-medium transition-colors"
                >
                  <Trash2 size={14} /> <span className="hidden sm:inline">Delete</span>
                </button>
              </div>
              <div className="border-l pl-3 ml-1" style={{ borderColor: T.border }}>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[11px] font-medium text-zinc-500 hover:text-white px-2 py-1 rounded-lg hover:bg-zinc-800 transition-all"
                >
                  Cancel
                </button>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* ━━━ PHOTO VIEWER ━━━ */}
        <AnimatePresence>
          {selectedImage && (
            <PhotoViewer
              image={selectedImage}
              imagePreview={thumbCache.get(selectedImage.id)}
              onClose={() => { setSelectedImage(null); setSelectedImageIndex(-1) }}
              onPrevious={() => { if (selectedImageIndex > 0) { setSelectedImage(filteredImages[selectedImageIndex - 1]); setSelectedImageIndex(i => i - 1) } }}
              onNext={() => { if (selectedImageIndex < filteredImages.length - 1) { setSelectedImage(filteredImages[selectedImageIndex + 1]); setSelectedImageIndex(i => i + 1) } }}
              hasPrevious={selectedImageIndex > 0}
              hasNext={selectedImageIndex < filteredImages.length - 1}
              onFavorite={handleFavorite}
              filmstrip={filteredImages.slice(0, 200).map(i => ({ id: i.id, preview: thumbCache.get(i.id) }))}
              currentIndex={selectedImageIndex}
              onJumpTo={(idx: number) => { setSelectedImage(filteredImages[idx]); setSelectedImageIndex(idx) }}
            />
          )}
        </AnimatePresence>

        {/* ━━━ CONTEXT MENU ━━━ */}
        <AnimatePresence>
          {contextMenu && (
            <m.div
              initial={{ opacity: 0, scale: .95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: .95 }}
              transition={{ duration: .1 }}
              className="fixed z-[60] rounded-xl border shadow-2xl shadow-black/60 w-56 py-1 text-[13px] overflow-hidden backdrop-blur-xl"
              style={{ top: contextMenu.y, left: contextMenu.x, background: `${T.surface}f8`, borderColor: T.border }}
            >
              {/* file header */}
              <div className="px-3 py-2 border-b flex items-center gap-2 min-w-0" style={{ borderColor: T.border }}>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded shrink-0">
                  {resolveMediaType(contextMenu.image)}
                </span>
                <span className="text-[12px] text-zinc-400 truncate">{contextMenu.image.filename}</span>
              </div>

              {[
                { icon: <Eye size={14} />,             label: 'View details',       action: () => { setSelectedImage(contextMenu.image); setSelectedImageIndex(filteredImages.indexOf(contextMenu.image)) } },
                { icon: <Heart size={14} />,           label: contextMenu.image.isFavorite ? 'Remove from favourites' : 'Add to favourites', action: () => toggleFavorite(contextMenu.image.id) },
                { icon: <LayoutTemplate size={14} />,  label: 'Set as banner',      action: () => handleSetBanner(contextMenu.image) },
                { icon: <Star size={14} />,            label: 'Add to album',       action: () => {} },
                null, // separator
                { icon: <ExternalLink size={14} />,    label: 'Open externally',    action: () => {} },
                { icon: <Copy size={14} />,            label: 'Copy to clipboard',  action: () => {} },
                { icon: <FolderSearch size={14} />,    label: 'Show in Explorer',   action: () => {} },
              ].map((item, i) =>
                item === null ? (
                  <div key={i} className="my-1 border-t mx-2" style={{ borderColor: T.border }} />
                ) : (
                  <button
                    key={i}
                    onClick={() => { item.action(); setContextMenu(null) }}
                    className="w-full text-left px-3 py-[7px] hover:bg-blue-600 hover:text-white flex items-center gap-2.5 text-zinc-300 transition-colors"
                  >
                    {item.icon} {item.label}
                  </button>
                )
              )}
              <div className="my-1 border-t mx-2" style={{ borderColor: T.border }} />
              <button
                onClick={async () => { await moveToTrash(contextMenu.image.id); setContextMenu(null) }}
                className="w-full text-left px-3 py-[7px] hover:bg-red-600 hover:text-white flex items-center gap-2.5 text-red-400 transition-colors"
              >
                <Trash2 size={14} /> Delete
              </button>
            </m.div>
          )}
        </AnimatePresence>

      </div>
    </LazyMotion>
  )
}