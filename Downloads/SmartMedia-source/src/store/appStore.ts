import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Screen = 'splash' | 'name' | 'modelDownload' | 'folderSelection' | 'scanning' | 'home' | 'settings' | 'faces' | 'favorites' | 'albums' | 'album-detail' | 'albumDetail' | 'trash' | 'locker' | 'emotions' | 'fileTypes' | 'tools' | 'timeline' | 'duplicates' | 'map' | 'stories' | 'collage'

export interface AIModel {
  id: string
  name: string
  size: string
  sizeBytes: number
  description: string
  downloaded: boolean
  downloading: boolean
  progress: number
}

export interface EXIFMetadata {
  gps?: {
    lat: number;
    lon: number;
    latitude: number;
    longitude: number;
  };
  date_taken?: string;
  DateTimeOriginal?: string;
  location_name?: string;
  city?: string;
  country?: string;
  state?: string;
  Make?: string;
  Model?: string;
  LensModel?: string;
  ISOSpeedRatings?: string;
  FNumber?: string;
  ExposureTime?: string;
  FocalLength?: string;
  Flash?: string;
  WhiteBalance?: string;
  Orientation?: string;
  width?: number;
  height?: number;
  album_category?: string;  // AI-detected album category
  pages?: number;  // Number of pages for documents
  extracted_text?: string;  // Extracted text from documents
  [key: string]: any;  // Allow additional dynamic properties
}

export interface ImageMetadata {
  id: string
  path: string
  filename: string
  thumbnail?: string
  tags: string[]
  caption?: string

  detailedCaption?: {
    main: string
    scene: string
    details: string
    full?: string
  }
  objects: string[]
  faces: number

  scene?: string
  emotion?: string
  fileType?: string
  mediaType?: 'image' | 'video' | 'audio'  // Media type: image, video, or audio
  duration?: number  // Duration in seconds for video/audio files
  size?: number  // File size in bytes
  imageHash?: string  // MD5 hash of image content for duplicate detection
  // NEW: Comprehensive AI extracted data
  extractedText?: string | null
  animals?: string | null
  peopleDetails?: string | null
  activities?: string | null
  colors?: string | null
  additionalDetails?: string | null
  // EXIF metadata with proper typing
  metadata?: EXIFMetadata
  date_taken?: string
  location?: {
    gps?: {
      lat: number;
      lon: number;
    };
    name?: string;
    city?: string;
    country?: string;
    state?: string;
  };
  camera?: {
    make?: string;
    model?: string;
    lens?: string;
  };
  // NEW: Microdetails and technical analysis
  microdetails?: string | null
  lighting_analysis?: string | null
  materials?: string | null
  technical_aspects?: string | null
  industrial_elements?: string | null
  quality_indicators?: string | null
  dateScanned: string
  dateModified: string
  width?: number
  height?: number
  isFavorite?: boolean
  albumIds?: string[]
  isInLocker?: boolean
  isDeleted?: boolean
  deletedAt?: string
  trashPath?: string  // Original path of deleted image (file not moved)
  shareHistory?: { sharedAt: string; method: string }[]
  // Edit state for photo viewer adjustments
  brightness?: number
  contrast?: number
  saturation?: number
  sharpness?: number
  blur?: number
  rotate?: number
  flipX?: boolean
  flipY?: boolean
}

export interface Album {
  id: string
  name: string
  description?: string
  coverImageId?: string
  imageIds: string[]
  createdAt: string
  updatedAt: string
  isSmartAlbum?: boolean
  smartCriteria?: {
    tags?: string[]
    dateRange?: { start: string; end: string }
    location?: string
    fileType?: string
  }
  icon?: any
  color?: string
}

export interface LockerSettings {
  isEnabled: boolean
  pin?: string
  useBiometric: boolean
  failedAttempts: number
  lockedUntil?: string
  lockoutMinutes: number
  maxAttempts: number
  alertOnFailedAttempts: boolean
}

