import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/appStore'
import PhotoViewer from '../components/PhotoViewer'
import {
  Users, User, Edit3, Check, Search,
  Merge, Scan, MoreHorizontal, Trash2, Image as ImageIcon,
  ArrowLeft, Plus, RefreshCw, X
} from 'lucide-react'

// --- CONSTANTS ---
const PAGE_BG = "bg-[#000000]" // True Black for Google Photos look
const CARD_BG = "bg-[#202124]" // Google Dark Grey
const ACCENT_BLUE = "bg-[#8ab4f8]" // Google Blue
const TEXT_SECONDARY = "text-[#9aa0a6]"

interface FaceData {
  id: string;
  name: string;
  image_count: number;
  thumbnail: string | null; // This is the cropped face
  images: string[];
  first_seen: string;
  primary_emotion?: string;
}

// --- COMPONENTS ---

const ContextMenu = ({ x, y, onClose, onEdit, onMerge, onDelete }: any) => {
  useEffect(() => {
    const handleClick = () => onClose()
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed z-50 w-48 bg-[#303134] shadow-xl rounded-lg py-2 flex flex-col overflow-hidden text-[#e8eaed]"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
    >
      <button onClick={onEdit} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-[#3c4043] text-left transition-colors"><Edit3 size={16} /> Rename</button>
      <button onClick={onMerge} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-[#3c4043] text-left transition-colors"><Merge size={16} /> Merge...</button>
      <div className="h-[1px] bg-[#3c4043] my-1" />
      <button onClick={onDelete} className="flex items-center gap-3 px-4 py-3 text-sm text-[#f28b82] hover:bg-[#3c4043] text-left transition-colors"><Trash2 size={16} /> Delete</button>
    </motion.div>
  )
}

const FaceCard = ({
  face, onClick, onContextMenu, isSelected, isSelectionMode, fullImageFallback
}: {
  face: FaceData, onClick: () => void, onContextMenu: (e: any) => void, isSelected: boolean, isSelectionMode: boolean, fullImageFallback?: string
}) => {
  
  // FIX: Prioritize the cropped face thumbnail provided by the backend.
  // Only fall back to the full image ('fullImageFallback') if the crop is missing.
  const imageSrc = face.thumbnail || fullImageFallback;

  return (
    <motion.div
      layoutId={face.id}
      className={`group relative overflow-hidden rounded-[24px] cursor-pointer ${CARD_BG} aspect-square transition-transform duration-200 ${isSelected ? 'ring-4 ring-[#8ab4f8] scale-95' : ''} hover:scale-[1.02] hover:shadow-lg`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* Selection Checkmark */}
      <div className={`absolute top-3 left-3 z-20 transition-all duration-200 ${isSelectionMode || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-[#8ab4f8] border-[#8ab4f8]' : 'bg-black/40 border-white/70'}`}>
          {isSelected && <Check size={14} className="text-black font-bold" />}
        </div>
      </div>

      {/* More Options Button */}
      <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={(e) => { e.stopPropagation(); onContextMenu(e) }}
          className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {/* The Image */}
      <img
        src={imageSrc || undefined}
        alt={face.name}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
        onError={(e) => {
          // If thumbnail fails, try to hide or show placeholder
          e.currentTarget.style.opacity = '0.5'; 
        }}
      />
      
      {/* Gradient Overlay & Text */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-4">
        <h3 className="font-medium text-white text-base truncate leading-tight">
          {face.name}
        </h3>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-[#bdc1c6] font-medium">
            {face.image_count} photos
          </p>
          {/* Show confidence score if available */}
          {face.avg_confidence && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              face.avg_confidence >= 80 ? 'bg-green-500/20 text-green-300' :
              face.avg_confidence >= 60 ? 'bg-yellow-500/20 text-yellow-300' :
              'bg-red-500/20 text-red-300'
            }`}>
              {Math.round(face.avg_confidence)}% match
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function FacesPage() {
  const { images, setImages } = useAppStore()
  
  // Data State
  const [faces, setFaces] = useState<FaceData[]>([])
  const [faceImages, setFaceImages] = useState<{ [key: string]: string }>({})
  const [loading, setLoading] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null)
  const [scanningStatus, setScanningStatus] = useState<string>('')
  const [processingStats, setProcessingStats] = useState<any>(null)
  
  // UI State
  const [selectedFace, setSelectedFace] = useState<FaceData | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, face: FaceData } | null>(null)
  
  // Modals
  const [editingFaceId, setEditingFaceId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [viewerImage, setViewerImage] = useState<string | null>(null)

  // --- LOGIC ---

  // Load images
  useEffect(() => {
    const loadImages = async () => {
      try {
        // @ts-ignore
        const response = await window.electronAPI?.getImages()
        if (response?.success && response?.images) {
          setImages(response.images)
        }
      } catch (error) { console.error(error) }
    }
    loadImages()
  }, [setImages])

  // Load Faces with improved state management - OPTIMIZED for instant loading
  useEffect(() => {
    let isActive = true // Prevent race conditions
    let retryTimer: NodeJS.Timeout | null = null
    let progressListener: (() => void) | null = null

    const load = async () => {
      if (!isActive) return
      
      try {
        const result = await loadFaces()
        // If no faces found, retry once after 2 seconds (Python may still be starting)
        if (isActive && (!result || (Array.isArray(result) && result.length === 0))) {
          retryTimer = setTimeout(() => { 
            if (isActive) {
              console.log('[FacesPage] Retrying face load...')
              loadFaces() 
            }
          }, 2000)
        }
      } catch (error) {
        console.error('[FacesPage] Error loading faces:', error)
      }
    }
    
    // Load immediately - faces can come from cache even before Python is ready
    load()
    
    // Setup face scan progress listener with proper cleanup
    // @ts-ignore
    progressListener = window.electronAPI?.onFaceScanProgress?.((progress: { current: number; total: number; status?: string }) => {
      if (!isActive) return
      
      console.log('[FacesPage] Progress update:', progress)
      setScanProgress(progress)
      setScanningStatus(progress.status === 'incremental' 
        ? `Scanning new image ${progress.current} of ${progress.total}...`
        : `Scanning image ${progress.current} of ${progress.total}...`
      )
      
      // Auto cleanup when scanning completes
      if (progress.current >= progress.total) {
        console.log('[FacesPage] Scanning complete, cleaning up...')
        setTimeout(() => {
          if (isActive) {
            setScanProgress(null)
            setScanningStatus('')
            setLoading(false)
            // Reload faces after completion
            loadFaces()
          }
        }, 1000) // Small delay to show completion
      }
    })
    
    return () => {
      isActive = false
      if (retryTimer) clearTimeout(retryTimer)
      if (progressListener) progressListener()
    }
  }, []) // Empty dependency array - only run once on mount

  // Process Faces
  const processedFaces = useMemo(() => {
    if (!Array.isArray(faces)) return []
    let result = [...faces].filter(f => f.image_count > 0)
    if (searchInput) result = result.filter(f => f.name.toLowerCase().includes(searchInput.toLowerCase()))
    return result.sort((a, b) => b.image_count - a.image_count)
  }, [faces, searchInput])

  // Preload Thumbnails (Only needed for Full Photos in detail view now, or fallbacks)
  useEffect(() => {
    if (!processedFaces || processedFaces.length === 0) return
    let active = true
    const loadThumbs = async () => {
      const targets = new Set<string>()
      // Only load full photo thumbs for selected face detail view
      if (selectedFace?.images) {
          selectedFace.images.forEach(i => targets.add(i))
      }
      for (const path of targets) {
        if (!active) break
        if (!faceImages[path]) {
          try {
             // @ts-ignore
             const thumb = await window.electronAPI?.getImageThumbnail(path)
             if (thumb && active) setFaceImages(prev => ({ ...prev, [path]: thumb }))
          } catch (e) {}
        }
      }
    }
    loadThumbs()
    return () => { active = false }
  }, [processedFaces, selectedFace])

  // Load faces on mount and when needed
  const loadFaces = async () => {
    try {
      console.log('[FacesPage] Loading faces...')
      // @ts-ignore
      const res = await window.electronAPI?.getFaces?.()
      
      if (res?.success && Array.isArray(res.faces)) {
        console.log(`[FacesPage] Loaded ${res.faces.length} faces`)
        setFaces(res.faces)
        await loadProcessingStats() // Also load stats when faces are loaded
        return res.faces
      } else {
        console.warn('[FacesPage] Failed to load faces:', res)
        return []
      }
    } catch (e) { 
      console.error('[FacesPage] Error loading faces:', e)
      return null 
    }
  }

  const handleFaceClick = (face: FaceData) => {
    if (isSelectionMode) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.has(face.id) ? next.delete(face.id) : next.add(face.id)
        return next
      })
    } else {
      setSelectedFace(face)
    }
  }

  // Load face processing statistics
  const loadProcessingStats = async () => {
    try {
      // @ts-ignore
      const stats = await window.electronAPI?.getFaceProcessingStats?.()
      if (stats?.success !== false) {
        setProcessingStats(stats)
      }
    } catch (error) {
      console.error('Error loading processing stats:', error)
    }
  }

  // Incremental face scanning - only new images
  const handleIncrementalScan = async () => {
    // Prevent concurrent scanning operations
    if (loading || scanProgress) {
      console.log('[FacesPage] Scan already in progress, ignoring request')
      return
    }
    
    console.log('[FacesPage] Starting incremental face scan...')
    setLoading(true)
    setScanProgress(null)
    setScanningStatus('Initializing face scanning...')
    
    try {
      // @ts-ignore
      const result = await window.electronAPI?.scanFacesIncremental?.()
      
      console.log('[FacesPage] Scan result:', result)
      
      if (result?.success) {
        // Clear progress immediately on success
        setScanProgress(null)
        setScanningStatus('')
        
        // Reload data
        await loadFaces()
        await loadProcessingStats()
        
        const message = result.processed === 0 
          ? "✅ All images are up-to-date! No new faces to process.\n\nUsing enhanced Google Photos-style face matching with multi-threshold confidence scoring." 
          : `🎉 Enhanced Face Scanning Complete!\n\nProcessed: ${result.processed} new images\nFaces detected: ${result.faces_detected} faces\nNew people: ${result.new_faces} unique individuals\n\nNow using advanced DBSCAN clustering algorithm with:\n• Multi-level confidence scoring (35%-60% thresholds)\n• Duplicate person detection and merging\n• Google Photos-style face matching accuracy`
        
        alert(message)
      } else {
        console.error('[FacesPage] Scan failed:', result?.error)
        alert("Incremental scan failed: " + (result?.error || 'Unknown error'))
      }
    } catch (error) { 
      console.error('[FacesPage] Scan error:', error)
      alert("Error connecting to face detection engine.") 
    } 
    finally { 
      // Always clear states on completion
      console.log('[FacesPage] Cleaning up scan states...')
      setLoading(false)
      setScanProgress(null)
      setScanningStatus('')
    }
  }

  const handleScan = async () => {
    // Prevent concurrent operations
    if (loading || scanProgress) {
      console.log('[FacesPage] Scan already in progress, ignoring basic scan request')
      return
    }
    
    console.log('[FacesPage] Starting basic face scan...')
    setLoading(true)
    try {
      // @ts-ignore
      await window.electronAPI?.scanForFaces?.()
    } catch (error) {
      console.error('[FacesPage] Basic scan error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleClusterFaces = async (forceFullRescan = false) => {
    // Prevent concurrent operations
    if (loading || scanProgress) {
      console.log('[FacesPage] Operation already in progress, ignoring cluster request')
      return
    }
    
    console.log('[FacesPage] Starting face clustering...', { forceFullRescan })
    setLoading(true)
    setScanProgress(null)
    setScanningStatus(forceFullRescan ? 'Full face clustering...' : 'Incremental face clustering...')
    
    try {
      // @ts-ignore
      const result = await window.electronAPI?.clusterFaces?.(undefined, forceFullRescan)
      console.log('[FacesPage] Cluster result:', result)
      
      if (result?.success) {
        // Clear progress states
        setScanProgress(null)
        setScanningStatus('')
        
        // Reload data
        await loadFaces()
        await loadProcessingStats()
        
        const scanType = forceFullRescan ? 'Full scan' : 'Incremental scan'
        const message = result.processed_images === 0 
          ? `${scanType} complete! All images are already processed.\\nFound ${result.unique_people} people total.`
          : `${scanType} complete!\\nProcessed ${result.processed_images} images and found ${result.unique_people} people total.\\n${result.new_faces} new people discovered.`
        
        alert(message)
      } else {
        console.error('[FacesPage] Clustering failed:', result?.error)
        alert("Face clustering failed: " + (result?.error || 'Unknown error'))
      }
    } catch (error) { 
      console.error('[FacesPage] Clustering error:', error)
      alert("Error connecting to face detection engine.") 
    } 
    finally { 
      // Always clean up states
      console.log('[FacesPage] Cleaning up clustering states...')
      setLoading(false)
      setScanProgress(null)
      setScanningStatus('')
    }
  }

  const handleResetFaces = async () => {
    // Prevent concurrent operations
    if (loading || scanProgress) {
      console.log('[FacesPage] Operation in progress, ignoring reset request')
      return
    }
    
    console.log('[FacesPage] Starting face reset...')
    setLoading(true)
    setScanProgress(null)
    setScanningStatus('')
    
    try {
      // @ts-ignore
      const res = await window.electronAPI?.resetFaces?.()
      console.log('[FacesPage] Reset result:', res)
      
      if (res?.success) {
        await loadFaces()
        setSelectedFace(null)
        setSelectedIds(new Set())
        alert("Faces reset. Re-run Update Faces to rebuild clusters.")
      } else {
        console.error('[FacesPage] Reset failed:', res)
        alert("Reset failed: " + (res?.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('[FacesPage] Reset error:', error)
      alert("Error connecting to face engine.")
    } finally {
      console.log('[FacesPage] Cleaning up reset states...')
      setLoading(false)
      setScanProgress(null)
      setScanningStatus('')
    }
  }

  const handleRename = async () => {
     if (editingFaceId && editName) {
         // @ts-ignore
         await window.electronAPI?.setFaceName(editingFaceId, editName)
         setFaces(prev => prev.map(f => f.id === editingFaceId ? { ...f, name: editName } : f))
         if (selectedFace?.id === editingFaceId) setSelectedFace(prev => prev ? { ...prev, name: editName } : null)
         setEditingFaceId(null)
     }
  }

  const handleDelete = async (faceId: string) => {
    // Prevent operation during scanning
    if (loading || scanProgress) {
      console.log('[FacesPage] Cannot delete - operation in progress')
      return
    }
    
    try {
      // @ts-ignore
      const result = await window.electronAPI?.deleteFace(faceId)
      if (result?.success) {
        setFaces(prev => prev.filter(f => f.id !== faceId))
        if (selectedFace?.id === faceId) setSelectedFace(null)
      }
    } catch (error) {
      console.error('[FacesPage] Delete error:', error)
    }
  }

  const handleBatchDelete = async () => {
    // Prevent operation during scanning
    if (loading || scanProgress || selectedIds.size === 0) {
      console.log('[FacesPage] Cannot batch delete - operation in progress or no selection')
      return
    }
    
    try {
      const idsArray = Array.from(selectedIds)
      // @ts-ignore
      const result = await window.electronAPI?.deleteFaces(idsArray)
      if (result?.success) {
        setFaces(prev => prev.filter(f => !selectedIds.has(f.id)))
        setIsSelectionMode(false)
        setSelectedIds(new Set())
      }
    } catch (error) {
      console.error('[FacesPage] Batch delete error:', error)
    }
  }

  // --- RENDER ---
  return (
    <div className={`h-full flex flex-col ${PAGE_BG} text-[#e8eaed] relative overflow-hidden font-sans`}>
      
      {/* 1. HEADER */}
      <header className={`h-16 shrink-0 flex items-center justify-between px-6 z-20 sticky top-0 bg-[#000000]/90 backdrop-blur-md`}>
        <div className="flex items-center gap-4">
          {selectedFace ? (
             <button onClick={() => setSelectedFace(null)} className="p-2 -ml-2 hover:bg-[#303134] rounded-full text-[#e8eaed] transition-colors">
               <ArrowLeft size={20} />
             </button>
          ) : (
             <div className="flex flex-col">
               <h1 className="text-xl font-normal text-[#e8eaed]">People & Pets</h1>
             </div>
          )}
          
          {selectedFace && (
             <div className="flex flex-col">
               <h1 className="text-lg font-normal">{selectedFace.name}</h1>
               <span className="text-xs text-[#9aa0a6]">{selectedFace.image_count} photos</span>
             </div>
          )}
        </div>

        {!selectedFace && (
          <div className="flex items-center gap-3">
            <div className="relative group hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa0a6]" size={16} />
              <input 
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search..."
                className="h-10 pl-10 pr-4 bg-[#303134] rounded-lg text-sm text-[#e8eaed] focus:bg-white focus:text-black outline-none w-64 transition-all"
              />
            </div>
            
            <button 
               onClick={() => handleClusterFaces(false)}
               disabled={loading}
               className="flex items-center gap-2 px-4 py-2 bg-[#8ab4f8] hover:bg-[#aecbfa] disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-sm font-medium text-[#202124] transition-colors"
            >
              <Users size={16} /> <span>{loading ? 'Processing...' : 'Update Faces'}</span>
            </button>
            
            <button 
               onClick={handleIncrementalScan}
               disabled={loading}
               className="flex items-center gap-2 px-3 py-2 border border-[#8ab4f8] text-[#8ab4f8] hover:bg-[#8ab4f8] hover:text-[#202124] disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-sm transition-colors"
            >
              <Plus size={16} /> <span>Scan New</span>
            </button>
            
            <button 
               onClick={() => handleClusterFaces(true)}
               disabled={loading}
               className="flex items-center gap-2 px-3 py-2 border border-[#5f6368] text-sm rounded-full text-[#e8eaed] hover:bg-[#303134] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={16} /> <span>Full Rescan</span>
            </button>
            <button 
              onClick={handleResetFaces}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 border border-[#5f6368] text-sm rounded-full text-[#e8eaed] hover:bg-[#303134] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={16} /> <span>Reset Faces</span>
            </button>
            <button 
               onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedIds(new Set()) }}
               className={`p-2 rounded-full transition-colors ${isSelectionMode ? 'bg-[#8ab4f8] text-[#202124]' : 'hover:bg-[#303134] text-[#e8eaed]'}`}
            >
               <Check size={20} />
            </button>
          </div>
        )}
      </header>

      {/* PROCESSING STATS */}
      {processingStats && !scanProgress && (
        <div className="px-6 py-3 bg-[#1a1a1a] border-b border-[#5f6368]">
          <div className="flex items-center justify-between max-w-7xl mx-auto text-xs text-[#9aa0a6]">
            <div className="flex items-center gap-6">
              <span>📊 Images: {processingStats.processed_images}/{processingStats.total_images}</span>
              {processingStats.unprocessed_images > 0 && (
                <span className="text-[#f9ab00]">⚠️ {processingStats.unprocessed_images} new images to process</span>
              )}
              <span>👥 People: {processingStats.total_people}</span>
              <span>😊 Faces: {processingStats.total_faces_detected}</span>
            </div>
            {processingStats.processing_complete && (
              <span className="text-[#34a853]">✅ All up-to-date</span>
            )}
          </div>
        </div>
      )}

      {/* 2. MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto px-6 pb-20 custom-scrollbar">
        <AnimatePresence mode="wait">
           {selectedFace ? (
             /* DETAIL VIEW */
             <motion.div 
               initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
               className="space-y-8 max-w-7xl mx-auto pt-4"
             >
                <div className="flex items-center gap-8">
                   <div className="w-36 h-36 rounded-full overflow-hidden shadow-2xl border-4 border-[#202124]">
                      <img src={selectedFace.thumbnail || ''} className="w-full h-full object-cover" />
                   </div>
                   <div className="flex-1">
                      {editingFaceId === selectedFace.id ? (
                        <input 
                          autoFocus
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onBlur={handleRename}
                          onKeyDown={e => e.key === 'Enter' && handleRename()}
                          className="text-4xl bg-transparent border-b-2 border-[#8ab4f8] outline-none w-full text-[#e8eaed] pb-2"
                        />
                      ) : (
                        <div className="flex items-center gap-4 group">
                           <h2 className="text-4xl font-normal text-[#e8eaed]">{selectedFace.name}</h2>
                           <button onClick={() => { setEditingFaceId(selectedFace.id); setEditName(selectedFace.name) }} className="opacity-0 group-hover:opacity-100 p-2 hover:bg-[#303134] rounded-full text-[#9aa0a6]">
                             <Edit3 size={20} />
                           </button>
                        </div>
                      )}
                      <p className="text-[#9aa0a6] mt-2">Identified in {selectedFace.image_count} photos</p>
                   </div>
                </div>

                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
                   {selectedFace.images && selectedFace.images.length > 0 ? selectedFace.images.map(path => (
                     <div key={path} className="aspect-square bg-[#202124] cursor-pointer overflow-hidden relative group" onClick={() => setViewerImage(path)}>
                        {faceImages[path] ? (
                           <img src={faceImages[path]} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                        ) : (
                           <div className="w-full h-full animate-pulse bg-[#303134]" />
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                     </div>
                   )) : (
                     <div className="col-span-full text-center text-gray-400 py-8">
                       <ImageIcon size={48} className="mx-auto mb-2 opacity-50" />
                       <p>No images found for this person</p>
                     </div>
                   )}
                </div>
             </motion.div>
           ) : (
             /* GRID VIEW - GOOGLE PHOTOS STYLE */
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {processedFaces.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[50vh] text-[#9aa0a6]">
                     <User size={64} className="mb-4 opacity-20" />
                     <p>No faces grouped yet.</p>
                     <button onClick={handleClusterFaces} className="mt-4 text-[#8ab4f8] hover:underline">Start grouping</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                     {processedFaces.map(face => (
                        <FaceCard 
                           key={face.id} 
                           face={face}
                           onClick={() => handleFaceClick(face)}
                           onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, face }) }}
                           isSelected={selectedIds.has(face.id)} 
                           isSelectionMode={isSelectionMode}
                           // Fallback to first image full thumb if face crop is totally missing (rare)
                           fullImageFallback={face.images && face.images.length > 0 ? faceImages[face.images[0]] : undefined}
                        />
                     ))}
                  </div>
                )}
             </motion.div>
           )}
        </AnimatePresence>
      </div>

      {/* 3. FLOATING BATCH ACTIONS */}
      <AnimatePresence>
        {isSelectionMode && selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#303134] rounded-full px-6 py-3 shadow-2xl flex items-center gap-6 z-40 border border-[#3c4043]"
          >
             <span className="text-sm font-medium text-[#e8eaed]">{selectedIds.size} selected</span>
             <div className="h-4 w-[1px] bg-[#5f6368]" />
             <button onClick={() => setShowMergeModal(true)} className="flex items-center gap-2 text-sm text-[#e8eaed] hover:text-[#8ab4f8]">
               <Merge size={18} /> Merge
             </button>
             <button onClick={handleBatchDelete} className="flex items-center gap-2 text-sm text-[#e8eaed] hover:text-[#f28b82]">
               <Trash2 size={18} /> Hide/Delete
             </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. MODALS/OVERLAYS */}
      <AnimatePresence>
         {contextMenu && (
            <ContextMenu 
              x={contextMenu.x} y={contextMenu.y} 
              onClose={() => setContextMenu(null)}
              onEdit={() => { setEditingFaceId(contextMenu.face.id); setEditName(contextMenu.face.name); if(selectedFace?.id !== contextMenu.face.id) setSelectedFace(contextMenu.face); setContextMenu(null) }}
              onMerge={() => { setSelectedIds(new Set([contextMenu.face.id])); setIsSelectionMode(true); setShowMergeModal(true); setContextMenu(null) }}
              onDelete={() => { handleDelete(contextMenu.face.id); setContextMenu(null) }}
            />
         )}

         {viewerImage && (
            <PhotoViewer 
              image={images.find(i => i.path === viewerImage) || { id: viewerImage, path: viewerImage, filename: 'View', tags: [], caption: '', isFavorite: false, dateScanned: '', dateModified: '', faces: 0, objects: [] }}
              imagePreview={faceImages[viewerImage]}
              onClose={() => setViewerImage(null)}
            />
         )}
      </AnimatePresence>

      {/* 5. FACE SCAN PROGRESS MODAL */}
      <AnimatePresence>
        {(loading && scanProgress) && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#202124] rounded-2xl p-8 w-[480px] shadow-2xl border border-[#3c4043]"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#8ab4f8]/10 flex items-center justify-center">
                    <Users className="text-[#8ab4f8]" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-medium text-[#e8eaed]">Detecting Faces</h3>
                    <p className="text-sm text-[#9aa0a6]">{scanningStatus || 'Processing images...'}</p>
                  </div>
                </div>
                
                {/* Close Button - Only show if scan is complete or there's an error */}
                {scanProgress.current >= scanProgress.total && (
                  <button
                    onClick={() => {
                      setScanProgress(null)
                      setScanningStatus('')
                      setLoading(false)
                    }}
                    className="p-2 hover:bg-[#303134] rounded-lg text-white/60 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm text-[#9aa0a6] mb-2">
                  <span>Progress</span>
                  <span className="font-medium text-[#e8eaed]">
                    {scanProgress.current} / {scanProgress.total}
                  </span>
                </div>
                <div className="h-2 bg-[#303134] rounded-full overflow-hidden">
                  <motion.div 
                    className={`h-full ${scanProgress.current >= scanProgress.total 
                      ? 'bg-gradient-to-r from-green-500 to-green-400' 
                      : 'bg-gradient-to-r from-[#8ab4f8] to-[#aecbfa]'
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((scanProgress.current / scanProgress.total) * 100, 100)}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="mt-2 text-xs text-[#9aa0a6] text-center">
                  {scanProgress.current >= scanProgress.total 
                    ? 'Scan Complete!' 
                    : `${Math.round((scanProgress.current / scanProgress.total) * 100)}% complete`
                  }
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#303134] rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-[#e8eaed]">{scanProgress.current}</div>
                  <div className="text-xs text-[#9aa0a6] mt-1">Scanned</div>
                </div>
                <div className="bg-[#303134] rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-[#e8eaed]">{Math.max(scanProgress.total - scanProgress.current, 0)}</div>
                  <div className="text-xs text-[#9aa0a6] mt-1">Remaining</div>
                </div>
                <div className="bg-[#303134] rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-[#8ab4f8]">{faces.length}</div>
                  <div className="text-xs text-[#9aa0a6] mt-1">People</div>
                </div>
              </div>

              {/* Loading Animation or Complete Status */}
              <div className="flex justify-center mt-6">
                {scanProgress.current >= scanProgress.total ? (
                  <div className="flex items-center gap-2 text-green-500">
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium">Scan Complete</span>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-2 h-2 rounded-full bg-[#8ab4f8]"
                        animate={{ 
                          scale: [1, 1.5, 1],
                          opacity: [0.5, 1, 0.5]
                        }}
                        transition={{ 
                          duration: 1,
                          repeat: Infinity,
                          delay: i * 0.2
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
    </div>
  )
}