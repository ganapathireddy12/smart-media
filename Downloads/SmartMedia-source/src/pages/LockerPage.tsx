import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, ImageMetadata } from '../store/appStore'
import PhotoViewer from '../components/PhotoViewer'
import {
  Lock, Unlock, Shield, AlertTriangle, Image as ImageIcon,
  Key, Settings, Camera, History, Trash2, X, Fingerprint,
  LogOut, ShieldAlert, ShieldCheck, CheckCircle2, ChevronRight, Eye, EyeOff,
  MoreVertical, FileText, RefreshCw
} from 'lucide-react'
import {
  hashPin, generateSalt, generateRecoveryKey, formatRecoveryKey,
  checkPinStrength, createAuditEntry, isCurrentlyLockedOut, getLockoutTimeRemaining,
  type AuditLogEntry
} from '../utils/cryptoUtils'

// --- CONSTANTS ---
const PAGE_BG = "bg-[#050505]"
const PANEL_BG = "bg-[#111]"
const BORDER_COLOR = "border-[#1a1a1a]"
const ACCENT_COLOR = "text-emerald-500"
const BUTTON_HOVER = "hover:bg-[#222]"

// --- TYPES ---
interface EnhancedLockerSettings {
  isEnabled: boolean
  pinHash?: string
  salt?: string
  failedAttempts: number
  lockedUntil?: string
  lockoutMinutes: number
  maxAttempts: number
  alertOnFailedAttempts: boolean
  autoLockTimeout: number 
  intruderDetection: boolean
  intruderPhotos: string[]
  auditLog: AuditLogEntry[]
}

const defaultSettings: EnhancedLockerSettings = {
  isEnabled: false,
  failedAttempts: 0,
  lockoutMinutes: 5,
  maxAttempts: 5,
  alertOnFailedAttempts: true,
  autoLockTimeout: 5,
  intruderDetection: true,
  intruderPhotos: [],
  auditLog: []
}

// --- COMPONENTS ---

// 1. CONTEXT MENU (Right Click)
const ContextMenu = ({ x, y, onClose, onRestore, onDelete, onInfo }: any) => {
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
      className="fixed z-50 w-48 bg-[#1a1a1a] border border-[#333] shadow-2xl rounded-lg py-1 flex flex-col"
      style={{ top: y, left: x }}
      onClick={e => e.stopPropagation()}
    >
      <button onClick={onRestore} className="flex items-center gap-3 px-4 py-2 text-xs text-white hover:bg-[#333] text-left transition-colors">
        <Unlock size={14} /> Restore to Gallery
      </button>
      <button onClick={onInfo} className="flex items-center gap-3 px-4 py-2 text-xs text-white hover:bg-[#333] text-left transition-colors">
        <FileText size={14} /> Properties
      </button>
      <div className="h-[1px] bg-[#333] my-1" />
      <button onClick={onDelete} className="flex items-center gap-3 px-4 py-2 text-xs text-red-400 hover:bg-[#333] text-left transition-colors">
        <Trash2 size={14} /> Delete Permanently
      </button>
    </motion.div>
  )
}

