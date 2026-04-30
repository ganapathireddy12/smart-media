import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Printer, CreditCard, User, Loader2, Check } from 'lucide-react'

interface PrintLayoutModalProps {
    isOpen: boolean
    onClose: () => void
    imagePath: string
    imagePreview: string
}

type LayoutType = 'passport' | 'wallet' | 'id-card'

interface LayoutConfig {
    id: LayoutType
    name: string
    icon: any
    description: string
    copies: number
    cols: number
    rows: number
    aspectRatio: string
    paperSize: string
}

const layouts: LayoutConfig[] = [
    { id: 'passport', name: 'Passport Photo', icon: User, description: '2×2 inch', copies: 6, cols: 3, rows: 2, aspectRatio: '1/1', paperSize: '6×4 inch' },
    { id: 'wallet', name: 'Wallet Size', icon: CreditCard, description: '2.5×3.5 inch', copies: 8, cols: 4, rows: 2, aspectRatio: '5/7', paperSize: '10×7 inch' },
    { id: 'id-card', name: 'ID Card Photo', icon: CreditCard, description: '3.5×4.5 inch', copies: 4, cols: 2, rows: 2, aspectRatio: '7/9', paperSize: '7×9 inch' },
]

export default function PrintLayoutModal({ isOpen, onClose, imagePreview }: PrintLayoutModalProps) {
    const [selectedLayout, setSelectedLayout] = useState<LayoutType>('passport')
    const [isGenerating, setIsGenerating] = useState(false)
    const [isGenerated, setIsGenerated] = useState(false)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    const currentLayout = layouts.find(l => l.id === selectedLayout)!

    const generateLayout = async () => {
        if (!canvasRef.current || !imagePreview) return

        setIsGenerating(true)
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = imagePreview

        await new Promise((resolve) => { img.onload = resolve })

        // Set canvas size based on layout
        const cellWidth = 300
        const cellHeight = currentLayout.id === 'passport' ? 300 :
            currentLayout.id === 'wallet' ? 420 : 385
        const padding = 20

        canvas.width = (cellWidth * currentLayout.cols) + (padding * (currentLayout.cols + 1))
        canvas.height = (cellHeight * currentLayout.rows) + (padding * (currentLayout.rows + 1))

        // Fill white background
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Draw images in grid
        for (let row = 0; row < currentLayout.rows; row++) {
            for (let col = 0; col < currentLayout.cols; col++) {
                const x = padding + col * (cellWidth + padding)
                const y = padding + row * (cellHeight + padding)

                // Draw image maintaining aspect ratio
                const scale = Math.max(cellWidth / img.width, cellHeight / img.height)
                const scaledWidth = img.width * scale
                const scaledHeight = img.height * scale
                const offsetX = (cellWidth - scaledWidth) / 2
                const offsetY = (cellHeight - scaledHeight) / 2

                ctx.save()
                ctx.beginPath()
                ctx.rect(x, y, cellWidth, cellHeight)
                ctx.clip()
                ctx.drawImage(img, x + offsetX, y + offsetY, scaledWidth, scaledHeight)
                ctx.restore()

                // Draw border
                ctx.strokeStyle = '#e5e5e5'
                ctx.lineWidth = 1
                ctx.strokeRect(x, y, cellWidth, cellHeight)
            }
        }

        setIsGenerating(false)
        setIsGenerated(true)
    }

    const handleDownload = () => {
        if (!canvasRef.current) return
        const link = document.createElement('a')
        link.download = `${currentLayout.name.replace(/\s/g, '_')}_layout.png`
        link.href = canvasRef.current.toDataURL('image/png')
        link.click()
    }

    useEffect(() => {
        setIsGenerated(false)
    }, [selectedLayout])

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[#111] border border-white/10 rounded-2xl w-[900px] max-h-[85vh] overflow-hidden shadow-2xl"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/20 rounded-lg">
                                <Printer size={20} className="text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Print Layout Generator</h2>
                                <p className="text-xs text-zinc-500">Create print-ready photo layouts</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <X size={20} className="text-zinc-400" />
                        </button>
                    </div>

                    <div className="flex">
                        {/* Left - Layout Selection */}
                        <div className="w-[280px] border-r border-white/10 p-4 space-y-3">
                            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Select Layout</h3>
                            {layouts.map((layout) => (
                                <button
                                    key={layout.id}
                                    onClick={() => setSelectedLayout(layout.id)}
                                    className={`w-full p-4 rounded-xl border transition-all text-left ${selectedLayout === layout.id
                                        ? 'bg-blue-500/20 border-blue-500/50 text-white'
                                        : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <layout.icon size={20} />
                                        <div>
                                            <p className="font-semibold text-sm">{layout.name}</p>
                                            <p className="text-xs opacity-70">{layout.description} • {layout.copies} copies</p>
                                        </div>
                                    </div>
                                </button>
                            ))}

                            <div className="pt-4 border-t border-white/10 mt-4">
                                <button
                                    onClick={generateLayout}
                                    disabled={isGenerating}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
                                >
                                    {isGenerating ? (
                                        <><Loader2 size={16} className="animate-spin" /> Generating...</>
                                    ) : (
                                        <><Printer size={16} /> Generate Layout</>
                                    )}
                                </button>

                                {isGenerated && (
                                    <button
                                        onClick={handleDownload}
                                        className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
                                    >
                                        <Download size={16} /> Download PNG
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Right - Preview */}
                        <div className="flex-1 p-6 flex flex-col items-center justify-center bg-[#0a0a0a] min-h-[500px]">
                            {!isGenerated ? (
                                <div className="text-center">
                                    <div className="w-32 h-32 mx-auto mb-4 rounded-xl overflow-hidden border border-white/10">
                                        {imagePreview && <img src={imagePreview} className="w-full h-full object-cover" />}
                                    </div>
                                    <p className="text-zinc-500 text-sm">Click "Generate Layout" to preview</p>
                                    <p className="text-zinc-600 text-xs mt-1">Output: {currentLayout.paperSize} with {currentLayout.copies} photos</p>
                                </div>
                            ) : (
                                <div className="relative">
                                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                                        <Check size={14} className="text-white" />
                                    </div>
                                    <canvas
                                        ref={canvasRef}
                                        className="max-w-full max-h-[400px] rounded-lg border border-white/10 shadow-xl"
                                    />
                                </div>
                            )}
                            <canvas ref={canvasRef} className={isGenerated ? 'hidden' : 'hidden'} />
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
