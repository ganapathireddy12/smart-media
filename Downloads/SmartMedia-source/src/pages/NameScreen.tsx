import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../store/appStore'
import { ArrowRight, UserCircle2 } from 'lucide-react'

// --- Custom Cinematic Easing ---
const smoothEase = [0.16, 1, 0.3, 1]

export default function NameScreen() {
  const [name, setName] = useState('')
  const setUserName = useAppStore((state) => state.setUserName)
  const setCurrentScreen = useAppStore((state) => state.setCurrentScreen)
  const setIsFirstLaunch = useAppStore((state) => state.setIsFirstLaunch)

  const handleContinue = () => {
    if (name.trim()) {
      setUserName(name.trim())
      setIsFirstLaunch(false)
      setCurrentScreen('modelDownload') // Proceed to next step
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleContinue()
    }
  }

  return (
    <div className="h-full flex items-center justify-center relative overflow-hidden bg-black font-['Inter','SF_Pro_Display','sans-serif'] text-white">
      
      {/* ── Cinematic Background Ambience (Matches Splash Screen) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* Deep background gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_130%_100%_at_50%_65%,#2d1b69_0%,#110d2e_45%,#000000_100%)] opacity-60" />
        
        {/* Purple ambient glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_38%,rgba(130,80,255,0.4)_0%,transparent_70%)] opacity-70 blur-[20px]" />
        
        {/* Vertical light beam */}
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[1px] h-[75%] bg-gradient-to-b from-transparent via-[rgba(160,120,255,0.22)] to-transparent blur-[18px]" />

        {/* Subtle noise overlay */}
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
        className="relative z-10 w-full max-w-[400px] mx-6 p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] shadow-[0_0_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      >
        {/* Header Section */}
        <div className="text-center mb-8">
          <motion.div 
            initial={{ scale: 0, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            transition={{ delay: 0.2, duration: 0.6, ease: smoothEase }}
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_20px_rgba(167,139,250,0.15)] bg-gradient-to-br from-white/[0.08] to-transparent border border-white/[0.08]"
          >
            <UserCircle2 size={32} className="text-[#c4b5fd]" strokeWidth={1.5} />
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6, ease: smoothEase }}
            className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-[#c4b5fd] mb-2 tracking-tight"
          >
            Welcome to SmartMedia
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6, ease: smoothEase }}
            className="text-sm text-white/40 font-medium"
          >
            Let's personalize your experience. What should we call you?
          </motion.p>
        </div>

        {/* Form Section */}
        <div className="space-y-6">
          <div className="space-y-2">
            <motion.label 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-[10px] font-semibold text-[#c4b5fd]/60 ml-1 uppercase tracking-[0.15em] block"
            >
              Display Name
            </motion.label>
            <motion.input
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6, ease: smoothEase }}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="e.g. Alex"
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] focus:border-[#a78bfa]/50 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(167,139,250,0.15)] text-white placeholder-white/20 outline-none transition-all duration-300 font-medium"
            />
          </div>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6, ease: smoothEase }}
            onClick={handleContinue}
            disabled={!name.trim()}
            className={`
              w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-all duration-300
              ${name.trim() 
                ? 'bg-gradient-to-r from-[#6c3fff] via-[#a78bfa] to-[#c4b5fd] text-white shadow-[0_0_14px_rgba(167,139,250,0.5)] hover:shadow-[0_0_24px_rgba(167,139,250,0.7)] hover:scale-[1.02] active:scale-[0.98]' 
                : 'bg-white/[0.04] text-white/20 cursor-not-allowed border border-white/[0.05]'}
            `}
          >
            Continue
            <ArrowRight size={16} className={name.trim() ? "opacity-100" : "opacity-50"} />
          </motion.button>
        </div>

        {/* Footer */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="text-center mt-8 border-t border-white/[0.05] pt-5"
        >
          <p className="text-[11px] text-white/30 flex items-center justify-center gap-1.5 font-medium tracking-wide">
            <Lock size={12} className="text-[#a78bfa]/50" />
            Stored locally. Never uploaded.
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}

// Helper component for the lock icon in footer
function Lock({ size, className }: { size: number, className?: string }) {
    return (
        <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width={size} 
            height={size} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={className}
        >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
    )
}