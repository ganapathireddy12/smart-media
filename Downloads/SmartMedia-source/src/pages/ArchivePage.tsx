import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Masonry from 'react-masonry-css'
import { useAppStore, ImageMetadata } from '../store/appStore'
import PhotoViewer from '../components/PhotoViewer'
import {
    Archive, Grid3X3, LayoutGrid, Trash2, RefreshCw, Search, X,
    ChevronRight, Eye, MoreHorizontal, Check
} from 'lucide-react'

// --- CONSTANTS ---
const PAGE_BG = "bg-[#050505]"
const CARD_BG = "bg-[#111]"

const ArchiveCard = memo(({
    image, preview, isSelected, onClick, onToggleSelect
}: {
    image: ImageMetadata, preview: string, isSelected: boolean, onClick: () => void, onToggleSelect: () => void
}) => (
    <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`relative group overflow-hidden rounded-lg cursor-pointer ${CARD_BG} ${isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-transparent hover:ring-[#333]'
            }`}
        onClick={onClick}
    >
        <div className="w-full aspect-square">
            <img
                src={preview || image.path}
                alt={image.filename}
                loading="lazy"
                className={`w-full h-full object-cover transition-transform duration-500 ${isSelected ? 'opacity-50' : 'group-hover:scale-105'
                    }`}
            />
        </div>

        {/* Selection Checkbox */}
        <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
            className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected
                    ? 'bg-blue-500 border-blue-500'
                    : 'border-white/50 bg-black/30 opacity-0 group-hover:opacity-100'
                }`}
        >
            {isSelected && <Check size={12} className="text-white" />}
        </button>

        {/* Info Overlay */}
        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-xs text-white font-medium truncate">{image.filename}</p>
            <p className="text-[10px] text-white/60">{new Date(image.dateScanned).toLocaleDateString()}</p>
        </div>
    </motion.div>
))

export default function ArchivePage() {
    const { images, setCurrentScreen, toggleFavorite } = useAppStore()
    const [previews, setPreviews] = useState<Record<string, string>>({})
    const [viewMode, setViewMode] = useState<'grid' | 'masonry'>('grid')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedImage, setSelectedImage] = useState<ImageMetadata | null>(null)

    // Simulated archived images (in real app, would use isArchived flag in store)
    const [archivedIds, setArchivedIds] = useState<Set<string>>(() => {
        const saved = localStorage.getItem('smartmedia_archived')
        return saved ? new Set(JSON.parse(saved)) : new Set()
    })

    // Save archived IDs to localStorage
    useEffect(() => {
        localStorage.setItem('smartmedia_archived', JSON.stringify([...archivedIds]))
    }, [archivedIds])

    // Filter archived images
    const archivedImages = useMemo(() => {
        return images.filter(img =>
            archivedIds.has(img.id) &&
            (searchQuery === '' || img.filename.toLowerCase().includes(searchQuery.toLowerCase()))
        )
    }, [images, archivedIds, searchQuery])

    // Load previews
    useEffect(() => {
        const load = async () => {
            for (const img of archivedImages.slice(0, 50)) {
                if (!previews[img.id]) {
                    // @ts-ignore
                    const preview = await window.electronAPI?.getImageThumbnail(img.path)
                    if (preview) setPreviews(prev => ({ ...prev, [img.id]: preview }))
                }
            }
        }
        load()
    }, [archivedImages])

    const handleToggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const handleUnarchive = useCallback(() => {
        setArchivedIds(prev => {
            const next = new Set(prev)
            selectedIds.forEach(id => next.delete(id))
            return next
        })
        setSelectedIds(new Set())
    }, [selectedIds])

    const breakpointColumns = { default: 6, 1536: 5, 1280: 4, 1024: 3, 768: 2 }

    return (
        <div className={`h-full flex flex-col ${PAGE_BG} text-white overflow-hidden`}>
            {/* Header */}
            <header className="h-14 flex items-center justify-between px-6 border-b border-[#1a1a1a] shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/20 rounded-lg">
                        <Archive size={18} className="text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold">Archive</h1>
                        <p className="text-xs text-zinc-500">{archivedImages.length} hidden photos</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Search */}
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search archived..."
                            className="w-48 h-9 pl-9 pr-3 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/20"
                        />
                    </div>

                    {/* View Toggle */}
                    <div className="flex bg-white/5 rounded-lg p-0.5">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-zinc-400'}`}
                        >
                            <Grid3X3 size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('masonry')}
                            className={`p-2 rounded-md ${viewMode === 'masonry' ? 'bg-white/10 text-white' : 'text-zinc-400'}`}
                        >
                            <LayoutGrid size={16} />
                        </button>
                    </div>

                    {/* Back */}
                    <button
                        onClick={() => setCurrentScreen('home')}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm flex items-center gap-2"
                    >
                        Back <ChevronRight size={14} />
                    </button>
                </div>
            </header>

            {/* Selection Actions */}
            <AnimatePresence>
                {selectedIds.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="px-6 py-3 border-b border-[#1a1a1a] bg-blue-500/10 flex items-center justify-between"
                    >
                        <p className="text-sm text-blue-400">{selectedIds.size} selected</p>
                        <div className="flex gap-2">
                            <button
                                onClick={handleUnarchive}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm flex items-center gap-2"
                            >
                                <RefreshCw size={14} /> Unarchive
                            </button>
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm flex items-center gap-2"
                            >
                                <X size={14} /> Cancel
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {archivedImages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                        <div className="w-24 h-24 mb-6 bg-amber-500/10 rounded-full flex items-center justify-center">
                            <Archive size={40} className="text-amber-400" />
                        </div>
                        <h2 className="text-xl font-bold mb-2">No Archived Photos</h2>
                        <p className="text-zinc-500 text-sm max-w-xs">
                            Photos you archive will appear here. Archive photos from the home page context menu.
                        </p>
                    </div>
                ) : viewMode === 'masonry' ? (
                    <Masonry
                        breakpointCols={breakpointColumns}
                        className="flex gap-3 -ml-3"
                        columnClassName="pl-3 bg-clip-padding space-y-3"
                    >
                        {archivedImages.map(img => (
                            <ArchiveCard
                                key={img.id}
                                image={img}
                                preview={previews[img.id] || ''}
                                isSelected={selectedIds.has(img.id)}
                                onClick={() => setSelectedImage(img)}
                                onToggleSelect={() => handleToggleSelect(img.id)}
                            />
                        ))}
                    </Masonry>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {archivedImages.map(img => (
                            <ArchiveCard
                                key={img.id}
                                image={img}
                                preview={previews[img.id] || ''}
                                isSelected={selectedIds.has(img.id)}
                                onClick={() => setSelectedImage(img)}
                                onToggleSelect={() => handleToggleSelect(img.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Photo Viewer */}
            {selectedImage && (
                <PhotoViewer
                    image={selectedImage}
                    onClose={() => setSelectedImage(null)}
                    onNext={() => {
                        const idx = archivedImages.findIndex(i => i.id === selectedImage.id)
                        if (idx < archivedImages.length - 1) setSelectedImage(archivedImages[idx + 1])
                    }}
                    onPrev={() => {
                        const idx = archivedImages.findIndex(i => i.id === selectedImage.id)
                        if (idx > 0) setSelectedImage(archivedImages[idx - 1])
                    }}
                />
            )}
        </div>
    )
}
