import { Minus, Square, X, User, Sparkles } from 'lucide-react'
import { useAppStore } from '../store/appStore'

// --- VISUAL CONSTANTS ---
const BAR_BG = "bg-[#050505]"
const BORDER_COLOR = "border-[#1a1a1a]"
const TEXT_MUTED = "text-[#888]"
const TEXT_BRIGHT = "text-[#eee]"
const BUTTON_HOVER = "hover:bg-[#222]"
const CLOSE_HOVER = "hover:bg-[#e81123] hover:text-white"

export default function TitleBar() {
  const { userName } = useAppStore()

  // Native Window Controls
  const handleMinimize = () => window.electronAPI?.minimizeWindow()
  const handleMaximize = () => window.electronAPI?.maximizeWindow()
  const handleClose = () => window.electronAPI?.closeWindow()

  return (
    <div 
      className={`h-[32px] w-full flex items-center justify-between select-none z-[9999] relative ${BAR_BG} border-b ${BORDER_COLOR}`}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      
      {/* LEFT: Brand & Context */}
      <div className="flex items-center h-full pl-3 gap-3">
        {/* Logo Mark */}
        <div className="flex items-center justify-center w-4 h-4 rounded-sm bg-gradient-to-tr from-white to-[#666]">
          <div className="w-1.5 h-1.5 bg-[#050505] rounded-full" />
        </div>
        
        {/* App Title / Breadcrumb */}
        <div className="flex items-center gap-2 text-[12px] font-medium tracking-wide">
          <span className={TEXT_BRIGHT}>SmartMedia</span>
          <span className="text-[#333]">/</span>
          <span className={TEXT_MUTED}>Library</span>
        </div>
      </div>

      {/* CENTER: Workspace Indicator (Optional aesthetic touch) */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#111] border border-[#222]">
        {userName ? (
          <>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
            <span className="text-[10px] text-[#888] font-mono uppercase tracking-wider max-w-[100px] truncate">
              {userName}'s Workspace
            </span>
          </>
        ) : (
          <span className="text-[10px] text-[#444] font-mono">GUEST</span>
        )}
      </div>

      {/* RIGHT: Window Controls (No Drag) */}
      <div 
        className="flex items-center h-full" 
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          className={`h-full w-[46px] flex items-center justify-center transition-colors text-[#999] hover:text-white ${BUTTON_HOVER}`}
          tabIndex={-1}
        >
          <Minus size={14} strokeWidth={1.5} />
        </button>

        {/* Maximize */}
        <button
          onClick={handleMaximize}
          className={`h-full w-[46px] flex items-center justify-center transition-colors text-[#999] hover:text-white ${BUTTON_HOVER}`}
          tabIndex={-1}
        >
          <Square size={10} strokeWidth={2} className="rounded-[1px]" />
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          className={`h-full w-[46px] flex items-center justify-center transition-colors text-[#999] ${CLOSE_HOVER}`}
          tabIndex={-1}
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}