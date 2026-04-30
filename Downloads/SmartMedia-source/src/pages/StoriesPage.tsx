import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, ImageMetadata } from '../store/appStore'
import {
  Play, Pause, SkipForward, SkipBack, X,
  Calendar, Clock, Film, Zap, Volume2, VolumeX,
  Maximize2, Minimize2, Image as ImageIcon,
  Wind, Aperture, Settings2
} from 'lucide-react'

// --- DESIGN SYSTEM ---
const THEME = {
  bg: "bg-[#030303]",          // Pure deep black
  panel: "bg-[#080808]",       // Slightly lighter for sidebar
  border: "border-[#1A1A1A]",  // Very subtle borders
  textMain: "text-[#EDEDED]",  // High readability white
  textMuted: "text-[#666666]", // Dark gray for inactive
  accent: "bg-white text-black", 
  glass: "backdrop-blur-xl bg-black/80 border border-white/10 shadow-2xl"
}

type StoryVibe = 'chill' | 'energetic' | 'nostalgic' | 'dramatic'

const VIBES: { id: StoryVibe, label: string, icon: any, audioUrl: string }[] = [
  { id: 'nostalgic', label: 'Cinematic', icon: Film, audioUrl: 'https://cdn.pixabay.com/download/audio/2021/11/24/audio_8231306346.mp3?filename=emotional-piano-12683.mp3' },
  { id: 'chill', label: 'Ambient', icon: Clock, audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112762.mp3' },
  { id: 'energetic', label: 'Pulse', icon: Zap, audioUrl: 'https://cdn.pixabay.com/download/audio/2022/04/27/audio_6861d8a436.mp3?filename=summer-party-106558.mp3' },
  { id: 'dramatic', label: 'Drama', icon: Wind, audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_0785536484.mp3?filename=cinematic-atmosphere-11232.mp3' },
]

// --- MICRO COMPONENTS ---

const ControlBtn = ({ onClick, icon: Icon, active, label, size = 16 }: any) => (
  <button
    onClick={onClick}
    className={`
      p-3 rounded-full transition-all duration-200 group flex items-center justify-center
      ${active 
        ? 'bg-white text-black scale-105' 
        : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
      }
    `}
    title={label}
  >
    <Icon size={size} strokeWidth={2} />
  </button>
)

const OptionBadge = ({ label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={`
      px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide uppercase transition-all border
      ${active 
        ? 'bg-white border-white text-black' 
        : 'bg-transparent border-[#222] text-[#666] hover:border-[#444] hover:text-[#999]'
      }
    `}
  >
    {label}
  </button>
)

// --- MAIN COMPONENT ---

export default function StoriesPage() {
  const { images, setCurrentScreen } = useAppStore()
  
  // State
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [selectedImages, setSelectedImages] = useState<ImageMetadata[]>([])
  
  // Config
  const [dateRange, setDateRange] = useState<'month' | 'year' | 'all'>('year')
  const [vibe, setVibe] = useState<StoryVibe>('nostalgic')
  const [enableMotion, setEnableMotion] = useState(true)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  
  // Player
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [storyActive, setStoryActive] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [showUI, setShowUI] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hideUITimer = useRef<NodeJS.Timeout | null>(null)

  // --- LOGIC ---

  const filteredImages = useMemo(() => {
    // Filter to only images (no audio, video, or documents)
    let result = images.filter(img => {
      if (img.isDeleted) return false
      
      // Check media type - support both camelCase and snake_case from backend
      const mediaType = img.mediaType || (img as any).media_type || 'image'
      return mediaType === 'image'
    })
    
    const now = new Date()
    const cutoff = new Date()
    
    if(dateRange === 'month') cutoff.setMonth(now.getMonth() - 1)
    if(dateRange === 'year') cutoff.setFullYear(now.getFullYear() - 1)
    
    if (dateRange !== 'all') {
      result = result.filter(img => new Date(img.dateScanned) >= cutoff)
    }
    return result.sort((a, b) => new Date(a.dateScanned).getTime() - new Date(b.dateScanned).getTime())
  }, [images, dateRange])

  // Load Previews
  useEffect(() => {
    let active = true
    const load = async () => {
       const targets = filteredImages.slice(0, 40).filter(i => !previews[i.id])
       if (targets.length === 0) return
       for (const img of targets) {
           if (!active) break
           try {
              // @ts-ignore 
              const thumb = await window.electronAPI?.getImageThumbnail(img.path)
              if(thumb) setPreviews(p => ({...p, [img.id]: thumb}))
           } catch(e) {}
       }
    }
    load()
    return () => { active = false }
  }, [filteredImages])

  // Timer
  useEffect(() => {
    if (!isPlaying || selectedImages.length === 0) return
    const duration = (vibe === 'energetic' ? 3000 : 5000) / playbackSpeed

    const timer = setInterval(() => {
        setCurrentIndex(prev => {
            if (prev >= selectedImages.length - 1) {
                setIsPlaying(false)
                return prev
            }
            return prev + 1
        })
    }, duration)
    return () => clearInterval(timer)
  }, [isPlaying, selectedImages, vibe, playbackSpeed])

  // Audio
  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.volume = isMuted ? 0 : 0.5
    if (isPlaying) audioRef.current.play().catch(() => {})
    else audioRef.current.pause()
  }, [isPlaying, isMuted])

  // Interaction
  const handleStart = () => {
    setSelectedImages(filteredImages)
    setStoryActive(true)
    setCurrentIndex(0)
    setIsPlaying(true)
  }

  const handleInteract = useCallback(() => {
    setShowUI(true)
    if (hideUITimer.current) clearTimeout(hideUITimer.current)
    if (storyActive && isPlaying) {
      hideUITimer.current = setTimeout(() => setShowUI(false), 2000)
    }
  }, [storyActive, isPlaying])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen()
        setIsFullscreen(true)
    } else {
        document.exitFullscreen()
        setIsFullscreen(false)
    }
  }

  const currentImage = selectedImages[currentIndex]

  // --- RENDER ---
  return (
    // FIXED: Changed from 'fixed inset-0' to 'h-full w-full relative' 
    // This allows it to sit inside the main content area correctly.
    <div 
        className={`h-full w-full flex flex-col ${THEME.bg} text-white font-sans overflow-hidden select-none relative`}
        onMouseMove={handleInteract}
        onClick={handleInteract}
    >
      <audio ref={audioRef} src={VIBES.find(v => v.id === vibe)?.audioUrl} loop />

      {/* --- CONFIGURATION SCREEN --- */}
      {!storyActive && (
        <div className="flex-1 flex animate-in fade-in duration-500 overflow-hidden">
            
            {/* LEFT SIDEBAR: Settings */}
            <div className={`w-[300px] flex-shrink-0 flex flex-col border-r ${THEME.border} ${THEME.panel} z-10`}>
                
                {/* Header */}
                <div className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-[#1A1A1A]">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-white/10 rounded-md"><Aperture size={16} className="text-white" /></div>
                        <span className="text-xs font-bold tracking-widest text-white">STORIES</span>
                    </div>
                    <button onClick={() => setCurrentScreen('home')} className="hover:bg-white/10 p-2 rounded-md transition-colors text-[#666] hover:text-white"><X size={16} /></button>
                </div>

                {/* Options Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    
                    {/* Timeframe */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-bold text-[#444] uppercase tracking-[0.2em] flex items-center gap-2">
                           <Calendar size={10} /> Timeframe
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {['month', 'year', 'all'].map((r: any) => (
                                <OptionBadge key={r} label={r === 'all' ? 'All Time' : `Past ${r}`} active={dateRange === r} onClick={() => setDateRange(r)} />
                            ))}
                        </div>
                    </div>

                    {/* Vibe */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-bold text-[#444] uppercase tracking-[0.2em] flex items-center gap-2">
                            <Settings2 size={10} /> Mood
                        </h4>
                        <div className="grid grid-cols-1 gap-1">
                            {VIBES.map(v => (
                                <button 
                                    key={v.id}
                                    onClick={() => setVibe(v.id)}
                                    className={`
                                        group flex items-center justify-between px-4 py-3 rounded-lg transition-all text-xs font-medium border
                                        ${vibe === v.id 
                                            ? 'bg-[#151515] text-white border-[#333]' 
                                            : 'bg-transparent text-[#555] border-transparent hover:bg-[#111] hover:text-[#999]'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <v.icon size={14} className={vibe === v.id ? 'text-white' : 'text-[#333] group-hover:text-[#666]'} />
                                        {v.label}
                                    </div>
                                    {vibe === v.id && <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_white]" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Playback Settings */}
                    <div className="space-y-4">
                         <h4 className="text-[10px] font-bold text-[#444] uppercase tracking-[0.2em]">Options</h4>
                         <div className="flex items-center justify-between p-3 rounded-lg bg-[#0E0E0E] border border-[#1A1A1A]">
                            <span className="text-xs text-[#888]">Motion Effect</span>
                            <button 
                                onClick={() => setEnableMotion(!enableMotion)}
                                className={`w-9 h-5 rounded-full relative transition-colors ${enableMotion ? 'bg-white' : 'bg-[#222]'}`}
                            >
                                <div className={`absolute top-1 left-1 w-3 h-3 bg-black rounded-full transition-transform ${enableMotion ? 'translate-x-4' : ''}`} />
                            </button>
                         </div>
                    </div>
                </div>

                {/* Footer Play Action */}
                <div className="p-6 border-t border-[#1A1A1A] bg-[#080808]">
                    <button 
                        onClick={handleStart}
                        disabled={filteredImages.length === 0}
                        className="w-full py-4 bg-white text-black text-xs font-bold tracking-widest rounded-xl shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                        <Play size={12} fill="black" />
                        START STORY
                    </button>
                    <p className="text-center text-[10px] text-[#333] mt-3 font-mono">{filteredImages.length} memories selected</p>
                </div>
            </div>

            {/* RIGHT: Grid Content */}
            {/* FIXED: Removed grayscale filters to show full colors */}
            <div className="flex-1 bg-[#030303] p-6 overflow-y-auto">
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {filteredImages.slice(0, 100).map((img, i) => (
                        <div 
                            key={img.id}
                            className="aspect-square bg-[#0a0a0a] rounded-lg overflow-hidden relative group border border-[#111] hover:border-[#333] transition-colors"
                        >
                            {previews[img.id] ? (
                                <img 
                                    src={previews[img.id]} 
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                                    loading="lazy"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center"><ImageIcon size={16} className="text-[#222]" /></div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* --- FULLSCREEN PLAYER OVERLAY --- */}
      {/* Uses fixed positioning with high Z-index to cover the entire app including main sidebar */}
      <AnimatePresence>
        {storyActive && currentImage && (
            <motion.div 
                className="fixed inset-0 z-[100] bg-black flex flex-col"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
            >
                {/* Canvas */}
                <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                    {/* Background Blur */}
                    <div className="absolute inset-0 bg-cover bg-center blur-[100px] opacity-30 scale-150" style={{ backgroundImage: `url(${previews[currentImage.id] || currentImage.path})` }} />
                    
                    {/* Main Image */}
                    <motion.img 
                        key={currentImage.id}
                        src={previews[currentImage.id] || currentImage.path}
                        className="relative max-h-screen max-w-full object-contain shadow-2xl z-10"
                        initial={{ scale: enableMotion ? 1.05 : 1, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.2, ease: "linear" }}
                    />
                </div>

                {/* Floating HUD */}
                <motion.div 
                    className="absolute inset-x-0 bottom-0 p-10 flex flex-col gap-8 bg-gradient-to-t from-black via-black/60 to-transparent pt-32 z-20"
                    animate={{ opacity: showUI ? 1 : 0, y: showUI ? 0 : 20 }}
                    transition={{ duration: 0.4 }}
                >
                    {/* Progress Bar */}
                    <div className="flex gap-1 h-0.5 w-full max-w-3xl mx-auto opacity-60 hover:opacity-100 transition-opacity">
                        {selectedImages.map((_, idx) => (
                            <div key={idx} className="flex-1 bg-white/20 rounded-full overflow-hidden">
                                <motion.div 
                                    className="h-full bg-white shadow-[0_0_10px_white]"
                                    initial={{ width: idx < currentIndex ? '100%' : '0%' }}
                                    animate={{ width: idx <= currentIndex ? '100%' : '0%' }}
                                    transition={idx === currentIndex && isPlaying ? { duration: (vibe === 'energetic' ? 3000 : 5000) / playbackSpeed / 1000, ease: 'linear' } : { duration: 0 }}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Controls Row */}
                    <div className="flex items-end justify-between w-full max-w-5xl mx-auto">
                        
                        {/* Meta Info */}
                        <div className="flex-1">
                            <h2 className="text-3xl font-bold tracking-tight text-white mb-2 drop-shadow-xl">
                                {currentImage.caption || 'Untitled Memory'}
                            </h2>
                            <div className="flex items-center gap-2 text-xs font-mono text-white/70 uppercase tracking-widest">
                                <Calendar size={12} />
                                {new Date(currentImage.dateScanned).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </div>
                        </div>

                        {/* Center Playback Controls */}
                        <div className={`flex items-center gap-6 px-8 py-4 rounded-2xl ${THEME.glass}`}>
                            <ControlBtn onClick={() => setCurrentIndex(Math.max(0, currentIndex-1))} icon={SkipBack} size={20} />
                            
                            <button 
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                            >
                                {isPlaying ? <Pause size={20} fill="black" /> : <Play size={20} fill="black" className="ml-1" />}
                            </button>
                            
                            <ControlBtn onClick={() => setCurrentIndex(Math.min(selectedImages.length-1, currentIndex+1))} icon={SkipForward} size={20} />
                        </div>

                        {/* Right Tools */}
                        <div className="flex-1 flex justify-end gap-3">
                             <ControlBtn onClick={() => setPlaybackSpeed(s => s === 1 ? 2 : 1)} icon={Zap} label={playbackSpeed + 'x'} active={playbackSpeed > 1} />
                             <ControlBtn onClick={() => setIsMuted(!isMuted)} icon={isMuted ? VolumeX : Volume2} />
                             <ControlBtn onClick={toggleFullscreen} icon={isFullscreen ? Minimize2 : Maximize2} />
                             <button onClick={() => setStoryActive(false)} className="p-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-full transition-colors ml-2"><X size={16} /></button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}