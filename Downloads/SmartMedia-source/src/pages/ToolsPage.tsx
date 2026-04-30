import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/appStore'
import {
    FileText, FileImage, Upload, Loader2, Check, X,
    Image as ImageIcon, Combine, Split, Save,
    ArrowRightLeft, Wand2, Trash2, ChevronRight, Star,
    LayoutGrid, Zap, Settings, Command
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Tool definitions
interface Tool {
    id: string
    name: string
    description: string
    icon: LucideIcon
    inputFormats: string[]
    outputFormat: string
    category: 'conversion' | 'pdf' | 'image' | 'compression'
    isPremium?: boolean
}

const tools: Tool[] = [
    // PDF Tools
    { id: 'pdf-to-word', name: 'PDF to Word', description: 'Convert PDF to Word', icon: FileText, inputFormats: ['pdf'], outputFormat: 'docx', category: 'conversion' },
    { id: 'word-to-pdf', name: 'Word to PDF', description: 'Convert Word to PDF', icon: FileText, inputFormats: ['doc', 'docx'], outputFormat: 'pdf', category: 'conversion' },
    { id: 'image-to-pdf', name: 'Images to PDF', description: 'Combine images to PDF', icon: FileImage, inputFormats: ['jpg', 'png', 'webp'], outputFormat: 'pdf', category: 'conversion' },
    { id: 'pdf-merge', name: 'Merge PDFs', description: 'Combine PDF files', icon: Combine, inputFormats: ['pdf'], outputFormat: 'pdf', category: 'pdf' },
    { id: 'pdf-split', name: 'Split PDF', description: 'Split PDF files', icon: Split, inputFormats: ['pdf'], outputFormat: 'pdf', category: 'pdf' },
    // Image Tools
    { id: 'image-compress', name: 'Compress Images', description: 'Reduce size, keep quality', icon: ImageIcon, inputFormats: ['jpg', 'png', 'webp'], outputFormat: 'same', category: 'compression' },
    { id: 'image-convert', name: 'Convert Images', description: 'Change image formats', icon: ArrowRightLeft, inputFormats: ['jpg', 'png', 'webp', 'gif', 'heic'], outputFormat: 'any', category: 'image' },
    { id: 'image-resize', name: 'Resize Images', description: 'Batch resize dimensions', icon: Wand2, inputFormats: ['jpg', 'png', 'webp'], outputFormat: 'same', category: 'image' },
    { id: 'image-ocr', name: 'Extract Text (OCR)', description: 'Extract text from images', icon: FileText, inputFormats: ['jpg', 'png'], outputFormat: 'txt', category: 'conversion' },
    // New Tools
    { id: 'watermark', name: 'Add Watermark', description: 'Add text/image watermark', icon: Wand2, inputFormats: ['jpg', 'png', 'webp'], outputFormat: 'same', category: 'image', isPremium: false },
    { id: 'bg-remove', name: 'Remove Background', description: 'AI-powered background removal', icon: Wand2, inputFormats: ['jpg', 'png'], outputFormat: 'png', category: 'image', isPremium: true },
    { id: 'upscale', name: 'AI Upscale', description: '2x/4x image upscaling', icon: Wand2, inputFormats: ['jpg', 'png', 'webp'], outputFormat: 'same', category: 'image', isPremium: true },
    { id: 'collage', name: 'Collage Maker', description: 'Create photo collages', icon: LayoutGrid, inputFormats: ['jpg', 'png', 'webp'], outputFormat: 'jpg', category: 'image' },
    { id: 'qr-gen', name: 'QR Generator', description: 'Create QR codes', icon: LayoutGrid, inputFormats: [], outputFormat: 'png', category: 'image' },
    { id: 'metadata-edit', name: 'Metadata Editor', description: 'Edit EXIF data', icon: FileText, inputFormats: ['jpg', 'png'], outputFormat: 'same', category: 'image' },
    { id: 'color-correct', name: 'Color Presets', description: 'Apply color corrections', icon: Wand2, inputFormats: ['jpg', 'png', 'webp'], outputFormat: 'same', category: 'image' },
]

const categories = [
    { id: 'all', name: 'All Tools', icon: LayoutGrid },
    { id: 'conversion', name: 'Conversion', icon: ArrowRightLeft },
    { id: 'pdf', name: 'PDF Tools', icon: FileText },
    { id: 'image', name: 'Image Tools', icon: ImageIcon },
    { id: 'compression', name: 'Compression', icon: Zap },
]

interface ConversionJob {
    id: string
    toolId: string
    files: string[]
    status: 'processing' | 'completed' | 'failed'
    outputPath?: string
    error?: string
    progress: number
}

export default function ToolsPage() {
    const [selectedCategory, setSelectedCategory] = useState('all')
    const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
    const [selectedFiles, setSelectedFiles] = useState<string[]>([])
    const [jobs, setJobs] = useState<ConversionJob[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [outputFormat, setOutputFormat] = useState<string>('')
    const [compressionQuality, setCompressionQuality] = useState(80)
    const [resizeWidth, setResizeWidth] = useState(1920)
    const [resizeHeight, setResizeHeight] = useState(1080)
    // New tool options
    const [watermarkText, setWatermarkText] = useState('© 2024')
    const [watermarkPosition, setWatermarkPosition] = useState<'bottomRight' | 'bottomLeft' | 'topRight' | 'topLeft' | 'center'>('bottomRight')
    const [watermarkOpacity, setWatermarkOpacity] = useState(70)
    const [upscaleFactor, setUpscaleFactor] = useState<2 | 4>(2)
    const [qrContent, setQrContent] = useState('')
    const [colorPreset, setColorPreset] = useState<'warm' | 'cool' | 'vintage' | 'bw' | 'sepia' | 'vivid'>('warm')
    const [pdfSplitPages, setPdfSplitPages] = useState('')
    const [ocrResult, setOcrResult] = useState('')

    const setCurrentScreen = useAppStore((state) => state.setCurrentScreen)

    const filteredTools = selectedCategory === 'all'
        ? tools
        : tools.filter(t => t.category === selectedCategory)

    const handleSelectFiles = useCallback(async () => {
        if (!selectedTool) return
        try {
            const filters = [{ name: `Supported Files`, extensions: selectedTool.inputFormats }]
            // @ts-ignore
            const files = await window.electronAPI?.selectFilesWithFilter(filters, true)
            if (files && files.length > 0) setSelectedFiles(files)
        } catch (error) { console.error(error) }
    }, [selectedTool])

    const handleConvert = useCallback(async () => {
        if (!selectedTool) return
        
        // Special handling for QR Generator (no files needed)
        if (selectedTool.id === 'qr-gen') {
            if (!qrContent.trim()) return
        } else if (selectedFiles.length === 0) {
            return
        }
        
        setIsProcessing(true)
        const jobId = `job-${Date.now()}`
        const newJob: ConversionJob = { id: jobId, toolId: selectedTool.id, files: selectedFiles, status: 'processing', progress: 0 }
        setJobs(prev => [newJob, ...prev])

        try {
            const options: Record<string, unknown> = {}
            
            // Image Convert
            if (selectedTool.id === 'image-convert' && outputFormat) options.outputFormat = outputFormat
            
            // Image Compress
            if (selectedTool.id === 'image-compress') options.quality = compressionQuality
            
            // Image Resize
            if (selectedTool.id === 'image-resize') { 
                options.width = resizeWidth
                options.height = resizeHeight 
            }
            
            // Watermark
            if (selectedTool.id === 'watermark') {
                options.text = watermarkText
                options.position = watermarkPosition
                options.opacity = watermarkOpacity
            }
            
            // AI Upscale
            if (selectedTool.id === 'upscale') {
                options.factor = upscaleFactor
            }
            
            // QR Generator
            if (selectedTool.id === 'qr-gen') {
                options.content = qrContent
            }
            
            // Color Presets
            if (selectedTool.id === 'color-correct') {
                options.preset = colorPreset
            }
            
            // PDF Split
            if (selectedTool.id === 'pdf-split') {
                options.pages = pdfSplitPages
            }

            // @ts-ignore
            const result = await window.electronAPI?.convertFile(selectedTool.id, selectedFiles, options)

            if (result?.success) {
                setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'completed', progress: 100, outputPath: result.outputPath } : j))
                
                // For OCR, show the extracted text
                if (selectedTool.id === 'image-ocr' && result.text) {
                    setOcrResult(result.text)
                }
                
                if (result.outputPath) await handleDownload(result.outputPath)
            } else {
                setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'failed', error: result?.error || 'Failed' } : j))
            }
        } catch (error) {
            const errMessage = error instanceof Error ? error.message : 'Failed'
            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'failed', error: errMessage } : j))
        } finally {
            setIsProcessing(false)
        }
    }, [selectedTool, selectedFiles, outputFormat, compressionQuality, resizeWidth, resizeHeight, watermarkText, watermarkPosition, watermarkOpacity, upscaleFactor, qrContent, colorPreset, pdfSplitPages])

    const handleDownload = useCallback(async (outputPath: string) => {
        // @ts-ignore
        await window.electronAPI?.downloadFile(outputPath)
    }, [])

    const removeFile = (index: number) => setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    const clearJobs = () => setJobs([])

    return (
        <div className="h-full flex flex-col bg-black text-white relative overflow-hidden font-sans text-sm selection:bg-white selection:text-black">
            {/* Header */}
            <div className="relative z-10 px-6 py-4 border-b border-white/10 bg-black flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                        <Command size={16} className="text-black" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-white leading-none">MonoTools</h1>
                        <p className="text-xs text-zinc-500">v2.0.4</p>
                    </div>
                </div>
                <button
                    onClick={() => setCurrentScreen('home')}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-xs font-medium transition-all duration-200"
                >
                    <span>Back</span>
                    <ChevronRight size={14} />
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden relative z-10">
                {/* Left Panel - Sidebar */}
                <div className="w-[280px] border-r border-white/10 bg-zinc-950/50 flex flex-col">
                    {/* Category Tabs */}
                    <div className="p-4 border-b border-white/10">
                        <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/5">
                            {categories.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`flex-1 flex items-center justify-center py-2 rounded-md text-xs font-medium transition-all duration-200 ${selectedCategory === cat.id
                                        ? 'bg-white text-black shadow-sm'
                                        : 'text-zinc-500 hover:text-white hover:bg-white/5'
                                        }`}
                                    title={cat.name}
                                >
                                    <cat.icon size={14} />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tools List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {filteredTools.map(tool => {
                            const Icon = tool.icon
                            const isSelected = selectedTool?.id === tool.id

                            return (
                                <motion.button
                                    key={tool.id}
                                    onClick={() => {
                                        setSelectedTool(tool)
                                        setSelectedFiles([])
                                        setOutputFormat('')
                                    }}
                                    className={`w-full p-3 rounded-lg text-left transition-all duration-200 border ${isSelected
                                        ? 'bg-white text-black border-white shadow-lg'
                                        : 'bg-zinc-900/50 text-zinc-400 border-white/5 hover:bg-zinc-800 hover:border-white/10'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-md ${isSelected ? 'bg-black/10' : 'bg-white/5'}`}>
                                            <Icon size={16} className={isSelected ? 'text-black' : 'text-zinc-300'} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-semibold truncate">{tool.name}</h3>
                                                {tool.isPremium && <Star size={10} className="fill-current" />}
                                            </div>
                                            <p className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-zinc-600' : 'text-zinc-600'}`}>
                                                {tool.description}
                                            </p>
                                        </div>
                                    </div>
                                </motion.button>
                            )
                        })}
                    </div>
                </div>

                {/* Right Panel - Workspace */}
                <div className="flex-1 bg-black flex flex-col relative overflow-hidden">
                    <AnimatePresence mode="wait">
                        {selectedTool ? (
                            <motion.div
                                key={selectedTool.id}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex-1 p-8 overflow-y-auto"
                            >
                                <div className="max-w-4xl mx-auto space-y-6">
                                    {/* Tool Header */}
                                    <div className="flex items-center gap-4 pb-6 border-b border-white/10">
                                        <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center shadow-lg">
                                            <selectedTool.icon size={24} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold text-white tracking-tight">{selectedTool.name}</h2>
                                            <p className="text-sm text-zinc-500">{selectedTool.description}</p>
                                        </div>
                                    </div>

                                    {/* Drop Zone */}
                                    <div
                                        onClick={handleSelectFiles}
                                        className="relative group border border-dashed border-white/20 hover:border-white rounded-xl p-8 bg-zinc-900/20 hover:bg-zinc-900/50 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-3"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-zinc-800 group-hover:bg-white transition-colors flex items-center justify-center">
                                            <Upload size={20} className="text-zinc-400 group-hover:text-black transition-colors" />
                                        </div>
                                        <div className="text-center">
                                            <h3 className="text-sm font-semibold text-white">Click or Drag files</h3>
                                            <p className="text-xs text-zinc-500 mt-1">
                                                Supports: <span className="font-mono text-zinc-400">{selectedTool.inputFormats.join(', ')}</span>
                                            </p>
                                        </div>
                                    </div>

                                    {/* Main Content Grid */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* File List */}
                                        <div className="bg-zinc-900/30 border border-white/10 rounded-xl p-4 h-fit">
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                                                    Payload
                                                    <span className="px-1.5 py-0.5 bg-white text-black rounded text-[10px] font-bold">{selectedFiles.length}</span>
                                                </h3>
                                                {selectedFiles.length > 0 && (
                                                    <button onClick={() => setSelectedFiles([])} className="text-[10px] text-red-400 hover:text-red-300 hover:underline">
                                                        CLEAR
                                                    </button>
                                                )}
                                            </div>

                                            {selectedFiles.length > 0 ? (
                                                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                                    {selectedFiles.map((file, idx) => (
                                                        <div key={idx} className="flex items-center gap-3 p-2 bg-black border border-white/10 rounded-lg group hover:border-white/30 transition-colors">
                                                            <div className="p-1.5 bg-zinc-800 rounded">
                                                                <FileText size={14} className="text-white" />
                                                            </div>
                                                            <span className="flex-1 text-xs font-mono text-zinc-300 truncate">{file.split(/[/\\]/).pop()}</span>
                                                            <button onClick={() => removeFile(idx)} className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="h-24 flex items-center justify-center text-xs text-zinc-600 border border-dashed border-white/5 rounded-lg">
                                                    Empty Buffer
                                                </div>
                                            )}
                                        </div>

                                        {/* Options & Actions */}
                                        <div className="space-y-4">
                                            {selectedTool.id === 'image-convert' && (
                                                <div className="bg-zinc-900/30 border border-white/10 rounded-xl p-4">
                                                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Output Format</h3>
                                                    <div className="grid grid-cols-4 gap-2">
                                                        {['jpg', 'png', 'webp', 'gif'].map(fmt => (
                                                            <button
                                                                key={fmt}
                                                                onClick={() => setOutputFormat(fmt)}
                                                                className={`py-2 rounded-lg text-xs font-bold uppercase transition-all ${outputFormat === fmt
                                                                    ? 'bg-white text-black shadow-sm'
                                                                    : 'bg-black border border-white/10 text-zinc-400 hover:border-white/30'
                                                                    }`}
                                                            >
                                                                {fmt}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {selectedTool.id === 'image-compress' && (
                                                <div className="bg-zinc-900/30 border border-white/10 rounded-xl p-4">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Quality</h3>
                                                        <span className="text-sm font-mono font-bold text-white">{compressionQuality}%</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="10" max="100"
                                                        value={compressionQuality}
                                                        onChange={(e) => setCompressionQuality(parseInt(e.target.value))}
                                                        className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-white"
                                                    />
                                                </div>
                                            )}

                                            {selectedTool.id === 'image-resize' && (
                                                <div className="bg-zinc-900/30 border border-white/10 rounded-xl p-4">
                                                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Dimensions</h3>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-[10px] text-zinc-500 block mb-1">Width (px)</label>
                                                            <input type="number" value={resizeWidth} onChange={(e) => setResizeWidth(parseInt(e.target.value))} className="w-full bg-black border border-white/10 rounded-lg p-2 text-sm text-white focus:border-white outline-none font-mono" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-zinc-500 block mb-1">Height (px)</label>
                                                            <input type="number" value={resizeHeight} onChange={(e) => setResizeHeight(parseInt(e.target.value))} className="w-full bg-black border border-white/10 rounded-lg p-2 text-sm text-white focus:border-white outline-none font-mono" />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Watermark Options */}
                                            {selectedTool.id === 'watermark' && (
                                                <div className="bg-zinc-900/30 border border-white/10 rounded-xl p-4 space-y-4">
                                                    <div>
                                                        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Watermark Text</h3>
                                                        <input
                                                            type="text"
                                                            value={watermarkText}
                                                            onChange={(e) => setWatermarkText(e.target.value)}
                                                            placeholder="Enter watermark text..."
                                                            className="w-full bg-black border border-white/10 rounded-lg p-2 text-sm text-white focus:border-white outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Position</h3>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {(['topLeft', 'topRight', 'center', 'bottomLeft', 'bottomRight'] as const).map(pos => (
                                                                <button
                                                                    key={pos}
                                                                    onClick={() => setWatermarkPosition(pos)}
                                                                    className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${watermarkPosition === pos
                                                                        ? 'bg-white text-black'
                                                                        : 'bg-black border border-white/10 text-zinc-400 hover:border-white/30'
                                                                        }`}
                                                                >
                                                                    {pos.replace(/([A-Z])/g, ' $1').trim()}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between items-center mb-2">
                                                            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Opacity</h3>
                                                            <span className="text-sm font-mono font-bold text-white">{watermarkOpacity}%</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="10" max="100"
                                                            value={watermarkOpacity}
                                                            onChange={(e) => setWatermarkOpacity(parseInt(e.target.value))}
                                                            className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-white"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* AI Upscale Options */}
                                            {selectedTool.id === 'upscale' && (
                                                <div className="bg-zinc-900/30 border border-white/10 rounded-xl p-4">
                                                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Upscale Factor</h3>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {([2, 4] as const).map(factor => (
                                                            <button
                                                                key={factor}
                                                                onClick={() => setUpscaleFactor(factor)}
                                                                className={`py-3 rounded-lg text-sm font-bold transition-all ${upscaleFactor === factor
                                                                    ? 'bg-white text-black shadow-sm'
                                                                    : 'bg-black border border-white/10 text-zinc-400 hover:border-white/30'
                                                                    }`}
                                                            >
                                                                {factor}x Upscale
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="text-[10px] text-zinc-500 mt-2">Higher factor = larger output size</p>
                                                </div>
                                            )}

                                            {/* QR Generator Options */}
                                            {selectedTool.id === 'qr-gen' && (
                                                <div className="bg-zinc-900/30 border border-white/10 rounded-xl p-4">
                                                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">QR Content</h3>
                                                    <textarea
                                                        value={qrContent}
                                                        onChange={(e) => setQrContent(e.target.value)}
                                                        placeholder="Enter URL or text to encode..."
                                                        className="w-full bg-black border border-white/10 rounded-lg p-3 text-sm text-white focus:border-white outline-none resize-none h-24"
                                                    />
                                                    <p className="text-[10px] text-zinc-500 mt-2">Enter a URL, text, or contact info</p>
                                                </div>
                                            )}

                                            {/* Color Presets Options */}
                                            {selectedTool.id === 'color-correct' && (
                                                <div className="bg-zinc-900/30 border border-white/10 rounded-xl p-4">
                                                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Color Preset</h3>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {(['warm', 'cool', 'vintage', 'bw', 'sepia', 'vivid'] as const).map(preset => (
                                                            <button
                                                                key={preset}
                                                                onClick={() => setColorPreset(preset)}
                                                                className={`py-2 rounded-lg text-xs font-bold uppercase transition-all ${colorPreset === preset
                                                                    ? 'bg-white text-black shadow-sm'
                                                                    : 'bg-black border border-white/10 text-zinc-400 hover:border-white/30'
                                                                    }`}
                                                            >
                                                                {preset === 'bw' ? 'B&W' : preset}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* PDF Split Options */}
                                            {selectedTool.id === 'pdf-split' && (
                                                <div className="bg-zinc-900/30 border border-white/10 rounded-xl p-4">
                                                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Pages to Extract</h3>
                                                    <input
                                                        type="text"
                                                        value={pdfSplitPages}
                                                        onChange={(e) => setPdfSplitPages(e.target.value)}
                                                        placeholder="e.g., 1-5, 8, 10-12"
                                                        className="w-full bg-black border border-white/10 rounded-lg p-2 text-sm text-white focus:border-white outline-none font-mono"
                                                    />
                                                    <p className="text-[10px] text-zinc-500 mt-2">Leave empty to split all pages individually</p>
                                                </div>
                                            )}

                                            {/* OCR Result Display */}
                                            {selectedTool.id === 'image-ocr' && ocrResult && (
                                                <div className="bg-zinc-900/30 border border-white/10 rounded-xl p-4">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Extracted Text</h3>
                                                        <button
                                                            onClick={() => navigator.clipboard.writeText(ocrResult)}
                                                            className="text-[10px] text-blue-400 hover:text-blue-300"
                                                        >
                                                            Copy
                                                        </button>
                                                    </div>
                                                    <div className="bg-black border border-white/10 rounded-lg p-3 max-h-40 overflow-y-auto">
                                                        <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono">{ocrResult}</pre>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Background Removal Info */}
                                            {selectedTool.id === 'bg-remove' && (
                                                <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-xl p-4">
                                                    <h3 className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-2">AI-Powered</h3>
                                                    <p className="text-[11px] text-zinc-400">Uses advanced AI to automatically detect and remove backgrounds from your images. Works best with clear subjects.</p>
                                                </div>
                                            )}

                                            {/* Collage Link */}
                                            {selectedTool.id === 'collage' && (
                                                <div className="bg-zinc-900/30 border border-white/10 rounded-xl p-4 text-center">
                                                    <p className="text-xs text-zinc-400 mb-3">For advanced collage creation, use the dedicated Collage Studio</p>
                                                    <button
                                                        onClick={() => setCurrentScreen('collage')}
                                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors"
                                                    >
                                                        Open Collage Studio
                                                    </button>
                                                </div>
                                            )}

                                            {/* Metadata Editor Info */}
                                            {selectedTool.id === 'metadata-edit' && (
                                                <div className="bg-zinc-900/30 border border-white/10 rounded-xl p-4">
                                                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">EXIF Data</h3>
                                                    <p className="text-[11px] text-zinc-500">View and edit image metadata including camera info, GPS location, date taken, and more.</p>
                                                </div>
                                            )}

                                            <button
                                                onClick={handleConvert}
                                                disabled={(selectedTool.id !== 'qr-gen' && selectedFiles.length === 0) || (selectedTool.id === 'qr-gen' && !qrContent.trim()) || isProcessing || selectedTool.id === 'collage'}
                                                className={`w-full py-3 rounded-lg text-sm font-bold tracking-wide transition-all shadow-lg ${((selectedTool.id === 'qr-gen' ? qrContent.trim() : selectedFiles.length > 0) && !isProcessing && selectedTool.id !== 'collage')
                                                    ? 'bg-white text-black hover:bg-zinc-200'
                                                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                                    }`}
                                            >
                                                {isProcessing ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <Loader2 size={16} className="animate-spin" />
                                                        <span>Processing...</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <Zap size={16} className={((selectedTool.id === 'qr-gen' ? qrContent.trim() : selectedFiles.length > 0) && selectedTool.id !== 'collage') ? "fill-black" : ""} />
                                                        <span>Start Process</span>
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Logs */}
                                    {jobs.length > 0 && (
                                        <div className="mt-6 border-t border-white/10 pt-6">
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-sm font-bold text-white">History</h3>
                                                <button onClick={clearJobs} className="text-xs text-zinc-500 hover:text-white flex items-center gap-1.5">
                                                    <Trash2 size={12} /> Clear
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {jobs.slice(0, 5).map(job => (
                                                    <div key={job.id} className="bg-zinc-900/50 border border-white/10 p-3 rounded-lg flex items-center gap-3">
                                                        <div className={`p-1.5 rounded-md ${job.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                                                            job.status === 'failed' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'
                                                            }`}>
                                                            {job.status === 'processing' && <Loader2 size={14} className="animate-spin" />}
                                                            {job.status === 'completed' && <Check size={14} />}
                                                            {job.status === 'failed' && <X size={14} />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-center">
                                                                <h4 className="font-semibold text-xs text-white truncate">{tools.find(t => t.id === job.toolId)?.name}</h4>
                                                                <span className="text-[10px] uppercase font-bold text-zinc-500">{job.status}</span>
                                                            </div>
                                                        </div>
                                                        {job.status === 'completed' && job.outputPath && (
                                                            <button
                                                                onClick={() => handleDownload(job.outputPath!)}
                                                                className="px-3 py-1.5 bg-white text-black rounded-md text-xs font-bold hover:bg-gray-200 transition-colors flex items-center gap-1.5"
                                                            >
                                                                <Save size={12} /> Save
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                                <div className="w-20 h-20 bg-zinc-900 rounded-2xl flex items-center justify-center mb-6 border border-white/5">
                                    <Settings size={32} className="text-zinc-600" />
                                </div>
                                <h2 className="text-xl font-bold text-white mb-2">Ready</h2>
                                <p className="text-sm text-zinc-500 max-w-xs">Select a tool from the sidebar to begin.</p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
}