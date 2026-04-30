import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useAppStore, ImageMetadata } from '../store/appStore'
import PhotoViewer from './PhotoViewer'
import {
  X,
  Send,
  Sparkles,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Download,
  MoreVertical,
  Copy,
  RefreshCw,
  Bot,
  Plus,
  Zap,
  Search,
  Camera,
  BarChart3,
  Clock,
  Star,
  ChevronDown,
  ArrowUp,
  Globe,
  Smile,
  Users
} from 'lucide-react'

// --- Enterprise Design System ---
const ACCENT_PRIMARY = "#0078d4"

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  imagePath?: string
  correctedQuery?: string
  action?: string
  searchQuery?: string
  images?: Array<{ path: string, filename: string, caption?: string, objects?: string[] }>
  stats?: any
  timing?: number
  isStreaming?: boolean
}

// ============================================================
// TypeWriter Effect - Simulates streaming like Google Gemini
// ============================================================
function TypewriterText({ text, speed = 12, onComplete }: { text: string; speed?: number; onComplete?: () => void }) {
  const [displayedText, setDisplayedText] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const indexRef = useRef(0)

  useEffect(() => {
    if (!text) return
    setDisplayedText('')
    indexRef.current = 0
    setIsComplete(false)

    const timer = setInterval(() => {
      const chunkSize = Math.min(3, text.length - indexRef.current)
      indexRef.current = Math.min(indexRef.current + chunkSize, text.length)
      setDisplayedText(text.slice(0, indexRef.current))

      if (indexRef.current >= text.length) {
        clearInterval(timer)
        setIsComplete(true)
        onComplete?.()
      }
    }, speed)

    return () => clearInterval(timer)
  }, [text, speed])

  return (
    <span>
      {displayedText}
      {!isComplete && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="inline-block w-[2px] h-[14px] bg-[#0078d4] ml-[2px] align-middle"
        />
      )}
    </span>
  )
}

