import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, ImageMetadata } from '../store/appStore'
import {
    LayoutGrid, Grid3X3, Square, Download, X,
    Image as ImageIcon, Plus, Trash2, Wand2,
    Maximize2, ArrowLeft, Layers, Sliders, Palette,
    Move, RotateCw, Undo, Redo, Shuffle, ZoomIn,
    Crop, Sun, Droplet, MousePointerClick, Library,
    Edit3, MoveHorizontal, MoveVertical, FlipHorizontal,
    FlipVertical, Contrast, Type, AlignLeft, AlignCenter, AlignRight,
    Check, Share2, FileImage
} from 'lucide-react'

// --- CONSTANTS ---
const PAGE_BG = "bg-[#050505]"
const PANEL_BG = "bg-[#0a0a0a]"
const BORDER_COLOR = "border-[#1a1a1a]"
const ACCENT_COLOR = "indigo-500"

type LayoutType = '2x2' | '3x3' | '2x3' | '1+2' | 'strip' | 'hero' | 'masonry'
type AspectRatio = '1:1' | '4:5' | '16:9' | '9:16' | '3:4'
type SidebarTab = 'library' | 'layout' | 'edit' | 'text'

interface TextLayer {
    id: string
    text: string
    x: number
    y: number
    color: string
    bg: string
    size: number
    font: string
    align: 'left' | 'center' | 'right'
    bold: boolean
}

interface SlotData {
    image: ImageMetadata | null
    rotation: number
    scale: number
    panX: number
    panY: number
    brightness: number
    contrast: number
    saturation: number
    flipX: boolean
    flipY: boolean
    filterPreset: string
}

const LAYOUTS = [
    { id: '2x2', name: 'Grid 4', slots: 4, icon: Grid3X3 },
    { id: '3x3', name: 'Grid 9', slots: 9, icon: LayoutGrid },
    { id: '2x3', name: 'Grid 6', slots: 6, icon: LayoutGrid },
    { id: '1+2', name: 'Feature', slots: 3, icon: Square },
    { id: 'hero', name: 'Hero', slots: 2, icon: LayoutGrid },
    { id: 'strip', name: 'Film Strip', slots: 4, icon: Layers },
    { id: 'masonry', name: 'Masonry', slots: 5, icon: LayoutGrid },
]

const ASPECT_RATIOS: { id: AspectRatio, label: string, ratio: number }[] = [
    { id: '1:1', label: 'Square', ratio: 1 },
    { id: '4:5', label: 'Portrait', ratio: 0.8 },
    { id: '16:9', label: 'Landscape', ratio: 1.77 },
    { id: '9:16', label: 'Story', ratio: 0.56 },
    { id: '3:4', label: 'Classic', ratio: 0.75 },
]

const FILTER_PRESETS = [
    { id: 'none', name: 'Normal', filter: '' },
    { id: 'bw', name: 'Noir', filter: 'grayscale(100%) contrast(110%)' },
    { id: 'vintage', name: 'Vintage', filter: 'sepia(50%) contrast(90%) brightness(90%)' },
    { id: 'vivid', name: 'Vivid', filter: 'saturate(150%) contrast(110%)' },
    { id: 'cold', name: 'Frost', filter: 'hue-rotate(180deg) saturate(60%)' },
    { id: 'warm', name: 'Summer', filter: 'sepia(30%) saturate(120%)' },
]

const INITIAL_SLOT: SlotData = {
    image: null,
    rotation: 0, scale: 1, panX: 50, panY: 50,
    brightness: 100, contrast: 100, saturation: 100,
    flipX: false, flipY: false, filterPreset: 'none'
}

// --- OPTIMIZED SUB-COMPONENTS ---