export interface ScanProgress {
  total: number
  current: number
  currentImage: string
  status: 'idle' | 'discovering' | 'scanning' | 'completed' | 'paused'
  detectedObjects: string[]
  generatedCaption: string
  detectedFaces?: number
  skipped?: boolean
}

interface AppState {
  // Navigation
  currentScreen: Screen
  setCurrentScreen: (screen: Screen) => void

  // User
  userName: string
  setUserName: (name: string) => void
  isFirstLaunch: boolean
  setIsFirstLaunch: (value: boolean) => void

  // Models
  models: AIModel[]
  setModelProgress: (modelId: string, progress: number) => void
  setModelDownloaded: (modelId: string) => void
  setModelDownloading: (modelId: string, downloading: boolean) => void
  allModelsDownloaded: () => boolean

  // Folder & Images
  selectedFolder: string | null
  setSelectedFolder: (folder: string | null) => void
  discoveredImages: string[]
  setDiscoveredImages: (images: string[]) => void

  // Scanning
  scanProgress: ScanProgress
  setScanProgress: (progress: Partial<ScanProgress>) => void
  skipCurrentImage: () => void
  scanMode: 'foreground' | 'background'
  setScanMode: (mode: 'foreground' | 'background') => void

  // Gallery
  images: ImageMetadata[]
  addImage: (image: ImageMetadata) => void
  addImages: (images: ImageMetadata[]) => void
  setImages: (images: ImageMetadata[]) => void
  updateImage: (id: string, updates: Partial<ImageMetadata>) => void
  clearImages: () => void
  saveImageAsOriginal: (id: string, edits: any) => void
  saveImageAsCopy: (id: string, edits: any) => ImageMetadata

  // Favorites
  toggleFavorite: (imageId: string) => Promise<void>
  getFavorites: () => ImageMetadata[]

  // Albums
  albums: Album[]
  addAlbum: (album: Album) => void
  updateAlbum: (id: string, updates: Partial<Album>) => void
  deleteAlbum: (id: string) => void
  addImageToAlbum: (imageId: string, albumId: string) => void
  removeImageFromAlbum: (imageId: string, albumId: string) => void
  selectedAlbumId: string | null
  setSelectedAlbumId: (id: string | null) => void
  autoCategorizImages: (images: ImageMetadata[]) => void

  // Trash
  trashedImages: ImageMetadata[]
  moveToTrash: (imageId: string) => Promise<void>
  restoreFromTrash: (imageId: string) => Promise<void>
  permanentlyDelete: (imageId: string) => void
  emptyTrash: () => void
  deleteAttempts: { [imageId: string]: number }
  incrementDeleteAttempt: (imageId: string) => void
  resetDeleteAttempts: (imageId: string) => void

  // Private Locker
  lockerSettings: LockerSettings
  setLockerSettings: (settings: Partial<LockerSettings>) => void
  lockerImages: ImageMetadata[]
  moveToLocker: (imageId: string) => void
  removeFromLocker: (imageId: string) => void
  isLockerUnlocked: boolean
  setLockerUnlocked: (unlocked: boolean) => void
  recordFailedAttempt: () => void
  resetFailedAttempts: () => void

  // Filters
  searchQuery: string
  setSearchQuery: (query: string) => void
  selectedTags: string[]
  setSelectedTags: (tags: string[]) => void

  // UI State
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  aiModeActive: boolean
  setAiModeActive: (active: boolean) => void
  showAiChatbot: boolean
  setShowAiChatbot: (show: boolean) => void

  // NEW PHASE 4 FEATURES
  // Recently Viewed
  recentlyViewed: string[]
  addToRecentlyViewed: (imageId: string) => void
  clearRecentlyViewed: () => void

  // Photo Ratings (1-5 stars)
  photoRatings: { [imageId: string]: number }
  setPhotoRating: (imageId: string, rating: number) => void

