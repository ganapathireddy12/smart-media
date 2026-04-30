import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/appStore'
import {
  Settings, Palette, Shield, Bell, Zap, Database, 
  RotateCcw, Folder, Check, Monitor, Moon, Sun, 
  AlertTriangle, Save
} from 'lucide-react'

// --- CONSTANTS ---
const PAGE_BG = "bg-[#050505]"
const SIDEBAR_BG = "bg-[#0a0a0a]"
const BORDER_COLOR = "border-[#1a1a1a]"
const ACCENT_COLOR = "text-blue-500"

const CATEGORIES = [
  { id: 'general', label: 'General', icon: Settings, desc: 'Profile & Storage' },
  { id: 'appearance', label: 'Appearance', icon: Palette, desc: 'Theme & Display' },
  { id: 'privacy', label: 'Privacy', icon: Shield, desc: 'Security & Data' },
  { id: 'system', label: 'System', icon: Database, desc: 'Reset & Advanced' },
]

// --- COMPONENTS ---

const Toggle = ({ checked, onChange }: { checked: boolean, onChange: () => void }) => (
  <button 
    onClick={onChange}
    className={`w-10 h-5 rounded-full relative transition-colors ${checked ? 'bg-blue-600' : 'bg-[#333]'}`}
  >
    <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
  </button>
)

const Section = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="mb-8">
    <h3 className="text-xs font-bold text-[#666] uppercase tracking-wider mb-4">{title}</h3>
    <div className="space-y-4">
      {children}
    </div>
  </div>
)

const SettingRow = ({ label, desc, action }: { label: string, desc?: string, action: React.ReactNode }) => (
  <div className="flex items-center justify-between p-4 bg-[#111] border border-[#222] rounded-xl">
    <div>
      <p className="text-sm font-medium text-white">{label}</p>
      {desc && <p className="text-xs text-[#666] mt-0.5">{desc}</p>}
    </div>
    {action}
  </div>
)

