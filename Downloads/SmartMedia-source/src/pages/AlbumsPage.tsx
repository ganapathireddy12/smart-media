import { useState, useEffect, useMemo, memo, useRef } from 'react'
import { motion, AnimatePresence, LazyMotion, domAnimation } from 'framer-motion'
import { useAppStore, Album, ImageMetadata } from '../store/appStore'
import PhotoViewer from '../components/PhotoViewer'
import Slideshow from '../components/Slideshow'
import {
  FolderOpen, Search, X, FileText, Camera, PartyPopper, MapPin, 
  Folder, Plus, Grid3X3, List, SortAsc, Filter, Share2, Play, 
  Download, ArrowLeft, Image as ImageIcon, Trash2, Edit3, UserPlus, 
  Check, AlertCircle, Calendar, Clock, TrendingUp, Info,
  Video as VideoIcon, Music as AudioIcon, Heart
} from 'lucide-react'

// ─── ULTRA-DARK ENTERPRISE THEME ──────────────────────────────
const T = {
  bg:       'bg-black',
  surface:  'bg-[#0a0a0a]',
  raised:   'bg-[#121212]',
  border:   'border-[#1f1f22]',
  accent:   'text-blue-500',
} as const

// Smart Album Definitions
const SMART_ALBUMS = [
  { id: 'documents', name: 'Documents', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'selfies', name: 'Selfies', icon: Camera, color: 'text-pink-500', bg: 'bg-pink-500/10' },
  { id: 'events', name: 'Events', icon: PartyPopper, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { id: 'locations', name: 'Locations', icon: MapPin, color: 'text-green-500', bg: 'bg-green-500/10' },
]

// ─── LAZY THUMBNAIL HOOK ────────────────────────────────────
export const thumbCache = new Map<string, string>()

function useLazyThumb(id: string, path: string, metadata?: any) {
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
          const t = await window.electronAPI?.getImageThumbnail(path, metadata)
          if (t) { thumbCache.set(id, t); setSrc(t) }
        } catch {}
      })()
    }, { rootMargin: '800px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [id, path, src, metadata])

  return { ref, src }
}

