import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Home, 
  Heart, 
  FolderHeart, 
  Users, 
  Trash2, 
  Lock, 
  Settings
} from 'lucide-react'
import { useAppStore, Screen } from '../store/appStore'


interface NavItem {
  id: string
  icon: typeof Home
  label: string
  screen: string
}


const navItems: NavItem[] = [
  { id: 'home', icon: Home, label: 'Home', screen: 'home' },
  { id: 'favorites', icon: Heart, label: 'Favorites', screen: 'favorites' },
  { id: 'albums', icon: FolderHeart, label: 'Albums', screen: 'albums' },
  { id: 'faces', icon: Users, label: 'Faces', screen: 'faces' },
]


const moreItems: NavItem[] = [
  { id: 'trash', icon: Trash2, label: 'Trash', screen: 'trash' },
  { id: 'locker', icon: Lock, label: 'Locker', screen: 'locker' },
  { id: 'settings', icon: Settings, label: 'Settings', screen: 'settings' },
]


export default function BottomNavigation() {
  const { currentScreen, setCurrentScreen } = useAppStore()
  const [showMore, setShowMore] = useState(false)
  const [longPressProgress, setLongPressProgress] = useState(0)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)


  const handleNavClick = (item: NavItem) => {
    setCurrentScreen(item.screen as Screen)
  }


  const startLongPress = (item: NavItem) => {
    if (item.id !== 'ai') return

    setLongPressProgress(0)
    
    let progress = 0
    progressIntervalRef.current = setInterval(() => {
      progress += 2
      setLongPressProgress(Math.min(progress, 100))
    }, 10)
  }


  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    setLongPressProgress(0)
  }


  const endLongPress = (item: NavItem) => {
    cancelLongPress()
    if (item.id === 'ai') {
      setCurrentScreen(item.screen as Screen)
    }
  }


  return (
    <>
      {/* More Menu Overlay */}
      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setShowMore(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed bottom-16 right-3 z-50 glass-panel rounded-xl p-1.5 min-w-[130px]"
            >
              {moreItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    handleNavClick(item)
                    setShowMore(false)
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all ${
                    currentScreen === item.screen
                      ? 'bg-white/20 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <item.icon size={16} />
                  <span className="text-[11px] font-medium">{item.label}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>


      {/* Bottom Navigation Bar */}
      <motion.nav
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="fixed bottom-0 left-0 right-0 z-30"
      >
        <div className="mx-3 mb-3">
          <div className="glass-panel rounded-xl px-1 py-1.5 flex items-center justify-around">
            {navItems.map((item) => {
              const isActive = item.id === 'ai' ? false : currentScreen === item.screen
              const isAI = item.id === 'ai'
              
              return (
                <div key={item.id} className="relative">
                  {isAI ? (
                    // AI Button with special styling
                    <motion.button
                      onMouseDown={() => startLongPress(item)}
                      onMouseUp={() => endLongPress(item)}
                      onMouseLeave={cancelLongPress}
                      onTouchStart={() => startLongPress(item)}
                      onTouchEnd={() => endLongPress(item)}
                      whileTap={{ scale: 0.92 }}
                      className="relative flex flex-col items-center justify-center p-2"
                    >
                      {/* Progress ring */}
                      <svg
                        className="absolute inset-0 w-full h-full -rotate-90"
                        viewBox="0 0 36 36"
                      >
                        <circle
                          cx="18"
                          cy="18"
                          r="15"
                          fill="none"
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="1.5"
                        />
                        <motion.circle
                          cx="18"
                          cy="18"
                          r="15"
                          fill="none"
                          stroke="url(#aiGradient)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeDasharray={94.2}
                          strokeDashoffset={94.2 - (94.2 * longPressProgress) / 100}
                        />
                        <defs>
                          <linearGradient id="aiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#8B5CF6" />
                            <stop offset="100%" stopColor="#EC4899" />
                          </linearGradient>
                        </defs>
                      </svg>
                      
                      {/* AI Icon */}
                      <motion.div
                        className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center"
                        style={{
                          background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
                        }}
                        animate={{
                          boxShadow: longPressProgress > 0
                            ? '0 0 16px rgba(139, 92, 246, 0.5)'
                            : '0 2px 8px rgba(139, 92, 246, 0.25)',
                        }}
                      >
                        <Sparkles size={16} className="text-white" strokeWidth={2.5} />
                      </motion.div>
                      
                      <span className="text-[8px] text-white/60 mt-0.5 font-medium">AI</span>
                    </motion.button>
                  ) : (
                    // Regular nav buttons
                    <motion.button
                      onClick={() => handleNavClick(item)}
                      whileTap={{ scale: 0.92 }}
                      className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-lg transition-all ${
                        isActive
                          ? 'text-white'
                          : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      <motion.div
                        animate={{
                          scale: isActive ? 1.08 : 1,
                        }}
                        className="relative"
                      >
                        <item.icon size={19} strokeWidth={isActive ? 2.5 : 2} />
                        {isActive && (
                          <motion.div
                            layoutId="activeIndicator"
                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white"
                          />
                        )}
                      </motion.div>
                      <span className="text-[8px] mt-0.5 font-medium">{item.label}</span>
                    </motion.button>
                  )}
                </div>
              )
            })}
            
            {/* More button */}
            <motion.button
              onClick={() => setShowMore(!showMore)}
              whileTap={{ scale: 0.92 }}
              className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-lg transition-all ${
                showMore || moreItems.some(i => currentScreen === i.screen)
                  ? 'text-white'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              <div className="flex gap-0.5 h-[19px] items-center">
                <div className="w-1 h-1 rounded-full bg-current" />
                <div className="w-1 h-1 rounded-full bg-current" />
                <div className="w-1 h-1 rounded-full bg-current" />
              </div>
              <span className="text-[8px] mt-0.5 font-medium">More</span>
            </motion.button>
          </div>
        </div>
      </motion.nav>
    </>
  )
}
