import { useState, useEffect, useMemo, useRef, memo, useCallback } from 'react'
import { motion, AnimatePresence, LazyMotion, domAnimation, m } from 'framer-motion'
import { useAppStore, ImageMetadata } from '../store/appStore'
import PhotoViewer from '../components/PhotoViewer'
import { useDebounce } from '../hooks/useDebounce'
import {
  Search, X, ArrowLeft, Image as ImageIcon, Heart, Tag,
  Filter, SortAsc, SortDesc, Video as VideoIcon, Grid3X3, List,
  Calendar, MapPin, ChevronDown, SlidersHorizontal, Loader2,
  MoreHorizontal, FileText, HardDrive, Info, CheckCircle2,
  Clock, Eye, Share2, FolderOpen, Music as AudioIcon, Play, AlertCircle
} from 'lucide-react'

// ─── ULTRA-DARK ENTERPRISE THEME ──────────────────────────────
const T = {
  bg:       "bg-black",
  surface:  "bg-[#0a0a0a]",
  sidebar:  "bg-[#0a0a0a] border-l border-[#1f1f22]",
  header:   "bg-black/80 backdrop-blur-2xl border-b border-[#1f1f22]",
  hover:    "hover:bg-[#121212]",  
  active:   "bg-[#1f1f22]",
  accent:   "text-blue-500",
  textMain: "text-white",
  textMuted: "text-zinc-400",
  textDim:  "text-zinc-500",
  border:   "border-[#1f1f22]",
}

// ─── THUMBNAIL CACHE & HELPERS ────────────────────────────────
export const thumbCache = new Map<string, string>()
const thumbQueue = new Set<string>()

const aspectCache = new Map<string, number>()
function getStableAspect(id: string): number {
  if (!aspectCache.has(id)) {
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
    aspectCache.set(id, 0.72 + (Math.abs(hash) % 50) / 100)
  }
  return aspectCache.get(id)!
}

function useLazyThumb(imageId: string, imagePath: string, metadata?: any, eager = false) {
  const [src, setSrc] = useState<string | null>(() => thumbCache.get(imageId) ?? null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!eager || src || thumbQueue.has(imageId)) return
    thumbQueue.add(imageId)
      ; (async () => {
        const cached = thumbCache.get(imageId)
        if (cached) { setSrc(cached); thumbQueue.delete(imageId); return }
        try {
          // @ts-ignore
          const preview = await window.electronAPI?.getImageThumbnail(imagePath, metadata)
          if (preview) { thumbCache.set(imageId, preview); setSrc(preview) }
        } catch { /* skip */ }
        thumbQueue.delete(imageId)
      })()
  }, [imageId, imagePath, metadata, eager])

  useEffect(() => {
    if (src || eager) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        if (thumbQueue.has(imageId)) return
        thumbQueue.add(imageId)
          ; (async () => {
            const cached = thumbCache.get(imageId)
            if (cached) { setSrc(cached); thumbQueue.delete(imageId); return }
            try {
              // @ts-ignore
              const preview = await window.electronAPI?.getImageThumbnail(imagePath, metadata)
              if (preview) { thumbCache.set(imageId, preview); setSrc(preview) }
            } catch { /* skip */ }
            thumbQueue.delete(imageId)
          })()
      },
      { rootMargin: '800px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [imageId, imagePath, metadata, src, eager])

  return { ref, src }
}

// ─── UTILS ────────────────────────────────────────────────────
const formatBytes = (bytes?: number, decimals = 1) => {
  if (!bytes) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const resolveMediaType = (img: any): string => img.mediaType || img.media_type || 'image'

const normalizeTagList = (value: any): string[] => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((tag) => String(tag))
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []

    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map((tag) => String(tag))
      }
    } catch {
      // Fall through to comma/newline split
    }

    return trimmed
      .split(/[,\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  }
  return [String(value)]
}

