import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAppStore, ImageMetadata } from '../store/appStore'
import { X, Image as ImageIcon, FileImage, File } from 'lucide-react'

const PAGE_BG = "bg-[#050505]"
const BORDER_COLOR = "border-[#1a1a1a]"

interface FileTypeGroup {
  type: string
  label: string
  images: ImageMetadata[]
  color: string
  icon: any
}

export default function FileTypesPage() {
  const { images, setCurrentScreen } = useAppStore()
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<Record<string, string>>({})

  // Group images by file type
  const fileTypeGroups = useMemo(() => {
    const groups: Record<string, ImageMetadata[]> = {}
    
    images.filter(img => !img.isDeleted).forEach(img => {
      const fileType = img.fileType || 'general'
      if (!groups[fileType]) groups[fileType] = []
      groups[fileType].push(img)
    })

    const typeConfig: Record<string, { label: string, color: string, icon: any }> = {
      screenshot: { label: 'Screenshots', color: 'from-blue-500 to-cyan-500', icon: FileImage },
      document: { label: 'Documents', color: 'from-purple-500 to-pink-500', icon: File },
      meme: { label: 'Memes', color: 'from-yellow-500 to-orange-500', icon: ImageIcon },
      general: { label: 'Photos', color: 'from-green-500 to-emerald-500', icon: ImageIcon },
    }

    return Object.entries(groups).map(([type, imgs]) => ({
      type,
      label: typeConfig[type]?.label || type,
      images: imgs,
      color: typeConfig[type]?.color || 'from-gray-500 to-gray-700',
      icon: typeConfig[type]?.icon || ImageIcon
    })).sort((a, b) => b.images.length - a.images.length)
  }, [images])

  // Load thumbnails for selected type
  useEffect(() => {
    if (!selectedType) return
    
    const group = fileTypeGroups.find(g => g.type === selectedType)
    if (!group) return

    let active = true
    const loadPreviews = async () => {
      const targets = group.images.slice(0, 100).filter(i => !imagePreview[i.id])
      
      for (const img of targets) {
        if (!active) break
        try {
          // @ts-ignore
          const thumb = await window.electronAPI?.getImageThumbnail(img.path)
          if (thumb && active) {
            setImagePreview(prev => ({ ...prev, [img.id]: thumb }))
          }
        } catch (e) {}
      }
    }

    loadPreviews()
    return () => { active = false }
  }, [selectedType, fileTypeGroups])

  return (
    <div className={`h-full flex flex-col ${PAGE_BG} text-white`}>
      {/* Header */}
      <header className={`h-14 shrink-0 flex items-center justify-between px-6 border-b ${BORDER_COLOR}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500">
            <FileImage size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">File Types</h1>
            <p className="text-[10px] text-[#666] font-mono">ORGANIZED BY TYPE</p>
          </div>
        </div>
        <button onClick={() => setCurrentScreen('home')} className="p-2 hover:bg-[#222] rounded-lg text-[#666] hover:text-white transition-colors">
          <X size={20} />
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {fileTypeGroups.map(group => (
            <motion.button
              key={group.type}
              onClick={() => setSelectedType(group.type)}
              whileHover={{ scale: 1.02 }}
              className={`relative p-6 rounded-xl border ${BORDER_COLOR} bg-[#0a0a0a] hover:bg-[#111] transition-all text-left group overflow-hidden`}
            >
              {/* Gradient background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${group.color} opacity-10 group-hover:opacity-20 transition-opacity`} />
              
              {/* Content */}
              <div className="relative z-10">
                <group.icon size={32} className="mb-3 text-white/80" />
                <h3 className="text-lg font-bold mb-1">{group.label}</h3>
                <p className="text-sm text-[#666]">{group.images.length} items</p>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Selected Type Gallery */}
        {selectedType && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                {fileTypeGroups.find(g => g.type === selectedType)?.label}
              </h2>
              <button
                onClick={() => setSelectedType(null)}
                className="text-sm text-[#666] hover:text-white"
              >
                Close
              </button>
            </div>
            
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {fileTypeGroups.find(g => g.type === selectedType)?.images.slice(0, 100).map(img => (
                <div key={img.id} className="aspect-square bg-[#111] rounded overflow-hidden">
                  {imagePreview[img.id] ? (
                    <img src={imagePreview[img.id]} className="w-full h-full object-cover" alt={img.filename} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={16} className="text-[#444]" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
