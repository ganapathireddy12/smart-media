import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, ImageMetadata } from '../store/appStore'
import { reverseGeocode, formatLocation, type LocationInfo } from '../utils/geocoding'
import {
  X,
  Download,
  Share2,
  Trash2,
  Edit3,
  Heart,
  Tag,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Plus,
  Lock,
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Image as ImageIcon,
  Compass,
  Info,
  Play,
  Pause,
  Printer,
  Volume2,
  VolumeX,
  Settings,
  SkipBack,
  SkipForward,
  MonitorPlay,
  Repeat,
  Music,
  Activity,
  Type,
  MessageSquare
} from 'lucide-react'
import PhotoEditor from './PhotoEditor'

// --- Helper Functions ---

// Safe date parser for EXIF and ISO formats
const safeParseDate = (dateString?: string): Date => {
  if (!dateString) return new Date()
  try {
    if (dateString.match(/^\d{4}:\d{2}:\d{2}/)) {
      const normalized = dateString.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
      const d = new Date(normalized)
      return isNaN(d.getTime()) ? new Date() : d
    }
    const d = new Date(dateString)
    return isNaN(d.getTime()) ? new Date() : d
  } catch {
    return new Date()
  }
}

// Helper to convert Windows path to file:// URL
const pathToFileUrl = (path: string): string => {
  const normalized = path.replace(/\\/g, '/')
  if (normalized.match(/^[A-Za-z]:/)) {
    return `file:///${encodeURI(normalized).replace(/#/g, '%23')}`
  }
  return `file://${encodeURI(normalized).replace(/#/g, '%23')}`
}

const getMediaType = (image: any): 'image' | 'video' | 'audio' | 'document' => {
  return image.mediaType || image.media_type || 'image'
}

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return "00:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

// --- Custom Media Player Component (VLC Style) ---

interface CustomMediaPlayerProps {
  src: string
  type: 'video' | 'audio'
  filename: string
  zoom: number
}

