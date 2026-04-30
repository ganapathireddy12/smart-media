import React, { useRef, useEffect, useState } from 'react'
import {
    RotateCw, RotateCcw, FlipHorizontal, FlipVertical,
    Check, X, Sliders, Image as ImageIcon,
    Sun, Contrast, Droplets, Crop, Sparkles, Palette,
    Wind, Circle, Square, RefreshCw, Trash2, Wand2
} from 'lucide-react'

interface PhotoEditorProps {
    imageSrc: string
    onSave: (editedImageSrc: string) => void
    onCancel: () => void
}

interface FilterState {
    brightness: number
    contrast: number
    saturation: number
    sepia: number
    grayscale: number
    blur: number
    hueRotate: number
    invert: number
}

interface TransformState {
    rotate: number
    flipH: boolean
    flipV: boolean
}

// Filter presets
const filterPresets = [
    { name: 'None', brightness: 100, contrast: 100, saturation: 100, sepia: 0, grayscale: 0, blur: 0, hueRotate: 0, invert: 0 },
    { name: 'Vivid', brightness: 110, contrast: 120, saturation: 140, sepia: 0, grayscale: 0, blur: 0, hueRotate: 0, invert: 0 },
    { name: 'Warm', brightness: 105, contrast: 105, saturation: 110, sepia: 20, grayscale: 0, blur: 0, hueRotate: 0, invert: 0 },
    { name: 'Cool', brightness: 100, contrast: 110, saturation: 90, sepia: 0, grayscale: 0, blur: 0, hueRotate: 180, invert: 0 },
    { name: 'Vintage', brightness: 95, contrast: 90, saturation: 80, sepia: 40, grayscale: 0, blur: 0, hueRotate: 0, invert: 0 },
    { name: 'B&W', brightness: 100, contrast: 120, saturation: 0, sepia: 0, grayscale: 100, blur: 0, hueRotate: 0, invert: 0 },
    { name: 'Noir', brightness: 90, contrast: 150, saturation: 0, sepia: 0, grayscale: 100, blur: 0, hueRotate: 0, invert: 0 },
    { name: 'Fade', brightness: 110, contrast: 85, saturation: 80, sepia: 10, grayscale: 0, blur: 0, hueRotate: 0, invert: 0 },
    { name: 'Dreamy', brightness: 105, contrast: 90, saturation: 95, sepia: 5, grayscale: 0, blur: 1, hueRotate: 0, invert: 0 },
    { name: 'Dramatic', brightness: 95, contrast: 140, saturation: 120, sepia: 0, grayscale: 0, blur: 0, hueRotate: 0, invert: 0 },
]