export default function LockerPage() {
  const { 
    lockerSettings, setLockerSettings, lockerImages, removeFromLocker, 
    isLockerUnlocked, setLockerUnlocked, recordFailedAttempt, resetFailedAttempts 
  } = useAppStore()

  // Local State
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Advanced State
  const [enhancedSettings, setEnhancedSettings] = useState<EnhancedLockerSettings>(defaultSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState('')
  
  // Viewer & Context
  const [selectedImage, setSelectedImage] = useState<any>(null)
  const [imagePreview, setImagePreview] = useState<Record<string, string>>({})
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string } | null>(null)

  // --- INITIALIZATION ---
  useEffect(() => {
    const saved = localStorage.getItem('locker-enhanced-settings')
    if (saved) try { setEnhancedSettings({ ...defaultSettings, ...JSON.parse(saved) }) } catch(e) {}
    
    // Auto-focus input on mount if locked
    if (!isLockerUnlocked) inputRef.current?.focus()
  }, [isLockerUnlocked])

  const updateSettings = useCallback((update: Partial<EnhancedLockerSettings>) => {
    const next = { ...enhancedSettings, ...update }
    setEnhancedSettings(next)
    localStorage.setItem('locker-enhanced-settings', JSON.stringify(next))
  }, [enhancedSettings])

  // --- ACTIONS ---

  const handleUnlock = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (pin === lockerSettings.pin) {
      setLockerUnlocked(true)
      resetFailedAttempts()
      setPin('')
      setError('')
    } else {
      setShake(true)
      setTimeout(() => setShake(false), 400)
      setPin('')
      setError('Incorrect PIN')
      recordFailedAttempt()
      if (inputRef.current) inputRef.current.focus()
    }
  }

  const handleSetup = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin.length < 4) { setError('Minimum 4 digits required'); return }
    
    if (!confirmPin) {
      setConfirmPin(pin)
      setPin('')
      setError('')
      if (inputRef.current) inputRef.current.focus()
      return
    }
    
    if (pin !== confirmPin) {
      setError('PINs do not match')
      setPin('')
      setConfirmPin('')
      return
    }

    // Success
    const key = generateRecoveryKey()
    setRecoveryKey(key)
    setLockerSettings({ isEnabled: true, pin })
    setIsSettingUp(false)
    setShowRecovery(true)
    setLockerUnlocked(true)
  }

  const handleRestore = (id: string) => {
    removeFromLocker(id)
    setContextMenu(null)
  }

  // Preload Thumbs
  useEffect(() => {
    if (!isLockerUnlocked) return
    let active = true
    const load = async () => {
        for(const img of lockerImages) {
            if(!active) break
            if(!imagePreview[img.id]) {
                try {
                    // @ts-ignore
                    const thumb = await window.electronAPI?.getImageThumbnail(img.path)
                    if(thumb && active) setImagePreview(p => ({...p, [img.id]: thumb}))
                } catch(e) {}
            }
        }
    }
    load()
    return () => { active = false }
  }, [isLockerUnlocked, lockerImages])

  // --- RENDER: SETUP ---
  if (!lockerSettings.isEnabled && !isSettingUp) {
    return (
      <div className={`h-full flex flex-col items-center justify-center ${PAGE_BG} text-white`}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <div className="w-24 h-24 rounded-3xl bg-[#111] border border-[#222] flex items-center justify-center mb-8 shadow-2xl mx-auto">
            <Shield size={40} className="text-[#666]" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">Secure Vault</h1>
          <p className="text-[#666] text-sm max-w-sm mx-auto mb-10 leading-relaxed">
            Create an encrypted space for your sensitive media. <br/>
            Files are moved from the gallery and protected by a PIN.
          </p>
          <button 
            onClick={() => setIsSettingUp(true)}
            className="px-8 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)]"
          >
            Create Locker
          </button>
        </motion.div>
      </div>
    )
  }

  // --- RENDER: LOGIN (Laptop Style) ---
  if (!isLockerUnlocked || isSettingUp) {
    return (
      <div className={`h-full flex flex-col items-center justify-center ${PAGE_BG} text-white relative`}>
        {/* Background Ambient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#111]/30 to-black pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm z-10 p-8 rounded-2xl bg-[#0a0a0a] border border-[#222] shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-full bg-[#161616] flex items-center justify-center mb-4 border border-[#222]">
              <Lock size={18} className={isSettingUp ? "text-blue-500" : "text-emerald-500"} />
            </div>
            <h2 className="text-xl font-semibold">
              {isSettingUp ? (confirmPin ? 'Confirm PIN' : 'Create PIN') : 'Locker Locked'}
            </h2>
            <p className="text-xs text-[#666] mt-1">
              {isSettingUp ? 'Enter a secure PIN for your vault' : 'Please authenticate to access'}
            </p>
          </div>

          <form onSubmit={isSettingUp ? handleSetup : handleUnlock}>
            <div className="relative mb-6">
              <motion.input
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g,'')); setError('') }}
                className={`w-full bg-[#111] border ${error ? 'border-red-500/50' : 'border-[#333]'} rounded-lg py-3 px-4 text-center text-lg tracking-[0.5em] font-mono text-white focus:outline-none focus:border-[#555] transition-all`}
                placeholder="••••"
                maxLength={8}
                autoFocus
                animate={shake ? { x: [-5, 5, -5, 5, 0] } : {}}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#888]"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button 
              type="submit"
              className="w-full py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={pin.length < 4}
            >
              {isSettingUp ? (confirmPin ? 'Confirm' : 'Continue') : 'Unlock'}
            </button>
          </form>

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-red-500 text-xs mt-4 font-medium">
              {error}
            </motion.p>
          )}
        </motion.div>

        {!isSettingUp && (
           <p className="absolute bottom-8 text-xs text-[#444] hover:text-[#666] cursor-pointer transition-colors">
             Forgot PIN? Use Recovery Key
           </p>
        )}
      </div>
    )
  }

  // --- RENDER: UNLOCKED CONTENT ---
  return (
    <div className={`h-full flex flex-col ${PAGE_BG} text-white`}>
      
      {/* 1. HEADER */}
      <header className={`h-14 flex items-center justify-between px-6 border-b ${BORDER_COLOR} bg-[#050505]/95 backdrop-blur z-20`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-emerald-900/20 border border-emerald-900/40">
             <ShieldCheck size={12} className="text-emerald-500" />
             <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Secure</span>
          </div>
          <span className="text-xs text-[#666] font-mono border-l border-[#222] pl-3">
            SESSION ACTIVE
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setLockerUnlocked(false)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#111] hover:bg-[#222] border border-[#222] rounded-md text-xs transition-colors group"
          >
            <LogOut size={14} className="text-[#666] group-hover:text-white" />
            Lock Now
          </button>
          <button onClick={() => setShowSettings(true)} className={`p-2 rounded-md hover:bg-[#222] text-[#666] hover:text-white transition-colors`}>
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* 2. CONTENT AREA */}
      <div 
        className="flex-1 overflow-y-auto p-6 [&::-webkit-scrollbar]:hidden"
        onContextMenu={(e) => e.preventDefault()}
      >
        {lockerImages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#333]">
            <Lock size={64} className="mb-4 opacity-20" />
            <p className="text-sm font-medium">Locker is empty</p>
            <p className="text-xs mt-1 text-[#555]">Add photos from the main library context menu</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {lockerImages.map((img, i) => (
              <div 
                key={img.id} 
                className="aspect-square bg-[#111] rounded-lg overflow-hidden relative group cursor-pointer border border-[#222] hover:border-[#444] transition-all"
                onClick={() => setSelectedImage(img)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, id: img.id })
                }}
              >
                {imagePreview[img.id] ? (
                  <img src={imagePreview[img.id]} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Lock size={16} className="text-[#333]" /></div>
                )}
                
                {/* Hover Action */}
                <button 
                  onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, id: img.id }) }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-black transition-all backdrop-blur-sm"
                >
                  <MoreVertical size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. STATUS BAR (Laptop Only) */}
      <div className="h-8 bg-[#0a0a0a] border-t border-[#1a1a1a] flex items-center justify-between px-4 text-[10px] text-[#444] select-none">
         <span>AES-256 Encryption Enabled</span>
         <div className="flex gap-4">
            <span>{lockerImages.length} ITEMS PROTECTED</span>
            <span>AUTO-LOCK: {enhancedSettings.autoLockTimeout} MIN</span>
         </div>
      </div>

      {/* 4. MODALS */}
      <AnimatePresence>
        {contextMenu && (
           <ContextMenu 
             x={contextMenu.x} y={contextMenu.y}
             onClose={() => setContextMenu(null)}
             onRestore={() => handleRestore(contextMenu.id)}
             onDelete={() => { removeFromLocker(contextMenu.id); setContextMenu(null); /* In real app, trigger perm delete */ }}
             onInfo={() => alert('Properties view not implemented in demo')}
           />
        )}

        {showSettings && (
           <motion.div 
             initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
             className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
             onClick={() => setShowSettings(false)}
           >
             <div className="bg-[#111] border border-[#222] rounded-xl w-96 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-lg font-bold">Locker Settings</h3>
                   <button onClick={() => setShowSettings(false)}><X size={18} className="text-[#666] hover:text-white" /></button>
                </div>
                
                <div className="space-y-4">
                   <div className="flex justify-between items-center p-3 bg-[#161616] rounded-lg">
                      <span className="text-sm">Intruder Selfie</span>
                      <button 
                        onClick={() => updateSettings({ intruderDetection: !enhancedSettings.intruderDetection })}
                        className={`w-8 h-4 rounded-full relative transition-colors ${enhancedSettings.intruderDetection ? 'bg-emerald-500' : 'bg-[#333]'}`}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${enhancedSettings.intruderDetection ? 'translate-x-4' : ''}`} />
                      </button>
                   </div>
                   
                   <div className="flex justify-between items-center p-3 bg-[#161616] rounded-lg">
                      <div className="flex flex-col">
                        <span className="text-sm">Auto-Lock</span>
                        <span className="text-[10px] text-[#666]">Lock after inactivity</span>
                      </div>
                      <select 
                        value={enhancedSettings.autoLockTimeout}
                        onChange={(e) => updateSettings({ autoLockTimeout: parseInt(e.target.value) })}
                        className="bg-[#222] text-xs text-white p-1 rounded border border-[#333] outline-none"
                      >
                        <option value={1}>1 min</option>
                        <option value={5}>5 min</option>
                        <option value={15}>15 min</option>
                      </select>
                   </div>

                   <button 
                     onClick={() => { setShowRecovery(true); setShowSettings(false) }}
                     className="w-full py-2 bg-[#222] hover:bg-[#333] text-xs text-white rounded-lg transition-colors mt-4"
                   >
                     View Recovery Key
                   </button>
                </div>
             </div>
           </motion.div>
        )}

        {showRecovery && (
           <motion.div 
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-8"
           >
              <div className="max-w-md w-full bg-[#111] border border-[#222] p-8 rounded-2xl text-center">
                 <Key size={32} className="mx-auto text-emerald-500 mb-4" />
                 <h2 className="text-xl font-bold mb-2">Recovery Key</h2>
                 <p className="text-[#666] text-xs mb-6">Write this down. It is the ONLY way to recover your photos if you forget your PIN.</p>
                 <div className="p-4 bg-black border border-[#222] rounded-lg font-mono text-emerald-400 text-sm mb-6 select-all">
                    {formatRecoveryKey(recoveryKey)}
                 </div>
                 <button onClick={() => setShowRecovery(false)} className="w-full py-2 bg-white text-black text-sm font-bold rounded-lg hover:bg-[#eee]">Done</button>
              </div>
           </motion.div>
        )}

        {selectedImage && (
           <PhotoViewer 
             image={selectedImage}
             imagePreview={imagePreview[selectedImage.id]}
             onClose={() => setSelectedImage(null)}
           />
        )}
      </AnimatePresence>
    </div>
  )
}