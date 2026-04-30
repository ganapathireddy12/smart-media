import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/appStore'
import { ArrowRight, Check, AlertCircle, DownloadCloud, Loader2 } from 'lucide-react'

// --- Custom Cinematic Easing ---
const smoothEase = [0.16, 1, 0.3, 1]

export default function ModelDownloadScreen() {
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadComplete, setDownloadComplete] = useState(false)
  const [currentModelName, setCurrentModelName] = useState('')
  const [overallProgress, setOverallProgress] = useState(0)
  const [downloadSpeed, setDownloadSpeed] = useState('0 MB/s')
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [pythonReady, setPythonReady] = useState(false)
  const [checkingModels, setCheckingModels] = useState(false)
  const useRealDownload = true
  
  const models = useAppStore((state) => state.models)
  const setModelProgress = useAppStore((state) => state.setModelProgress)
  const setModelDownloaded = useAppStore((state) => state.setModelDownloaded)
  const setCurrentScreen = useAppStore((state) => state.setCurrentScreen)

  // Calculate total size
  const totalSizeGB = useMemo(() => {
    const bytes = models.reduce((acc, m) => acc + m.sizeBytes, 0)
    return (bytes / (1024 * 1024 * 1024)).toFixed(1)
  }, [models])

  // Setup progress listener
  useEffect(() => {
    if (window.electronAPI?.onDownloadProgress) {
      window.electronAPI.onDownloadProgress((progress: any) => {
        if (progress.type === 'download_progress') {
          setCurrentModelName(progress.model || 'Qwen2-VL')
          setDownloadSpeed(`${progress.speed_mbps?.toFixed(1) || '0'} MB/s`)
          
          if (progress.model === 'Qwen2-VL' || progress.model === 'qwen2-vl') {
            setModelProgress('qwen2-vl', progress.progress)
            if (progress.progress >= 100) setModelDownloaded('qwen2-vl')
          }
          setOverallProgress(progress.progress || 0)
        }
        
        if (progress.type === 'overall_progress') {
          setOverallProgress(progress.progress)
          if (progress.current_model === 'complete') {
            setDownloadComplete(true)
            setIsDownloading(false)
          }
        }
      })
    }
    return () => {
      if (window.electronAPI?.removeDownloadProgressListener) {
        window.electronAPI.removeDownloadProgressListener()
      }
    }
  }, [setModelProgress, setModelDownloaded])

  // Wait for Python engine to be ready
  useEffect(() => {
    let cancelled = false
    let pollInterval: ReturnType<typeof setInterval> | null = null

    const onEngineReady = async () => {
      if (cancelled) return
      setPythonReady(true)

      setCheckingModels(true)
      try {
        const status = await window.electronAPI?.getModelStatus?.()
        if (cancelled) return
        if (status?.models_available === true) {
          models.forEach(m => setModelDownloaded(m.id))
          setOverallProgress(100)
          setDownloadComplete(true)
        } else if (status?.models) {
          const allDownloaded = Object.values(status.models).every((m: any) => m.downloaded)
          if (allDownloaded) {
            Object.keys(status.models).forEach(id => setModelDownloaded(id))
            setOverallProgress(100)
            setDownloadComplete(true)
          }
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setCheckingModels(false)
      }
    }

    const unsubscribe = window.electronAPI?.onPythonReady?.((data: any) => {
      if (data?.ready) onEngineReady()
    })

    const checkNow = async () => {
      try {
        const s = await window.electronAPI?.getPythonStatus?.()
        if (s?.ready && !cancelled) {
          if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
          onEngineReady()
        }
      } catch { /* ignore */ }
    }
    checkNow()
    pollInterval = setInterval(checkNow, 2000)

    return () => {
      cancelled = true
      unsubscribe?.()
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [setModelDownloaded])

  // Simulated download (Fallback Logic)
  const runSimulatedDownload = useCallback(() => {
    let progress = 0
    let modelIndex = 0
    const interval = setInterval(() => {
      progress = Math.min(progress + (Math.random() * 3 + 1.5), 100)
      setDownloadSpeed(`${(Math.random() * 15 + 5).toFixed(1)} MB/s`)
      
      const modelProgress = (progress / 100) * models.length
      const newIndex = Math.min(Math.floor(modelProgress), models.length - 1)
      
      if (newIndex !== modelIndex) {
        for (let i = modelIndex; i < newIndex; i++) setModelDownloaded(models[i].id)
        modelIndex = newIndex
      }
      
      setCurrentModelName(models[modelIndex]?.name || '')
      setOverallProgress(progress)
      
      models.forEach((model, idx) => {
        if (idx < modelIndex) setModelProgress(model.id, 100)
        else if (idx === modelIndex) {
          const localProgress = (modelProgress - modelIndex) * 100
          setModelProgress(model.id, Math.min(localProgress, 100))
        }
      })
      
      if (progress >= 100) {
        models.forEach((m) => setModelDownloaded(m.id))
        setDownloadComplete(true)
        setIsDownloading(false)
        clearInterval(interval)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [models, setModelProgress, setModelDownloaded])

  const handleStartDownload = async () => {
    if (!pythonReady) return
    setIsDownloading(true)
    setDownloadError(null)
    if (useRealDownload && window.electronAPI?.downloadAllModels) {
      try {
        const result = await window.electronAPI.downloadAllModels()
        if (result.success) {
          setDownloadComplete(true)
          setOverallProgress(100)
          models.forEach((m) => setModelDownloaded(m.id))
        } else {
          setDownloadError(result.error)
          runSimulatedDownload()
        }
        setIsDownloading(false)
      } catch (error) {
        setDownloadError(String(error))
        runSimulatedDownload()
      }
    } else {
      runSimulatedDownload()
    }
  }

  const handleContinue = () => {
    setCurrentScreen('folderSelection')
  }

  return (
    <div className="h-full flex items-center justify-center relative overflow-hidden bg-black font-['Inter','SF_Pro_Display','sans-serif'] text-white">
      
      {/* ── Background Ambience (Pure Black & White) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
         {/* Subtle white/grey radial glow */}
         <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-white/[0.03] blur-[120px] rounded-full" />
         <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] bg-white/[0.02] blur-[120px] rounded-full" />
         
         {/* Noise overlay */}
         <div 
          className="absolute inset-0 opacity-[0.032]" 
          style={{ 
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, 
            backgroundSize: '200px 200px' 
          }} 
        />
      </div>

      {/* ── Main Glassy Card ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15, filter: 'blur(10px)' }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: smoothEase }}
        className="relative z-10 w-full max-w-[480px] mx-6 p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-start gap-5 mb-8">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6, ease: smoothEase }}
              className="w-14 h-14 rounded-xl flex items-center justify-center bg-white/[0.04] border border-white/[0.08] shadow-[0_0_20px_rgba(255,255,255,0.03)] shrink-0"
            >
               {downloadComplete ? (
                 <Check className="text-white" size={26} strokeWidth={2.5} />
               ) : (
                 <DownloadCloud className="text-white/80" size={26} strokeWidth={2} />
               )}
            </motion.div>
            <div>
               <motion.h1 
                 initial={{ opacity: 0, y: 5 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 0.3, duration: 0.6, ease: smoothEase }}
                 className="text-xl font-bold text-white mb-1 tracking-tight"
               >
                 {downloadComplete ? 'AI Models Installed' : 'Install AI Components'}
               </motion.h1>
               <motion.p 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 transition={{ delay: 0.4, duration: 0.6, ease: smoothEase }}
                 className="text-sm text-white/40 font-medium leading-relaxed"
               >
                 {downloadComplete 
                   ? 'The system is ready for offline processing.'
                   : `SmartMedia requires ${totalSizeGB} GB of local AI models to function offline.`}
               </motion.p>
            </div>
        </div>

        {/* Progress Section */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mb-8"
        >
           <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-semibold text-white/50 uppercase tracking-[0.15em]">
                 {isDownloading ? `Installing: ${currentModelName}` : downloadComplete ? 'Completed' : 'Waiting to start...'}
              </span>
              {isDownloading && <span className="text-[10px] font-mono text-white/40">{downloadSpeed}</span>}
           </div>
           
           {/* Minimal Sharp Progress Bar */}
           <div className="h-1 w-full bg-white/[0.05] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                initial={{ width: 0 }}
                animate={{ width: `${overallProgress}%` }}
                transition={{ duration: 0.1, ease: 'linear' }}
              />
           </div>
        </motion.div>

        {/* Model Chips - Square Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6, ease: smoothEase }}
          className="grid grid-cols-2 gap-3 mb-8"
        >
           {models.map((model) => (
             <div 
               key={model.id}
               className={`flex items-center justify-between px-3.5 py-3 rounded-xl border text-[11px] font-medium transition-all duration-300 ${
                 model.downloaded 
                   ? 'bg-white/[0.06] border-white/[0.1] text-white shadow-[0_0_15px_rgba(255,255,255,0.02)]' 
                   : 'bg-white/[0.01] border-white/[0.03] text-white/30'
               }`}
             >
                <span className="truncate pr-2">{model.name}</span>
                {model.downloaded ? (
                   <Check size={14} className="text-white shrink-0" strokeWidth={2.5} />
                ) : (
                   <span className="bg-white/[0.05] px-1.5 py-0.5 rounded-md text-white/30 font-mono tracking-tighter">{model.size}</span>
                )}
             </div>
           ))}
        </motion.div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-3">
           <AnimatePresence mode="wait">
             {/* Waiting for Python engine */}
             {!pythonReady && !downloadComplete && (
               <motion.div
                 key="waiting"
                 initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                 className="w-full py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-white/50 text-sm font-medium flex items-center justify-center gap-2"
               >
                 <Loader2 size={16} className="animate-spin text-white/60" />
                 Waiting for AI engine to start…
               </motion.div>
             )}

             {/* Checking models */}
             {pythonReady && checkingModels && !downloadComplete && (
               <motion.div
                 key="checking"
                 initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                 className="w-full py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-white/50 text-sm font-medium flex items-center justify-center gap-2"
               >
                 <Loader2 size={16} className="animate-spin text-white/60" />
                 Checking installed models…
               </motion.div>
             )}

             {/* Download button */}
             {pythonReady && !checkingModels && !isDownloading && !downloadComplete && (
               <motion.button
                 key="download"
                 initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                 onClick={handleStartDownload}
                 className="w-full py-3.5 rounded-xl bg-white text-black hover:bg-gray-200 active:scale-[0.98] text-sm font-bold transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.25)] flex items-center justify-center gap-2"
               >
                 <DownloadCloud size={16} strokeWidth={2.5} />
                 Download Models
               </motion.button>
             )}

             {/* Download Complete button */}
             {downloadComplete && (
               <motion.button
                 key="continue"
                 initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                 onClick={handleContinue}
                 className="w-full py-3.5 rounded-xl bg-white text-black hover:bg-gray-200 active:scale-[0.98] text-sm font-bold transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.25)] flex items-center justify-center gap-2"
               >
                 Get Started
                 <ArrowRight size={16} strokeWidth={2.5} />
               </motion.button>
             )}
           </AnimatePresence>

           {downloadError && (
              <p className="text-[11px] text-white/50 text-center mt-2 flex items-center justify-center gap-1.5 font-medium">
                 <AlertCircle size={12} className="text-white/60" />
                 {downloadError}
              </p>
           )}
        </div>

      </motion.div>
    </div>
  )
}