export default function SettingsScreen() {
  const { userName, resetApp } = useAppStore()
  
  // State
  const [activeTab, setActiveTab] = useState('general')
  const [theme, setTheme] = useState('dark')
  const [notifications, setNotifications] = useState(true)
  const [analytics, setAnalytics] = useState(false)
  const [showToast, setShowToast] = useState(false)
  
  // Reset Logic
  const [confirmReset, setConfirmReset] = useState(false)

  const handleSave = () => {
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }

  const handleReset = async () => {
      // Reset faces database
      // @ts-ignore
      await window.electronAPI?.resetFaces?.()
      // Reset app data
      // @ts-ignore
      await window.electronAPI?.factoryReset?.()
      resetApp()
      window.location.reload()
  }

  // --- RENDER CONTENT ---

  const renderContent = () => {
    switch(activeTab) {
      case 'general':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Section title="Profile">
               <div className="p-4 bg-[#111] border border-[#222] rounded-xl flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-xl font-bold text-white">
                    {userName ? userName[0].toUpperCase() : 'U'}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{userName || 'User'}</h3>
                    <p className="text-xs text-[#666]">Local Account</p>
                  </div>
               </div>
            </Section>

            <Section title="Storage">
               <SettingRow 
                 label="Library Location" 
                 desc="C:/Users/SmartMedia/Library"
                 action={<button className="text-xs text-blue-400 hover:text-blue-300">Change</button>} 
               />
               <SettingRow 
                 label="Clear Cache" 
                 desc="Free up 1.2 GB of temporary files"
                 action={<button className="px-3 py-1.5 bg-[#222] hover:bg-[#333] rounded text-xs text-white transition-colors">Clear</button>} 
               />
            </Section>
          </motion.div>
        )
      
      case 'appearance':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
             <Section title="Theme">
                <div className="grid grid-cols-3 gap-3">
                   {['Dark', 'Light', 'System'].map(t => (
                     <button 
                       key={t}
                       onClick={() => setTheme(t.toLowerCase())}
                       className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${theme === t.toLowerCase() ? 'bg-blue-500/10 border-blue-500 text-blue-400' : 'bg-[#111] border-[#222] text-[#666] hover:border-[#444] hover:text-white'}`}
                     >
                        {t === 'Dark' && <Moon size={20} />}
                        {t === 'Light' && <Sun size={20} />}
                        {t === 'System' && <Monitor size={20} />}
                        <span className="text-xs font-medium">{t}</span>
                     </button>
                   ))}
                </div>
             </Section>
             
             <Section title="Interface">
                <SettingRow 
                  label="Compact Mode" 
                  desc="Reduce spacing in lists and grids"
                  action={<Toggle checked={false} onChange={() => {}} />} 
                />
                <SettingRow 
                  label="Animations" 
                  desc="Enable smooth transitions"
                  action={<Toggle checked={true} onChange={() => {}} />} 
                />
             </Section>
          </motion.div>
        )

      case 'privacy':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
             <Section title="Permissions">
                <SettingRow 
                  label="Face Recognition" 
                  desc="Process photos to identify people locally"
                  action={<Toggle checked={true} onChange={() => {}} />} 
                />
                <SettingRow 
                  label="Location Services" 
                  desc="Show photos on map"
                  action={<Toggle checked={true} onChange={() => {}} />} 
                />
             </Section>
             
             <Section title="Data">
                <SettingRow 
                  label="Analytics" 
                  desc="Share anonymous usage data"
                  action={<Toggle checked={analytics} onChange={() => setAnalytics(!analytics)} />} 
                />
             </Section>
          </motion.div>
        )

      case 'system':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
             <Section title="Danger Zone">
                {!confirmReset ? (
                  <button 
                    onClick={() => setConfirmReset(true)}
                    className="w-full p-4 border border-red-500/20 bg-red-500/10 rounded-xl flex items-center justify-center text-red-500 text-sm font-medium hover:bg-red-500/20 transition-colors gap-2"
                  >
                    <RotateCcw size={16} /> Factory Reset App
                  </button>
                ) : (
                  <div className="p-4 border border-red-500 rounded-xl bg-red-900/10 text-center">
                     <AlertTriangle size={24} className="mx-auto text-red-500 mb-2" />
                     <p className="text-sm text-red-200 font-medium mb-1">Are you sure?</p>
                     <p className="text-xs text-red-400/80 mb-4">This will delete all data and settings.</p>
                     <div className="flex gap-2">
                        <button onClick={() => setConfirmReset(false)} className="flex-1 py-2 bg-[#222] rounded text-xs text-white hover:bg-[#333]">Cancel</button>
                        <button onClick={handleReset} className="flex-1 py-2 bg-red-600 rounded text-xs text-white hover:bg-red-700">Yes, Reset</button>
                     </div>
                  </div>
                )}
             </Section>
             
             <div className="mt-8 text-center">
                <p className="text-xs text-[#444]">SmartMedia v2.0.0 (Build 4082)</p>
             </div>
          </motion.div>
        )
    }
  }

  return (
    <div className={`h-full flex ${PAGE_BG} text-white overflow-hidden`}>
      
      {/* 1. SIDEBAR */}
      <div className={`w-64 flex flex-col border-r ${BORDER_COLOR} ${SIDEBAR_BG}`}>
         <div className="h-16 flex items-center px-6 border-b border-[#1a1a1a]">
            <h1 className="text-lg font-bold">Settings</h1>
         </div>
         
         <div className="flex-1 p-3 space-y-1">
            {CATEGORIES.map(cat => (
               <button
                 key={cat.id}
                 onClick={() => setActiveTab(cat.id)}
                 className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left group ${activeTab === cat.id ? 'bg-blue-600/10 text-blue-400' : 'text-[#888] hover:bg-[#1a1a1a] hover:text-white'}`}
               >
                  <cat.icon size={18} className={activeTab === cat.id ? 'text-blue-400' : 'text-[#666] group-hover:text-white'} />
                  <div>
                     <p className="text-sm font-medium">{cat.label}</p>
                     <p className="text-[10px] opacity-60 font-normal">{cat.desc}</p>
                  </div>
               </button>
            ))}
         </div>

         <div className="p-4 border-t border-[#1a1a1a]">
            <button onClick={handleSave} className="w-full py-2 bg-white text-black font-bold rounded-lg text-sm hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
               <Save size={14} /> Save Changes
            </button>
         </div>
      </div>

      {/* 2. CONTENT */}
      <div className="flex-1 overflow-y-auto">
         <div className="max-w-2xl mx-auto p-10">
            <div className="mb-8">
               <h2 className="text-2xl font-bold mb-1">{CATEGORIES.find(c => c.id === activeTab)?.label}</h2>
               <p className="text-[#666] text-sm">Manage your {CATEGORIES.find(c => c.id === activeTab)?.desc.toLowerCase()}</p>
            </div>
            
            {renderContent()}
         </div>
      </div>

      {/* 3. TOAST */}
      <AnimatePresence>
         {showToast && (
            <motion.div 
              initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
              className="fixed bottom-8 right-8 bg-[#222] border border-[#333] text-white px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2 z-50"
            >
               <Check size={16} className="text-green-500" />
               <span className="text-sm font-medium">Settings saved</span>
            </motion.div>
         )}
      </AnimatePresence>

    </div>
  )
}