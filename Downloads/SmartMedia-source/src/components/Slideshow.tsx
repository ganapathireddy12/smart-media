import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, ImageMetadata } from '../store/appStore'
import {
    X, ChevronLeft, ChevronRight, Play, Pause, Settings2,
    Maximize, Minimize, Info, ZoomIn, ZoomOut, RotateCw,
    Shuffle, Image as ImageIcon
} from 'lucide-react'

interface SlideshowProps {
    images: ImageMetadata[]
    startIndex?: number
    onClose: () => void
}

// Transition effect types
type TransitionType = 'fade' | 'slide' | 'zoom' | 'flip' | 'kenburns'

// Transition variants for each effect type
const transitionVariants = {
    fade: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.8 }
    },
    slide: {
        initial: { opacity: 0, x: 100 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -100 },
        transition: { duration: 0.5, ease: "easeInOut" }
    },
    zoom: {
        initial: { opacity: 0, scale: 0.8 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.2 },
        transition: { duration: 0.6 }
    },
    flip: {
        initial: { opacity: 0, rotateY: -90 },
        animate: { opacity: 1, rotateY: 0 },
        exit: { opacity: 0, rotateY: 90 },
        transition: { duration: 0.6 }
    },
    kenburns: {
        initial: { opacity: 0, scale: 1.1 },
        animate: { opacity: 1, scale: 1.0 },
        exit: { opacity: 0, scale: 1.05 },
        transition: { duration: 1.2 }
    }
}