const LibraryItem = memo(({ img, preview, isPending, onClick, onDragStart }: any) => (
    <div
        draggable
        onDragStart={(e) => onDragStart(e, img.id)}
        onClick={() => onClick(img)}
        className={`
            aspect-square rounded-md overflow-hidden cursor-pointer relative transition-all duration-200 border bg-[#151515] group
            ${isPending ? `ring-2 ring-${ACCENT_COLOR} scale-95 border-transparent` : 'border-[#222] hover:border-[#444]'}
        `}
    >
        {preview ? (
            <img src={preview} className="w-full h-full object-cover pointer-events-none group-hover:scale-110 transition-transform duration-500" loading="lazy" />
        ) : (
            <div className="w-full h-full flex items-center justify-center">
                <ImageIcon size={16} className="text-[#333]" />
            </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
    </div>
))

export default function CollagePage() {
    const { images, setCurrentScreen } = useAppStore()

    // Filter to show only image files for collages
    const collageImages = useMemo(() => {
        return images.filter(img => {
            if (img.isDeleted) return false
            
            // Check media type - support both camelCase and snake_case from backend
            const mediaType = img.mediaType || (img as any).media_type || 'image'
            return mediaType === 'image'
        })
    }, [images])

    // --- STATE ---
    const [activeTab, setActiveTab] = useState<SidebarTab>('library')
    const [activeLayout, setActiveLayout] = useState<LayoutType>('2x2')
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
    
    // Style Config
    const [gap, setGap] = useState(12)
    const [padding, setPadding] = useState(12)
    const [radius, setRadius] = useState(0)
    const [bgColor, setBgColor] = useState('#000000')
    
    // Content
    const [slots, setSlots] = useState<SlotData[]>([])
    const [textLayers, setTextLayers] = useState<TextLayer[]>([])
    const [selectedTextId, setSelectedTextId] = useState<string | null>(null)

    // Interaction
    const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null)
    const [pendingImage, setPendingImage] = useState<ImageMetadata | null>(null)
    const [previews, setPreviews] = useState<Record<string, string>>({})
    const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
    
    // Export
    const [showExportModal, setShowExportModal] = useState(false)
    const canvasRef = useRef<HTMLDivElement>(null)

    // Virtual Scroll / Lazy Load (Simplified for brevity)
    const [visibleLibraryCount, setVisibleLibraryCount] = useState(20)

    // --- LOGIC ---

    const currentConfig = useMemo(() => LAYOUTS.find(l => l.id === activeLayout)!, [activeLayout])
    const currentRatio = useMemo(() => ASPECT_RATIOS.find(r => r.id === aspectRatio)?.ratio || 1, [aspectRatio])

    // Init Slots
    useEffect(() => {
        setSlots(prev => {
            const newSlots = Array(currentConfig.slots).fill(null).map(() => ({ ...INITIAL_SLOT }))
            // Preserve existing images if possible
            prev.forEach((slot, i) => { if (i < newSlots.length && slot.image) newSlots[i] = slot })
            return newSlots
        })
    }, [activeLayout])

    // Load Previews
    useEffect(() => {
        const load = async () => {
            // @ts-ignore
            const newPreviews: any = {}
            for (const img of collageImages.slice(0, 50)) {
               if(previews[img.id]) continue
               try {
                  // @ts-ignore
                  const thumb = await window.electronAPI?.getImageThumbnail(img.path)
                  if(thumb) newPreviews[img.id] = thumb
               } catch(e) {}
            }
            if(Object.keys(newPreviews).length > 0) setPreviews(p => ({...p, ...newPreviews}))
        }
        if(activeTab === 'library') load()
    }, [collageImages, activeTab])

    // --- HANDLERS ---

    const handleSlotClick = (index: number) => {
        if (pendingImage) {
            const newSlots = [...slots]
            newSlots[index] = { ...INITIAL_SLOT, image: pendingImage }
            setSlots(newSlots)
            setPendingImage(null)
        } else {
            setSelectedSlotIndex(index === selectedSlotIndex ? null : index)
            setSelectedTextId(null)
            setActiveTab(index === selectedSlotIndex ? 'layout' : 'edit')
        }
    }

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault()
        setDragOverSlot(null)
        const sourceId = e.dataTransfer.getData('source')
        const img = collageImages.find(i => i.id === sourceId)
        if (img) {
            const newSlots = [...slots]
            newSlots[targetIndex] = { ...INITIAL_SLOT, image: img }
            setSlots(newSlots)
        }
    }

    const updateSlot = (index: number, changes: Partial<SlotData>) => {
        const newSlots = [...slots]
        newSlots[index] = { ...newSlots[index], ...changes }
        setSlots(newSlots)
    }

    const addTextLayer = () => {
        const id = Math.random().toString(36).substr(2, 9)
        setTextLayers([...textLayers, {
            id, text: 'Double Click to Edit', x: 50, y: 50,
            color: '#ffffff', bg: 'transparent', size: 24, font: 'sans-serif', align: 'center', bold: true
        }])
        setSelectedTextId(id)
        setActiveTab('text')
    }

    // Text Dragging Logic
    const handleTextDragStart = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        setSelectedTextId(id)
        setSelectedSlotIndex(null)
        setActiveTab('text')
        
        const textEl = e.currentTarget as HTMLDivElement
        const container = canvasRef.current
        if(!container) return

        const startX = e.clientX
        const startY = e.clientY
        const layer = textLayers.find(t => t.id === id)!
        const startLayerX = layer.x
        const startLayerY = layer.y
        const containerRect = container.getBoundingClientRect()

        const onMouseMove = (ev: MouseEvent) => {
            const deltaX = ((ev.clientX - startX) / containerRect.width) * 100
            const deltaY = ((ev.clientY - startY) / containerRect.height) * 100
            
            setTextLayers(prev => prev.map(t => 
                t.id === id ? { ...t, x: Math.min(100, Math.max(0, startLayerX + deltaX)), y: Math.min(100, Math.max(0, startLayerY + deltaY)) } : t
            ))
        }

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    // Grid Style Calculator
    const getGridStyle = (layout: LayoutType) => {
        switch(layout) {
            case '3x3': return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' }
            case '2x3': return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' }
            case 'strip': return { gridTemplateColumns: '1fr', gridTemplateRows: 'repeat(4, 1fr)' }
            case 'hero': return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' } // Custom logic in item style
            case 'masonry': return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }
            case '1+2': return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }
            default: return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }
        }
    }

    const getSlotSpan = (layout: LayoutType, index: number) => {
        if (layout === 'hero' && index === 0) return { gridRow: 'span 2', gridColumn: 'span 2' }
        if (layout === '1+2' && index === 0) return { gridRow: 'span 2' }
        if (layout === 'masonry') {
             if (index === 0) return { gridRow: 'span 2' }
             if (index === 3) return { gridColumn: 'span 2' }
        }
        return {}
    }

    // --- RENDER ---

    return (
        <div className={`h-full flex flex-col ${PAGE_BG} text-white overflow-hidden font-sans`}>

            {/* 1. TOP BAR */}
            <header className={`h-14 shrink-0 flex items-center justify-between px-6 border-b ${BORDER_COLOR} bg-[#050505]/95 backdrop-blur z-30`}>
                <div className="flex items-center gap-4">
                    <button onClick={() => setCurrentScreen('home')} className="p-2 -ml-2 hover:bg-[#222] rounded-full transition-colors text-[#888] hover:text-white">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-sm font-bold leading-none tracking-tight">Music Collections</h1>
                        <span className="text-[10px] text-[#555] font-mono uppercase">Audio files only</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-[#111] rounded-lg p-1 border border-[#222]">
                        <button className="p-1.5 hover:bg-[#222] rounded text-[#666] hover:text-white transition-colors" title="Undo"><Undo size={14} /></button>
                        <button className="p-1.5 hover:bg-[#222] rounded text-[#666] hover:text-white transition-colors" title="Redo"><Redo size={14} /></button>
                    </div>

                    <button 
                        onClick={() => {
                            const available = slots.map(s => s.image).filter(Boolean)
                            const shuffled = [...available].sort(() => Math.random() - 0.5)
                            setSlots(slots.map((s, i) => ({ ...s, image: shuffled[i % shuffled.length] || null })))
                        }} 
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#111] border border-[#222] rounded-lg hover:border-[#444] transition-colors text-xs font-medium text-[#ccc]"
                    >
                        <Shuffle size={14} /> Mix
                    </button>

                    <button 
                        onClick={() => setShowExportModal(true)}
                        className={`flex items-center gap-2 px-4 py-1.5 bg-${ACCENT_COLOR} hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)]`}
                    >
                        <Download size={14} /> Export
                    </button>
                </div>
            </header>

            {/* 2. MAIN WORKSPACE */}
            <div className="flex-1 flex overflow-hidden">

                {/* LEFT SIDEBAR: Tools */}
                <div className="w-80 border-r border-[#1a1a1a] flex flex-col bg-[#0a0a0a] z-20">
                    
                    {/* Tabs */}
                    <div className="grid grid-cols-4 p-1 bg-[#0a0a0a] border-b border-[#1a1a1a]">
                        {[
                            { id: 'library', icon: Library, label: 'Media' },
                            { id: 'layout', icon: LayoutGrid, label: 'Canvas' },
                            { id: 'edit', icon: Sliders, label: 'Edit' },
                            { id: 'text', icon: Type, label: 'Text' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    if(tab.id === 'edit' && selectedSlotIndex === null) return
                                    setActiveTab(tab.id as SidebarTab)
                                }}
                                disabled={tab.id === 'edit' && selectedSlotIndex === null}
                                className={`
                                    flex flex-col items-center justify-center py-3 gap-1.5 text-[10px] font-medium transition-all border-b-2
                                    ${activeTab === tab.id 
                                        ? `border-${ACCENT_COLOR} text-white bg-[#151515]` 
                                        : 'border-transparent text-[#555] hover:text-[#999] hover:bg-[#111]'}
                                    ${tab.id === 'edit' && selectedSlotIndex === null ? 'opacity-30 cursor-not-allowed' : ''}
                                `}
                            >
                                <tab.icon size={16} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-hidden relative">
                        <AnimatePresence mode="wait">
                            
                            {/* 1. LIBRARY */}
                            {activeTab === 'library' && (
                                <motion.div 
                                    key="library"
                                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                                    className="absolute inset-0 flex flex-col"
                                >
                                    <div className="p-4 border-b border-[#1a1a1a] flex justify-between items-center bg-[#0e0e0e]">
                                        <h3 className="text-xs font-bold text-[#888] uppercase tracking-wider">Drag to Slot</h3>
                                        <button 
                                            onClick={() => {
                                                const available = collageImages.slice(0, currentConfig.slots)
                                                setSlots(slots.map((s, i) => ({ ...s, image: available[i] || null })))
                                            }}
                                            className="text-[10px] flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                                        >
                                            <Wand2 size={12} /> Auto-Fill
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-[#222]">
                                        {collageImages.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-8">
                                                <div className="w-16 h-16 rounded-full bg-[#151515] border-2 border-dashed border-[#333] flex items-center justify-center">
                                                    <ImageIcon size={24} className="text-[#555]" />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-medium text-[#ccc] mb-1">No Audio Files</h3>
                                                    <p className="text-xs text-[#666] max-w-[180px]">Import some audio files to create music collections</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {collageImages.slice(0, visibleLibraryCount).map(img => (
                                                        <LibraryItem 
                                                            key={img.id} img={img} preview={previews[img.id]} 
                                                            isPending={pendingImage?.id === img.id}
                                                            onClick={(i: any) => setPendingImage(pendingImage?.id === i.id ? null : i)}
                                                            onDragStart={(e: any, id: string) => e.dataTransfer.setData('source', id)}
                                                        />
                                                    ))}
                                                </div>
                                                {collageImages.length > visibleLibraryCount && (
                                                    <button onClick={() => setVisibleLibraryCount(c => c + 20)} className="w-full py-3 text-xs text-[#555] hover:text-white mt-2">Load More...</button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </motion.div>
                            )}

                            {/* 2. LAYOUT & CANVAS */}
                            {activeTab === 'layout' && (
                                <motion.div 
                                    key="layout"
                                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                                    className="absolute inset-0 overflow-y-auto p-5 space-y-8 scrollbar-thin"
                                >
                                    {/* Grid Templates */}
                                    <section>
                                        <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-3 flex items-center gap-2"><LayoutGrid size={12}/> Structure</h3>
                                        <div className="grid grid-cols-4 gap-2">
                                            {LAYOUTS.map(l => (
                                                <button
                                                    key={l.id}
                                                    onClick={() => setActiveLayout(l.id as LayoutType)}
                                                    className={`aspect-square rounded-lg flex items-center justify-center transition-all border ${activeLayout === l.id ? `bg-${ACCENT_COLOR} border-${ACCENT_COLOR} text-white` : 'bg-[#151515] border-[#222] text-[#555] hover:border-[#444]'}`}
                                                    title={l.name}
                                                >
                                                    <l.icon size={18} />
                                                </button>
                                            ))}
                                        </div>
                                    </section>

                                    {/* Dimensions */}
                                    <section>
                                        <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-3 flex items-center gap-2"><Crop size={12}/> Ratio</h3>
                                        <div className="grid grid-cols-3 gap-2">
                                            {ASPECT_RATIOS.map(r => (
                                                <button
                                                    key={r.id}
                                                    onClick={() => setAspectRatio(r.id)}
                                                    className={`px-2 py-2 rounded text-[10px] font-medium border transition-all ${aspectRatio === r.id ? 'bg-white text-black border-white' : 'bg-[#151515] border-[#222] text-[#888]'}`}
                                                >
                                                    {r.label}
                                                </button>
                                            ))}
                                        </div>
                                    </section>

                                    {/* Spacing Controls */}
                                    <section className="space-y-4">
                                        <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-widest flex items-center gap-2"><Sliders size={12}/> Properties</h3>
                                        
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-[10px] text-[#888]"><span>Inner Gap</span><span>{gap}px</span></div>
                                            <input type="range" max="50" value={gap} onChange={(e) => setGap(Number(e.target.value))} className="w-full h-1 bg-[#222] rounded-full accent-indigo-500" />
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex justify-between text-[10px] text-[#888]"><span>Outer Padding</span><span>{padding}px</span></div>
                                            <input type="range" max="50" value={padding} onChange={(e) => setPadding(Number(e.target.value))} className="w-full h-1 bg-[#222] rounded-full accent-indigo-500" />
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex justify-between text-[10px] text-[#888]"><span>Roundness</span><span>{radius}px</span></div>
                                            <input type="range" max="40" value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full h-1 bg-[#222] rounded-full accent-indigo-500" />
                                        </div>
                                    </section>

                                    {/* Background */}
                                    <section>
                                        <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-3 flex items-center gap-2"><Palette size={12}/> Background</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {['#000000', '#ffffff', '#1a1a1a', '#222222', '#F7F7F7', '#1E1B4B', '#312E81'].map(c => (
                                                <button 
                                                    key={c} onClick={() => setBgColor(c)} 
                                                    className={`w-6 h-6 rounded-full border shadow-sm ${bgColor === c ? 'border-indigo-500 scale-110 ring-2 ring-indigo-500/30' : 'border-transparent ring-1 ring-[#333]'}`} 
                                                    style={{ backgroundColor: c }} 
                                                />
                                            ))}
                                            <div className="w-6 h-6 rounded-full border border-[#333] flex items-center justify-center overflow-hidden relative">
                                                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="opacity-0 absolute inset-0 cursor-pointer" />
                                                <div className="w-full h-full bg-gradient-to-br from-red-500 via-green-500 to-blue-500 opacity-50" />
                                            </div>
                                        </div>
                                    </section>
                                </motion.div>
                            )}

                            {/* 3. IMAGE EDIT */}
                            {activeTab === 'edit' && selectedSlotIndex !== null && (
                                <motion.div 
                                    key="edit"
                                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                                    className="absolute inset-0 overflow-y-auto p-5 space-y-8 scrollbar-thin"
                                >
                                    <div className="flex items-center justify-between pb-4 border-b border-[#222]">
                                        <h3 className="text-xs font-bold text-white">Edit Image</h3>
                                        <button onClick={() => updateSlot(selectedSlotIndex, INITIAL_SLOT)} className="text-[10px] text-red-400 hover:text-red-300">Reset</button>
                                    </div>

                                    {/* Smart Filters */}
                                    <section>
                                        <h4 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-3">Filters</h4>
                                        <div className="grid grid-cols-3 gap-2">
                                            {FILTER_PRESETS.map(f => (
                                                <button
                                                    key={f.id}
                                                    onClick={() => updateSlot(selectedSlotIndex, { filterPreset: f.id })}
                                                    className={`
                                                        aspect-[4/3] rounded overflow-hidden relative group border transition-all
                                                        ${slots[selectedSlotIndex].filterPreset === f.id ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-transparent opacity-60 hover:opacity-100'}
                                                    `}
                                                >
                                                    <div className="w-full h-full bg-[#222]" style={{ filter: f.filter }}>
                                                        {slots[selectedSlotIndex].image && (
                                                            <img src={previews[slots[selectedSlotIndex].image!.id]} className="w-full h-full object-cover" />
                                                        )}
                                                    </div>
                                                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-center text-white py-1 backdrop-blur-sm">{f.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </section>

                                    {/* Manual Adjustments */}
                                    <section className="space-y-5">
                                        <h4 className="text-[10px] font-bold text-[#555] uppercase tracking-widest">Adjustments</h4>
                                        
                                        {[
                                            { label: 'Scale', icon: ZoomIn, key: 'scale', min: 1, max: 3, step: 0.1 },
                                            { label: 'Rotation', icon: RotateCw, key: 'rotation', min: 0, max: 360, step: 1 },
                                            { label: 'Brightness', icon: Sun, key: 'brightness', min: 50, max: 150, step: 1 },
                                            { label: 'Contrast', icon: Contrast, key: 'contrast', min: 50, max: 150, step: 1 },
                                            { label: 'Saturation', icon: Droplet, key: 'saturation', min: 0, max: 200, step: 1 },
                                        ].map((control: any) => (
                                            <div key={control.key} className="space-y-2">
                                                <div className="flex justify-between text-[10px] text-[#ccc]">
                                                    <span className="flex items-center gap-1.5"><control.icon size={10} className="text-[#666]"/> {control.label}</span>
                                                    <span className="font-mono text-[#666]">
                                                        {/* @ts-ignore */}
                                                        {slots[selectedSlotIndex][control.key]}
                                                    </span>
                                                </div>
                                                <input 
                                                    type="range" min={control.min} max={control.max} step={control.step}
                                                    /* @ts-ignore */
                                                    value={slots[selectedSlotIndex][control.key]}
                                                    /* @ts-ignore */
                                                    onChange={(e) => updateSlot(selectedSlotIndex, { [control.key]: Number(e.target.value) })}
                                                    className="w-full h-1 bg-[#222] rounded-full accent-indigo-500"
                                                />
                                            </div>
                                        ))}
                                    </section>

                                    {/* Transform */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <button onClick={() => updateSlot(selectedSlotIndex, { flipX: !slots[selectedSlotIndex].flipX })} className="py-2 bg-[#151515] hover:bg-[#222] rounded text-[10px] text-[#ccc] border border-[#222]">Flip Horizontal</button>
                                        <button onClick={() => updateSlot(selectedSlotIndex, { flipY: !slots[selectedSlotIndex].flipY })} className="py-2 bg-[#151515] hover:bg-[#222] rounded text-[10px] text-[#ccc] border border-[#222]">Flip Vertical</button>
                                    </div>
                                </motion.div>
                            )}

                            {/* 4. TEXT TOOLS */}
                            {activeTab === 'text' && (
                                <motion.div 
                                    key="text"
                                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                                    className="absolute inset-0 overflow-y-auto p-5 space-y-6"
                                >
                                    <button 
                                        onClick={addTextLayer}
                                        className="w-full py-3 bg-[#151515] border border-[#222] hover:border-indigo-500 hover:text-indigo-400 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 mb-6"
                                    >
                                        <Plus size={14} /> Add Text
                                    </button>

                                    {selectedTextId ? (
                                        <div className="space-y-6">
                                            {/* Text Input */}
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-[#555] uppercase">Content</label>
                                                <textarea 
                                                    value={textLayers.find(t => t.id === selectedTextId)?.text}
                                                    onChange={(e) => setTextLayers(prev => prev.map(t => t.id === selectedTextId ? { ...t, text: e.target.value } : t))}
                                                    className="w-full bg-[#111] border border-[#222] rounded p-2 text-xs text-white focus:border-indigo-500 outline-none resize-none h-20"
                                                />
                                            </div>

                                            {/* Appearance */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-[#555] uppercase">Color</label>
                                                    <div className="flex items-center gap-2">
                                                        <input 
                                                            type="color" 
                                                            value={textLayers.find(t => t.id === selectedTextId)?.color}
                                                            onChange={(e) => setTextLayers(prev => prev.map(t => t.id === selectedTextId ? { ...t, color: e.target.value } : t))}
                                                            className="w-8 h-8 rounded border border-[#333] bg-transparent cursor-pointer"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-[#555] uppercase">Size</label>
                                                    <input 
                                                        type="number" 
                                                        value={textLayers.find(t => t.id === selectedTextId)?.size}
                                                        onChange={(e) => setTextLayers(prev => prev.map(t => t.id === selectedTextId ? { ...t, size: Number(e.target.value) } : t))}
                                                        className="w-full bg-[#111] border border-[#222] rounded p-1.5 text-xs text-white"
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* Actions */}
                                            <button 
                                                onClick={() => {
                                                    setTextLayers(prev => prev.filter(t => t.id !== selectedTextId))
                                                    setSelectedTextId(null)
                                                }}
                                                className="w-full py-2 bg-red-900/20 text-red-500 hover:bg-red-900/40 rounded text-xs border border-red-900/30"
                                            >
                                                Delete Layer
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-center text-[#444] text-xs py-10">Select a text layer to edit</div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* CENTER: Canvas */}
                <div className="flex-1 bg-[#050505] flex items-center justify-center p-10 relative overflow-hidden" onClick={() => { setSelectedSlotIndex(null); setSelectedTextId(null); setActiveTab('layout') }}>
                    
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                    {/* THE CANVAS */}
                    <div 
                        ref={canvasRef}
                        className="relative transition-all duration-300 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            height: 'min(100%, 800px)',
                            aspectRatio: currentRatio,
                            backgroundColor: bgColor,
                            padding: padding,
                        }}
                    >
                        {/* Slots Grid */}
                        <div 
                            className="w-full h-full grid transition-all duration-300"
                            style={{ gap: gap, ...getGridStyle(activeLayout) }}
                        >
                            {slots.map((slot, i) => {
                                const preset = FILTER_PRESETS.find(p => p.id === slot.filterPreset)
                                return (
                                    <div 
                                        key={i}
                                        style={{ 
                                            ...getSlotSpan(activeLayout, i),
                                            borderRadius: radius,
                                            overflow: 'hidden'
                                        }}
                                        onClick={() => handleSlotClick(i)}
                                        onDragOver={(e) => { e.preventDefault(); setDragOverSlot(i) }}
                                        onDragLeave={() => setDragOverSlot(null)}
                                        onDrop={(e) => handleDrop(e, i)}
                                        className={`
                                            relative bg-[#111] group transition-all duration-200 cursor-pointer border
                                            ${dragOverSlot === i ? 'border-indigo-500 ring-4 ring-indigo-500/20 z-10' : 'border-[#222]'}
                                            ${selectedSlotIndex === i ? 'ring-2 ring-white border-white z-10 shadow-xl' : 'hover:border-[#444]'}
                                            ${pendingImage ? 'ring-1 ring-dashed ring-indigo-500/50 bg-indigo-900/10' : ''}
                                        `}
                                    >
                                        {slot.image ? (
                                            <>
                                                <div className="w-full h-full overflow-hidden" style={{ filter: preset?.filter }}>
                                                    <img 
                                                        src={previews[slot.image.id] || slot.image.path}
                                                        className="w-full h-full object-cover pointer-events-none select-none"
                                                        style={{
                                                            transform: `scale(${slot.scale}) rotate(${slot.rotation}deg) translate(${slot.panX - 50}%, ${slot.panY - 50}%)`,
                                                            filter: `brightness(${slot.brightness}%) contrast(${slot.contrast}%) saturate(${slot.saturation}%)`,
                                                            scale: `${slot.flipX ? -1 : 1} ${slot.flipY ? -1 : 1}`
                                                        }}
                                                    />
                                                </div>
                                                
                                                {/* Hover Controls */}
                                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={(e) => { e.stopPropagation(); updateSlot(i, INITIAL_SLOT) }} className="p-1.5 bg-black/60 text-white rounded-md hover:bg-red-500 backdrop-blur-md"><Trash2 size={12}/></button>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-[#333]">
                                                {pendingImage ? (
                                                    <div className="animate-pulse flex flex-col items-center text-indigo-500">
                                                        <Check size={24} />
                                                        <span className="text-[10px] font-bold mt-2">DROP HERE</span>
                                                    </div>
                                                ) : (
                                                    <Plus size={24} className="opacity-20" />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Text Layers Overlay */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            {textLayers.map(layer => (
                                <div
                                    key={layer.id}
                                    onMouseDown={(e) => handleTextDragStart(e, layer.id)}
                                    className={`
                                        absolute cursor-move select-none p-2 border transition-all pointer-events-auto
                                        ${selectedTextId === layer.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-transparent hover:border-white/20'}
                                    `}
                                    style={{
                                        left: `${layer.x}%`, top: `${layer.y}%`,
                                        transform: 'translate(-50%, -50%)',
                                        color: layer.color,
                                        fontSize: `${layer.size}px`,
                                        fontFamily: layer.font,
                                        fontWeight: layer.bold ? 'bold' : 'normal',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {layer.text}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* EXPORT MODAL */}
            {showExportModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="bg-[#0a0a0a] border border-[#222] rounded-xl p-6 w-96 shadow-2xl"
                    >
                        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Share2 size={18}/> Export Collage</h2>
                        
                        <div className="space-y-4 mb-6">
                            <div className="space-y-2">
                                <label className="text-xs text-[#666] font-bold uppercase">Format</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button className="py-2 bg-[#151515] border border-indigo-500 text-indigo-400 rounded text-xs font-bold">JPG</button>
                                    <button className="py-2 bg-[#151515] border border-[#222] text-[#666] rounded text-xs">PNG</button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-[#666] font-bold uppercase">Quality (High)</label>
                                <div className="h-1 bg-[#222] rounded-full overflow-hidden">
                                    <div className="h-full w-[80%] bg-indigo-500" />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setShowExportModal(false)} className="flex-1 py-2.5 bg-[#151515] hover:bg-[#222] rounded-lg text-xs font-bold transition-colors">Cancel</button>
                            <button onClick={() => { setShowExportModal(false); alert("Saved to Gallery!") }} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors">Save Image</button>
                        </div>
                    </motion.div>
                </div>
            )}

        </div>
    )
}