  // Date Range Filter
  dateFilter: { startDate: string | null; endDate: string | null }
  setDateFilter: (filter: { startDate: string | null; endDate: string | null }) => void

  // Slideshow Mode
  slideshowActive: boolean
  slideshowInterval: number // in seconds
  setSlideshowActive: (active: boolean) => void
  setSlideshowInterval: (interval: number) => void

  // Duplicate Detection
  duplicateGroups: string[][]
  setDuplicateGroups: (groups: string[][]) => void

  // Keyboard Shortcuts enabled
  keyboardShortcutsEnabled: boolean
  setKeyboardShortcutsEnabled: (enabled: boolean) => void

  // Reset
  resetApp: () => void
}

const initialModels: AIModel[] = [
  {
    id: 'qwen2-vl',
    name: 'Qwen2-VL 2B',
    size: '~4 GB',
    sizeBytes: 4 * 1024 * 1024 * 1024,
    description: 'All-in-one Vision AI: Captions, Objects, Scenes, Faces',
    downloaded: false,
    downloading: false,
    progress: 0,
  },
]

const initialLockerSettings: LockerSettings = {
  isEnabled: false,
  useBiometric: false,
  failedAttempts: 0,
  lockoutMinutes: 5,
  maxAttempts: 5,
  alertOnFailedAttempts: true,
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Navigation
      currentScreen: 'splash',
      setCurrentScreen: (screen) => set({ currentScreen: screen }),

      // User
      userName: '',
      setUserName: (name) => set({ userName: name }),
      isFirstLaunch: true,
      setIsFirstLaunch: (value) => set({ isFirstLaunch: value }),

      // Models
      models: initialModels,
      setModelProgress: (modelId, progress) => set((state) => ({
        models: state.models.map((m) =>
          m.id === modelId ? { ...m, progress } : m
        ),
      })),
      setModelDownloaded: (modelId) => set((state) => ({
        models: state.models.map((m) =>
          m.id === modelId ? { ...m, downloaded: true, downloading: false, progress: 100 } : m
        ),
      })),
      setModelDownloading: (modelId, downloading) => set((state) => ({
        models: state.models.map((m) =>
          m.id === modelId ? { ...m, downloading } : m
        ),
      })),
      allModelsDownloaded: () => get().models.every((m) => m.downloaded),

      // Folder & Images
      selectedFolder: null,
      setSelectedFolder: (folder) => set({ selectedFolder: folder }),
      discoveredImages: [],
      setDiscoveredImages: (images) => set({ discoveredImages: images }),

      // Scanning
      scanProgress: {
        total: 0,
        current: 0,
        currentImage: '',
        status: 'idle',
        detectedObjects: [],
        generatedCaption: '',
      },
      setScanProgress: (progress) => set((state) => ({
        scanProgress: { ...state.scanProgress, ...progress },
      })),
      skipCurrentImage: () => set((state) => ({
        scanProgress: {
          ...state.scanProgress,
          current: state.scanProgress.current + 1,
          currentImage: 'Skipped',
          detectedObjects: [],
          generatedCaption: 'Image skipped by user',
          skipped: true
        },
      })),
      scanMode: 'foreground',
      setScanMode: (mode) => set({ scanMode: mode }),

      // Gallery
      images: [],
      addImage: (image) => set((state) => ({
        images: [...state.images, image],
      })),
      addImages: (newImages) => set((state) => {
        // Filter out duplicates based on path (case-insensitive for Windows robustness)
        const existingPaths = new Set(state.images.map(img => img.path.toLowerCase()))
        const uniqueNewImages = newImages.filter(img => !existingPaths.has(img.path.toLowerCase()))

        if (uniqueNewImages.length === 0) return { images: state.images }

        return {
          images: [...state.images, ...uniqueNewImages],
        }
      }),
      setImages: (images) => set({ images }),
      updateImage: (id, updates) => set((state) => ({
        images: state.images.map((img) =>
          img.id === id ? { ...img, ...updates } : img
        ),
      })),
      clearImages: () => set({ images: [] }),
      saveImageAsOriginal: (id, edits) => set((state) => ({
        images: state.images.map((img) =>
          img.id === id ? { ...img, ...edits, dateModified: new Date().toISOString() } : img
        ),
      })),
      saveImageAsCopy: (id, edits) => {
        const state = get()
        const originalImage = state.images.find(img => img.id === id)
        if (!originalImage) throw new Error("Image not found")

        const newImage: ImageMetadata = {
          ...originalImage,
          ...edits,
          id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          filename: `${originalImage.filename.replace(/\.(\w+)$/, '_edited.$1')}`,
          dateScanned: new Date().toISOString(),
          dateModified: new Date().toISOString(),
        }

        set((state) => ({
          images: [...state.images, newImage],
        }))

        return newImage
      },

      // Favorites
      toggleFavorite: async (imageId) => {
        const currentImage = get().images.find(img => img.id === imageId)
        const newFavoriteStatus = !currentImage?.isFavorite
        
        // Update in store immediately for UI responsiveness
        set((state) => ({
          images: state.images.map((img) =>
            img.id === imageId ? { ...img, isFavorite: newFavoriteStatus } : img
          ),
        }))
        
        // Persist to database
        try {
          // @ts-ignore
          await window.electronAPI?.updateImageFavorite(imageId, newFavoriteStatus)
        } catch (error) {
          console.error('Failed to update favorite in database:', error)
        }
      },
      getFavorites: () => get().images.filter((img) => img.isFavorite && !img.isDeleted && !img.isInLocker),

      // Albums
      albums: [],
      addAlbum: (album) => set((state) => ({
        albums: [...state.albums, album],
      })),
      updateAlbum: (id, updates) => set((state) => ({
        albums: state.albums.map((a) =>
          a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
        ),
      })),
      deleteAlbum: (id) => set((state) => ({
        albums: state.albums.filter((a) => a.id !== id),
        images: state.images.map((img) => ({
          ...img,
          albumIds: img.albumIds?.filter((aid) => aid !== id),
        })),
      })),
      addImageToAlbum: (imageId, albumId) => set((state) => ({
        albums: state.albums.map((a) =>
          a.id === albumId && !a.imageIds.includes(imageId)
            ? { ...a, imageIds: [...a.imageIds, imageId], updatedAt: new Date().toISOString() }
            : a
        ),
        images: state.images.map((img) =>
          img.id === imageId && !img.albumIds?.includes(albumId)
            ? { ...img, albumIds: [...(img.albumIds || []), albumId] }
            : img
        ),
      })),
      removeImageFromAlbum: (imageId, albumId) => set((state) => ({
        albums: state.albums.map((a) =>
          a.id === albumId
            ? { ...a, imageIds: a.imageIds.filter((id) => id !== imageId), updatedAt: new Date().toISOString() }
            : a
        ),
        images: state.images.map((img) =>
          img.id === imageId
            ? { ...img, albumIds: img.albumIds?.filter((id) => id !== albumId) }
            : img
        ),
      })),
      selectedAlbumId: null,
      setSelectedAlbumId: (id) => set({ selectedAlbumId: id }),

      autoCategorizImages: (newImages) => set((state) => {
        // Only process images that have AI tags or descriptions
        const aiProcessedImages = newImages.filter(img =>
          img.tags.length > 0 || img.objects.length > 0 || (img.caption || '') !== img.filename || img.metadata?.album_category
        )

        if (aiProcessedImages.length === 0) return state

        // Keyword map for fallback categorization
        const categoryKeywords: { [key: string]: string[] } = {
          'Documents': ['document', 'text', 'paper', 'receipt', 'screenshot', 'form', 'certificate', 'letter'],
          'Selfies': ['selfie', 'self-portrait', 'mirror', 'front camera'],
          'Events': ['event', 'party', 'celebration', 'wedding', 'birthday', 'festival', 'ceremony', 'gathering'],
          'Locations': ['landscape', 'outdoor', 'travel', 'landmark', 'mountain', 'beach', 'city', 'nature', 'scenery'],
          'Others': []
        }

        const updatedAlbums = [...state.albums]
        const newAlbumImages: { [albumName: string]: string[] } = {}

        // Categorize each AI-processed image
        aiProcessedImages.forEach(img => {
          // PRIORITY 1: Use AI-assigned album_category from metadata
          let category = img.metadata?.album_category

          // PRIORITY 2: Fallback to keyword matching if no AI category
          if (!category || category === 'Others') {
            const allTokens = [...img.tags, ...img.objects, (img.caption || '').toLowerCase(), img.scene || '']
            const tokens = allTokens.join(' ').toLowerCase()

            for (const [catName, keywords] of Object.entries(categoryKeywords)) {
              if (catName === 'Others') continue
              if (keywords.some(keyword => tokens.includes(keyword))) {
                category = catName
                break
              }
            }
          }

          // Default to 'Others' if still no category
          category = category || 'Others'

          if (!newAlbumImages[category]) {
            newAlbumImages[category] = []
          }
          newAlbumImages[category].push(img.id)
        })

        // Create or update albums
        Object.entries(newAlbumImages).forEach(([category, imageIds]) => {
          const existingAlbum = updatedAlbums.find(a => a.name === category)

          if (existingAlbum) {
            // Add images to existing album
            const uniqueImageIds = [...new Set([...existingAlbum.imageIds, ...imageIds])]
            const index = updatedAlbums.findIndex(a => a.id === existingAlbum.id)
            updatedAlbums[index] = {
              ...existingAlbum,
              imageIds: uniqueImageIds,
              updatedAt: new Date().toISOString()
            }
          } else {
            // Create new album
            updatedAlbums.push({
              id: `auto-${category.toLowerCase()}-${Date.now()}`,
              name: category,
              description: `Auto-categorized ${category.toLowerCase()} photos`,
              imageIds: [...new Set(imageIds)],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              isSmartAlbum: true,
            })
          }
        })

        // Update image album references
        const updatedImages = state.images.map(img => {
          if (aiProcessedImages.find(ai => ai.id === img.id)) {
            const imgAlbums: string[] = []
            Object.entries(newAlbumImages).forEach(([category, imageIds]) => {
              if (imageIds.includes(img.id)) {
                const album = updatedAlbums.find(a => a.name === category)
                if (album) imgAlbums.push(album.id)
              }
            })
            return {
              ...img,
              albumIds: [...new Set([...(img.albumIds || []), ...imgAlbums])]
            }
          }
          return img
        })

        return {
          albums: updatedAlbums,
          images: updatedImages
        }
      }),

      // Trash
      trashedImages: [],
      moveToTrash: async (imageId) => {
        const state = get()
        const image = state.images.find((img) => img.id === imageId)
        if (!image) return

        try {
          // Remove from app only - DO NOT delete or move physical file
          console.log(`[Trash] Removing from app (file stays in original location): ${image.path}`)

          // Remove image from all face collections
          // @ts-ignore
          await window.electronAPI?.removeImageFromFaces(image.path)
          // Delete from SQLite database
          // @ts-ignore
          await window.electronAPI?.deleteImageFromDb(image.path)

          // Update state - file stays at original path
          set({
            images: state.images.filter((img) => img.id !== imageId),
            trashedImages: [...state.trashedImages, { 
              ...image, 
              isDeleted: true, 
              deletedAt: new Date().toISOString(),
              trashPath: image.path  // Keep original path for restore
            }],
          })
        } catch (error) {
          console.error('[Trash] Error removing from app:', error)
        }
      },
      restoreFromTrash: async (imageId) => {
        const state = get()
        const image = state.trashedImages.find((img) => img.id === imageId)
        if (!image || !image.trashPath) {
          console.error('[Restore] Image not found')
          return
        }

        try {
          // File is still at original location - just re-scan it
          console.log(`[Restore] Re-scanning file from original location: ${image.trashPath}`)
          
          // Re-process the image to add back to database and faces
          // @ts-ignore
          const processResult = await window.electronAPI?.processImage(image.trashPath)
          
          if (!processResult || !processResult.success) {
            console.error('[Restore] Failed to process image:', processResult?.error)
            return
          }

          console.log(`[Restore] Successfully restored: ${image.trashPath}`)

          // Remove from trash state immediately
          set({
            trashedImages: state.trashedImages.filter((img) => img.id !== imageId)
          })

          // Refresh images from database to get the restored image
          // @ts-ignore
          const dbResult = await window.electronAPI?.getImages()
          if (dbResult && dbResult.success) {
            set({ images: dbResult.images || [] })
          }
        } catch (error) {
          console.error('[Restore] Error restoring:', error)
        }
      },
      permanentlyDelete: (imageId) => set((state) => ({
        trashedImages: state.trashedImages.filter((img) => img.id !== imageId),
      })),
      emptyTrash: () => set({ trashedImages: [] }),
      deleteAttempts: {},
      incrementDeleteAttempt: (imageId) => set((state) => ({
        deleteAttempts: {
          ...state.deleteAttempts,
          [imageId]: (state.deleteAttempts[imageId] || 0) + 1,
        },
      })),
      resetDeleteAttempts: (imageId) => set((state) => ({
        deleteAttempts: {
          ...state.deleteAttempts,
          [imageId]: 0,
        },
      })),

      // Private Locker
      lockerSettings: initialLockerSettings,
      setLockerSettings: (settings) => set((state) => {
        const merged: LockerSettings = {
          ...initialLockerSettings,
          ...state.lockerSettings,
          ...settings,
        }

        // Ensure enabling when a PIN is provided
        if (settings.pin) {
          merged.isEnabled = true
        }

        // Keep counters and limits sane across rehydrates
        merged.failedAttempts = merged.failedAttempts ?? 0
        merged.lockoutMinutes = merged.lockoutMinutes || initialLockerSettings.lockoutMinutes
        merged.maxAttempts = merged.maxAttempts || initialLockerSettings.maxAttempts
        merged.alertOnFailedAttempts = merged.alertOnFailedAttempts ?? initialLockerSettings.alertOnFailedAttempts

        return { lockerSettings: merged }
      }),
      lockerImages: [],
      moveToLocker: (imageId) => set((state) => {
        const image = state.images.find((img) => img.id === imageId)
        if (!image) return state
        return {
          images: state.images.filter((img) => img.id !== imageId),
          lockerImages: [...state.lockerImages, { ...image, isInLocker: true }],
        }
      }),
      removeFromLocker: (imageId) => set((state) => {
        const image = state.lockerImages.find((img) => img.id === imageId)
        if (!image) return state
        return {
          lockerImages: state.lockerImages.filter((img) => img.id !== imageId),
          images: [...state.images, { ...image, isInLocker: false }],
        }
      }),
      isLockerUnlocked: false,
      setLockerUnlocked: (unlocked) => set({ isLockerUnlocked: unlocked }),
      recordFailedAttempt: () => set((state) => {
        const newAttempts = state.lockerSettings.failedAttempts + 1
        const shouldLockout = newAttempts >= state.lockerSettings.maxAttempts
        return {
          lockerSettings: {
            ...state.lockerSettings,
            failedAttempts: newAttempts,
            lockedUntil: shouldLockout
              ? new Date(Date.now() + state.lockerSettings.lockoutMinutes * 60 * 1000).toISOString()
              : state.lockerSettings.lockedUntil,
          },
        }
      }),
      resetFailedAttempts: () => set((state) => ({
        lockerSettings: {
          ...state.lockerSettings,
          failedAttempts: 0,
          lockedUntil: undefined,
        },
      })),

      // Filters
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),
      selectedTags: [],
      setSelectedTags: (tags) => set({ selectedTags: tags }),

      // UI State
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      aiModeActive: false,
      setAiModeActive: (active) => set({ aiModeActive: active }),
      showAiChatbot: false,
      setShowAiChatbot: (show) => set({ showAiChatbot: show }),

      // Reset entire app
      resetApp: () => {
        localStorage.removeItem('smartmedia-storage')
        set({
          currentScreen: 'splash',
          userName: '',
          isFirstLaunch: true,
          models: initialModels,
          selectedFolder: null,
          discoveredImages: [],
          scanProgress: {
            total: 0,
            current: 0,
            currentImage: '',
            status: 'idle',
            detectedObjects: [],
            generatedCaption: '',
          },
          images: [],
          albums: [],
          trashedImages: [],
          lockerImages: [],
          lockerSettings: initialLockerSettings,
          isLockerUnlocked: false,
          searchQuery: '',
          selectedTags: [],
          sidebarOpen: true,
          aiModeActive: false,
          showAiChatbot: false,
          // Reset Phase 4 features too
          recentlyViewed: [],
          photoRatings: {},
          dateFilter: { startDate: null, endDate: null },
          slideshowActive: false,
          slideshowInterval: 5,
          duplicateGroups: [],
          keyboardShortcutsEnabled: true,
        })
      },

      // PHASE 4 FEATURE IMPLEMENTATIONS
      // Recently Viewed
      recentlyViewed: [],
      addToRecentlyViewed: (imageId) => set((state) => {
        const filtered = state.recentlyViewed.filter(id => id !== imageId)
        return { recentlyViewed: [imageId, ...filtered].slice(0, 50) } // Keep last 50
      }),
      clearRecentlyViewed: () => set({ recentlyViewed: [] }),

      // Photo Ratings
      photoRatings: {},
      setPhotoRating: (imageId, rating) => set((state) => ({
        photoRatings: { ...state.photoRatings, [imageId]: rating }
      })),

      // Date Filter
      dateFilter: { startDate: null, endDate: null },
      setDateFilter: (filter) => set({ dateFilter: filter }),

      // Slideshow
      slideshowActive: false,
      slideshowInterval: 5,
      setSlideshowActive: (active) => set({ slideshowActive: active }),
      setSlideshowInterval: (interval) => set({ slideshowInterval: interval }),

      // Duplicate Groups
      duplicateGroups: [],
      setDuplicateGroups: (groups) => set({ duplicateGroups: groups }),

      // Keyboard Shortcuts
      keyboardShortcutsEnabled: true,
      setKeyboardShortcutsEnabled: (enabled) => set({ keyboardShortcutsEnabled: enabled }),
    }),
    {
      name: 'smartmedia-storage',
      version: 1,
      partialize: (state) => ({
        userName: state.userName,
        isFirstLaunch: state.isFirstLaunch,
        models: state.models,
        selectedFolder: state.selectedFolder,
        // images: state.images, // DO NOT PERSIST IMAGES (Loaded from DB, too large for localStorage)
        albums: state.albums,
        trashedImages: state.trashedImages,
        lockerImages: state.lockerImages,
        lockerSettings: state.lockerSettings,
        // Phase 4 persisted state
        recentlyViewed: state.recentlyViewed,
        photoRatings: state.photoRatings,
        keyboardShortcutsEnabled: state.keyboardShortcutsEnabled,
      }),
      migrate: (persistedState: any, _version) => {
        if (!persistedState) return persistedState

        const lockerSettings: LockerSettings = {
          ...initialLockerSettings,
          ...(persistedState as any).lockerSettings,
        }

        if (lockerSettings.pin && !lockerSettings.isEnabled) {
          lockerSettings.isEnabled = true
        }

        if (lockerSettings.failedAttempts === undefined) {
          lockerSettings.failedAttempts = 0
        }

        return {
          ...persistedState,
          lockerSettings,
        }
      },
    }
  )
)
