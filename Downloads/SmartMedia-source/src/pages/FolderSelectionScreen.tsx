import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/appStore'
import { 
  FolderOpen, 
  ArrowRight,
  RefreshCw,
  Check,
  HardDrive,
  Home,
  SkipForward
} from 'lucide-react'

// --- Microsoft Store Style Constants ---
const STORE_BG = "bg-[#050505]"
const STORE_CARD = "bg-[#1c1c1c] border border-[#2a2a2a] shadow-2xl"
const STORE_SURFACE = "bg-[#151515] border border-[#2a2a2a]"

export default function FolderSelectionScreen() {
  const [isScanning, setIsScanning] = useState(false)
  const [scanComplete, setScanComplete] = useState(false)
  
  const selectedFolder = useAppStore((state) => state.selectedFolder)
  const setSelectedFolder = useAppStore((state) => state.setSelectedFolder)
  const discoveredImages = useAppStore((state) => state.discoveredImages)
  const setDiscoveredImages = useAppStore((state) => state.setDiscoveredImages)
  const setCurrentScreen = useAppStore((state) => state.setCurrentScreen)
  const setScanProgress = useAppStore((state) => state.setScanProgress)

  const handleSelectFolder = async () => {
    try {
      // @ts-ignore
      const folder = await window.electronAPI?.selectFolder()
      if (folder) {
        setSelectedFolder(folder)
        setScanComplete(false)
        setIsScanning(true)
        
        // Reset scan progress
        setScanProgress({
          total: 0, current: 0, currentImage: '', status: 'idle',
          detectedObjects: [], generatedCaption: '',
        })
        
        // Scan
        // @ts-ignore
        const images = await window.electronAPI?.scanFolder(folder)
        setDiscoveredImages(images || [])
        
        setIsScanning(false)
        setScanComplete(true)
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
      setIsScanning(false)
    }
  }

  const handleContinue = () => {
    setCurrentScreen('scanning')
  }

  const formatPath = (path: string) => {
    // Windows style path formatting
    const parts = path.split(/[/\\]/)
    if (parts.length > 2) {
        return `...\\${parts.slice(-2).join('\\')}`
    }
    return path
  }

  return (
    <div className={`h-full flex flex-col relative overflow-hidden ${STORE_BG} font-['Segoe_UI','Inter','sans-serif']`}>
      
      {/* Header with Home and Skip buttons */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-[#2a2a2a] shrink-0 z-20">
        <button
          onClick={() => setCurrentScreen('home')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#252525] transition-colors text-white/70 hover:text-white"
        >
          <Home size={16} />
          <span className="text-xs font-medium">Home</span>
        </button>
        
        <button
          onClick={() => setCurrentScreen('home')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#252525] transition-colors text-white/70 hover:text-white"
        >
          <span className="text-xs font-medium">Skip</span>
          <SkipForward size={16} />
        </button>
      </header>
      
      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
         <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-900/10 blur-[120px] rounded-full opacity-40" />
      </div>
      
      {/* Main content wrapper */}
      <div className="flex-1 flex items-center justify-center">

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
        className={`relative z-10 w-full max-w-[460px] mx-6 p-8 rounded-xl ${STORE_CARD}`}
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            transition={{ delay: 0.1 }}
            className="w-14 h-14 mx-auto mb-5 rounded-xl bg-[#252525] border border-[#333] flex items-center justify-center shadow-inner"
          >
            {selectedFolder ? (
              <FolderOpen className="text-[#0067c0]" size={28} />
            ) : (
              <HardDrive className="text-white/60" size={28} />
            )}
          </motion.div>
          
          <h1 className="text-xl font-semibold text-white mb-2 tracking-tight">
            {scanComplete ? 'Library Ready' : 'Add to Library'}
          </h1>
          <p className="text-sm text-white/50">
            {scanComplete 
              ? 'Files found and ready for AI analysis.'
              : 'Select a local folder to scan photos, PDFs, Word docs, video, and audio. Your data stays offline.'}
          </p>
        </div>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {!selectedFolder ? (
            // --- STATE: NO FOLDER SELECTED ---
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <button
                onClick={handleSelectFolder}
                className={`w-full h-32 rounded-lg border-2 border-dashed border-[#333] hover:border-[#555] hover:bg-[#252525] ${STORE_SURFACE} transition-all duration-200 flex flex-col items-center justify-center gap-3 group`}
              >
                <div className="p-3 rounded-full bg-[#202020] group-hover:bg-[#303030] transition-colors">
                    <FolderOpen className="text-white/50 group-hover:text-white" size={24} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-white/90">Browse Folder</p>
                  <p className="text-[11px] text-white/40 mt-1">Images, PDFs, Word, video, and audio</p>
                </div>
              </button>
            </motion.div>
          ) : (
            // --- STATE: FOLDER SELECTED / SCANNING ---
            <motion.div
              key="selected"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Selected Folder Chip */}
              <div className={`rounded-lg p-3 flex items-center gap-3 ${STORE_SURFACE}`}>
                 <div className="w-10 h-10 rounded bg-[#202020] flex items-center justify-center shrink-0">
                    <FolderOpen className="text-white/60" size={18} />
                 </div>
                 <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Source</p>
                    <p className="text-xs text-white/90 font-mono truncate" title={selectedFolder}>
                        {formatPath(selectedFolder)}
                    </p>
                 </div>
                 <button 
                    onClick={handleSelectFolder}
                    className="p-2 hover:bg-white/10 rounded-md transition-colors text-white/50 hover:text-white"
                    title="Change Folder"
                 >
                    <RefreshCw size={16} />
                 </button>
              </div>

              {/* Status Box */}
              <div className={`rounded-lg p-6 flex flex-col items-center justify-center min-h-[120px] ${STORE_SURFACE}`}>
                 {isScanning ? (
                    <>
                        <div className="w-6 h-6 border-2 border-t-[#0067c0] border-white/10 rounded-full animate-spin mb-3" />
                        <p className="text-sm text-white/80">Scanning directory...</p>
                    </>
                 ) : scanComplete ? (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center">
                        <div className="flex items-center gap-2 mb-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                            <Check size={12} className="text-green-500" />
                            <span className="text-[11px] text-green-500 font-medium uppercase tracking-wide">Complete</span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-bold text-white">{discoveredImages.length.toLocaleString()}</span>
                            <span className="text-sm text-white/50">images found</span>
                        </div>
                    </motion.div>
                 ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Actions */}
        <div className="mt-8 pt-6 border-t border-[#2a2a2a] flex justify-end">
            <AnimatePresence mode="wait">
                {scanComplete && discoveredImages.length > 0 ? (
                    <motion.button
                        key="start"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={handleContinue}
                        className="px-6 py-2.5 rounded-lg bg-[#0067c0] hover:bg-[#005fb0] active:scale-95 text-white text-sm font-semibold transition-all shadow-lg flex items-center gap-2"
                    >
                        Start Processing
                        <ArrowRight size={16} />
                    </motion.button>
                ) : scanComplete && discoveredImages.length === 0 ? (
                    <motion.p 
                        key="empty" 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        className="w-full text-center text-xs text-orange-400/80"
                    >
                        No images found in this folder.
                    </motion.p>
                ) : (
                    <div className="h-10" /> // Spacer to prevent layout jump
                )}
            </AnimatePresence>
        </div>

      </motion.div>
      </div>
    </div>
  )
}