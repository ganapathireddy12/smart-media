import { useState, useEffect, useMemo, useRef, memo, useCallback } from 'react'
import { useAppStore, ImageMetadata } from '../store/appStore'
import PhotoViewer from '../components/PhotoViewer'
import {
  Calendar, Heart, Clock, ZoomIn, ZoomOut,
  Image as ImageIcon, Video as VideoIcon, 
  Music as AudioIcon, FileText, Filter, Grid, Layers
} from 'lucide-react'

// ─── HELPERS ────────────────────────────────────────────────
const parseDate = (s: string): Date => {
  if (!s) return new Date()
  return new Date(s.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'))
}

const getCaptureDate = (img: ImageMetadata): Date => {
  const s = (img as any).date_taken || img.metadata?.date_taken || img.metadata?.DateTimeOriginal || img.dateScanned || img.dateModified
  return s?.includes?.(':') ? parseDate(s) : new Date(s)
}

const getRelativeDay = (d: Date): string => {
  const diff = Math.floor((Date.now() - d.getTime()) / 864e5)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long' })
}

const formatDuration = (seconds?: number) => {
  if (!seconds) return null
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// ─── THUMBNAIL HOOK ─────────────────────────────────────────
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
    }, { rootMargin: '400px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [id, path, src])

  return { ref, src }
}

// ─── TILE COMPONENT ─────────────────────────────────────────
const Tile = memo(({ image, onClick, className = '' }: { image: ImageMetadata; onClick: (i: ImageMetadata) => void; className?: string }) => {
  const { ref, src } = useLazyThumb(image.id, image.path)
  
  const mediaType = image.mediaType || (image as any).media_type || 'image'
  const isVideo = mediaType === 'video'
  const isAudio = mediaType === 'audio'
  const isDocument = mediaType === 'document'
  
  const getDocIcon = () => {
    const ext = image.filename?.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return { color: 'text-red-400', bg: 'bg-red-500/10' }
    if (['doc', 'docx'].includes(ext || '')) return { color: 'text-blue-400', bg: 'bg-blue-500/10' }
    return { color: 'text-gray-400', bg: 'bg-gray-500/10' }
  }

  return (
    <div
      ref={ref}
      onClick={() => onClick(image)}
      className={`relative overflow-hidden cursor-pointer group bg-[#121215] aspect-square ${className}`}
    >
      {src ? (
        <img 
          src={src} 
          className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105" 
          loading="lazy" 
          draggable={false}
        />
      ) : (
        <div className={`w-full h-full flex flex-col items-center justify-center ${isDocument ? getDocIcon().bg : 'bg-[#18181b]'}`}>
          {isDocument ? (
            <FileText className={getDocIcon().color} size={24} />
          ) : isVideo ? (
            <VideoIcon className="text-white/20" size={24} />
          ) : isAudio ? (
            <AudioIcon className="text-white/20" size={24} />
          ) : (
            <ImageIcon className="text-white/10" size={24} />
          )}
        </div>
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 pointer-events-none" />

      {/* Badges */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 pointer-events-none z-10">
        {image.isFavorite && <Heart size={12} className="fill-white text-white drop-shadow-md" />}
      </div>

      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex justify-between items-end pointer-events-none z-10">
        {isVideo && (
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] font-medium text-white">
            <VideoIcon size={10} /> {formatDuration(image.duration)}
          </div>
        )}
        {isDocument && (
          <div className="bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] font-medium text-white truncate max-w-full">
            {image.filename}
          </div>
        )}
      </div>
    </div>
  )
})

// ─── LAYOUT SECTIONS ────────────────────────────────────────

// 1. MONTH VIEW (Simplified: Standard Grid)
const MonthSection = memo(({ monthKey, monthName, year, images, onImageClick, cols }: {
  monthKey: string; monthName: string; year: number
  images: ImageMetadata[]; onImageClick: (i: ImageMetadata) => void; cols: number
}) => {
  return (
    <div id={`month-${monthKey}`} className="mb-8 scroll-mt-0">
      {/* Sticky Header - Solid Background to prevent overlay issues */}
      <div className="sticky top-0 z-20 py-3 px-6 bg-[#09090b] border-b border-white/5 flex items-baseline justify-between shadow-sm">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-white tracking-tight">{monthName}</h2>
          <span className="text-sm text-white/40 font-mono">{year}</span>
        </div>
        <span className="text-xs text-white/30 font-medium bg-white/5 px-2 py-0.5 rounded-full">{images.length}</span>
      </div>

      {/* Simple Grid */}
      <div className="px-6 pt-1 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {images.map(img => (
          <Tile key={img.id} image={img} onClick={onImageClick} />
        ))}
      </div>
    </div>
  )
})

