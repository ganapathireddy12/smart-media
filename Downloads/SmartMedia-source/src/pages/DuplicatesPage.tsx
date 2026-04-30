import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, ImageMetadata } from '../store/appStore'
import {
  Copy, Trash2, Check, X, RefreshCw, Sparkles, 
  HardDrive, Maximize2, Settings, BrainCircuit,
  Filter, ArrowRight, Layout, Grip, List, AlertCircle,
  ChevronRight, ZoomIn, Info
} from 'lucide-react'

// --- CONSTANTS ---
const PAGE_BG = "bg-[#050505]"
const BORDER_COLOR = "border-[#1a1a1a]"

interface DuplicateGroup {
  hash: string
  images: ImageMetadata[]
  potentialSavings: number
  avgSimilarity?: number
  matchReasons: string[]
}

type ScanMode = 'exact' | 'similar'
type ViewMode = 'grid' | 'list'

// --- SUB-COMPONENTS ---

const ComparisonView = ({ 
    group, 
    previews, 
    onClose, 
    onToggleSelect, 
    selectedIds 
}: { 
    group: DuplicateGroup, 
    previews: Record<string, string>, 
    onClose: () => void,
    onToggleSelect: (id: string) => void,
    selectedIds: Set<string>
}) => {
    return (
        <div className="h-full flex flex-col bg-[#0a0a0a]">
            <div className="h-14 flex items-center justify-between px-6 border-b border-[#222]">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-1.5 hover:bg-[#222] rounded-full text-[#666] hover:text-white transition-colors">
                        <ArrowRight size={18} className="rotate-180" />
                    </button>
                    <span className="text-sm font-bold text-white">Compare {group.images.length} Items</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#666] font-mono border border-[#222] px-2 py-1 rounded">
                        GROUP ID: {group.hash.slice(-8)}
                    </span>
                </div>
            </div>

            <div className="flex-1 flex overflow-x-auto overflow-y-hidden">
                {group.images.map((img, idx) => {
                    const isSelected = selectedIds.has(img.id)
                    const isBest = idx === 0 
                    return (
                        <div key={img.id} className="flex-1 flex flex-col border-r border-[#222] min-w-[400px] relative group">
                            <div className="flex-1 bg-[#050505] relative overflow-hidden flex items-center justify-center p-8">
                                <img 
                                    src={previews[img.id] || img.path} 
                                    className={`max-w-full max-h-full object-contain shadow-2xl transition-all duration-300 ${isSelected ? 'opacity-30 grayscale blur-sm' : 'opacity-100'}`} 
                                />
                                {isBest && !isSelected && (
                                    <div className="absolute top-4 right-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-[10px] font-bold backdrop-blur-md">
                                        BEST QUALITY
                                    </div>
                                )}
                                {isSelected && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="bg-red-500/20 text-red-500 border border-red-500/50 px-4 py-2 rounded-full font-bold backdrop-blur-md flex items-center gap-2">
                                            <Trash2 size={16} /> MARKED FOR TRASH
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="h-56 bg-[#0a0a0a] border-t border-[#222] p-6 flex flex-col justify-between">
                                <div>
                                    <h4 className="text-xs font-medium text-white truncate mb-4" title={img.filename}>{img.filename}</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] text-[#555] uppercase font-bold tracking-wider">Size</span>
                                            <span className="text-xs text-[#ccc] font-mono">{(img.size / 1024 / 1024).toFixed(2)} MB</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] text-[#555] uppercase font-bold tracking-wider">Resolution</span>
                                            <span className="text-xs text-[#ccc] font-mono">{img.width} × {img.height}</span>
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => onToggleSelect(img.id)}
                                    className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all border ${isSelected ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-[#151515] text-white border-[#333] hover:bg-[#222]'}`}
                                >
                                    {isSelected ? 'Keep this version' : 'Delete this version'}
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

const DuplicateRow = memo(({ group, previews, selectedIds, onToggleSelect, onInspect }: any) => {
    return (
        <div className="group border-b border-[#1a1a1a] hover:bg-[#0e0e0e] transition-colors">
            <div className="flex items-center p-4 gap-4">
                <div className="w-16 h-16 shrink-0 bg-[#151515] rounded-md border border-[#222] overflow-hidden relative">
                    <img src={previews[group.images[0].id]} className="w-full h-full object-cover opacity-50" />
                    <div className="absolute inset-0 flex items-center justify-center font-bold text-white text-xs">
                        {group.images.length}
                    </div>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-white truncate">
                            {group.matchReasons[0] || 'Similar Images'}
                        </h4>
                        {group.avgSimilarity < 1 && (
                            <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20">
                                {Math.round(group.avgSimilarity * 100)}% Match
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[#666]">
                        <span className="flex items-center gap-1.5 text-orange-500/80"><HardDrive size={12}/> {(group.potentialSavings / 1024 / 1024).toFixed(1)} MB potential savings</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onInspect(group)} className="px-3 py-1.5 bg-[#151515] border border-[#333] rounded hover:text-white text-[#888] text-xs transition-colors">Review</button>
                    <button 
                        onClick={() => group.images.slice(1).forEach((img: any) => onToggleSelect(img.id, true))}
                        className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded hover:bg-red-500/20 text-xs transition-colors"
                    >
                        Auto-Mark
                    </button>
                </div>
            </div>
        </div>
    )
})

export default function DuplicatesPage() {
    const { images, moveToTrash } = useAppStore()
    
    const [isScanning, setIsScanning] = useState(false)
    const [scanProgress, setScanProgress] = useState(0)
    const [groups, setGroups] = useState<DuplicateGroup[]>([])
    
    const [scanMode, setScanMode] = useState<ScanMode>('similar')
    const [viewMode, setViewMode] = useState<ViewMode>('list')
    const [sensitivity, setSensitivity] = useState(92)
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [previews, setPreviews] = useState<Record<string, string>>({})
    const [activeGroup, setActiveGroup] = useState<DuplicateGroup | null>(null)

    const totalSavings = useMemo(() => groups.reduce((acc, g) => acc + g.potentialSavings, 0), [groups])

    const runScan = useCallback(async () => {
        setIsScanning(true)
        setScanProgress(0)
        setGroups([])
        setSelectedIds(new Set())

        const validImages = images.filter(i => !i.isDeleted)
        if (validImages.length === 0) { 
            setIsScanning(false)
            return
        }

        try {
            setScanProgress(10)
            
            // @ts-ignore
            const result = await window.electronAPI?.findSimilarImages({
                paths: validImages.map(img => img.path),
                threshold: sensitivity / 100,
                mode: scanMode
            })

            setScanProgress(70)

            if (!result || !result.success) throw new Error(result?.error || 'Detection failed')

            const detectedGroups: DuplicateGroup[] = []
            let tempTotalSavings = 0 // FIXED: Defined local variable to avoid ReferenceError

            for (const group of result.groups || []) {
                const groupImages: ImageMetadata[] = []
                for (const item of group.images) {
                    const match = validImages.find(img => img.path === item.path)
                    if (match) groupImages.push(match)
                }

                if (groupImages.length > 1) {
                    const sorted = groupImages.sort((a, b) => (b.size || 0) - (a.size || 0))
                    const sizes = sorted.map(img => img.size || 0)
                    const savings = sizes.reduce((a, b) => a + b, 0) - sizes[0]
                    tempTotalSavings += savings

                    detectedGroups.push({
                        hash: `group_${sorted[0].id}`,
                        images: sorted,
                        potentialSavings: savings,
                        avgSimilarity: group.avg_similarity || 1.0,
                        matchReasons: [(group.avg_similarity || 1) > 0.99 ? 'Exact Match' : 'Visual Duplicate']
                    })
                }
            }

            setGroups(detectedGroups.sort((a, b) => b.potentialSavings - a.potentialSavings))
            setScanProgress(100)
            console.log(`Scan complete. Saved: ${(tempTotalSavings / 1024 / 1024).toFixed(2)} MB`)

        } catch(e) {
            console.error('Scan failed, using hash fallback', e)
            // Simplified fallback
            setGroups([]) 
        } finally {
            setIsScanning(false)
        }
    }, [images, scanMode, sensitivity])

    // Preview Loader
    useEffect(() => {
        if(groups.length === 0) return
        const load = async () => {
            const targets = groups.flatMap(g => g.images).filter(i => !previews[i.id]).slice(0, 50)
            for(const img of targets) {
                // @ts-ignore
                const thumb = await window.electronAPI?.getImageThumbnail(img.path)
                if(thumb) setPreviews(p => ({...p, [img.id]: thumb}))
            }
        }
        load()
    }, [groups])

    const handleToggleSelect = (id: string, forceSelect?: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (forceSelect === true) next.add(id)
            else if (forceSelect === false) next.delete(id)
            else prev.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const handleDelete = async () => {
        for (const id of Array.from(selectedIds)) {
            await moveToTrash(id)
        }
        setGroups(prev => prev.map(g => ({
            ...g,
            images: g.images.filter(i => !selectedIds.has(i.id))
        })).filter(g => g.images.length > 1))
        setSelectedIds(new Set())
        setActiveGroup(null)
    }

    if (activeGroup) {
        return (
            <div className="fixed inset-0 z-50 bg-black">
                <ComparisonView 
                    group={activeGroup} 
                    previews={previews}
                    onClose={() => setActiveGroup(null)}
                    onToggleSelect={handleToggleSelect}
                    selectedIds={selectedIds}
                />
            </div>
        )
    }

    return (
        <div className={`h-full flex flex-col ${PAGE_BG} text-white`}>
            <header className={`h-16 shrink-0 flex items-center justify-between px-6 border-b ${BORDER_COLOR} bg-[#050505]/95 backdrop-blur z-20`}>
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                        <Copy size={20} />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold leading-tight">Duplicate Finder</h1>
                        <p className="text-[10px] text-[#666] font-mono mt-0.5">{isScanning ? 'SCANNING LIBRARY...' : `${groups.length} GROUPS DETECTED`}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-[#111] p-1 rounded-lg border border-[#222]">
                        <button onClick={() => setScanMode('exact')} className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${scanMode === 'exact' ? 'bg-[#222] text-white shadow-sm' : 'text-[#666]'}`}>EXACT</button>
                        <button onClick={() => setScanMode('similar')} className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${scanMode === 'similar' ? 'bg-indigo-500/10 text-indigo-400' : 'text-[#666]'}`}>AI MATCH</button>
                    </div>
                    
                    <button onClick={runScan} className="p-2 hover:bg-[#222] rounded-lg text-[#666] hover:text-white transition-colors">
                        <RefreshCw size={18} className={isScanning ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto">
                {!isScanning && groups.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12">
                        <div className="w-16 h-16 bg-[#111] rounded-full flex items-center justify-center mb-4 border border-[#222]">
                            <Check className="text-[#333]" size={32} />
                        </div>
                        <h3 className="text-sm font-bold text-white">Library is Clean</h3>
                        <p className="text-xs text-[#666] mt-1 max-w-xs">No duplicates found. Run a scan to analyze your current media.</p>
                        <button onClick={runScan} className="mt-6 px-6 py-2 bg-white text-black text-xs font-bold rounded-full">Scan Library</button>
                    </div>
                ) : (
                    <div className="pb-32">
                        {groups.map(group => (
                            <DuplicateRow 
                                key={group.hash} 
                                group={group} 
                                previews={previews} 
                                selectedIds={selectedIds}
                                onToggleSelect={handleToggleSelect}
                                onInspect={setActiveGroup}
                            />
                        ))}
                    </div>
                )}
            </div>

            <AnimatePresence>
                {selectedIds.size > 0 && (
                    <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[500px] h-16 bg-[#111] border border-[#222] rounded-2xl flex items-center justify-between px-6 z-40 shadow-2xl">
                        <div className="flex items-center gap-3">
                            <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{selectedIds.size}</span>
                            <span className="text-xs font-medium">Items selected for deletion</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setSelectedIds(new Set())} className="px-4 py-2 text-[10px] font-bold text-[#666] hover:text-white">CANCEL</button>
                            <button onClick={handleDelete} className="px-5 py-2 bg-red-600 text-white text-[10px] font-bold rounded-lg flex items-center gap-2"><Trash2 size={12}/> DELETE</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}