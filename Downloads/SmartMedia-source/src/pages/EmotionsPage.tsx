import { useState, useEffect, useMemo } from 'react'
import { useAppStore, ImageMetadata } from '../store/appStore'
import {
  Smile, Frown, Angry, Meh, Heart, Sparkles, Sun, CloudRain,
  Zap, Wind, ArrowLeft, Image as ImageIcon, BarChart3, Play,
  Download, X, PieChart, BatteryLow, Activity, Coffee,
  HelpCircle, Award, Clock, Moon, Grid, Layers
} from 'lucide-react'
import Slideshow from '../components/Slideshow'
import PhotoViewer from '../components/PhotoViewer'

// --- Configuration & Constants ---
const SENTIMENTS = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  NEUTRAL: 'neutral',
  COMPLEX: 'complex'
}

const EMOTION_CONFIG: { [key: string]: { label: string; icon: any; color: string; hex: string; sentiment: string } } = {
  // Positive
  happy: { label: 'Joyful', icon: Smile, color: 'text-yellow-400', hex: '#facc15', sentiment: SENTIMENTS.POSITIVE },
  excited: { label: 'Excited', icon: Sparkles, color: 'text-pink-400', hex: '#ec4899', sentiment: SENTIMENTS.POSITIVE },
  peaceful: { label: 'Peaceful', icon: Wind, color: 'text-emerald-400', hex: '#34d399', sentiment: SENTIMENTS.POSITIVE },
  loving: { label: 'Loving', icon: Heart, color: 'text-rose-400', hex: '#fb7185', sentiment: SENTIMENTS.POSITIVE },
  content: { label: 'Content', icon: Coffee, color: 'text-teal-400', hex: '#2dd4bf', sentiment: SENTIMENTS.POSITIVE },
  proud: { label: 'Proud', icon: Award, color: 'text-amber-300', hex: '#fcd34d', sentiment: SENTIMENTS.POSITIVE },
  
  // Negative
  sad: { label: 'Melancholy', icon: Frown, color: 'text-blue-400', hex: '#60a5fa', sentiment: SENTIMENTS.NEGATIVE },
  angry: { label: 'Angry', icon: Angry, color: 'text-red-400', hex: '#f87171', sentiment: SENTIMENTS.NEGATIVE },
  fearful: { label: 'Fearful', icon: CloudRain, color: 'text-cyan-400', hex: '#22d3d8', sentiment: SENTIMENTS.NEGATIVE },
  disgusted: { label: 'Disgusted', icon: Frown, color: 'text-lime-400', hex: '#a3e635', sentiment: SENTIMENTS.NEGATIVE },
  stressed: { label: 'Stressed', icon: Activity, color: 'text-orange-400', hex: '#fb923c', sentiment: SENTIMENTS.NEGATIVE },
  anxious: { label: 'Anxious', icon: Activity, color: 'text-orange-300', hex: '#fdba74', sentiment: SENTIMENTS.NEGATIVE },
  
  // Neutral/Complex
  neutral: { label: 'Neutral', icon: Meh, color: 'text-gray-400', hex: '#9ca3af', sentiment: SENTIMENTS.NEUTRAL },
  surprised: { label: 'Surprised', icon: Zap, color: 'text-purple-400', hex: '#c084fc', sentiment: SENTIMENTS.COMPLEX },
  thoughtful: { label: 'Thoughtful', icon: Sun, color: 'text-amber-400', hex: '#fbbf24', sentiment: SENTIMENTS.COMPLEX },
  contemplative: { label: 'Reflective', icon: Moon, color: 'text-indigo-300', hex: '#a5b4fc', sentiment: SENTIMENTS.COMPLEX },
  tired: { label: 'Fatigued', icon: BatteryLow, color: 'text-slate-400', hex: '#94a3b8', sentiment: SENTIMENTS.NEUTRAL },
  skeptical: { label: 'Skeptical', icon: HelpCircle, color: 'text-violet-400', hex: '#a78bfa', sentiment: SENTIMENTS.COMPLEX },
  bored: { label: 'Bored', icon: Clock, color: 'text-zinc-400', hex: '#a1a1aa', sentiment: SENTIMENTS.NEUTRAL },
  confused: { label: 'Confused', icon: HelpCircle, color: 'text-indigo-400', hex: '#818cf8', sentiment: SENTIMENTS.COMPLEX },
}