// ============================================================
// AI Thinking Animation (Gemini-style shimmer)
// ============================================================
function ThinkingAnimation() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl px-5 py-4 bg-[#1a1a1a] border border-[#2a2a2a]">
        <div className="flex items-center gap-3">
          <div className="relative w-6 h-6">
            <motion.div
              className="absolute inset-0 rounded-full bg-gradient-to-r from-[#0078d4] via-[#00a4ef] to-[#7b2ff7]"
              animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div className="absolute inset-[2px] rounded-full bg-[#1a1a1a]" />
            <motion.div
              className="absolute inset-[3px] rounded-full bg-gradient-to-r from-[#0078d4] to-[#7b2ff7]"
              animate={{ scale: [0.8, 1, 0.8], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
            />
          </div>
          <div className="flex-1 space-y-2">
            <motion.div
              className="h-2 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
              animate={{ x: [-100, 200] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              style={{ width: '80%' }}
            />
            <motion.div
              className="h-2 rounded-full bg-gradient-to-r from-transparent via-white/8 to-transparent"
              animate={{ x: [-80, 180] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: 0.3 }}
              style={{ width: '60%' }}
            />
          </div>
        </div>
        <motion.p
          className="text-xs text-white/40 mt-2"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Analyzing...
        </motion.p>
      </div>
    </div>
  )
}

// ============================================================
// Quick Action Chips
// ============================================================
const QUICK_ACTIONS = [
  { icon: Search, label: 'Find photos', query: 'Find my recent photos', color: '#0078d4' },
  { icon: Smile, label: 'Happy moments', query: 'Show me happy photos', color: '#f59e0b' },
  { icon: Camera, label: 'Selfies', query: 'Find all selfies', color: '#ec4899' },
  { icon: Globe, label: 'Landscapes', query: 'Show landscape photos', color: '#10b981' },
  { icon: BarChart3, label: 'Library stats', query: 'Show my library statistics', color: '#8b5cf6' },
  { icon: Star, label: 'Favorites', query: 'Show my favorite photos', color: '#f97316' },
  { icon: Users, label: 'Group photos', query: 'Find group photos', color: '#06b6d4' },
  { icon: Clock, label: 'Recent', query: 'Show recent photos', color: '#6366f1' },
]

export default function AIChatbot() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageCache, setImageCache] = useState<{ [key: string]: string }>({})
  const [showMenu, setShowMenu] = useState(false)
  const [viewerImage, setViewerImage] = useState<ImageMetadata | null>(null)
  const [viewerImages, setViewerImages] = useState<ImageMetadata[]>([])
  const [viewerIndex, setViewerIndex] = useState(0)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const showAiChatbot = useAppStore((state) => state.showAiChatbot)
  const setShowAiChatbot = useAppStore((state) => state.setShowAiChatbot)
  const images = useAppStore((state) => state.images)

  const clearChat = useCallback(() => { setMessages([]); setShowMenu(false) }, [])
  const copyLastResponse = useCallback(() => {
    const lastMsg = [...messages].reverse().find(m => m.role === 'assistant')
    if (lastMsg) { navigator.clipboard.writeText(lastMsg.content); setShowMenu(false) }
  }, [messages])
  const exportChat = useCallback(() => {
    const chatText = messages.map(m => `${m.role.toUpperCase()} [${m.timestamp.toLocaleString()}]:\n${m.content}\n`).join('\n')
    const blob = new Blob([chatText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `SmartMedia-Chat-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
    setShowMenu(false)
  }, [messages])
  const refreshDatabase = useCallback(async () => {
    setShowMenu(false)
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: '🔄 Refreshing database...', timestamp: new Date() }])
    try {
      // @ts-ignore
      const response = await window.electronAPI?.getImages({ limit: 1000 })
      const count = response?.success && response?.images ? response.images.length : 0
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: `✅ Database refreshed! Found ${count} items.`, timestamp: new Date() }])
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: '❌ Failed to refresh database.', timestamp: new Date() }])
    }
  }, [])

  // === Image loading for results ===
  useEffect(() => {
    const loadImages = async () => {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage?.images) {
        for (const img of lastMessage.images.slice(0, 12)) {
          if (!imageCache[img.path]) {
            try {
              // @ts-ignore
              const fullImage = await window.electronAPI?.readImageAsBase64(img.path)
              if (fullImage) setImageCache(prev => ({ ...prev, [img.path]: fullImage }))
            } catch { }
          }
        }
      }
    }
    loadImages()
  }, [messages.length])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (showAiChatbot && inputRef.current) inputRef.current.focus() }, [showAiChatbot])

  // === Scroll detection ===
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100)
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const loadPreview = async () => {
      if (selectedImage) {
        // @ts-ignore
        const preview = await window.electronAPI?.getImageThumbnail(selectedImage)
        setImagePreview(preview || null)
      } else setImagePreview(null)
    }
    loadPreview()
  }, [selectedImage])

  // === CORE: Send message handler ===
  const handleSend = useCallback(async () => {
    if (!input.trim() && !selectedImage) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
      imagePath: selectedImage || undefined
    }

    setMessages(prev => [...prev, userMessage])
    const currentInput = input
    const currentImage = selectedImage
    setInput('')
    setSelectedImage(null)
    setImagePreview(null)
    setIsLoading(true)

    const startTime = performance.now()

    try {
      // @ts-ignore
      const result = await window.electronAPI?.aiChat(currentImage || '', currentInput)

      const elapsed = performance.now() - startTime
      const streamMsgId = (Date.now() + 1).toString()

      const assistantMessage: Message = {
        id: streamMsgId,
        role: 'assistant',
        content: result.response || "I didn't get a response.",
        timestamp: new Date(),
        images: result.images || undefined,
        action: result.action,
        timing: result.timing || (elapsed / 1000),
        isStreaming: true
      }

      setMessages(prev => [...prev, assistantMessage])
      setStreamingMessageId(streamMsgId)

      // Mark streaming complete after typewriter finishes
      setTimeout(() => {
        setStreamingMessageId(null)
        setMessages(prev => prev.map(m =>
          m.id === streamMsgId ? { ...m, isStreaming: false } : m
        ))
      }, Math.min(assistantMessage.content.length * 15, 5000))

    } catch (error) {
      console.error("Chat error:", error)
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date()
      }])
    } finally {
      setIsLoading(false)
    }
  }, [input, selectedImage])

  const handleSelectImage = useCallback(() => {
    if (images.length > 0) setSelectedImage(images[0].path)
  }, [images])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  if (!showAiChatbot) return null

  return (
    <>
      <AnimatePresence mode="wait">
        {showAiChatbot && (
          <>
            {/* Backdrop with blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-[35] backdrop-blur-md"
              onClick={() => setShowAiChatbot(false)}
            />

            {/* Main Panel */}
            <motion.div
              initial={{ x: 420, opacity: 0, scale: 0.95 }}
              animate={{
                x: 0, opacity: 1, scale: 1,
                transition: { type: "spring", stiffness: 400, damping: 35, mass: 0.8 }
              }}
              exit={{ x: 420, opacity: 0, scale: 0.95, transition: { duration: 0.25, ease: "easeIn" } }}
              className="fixed top-0 right-0 z-40 w-[420px] h-full bg-[#0a0a0a] border-l border-[#1f1f1f] shadow-2xl shadow-black/50 flex flex-col"
            >
              {/* === HEADER === */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1f1f1f] bg-[#0a0a0a]">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <motion.div
                      className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0078d4] via-[#00a4ef] to-[#7b2ff7] flex items-center justify-center"
                      animate={{ boxShadow: ['0 0 0px rgba(0,120,212,0)', '0 0 15px rgba(0,120,212,0.4)', '0 0 0px rgba(0,120,212,0)'] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    >
                      <Sparkles className="text-white" size={18} />
                    </motion.div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0a0a0a]" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-white tracking-tight">SmartMedia AI</h3>
                    <p className="text-[10px] text-emerald-400/80 font-medium">Ready • Local AI</p>
                  </div>
                </div>

                <div className="flex items-center gap-0.5">
                  <div className="relative">
                    <button onClick={() => setShowMenu(!showMenu)} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
                      <MoreVertical size={15} className="text-white/50" />
                    </button>
                    <AnimatePresence>
                      {showMenu && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -5 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -5 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-10 w-52 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl shadow-black/50 p-1.5 z-50"
                        >
                          <button onClick={clearChat} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/5 text-left text-xs text-white/70 transition-colors">
                            <Trash2 size={13} className="text-white/40" /> New conversation
                          </button>
                          <button onClick={copyLastResponse} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/5 text-left text-xs text-white/70 transition-colors">
                            <Copy size={13} className="text-white/40" /> Copy last response
                          </button>
                          <button onClick={exportChat} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/5 text-left text-xs text-white/70 transition-colors">
                            <Download size={13} className="text-white/40" /> Export conversation
                          </button>
                          <div className="my-1 border-t border-[#2a2a2a]" />
                          <button onClick={refreshDatabase} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/5 text-left text-xs text-white/70 transition-colors">
                            <RefreshCw size={13} className="text-white/40" /> Refresh database
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button onClick={() => setShowAiChatbot(false)} className="p-2 rounded-lg hover:bg-[#c42b1c]/20 hover:text-[#ff6b6b] transition-all text-white/40">
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* === MESSAGES AREA === */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin scrollbar-thumb-[#2a2a2a] scrollbar-track-transparent">
                {/* Empty State - Gemini-style welcome */}
                {messages.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="h-full flex flex-col items-center justify-center text-center px-4"
                  >
                    <div className="relative mb-6">
                      <motion.div
                        className="w-20 h-20 rounded-full bg-gradient-to-br from-[#0078d4] via-[#00a4ef] to-[#7b2ff7]"
                        animate={{
                          scale: [1, 1.05, 1],
                          boxShadow: ['0 0 30px rgba(0,120,212,0.2)', '0 0 60px rgba(0,120,212,0.4)', '0 0 30px rgba(0,120,212,0.2)']
                        }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      />
                      <motion.div className="absolute inset-[8px] rounded-full bg-[#0a0a0a]" />
                      <motion.div className="absolute inset-0 flex items-center justify-center">
                        <Sparkles className="text-[#0078d4]" size={28} />
                      </motion.div>
                    </div>

                    <h4 className="text-base font-semibold text-white mb-1.5">Welcome to SmartMedia AI</h4>
                    <p className="text-xs text-white/35 mb-8 max-w-[280px] leading-relaxed">
                      Your intelligent photo assistant. Search, analyze, and explore your media library with AI.
                    </p>

                    <div className="w-full grid grid-cols-2 gap-2">
                      {QUICK_ACTIONS.map((action, i) => (
                        <motion.button
                          key={action.label}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 + i * 0.05 }}
                          onClick={() => { setInput(action.query); setTimeout(() => inputRef.current?.focus(), 50) }}
                          className="group flex items-center gap-2.5 px-3 py-2.5 bg-[#141414] hover:bg-[#1a1a1a] border border-[#222] hover:border-[#333] rounded-xl text-xs text-white/60 hover:text-white/80 transition-all text-left"
                        >
                          <action.icon size={14} style={{ color: action.color }} className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
                          <span className="truncate">{action.label}</span>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Message list */}
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${message.role === 'user'
                      ? 'bg-gradient-to-r from-[#0078d4] to-[#005fb0] text-white'
                      : 'bg-[#1a1a1a] border border-[#252525] text-white/85'
                      }`}>
                      {message.imagePath && message.role === 'user' && (
                        <div className="mb-2 rounded-lg overflow-hidden border border-white/10">
                          <img src={imagePreview || ''} className="w-full h-28 object-cover" alt="" />
                        </div>
                      )}

                      <div className="whitespace-pre-wrap">
                        {message.role === 'assistant' && message.isStreaming ? (
                          <TypewriterText text={message.content} speed={12} />
                        ) : (
                          <p>{message.content}</p>
                        )}
                      </div>

                      {message.images && message.images.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-1.5">
                          {message.images.slice(0, 4).map((img, idx) => (
                            <motion.button
                              key={idx}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: idx * 0.1 }}
                              onClick={() => {
                                const meta = images.find(i => i.path === img.path) || {
                                  id: 'temp-' + idx, path: img.path, filename: img.filename,
                                  tags: [], objects: [], caption: img.caption || '',
                                  dateAdded: new Date().toISOString(), size: 0,
                                  isFavorite: false, isDeleted: false,
                                  width: 0, height: 0, type: 'jpg', locked: false,
                                  shareHistory: [], faces: []
                                } as unknown as ImageMetadata
                                setViewerImage(meta)
                              }}
                              className="relative aspect-square rounded-lg overflow-hidden border border-white/5 group bg-black/30"
                            >
                              {imageCache[img.path] ? (
                                <img src={imageCache[img.path]} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" alt="" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/15 bg-white/[0.02]">
                                  <ImageIcon size={18} />
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 text-left opacity-0 group-hover:opacity-100 transition-all duration-200">
                                <p className="text-[10px] text-white truncate font-medium">{img.filename}</p>
                              </div>
                            </motion.button>
                          ))}
                          {message.images.length > 4 && (
                            <button className="aspect-square rounded-lg flex flex-col items-center justify-center bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 text-white/40 transition-all">
                              <div className="bg-white/5 w-8 h-8 rounded-full flex items-center justify-center mb-1">
                                <Plus size={14} />
                              </div>
                              <span className="text-[10px]">+{message.images.length - 4} more</span>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 mt-1.5">
                        {message.timing !== undefined && message.role === 'assistant' && (
                          <span className="text-[9px] opacity-30">
                            <Zap size={8} className="inline mr-0.5" />{message.timing.toFixed(1)}s
                          </span>
                        )}
                        <p className="text-[9px] opacity-25">
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}

                {isLoading && <ThinkingAnimation />}
                <div ref={messagesEndRef} />
              </div>

              {/* Scroll to bottom */}
              <AnimatePresence>
                {showScrollButton && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    onClick={scrollToBottom}
                    className="absolute bottom-24 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center shadow-lg z-10 hover:bg-[#222] transition-colors"
                  >
                    <ChevronDown size={14} className="text-white/60" />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* === SELECTED IMAGE PREVIEW === */}
              <AnimatePresence>
                {selectedImage && imagePreview && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-4 py-2 bg-[#0f0f0f] border-t border-[#1f1f1f] overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img src={imagePreview} className="w-10 h-10 rounded-lg object-cover border border-[#333]" alt="" />
                        <div>
                          <span className="text-[11px] text-white/50">Image attached</span>
                          <p className="text-[10px] text-white/25">Ready for analysis</p>
                        </div>
                      </div>
                      <button onClick={() => setSelectedImage(null)} className="text-white/30 hover:text-white/60 p-1 rounded hover:bg-white/5 transition-all">
                        <X size={14} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* === INPUT AREA === */}
              <div className="p-3 bg-[#0a0a0a] border-t border-[#1f1f1f]">
                <div className="flex items-center gap-2 bg-[#141414] border border-[#222] rounded-xl px-3 py-1.5 focus-within:border-[#0078d4]/50 transition-colors">
                  <button onClick={handleSelectImage} className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-all" title="Attach image">
                    <ImageIcon size={16} />
                  </button>
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Ask SmartMedia AI..."
                    className="flex-1 bg-transparent text-[13px] text-white placeholder-white/20 focus:outline-none py-1.5"
                    disabled={isLoading}
                  />
                  <motion.button
                    onClick={handleSend}
                    disabled={(!input.trim() && !selectedImage) || isLoading}
                    whileTap={{ scale: 0.9 }}
                    className={`p-2 rounded-lg transition-all ${input.trim() || selectedImage
                      ? 'bg-gradient-to-r from-[#0078d4] to-[#005fb0] text-white shadow-lg shadow-[#0078d4]/20'
                      : 'text-white/15 cursor-not-allowed'
                      }`}
                  >
                    {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
                  </motion.button>
                </div>
                <p className="text-[9px] text-white/15 text-center mt-2">
                  SmartMedia AI runs locally on your device • Your data stays private
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Photo Viewer */}
      {viewerImage && (
        <PhotoViewer
          image={viewerImage}
          imagePreview={imageCache[viewerImage.path] || ''}
          onClose={() => { setViewerImage(null); setViewerImages([]) }}
        />
      )}
    </>
  )
}

// ============================================================
// Floating Action Button (Gemini-style activation animation)
// ============================================================
export function AIChatbotFAB() {
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const showAiChatbot = useAppStore((state) => state.showAiChatbot)
  const setShowAiChatbot = useAppStore((state) => state.setShowAiChatbot)

  return (
    <motion.div className="fixed bottom-6 right-6 z-[50]">
      {/* Pulsing rings on hover */}
      <AnimatePresence>
        {isHovered && !showAiChatbot && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [1, 1.5, 1.8], opacity: [0.4, 0.15, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="absolute inset-0 rounded-full bg-gradient-to-r from-[#0078d4] to-[#7b2ff7]"
          />
        )}
      </AnimatePresence>

      {/* Press burst effect - Gemini activation */}
      <AnimatePresence>
        {isPressed && (
          <>
            <motion.div
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 3, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute inset-0 rounded-full bg-gradient-to-r from-[#0078d4] via-[#00a4ef] to-[#7b2ff7]"
            />
            <motion.div
              initial={{ scale: 1, opacity: 0.4 }}
              animate={{ scale: 2.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
              className="absolute inset-0 rounded-full bg-gradient-to-r from-[#7b2ff7] via-[#0078d4] to-[#00a4ef]"
            />
          </>
        )}
      </AnimatePresence>

      {/* Main button */}
      <motion.button
        onClick={() => {
          setIsPressed(true)
          setTimeout(() => setIsPressed(false), 600)
          setShowAiChatbot(!showAiChatbot)
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.85 }}
        className="relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl shadow-[#0078d4]/30 overflow-hidden"
        style={{ willChange: 'transform' }}
      >
        <motion.div className="absolute inset-0 bg-gradient-to-br from-[#0078d4] via-[#005fb0] to-[#7b2ff7]" />
        <div className="absolute inset-0 rounded-full border border-white/20" />
        <motion.div
          animate={{ rotate: showAiChatbot ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="relative z-10"
        >
          {showAiChatbot ? (
            <X className="text-white" size={22} />
          ) : (
            <Sparkles className="text-white" size={22} />
          )}
        </motion.div>

        {/* Shine sweep effect */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          initial={{ x: '-100%' }}
          animate={isHovered ? { x: '200%' } : { x: '-100%' }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        />
      </motion.button>

      {/* Tooltip */}
      <AnimatePresence>
        {isHovered && !showAiChatbot && (
          <motion.div
            initial={{ opacity: 0, x: 10, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 10, scale: 0.9 }}
            className="absolute right-[calc(100%+12px)] top-1/2 -translate-y-1/2 whitespace-nowrap bg-[#1a1a1a] text-white text-xs px-3 py-1.5 rounded-lg border border-[#2a2a2a] shadow-xl pointer-events-none"
          >
            SmartMedia AI
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}