import { useMemo, memo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../store/appStore'
import {
  Home, Heart, FolderPlus, Users, Lock, FolderSearch, Settings,
  Trash2, Smile, Calendar, Copy, Map as MapIcon,
  Layers, Wrench, Film, Crown
} from 'lucide-react'

const C = {
  bg: '#050505',
  border: '#161618',
  active: '#141416',
  hover: '#0f0f11',
} as const

const NavItem = memo(({
  icon: Icon, label, active, onClick, count, sidebarOpen,
}: {
  icon: any; label: string; active?: boolean; onClick: () => void
  count?: number; sidebarOpen: boolean
}) => (
  <button
    onClick={onClick}
    title={!sidebarOpen ? label : undefined}
    className={`
      relative flex items-center w-full rounded-md transition-all duration-150 group
      ${sidebarOpen ? 'h-[33px] px-2.5 gap-2.5' : 'h-[33px] justify-center'}
      ${active
        ? 'bg-[#141416] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]'
        : 'hover:bg-[#0f0f11]'
      }
    `}
  >
    {active && (
      <motion.div
        layoutId="sidebar-indicator"
        className="absolute left-[-1px] w-[2px] h-3.5 rounded-full bg-white"
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      />
    )}

    <div className={`flex items-center justify-center w-4 h-4 shrink-0 transition-colors duration-150
      ${active ? 'text-white' : 'text-[#555] group-hover:text-[#999]'}`}>
      <Icon size={15} strokeWidth={active ? 2.2 : 1.7} />
    </div>

    {sidebarOpen && (
      <div className="flex items-center flex-1 min-w-0 overflow-hidden">
        <span className={`text-[13px] truncate leading-none
          ${active ? 'text-white font-medium' : 'text-[#777] group-hover:text-[#bbb]'}`}>
          {label}
        </span>
        {count !== undefined && count > 0 && (
          <span className={`ml-auto text-[11px] font-mono tabular-nums ${active ? 'text-[#555]' : 'text-[#333]'}`}>
            {count}
          </span>
        )}
      </div>
    )}

    {!sidebarOpen && count !== undefined && count > 0 && (
      <div className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-[#555]" />
    )}
  </button>
))

const Section = memo(({ label, show }: { label: string; show: boolean }) => {
  if (!show) return <div className="h-4" />
  return (
    <div className="mt-6 mb-1.5 pl-2.5 flex items-center h-4">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2e2e30] select-none">{label}</span>
    </div>
  )
})

export default function Sidebar({ currentPage }: { currentPage: string }) {
  const {
    sidebarOpen, setSidebarOpen, setCurrentScreen,
    albums, images, lockerImages
  } = useAppStore(state => ({
    sidebarOpen: state.sidebarOpen,
    setSidebarOpen: state.setSidebarOpen,
    setCurrentScreen: state.setCurrentScreen,
    albums: state.albums,
    images: state.images,
    lockerImages: state.lockerImages,
  }))

  const counts = useMemo(() => ({
    favorites: images.filter(i => i.isFavorite).length,
    trash: images.filter(i => i.isDeleted).length,
    locker: lockerImages.length,
    albums: albums.length,
  }), [images, lockerImages, albums])

  const go = useCallback((s: string) => () => setCurrentScreen(s), [setCurrentScreen])

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarOpen ? 220 : 52 }}
      transition={{ type: 'spring', stiffness: 450, damping: 38 }}
      className="flex flex-col h-full z-50 select-none relative will-change-[width] overflow-hidden shrink-0"
      style={{ background: C.bg, borderRight: `1px solid ${C.border}` }}
    >
      {/* ━━━ HEADER ━━━ */}
      <div
        className={`h-[52px] flex items-center shrink-0 border-b ${sidebarOpen ? 'px-3 justify-between' : 'justify-center'}`}
        style={{ borderColor: C.border }}
      >
        {sidebarOpen ? (
          <>
            <div
              className="flex items-center gap-2.5 overflow-hidden cursor-pointer"
              onClick={() => setCurrentScreen('home')}
            >
              {/* ── Crown Circle Logo ── */}
              <div className="w-[30px] h-[30px] rounded-full bg-white flex items-center justify-center shrink-0
                shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_8px_rgba(255,255,255,0.04)]">
                <Crown size={13} className="text-black" strokeWidth={2.5} />
              </div>
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.12 }}
                className="font-bold text-[14px] text-white tracking-tight whitespace-nowrap"
              >
                SmartMedia
              </motion.span>
            </div>

            <button
              onClick={() => setSidebarOpen(false)}
              className="text-[11px] text-[#333] hover:text-white font-mono transition-colors px-1.5 py-0.5 rounded hover:bg-[#141416]"
              title="Collapse"
            >
              ←
            </button>
          </>
        ) : (
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-[30px] h-[30px] rounded-full bg-white flex items-center justify-center shrink-0
              hover:opacity-80 transition-opacity
              shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_8px_rgba(255,255,255,0.04)]"
            title="Expand"
          >
            <Crown size={13} className="text-black" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ━━━ NAV ━━━ */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2 space-y-0.5" style={{ scrollbarWidth: 'none' }}>
        <NavItem icon={Home} label="Library" active={currentPage === 'home'} onClick={go('home')} sidebarOpen={sidebarOpen} />
        <NavItem icon={Heart} label="Favorites" active={currentPage === 'favorites'} onClick={go('favorites')} count={counts.favorites} sidebarOpen={sidebarOpen} />
        <NavItem icon={FolderPlus} label="Albums" active={currentPage === 'albums'} onClick={go('albums')} count={counts.albums} sidebarOpen={sidebarOpen} />

        <Section label="Discovery" show={sidebarOpen} />
        <NavItem icon={Film} label="Stories" active={currentPage === 'stories'} onClick={go('stories')} sidebarOpen={sidebarOpen} />
        <NavItem icon={Users} label="People" active={currentPage === 'faces'} onClick={go('faces')} sidebarOpen={sidebarOpen} />
        <NavItem icon={Smile} label="Emotions" active={currentPage === 'emotions'} onClick={go('emotions')} sidebarOpen={sidebarOpen} />
        <NavItem icon={MapIcon} label="Locations" active={currentPage === 'map'} onClick={go('map')} sidebarOpen={sidebarOpen} />
        <NavItem icon={Calendar} label="Timeline" active={currentPage === 'timeline'} onClick={go('timeline')} sidebarOpen={sidebarOpen} />
        <NavItem icon={Copy} label="Duplicates" active={currentPage === 'duplicates'} onClick={go('duplicates')} sidebarOpen={sidebarOpen} />
        <NavItem icon={Layers} label="Collage" active={currentPage === 'collage'} onClick={go('collage')} sidebarOpen={sidebarOpen} />

        <Section label="Utility" show={sidebarOpen} />
        <NavItem icon={Wrench} label="Tools" active={currentPage === 'tools'} onClick={go('tools')} sidebarOpen={sidebarOpen} />
        <NavItem icon={Lock} label="Locker" active={currentPage === 'locker'} onClick={go('locker')} count={counts.locker} sidebarOpen={sidebarOpen} />
        <NavItem icon={FolderSearch} label="Sources" active={currentPage === 'folderSelection'} onClick={go('folderSelection')} sidebarOpen={sidebarOpen} />
      </div>

      {/* ━━━ FOOTER ━━━ */}
      <div className="shrink-0 border-t px-1.5 pb-2 pt-1.5" style={{ borderColor: C.border, background: C.bg }}>
        <NavItem icon={Trash2} label="Recycle Bin" active={currentPage === 'trash'} onClick={go('trash')} count={counts.trash} sidebarOpen={sidebarOpen} />
        <div className="h-1" />
        <NavItem icon={Settings} label="Settings" active={currentPage === 'settings'} onClick={go('settings')} sidebarOpen={sidebarOpen} />
      </div>
    </motion.aside>
  )
}