interface EmotionGroup {
  id: string
  emotion: string
  label: string
  icon: any
  config: typeof EMOTION_CONFIG.happy
  images: ImageMetadata[]
}

export default function EmotionsPage() {
  // State
  const [emotions, setEmotions] = useState<EmotionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionGroup | null>(null)
  const [emotionImages, setEmotionImages] = useState<{ [key: string]: string }>({})
  const [activeFilter, setActiveFilter] = useState<string>('all')
  
  // Feature States
  const [showStats, setShowStats] = useState(false)
  const [showSlideshow, setShowSlideshow] = useState(false)
  const [slideshowImages, setSlideshowImages] = useState<ImageMetadata[]>([])
  const [selectedImage, setSelectedImage] = useState<ImageMetadata | null>(null)

  // Store
  const setCurrentScreen = useAppStore((state) => state.setCurrentScreen)
  const images = useAppStore((state) => state.images)

  // --- Data Processing ---
  useEffect(() => {
    processEmotions()
  }, [images])

  const processEmotions = async () => {
    setLoading(true)
    const emotionMap: { [key: string]: ImageMetadata[] } = {}
    
    // Filter & Group
    images.forEach(img => {
      const mediaType = img.mediaType || (img as any).media_type || 'image'
      if (mediaType === 'image' && img.emotion) {
        const key = img.emotion.toLowerCase()
        if (!emotionMap[key]) emotionMap[key] = []
        emotionMap[key].push(img)
      }
    })

    // Transform to EmotionGroups
    const groups: EmotionGroup[] = Object.entries(emotionMap)
      .map(([key, imgs]) => {
        const config = EMOTION_CONFIG[key] || EMOTION_CONFIG['neutral']
        return {
          id: key,
          emotion: key,
          label: config.label,
          icon: config.icon,
          config: config,
          images: imgs
        }
      })
      .filter(g => g.images.length > 0)
      .sort((a, b) => b.images.length - a.images.length)

    setEmotions(groups)
    setLoading(false)
  }

  // Load thumbnails lazily
  useEffect(() => {
    const fetchThumbnails = async () => {
      const targets = selectedEmotion ? selectedEmotion.images : emotions.flatMap(e => e.images.slice(0, 1))
      
      for (const img of targets) {
        if (!emotionImages[img.path]) {
          try {
            // @ts-ignore
            const thumb = await window.electronAPI?.getImageThumbnail(img.path)
            if (thumb) setEmotionImages(prev => ({ ...prev, [img.path]: thumb }))
          } catch (e) { console.error(e) }
        }
      }
    }
    if (!loading) fetchThumbnails()
  }, [selectedEmotion, emotions, loading])

  // --- Derived Statistics ---
  const stats = useMemo(() => {
    const total = emotions.reduce((acc, e) => acc + e.images.length, 0)
    const dominant = emotions[0] || null
    
    const sentimentCounts = {
      [SENTIMENTS.POSITIVE]: 0,
      [SENTIMENTS.NEGATIVE]: 0,
      [SENTIMENTS.NEUTRAL]: 0,
      [SENTIMENTS.COMPLEX]: 0
    }

    emotions.forEach(e => {
      if (sentimentCounts[e.config.sentiment] !== undefined) {
        sentimentCounts[e.config.sentiment] += e.images.length
      }
    })

    return { total, dominant, sentimentCounts }
  }, [emotions])

  const filteredEmotions = useMemo(() => {
    if (activeFilter === 'all') return emotions
    return emotions.filter(e => e.config.sentiment === activeFilter)
  }, [emotions, activeFilter])

  // --- Actions ---
  const handleExport = async (group: EmotionGroup) => {
    try {
      // @ts-ignore
      const path = await window.electronAPI?.selectFolder()
      if (path) {
        for (const img of group.images) {
          // @ts-ignore
          await window.electronAPI?.copyFile(img.path, `${path}/${group.label}_${img.filename}`)
        }
        alert(`Exported photos to ${path}`)
      }
    } catch (e) { console.error("Export error", e) }
  }

  // --- UI Components ---

  return (
    <div className="h-full flex flex-col bg-[#09090b] text-white font-sans overflow-hidden">
      
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#09090b]">
        <div className="flex items-center gap-4">
          {selectedEmotion ? (
            <button 
              onClick={() => setSelectedEmotion(null)} 
              className="group flex items-center gap-2 text-white/70 hover:text-white"
            >
              <div className="p-1.5 rounded-md bg-white/5 border border-white/10 group-hover:border-white/30">
                <ArrowLeft size={16} />
              </div>
              <span className="text-sm font-medium">Back</span>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-md shadow-sm">
                <Sparkles size={18} className="text-white" />
              </div>
              <h1 className="text-lg font-bold tracking-tight">Emotions</h1>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!selectedEmotion && (
            <div className="flex bg-white/5 p-1 rounded-md border border-white/10 mr-2">
              {['all', SENTIMENTS.POSITIVE, SENTIMENTS.NEGATIVE].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    activeFilter === filter 
                      ? 'bg-white/10 text-white shadow-sm border border-white/5' 
                      : 'text-white/40 hover:text-white/80'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          )}

          <button 
            onClick={() => setShowStats(true)} 
            className="p-2 rounded-md bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors"
          >
            <BarChart3 size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="p-6 max-w-[1600px] mx-auto min-h-full">
            
          {loading ? (
            <div className="h-[60vh] flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/10 border-t-indigo-500 rounded-full animate-spin"></div>
              <p className="mt-4 text-xs text-white/40">Loading...</p>
            </div>
          ) : selectedEmotion ? (
            
            /* --- DETAIL VIEW --- */
            <div>
              {/* Header Banner */}
              <div className="relative w-full h-[200px] rounded-xl overflow-hidden mb-6 border border-white/10 bg-[#121215]">
                {/* Background Tint */}
                <div className={`absolute inset-0 opacity-10 ${selectedEmotion.config.color.replace('text', 'bg')}`} />
                
                <div className="absolute inset-0 p-6 flex items-end justify-between">
                  <div className="flex items-center gap-5">
                    <div className={`w-16 h-16 rounded-lg flex items-center justify-center bg-[#09090b] border border-white/10 ${selectedEmotion.config.color}`}>
                      <selectedEmotion.icon size={32} />
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold text-white mb-1">{selectedEmotion.label}</h2>
                      <p className="text-white/50 text-xs uppercase tracking-wider font-semibold">
                        {selectedEmotion.images.length} Photos • {selectedEmotion.config.sentiment}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => { setSlideshowImages(selectedEmotion.images); setShowSlideshow(true); }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-bold hover:bg-white/90"
                    >
                      <Play size={14} fill="black" /> Slideshow
                    </button>
                    <button 
                      onClick={() => handleExport(selectedEmotion)}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/10"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {selectedEmotion.images.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => setSelectedImage(img)}
                    className="group relative aspect-square rounded-lg overflow-hidden bg-white/5 cursor-pointer border border-white/10 hover:border-white/40"
                  >
                    {emotionImages[img.path] ? (
                      <img 
                        src={emotionImages[img.path]} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" 
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-white/20">
                        <ImageIcon size={20} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          ) : emotions.length > 0 ? (

            /* --- DASHBOARD VIEW --- */
            <div className="space-y-8">
              {/* Highlight Card */}
              {stats.dominant && (
                  <div 
                    onClick={() => setSelectedEmotion(stats.dominant)}
                    className="relative h-40 rounded-xl overflow-hidden cursor-pointer group border border-white/10 hover:border-indigo-500/50 transition-colors bg-[#121215]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/20 to-transparent" />
                    <div className="absolute inset-0 p-6 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center bg-white/5 border border-white/10 ${stats.dominant.config.color}`}>
                          <stats.dominant.icon size={32} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">Dominant Mood</div>
                          <h2 className="text-3xl font-bold">{stats.dominant.label}</h2>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-4xl font-bold text-white">{stats.dominant.images.length}</p>
                        <p className="text-xs text-white/40 uppercase">Memories</p>
                      </div>
                    </div>
                  </div>
              )}

              {/* Filtered Grid */}
              <div>
                  <h3 className="text-sm font-bold text-white/50 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Grid size={14} /> 
                    {activeFilter === 'all' ? 'All Emotions' : activeFilter}
                  </h3>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {filteredEmotions.map((emotion) => (
                      <div
                        key={emotion.id}
                        onClick={() => setSelectedEmotion(emotion)}
                        className="group cursor-pointer bg-[#121215] border border-white/10 hover:border-white/30 rounded-xl p-4 flex flex-col items-center gap-3 hover:bg-white/5 transition-all duration-150"
                      >
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-white/5 group-hover:scale-110 transition-transform duration-200 ${emotion.config.color}`}>
                          <emotion.icon size={24} />
                        </div>
                        <div className="text-center w-full">
                          <h4 className="font-semibold text-white text-sm">{emotion.label}</h4>
                          <p className="text-[10px] text-white/40 mt-1 uppercase font-bold">{emotion.images.length} Photos</p>
                        </div>
                      </div>
                    ))}
                  </div>
              </div>
            </div>

          ) : (
            /* --- EMPTY STATE --- */
            <div className="h-[50vh] flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
                <Layers size={32} className="text-white/20" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">No Emotions Detected</h2>
              <button 
                onClick={() => setCurrentScreen('folderSelection')} 
                className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wide"
              >
                Scan Photos
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats Overlay (Simple Modal) */}
      {showStats && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setShowStats(false)}
        >
          <div 
            className="bg-[#121215] border border-white/20 rounded-xl w-[400px] max-h-[80vh] overflow-y-auto p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <PieChart size={18} className="text-indigo-400" /> Statistics
              </h3>
              <button onClick={() => setShowStats(false)} className="text-white/50 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-1 p-4 bg-white/5 rounded-lg border border-white/10 text-center">
                   <div className="text-2xl font-bold">{stats.total}</div>
                   <div className="text-[10px] text-white/40 uppercase font-bold">Total Photos</div>
                </div>
                <div className="flex-1 p-4 bg-white/5 rounded-lg border border-white/10 text-center">
                   <div className="text-2xl font-bold">{emotions.length}</div>
                   <div className="text-[10px] text-white/40 uppercase font-bold">Categories</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase text-white/40 mb-2">Breakdown</h4>
                {emotions.map(e => (
                  <div key={e.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded border border-transparent hover:border-white/10">
                    <e.icon size={14} className={e.config.color} />
                    <span className="text-sm flex-1">{e.label}</span>
                    <span className="text-xs text-white/50 font-mono">{e.images.length}</span>
                    <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                       <div className="h-full bg-white/50" style={{ width: `${(e.images.length / stats.total) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Media Viewers */}
      {selectedImage && (
        <PhotoViewer
          image={selectedImage}
          imagePreview={emotionImages[selectedImage.path] || selectedImage.path}
          onClose={() => setSelectedImage(null)}
        />
      )}

      {showSlideshow && slideshowImages.length > 0 && (
        <Slideshow
          images={slideshowImages}
          startIndex={0}
          onClose={() => setShowSlideshow(false)}
        />
      )}
    </div>
  )
}