// 2. DAY VIEW (Sticky Header Fixed)
const DaySection = memo(({ dateKey, dateLabel, relative, images, onImageClick, cols }: {
  dateKey: string; dateLabel: string; relative: string
  images: ImageMetadata[]; onImageClick: (i: ImageMetadata) => void; cols: number
}) => (
  <div id={`day-${dateKey}`} className="mb-6 scroll-mt-0">
    {/* Sticky Header - Solid Background */}
    <div className="sticky top-0 z-20 py-2.5 px-6 bg-[#09090b] border-b border-white/5 flex items-center gap-3 shadow-sm">
      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
      <span className="text-sm font-semibold text-white">{dateLabel}</span>
      <span className="text-xs text-white/40">{relative}</span>
    </div>
    
    <div className="px-6 pt-1 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {images.map(img => <Tile key={img.id} image={img} onClick={onImageClick} />)}
    </div>
  </div>
))

// 3. YEAR VIEW
const YearCard = memo(({ year, images, onDrillDown }: {
  year: number; images: ImageMetadata[]; onDrillDown: (y: number) => void
}) => {
  const hero = images.find(i => i.isFavorite) || images[0]
  const { ref, src } = useLazyThumb(hero?.id || '', hero?.path || '')

  return (
    <div 
      ref={ref} 
      onClick={() => onDrillDown(year)}
      className="group relative h-[260px] bg-[#121215] border border-white/10 hover:border-white/30 transition-all duration-200 cursor-pointer overflow-hidden rounded-xl"
    >
      {src ? (
        <img src={src} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-60 group-hover:opacity-100" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[#18181b]"><Calendar className="text-white/10" size={40} /></div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 p-5 w-full">
        <h2 className="text-3xl font-bold text-white mb-1 tracking-tighter">{year}</h2>
        <div className="flex items-center justify-between border-t border-white/20 pt-2 mt-2">
           <span className="text-xs font-medium text-white/70 uppercase tracking-widest">{images.length} Moments</span>
           <div className="p-1.5 rounded-full bg-white/10 group-hover:bg-white text-white group-hover:text-black transition-colors">
              <Grid size={12} />
           </div>
        </div>
      </div>
    </div>
  )
})

// ─── TIMELINE RAIL ──────────────────────────────────────────
const TimelineRail = memo(({ entries, activeId, onSelect }: {
  entries: { id: string; label: string; shortLabel: string }[]
  activeId: string | null; onSelect: (id: string) => void
}) => {
  return (
    <div className="w-10 shrink-0 flex flex-col h-full border-l border-white/5 bg-[#09090b] relative z-30">
      <div className="flex-1 flex flex-col items-center justify-center py-4 space-y-0.5 overflow-y-auto no-scrollbar">
        {entries.map((entry) => {
          const isActive = activeId === entry.id || (activeId && activeId.startsWith(entry.id))
          return (
            <div
              key={entry.id}
              onClick={() => onSelect(entry.id)}
              className="group relative flex items-center justify-center w-full h-6 cursor-pointer"
            >
              {/* Tooltip on Hover */}
              <div className="absolute right-8 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1c1c1f] border border-white/10 text-white text-[9px] font-bold px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none shadow-xl">
                {entry.label}
              </div>
              
              {/* Dot / Label */}
              <div className={`text-[9px] font-mono transition-all duration-150 select-none
                ${isActive 
                  ? 'text-white font-bold bg-white/10 w-6 h-5 flex items-center justify-center rounded border border-white/10' 
                  : 'text-white/30 hover:text-white group-hover:bg-white/5 w-6 h-5 flex items-center justify-center rounded'
                }`}
              >
                {entry.shortLabel}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

// ═════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════
type ViewMode = 'days' | 'months' | 'years'

export default function TimelinePage() {
  const { images, toggleFavorite } = useAppStore()
  const [viewerImage, setViewerImage] = useState<ImageMetadata | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('months')
  const [activeRailId, setActiveRailId] = useState<string | null>(null)
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('all')

  const zoomLevels = [4, 5, 6, 8, 10]
  const [zoomIdx, setZoomIdx] = useState(2) // Default 6 cols
  const cols = zoomLevels[zoomIdx]

  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll Tracking
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const headers = el.querySelectorAll('[id^="month-"], [id^="day-"]')
      for (const h of headers) {
        const rect = h.getBoundingClientRect()
        // Check if header is near top (approx 100px buffer)
        if (rect.top <= 100 && rect.bottom > 50) {
          setActiveRailId(h.id)
          break
        }
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [viewMode])

  const allSorted = useMemo(() => {
    let result = [...images].filter(i => !i.isDeleted)
    if (mediaTypeFilter !== 'all') {
      result = result.filter(img => {
        const type = img.mediaType || (img as any).media_type || 'image'
        return mediaTypeFilter === 'video' ? type === 'video' : type !== 'video'
      })
    }
    return result.sort((a, b) => getCaptureDate(b).getTime() - getCaptureDate(a).getTime())
  }, [images, mediaTypeFilter])

  const monthGroups = useMemo(() => {
    const map = new Map<string, { monthName: string; year: number; images: ImageMetadata[] }>()
    allSorted.forEach(img => {
      const d = getCaptureDate(img)
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, { monthName: d.toLocaleDateString('en-US', { month: 'long' }), year: d.getFullYear(), images: [] })
      map.get(key)!.images.push(img)
    })
    return Array.from(map.entries()).map(([key, data]) => ({ key, ...data }))
  }, [allSorted])

  const dayGroups = useMemo(() => {
    const map = new Map<string, ImageMetadata[]>()
    allSorted.forEach(img => {
      const d = getCaptureDate(img)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(img)
    })
    return Array.from(map.entries()).map(([key, imgs]) => {
      const d = new Date(key)
      return {
        key,
        dateLabel: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        relative: getRelativeDay(d),
        images: imgs,
      }
    })
  }, [allSorted])

  const yearGroups = useMemo(() => {
    const map = new Map<number, ImageMetadata[]>()
    allSorted.forEach(img => { const y = getCaptureDate(img).getFullYear(); if (!map.has(y)) map.set(y, []); map.get(y)!.push(img) })
    return Array.from(map.entries()).map(([y, imgs]) => ({ year: y, images: imgs })).sort((a, b) => b.year - a.year)
  }, [allSorted])

  const railEntries = useMemo(() => {
    if (viewMode === 'months') {
      return monthGroups.map(g => ({
        id: `month-${g.key}`,
        label: `${g.monthName} ${g.year}`,
        shortLabel: g.monthName.slice(0, 3).toUpperCase(),
      }))
    }
    if (viewMode === 'days') {
      const seen = new Set<string>()
      return dayGroups.reduce<{ id: string; label: string; shortLabel: string }[]>((acc, g) => {
        const d = new Date(g.key)
        const mk = `${d.getFullYear()}-${d.getMonth()}`
        if (!seen.has(mk)) {
          seen.add(mk)
          acc.push({
            id: `day-${g.key}`, 
            label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            shortLabel: (d.getMonth() + 1).toString(),
          })
        }
        return acc
      }, [])
    }
    return []
  }, [viewMode, monthGroups, dayGroups])

  const handleDrillDown = useCallback((year: number) => {
    setViewMode('months')
    setTimeout(() => {
      const el = document.querySelector(`[id^="month-${year}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [])

  const handleRailSelect = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (el) {
      // Direct scroll into view with no offset gap
      el.scrollIntoView({ behavior: 'auto', block: 'start' })
    }
  }, [])

  return (
    <div className="h-full w-full flex flex-col bg-[#09090b] text-white overflow-hidden font-sans">
      
      {/* ━━━ HEADER ━━━ */}
      <header className="shrink-0 h-14 border-b border-white/10 bg-[#09090b] flex items-center justify-between px-6 z-30">
        <div className="flex items-center gap-6">
           <div className="flex items-center gap-3 text-white/90">
             <div className="p-2 bg-white/5 border border-white/10 rounded-lg">
                <Clock size={16} />
             </div>
             <h1 className="text-sm font-bold tracking-wide uppercase">Timeline</h1>
           </div>
           <div className="h-4 w-px bg-white/10" />
           <div className="flex bg-[#121215] p-1 rounded-lg border border-white/5">
             {([
               { id: 'years', icon: Layers, label: 'Years' }, 
               { id: 'months', icon: Grid, label: 'Months' }, 
               { id: 'days', icon: Calendar, label: 'Days' }
              ] as const).map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                    ${viewMode === mode.id 
                      ? 'bg-white/10 text-white shadow-sm' 
                      : 'text-white/40 hover:text-white/80'}`
                  }
                >
                  <mode.icon size={12} /> {mode.label}
                </button>
             ))}
           </div>
        </div>

        <div className="flex items-center gap-3">
           <div className="flex bg-[#121215] p-1 rounded-lg border border-white/5">
              <button onClick={() => setMediaTypeFilter('all')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mediaTypeFilter === 'all' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}>All Media</button>
              <button onClick={() => setMediaTypeFilter('video')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mediaTypeFilter === 'video' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}>Videos</button>
           </div>
           {viewMode !== 'years' && (
             <div className="flex items-center gap-1 bg-[#121215] border border-white/5 p-1 rounded-lg">
               <button onClick={() => setZoomIdx(i => Math.min(zoomLevels.length - 1, i + 1))} className="p-1.5 hover:bg-white/10 rounded text-white/60 hover:text-white"><ZoomOut size={14} /></button>
               <span className="w-8 text-center text-[10px] text-white/30 font-mono">{cols}x</span>
               <button onClick={() => setZoomIdx(i => Math.max(0, i - 1))} className="p-1.5 hover:bg-white/10 rounded text-white/60 hover:text-white"><ZoomIn size={14} /></button>
             </div>
           )}
        </div>
      </header>

      {/* ━━━ MAIN SCROLL AREA ━━━ */}
      <div className="flex-1 flex overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar relative">
           <div className="max-w-[1800px] mx-auto min-h-full pb-20">
              {allSorted.length === 0 ? (
                <div className="h-[60vh] flex flex-col items-center justify-center text-white/30">
                  <div className="w-16 h-16 border border-white/10 rounded-2xl flex items-center justify-center mb-4 bg-white/5"><Filter size={32} /></div>
                  <p className="text-sm font-medium">No media found</p>
                </div>
              ) : (
                <div className="pt-0">
                  {viewMode === 'years' && (
                    <div className="pt-6 px-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                      {yearGroups.map(g => (
                        <YearCard key={g.year} year={g.year} images={g.images} onDrillDown={handleDrillDown} />
                      ))}
                    </div>
                  )}
                  {viewMode === 'months' && monthGroups.map(g => (
                    <MonthSection 
                      key={g.key} monthKey={g.key} monthName={g.monthName} year={g.year} 
                      images={g.images} onImageClick={(img) => setViewerImage(img)} cols={cols} 
                    />
                  ))}
                  {viewMode === 'days' && dayGroups.map(g => (
                    <DaySection 
                      key={g.key} dateKey={g.key} dateLabel={g.dateLabel} relative={g.relative} 
                      images={g.images} onImageClick={(img) => setViewerImage(img)} cols={cols} 
                    />
                  ))}
                </div>
              )}
           </div>
        </div>

        {/* Rail */}
        {viewMode !== 'years' && railEntries.length > 0 && (
          <TimelineRail entries={railEntries} activeId={activeRailId} onSelect={handleRailSelect} />
        )}
      </div>

      {viewerImage && (
        <PhotoViewer
          image={viewerImage}
          imagePreview={thumbCache.get(viewerImage.id)}
          onClose={() => setViewerImage(null)}
          onFavorite={toggleFavorite}
        />
      )}
    </div>
  )
}