export default function Slideshow({ images, startIndex = 0, onClose }: SlideshowProps) {
    const slideshowInterval = useAppStore((state) => state.slideshowInterval)
    const setSlideshowInterval = useAppStore((state) => state.setSlideshowInterval)

    const [currentIndex, setCurrentIndex] = useState(startIndex)
    const [isPaused, setIsPaused] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const [showSettings, setShowSettings] = useState(false)
    const [showThumbnails, setShowThumbnails] = useState(true)
    const [showInfo, setShowInfo] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [thumbnailUrls, setThumbnailUrls] = useState<{ [key: string]: string }>({})
    const [transitionType, setTransitionType] = useState<TransitionType>('fade')
    const [zoomLevel, setZoomLevel] = useState(1)
    const [isShuffled, setIsShuffled] = useState(false)
    const [shuffledOrder, setShuffledOrder] = useState<number[]>([])

    const containerRef = useRef<HTMLDivElement>(null)
    const thumbnailsRef = useRef<HTMLDivElement>(null)

    const currentImage = images[isShuffled ? shuffledOrder[currentIndex] : currentIndex]

    // Initialize shuffle order
    useEffect(() => {
        if (isShuffled && shuffledOrder.length === 0) {
            const order = [...Array(images.length).keys()]
            for (let i = order.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [order[i], order[j]] = [order[j], order[i]]
            }
            setShuffledOrder(order)
        }
    }, [isShuffled, images.length, shuffledOrder.length])

    // Load current image
    useEffect(() => {
        const loadImage = async () => {
            if (!currentImage) return
            try {
                // @ts-ignore
                const data = await window.electronAPI?.getImageThumbnail(currentImage.path)
                setImageUrl(data || null)
            } catch (error) {
                console.error('Error loading image:', error)
            }
        }
        loadImage()
    }, [currentImage])

    // Load thumbnails for strip
    useEffect(() => {
        const loadThumbnails = async () => {
            const visibleCount = 15
            const start = Math.max(0, currentIndex - 7)
            const end = Math.min(images.length, start + visibleCount)

            for (let i = start; i < end; i++) {
                const img = images[i]
                if (!thumbnailUrls[img.id]) {
                    try {
                        // @ts-ignore
                        const thumb = await window.electronAPI?.getImageThumbnail(img.path)
                        if (thumb) {
                            setThumbnailUrls(prev => ({ ...prev, [img.id]: thumb }))
                        }
                    } catch { }
                }
            }
        }
        loadThumbnails()
    }, [currentIndex, images, thumbnailUrls])

    // Scroll thumbnail into view
    useEffect(() => {
        if (thumbnailsRef.current) {
            const thumb = thumbnailsRef.current.querySelector(`[data-index="${currentIndex}"]`)
            thumb?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
        }
    }, [currentIndex])

    // Fullscreen handling
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement)
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }, [])

    const toggleFullscreen = useCallback(async () => {
        if (!document.fullscreenElement) {
            await containerRef.current?.requestFullscreen()
        } else {
            await document.exitFullscreen()
        }
    }, [])

    const nextSlide = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % images.length)
        setZoomLevel(1)
    }, [images.length])

    const prevSlide = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
        setZoomLevel(1)
    }, [images.length])

    const goToSlide = useCallback((index: number) => {
        setCurrentIndex(index)
        setZoomLevel(1)
    }, [])

    // Auto-advance slides
    useEffect(() => {
        if (isPaused || images.length <= 1) return

        const timer = setInterval(nextSlide, slideshowInterval * 1000)
        return () => clearInterval(timer)
    }, [isPaused, slideshowInterval, nextSlide, images.length])

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowLeft':
                    prevSlide()
                    break
                case 'ArrowRight':
                    nextSlide()
                    break
                case ' ':
                    e.preventDefault()
                    setIsPaused((p) => !p)
                    break
                case 'Escape':
                    if (isFullscreen) {
                        document.exitFullscreen()
                    } else {
                        onClose()
                    }
                    break
                case 'f':
                case 'F11':
                    e.preventDefault()
                    toggleFullscreen()
                    break
                case 'i':
                    setShowInfo(prev => !prev)
                    break
                case 't':
                    setShowThumbnails(prev => !prev)
                    break
                case '+':
                case '=':
                    setZoomLevel(prev => Math.min(prev + 0.25, 3))
                    break
                case '-':
                    setZoomLevel(prev => Math.max(prev - 0.25, 0.5))
                    break
                case '0':
                    setZoomLevel(1)
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [nextSlide, prevSlide, onClose, isFullscreen, toggleFullscreen])

    // Hide controls after inactivity
    useEffect(() => {
        let timer: NodeJS.Timeout

        const resetTimer = () => {
            setShowControls(true)
            clearTimeout(timer)
            timer = setTimeout(() => setShowControls(false), 3000)
        }

        resetTimer()
        window.addEventListener('mousemove', resetTimer)

        return () => {
            clearTimeout(timer)
            window.removeEventListener('mousemove', resetTimer)
        }
    }, [])

    const currentVariant = transitionVariants[transitionType]

    if (!currentImage) return null

    return (
        <motion.div
            ref={containerRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
            onMouseMove={() => setShowControls(true)}
        >
            {/* Main Image Area */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentIndex}
                        initial={currentVariant.initial}
                        animate={currentVariant.animate}
                        exit={currentVariant.exit}
                        transition={currentVariant.transition}
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ perspective: 1000 }}
                    >
                        {imageUrl ? (
                            <motion.img
                                src={imageUrl}
                                alt={currentImage.caption || currentImage.filename}
                                className="max-w-full max-h-full object-contain transition-transform duration-300"
                                style={{ transform: `scale(${zoomLevel})` }}
                                animate={transitionType === 'kenburns' ? {
                                    scale: [1, 1.05, 1],
                                    x: [0, 10, 0],
                                    y: [0, -5, 0]
                                } : {}}
                                transition={transitionType === 'kenburns' ? {
                                    duration: slideshowInterval,
                                    ease: "linear"
                                } : {}}
                            />
                        ) : (
                            <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* Photo Info Overlay */}
                <AnimatePresence>
                    {showInfo && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="absolute right-4 top-20 w-72 bg-black/80 backdrop-blur-md rounded-xl p-4 border border-white/10"
                        >
                            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                                <Info size={16} className="text-blue-400" /> Photo Info
                            </h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-white/50">Filename</span>
                                    <span className="text-white truncate ml-2 max-w-[150px]">{currentImage.filename}</span>
                                </div>
                                {currentImage.caption && (
                                    <div className="flex justify-between">
                                        <span className="text-white/50">Caption</span>
                                        <span className="text-white truncate ml-2 max-w-[150px]">{currentImage.caption}</span>
                                    </div>
                                )}
                                {currentImage.tags.length > 0 && (
                                    <div className="pt-2">
                                        <span className="text-white/50 text-xs">Tags</span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {currentImage.tags.slice(0, 5).map(tag => (
                                                <span key={tag} className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {currentImage.dateScanned && (
                                    <div className="flex justify-between pt-2 border-t border-white/10">
                                        <span className="text-white/50">Date</span>
                                        <span className="text-white text-xs">{new Date(currentImage.dateScanned).toLocaleDateString()}</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Controls Overlay */}
            <motion.div
                initial={{ opacity: 1 }}
                animate={{ opacity: showControls ? 1 : 0 }}
                className="absolute inset-0 pointer-events-none"
            >
                {/* Top bar */}
                <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-white/80 text-sm bg-white/10 px-3 py-1 rounded-full">
                                {currentIndex + 1} / {images.length}
                            </span>
                            <span className="text-white/50 text-sm truncate max-w-[300px]">
                                {currentImage.caption || currentImage.filename}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowInfo(!showInfo)}
                                className={`p-2 rounded-lg transition-colors ${showInfo ? 'bg-blue-500 text-white' : 'hover:bg-white/10 text-white/70'}`}
                                title="Photo Info (I)"
                            >
                                <Info size={20} />
                            </button>
                            <button
                                onClick={toggleFullscreen}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                title="Fullscreen (F)"
                            >
                                {isFullscreen ? <Minimize size={20} className="text-white" /> : <Maximize size={20} className="text-white" />}
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X size={24} className="text-white" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Side controls */}
                <button
                    onClick={prevSlide}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-all pointer-events-auto group"
                >
                    <ChevronLeft size={32} className="text-white group-hover:scale-110 transition-transform" />
                </button>
                <button
                    onClick={nextSlide}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-all pointer-events-auto group"
                >
                    <ChevronRight size={32} className="text-white group-hover:scale-110 transition-transform" />
                </button>

                {/* Bottom controls */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-auto">
                    {/* Thumbnail Strip */}
                    <AnimatePresence>
                        {showThumbnails && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                ref={thumbnailsRef}
                                className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
                            >
                                {images.map((img, index) => (
                                    <button
                                        key={img.id}
                                        data-index={index}
                                        onClick={() => goToSlide(index)}
                                        className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden transition-all duration-200 ${index === currentIndex
                                            ? 'ring-2 ring-blue-500 scale-110'
                                            : 'opacity-50 hover:opacity-100 hover:scale-105'
                                            }`}
                                    >
                                        {thumbnailUrls[img.id] ? (
                                            <img src={thumbnailUrls[img.id]} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full bg-white/10 flex items-center justify-center">
                                                <ImageIcon size={16} className="text-white/30" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Main Controls */}
                    <div className="flex items-center justify-center gap-2 p-4">
                        {/* Zoom Controls */}
                        <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1 mr-4">
                            <button
                                onClick={() => setZoomLevel(prev => Math.max(prev - 0.25, 0.5))}
                                className="p-2 hover:bg-white/10 rounded-md transition-colors text-white/70"
                                title="Zoom Out (-)"
                            >
                                <ZoomOut size={18} />
                            </button>
                            <span className="text-white/70 text-xs w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
                            <button
                                onClick={() => setZoomLevel(prev => Math.min(prev + 0.25, 3))}
                                className="p-2 hover:bg-white/10 rounded-md transition-colors text-white/70"
                                title="Zoom In (+)"
                            >
                                <ZoomIn size={18} />
                            </button>
                            <button
                                onClick={() => setZoomLevel(1)}
                                className="p-2 hover:bg-white/10 rounded-md transition-colors text-white/70"
                                title="Reset Zoom (0)"
                            >
                                <RotateCw size={16} />
                            </button>
                        </div>

                        {/* Playback Controls */}
                        <button
                            onClick={() => setIsShuffled(!isShuffled)}
                            className={`p-3 rounded-full transition-colors ${isShuffled ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/70'}`}
                            title="Shuffle"
                        >
                            <Shuffle size={20} />
                        </button>

                        <button
                            onClick={() => setIsPaused(!isPaused)}
                            className="p-4 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                        >
                            {isPaused ? (
                                <Play size={28} className="text-white" fill="white" />
                            ) : (
                                <Pause size={28} className="text-white" />
                            )}
                        </button>

                        <button
                            onClick={() => setShowThumbnails(!showThumbnails)}
                            className={`p-3 rounded-full transition-colors ${showThumbnails ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/70'}`}
                            title="Thumbnails (T)"
                        >
                            <ImageIcon size={20} />
                        </button>

                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`p-3 rounded-full transition-colors ${showSettings ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white/70'}`}
                        >
                            <Settings2 size={20} />
                        </button>
                    </div>

                    {/* Settings panel */}
                    <AnimatePresence>
                        {showSettings && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#1c1c1c] rounded-xl p-5 shadow-2xl border border-[#333] min-w-[320px]"
                            >
                                {/* Interval Setting */}
                                <div className="mb-4">
                                    <span className="text-white/50 text-xs uppercase tracking-wider block mb-2">Interval</span>
                                    <div className="flex items-center gap-2">
                                        {[3, 5, 10, 15, 30].map((sec) => (
                                            <button
                                                key={sec}
                                                onClick={() => setSlideshowInterval(sec)}
                                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${slideshowInterval === sec
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                                                    }`}
                                            >
                                                {sec}s
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Transition Effect Setting */}
                                <div>
                                    <span className="text-white/50 text-xs uppercase tracking-wider block mb-2">Transition Effect</span>
                                    <div className="grid grid-cols-5 gap-2">
                                        {(['fade', 'slide', 'zoom', 'flip', 'kenburns'] as TransitionType[]).map((effect) => (
                                            <button
                                                key={effect}
                                                onClick={() => setTransitionType(effect)}
                                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all capitalize ${transitionType === effect
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                                                    }`}
                                            >
                                                {effect === 'kenburns' ? 'Ken Burns' : effect}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Progress bar */}
                {!isPaused && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 pointer-events-none">
                        <motion.div
                            key={currentIndex}
                            initial={{ width: '0%' }}
                            animate={{ width: '100%' }}
                            transition={{ duration: slideshowInterval, ease: 'linear' }}
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                        />
                    </div>
                )}
            </motion.div>
        </motion.div>
    )
}
