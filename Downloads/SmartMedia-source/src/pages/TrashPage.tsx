import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/appStore'
import {
  Trash2, RotateCcw, X, AlertTriangle, Clock, Calendar, Search,
  Check, HardDrive, History, FileWarning, ArrowUpDown
} from 'lucide-react'

// --- CONSTANTS ---
const PAGE_BG = "bg-[#050505]"
const BORDER_COLOR = "border-[#1a1a1a]"
const CARD_BG = "bg-[#111]"
const WARNING_COLOR = "text-amber-500"
const DANGER_COLOR = "text-red-500"

export default function TrashPage() {
  const { trashedImages, restoreFromTrash, permanentlyDelete, emptyTrash } = useAppStore()
  
  // State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [imagePreview, setImagePreview] = useState<Record<string, string>>({})
  const [isDeleting, setIsDeleting] = useState(false)

  // --- LOGIC ---

  // Sort: Newest Deleted First (Most relevant for "Undo")
  const sortedTrash = useMemo(() => {
    let result = [...trashedImages].sort((a, b) => 
        new Date(b.deletedAt || 0).getTime() - new Date(a.deletedAt || 0).getTime()
    )
    if (searchQuery) {
        result = result.filter(i => i.filename.toLowerCase().includes(searchQuery.toLowerCase()))
    }
    return result
  }, [trashedImages, searchQuery])

  // Preload Thumbs
  useEffect(() => {
    if (trashedImages.length === 0) return
    let active = true
    const load = async () => {
        // Load first 20 visible
        const targets = sortedTrash.slice(0, 20).filter(i => !imagePreview[i.id])
        for(const img of targets) {
            if(!active) break
            try {
                // @ts-ignore
                const thumb = await window.electronAPI?.getImageThumbnail(img.path)
                if(thumb && active) setImagePreview(p => ({...p, [img.id]: thumb}))
            } catch(e) {}
        }
    }
    load()
    return () => { active = false }
  }, [sortedTrash])

  // Helpers
  const getDaysLeft = (dateStr?: string) => {
      if(!dateStr) return 30
      const deleted = new Date(dateStr).getTime()
      const now = Date.now()
      const diff = now - deleted
      const daysPassed = Math.floor(diff / (1000 * 60 * 60 * 24))
      return Math.max(0, 30 - daysPassed)
  }

  const handleRestore = async () => {
      setIsDeleting(true)
      try {
        // Restore each selected image
        for (const id of Array.from(selectedIds)) {
          await restoreFromTrash(id)
        }
        setSelectedIds(new Set())
      } catch (error) {
        console.error('[TrashPage] Error restoring images:', error)
      } finally {
        setIsDeleting(false)
      }
  }

  const handleDelete = async () => {
      setIsDeleting(true)
      // Actual file deletion logic would go here via Electron API
      // Mocking delays
      await new Promise(r => setTimeout(r, 500))
      
      selectedIds.forEach(id => permanentlyDelete(id))
      setSelectedIds(new Set())
      setIsDeleting(false)
  }

  const handleEmpty = async () => {
      setIsDeleting(true)
      await new Promise(r => setTimeout(r, 800))
      emptyTrash()
      setShowEmptyConfirm(false)
      setIsDeleting(false)
  }

  const toggleSelect = (id: string) => {
      setSelectedIds(prev => {
          const next = new Set(prev)
          next.has(id) ? next.delete(id) : next.add(id)
          return next
      })
  }

  // --- RENDER ---

  return (
    <div className={`h-full flex flex-col ${PAGE_BG} text-white relative overflow-hidden`}>
      
      {/* 1. HEADER */}
      <header className={`h-16 shrink-0 flex items-center justify-between px-6 border-b ${BORDER_COLOR} bg-[#050505]/80 backdrop-blur-md z-20`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-red-900/20 border border-red-900/40 flex items-center justify-center">
            <Trash2 size={16} className="text-red-500" />
          </div>
          <div className="flex flex-col">
             <h1 className="text-sm font-bold leading-tight">Recycle Bin</h1>
             <span className="text-[10px] text-[#666] font-mono">
               ITEMS DELETED &gt; 30 DAYS ARE REMOVED
             </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
           {/* Search */}
           <div className="relative group">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#666] group-focus-within:text-white" size={14} />
              <input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search deleted files..."
                className="h-8 pl-8 pr-3 bg-[#111] border border-[#222] rounded-full text-xs text-white focus:border-[#444] outline-none w-48 transition-all"
              />
           </div>

           <div className="w-[1px] h-4 bg-[#222] mx-2" />

           {trashedImages.length > 0 && (
             <button 
               onClick={() => setShowEmptyConfirm(true)}
               className="flex items-center gap-2 px-3 py-1.5 bg-[#111] hover:bg-red-900/20 border border-[#222] hover:border-red-900/40 rounded-md text-xs text-[#888] hover:text-red-400 transition-all"
             >
               <FileWarning size={14} /> Empty Bin
             </button>
           )}
        </div>
      </header>

      {/* 2. CONTENT */}
      <div className="flex-1 overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:hidden">
         {sortedTrash.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[#333]">
               <Check size={64} className="mb-4 opacity-20 text-emerald-500" />
               <p className="text-[#666] font-medium">No deleted items</p>
               <p className="text-xs text-[#444] mt-1">Your library is clean.</p>
            </div>
         ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
               {sortedTrash.map((img, i) => {
                  const days = getDaysLeft(img.deletedAt)
                  const isSelected = selectedIds.has(img.id)
                  
                  return (
                    <motion.div 
                      key={img.id}
                      layoutId={img.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      onClick={() => toggleSelect(img.id)}
                      className={`
                        group relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-[#111] border 
                        ${isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-[#222] hover:border-[#444]'}
                      `}
                    >
                       {/* Image */}
                       {imagePreview[img.id] ? (
                          <img 
                            src={imagePreview[img.id]} 
                            className={`w-full h-full object-cover transition-all duration-500 ${isSelected ? 'opacity-40 grayscale' : 'opacity-60 group-hover:opacity-100 group-hover:scale-105'}`} 
                          />
                       ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#333]"><HardDrive size={24} /></div>
                       )}

                       {/* Overlays */}
                       <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 opacity-60" />
                       
                       {/* Selection Check */}
                       <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-black/40 border-white/30'}`}>
                          {isSelected && <Check size={12} className="text-white" />}
                       </div>

                       {/* Countdown Badge */}
                       <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide backdrop-blur-md ${days <= 3 ? 'bg-red-500 text-white' : 'bg-black/50 text-[#ccc] border border-white/10'}`}>
                          {days} Days Left
                       </div>

                       {/* Info */}
                       <div className="absolute bottom-2 left-3 right-3">
                          <p className="text-[10px] text-white/90 truncate">{img.filename}</p>
                          <p className="text-[9px] text-[#666]">Deleted {new Date(img.deletedAt||0).toLocaleDateString()}</p>
                       </div>
                    </motion.div>
                  )
               })}
            </div>
         )}
      </div>

      {/* 3. BATCH ACTIONS (Floating) */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#111] border border-[#222] rounded-full px-6 py-2 shadow-2xl flex items-center gap-6 z-40"
          >
             <span className="text-xs font-mono text-[#888]">{selectedIds.size} SELECTED</span>
             
             <div className="flex items-center gap-2">
                <button 
                  onClick={handleRestore}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-bold transition-colors"
                >
                  <RotateCcw size={14} /> Restore
                </button>
                <button 
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="p-2 hover:bg-[#222] rounded-full text-[#888] hover:text-red-400 transition-colors"
                  title="Delete Permanently"
                >
                  {isDeleting ? <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={16} />}
                </button>
             </div>

             <div className="w-[1px] h-4 bg-[#333]" />
             <button onClick={() => setSelectedIds(new Set())} className="text-xs text-[#666] hover:text-white">CANCEL</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. EMPTY CONFIRM MODAL */}
      <AnimatePresence>
        {showEmptyConfirm && (
           <motion.div 
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-8"
             onClick={() => setShowEmptyConfirm(false)}
           >
              <div className="bg-[#111] border border-[#222] rounded-2xl p-8 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
                 <div className="w-16 h-16 rounded-full bg-red-900/20 flex items-center justify-center mx-auto mb-6">
                    <Trash2 size={32} className="text-red-500" />
                 </div>
                 <h2 className="text-xl font-bold text-white mb-2">Empty Recycle Bin?</h2>
                 <p className="text-sm text-[#666] mb-8">
                    This will permanently delete <b>{trashedImages.length} items</b>. This action cannot be undone.
                 </p>
                 
                 <div className="flex gap-3">
                    <button 
                      onClick={() => setShowEmptyConfirm(false)}
                      className="flex-1 py-2.5 rounded-lg bg-[#222] hover:bg-[#333] text-sm font-medium text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleEmpty}
                      disabled={isDeleting}
                      className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-bold text-white transition-colors flex items-center justify-center gap-2"
                    >
                      {isDeleting ? 'Deleting...' : 'Empty Bin'}
                    </button>
                 </div>
              </div>
           </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}