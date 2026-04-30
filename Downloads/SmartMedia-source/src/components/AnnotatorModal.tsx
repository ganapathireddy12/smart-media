import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    X, Download, Undo2, Redo2, MousePointer, ArrowUpRight,
    Square, Type, Highlighter, Circle
} from 'lucide-react'

interface AnnotatorModalProps {
    isOpen: boolean
    onClose: () => void
    imagePath: string
    imagePreview: string
}

type Tool = 'select' | 'arrow' | 'rectangle' | 'circle' | 'text' | 'highlight' | 'blur'

interface Annotation {
    id: string
    type: Tool
    startX: number
    startY: number
    endX: number
    endY: number
    color: string
    text?: string
}

const tools: { id: Tool; icon: any; name: string }[] = [
    { id: 'select', icon: MousePointer, name: 'Select' },
    { id: 'arrow', icon: ArrowUpRight, name: 'Arrow' },
    { id: 'rectangle', icon: Square, name: 'Rectangle' },
    { id: 'circle', icon: Circle, name: 'Circle' },
    { id: 'text', icon: Type, name: 'Text' },
    { id: 'highlight', icon: Highlighter, name: 'Highlight' },
]

const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ffffff', '#000000']

export default function AnnotatorModal({ isOpen, onClose, imagePreview }: AnnotatorModalProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const overlayRef = useRef<HTMLCanvasElement>(null)
    const [selectedTool, setSelectedTool] = useState<Tool>('arrow')
    const [selectedColor, setSelectedColor] = useState('#ef4444')
    const [annotations, setAnnotations] = useState<Annotation[]>([])
    const [history, setHistory] = useState<Annotation[][]>([[]])
    const [historyIndex, setHistoryIndex] = useState(0)
    const [isDrawing, setIsDrawing] = useState(false)
    const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null)

    // Load image onto canvas
    useEffect(() => {
        if (!isOpen || !imagePreview || !canvasRef.current) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = imagePreview

        img.onload = () => {
            const maxWidth = 800
            const maxHeight = 500
            let width = img.width
            let height = img.height

            if (width > maxWidth) {
                height = (maxWidth / width) * height
                width = maxWidth
            }
            if (height > maxHeight) {
                width = (maxHeight / height) * width
                height = maxHeight
            }

            canvas.width = width
            canvas.height = height
            if (overlayRef.current) {
                overlayRef.current.width = width
                overlayRef.current.height = height
            }

            ctx.drawImage(img, 0, 0, width, height)
        }
    }, [isOpen, imagePreview])

    // Redraw annotations
    const redrawAnnotations = useCallback(() => {
        if (!overlayRef.current) return
        const ctx = overlayRef.current.getContext('2d')
        if (!ctx) return

        ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)

        annotations.forEach((ann) => {
            ctx.strokeStyle = ann.color
            ctx.fillStyle = ann.color
            ctx.lineWidth = 3
            ctx.lineCap = 'round'

            switch (ann.type) {
                case 'arrow':
                    const angle = Math.atan2(ann.endY - ann.startY, ann.endX - ann.startX)
                    ctx.beginPath()
                    ctx.moveTo(ann.startX, ann.startY)
                    ctx.lineTo(ann.endX, ann.endY)
                    ctx.stroke()
                    // Arrowhead
                    ctx.beginPath()
                    ctx.moveTo(ann.endX, ann.endY)
                    ctx.lineTo(ann.endX - 15 * Math.cos(angle - Math.PI / 6), ann.endY - 15 * Math.sin(angle - Math.PI / 6))
                    ctx.lineTo(ann.endX - 15 * Math.cos(angle + Math.PI / 6), ann.endY - 15 * Math.sin(angle + Math.PI / 6))
                    ctx.closePath()
                    ctx.fill()
                    break

                case 'rectangle':
                    ctx.strokeRect(ann.startX, ann.startY, ann.endX - ann.startX, ann.endY - ann.startY)
                    break

                case 'circle':
                    const radiusX = Math.abs(ann.endX - ann.startX) / 2
                    const radiusY = Math.abs(ann.endY - ann.startY) / 2
                    const centerX = (ann.startX + ann.endX) / 2
                    const centerY = (ann.startY + ann.endY) / 2
                    ctx.beginPath()
                    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI)
                    ctx.stroke()
                    break

                case 'highlight':
                    ctx.fillStyle = ann.color + '40'
                    ctx.fillRect(ann.startX, ann.startY, ann.endX - ann.startX, ann.endY - ann.startY)
                    break

                case 'text':
                    ctx.font = 'bold 18px Inter, sans-serif'
                    ctx.fillText(ann.text || 'Text', ann.startX, ann.startY)
                    break
            }
        })

        // Draw current annotation being created
        if (currentAnnotation) {
            ctx.strokeStyle = currentAnnotation.color
            ctx.fillStyle = currentAnnotation.color
            ctx.lineWidth = 3
            ctx.setLineDash([5, 5])

            switch (currentAnnotation.type) {
                case 'arrow':
                    ctx.beginPath()
                    ctx.moveTo(currentAnnotation.startX, currentAnnotation.startY)
                    ctx.lineTo(currentAnnotation.endX, currentAnnotation.endY)
                    ctx.stroke()
                    break
                case 'rectangle':
                    ctx.strokeRect(
                        currentAnnotation.startX, currentAnnotation.startY,
                        currentAnnotation.endX - currentAnnotation.startX, currentAnnotation.endY - currentAnnotation.startY
                    )
                    break
                case 'circle':
                    const rx = Math.abs(currentAnnotation.endX - currentAnnotation.startX) / 2
                    const ry = Math.abs(currentAnnotation.endY - currentAnnotation.startY) / 2
                    const cx = (currentAnnotation.startX + currentAnnotation.endX) / 2
                    const cy = (currentAnnotation.startY + currentAnnotation.endY) / 2
                    ctx.beginPath()
                    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI)
                    ctx.stroke()
                    break
                case 'highlight':
                    ctx.fillStyle = currentAnnotation.color + '40'
                    ctx.fillRect(
                        currentAnnotation.startX, currentAnnotation.startY,
                        currentAnnotation.endX - currentAnnotation.startX, currentAnnotation.endY - currentAnnotation.startY
                    )
                    break
            }
            ctx.setLineDash([])
        }
    }, [annotations, currentAnnotation])

    useEffect(() => {
        redrawAnnotations()
    }, [redrawAnnotations])

    const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = overlayRef.current
        if (!canvas) return { x: 0, y: 0 }
        const rect = canvas.getBoundingClientRect()
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        }
    }

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (selectedTool === 'select') return
        const { x, y } = getCanvasCoords(e)
        setIsDrawing(true)

        if (selectedTool === 'text') {
            const text = prompt('Enter text:')
            if (text) {
                const newAnn: Annotation = {
                    id: Date.now().toString(),
                    type: 'text',
                    startX: x, startY: y,
                    endX: x, endY: y,
                    color: selectedColor,
                    text
                }
                const newAnnotations = [...annotations, newAnn]
                setAnnotations(newAnnotations)
                setHistory([...history.slice(0, historyIndex + 1), newAnnotations])
                setHistoryIndex(historyIndex + 1)
            }
            return
        }

        setCurrentAnnotation({
            id: Date.now().toString(),
            type: selectedTool,
            startX: x, startY: y,
            endX: x, endY: y,
            color: selectedColor
        })
    }

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !currentAnnotation) return
        const { x, y } = getCanvasCoords(e)
        setCurrentAnnotation({ ...currentAnnotation, endX: x, endY: y })
    }

    const handleMouseUp = () => {
        if (!isDrawing || !currentAnnotation) return
        setIsDrawing(false)
        const newAnnotations = [...annotations, currentAnnotation]
        setAnnotations(newAnnotations)
        setHistory([...history.slice(0, historyIndex + 1), newAnnotations])
        setHistoryIndex(historyIndex + 1)
        setCurrentAnnotation(null)
    }

    const handleUndo = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1)
            setAnnotations(history[historyIndex - 1])
        }
    }

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1)
            setAnnotations(history[historyIndex + 1])
        }
    }

    const handleDownload = () => {
        if (!canvasRef.current || !overlayRef.current) return

        const exportCanvas = document.createElement('canvas')
        exportCanvas.width = canvasRef.current.width
        exportCanvas.height = canvasRef.current.height
        const ctx = exportCanvas.getContext('2d')
        if (!ctx) return

        ctx.drawImage(canvasRef.current, 0, 0)
        ctx.drawImage(overlayRef.current, 0, 0)

        const link = document.createElement('a')
        link.download = 'annotated_image.png'
        link.href = exportCanvas.toDataURL('image/png')
        link.click()
    }

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0a0a0a]">
                        <div className="flex items-center gap-4">
                            {/* Tools */}
                            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg">
                                {tools.map((tool) => (
                                    <button
                                        key={tool.id}
                                        onClick={() => setSelectedTool(tool.id)}
                                        title={tool.name}
                                        className={`p-2 rounded-md transition-all ${selectedTool === tool.id
                                            ? 'bg-blue-600 text-white'
                                            : 'text-zinc-400 hover:text-white hover:bg-white/10'
                                            }`}
                                    >
                                        <tool.icon size={18} />
                                    </button>
                                ))}
                            </div>

                            <div className="w-px h-6 bg-white/10" />

                            {/* Colors */}
                            <div className="flex items-center gap-1">
                                {colors.map((color) => (
                                    <button
                                        key={color}
                                        onClick={() => setSelectedColor(color)}
                                        className={`w-6 h-6 rounded-full transition-all ${selectedColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#111]' : ''
                                            }`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>

                            <div className="w-px h-6 bg-white/10" />

                            {/* Undo/Redo */}
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handleUndo}
                                    disabled={historyIndex === 0}
                                    className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
                                >
                                    <Undo2 size={18} />
                                </button>
                                <button
                                    onClick={handleRedo}
                                    disabled={historyIndex >= history.length - 1}
                                    className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
                                >
                                    <Redo2 size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleDownload}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-sm flex items-center gap-2"
                            >
                                <Download size={16} /> Save
                            </button>
                            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                <X size={20} className="text-zinc-400" />
                            </button>
                        </div>
                    </div>

                    {/* Canvas */}
                    <div className="relative bg-[#050505] p-4 flex items-center justify-center" style={{ minHeight: 500 }}>
                        <div className="relative">
                            <canvas ref={canvasRef} className="rounded-lg shadow-lg" />
                            <canvas
                                ref={overlayRef}
                                className="absolute top-0 left-0 rounded-lg cursor-crosshair"
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                            />
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
