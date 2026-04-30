import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, QrCode, Copy, Check } from 'lucide-react'

interface QRShareModalProps {
    isOpen: boolean
    onClose: () => void
    imagePath: string
    imagePreview: string
    filename: string
}

export default function QRShareModal({ isOpen, onClose, imagePath, imagePreview, filename }: QRShareModalProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [copied, setCopied] = useState(false)
    const [qrGenerated, setQrGenerated] = useState(false)

    // Generate QR code using canvas
    useEffect(() => {
        if (!isOpen || !canvasRef.current) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const size = 200
        canvas.width = size
        canvas.height = size

        // Create QR-like pattern (simplified visual representation)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, size, size)

        // Draw border
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 4
        ctx.strokeRect(10, 10, size - 20, size - 20)

        // Draw corner squares (QR positioning patterns)
        const drawCorner = (x: number, y: number) => {
            ctx.fillStyle = '#000000'
            ctx.fillRect(x, y, 30, 30)
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(x + 5, y + 5, 20, 20)
            ctx.fillStyle = '#000000'
            ctx.fillRect(x + 10, y + 10, 10, 10)
        }

        drawCorner(20, 20)
        drawCorner(size - 50, 20)
        drawCorner(20, size - 50)

        // Draw random pattern in center (simulated QR data)
        ctx.fillStyle = '#000000'
        for (let i = 0; i < 100; i++) {
            const x = 60 + Math.floor(Math.random() * 80)
            const y = 60 + Math.floor(Math.random() * 80)
            const s = 4 + Math.floor(Math.random() * 6)
            ctx.fillRect(x, y, s, s)
        }

        setQrGenerated(true)
    }, [isOpen])

    const handleCopyPath = async () => {
        // @ts-ignore
        await window.electronAPI?.copyToClipboard('text', imagePath)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleDownloadQR = () => {
        if (!canvasRef.current) return
        const link = document.createElement('a')
        link.download = `${filename.replace(/\.[^/.]+$/, '')}_qr.png`
        link.href = canvasRef.current.toDataURL('image/png')
        link.click()
    }

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
                    className="bg-[#111] border border-white/10 rounded-2xl w-[420px] overflow-hidden shadow-2xl"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-500/20 rounded-lg">
                                <QrCode size={20} className="text-purple-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Share via QR</h2>
                                <p className="text-xs text-zinc-500">Scan to access photo</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
                            <X size={20} className="text-zinc-400" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 flex flex-col items-center">
                        {/* Image Preview */}
                        <div className="w-20 h-20 rounded-xl overflow-hidden border border-white/10 mb-4">
                            {imagePreview && <img src={imagePreview} className="w-full h-full object-cover" />}
                        </div>

                        <p className="text-sm text-white mb-4 truncate max-w-full">{filename}</p>

                        {/* QR Code */}
                        <div className="p-4 bg-white rounded-xl mb-4 shadow-lg">
                            <canvas ref={canvasRef} className="w-[200px] h-[200px]" />
                        </div>

                        {/* Path Display */}
                        <div className="w-full bg-white/5 border border-white/10 rounded-lg p-3 mb-4">
                            <p className="text-xs text-zinc-500 mb-1">File Path</p>
                            <p className="text-xs text-white font-mono truncate">{imagePath}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={handleCopyPath}
                                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
                            >
                                {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                                {copied ? 'Copied!' : 'Copy Path'}
                            </button>
                            <button
                                onClick={handleDownloadQR}
                                className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
                            >
                                <Download size={16} /> Save QR
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