// ─── UTILS ────────────────────────────────────────────────────
const resolveMediaType = (img: any): string => img.mediaType || img.media_type || 'image'
const fmtDuration = (sec?: number) => {
  if (!sec) return null
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
const getDocumentMeta = (filename: string) => {
  const ext = filename?.toLowerCase().split('.').pop()
  if (ext === 'pdf') return { icon: FileText, color: 'text-red-500', bg: 'from-red-950/40 to-black' }
  if (['doc', 'docx'].includes(ext || '')) return { icon: FileText, color: 'text-blue-500', bg: 'from-blue-950/40 to-black' }
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return { icon: FileText, color: 'text-green-500', bg: 'from-green-950/40 to-black' }
  return { icon: FileText, color: 'text-zinc-500', bg: 'from-zinc-900/40 to-black' }
}

// ─── COMPONENT: ALBUM CARD ────────────────────────────────────
const AlbumCard = memo(({ album, previews, previewImages, onClick }: { 
  album: Album, previews: string[], previewImages: (ImageMetadata | undefined)[], onClick: () => void 
}) => {
  const isSmart = album.isSmartAlbum
  const smartConfig = SMART_ALBUMS.find(s => s.id === album.id)
  const Icon = smartConfig?.icon || Folder
  const iconColor = smartConfig?.color || 'text-blue-400'
  const iconBg = smartConfig?.bg || 'bg-blue-400/10'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.03 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={`group cursor-pointer rounded-2xl overflow-hidden ${T.surface} border ${T.border} hover:border-zinc-600 transition-colors shadow-lg`}
      onClick={onClick}
    >
      {/* Cover Grid (2x2) */}
      <div className="aspect-square bg-[#121212] grid grid-cols-2 gap-[1px]">
        {[0, 1, 2, 3].map(i => {
          const img = previewImages[i]
          const mediaType = img ? resolveMediaType(img) : 'image'
          const isVideo = mediaType === 'video'
          const isAudio = mediaType === 'audio'
          
          return (
            <div key={i} className="relative overflow-hidden bg-[#050505] flex items-center justify-center">
              {previews[i] ? (
                <>
                  <img src={previews[i]} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 brightness-90 group-hover:brightness-100" />
                  {(isVideo || isAudio) && (
                    <div className="absolute top-1.5 left-1.5 z-10 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/10 shadow-sm">
                      {isVideo ? <VideoIcon size={8} className="text-white" /> : <AudioIcon size={8} className="text-white" />}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center opacity-20">
                   {i === 0 && <Icon size={28} className={isSmart ? iconColor : 'text-zinc-500'} />}
                </div>
              )}
            </div>
          )
        })}
        {/* Inner shadow overlay */}
        <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] pointer-events-none" />
      </div>

      {/* Meta */}
      <div className="p-4 bg-gradient-to-b from-[#0a0a0a] to-[#050505] border-t border-[#1f1f22]">
        <h3 className="text-[14px] font-bold text-white truncate flex items-center gap-2">
          {isSmart && <div className={`p-1 rounded-md ${iconBg}`}><Icon size={12} className={iconColor} /></div>}
          {album.name}
        </h3>
        <p className="text-[11px] font-bold text-zinc-500 flex items-center gap-2 mt-1.5 tracking-wide">
           {album.imageIds.length} ASSETS
           {isSmart && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(37,99,235,0.8)]" />}
        </p>
      </div>
    </motion.div>
  )
})

// ─── COMPONENT: ALBUM PHOTO CARD (Inside Detail View) ─────────
const AlbumPhotoCard = memo(({ image, onClick }: { image: ImageMetadata; onClick: () => void }) => {
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
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer transition-all duration-300 ring-1 ring-[#1f1f22] hover:ring-zinc-600 shadow-lg`}
      style={{ background: T.surface }}
    >
      {src && (mediaType === 'image' || isVideo || isAudio) ? (
        <>
          <img
            src={src}
            className={`w-full h-full object-cover transition-transform duration-500 ease-out will-change-transform ${hovered ? 'scale-[1.05]' : 'scale-100'} brightness-90 group-hover:brightness-100`}
            loading="lazy" draggable={false}
          />
          {(isVideo || isAudio) && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-lg bg-black/80 backdrop-blur-xl px-2 py-1 border border-white/10 shadow-lg">
              {isVideo ? <VideoIcon size={10} className="text-white" /> : <AudioIcon size={10} className="text-white" />}
              {image.duration != null && <span className="text-[9px] text-white font-bold tabular-nums tracking-wide">{fmtDuration(image.duration)}</span>}
            </div>
          )}
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-xl flex items-center justify-center border border-white/20 shadow-2xl">
                <Play size={16} className="text-white ml-0.5" fill="white" />
              </div>
            </div>
          )}
        </>
      ) : isDocument ? (
        <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${docMeta.bg}`}>
          <DocIcon size={32} className={`${docMeta.color} mb-3 drop-shadow-xl`} />
          <p className="text-[11px] text-white/90 font-medium truncate max-w-[85%] text-center px-2">{image.filename}</p>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a]"><ImageIcon size={20} className="text-zinc-700 animate-pulse" /></div>
      )}

      {/* Hover Overlay */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 pointer-events-none`}>
         <p className="text-[11px] text-white font-bold truncate drop-shadow-md mb-1">{image.filename}</p>
         <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-300">{mediaType}</span>
      </div>
      
      {image.isFavorite && !hovered && (
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-xl p-1.5 rounded-full border border-white/5">
          <Heart size={10} fill="#ef4444" className="text-red-500" />
        </div>
      )}
    </div>
  )
})