export default function PhotoEditor({ imageSrc, onSave, onCancel }: PhotoEditorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null)
    const [loading, setLoading] = useState(true)

    // filter states
    const [filters, setFilters] = useState<FilterState>({
        brightness: 100,
        contrast: 100,
        saturation: 100,
        sepia: 0,
        grayscale: 0,
        blur: 0,
        hueRotate: 0,
        invert: 0
    })

    // transform states
    const [transform, setTransform] = useState<TransformState>({
        rotate: 0,
        flipH: false,
        flipV: false
    })

    const [activeTab, setActiveTab] = useState<'adjust' | 'filters' | 'presets'>('adjust')
    const [selectedPreset, setSelectedPreset] = useState<string>('None')
    const [showComparison, setShowComparison] = useState(false)
    const [history, setHistory] = useState<{ filters: FilterState, transform: TransformState }[]>([])
    const [historyIndex, setHistoryIndex] = useState(-1)

    // Load original image
    useEffect(() => {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.src = imageSrc
        img.onload = () => {
            setOriginalImage(img)
            setLoading(false)
        }
    }, [imageSrc])

    // Save to history
    const saveToHistory = () => {
        const newHistory = history.slice(0, historyIndex + 1)
        newHistory.push({ filters: { ...filters }, transform: { ...transform } })
        setHistory(newHistory)
        setHistoryIndex(newHistory.length - 1)
    }

    // Undo
    const undo = () => {
        if (historyIndex > 0) {
            const prev = history[historyIndex - 1]
            setFilters(prev.filters)
            setTransform(prev.transform)
            setHistoryIndex(historyIndex - 1)
        }
    }

    // Redo
    const redo = () => {
        if (historyIndex < history.length - 1) {
            const next = history[historyIndex + 1]
            setFilters(next.filters)
            setTransform(next.transform)
            setHistoryIndex(historyIndex + 1)
        }
    }

    // Correct lifecycle to redraw
    useEffect(() => {
        if (!originalImage || !canvasRef.current) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const isRotated90 = Math.abs(transform.rotate % 180) === 90

        if (isRotated90) {
            canvas.width = originalImage.height
            canvas.height = originalImage.width
        } else {
            canvas.width = originalImage.width
            canvas.height = originalImage.height
        }

        ctx.filter = `
            brightness(${filters.brightness}%) 
            contrast(${filters.contrast}%) 
            saturate(${filters.saturation}%) 
            sepia(${filters.sepia}%) 
            grayscale(${filters.grayscale}%) 
            blur(${filters.blur}px)
            hue-rotate(${filters.hueRotate}deg)
            invert(${filters.invert}%)
        `

        ctx.save()
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate((transform.rotate * Math.PI) / 180)
        ctx.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1)
        ctx.drawImage(originalImage, -originalImage.width / 2, -originalImage.height / 2)
        ctx.restore()

    }, [filters, transform, originalImage])

    const handleSave = () => {
        if (!canvasRef.current) return
        onSave(canvasRef.current.toDataURL('image/jpeg', 0.92))
    }

    const resetFilters = () => {
        setFilters({
            brightness: 100,
            contrast: 100,
            saturation: 100,
            sepia: 0,
            grayscale: 0,
            blur: 0,
            hueRotate: 0,
            invert: 0
        })
        setTransform({
            rotate: 0,
            flipH: false,
            flipV: false
        })
        setSelectedPreset('None')
    }

    const applyPreset = (preset: typeof filterPresets[0]) => {
        setFilters({
            brightness: preset.brightness,
            contrast: preset.contrast,
            saturation: preset.saturation,
            sepia: preset.sepia,
            grayscale: preset.grayscale,
            blur: preset.blur,
            hueRotate: preset.hueRotate,
            invert: preset.invert
        })
        setSelectedPreset(preset.name)
        saveToHistory()
    }

    const handleFilterChange = (key: keyof FilterState, value: number) => {
        setFilters(prev => ({ ...prev, [key]: value }))
        setSelectedPreset('Custom')
    }

    return (
        <div className="flex h-full bg-[#0c0c0c] text-white overflow-hidden">
            {/* Main Canvas Area */}
            <div className="flex-1 flex items-center justify-center p-8 relative">
                {loading ? (
                    <div className="flex flex-col items-center text-white/50">
                        <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mb-3" />
                        Loading image...
                    </div>
                ) : (
                    <div className="relative shadow-2xl overflow-hidden max-w-full max-h-full group">
                        <canvas
                            ref={canvasRef}
                            className="max-w-full max-h-[80vh] object-contain rounded-lg"
                        />

                        {/* Original comparison on hover */}
                        {showComparison && originalImage && (
                            <img
                                src={imageSrc}
                                alt="Original"
                                className="absolute inset-0 w-full h-full object-contain opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                            />
                        )}
                    </div>
                )}

                {/* Top Actions */}
                <div className="absolute top-4 left-4 flex gap-2">
                    <button
                        onClick={undo}
                        disabled={historyIndex <= 0}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-30"
                        title="Undo"
                    >
                        <RefreshCw size={16} className="rotate-[-45deg]" />
                    </button>
                    <button
                        onClick={redo}
                        disabled={historyIndex >= history.length - 1}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-30"
                        title="Redo"
                    >
                        <RefreshCw size={16} className="rotate-45" />
                    </button>
                    <button
                        onClick={() => setShowComparison(!showComparison)}
                        className={`p-2 rounded-lg transition-colors ${showComparison ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 hover:bg-white/20'}`}
                        title="Compare with original (hold to view)"
                    >
                        <Square size={16} />
                    </button>
                </div>

                <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Cancel">
                        <X size={20} />
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 font-medium transition-colors" title="Save Changes">
                        <Check size={18} />
                        Save
                    </button>
                </div>
            </div>

            {/* Right Sidebar - Controls */}
            <div className="w-80 bg-[#121212] border-l border-[#222] flex flex-col">
                <div className="flex border-b border-[#222]">
                    <button
                        onClick={() => setActiveTab('adjust')}
                        className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-1.5 ${activeTab === 'adjust' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' : 'text-white/60 hover:text-white/90'}`}
                    >
                        <Sliders size={14} />
                        Adjust
                    </button>
                    <button
                        onClick={() => setActiveTab('filters')}
                        className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-1.5 ${activeTab === 'filters' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' : 'text-white/60 hover:text-white/90'}`}
                    >
                        <Wand2 size={14} />
                        Effects
                    </button>
                    <button
                        onClick={() => setActiveTab('presets')}
                        className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-1.5 ${activeTab === 'presets' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' : 'text-white/60 hover:text-white/90'}`}
                    >
                        <Sparkles size={14} />
                        Presets
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {activeTab === 'adjust' && (
                        <>
                            {/* Transform Controls */}
                            <div className="space-y-3">
                                <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Transform</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => { setTransform(p => ({ ...p, rotate: (p.rotate - 90) % 360 })); saveToHistory() }}
                                        className="p-2.5 bg-[#1a1a1a] hover:bg-[#252525] rounded-lg flex flex-col items-center gap-1.5 text-[10px] transition-colors"
                                    >
                                        <RotateCcw size={18} />
                                        Rotate Left
                                    </button>
                                    <button
                                        onClick={() => { setTransform(p => ({ ...p, rotate: (p.rotate + 90) % 360 })); saveToHistory() }}
                                        className="p-2.5 bg-[#1a1a1a] hover:bg-[#252525] rounded-lg flex flex-col items-center gap-1.5 text-[10px] transition-colors"
                                    >
                                        <RotateCw size={18} />
                                        Rotate Right
                                    </button>
                                    <button
                                        onClick={() => { setTransform(p => ({ ...p, flipH: !p.flipH })); saveToHistory() }}
                                        className={`p-2.5 rounded-lg flex flex-col items-center gap-1.5 text-[10px] transition-colors ${transform.flipH ? 'bg-blue-600/20 text-blue-400' : 'bg-[#1a1a1a] hover:bg-[#252525]'}`}
                                    >
                                        <FlipHorizontal size={18} />
                                        Flip H
                                    </button>
                                    <button
                                        onClick={() => { setTransform(p => ({ ...p, flipV: !p.flipV })); saveToHistory() }}
                                        className={`p-2.5 rounded-lg flex flex-col items-center gap-1.5 text-[10px] transition-colors ${transform.flipV ? 'bg-blue-600/20 text-blue-400' : 'bg-[#1a1a1a] hover:bg-[#252525]'}`}
                                    >
                                        <FlipVertical size={18} />
                                        Flip V
                                    </button>
                                </div>
                            </div>

                            {/* Light Adjustments */}
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Light & Color</h3>

                                {[
                                    { key: 'brightness' as const, label: 'Brightness', icon: Sun, min: 0, max: 200, color: 'yellow' },
                                    { key: 'contrast' as const, label: 'Contrast', icon: Contrast, min: 0, max: 200, color: 'blue' },
                                    { key: 'saturation' as const, label: 'Saturation', icon: Droplets, min: 0, max: 200, color: 'pink' },
                                ].map(({ key, label, icon: Icon, min, max }) => (
                                    <div key={key} className="space-y-1.5">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="flex items-center gap-2 text-white/80"><Icon size={12} /> {label}</span>
                                            <span className="text-white/40 font-mono text-[10px]">{filters[key]}%</span>
                                        </div>
                                        <input
                                            type="range" min={min} max={max} value={filters[key]}
                                            onChange={(e) => handleFilterChange(key, parseInt(e.target.value))}
                                            onMouseUp={saveToHistory}
                                            className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        />
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {activeTab === 'filters' && (
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Effects</h3>

                            {[
                                { key: 'sepia' as const, label: 'Sepia', min: 0, max: 100 },
                                { key: 'grayscale' as const, label: 'Grayscale', min: 0, max: 100 },
                                { key: 'blur' as const, label: 'Blur', min: 0, max: 20, unit: 'px' },
                                { key: 'hueRotate' as const, label: 'Hue Rotate', min: 0, max: 360, unit: '°' },
                                { key: 'invert' as const, label: 'Invert', min: 0, max: 100 },
                            ].map(({ key, label, min, max, unit = '%' }) => (
                                <div key={key} className="space-y-1.5">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-white/80">{label}</span>
                                        <span className="text-white/40 font-mono text-[10px]">{filters[key]}{unit}</span>
                                    </div>
                                    <input
                                        type="range" min={min} max={max} value={filters[key]}
                                        onChange={(e) => handleFilterChange(key, parseInt(e.target.value))}
                                        onMouseUp={saveToHistory}
                                        className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-purple-500"
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'presets' && (
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Filter Presets</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {filterPresets.map((preset) => (
                                    <button
                                        key={preset.name}
                                        onClick={() => applyPreset(preset)}
                                        className={`p-3 rounded-lg text-xs font-medium transition-all ${selectedPreset === preset.name
                                            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                            : 'bg-[#1a1a1a] hover:bg-[#252525] text-white/70'
                                            }`}
                                    >
                                        {preset.name}
                                    </button>
                                ))}
                            </div>

                            <div className="mt-4 p-3 bg-[#1a1a1a] rounded-lg">
                                <p className="text-[10px] text-white/40 mb-2">Current: <span className="text-white/70">{selectedPreset}</span></p>
                                <div className="flex gap-2 text-[9px] text-white/30">
                                    <span>B:{filters.brightness}</span>
                                    <span>C:{filters.contrast}</span>
                                    <span>S:{filters.saturation}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-[#222] space-y-2">
                    <button
                        onClick={resetFilters}
                        className="w-full py-2.5 rounded-lg border border-[#333] text-sm font-medium text-white/60 hover:text-white hover:bg-[#1a1a1a] transition-colors flex items-center justify-center gap-2"
                    >
                        <Trash2 size={14} />
                        Reset All
                    </button>
                </div>
            </div>
        </div>
    )
}