const formatDuration = (seconds?: number) => {
  if (!seconds) return null
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const getDocumentMeta = (filename: string) => {
  const ext = filename?.toLowerCase().split('.').pop()
  if (ext === 'pdf') return { icon: FileText, color: 'text-red-500', bg: 'from-red-950/40 to-black' }
  if (['doc', 'docx'].includes(ext || '')) return { icon: FileText, color: 'text-blue-500', bg: 'from-blue-950/40 to-black' }
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return { icon: FileText, color: 'text-green-500', bg: 'from-green-950/40 to-black' }
  return { icon: FileText, color: 'text-zinc-500', bg: 'from-zinc-900/40 to-black' }
}

// ─── COMPONENT: TABLE ROW (List View) ─────────────────────────
const TableRow = memo(({ image, onClick, isSelected, onDoubleClick }: any) => {
  const { ref, src } = useLazyThumb(image.id, image.path, image.metadata)
  const mediaType = resolveMediaType(image)
  const isVideo = mediaType === 'video'
  const isAudio = mediaType === 'audio'
  const isDocument = mediaType === 'document'
  const docMeta = getDocumentMeta(image.filename)
  const DocIcon = docMeta.icon

  return (
    <div 
      ref={ref}
      onClick={() => onClick(image)}
      onDoubleClick={() => onDoubleClick(image)}
      className={`group flex items-center gap-4 px-6 py-2 border-b border-[#1f1f22] cursor-pointer transition-colors 
        ${isSelected ? 'bg-blue-600/10' : 'hover:bg-[#121212]'}`}
    >
      {/* Preview Icon/Thumb */}
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[#0a0a0a] flex items-center justify-center relative border border-[#1f1f22]">
        {(mediaType === 'image' || ((isVideo || isAudio) && src)) && src ? (
          <>
            <img src={src} className={`w-full h-full object-cover transition-all ${isSelected ? 'brightness-75' : 'brightness-90 group-hover:brightness-100'}`} loading="lazy" />
            {(isVideo || isAudio) && (
              <div className="absolute bottom-1 right-1 bg-black/80 backdrop-blur-md px-1 py-0.5 rounded text-[8px] font-bold text-white border border-white/10">
                {isVideo ? <VideoIcon size={8} /> : <AudioIcon size={8} />}
              </div>
            )}
          </>
        ) : isDocument ? (
          <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${docMeta.bg}`}>
            <DocIcon size={16} className={docMeta.color} />
          </div>
        ) : isVideo ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-950/40 to-black">
            <VideoIcon size={16} className="text-purple-500" />
          </div>
        ) : isAudio ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-950/40 to-black">
            <AudioIcon size={16} className="text-pink-500" />
          </div>
        ) : (
          <ImageIcon size={16} className="text-zinc-600" />
        )}
      </div>

      {/* Name & Path */}
      <div className="flex-1 min-w-0">
        <p className={`text-[14px] font-bold truncate ${isSelected ? 'text-blue-400' : 'text-white'}`}>{image.filename}</p>
        <p className="text-[12px] font-medium text-zinc-500 truncate">{image.path}</p>
      </div>

      {/* Metadata Columns */}
      <div className="w-28 text-[12px] font-bold text-zinc-500 hidden sm:block truncate uppercase tracking-widest">
        {mediaType}
        {(isVideo || isAudio) && image.duration && (
          <span className="block text-[10px] text-zinc-600 mt-0.5">{formatDuration(image.duration)}</span>
        )}
      </div>
      <div className="w-24 text-[13px] font-semibold text-zinc-400 hidden md:block truncate">{formatBytes(image.size)}</div>
      <div className="w-32 text-[13px] font-semibold text-zinc-400 hidden lg:block truncate">{formatDate(image.dateModified)}</div>
      
      {/* Actions */}
      <div className="w-10 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <button className={`p-2 rounded-lg hover:bg-[#1f1f22] transition-colors ${image.isFavorite ? 'text-red-500 opacity-100' : 'text-zinc-500 hover:text-white'}`}>
          <Heart size={14} fill={image.isFavorite ? "currentColor" : "none"} />
        </button>
      </div>
    </div>
  )
})

// ─── COMPONENT: GRID CARD (Compact Match to HomePage) ─────────
const GridCard = memo(({ image, onClick, onDoubleClick, isSelected }: any) => {
  const { ref, src } = useLazyThumb(image.id, image.path, image.metadata)
  const [hovered, setHovered] = useState(false)
  const mediaType = resolveMediaType(image)
  const isVideo = mediaType === 'video'
  const isAudio = mediaType === 'audio'
  const isDocument = mediaType === 'document'
  const docMeta = getDocumentMeta(image.filename)
  const DocIcon = docMeta.icon
  
  return (
    <div 
      ref={ref}
      onClick={() => onClick(image)}
      onDoubleClick={() => onDoubleClick(image)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative aspect-square rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 
        ${isSelected ? 'ring-2 ring-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)]' : 'ring-1 ring-[#1f1f22] hover:ring-zinc-600 shadow-lg'}`}
      style={{ background: T.surface }}
    >
      {/* Media Content */}
      {(mediaType === 'image' || ((isVideo || isAudio) && src)) && src ? (
        <>
          <img 
            src={src} 
            className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 will-change-transform
              ${hovered ? 'scale-[1.05]' : 'scale-100'} ${isSelected ? 'opacity-70 grayscale-[30%] scale-[0.96]' : 'brightness-90'}`} 
            loading="lazy" decoding="async" draggable={false}
            style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
          />
          {(isVideo || isAudio) && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/80 backdrop-blur-xl px-2 py-1 rounded-lg z-10 border border-white/10 shadow-lg">
              {isVideo ? <VideoIcon size={12} className="text-white" /> : <AudioIcon size={12} className="text-white" />}
              {image.duration && <span className="text-[10px] text-white font-bold tracking-wide">{formatDuration(image.duration)}</span>}
            </div>
          )}
        </>
      ) : isDocument ? (
        <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${docMeta.bg} border border-white/5`}>
          <DocIcon size={42} className={`${docMeta.color} mb-4 drop-shadow-xl`} />
          <p className="text-white/90 text-[13px] font-medium truncate max-w-[85%] px-3 text-center">{image.filename}</p>
        </div>
      ) : isVideo ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-950/30 to-black border border-white/5">
          <VideoIcon size={42} className="text-purple-500 mb-4 drop-shadow-xl" />
          <p className="text-white/90 text-[13px] font-medium truncate max-w-[85%] px-3 text-center">{image.filename}</p>
        </div>
      ) : isAudio ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-950/30 to-black border border-white/5">
          <AudioIcon size={42} className="text-pink-500 mb-4 drop-shadow-xl" />
          <p className="text-white/90 text-[13px] font-medium truncate max-w-[85%] px-3 text-center">{image.filename}</p>
        </div>
      ) : (
        <div className="absolute inset-0 bg-[#0a0a0a] flex items-center justify-center">
          <ImageIcon size={24} className="text-zinc-700" />
        </div>
      )}

      {/* Hover Gradient Overlay */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 pointer-events-none`}>
        <p className="text-[13px] text-white font-bold truncate drop-shadow-md mb-2">{image.filename}</p>
        <div className="flex items-center justify-between">
           <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-300 bg-zinc-800/80 backdrop-blur-xl px-2 py-0.5 rounded border border-zinc-700">{mediaType}</span>
           {image.isFavorite && <Heart size={12} className="text-red-500 drop-shadow-sm" fill="currentColor" />}
        </div>
      </div>

      {/* Selection Check */}
      <div className={`absolute top-3 right-3 transition-all duration-200 ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'}`}>
        <div className="bg-blue-600 text-white rounded-full p-1 border border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.5)]">
          <CheckCircle2 size={12} strokeWidth={3} />
        </div>
      </div>
    </div>
  )
})

// ─── COMPONENT: PRO INSPECTOR PANEL ───────────────────────────
const InspectorPanel = ({ image, onClose, onOpenFull }: { image: ImageMetadata, onClose: () => void, onOpenFull: () => void }) => {
  if (!image) return null
  const mediaType = resolveMediaType(image)
  const isDoc = mediaType === 'document'
  const docMeta = getDocumentMeta(image.filename)
  const DocIcon = docMeta.icon
  
  return (
    <motion.div 
      initial={{ width: 0, opacity: 0 }} 
      animate={{ width: 340, opacity: 1 }} 
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 350, damping: 35 }}
      className={`flex-shrink-0 h-full ${T.sidebar} overflow-y-auto overflow-x-hidden`}
    >
      <div className="w-[340px]">
        {/* Header */}
        <div className="p-5 border-b border-[#1f1f22] flex items-center justify-between bg-black/40 backdrop-blur-xl sticky top-0 z-10">
          <span className="text-[13px] font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
            <Info size={16} className="text-blue-500" /> Details
          </span>
          <button onClick={onClose} className="p-1.5 hover:bg-[#1f1f22] rounded-lg text-zinc-400 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        <div className="p-6 space-y-8">
          {/* Preview Box */}
          <div 
            onClick={onOpenFull}
            className={`aspect-video rounded-xl border border-[#1f1f22] flex items-center justify-center overflow-hidden relative group cursor-pointer shadow-2xl transition-all hover:border-zinc-700
              ${isDoc ? docMeta.bg : mediaType === 'video' ? 'bg-gradient-to-br from-purple-950/40 to-black' : mediaType === 'audio' ? 'bg-gradient-to-br from-pink-950/40 to-black' : 'bg-[#0a0a0a]'}`}
          >
            {isDoc ? <DocIcon size={48} className={docMeta.color} /> :
             mediaType === 'video' ? <VideoIcon size={48} className="text-purple-500" /> :
             mediaType === 'audio' ? <AudioIcon size={48} className="text-pink-500" /> :
             <ImageIcon size={48} className="text-zinc-700" />}
             
             <div className="absolute inset-0 bg-blue-900/20 backdrop-blur-sm opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                <span className="bg-blue-600 text-white text-[12px] font-bold px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg scale-95 group-hover:scale-100 transition-transform">
                  <Eye size={16}/> View Fullscreen
                </span>
             </div>
          </div>

          {/* Core Info */}
          <div>
            <h3 className="text-[16px] font-extrabold text-white break-words leading-tight tracking-tight">{image.filename}</h3>
            <div className="flex items-center gap-3 mt-3">
               <span className="text-[10px] uppercase font-black tracking-widest text-zinc-400 bg-[#121212] px-2.5 py-1 rounded border border-[#1f1f22]">{mediaType}</span>
               <span className="text-[12px] font-mono text-zinc-500">ID: {image.id.substring(0, 8)}</span>
            </div>
          </div>

          {/* Properties Grid */}
          <div className="bg-[#0a0a0a] rounded-xl border border-[#1f1f22] p-1 shadow-inner">
            <div className="flex items-center justify-between text-[13px] p-3 border-b border-[#1f1f22]">
              <span className="text-zinc-500 flex items-center gap-2 font-medium"><FileText size={14} /> Format</span>
              <span className="text-white font-bold">{image.fileType?.split('/')[1]?.toUpperCase() || 'UNKNOWN'}</span>
            </div>
            <div className="flex items-center justify-between text-[13px] p-3 border-b border-[#1f1f22]">
              <span className="text-zinc-500 flex items-center gap-2 font-medium"><HardDrive size={14} /> Size</span>
              <span className="text-white font-bold">{formatBytes(image.size)}</span>
            </div>
            <div className="flex items-center justify-between text-[13px] p-3 border-b border-[#1f1f22]">
              <span className="text-zinc-500 flex items-center gap-2 font-medium"><Calendar size={14} /> Modified</span>
              <span className="text-white font-bold">{formatDate(image.dateModified)}</span>
            </div>
            <div className="flex items-center justify-between text-[13px] p-3">
              <span className="text-zinc-500 flex items-center gap-2 font-medium"><MapPin size={14} /> Path</span>
              <span className="text-white font-mono text-[10px] truncate max-w-[120px]" title={image.path}>{image.path.split('/').pop() || image.path}</span>
            </div>
          </div>

          {/* Tags */}
          <div className="pt-2">
            <span className="text-[11px] font-black text-zinc-600 uppercase tracking-widest mb-3 block flex items-center gap-2"><Tag size={12}/> Tags</span>
            <div className="flex flex-wrap gap-2">
              {(image.tags && image.tags.length > 0) ? image.tags.map(tag => (
                <span key={tag} className="px-3 py-1.5 rounded-lg bg-[#121212] text-zinc-300 text-[12px] font-bold border border-[#1f1f22] shadow-sm hover:border-zinc-600 cursor-default transition-colors">
                  #{tag}
                </span>
              )) : <span className="text-[13px] text-zinc-600 font-medium italic bg-[#0a0a0a] px-4 py-2 rounded-lg border border-dashed border-[#1f1f22] w-full text-center">No tags applied</span>}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="pt-6 grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#121212] hover:bg-[#1f1f22] border border-[#1f1f22] hover:border-zinc-700 rounded-xl text-[13px] font-bold text-white transition-all shadow-sm">
                 <Share2 size={16} className="text-blue-500" /> Share
              </button>
              <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#121212] hover:bg-[#1f1f22] border border-[#1f1f22] hover:border-zinc-700 rounded-xl text-[13px] font-bold text-white transition-all shadow-sm">
                 <FolderOpen size={16} className="text-zinc-400" /> Locate
              </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────
export default function SearchPage() {
  const { images, setCurrentScreen, toggleFavorite, setImages } = useAppStore()

  // State
  const [searchInput, setSearchInput] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'image' | 'video' | 'audio' | 'document'>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedImage, setSelectedImage] = useState<ImageMetadata | null>(null)
  const [showInspector, setShowInspector] = useState(true)
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [searchResults, setSearchResults] = useState<ImageMetadata[] | null>(null)
  const [searching, setSearching] = useState(false)
  
  const debouncedSearch = useDebounce(searchInput, 200)

  // Load Data
  useEffect(() => {
    if (images.length === 0) {
      setTimeout(() => {
         // @ts-ignore
         window.electronAPI?.getImages().then(res => {
            if (res?.success) setImages(res.images)
            setIsLoading(false)
         }).catch(() => setIsLoading(false))
      }, 500)
    } else {
       setIsLoading(false)
    }
  }, [images.length, setImages])

  // Filtering Logic
  const filteredData = useMemo(() => {
    let res = searchResults ?? images
    if (activeFilter !== 'all') {
      res = res.filter(i => resolveMediaType(i) === activeFilter)
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      res = res.filter(i => 
        i.filename.toLowerCase().includes(q) || 
        i.caption?.toLowerCase().includes(q) ||
        normalizeTagList(i.tags).some(t => t.toLowerCase().includes(q)) ||
        i.objects?.some((o: string) => o.toLowerCase().includes(q)) ||
        i.metadata?.album_category?.toLowerCase().includes(q) ||
        i.extractedText?.toLowerCase().includes(q) ||
        i.metadata?.extracted_text?.toLowerCase().includes(q)
      )
    }
    return res
  }, [images, searchResults, activeFilter, debouncedSearch])

  // Server-side search to include extracted PDF/Word text reliably
  useEffect(() => {
    let cancelled = false

    const runSearch = async () => {
      const q = debouncedSearch.trim()
      if (!q) {
        setSearchResults(null)
        setSearching(false)
        return
      }

      setSearching(true)
      try {
        const response = await window.electronAPI?.searchImages(q, { limit: 500 })
        if (cancelled) return

        if (response?.success && Array.isArray(response.images)) {
          const mapped = response.images.map((item: any) => ({
            ...item,
            mediaType: item.media_type || item.mediaType || 'image',
            extractedText: item.extracted_text || item.extractedText || null,
            tags: normalizeTagList(item.tags),
          }))
          setSearchResults(mapped)
        } else {
          setSearchResults([])
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[Search] Backend search failed:', error)
          setSearchResults([])
        }
      } finally {
        if (!cancelled) setSearching(false)
      }
    }

    runSearch()

    return () => { cancelled = true }
  }, [debouncedSearch])

  // Stats
  const mediaStats = useMemo(() => {
    return {
      all: images.length,
      image: images.filter(i => resolveMediaType(i) === 'image').length,
      video: images.filter(i => resolveMediaType(i) === 'video').length,
      audio: images.filter(i => resolveMediaType(i) === 'audio').length,
      document: images.filter(i => resolveMediaType(i) === 'document').length,
    }
  }, [images])

  // Handlers
  const handleItemSelect = useCallback((img: ImageMetadata) => {
    setSelectedImage(img)
    if (!showInspector) setShowInspector(true)
  }, [showInspector])

  const handleItemDoubleClick = useCallback((img: ImageMetadata) => {
    setSelectedImage(img)
    setShowPhotoViewer(true)
  }, [])

  return (
    <LazyMotion features={domAnimation}>
      <div className={`h-screen w-full flex flex-col ${T.bg} text-white font-sans selection:bg-blue-500/30 overflow-hidden`}>
        
        {/* ━━━ PRO HEADER ━━━ */}
        <header className={`${T.header} flex-shrink-0 z-20`}>
          <div className="flex items-center justify-between px-6 h-[72px]">
            
            {/* Left: Back & Search */}
            <div className="flex items-center gap-6 flex-1 max-w-3xl">
              <button 
                onClick={() => setCurrentScreen('home')} 
                className="p-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f22] text-zinc-400 hover:text-white hover:border-zinc-600 transition-all shadow-sm"
              >
                 <ArrowLeft size={18} strokeWidth={2.5} />
              </button>
              
              <div className="relative flex-1 group">
                 <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-blue-500 transition-colors" />
                 <input 
                   value={searchInput}
                   onChange={e => setSearchInput(e.target.value)}
                   className="w-full bg-[#0a0a0a] border border-[#1f1f22] rounded-xl h-11 pl-12 pr-10 text-[14px] font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 focus:bg-[#121212] transition-all shadow-sm"
                   placeholder="Search library, tags, metadata..."
                   autoFocus
                 />
                 {searchInput && (
                   <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-md transition-colors">
                      <X size={14} strokeWidth={3} />
                   </button>
                 )}
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-4 ml-6 shrink-0">
               <div className="flex h-10 rounded-xl border border-[#1f1f22] bg-[#0a0a0a] p-1 shadow-sm">
                  <button onClick={() => setViewMode('grid')} className={`px-4 flex items-center justify-center rounded-lg transition-all ${viewMode === 'grid' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-white hover:bg-zinc-900'}`} title="Grid View">
                     <Grid3X3 size={16} />
                  </button>
                  <button onClick={() => setViewMode('list')} className={`px-4 flex items-center justify-center rounded-lg transition-all ${viewMode === 'list' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-white hover:bg-zinc-900'}`} title="List View">
                     <List size={16} />
                  </button>
               </div>
               
               <div className="w-px h-6 bg-[#1f1f22]" />

               <button 
                  onClick={() => setShowInspector(!showInspector)} 
                  className={`h-10 px-4 flex items-center gap-2 rounded-xl border transition-all shadow-sm font-bold text-[13px]
                    ${showInspector ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]' : 'bg-[#0a0a0a] border-[#1f1f22] text-zinc-400 hover:text-white hover:border-zinc-700'}`}
               >
                  <Info size={16} /> <span className="hidden sm:inline">Inspector</span>
               </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-6 py-3 bg-[#050505] border-t border-[#121212] flex items-center gap-3 overflow-x-auto no-scrollbar">
             {[
               { id: 'all', label: 'Everything', icon: <HardDrive size={14} />, count: mediaStats.all },
               { id: 'image', label: 'Photos', icon: <ImageIcon size={14} />, count: mediaStats.image },
               { id: 'video', label: 'Videos', icon: <VideoIcon size={14} />, count: mediaStats.video },
               { id: 'audio', label: 'Audio', icon: <AudioIcon size={14} />, count: mediaStats.audio },
               { id: 'document', label: 'Docs', icon: <FileText size={14} />, count: mediaStats.document }
             ].filter(f => f.id === 'all' || f.count > 0).map(f => (
               <button
                 key={f.id} onClick={() => setActiveFilter(f.id as any)}
                 className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[13px] font-bold border transition-all ${
                   activeFilter === f.id 
                   ? 'bg-[#1f1f22] border-zinc-700 text-white shadow-sm' 
                   : 'bg-transparent border-transparent text-zinc-500 hover:bg-[#121212] hover:text-zinc-300'
                 }`}
               >
                 {f.icon} {f.label}
                 <span className={`tabular-nums text-[11px] px-2 py-0.5 rounded-full ${activeFilter === f.id ? 'bg-zinc-800 text-zinc-300' : 'bg-[#0a0a0a] border border-[#1f1f22] text-zinc-600'}`}>{f.count}</span>
               </button>
             ))}
             
             <div className="w-px h-5 bg-[#1f1f22] mx-2" />
             <span className="text-[12px] font-bold text-zinc-600">
                 {searching ? 'Searching...' : `${filteredData.length} Result${filteredData.length !== 1 ? 's' : ''}`}
             </span>
          </div>
        </header>

        {/* ━━━ BODY ━━━ */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Main Content Area */}
          <main className="flex-1 flex flex-col min-w-0 bg-[#000000]">
            <div className="flex-1 overflow-y-auto p-6 scroll-smooth relative">
              {isLoading ? (
                 <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
                    <Loader2 size={32} className="animate-spin mb-4 text-blue-500" />
                    <p className="text-[14px] font-bold">Scanning Library...</p>
                 </div>
              ) : filteredData.length === 0 ? (
                 <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <div className="w-24 h-24 rounded-[2rem] bg-[#0a0a0a] border border-[#1f1f22] flex items-center justify-center mb-6 shadow-2xl">
                       <Search size={40} className="text-zinc-600" />
                    </div>
                    <h3 className="text-[18px] font-extrabold text-white mb-2 tracking-tight">No results found</h3>
                    <p className="text-[14px] font-medium text-zinc-500">Try adjusting your filters or search terms.</p>
                 </div>
              ) : (
                 <>
                   {viewMode === 'grid' ? (
                     <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-5 pb-20">
                        {filteredData.map(img => (
                          <GridCard 
                            key={img.id} 
                            image={img} 
                            isSelected={selectedImage?.id === img.id}
                            onClick={handleItemSelect}
                            onDoubleClick={handleItemDoubleClick}
                          />
                        ))}
                     </div>
                   ) : (
                     <div className="flex flex-col border border-[#1f1f22] rounded-xl bg-[#0a0a0a] overflow-hidden mb-20 shadow-xl">
                        <div className="flex px-6 py-3 border-b border-[#1f1f22] text-[11px] font-black text-zinc-500 uppercase tracking-widest bg-[#050505]">
                           <div className="w-10"></div>
                           <div className="flex-1">Asset Name</div>
                           <div className="w-28 hidden sm:block">Type</div>
                           <div className="w-24 hidden md:block">Size</div>
                           <div className="w-32 hidden lg:block">Date Modified</div>
                           <div className="w-10"></div>
                        </div>
                        {filteredData.map((img, idx) => (
                          <TableRow 
                             key={img.id} 
                             image={img} 
                             isSelected={selectedImage?.id === img.id}
                             onClick={handleItemSelect}
                             onDoubleClick={handleItemDoubleClick}
                          />
                        ))}
                     </div>
                   )}
                 </>
              )}
            </div>
            
            {/* Status Bar */}
            <footer className="h-9 shrink-0 bg-[#0a0a0a] border-t border-[#1f1f22] flex items-center justify-between px-5 text-[12px] font-bold text-zinc-400 z-50 shadow-[0_-5px_15px_rgba(0,0,0,0.5)]">
               <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.8)] animate-pulse" />
                  <span className="text-white">Smart Search Active</span>
               </div>
               <div className="flex items-center gap-5">
                  <span className="text-white">{filteredData.length} Items</span>
                  <span className="text-[#1f1f22]">|</span>
                  <span className={selectedImage ? 'text-blue-400' : ''}>{selectedImage ? `Selected: ${selectedImage.filename}` : 'No Selection'}</span>
               </div>
            </footer>
          </main>

          {/* ━━━ INSPECTOR SIDEBAR ━━━ */}
          <AnimatePresence>
            {showInspector && selectedImage && (
               <InspectorPanel 
                 image={selectedImage} 
                 onClose={() => setShowInspector(false)} 
                 onOpenFull={() => handleItemDoubleClick(selectedImage)} 
               />
            )}
          </AnimatePresence>
        
        </div>

        {/* ━━━ FULL SCREEN VIEWER ━━━ */}
        <AnimatePresence>
           {selectedImage && showPhotoViewer && (
              <PhotoViewer 
                 image={selectedImage}
                 imagePreview={thumbCache.get(selectedImage.id) ?? null}
                 onClose={() => setShowPhotoViewer(false)}
                 onNext={() => {}} 
                 onPrevious={() => {}}
                 hasNext={false} 
                 hasPrevious={false}
                 filmstrip={[]} 
                 currentIndex={0}
                 onJumpTo={() => {}}
              />
           )}
        </AnimatePresence>

      </div>
    </LazyMotion>
  )
}