// ─── MAIN COMPONENT ───────────────────────────────────────────
export default function AlbumsPage() {
  const { images, albums, addAlbum } = useAppStore()
  
  // State
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)
  const [imagePreview, setImagePreview] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  
  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [newAlbumName, setNewAlbumName] = useState('')
  const [viewerImage, setViewerImage] = useState<ImageMetadata | null>(null)
  const [showSlideshow, setShowSlideshow] = useState(false)
  
  // Logic
  const displayAlbums = useMemo(() => {
    let list = [...albums]
    if (searchInput) list = list.filter(a => a.name.toLowerCase().includes(searchInput.toLowerCase()))
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [albums, searchInput])

  const albumImages = useMemo(() => {
    if (!selectedAlbum) return []
    return selectedAlbum.imageIds.map(id => images.find(i => i.id === id)).filter(Boolean) as ImageMetadata[]
  }, [selectedAlbum, images])

  // Load Album Cover Previews
  useEffect(() => {
    let active = true
    const load = async () => {
        setLoading(true)
        const targets = new Set<string>()
        displayAlbums.forEach(a => a.imageIds.slice(0, 4).forEach(id => targets.add(id)))

        for (const id of targets) {
            if (!active) break
            if (!imagePreview[id]) {
                const img = images.find(i => i.id === id)
                if (img) {
                    try {
                        // @ts-ignore
                        const thumb = await window.electronAPI?.getImageThumbnail(img.path, img.metadata)
                        if (thumb && active) setImagePreview(p => ({ ...p, [id]: thumb }))
                    } catch(e) {}
                }
            }
        }
        setLoading(false)
    }
    load()
    return () => { active = false }
  }, [displayAlbums, images])

  const handleCreate = () => {
      if (!newAlbumName.trim()) return
      const album: Album = {
          id: `album_${Date.now()}`,
          name: newAlbumName,
          imageIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isSmartAlbum: false
      }
      addAlbum(album)
      setNewAlbumName('')
      setShowCreate(false)
  }

  return (
    <LazyMotion features={domAnimation}>
      <div className={`h-screen w-full flex flex-col ${T.bg} text-white relative overflow-hidden selection:bg-blue-500/30`}>
        
        {/* ━━━ PRO HEADER ━━━ */}
        <header className={`h-[72px] shrink-0 flex items-center justify-between px-6 border-b ${T.border} bg-black/80 backdrop-blur-2xl z-20 shadow-sm`}>
          
          <div className="flex items-center gap-4">
             {selectedAlbum ? (
                <button 
                  onClick={() => setSelectedAlbum(null)} 
                  className="p-2.5 rounded-xl bg-[#0a0a0a] border border-[#1f1f22] text-zinc-400 hover:text-white hover:border-zinc-600 transition-all shadow-sm -ml-2"
                >
                   <ArrowLeft size={18} strokeWidth={2.5} />
                </button>
             ) : (
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-900/20 border border-blue-500/30 flex items-center justify-center">
                   <FolderOpen size={22} className="text-blue-500 drop-shadow-md" />
                </div>
             )}
             
             <div className="flex flex-col">
                <h1 className="text-[17px] font-bold tracking-tight leading-tight">{selectedAlbum ? selectedAlbum.name : 'Collections'}</h1>
                <p className="text-[12px] text-zinc-500 font-bold tracking-wide">
                   {selectedAlbum ? `${selectedAlbum.imageIds.length} ASSETS` : `${displayAlbums.length} ALBUMS`}
                </p>
             </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
             {selectedAlbum ? (
               // Album Detail Controls
               <>
                 {selectedAlbum.imageIds.length > 0 && (
                   <button 
                     onClick={() => setShowSlideshow(true)}
                     className="h-10 px-4 rounded-xl border bg-blue-600 hover:bg-blue-500 border-blue-500 text-white flex items-center gap-2 text-[13px] font-bold transition-all shadow-[0_0_20px_rgba(37,99,235,0.25)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)]"
                   >
                     <Play size={14} fill="currentColor" /> <span className="hidden sm:inline">Present</span>
                   </button>
                 )}
                 {!selectedAlbum.isSmartAlbum && (
                   <button className="h-10 px-4 rounded-xl border border-[#1f1f22] bg-[#0a0a0a] text-zinc-400 hover:text-red-500 hover:border-red-900/50 transition-all shadow-sm flex items-center gap-2 text-[13px] font-bold">
                     <Trash2 size={14} /> <span className="hidden sm:inline">Delete</span>
                   </button>
                 )}
               </>
             ) : (
               // Main Albums Controls
               <>
                 <div className="relative group hidden sm:block">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-blue-500 transition-colors" size={16} />
                    <input 
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Find a collection..."
                      className="h-10 pl-11 pr-4 bg-[#0a0a0a] border border-[#1f1f22] rounded-xl text-[13px] font-medium text-white focus:border-blue-500/50 outline-none w-56 transition-all shadow-sm placeholder-zinc-600"
                    />
                 </div>
                 <button 
                   onClick={() => setShowCreate(true)}
                   className="h-10 px-4 rounded-xl border bg-blue-600 hover:bg-blue-500 border-blue-500 text-white flex items-center gap-2 text-[13px] font-bold transition-all shadow-[0_0_20px_rgba(37,99,235,0.25)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)]"
                 >
                    <Plus size={16} strokeWidth={3} /> <span className="hidden sm:inline">New Album</span>
                 </button>
               </>
             )}
          </div>
        </header>

        {/* ━━━ CONTENT WORKSPACE ━━━ */}
        <div className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth pb-32">
           <AnimatePresence mode="wait">
              {selectedAlbum ? (
                 /* ALBUM DETAIL VIEW */
                 <motion.div 
                   key="album-detail"
                   initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                   transition={{ duration: 0.2 }}
                 >
                    {albumImages.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-center mt-20">
                           <div className="w-24 h-24 rounded-3xl bg-[#0a0a0a] border border-[#1f1f22] flex items-center justify-center mb-6 shadow-2xl">
                             <ImageIcon size={40} className="text-zinc-700" />
                           </div>
                           <h2 className="text-[18px] font-extrabold text-white mb-2 tracking-tight">Empty Collection</h2>
                           <p className="text-[14px] text-zinc-500 font-medium">Add photos or videos to this album to see them here.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                          {albumImages.map(img => (
                            <AlbumPhotoCard 
                               key={img.id} 
                               image={img} 
                               onClick={() => setViewerImage(img)}
                            />
                          ))}
                        </div>
                    )}
                 </motion.div>
              ) : (
                 /* ALBUMS GRID */
                 <motion.div 
                   key="albums-grid"
                   initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                 >
                   {displayAlbums.length === 0 ? (
                      <div className="h-64 flex flex-col items-center justify-center text-center mt-20">
                         <div className="w-24 h-24 rounded-3xl bg-[#0a0a0a] border border-[#1f1f22] flex items-center justify-center mb-6 shadow-2xl">
                           <FolderOpen size={40} className="text-zinc-700" />
                         </div>
                         <h2 className="text-[18px] font-extrabold text-white mb-2 tracking-tight">No Collections Found</h2>
                         <p className="text-[14px] text-zinc-500 font-medium">Create a new album to organize your workspace.</p>
                      </div>
                   ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-6">
                        {displayAlbums.map(album => (
                           <AlbumCard 
                             key={album.id} 
                             album={album}
                             previews={album.imageIds.slice(0,4).map(id => imagePreview[id])}
                             previewImages={album.imageIds.slice(0,4).map(id => images.find(i => i.id === id))}
                             onClick={() => setSelectedAlbum(album)}
                           />
                        ))}
                      </div>
                   )}
                 </motion.div>
              )}
           </AnimatePresence>
        </div>

        {/* ━━━ STATUS BAR ━━━ */}
        <footer className="absolute bottom-0 inset-x-0 h-9 shrink-0 bg-[#0a0a0a] border-t border-[#1f1f22] flex items-center justify-between px-5 text-[12px] font-bold text-zinc-400 z-30 shadow-[0_-5px_15px_rgba(0,0,0,0.5)]">
           <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.8)] animate-pulse" />
              <span className="text-white">Smart Albums Active</span>
           </div>
           <div>
              {selectedAlbum ? `${albumImages.length} assets in view` : `${displayAlbums.length} collections`}
           </div>
        </footer>

        {/* ━━━ MODALS ━━━ */}
        <AnimatePresence>
           {/* Create Album Modal */}
           {showCreate && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center"
                onClick={() => setShowCreate(false)}
              >
                 <motion.div 
                   initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                   transition={{ type: "spring", stiffness: 400, damping: 30 }}
                   className="bg-[#0a0a0a] border border-[#1f1f22] p-8 rounded-[2rem] w-full max-w-sm shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
                   onClick={e => e.stopPropagation()}
                 >
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 mx-auto">
                       <FolderPlusIcon size={28} className="text-blue-500" />
                    </div>
                    <h2 className="text-[20px] font-extrabold text-white text-center mb-2 tracking-tight">Create Collection</h2>
                    <p className="text-[13px] text-zinc-500 text-center font-medium mb-6">Organize your assets into a new smart workspace.</p>
                    
                    <input 
                      autoFocus
                      value={newAlbumName}
                      onChange={e => setNewAlbumName(e.target.value)}
                      placeholder="e.g. Q4 Cloud Architecture..."
                      className="w-full bg-[#121212] border border-[#1f1f22] rounded-xl px-4 py-3.5 text-[14px] font-bold text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none mb-8 transition-all placeholder-zinc-600"
                      onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    />
                    
                    <div className="flex gap-3">
                       <button onClick={() => setShowCreate(false)} className="flex-1 py-3 rounded-xl bg-[#121212] hover:bg-[#1f1f22] border border-[#1f1f22] text-[13px] font-extrabold text-zinc-400 hover:text-white transition-all">Cancel</button>
                       <button onClick={handleCreate} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-extrabold transition-all shadow-[0_0_15px_rgba(37,99,235,0.4)]">Create</button>
                    </div>
                 </motion.div>
              </motion.div>
           )}

           {/* Fullscreen Photo Viewer */}
           {viewerImage && (
              <PhotoViewer 
                image={viewerImage} 
                imagePreview={thumbCache.get(viewerImage.id)} 
                onClose={() => setViewerImage(null)}
                filmstrip={albumImages.map(i => ({ id: i.id, preview: thumbCache.get(i.id) }))}
                currentIndex={albumImages.findIndex(i => i.id === viewerImage.id)}
                onPrevious={() => {
                  const idx = albumImages.findIndex(i => i.id === viewerImage.id)
                  if (idx > 0) setViewerImage(albumImages[idx - 1])
                }}
                onNext={() => {
                  const idx = albumImages.findIndex(i => i.id === viewerImage.id)
                  if (idx < albumImages.length - 1) setViewerImage(albumImages[idx + 1])
                }}
                hasPrevious={albumImages.findIndex(i => i.id === viewerImage.id) > 0}
                hasNext={albumImages.findIndex(i => i.id === viewerImage.id) < albumImages.length - 1}
                onJumpTo={(idx) => setViewerImage(albumImages[idx])}
              />
           )}

           {/* Presentation Slideshow */}
           {showSlideshow && selectedAlbum && albumImages.length > 0 && (
             <Slideshow
               images={albumImages}
               startIndex={0}
               onClose={() => setShowSlideshow(false)}
             />
           )}
        </AnimatePresence>

      </div>
    </LazyMotion>
  )
}

// Icon helper for the modal
function FolderPlusIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 10v6"></path>
      <path d="M9 13h6"></path>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>
    </svg>
  )
}