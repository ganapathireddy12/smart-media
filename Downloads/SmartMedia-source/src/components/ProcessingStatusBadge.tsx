import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, CheckCircle2, XCircle, Eye, X, Clock } from 'lucide-react'

interface ProcessingTask {
  id: string
  imagePath: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  timestamp: number
}

interface ProcessingStatus {
  queueLength: number
  processing: boolean
  currentTask: {
    id: string
    imagePath: string
    status: string
  } | null
  completed: number
  failed: number
  tasks?: ProcessingTask[]
}

const ProcessingStatusBadge = () => {
  const [status, setStatus] = useState<ProcessingStatus>({
    queueLength: 0,
    processing: false,
    currentTask: null,
    completed: 0,
    failed: 0,
    tasks: []
  })
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    // Listen for processing status updates
    const handleStatusUpdate = (_event: any, newStatus: ProcessingStatus) => {
      setStatus(newStatus)
    }

    if (window.electronAPI?.onProcessingStatus) {
      window.electronAPI.onProcessingStatus(handleStatusUpdate)
    }

    // Poll for initial status
    const pollStatus = async () => {
      try {
        const currentStatus = await window.electronAPI?.getProcessingStatus()
        if (currentStatus) {
          setStatus(currentStatus)
        }
      } catch (error) {
        console.error('Failed to get processing status:', error)
      }
    }

    pollStatus()
    const interval = setInterval(pollStatus, 5000) // Poll every 5 seconds

    return () => {
      clearInterval(interval)
    }
  }, [])

  const handleClearCompleted = async () => {
    try {
      await window.electronAPI?.clearCompletedTasks()
    } catch (error) {
      console.error('Failed to clear completed tasks:', error)
    }
  }

  const isActive = status.queueLength > 0 || status.processing

  if (!isActive && status.completed === 0 && status.failed === 0) {
    return null // Don't show anything if no activity
  }

  return (
    <>
      {/* Floating Badge */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        className="fixed bottom-24 right-6 z-50"
      >
        <motion.button
          onClick={() => setExpanded(!expanded)}
          className={`
            relative flex items-center gap-3 px-5 py-3 rounded-full shadow-2xl
            ${status.processing 
              ? 'bg-gradient-to-r from-blue-600 to-blue-500' 
              : status.queueLength > 0 
                ? 'bg-gradient-to-r from-orange-600 to-orange-500'
                : 'bg-gradient-to-r from-green-600 to-green-500'
            }
            hover:shadow-3xl transition-all duration-300 backdrop-blur-sm
            border border-white/20
          `}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {/* Animated Icon */}
          <div className="relative">
            {status.processing ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : status.queueLength > 0 ? (
              <Clock className="w-5 h-5 text-white" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-white" />
            )}
          </div>

          {/* Status Text */}
          <div className="flex flex-col items-start">
            <span className="text-sm font-semibold text-white">
              {status.processing 
                ? 'Processing...' 
                : status.queueLength > 0 
                  ? `${status.queueLength} Queued`
                  : 'All Done'
              }
            </span>
            {status.currentTask && (
              <span className="text-xs text-white/80 max-w-[200px] truncate">
                {status.currentTask.imagePath}
              </span>
            )}
          </div>

          {/* Badge Count */}
          {(status.completed > 0 || status.failed > 0) && (
            <div className="absolute -top-2 -right-2 bg-white text-blue-600 rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold shadow-lg">
              {status.completed + status.failed}
            </div>
          )}
        </motion.button>
      </motion.div>

      {/* Expanded Panel */}
      <AnimatePresence>
        {expanded && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setExpanded(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-[450px] bg-[#1a1a1a] border-l border-[#2a2a2a] shadow-2xl z-[70] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-[#2a2a2a]">
                <div>
                  <h2 className="text-xl font-bold text-white">Processing Queue</h2>
                  <p className="text-sm text-white/60 mt-1">
                    {status.processing && 'AI is analyzing images...'}
                    {!status.processing && status.queueLength > 0 && 'Waiting to process...'}
                    {!status.processing && status.queueLength === 0 && 'No pending tasks'}
                  </p>
                </div>
                <button
                  onClick={() => setExpanded(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white/60" />
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 p-6 border-b border-[#2a2a2a]">
                <div className="bg-[#252525] rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-400">{status.queueLength}</div>
                  <div className="text-xs text-white/60 mt-1">Queued</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-400">{status.completed}</div>
                  <div className="text-xs text-white/60 mt-1">Completed</div>
                </div>
                <div className="bg-[#252525] rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-400">{status.failed}</div>
                  <div className="text-xs text-white/60 mt-1">Failed</div>
                </div>
              </div>

              {/* Current Processing */}
              {status.currentTask && (
                <div className="p-6 border-b border-[#2a2a2a] bg-blue-500/10">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-6 h-6 text-blue-400 animate-spin flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white">Currently Processing</div>
                      <div className="text-xs text-white/60 truncate mt-1">
                        {status.currentTask.imagePath}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 bg-[#252525] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-400"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 25, ease: 'linear', repeat: Infinity }}
                    />
                  </div>
                </div>
              )}

              {/* Task List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {status.tasks && status.tasks.length > 0 ? (
                  status.tasks.map((task) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`
                        flex items-center gap-3 p-4 rounded-lg border
                        ${task.status === 'completed' ? 'bg-green-500/10 border-green-500/30' : ''}
                        ${task.status === 'failed' ? 'bg-red-500/10 border-red-500/30' : ''}
                        ${task.status === 'queued' ? 'bg-[#252525] border-[#3a3a3a]' : ''}
                        ${task.status === 'processing' ? 'bg-blue-500/10 border-blue-500/30' : ''}
                      `}
                    >
                      {task.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />}
                      {task.status === 'failed' && <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />}
                      {task.status === 'queued' && <Clock className="w-5 h-5 text-white/40 flex-shrink-0" />}
                      {task.status === 'processing' && <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />}
                      
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{task.imagePath}</div>
                        <div className="text-xs text-white/40 mt-1">
                          {task.status === 'completed' && 'Analysis complete'}
                          {task.status === 'failed' && 'Failed to process'}
                          {task.status === 'queued' && 'Waiting in queue'}
                          {task.status === 'processing' && 'Analyzing...'}
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-12 text-white/40">
                    <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No tasks in queue</p>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              {(status.completed > 0 || status.failed > 0) && (
                <div className="p-6 border-t border-[#2a2a2a]">
                  <button
                    onClick={handleClearCompleted}
                    className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm font-medium transition-colors"
                  >
                    Clear Completed Tasks
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

export default ProcessingStatusBadge