const CustomMediaPlayer = ({ src, type, filename, zoom }: CustomMediaPlayerProps) => {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [loop, setLoop] = useState(false)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Handle Controls Visibility
  const handleMouseMove = () => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => {
      if (playing) setShowControls(false)
    }, 3000)
  }

  useEffect(() => {
    const el = mediaRef.current
    if (!el) return

    const updateTime = () => setCurrentTime(el.currentTime)
    const updateDuration = () => setDuration(el.duration)
    const onEnded = () => setPlaying(false)

    el.addEventListener('timeupdate', updateTime)
    el.addEventListener('loadedmetadata', updateDuration)
    el.addEventListener('ended', onEnded)

    return () => {
      el.removeEventListener('timeupdate', updateTime)
      el.removeEventListener('loadedmetadata', updateDuration)
      el.removeEventListener('ended', onEnded)
    }
  }, [src])

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!mediaRef.current) return
      
      switch(e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'arrowright':
          skip(10)
          break
        case 'arrowleft':
          skip(-10)
          break
        case 'arrowup':
          e.preventDefault()
          handleVolumeChange(Math.min(volume + 0.1, 1))
          break
        case 'arrowdown':
          e.preventDefault()
          handleVolumeChange(Math.max(volume - 0.1, 0))
          break
        case 'm':
          toggleMute()
          break
        case 'f':
          toggleFullscreen()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playing, volume, muted])

  const togglePlay = () => {
    if (mediaRef.current) {
      if (playing) mediaRef.current.pause()
      else mediaRef.current.play()
      setPlaying(!playing)
    }
  }

  const toggleMute = () => {
    if (mediaRef.current) {
      mediaRef.current.muted = !muted
      setMuted(!muted)
    }
  }

  const handleVolumeChange = (newVal: number) => {
    if (mediaRef.current) {
      mediaRef.current.volume = newVal
      setVolume(newVal)
      setMuted(newVal === 0)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (mediaRef.current) {
      mediaRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const skip = (seconds: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime += seconds
    }
  }

  const changeSpeed = () => {
    const speeds = [0.5, 1, 1.25, 1.5, 2]
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length
    const nextSpeed = speeds[nextIdx]
    if (mediaRef.current) {
      mediaRef.current.playbackRate = nextSpeed
      setPlaybackSpeed(nextSpeed)
    }
  }

  const toggleFullscreen = async () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const togglePiP = async () => {
    if (mediaRef.current && document.pictureInPictureEnabled) {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture()
        } else {
            // @ts-ignore
            await mediaRef.current.requestPictureInPicture()
        }
    }
  }

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full flex flex-col items-center justify-center bg-black group overflow-hidden select-none"
      onMouseMove={handleMouseMove}
      onDoubleClick={toggleFullscreen}
      onClick={() => { if(type === 'video') togglePlay() }}
    >
      {type === 'video' ? (
        <>
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={src}
            className="w-full h-full object-contain"
            style={{ transform: `scale(${zoom})` }}
            loop={loop}
          />
          {/* Video Title Overlay */}
          <div className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent pt-4 pb-8 px-6 transition-opacity duration-300 ${showControls || !playing ? 'opacity-100' : 'opacity-0'}`}>
            <h3 className="text-white text-lg font-medium truncate">{filename}</h3>
            <p className="text-white/50 text-xs mt-0.5">Video Playback</p>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center w-full h-full pb-20">
             {/* Audio Visualization / Art */}
            <div className={`w-64 h-64 rounded-full flex items-center justify-center border-4 border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.1)] ${playing ? 'animate-pulse' : ''}`}>
               <div className="w-48 h-48 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
                    <Music size={64} className="text-white drop-shadow-md" />
               </div>
            </div>
            <h3 className="text-white text-xl font-medium mt-8 mb-2">{filename}</h3>
            <p className="text-white/50 font-mono text-sm">Audio Playback</p>
            <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={src} loop={loop} />
        </div>
      )}

      {/* Overlay Play Button (Center) */}
      {!playing && type === 'video' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10">
            <Play size={40} className="text-white ml-2" fill="white" />
          </div>
        </div>
      )}

      {/* Control Bar */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent pt-12 pb-4 px-6 transition-opacity duration-300 ${showControls || !playing ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Progress Bar */}
        <div className="group/slider relative h-1.5 w-full bg-white/20 rounded-full cursor-pointer mb-4 hover:h-2.5 transition-all">
          <div 
            className="absolute top-0 left-0 h-full bg-blue-500 rounded-full" 
            style={{ width: `${(currentTime / duration) * 100}%` }} 
          />
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Play/Pause */}
            <button onClick={togglePlay} className="text-white hover:text-blue-400 transition-colors">
              {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
            </button>

            {/* Skip Buttons */}
            <button onClick={() => skip(-10)} className="text-white/70 hover:text-white transition-colors">
              <SkipBack size={20} />
            </button>
            <button onClick={() => skip(10)} className="text-white/70 hover:text-white transition-colors">
              <SkipForward size={20} />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2 group/vol">
              <button onClick={toggleMute} className="text-white/70 hover:text-white">
                {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <div className="w-0 overflow-hidden group-hover/vol:w-24 transition-all duration-300">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>

            {/* Time */}
            <span className="text-xs font-mono text-white/70 ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Loop */}
            <button 
                onClick={() => setLoop(!loop)} 
                className={`transition-colors ${loop ? 'text-blue-400' : 'text-white/70 hover:text-white'}`}
                title="Loop"
            >
              <Repeat size={18} />
            </button>

            {/* Speed */}
            <button onClick={changeSpeed} className="text-xs font-bold text-white/70 hover:text-white w-8 text-center">
              {playbackSpeed}x
            </button>

            {/* PiP */}
            {type === 'video' && (
                <button onClick={togglePiP} className="text-white/70 hover:text-white" title="Picture in Picture">
                <MonitorPlay size={20} />
                </button>
            )}

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="text-white/70 hover:text-white">
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Main PhotoViewer Component ---

interface PhotoViewerProps {
  image: ImageMetadata
  imagePreview?: string | null
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
}

export default function PhotoViewer({
  image,
  imagePreview = null,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false
}: PhotoViewerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedFilename, setEditedFilename] = useState(image.filename)
  const [newTag, setNewTag] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [showAlbumMenu, setShowAlbumMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showSaveOptions, setShowSaveOptions] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'zip' | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isFavorite, setIsFavorite] = useState(image.isFavorite)
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null)
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [isReanalyzing, setIsReanalyzing] = useState(false)
  const [reanalyzeMessage, setReanalyzeMessage] = useState<string | null>(null)

  // Resolved preview: use prop if available, otherwise auto-fetch from disk
  const [resolvedPreview, setResolvedPreview] = useState<string | null>(imagePreview ?? null)

  useEffect(() => {
    setResolvedPreview(imagePreview ?? null)
    if (!imagePreview && getMediaType(image) === 'image') {
      // Auto-load the image via Electron API or direct file URL
      let active = true
        ; (async () => {
          try {
            // @ts-ignore
            const preview = await window.electronAPI?.getImageThumbnail(image.path, image.metadata)
            if (active && preview) setResolvedPreview(preview)
          } catch {
            // Fallback: use file:// URL directly
            if (active) setResolvedPreview(pathToFileUrl(image.path))
          }
        })()
      return () => { active = false }
    }
  }, [image.id, image.path, imagePreview])

  // Sync favorite state when image changes
  useEffect(() => {
    setIsFavorite(image.isFavorite)
  }, [image.id, image.isFavorite])

  // Fetch location name from GPS coordinates
  useEffect(() => {
    const fetchLocation = async () => {
      const img = image as any
      const lat = img.gps_latitude || img.metadata?.gps?.lat
      const lon = img.gps_longitude || img.metadata?.gps?.lon
      
      if (lat && lon) {
        setLoadingLocation(true)
        try {
          const info = await reverseGeocode(lat, lon)
          setLocationInfo(info)
        } catch (error) {
          console.error('[PhotoViewer] Failed to fetch location:', error)
        } finally {
          setLoadingLocation(false)
        }
      } else {
        setLocationInfo(null)
      }
    }
    
    fetchLocation()
  }, [image.id])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isPlaying) {
      if (hasNext && onNext) {
        interval = setInterval(onNext, 3000)
      } else {
        setIsPlaying(false) // Stop if no next image
      }
    }
    return () => clearInterval(interval)
  }, [isPlaying, hasNext, onNext])

  const handlePrint = () => {
    // Create a print-friendly window
    const printWindow = window.open('', '_blank')
    if (printWindow && resolvedPreview) {
      const printDate = safeParseDate(image.dateScanned).toLocaleDateString()
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Print: ${image.filename}</title>
            <style>
              @media print {
                @page { margin: 0.5in; }
                body { margin: 0; padding: 0; }
              }
              body {
                margin: 0;
                padding: 20px;
                font-family: Arial, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
              }
              img {
                max-width: 100%;
                max-height: 90vh;
                object-fit: contain;
                margin: 20px 0;
              }
              .info {
                text-align: center;
                margin-top: 20px;
                font-size: 12px;
                color: #666;
              }
              h1 {
                font-size: 18px;
                margin: 10px 0;
              }
              .metadata {
                font-size: 11px;
                color: #999;
                margin-top: 10px;
              }
            </style>
          </head>
          <body>
            <img src="${resolvedPreview}" alt="${image.filename}" />
            <div class="info">
              <h1>${image.filename}</h1>
              ${image.caption ? `<p>${image.caption}</p>` : ''}
              <div class="metadata">
                ${image.width && image.height ? `Dimensions: ${image.width} × ${image.height} px | ` : ''}
                Date: ${printDate}
              </div>
            </div>
          </body>
        </html>
      `)
      printWindow.document.close()
      // Wait for image to load before printing
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print()
        }, 250)
      }
    }
  }

  const [editState, setEditState] = useState({
    brightness: image.brightness || 100,
    contrast: image.contrast || 100,
    saturation: image.saturation || 100,
    sharpness: image.sharpness || 0,
    blur: image.blur || 0,
    rotate: image.rotate || 0,
    flipX: image.flipX || false,
    flipY: image.flipY || false,
  })

  const updateImage = useAppStore((state) => state.updateImage)
  const toggleFavorite = useAppStore((state) => state.toggleFavorite)
  const moveToTrash = useAppStore((state) => state.moveToTrash)
  const moveToLocker = useAppStore((state) => state.moveToLocker)
  const albums = useAppStore((state) => state.albums)
  const addImageToAlbum = useAppStore((state) => state.addImageToAlbum)
  const removeImageFromAlbum = useAppStore((state) => state.removeImageFromAlbum)
  const deleteAttempts = useAppStore((state) => state.deleteAttempts)
  const incrementDeleteAttempt = useAppStore((state) => state.incrementDeleteAttempt)
  const saveImageAsOriginal = useAppStore((state) => state.saveImageAsOriginal)
  const saveImageAsCopy = useAppStore((state) => state.saveImageAsCopy)

  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditedFilename(image.filename)
    // Load existing edit state when image changes
    setEditState({
      brightness: image.brightness || 100,
      contrast: image.contrast || 100,
      saturation: image.saturation || 100,
      sharpness: image.sharpness || 0,
      blur: image.blur || 0,
      rotate: image.rotate || 0,
      flipX: image.flipX || false,
      flipY: image.flipY || false,
    })
  }, [image])

  useEffect(() => {
    if (showTagInput && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [showTagInput])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with video inputs
      if (getMediaType(image) !== 'image') {
          if (e.key === 'Escape') onClose()
          return
      }
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrevious && onPrevious) onPrevious()
      if (e.key === 'ArrowRight' && hasNext && onNext) onNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onPrevious, onNext, hasPrevious, hasNext, image])

  const handleSaveFilename = async () => {
    if (editedFilename !== image.filename) {
      // In a real app, you'd rename the file on disk
      updateImage(image.id, { filename: editedFilename })
    }
    setIsEditing(false)
  }

  const handleAddTag = async () => {
    if (newTag.trim() && !image.tags.includes(newTag.trim())) {
      const newTags = [...image.tags, newTag.trim()]
      updateImage(image.id, { tags: newTags })
      try {
        // @ts-ignore
        await window.electronAPI?.updateImageTags(image.id, newTags)
      } catch (error) {
        console.error('Failed to persist tags:', error)
      }
      setNewTag('')
    }
    setShowTagInput(false)
  }

  const handleRemoveTag = async (tagToRemove: string) => {
    const newTags = image.tags.filter(t => t !== tagToRemove)
    updateImage(image.id, { tags: newTags })
    try {
      // @ts-ignore
      await window.electronAPI?.updateImageTags(image.id, newTags)
    } catch (error) {
      console.error('Failed to persist tags:', error)
    }
  }

  const handleDownload = async () => {
    try {
      await window.electronAPI?.saveImage(image.path)
    } catch (error) {
      console.error('Download error:', error)
    }
  }

  const handleReanalyze = async () => {
    if (isReanalyzing) return
    setIsReanalyzing(true)
    setReanalyzeMessage(null)
    try {
      const result = await window.electronAPI?.processImage(image.path)
      if (result?.success) {
        updateImage(image.id, {
          caption: result.caption,
          tags: result.tags || result.objects || image.tags,
          objects: result.objects || image.objects,
          emotion: result.emotion || image.emotion,
        })
        setReanalyzeMessage('Re-analyzed successfully!')
      } else {
        setReanalyzeMessage('Re-analysis failed. Try again.')
      }
    } catch (error) {
      setReanalyzeMessage('Re-analysis failed. Try again.')
    } finally {
      setIsReanalyzing(false)
      setTimeout(() => setReanalyzeMessage(null), 3000)
    }
  }

  const handleExportPdf = async () => {
    setExportMessage(null)
    setExporting('pdf')
    try {
      const result = await window.electronAPI?.exportToPDF([image.path])
      if (result?.success) {
        setExportMessage('PDF saved successfully')
        await window.electronAPI?.showNotification('Export complete', 'PDF saved')
      } else if (!result?.canceled) {
        setExportMessage(result?.error || 'PDF export failed')
      }
    } catch (error) {
      console.error('PDF export error:', error)
      setExportMessage('PDF export failed')
    }
    setExporting(null)
  }

  const handleExportZip = async () => {
    setExportMessage(null)
    setExporting('zip')
    try {
      const result = await window.electronAPI?.exportToZip([image.path], { includeVideos: false })
      if (result?.success) {
        setExportMessage('ZIP created successfully')
        await window.electronAPI?.showNotification('Export complete', 'ZIP archive saved')
      } else if (!result?.canceled) {
        setExportMessage(result?.error || 'ZIP export failed')
      }
    } catch (error) {
      console.error('ZIP export error:', error)
      setExportMessage('ZIP export failed')
    }
    setExporting(null)
  }

  const handleShare = async (method: string) => {
    try {
      if (method === 'copy') {
        await navigator.clipboard.writeText(image.path)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        await window.electronAPI?.shareImage(image.path)
      }
      // Log share history
      updateImage(image.id, {
        shareHistory: [
          ...(image.shareHistory || []),
          { sharedAt: new Date().toISOString(), method }
        ]
      })
    } catch (error) {
      console.error('Share error:', error)
    }
    setShowShareMenu(false)
  }

  const handleDelete = async () => {
    const attempts = deleteAttempts[image.id] || 0
    if (attempts >= 4) {
      // Show stronger confirmation after 5 attempts
      setShowDeleteConfirm(true)
    } else {
      incrementDeleteAttempt(image.id)
      await moveToTrash(image.id)
      onClose()
    }
  }

  const handlePermanentDelete = async () => {
    try {
      await window.electronAPI?.deleteImage(image.path)
      await moveToTrash(image.id)
      onClose()
    } catch (error) {
      console.error('Delete error:', error)
    }
    setShowDeleteConfirm(false)
  }

  const resetEdits = () => setEditState({ brightness: 100, contrast: 100, saturation: 100, sharpness: 0, blur: 0, rotate: 0, flipX: false, flipY: false })

  const handleSaveClick = () => {
    if (isEditing) {
      // Check if edits were made
      const hasEdits = editState.brightness !== 100 || editState.contrast !== 100 ||
        editState.saturation !== 100 || editState.sharpness !== 0 ||
        editState.blur !== 0 || editState.rotate !== 0 ||
        editState.flipX || editState.flipY

      if (hasEdits) {
        setShowSaveOptions(true)
      } else {
        setIsEditing(false)
      }
    }
  }

  const handleSaveAsOriginal = () => {
    // Save the edited image metadata (edit state will be applied when rendering)
    saveImageAsOriginal(image.id, editState)
    setSaveMessage('Changes overwritten into original')
    setTimeout(() => setSaveMessage(null), 3000)
    setShowSaveOptions(false)
    setIsEditing(false)
    resetEdits()
  }

  const handleSaveAsCopy = () => {
    // Create a new photo entry with edits
    saveImageAsCopy(image.id, editState)
    setSaveMessage('Saved as copy')
    setTimeout(() => setSaveMessage(null), 3000)
    setShowSaveOptions(false)
    setIsEditing(false)
    resetEdits()
  }

  const mediaType = getMediaType(image)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]"
      onClick={onClose}
      style={{ backfaceVisibility: 'hidden' }}
    >
      {/* Navigation Arrows (Hide for video/audio to prevent accidental clicks) */}
      {mediaType === 'image' && hasPrevious && onPrevious && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPrevious()
          }}
          className="fixed left-4 top-1/2 -translate-y-1/2 z-60 p-3 rounded-full glass-panel hover:bg-white/20 transition-all"
          title="Previous (Left Arrow)"
        >
          <ChevronLeft size={24} className="text-white" />
        </button>
      )}
      
      {mediaType === 'image' && hasNext && onNext && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNext()
          }}
          className="fixed right-4 top-1/2 -translate-y-1/2 z-60 p-3 rounded-full glass-panel hover:bg-white/20 transition-all"
          title="Next (Right Arrow)"
        >
          <ChevronRight size={24} className="text-white" />
        </button>
      )}

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="max-w-6xl w-full h-[90vh] rounded-2xl overflow-hidden flex border border-[#2a2a2a] bg-[#1c1c1c]"
        onClick={(e) => e.stopPropagation()}
        style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
      >
        {/* Image/Media Section */}
        <div className="flex-1 bg-black flex flex-col relative">
          
          {/* Header Toolbar (Hide when playing video fullscreen implicitly) */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-[#2a2a2a] bg-[#1c1c1c] relative z-20">
            <div className="flex items-center gap-2">
              {/* Edit Toggle - Only for images */}
              {mediaType === 'image' && (
                <button
                  onClick={() => isEditing ? handleSaveClick() : setIsEditing(true)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150
                            ${isEditing ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-[#252525] hover:bg-[#2a2a2a] text-white/60 border border-[#333]'}`}
                >
                  {isEditing ? <Check size={14} /> : <Edit3 size={14} />}
                  {isEditing ? 'Save' : 'Edit'}
                </button>
              )}

              {/* Save Message */}
              {saveMessage && (
                <span className="text-[11px] text-green-400 animate-pulse">
                  {saveMessage}
                </span>
              )}

              {/* Zoom Controls - Only for images */}
              {mediaType === 'image' && (
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                    className="p-1.5 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-white/60 transition-colors duration-150"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span className="text-[10px] text-white/40 w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button
                    onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                    className="p-1.5 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-white/60 transition-colors duration-150"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    onClick={() => setZoom(1)}
                    className="p-1.5 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-white/60 transition-colors duration-150"
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Slideshow (Image only) */}
              {mediaType === 'image' && (
                <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className={`p-2 rounded-lg transition-colors duration-150 ${isPlaying ? 'bg-[#0067c0] text-white' : 'bg-[#252525] hover:bg-[#2a2a2a] text-white/60'}`}
                    title="Slideshow"
                >
                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
              )}

              {/* Print */}
              <button
                onClick={handlePrint}
                className="p-2 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-white/60 transition-colors duration-150"
                title="Print"
              >
                <Printer size={16} />
              </button>

              <div className="w-px h-6 bg-[#2a2a2a] mx-1" />

              {/* Favorite */}
              <button
                onClick={async () => {
                  const newFavoriteStatus = !isFavorite
                  setIsFavorite(newFavoriteStatus)
                  await toggleFavorite(image.id)
                }}
                className={`p-2 rounded-lg transition-colors duration-150 ${
                  isFavorite ? 'bg-red-500/20 text-red-400' : 'bg-[#252525] hover:bg-[#2a2a2a] text-white/60'
                }`}
                title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              >
                <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
              </button>

              {/* Download */}
              <button
                onClick={handleDownload}
                className="p-2 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-white/60 transition-colors duration-150"
              >
                <Download size={16} />
              </button>

              {/* Share */}
              <div className="relative">
                <button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="p-2 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-white/60 transition-colors duration-150"
                >
                  <Share2 size={16} />
                </button>
                <AnimatePresence>
                  {showShareMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-48 rounded-xl p-2 z-20 border border-[#2a2a2a] bg-[#1c1c1c]"
                    >
                      <button
                        onClick={() => handleShare('native')}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#252525] text-[11px] text-white/70"
                      >
                        <Share2 size={12} />
                        Share...
                      </button>
                      <button
                        onClick={() => handleShare('copy')}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#252525] text-[11px] text-white/70"
                      >
                        {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                        {copied ? 'Copied!' : 'Copy Path'}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Lock */}
              <button
                onClick={() => { moveToLocker(image.id); onClose() }}
                className="p-2 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-white/60 transition-colors duration-150"
                title="Move to Private Locker"
              >
                <Lock size={16} />
              </button>

              {/* Delete */}
              <button
                onClick={handleDelete}
                className="p-2 rounded-lg bg-[#252525] hover:bg-red-500/30 text-white/60 hover:text-red-400 transition-colors duration-150"
              >
                <Trash2 size={16} />
              </button>

              {/* Close */}
              <button
                onClick={onClose}
                className="p-2 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-white/60 transition-colors duration-150 ml-2"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* MAIN DISPLAY AREA */}
          <div className="flex-1 flex items-center justify-center overflow-hidden bg-[#000000] relative">
            {isEditing && resolvedPreview ? (
              <div className="absolute inset-0 z-10 bg-black">
                <PhotoEditor
                  imageSrc={resolvedPreview!}
                  onSave={async (newImageSrc) => {
                    try {
                      // @ts-ignore
                      await window.electronAPI.saveBase64Image(newImageSrc, image.path)
                      setResolvedPreview(newImageSrc)
                      setSaveMessage('Image saved!')
                      setTimeout(() => setSaveMessage(null), 3000)
                      setIsEditing(false)
                    } catch (error) {
                      console.error('Failed to save image:', error)
                      setSaveMessage('Failed to save')
                    }
                  }}
                  onCancel={() => setIsEditing(false)}
                />
              </div>
            ) : mediaType === 'document' ? (
              // Enhanced Document Viewer
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-white">
                <div className="max-w-3xl w-full glass-panel rounded-2xl p-8 space-y-8">
                  {/* Document Header */}
                  <div className="flex items-center gap-6">
                    <div className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg ${
                      image.filename?.toLowerCase().endsWith('.pdf') ? 'bg-red-500/20 shadow-red-500/20' :
                      image.filename?.toLowerCase().match(/\.(doc|docx)$/) ? 'bg-blue-500/20 shadow-blue-500/20' :
                      image.filename?.toLowerCase().match(/\.(txt|md|rtf)$/) ? 'bg-green-500/20 shadow-green-500/20' :
                      image.filename?.toLowerCase().match(/\.(xls|xlsx)$/) ? 'bg-emerald-500/20 shadow-emerald-500/20' :
                      image.filename?.toLowerCase().match(/\.(ppt|pptx)$/) ? 'bg-orange-500/20 shadow-orange-500/20' :
                      'bg-gray-500/20 shadow-gray-500/20'
                    }`}>
                      <FileText size={36} className={`${
                        image.filename?.toLowerCase().endsWith('.pdf') ? 'text-red-400' :
                        image.filename?.toLowerCase().match(/\.(doc|docx)$/) ? 'text-blue-400' :
                        image.filename?.toLowerCase().match(/\.(txt|md|rtf)$/) ? 'text-green-400' :
                        image.filename?.toLowerCase().match(/\.(xls|xlsx)$/) ? 'text-emerald-400' :
                        image.filename?.toLowerCase().match(/\.(ppt|pptx)$/) ? 'text-orange-400' :
                        'text-gray-400'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold mb-2 text-white">{image.filename}</h3>
                      <p className="text-base text-white/60 mb-1">
                        {image.filename?.toLowerCase().endsWith('.pdf') ? 'PDF Document' :
                         image.filename?.toLowerCase().match(/\.(doc|docx)$/) ? 'Microsoft Word Document' :
                         image.filename?.toLowerCase().match(/\.(txt|md)$/) ? 'Text Document' :
                         image.filename?.toLowerCase().match(/\.(rtf)$/) ? 'Rich Text Document' :
                         image.filename?.toLowerCase().match(/\.(xls|xlsx)$/) ? 'Microsoft Excel Spreadsheet' :
                         image.filename?.toLowerCase().match(/\.(ppt|pptx)$/) ? 'Microsoft PowerPoint Presentation' :
                         'Document'}
                      </p>
                      
                      {/* Document Stats */}
                      <div className="flex items-center gap-4 text-sm text-white/50">
                        {image.metadata?.pages && (
                          <span className="flex items-center gap-1">
                            <FileText size={14} />
                            {image.metadata.pages} pages
                          </span>
                        )}
                        {image.metadata?.file_size && (
                          <span className="flex items-center gap-1">
                            <Info size={14} />
                            {(image.metadata.file_size / 1024 / 1024).toFixed(1)} MB
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Activity size={14} />
                          {safeParseDate(image.dateScanned).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Extracted Text Preview */}
                  {(image.extractedText || image.metadata?.extracted_text) && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Type size={16} className="text-blue-400" />
                        <h4 className="text-sm font-semibold text-white/80">Content Preview</h4>
                      </div>
                      <div className="max-h-80 overflow-y-auto bg-black/40 rounded-xl p-5 border border-white/10">
                        <pre className="whitespace-pre-wrap font-sans text-sm text-white/90 leading-relaxed">
                          {(image.extractedText || image.metadata?.extracted_text || '').substring(0, 2000)}
                        </pre>
                        {(image.extractedText || image.metadata?.extracted_text || '').length > 2000 && (
                          <div className="text-center pt-4 border-t border-white/10 mt-4">
                            <p className="text-white/50 text-sm italic">... and {Math.ceil(((image.extractedText || image.metadata?.extracted_text || '').length - 2000) / 100)} more lines</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Primary Action Buttons */}
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={async () => {
                        try {
                          await window.electronAPI?.openPath(image.path)
                        } catch (error) {
                          console.error('Failed to open document:', error)
                          // Show error notification
                          if (window.electronAPI?.showNotification) {
                            await window.electronAPI.showNotification('Error', 'Failed to open document. Please check if the file still exists.')
                          }
                        }
                      }}
                      className="flex items-center justify-center gap-3 px-6 py-4 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-xl transition-all duration-200 border border-blue-500/30 hover:border-blue-500/50 font-medium"
                    >
                      <FileText size={20} />
                      <span>Open Original File</span>
                    </button>
                    
                    <button
                      onClick={async () => {
                        try {
                          await window.electronAPI?.showItemInFolder?.(image.path)
                        } catch (error) {
                          console.error('Failed to show in folder:', error)
                          // Fallback to opening parent directory
                          try {
                            const parentPath = image.path.substring(0, image.path.lastIndexOf('\\'))
                            await window.electronAPI?.openPath(parentPath)
                          } catch (fallbackError) {
                            console.error('Failed to open parent directory:', fallbackError)
                            if (window.electronAPI?.showNotification) {
                              await window.electronAPI.showNotification('Error', 'Failed to show file location.')
                            }
                          }
                        }
                      }}
                      className="flex items-center justify-center gap-3 px-6 py-4 glass-subtle hover:bg-white/15 rounded-xl transition-all duration-200 border border-white/10 hover:border-white/20 font-medium text-white/80"
                    >
                      <Compass size={20} />
                      <span>Show in Folder</span>
                    </button>
                  </div>

                  {/* Secondary Actions */}
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-2 px-4 py-2.5 glass-subtle hover:bg-white/10 rounded-lg transition-all text-sm text-white/70 hover:text-white"
                    >
                      <Download size={16} />
                      Save Copy
                    </button>
                    
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(image.path)
                          setCopied(true)
                          setTimeout(() => setCopied(false), 2000)
                        } catch (error) {
                          console.error('Failed to copy path:', error)
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 glass-subtle hover:bg-white/10 rounded-lg transition-all text-sm text-white/70 hover:text-white"
                    >
                      {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                      {copied ? 'Copied!' : 'Copy Path'}
                    </button>

                    <button
                      onClick={handlePrint}
                      className="flex items-center gap-2 px-4 py-2.5 glass-subtle hover:bg-white/10 rounded-lg transition-all text-sm text-white/70 hover:text-white"
                    >
                      <Printer size={16} />
                      Print Info
                    </button>
                  </div>

                  {/* Document Path */}
                  <div className="pt-4 border-t border-white/10">
                    <div className="flex items-start gap-3">
                      <Compass size={14} className="text-white/40 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-white/40 uppercase tracking-wider mb-1">File Location</p>
                        <p className="text-sm text-white/70 font-mono break-all leading-relaxed">{image.path}</p>
                      </div>
                    </div>
                  </div>

                  {/* Caption */}
                  {image.caption && (
                    <div className="pt-4 border-t border-white/10">
                      <div className="flex items-start gap-3">
                        <MessageSquare size={14} className="text-white/40 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Description</p>
                          <p className="text-sm text-white/80 leading-relaxed">{image.caption}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : mediaType === 'video' || mediaType === 'audio' ? (
                // Use Custom VLC-style Player
                <CustomMediaPlayer 
                    src={pathToFileUrl(image.path)} 
                    type={mediaType} 
                    filename={image.filename}
                    zoom={zoom}
                />
            ) : resolvedPreview ? (
              /* Standard Image Viewer */
              <motion.img
                key={image.id}
                src={resolvedPreview}
                alt={image.caption}
                className="max-w-full max-h-full object-contain"
                style={{ transform: `scale(${zoom})` }}
                transition={{ type: 'spring', stiffness: 300 }}
                draggable={false}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-white/30">
                <ImageIcon size={48} className="animate-pulse" />
                <p className="text-[12px] mt-2">Loading image...</p>
              </div>
            )}
          </div>
        </div>

        {/* Details Sidebar */}
        <div className="w-80 p-5 flex flex-col border-l border-[#2a2a2a] overflow-y-auto bg-[#0f0f0f]">
          
          {/* Filename */}
          <div>
            <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5">Filename</p>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedFilename}
                  onChange={(e) => setEditedFilename(e.target.value)}
                  className="flex-1 px-2 py-1 bg-[#252525] rounded-lg text-white text-[11px] 
                             border border-[#333] focus:border-[#0067c0] focus:outline-none transition-colors duration-150"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveFilename()
                    if (e.key === 'Escape') setIsEditing(false)
                  }}
                />
                <button
                  onClick={handleSaveFilename}
                  className="p-1 rounded-lg bg-green-500/20 hover:bg-green-500/30"
                >
                  <Check size={12} className="text-green-400" />
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-white truncate" title={image.filename}>{image.filename}</p>
            )}
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-1.5 mt-3">
              <p className="text-[9px] text-white/30 uppercase tracking-wider">Caption</p>
              {mediaType === 'image' && (
                <button
                  onClick={handleReanalyze}
                  disabled={isReanalyzing}
                  title="Re-analyze with AI"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] transition-colors duration-150 ${
                    isReanalyzing
                      ? 'bg-[#0067c0]/30 text-[#0067c0] cursor-not-allowed'
                      : 'bg-[#252525] text-white/50 hover:bg-[#0067c0]/20 hover:text-[#0067c0]'
                  }`}
                >
                  <MessageSquare size={9} />
                  {isReanalyzing ? 'Analyzing...' : 'Re-Analyze'}
                </button>
              )}
            </div>
            {reanalyzeMessage && (
              <p className={`text-[9px] mb-1 ${reanalyzeMessage.includes('success') ? 'text-green-400' : 'text-red-400'}`}>
                {reanalyzeMessage}
              </p>
            )}
            <p className="text-[11px] text-white/80 leading-relaxed">{image.caption || "No caption"}</p>
          </div>

          {/* Tags */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] text-white/30 uppercase tracking-wider">Tags</p>
              <button
                onClick={() => setShowTagInput(true)}
                className="p-1 rounded hover:bg-[#252525] transition-colors duration-150"
              >
                <Plus size={12} className="text-white/40" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {image.tags.map((tag) => (
                <span
                  key={tag}
                  className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0067c0]/20 text-[#0067c0] text-[10px]"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              {showTagInput && (
                <input
                  ref={tagInputRef}
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onBlur={handleAddTag}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTag()
                    if (e.key === 'Escape') setShowTagInput(false)
                  }}
                  className="px-2 py-0.5 bg-[#252525] rounded-full text-white text-[10px] w-20
                             border border-[#333] focus:border-[#0067c0] focus:outline-none transition-colors duration-150"
                  placeholder="Add tag..."
                />
              )}
            </div>
          </div>

          {/* Comprehensive Metadata Section */}
          <div className="space-y-3 py-3 border-t border-[#2a2a2a] mt-3">
            <div className="flex items-center gap-1.5 mb-3">
              <Info size={12} className="text-[#0067c0]" />
              <p className="text-[10px] text-white/50 uppercase tracking-wider font-semibold">Metadata</p>
            </div>

            {/* File Information */}
            <div className="space-y-2 bg-[#252525]/50 rounded-lg p-2.5 border border-[#2a2a2a]">
              <p className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">File Info</p>
              
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">Size</span>
                <span className="text-[11px] text-white/70">
                  {(() => {
                    const bytes = image.size || image.metadata?.file_size
                    if (!bytes) return 'Unknown'
                    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
                    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
                    return `${bytes} B`
                  })()}
                </span>
              </div>
              
              {image.width && image.height && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/40">Dimensions</span>
                  <span className="text-[11px] text-white/70">{image.width} × {image.height} px</span>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">Date</span>
                <span className="text-[11px] text-white/70">{safeParseDate(image.dateScanned).toLocaleDateString()}</span>
              </div>

               {/* File Type Badge */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2a2a2a]">
                   <span className="text-[10px] text-white/40">Type</span>
                   <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] capitalize ${
                  mediaType === 'video' ? 'bg-purple-500/20 text-purple-300' :
                  mediaType === 'audio' ? 'bg-pink-500/20 text-pink-300' :
                  'bg-[#0067c0]/20 text-[#0067c0]'
                }`}>
                  {mediaType !== 'image' ? mediaType : image.fileType?.replace(/-/g, ' ') || 'Image'}
                </span>
                </div>
            </div>
          </div>

          {/* Albums */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] text-white/30 uppercase tracking-wider">Albums</p>
              <button
                onClick={() => setShowAlbumMenu(!showAlbumMenu)}
                className="p-1 rounded hover:bg-[#252525] transition-colors duration-150"
              >
                <Plus size={12} className="text-white/40" />
              </button>
            </div>
            {image.albumIds && image.albumIds.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {image.albumIds.map((albumId) => {
                  const album = albums.find(a => a.id === albumId)
                  return album ? (
                    <span
                      key={albumId}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0067c0]/20 text-[#0067c0] text-[10px]"
                    >
                      {album.name}
                      <button
                        onClick={() => removeImageFromAlbum(image.id, albumId)}
                        className="hover:text-[#0067c0]/80"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ) : null
                })}
              </div>
            ) : (
              <p className="text-[11px] text-white/40">Not in any album</p>
            )}

            {/* Album Menu */}
            <AnimatePresence>
              {showAlbumMenu && albums.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="mt-2 bg-[#252525] rounded-lg p-2 max-h-32 overflow-y-auto border border-[#2a2a2a]"
                >
                  {albums.filter(a => !image.albumIds?.includes(a.id)).map((album) => (
                    <button
                      key={album.id}
                      onClick={() => { addImageToAlbum(image.id, album.id); setShowAlbumMenu(false) }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#2a2a2a] text-[11px] text-white/70 transition-colors duration-150"
                    >
                      <Plus size={10} />
                      {album.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick Actions */}
          <div className="mt-auto pt-4 border-t border-[#2a2a2a] space-y-2">
            <button
              onClick={handleExportPdf}
              disabled={exporting !== null}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-[11px] text-white/70 transition-colors duration-150 disabled:opacity-50"
            >
              <FileText size={12} />
              {exporting === 'pdf' ? 'Exporting PDF...' : 'Convert to PDF'}
            </button>
            <button
              onClick={handleExportZip}
              disabled={exporting !== null}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-[11px] text-white/70 transition-colors duration-150 disabled:opacity-50"
            >
              <Copy size={12} />
              {exporting === 'zip' ? 'Creating ZIP...' : 'Convert to ZIP'}
            </button>
            {exportMessage && (
              <p className="text-[10px] text-white/50 text-center">{exportMessage}</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-60 flex items-center justify-center bg-[#050505]/80"
            onClick={() => setShowDeleteConfirm(false)}
            style={{ backfaceVisibility: 'hidden' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="rounded-2xl p-6 max-w-sm w-full mx-4 border border-[#2a2a2a] bg-[#1c1c1c]"
              onClick={(e) => e.stopPropagation()}
              style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
            >
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-3">
                  <Trash2 className="text-red-400" size={24} />
                </div>
                <h3 className="text-[14px] font-medium text-white mb-1">Permanent Delete?</h3>
                <p className="text-[12px] text-white/50">
                  You've tried to delete this 5 times. This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-[12px] text-white/70 transition-colors duration-150"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePermanentDelete}
                  className="flex-1 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-[12px] text-red-400 transition-colors duration-150"
                >
                  Delete Forever
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Options Modal */}
      <AnimatePresence>
        {showSaveOptions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/80"
            onClick={() => setShowSaveOptions(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="glass-panel rounded-2xl p-6 max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-3">
                  <Edit3 className="text-blue-400" size={24} />
                </div>
                <h3 className="text-[14px] font-medium text-white mb-1">Save Changes</h3>
                <p className="text-[12px] text-white/50">
                  How would you like to save your edits?
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={handleSaveAsCopy}
                  className="w-full py-3 rounded-xl glass-subtle hover:bg-white/10 text-[13px] text-white border border-white/10 hover:border-white/20 transition-all"
                >
                  <div className="font-medium mb-0.5">Save as Copy</div>
                  <div className="text-[10px] text-white/50">Creates a new photo entry with edits</div>
                </button>
                <button
                  onClick={handleSaveAsOriginal}
                  className="w-full py-3 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-[13px] text-blue-300 border border-blue-500/30 hover:border-blue-500/40 transition-all"
                >
                  <div className="font-medium mb-0.5">Save as Original</div>
                  <div className="text-[10px] text-blue-300/70">Replaces the existing photo file</div>
                </button>
                <button
                  onClick={() => setShowSaveOptions(false)}
                  className="w-full py-2 rounded-xl glass-subtle hover:bg-white/10 text-[12px] text-white/60 mt-2"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}