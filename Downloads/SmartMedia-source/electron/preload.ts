import { contextBridge, ipcRenderer } from 'electron'

// Expose electron object for IPC communication
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    on: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.on(channel, listener)
    },
    removeListener: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
})

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  minimizeToTray: () => ipcRenderer.invoke('window:minimize-to-tray'),

  // External  // File System
  showItemInFolder: (path: string) => ipcRenderer.invoke('fs:showItemInFolder', path),
  openPath: (path: string) => ipcRenderer.invoke('fs:openPath', path),

  // System
  copyToClipboard: (type: 'text' | 'image', content: string) => ipcRenderer.invoke('system:copyToClipboard', type, content),
  openExternal: (url: string) => ipcRenderer.invoke('openExternal', url),

  // File system
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  scanFolder: (folderPath: string) => ipcRenderer.invoke('fs:scanFolder', folderPath),
  readImageAsBase64: (imagePath: string) => ipcRenderer.invoke('fs:readImageAsBase64', imagePath),
  getImageThumbnail: (imagePath: string, metadata?: any) => ipcRenderer.invoke('fs:getImageThumbnail', imagePath, metadata),

  // Notifications
  showNotification: (title: string, body: string) => ipcRenderer.invoke('notification:show', title, body),

  // AI Processing (will communicate with Python backend)
  processImage: (imagePath: string) => ipcRenderer.invoke('ai:processImage', imagePath),
  queueImages: (imagePaths: string[]) => ipcRenderer.invoke('ai:queueImages', imagePaths),
  getProcessingStatus: () => ipcRenderer.invoke('ai:getProcessingStatus'),
  clearCompletedTasks: () => ipcRenderer.invoke('ai:clearCompletedTasks'),
  downloadModel: (modelName: string) => ipcRenderer.invoke('ai:downloadModel', modelName),
  downloadAllModels: () => ipcRenderer.invoke('ai:downloadModels'),
  getModelStatus: () => ipcRenderer.invoke('ai:getModelStatus'),

  // Face Recognition
  getFaces: () => ipcRenderer.invoke('ai:getFaces'),
  getFaceMatches: (faceId: string) => ipcRenderer.invoke('ai:getFaceMatches', faceId),
  setFaceName: (faceId: string, name: string) => ipcRenderer.invoke('ai:setFaceName', faceId, name),
  mergeFaces: (faceIds: string[], targetName: string) => ipcRenderer.invoke('ai:mergeFaces', faceIds, targetName),
  scanForFaces: () => ipcRenderer.invoke('ai:scanForFaces'),
  clusterFaces: (directory?: string) => ipcRenderer.invoke('ai:clusterFaces', directory),
  getFaceClusters: () => ipcRenderer.invoke('ai:getFaceClusters'),
  findSimilarImages: (options: { paths: string[], threshold: number, mode: string }) => ipcRenderer.invoke('ai:findSimilarImages', options),
  deleteFace: (faceId: string) => ipcRenderer.invoke('ai:deleteFace', faceId),
  deleteFaces: (faceIds: string[]) => ipcRenderer.invoke('ai:deleteFaces', faceIds),
  resetFaces: () => ipcRenderer.invoke('ai:resetFaces'),
  factoryReset: () => ipcRenderer.invoke('app:factoryReset'),

  // Emotions
  getEmotions: () => ipcRenderer.invoke('ai:getEmotions'),

  // AI Chat
  aiChat: (imagePath: string, message: string) => ipcRenderer.invoke('ai:chat', imagePath, message),

  // File Operations
  saveImage: (imagePath: string, savePath?: string) => ipcRenderer.invoke('fs:saveImage', imagePath, savePath),
  saveBase64Image: (base64Data: string, savePath: string) => ipcRenderer.invoke('fs:saveBase64Image', base64Data, savePath),
  deleteImage: (imagePath: string) => ipcRenderer.invoke('fs:deleteImage', imagePath),
  shareImage: (imagePath: string) => ipcRenderer.invoke('fs:shareImage', imagePath),
  renameFile: (imagePath: string, newName: string) => ipcRenderer.invoke('fs:renameFile', imagePath, newName),
  moveToTrash: (imagePath: string) => ipcRenderer.invoke('fs:moveToTrash', imagePath),
  restoreFromTrash: (imagePath: string) => ipcRenderer.invoke('fs:restoreFromTrash', imagePath),
  permanentDelete: (imagePath: string) => ipcRenderer.invoke('fs:permanentDelete', imagePath),

  // Locker Operations
  moveToLocker: (imagePath: string) => ipcRenderer.invoke('locker:moveToLocker', imagePath),
  removeFromLocker: (imagePath: string) => ipcRenderer.invoke('locker:removeFromLocker', imagePath),
  getLockerImages: () => ipcRenderer.invoke('locker:getImages'),
  verifyLockerPin: (pin: string) => ipcRenderer.invoke('locker:verifyPin', pin),
  setLockerPin: (pin: string) => ipcRenderer.invoke('locker:setPin', pin),

  // PDF Export
  exportToPDF: (imagePaths: string[], outputPath?: string) => ipcRenderer.invoke('fs:exportToPDF', imagePaths, outputPath),
  // ZIP Export
  exportToZip: (imagePaths: string[], options?: { includeVideos?: boolean; quality?: number; outputPath?: string }) =>
    ipcRenderer.invoke('fs:exportToZip', imagePaths, options),

  // File Conversion & Tools
  selectFiles: () => ipcRenderer.invoke('dialog:selectFiles'),
  selectFilesWithFilter: (filters: { name: string; extensions: string[] }[], multiSelect?: boolean) =>
    ipcRenderer.invoke('dialog:selectFilesWithFilter', filters, multiSelect),
  convertFile: (toolId: string, files: string[], options?: any) => ipcRenderer.invoke('tools:convertFile', toolId, files, options),
  downloadFile: (filePath: string) => ipcRenderer.invoke('tools:downloadFile', filePath),

  // Database
  saveImageMetadata: (metadata: any) => ipcRenderer.invoke('db:saveImageMetadata', metadata),
  getImages: (filters?: any) => ipcRenderer.invoke('db:getImages', filters),
  searchImages: (query: string) => ipcRenderer.invoke('db:searchImages', query),
  updateImageTags: (imageId: string, tags: string[]) => ipcRenderer.invoke('db:updateImageTags', imageId, tags),
  updateImageFavorite: (imageId: string, isFavorite: boolean) => ipcRenderer.invoke('db:updateImageFavorite', imageId, isFavorite),
  getDatabaseInfo: () => ipcRenderer.invoke('db:getInfo'),
  deleteImageFromDb: (imagePath: string) => ipcRenderer.invoke('db:deleteImage', imagePath),

  // Face sync on deletion
  removeImageFromFaces: (imagePath: string) => ipcRenderer.invoke('ai:removeImageFromFaces', imagePath),

  // Model preloading
  preloadModels: () => ipcRenderer.invoke('ai:preloadModels'),

  // Python engine status
  getPythonStatus: () => ipcRenderer.invoke('ai:getPythonStatus'),
  onPythonReady: (callback: (data: any) => void) => {
    const listener = (_: any, data: any) => callback(data)
    ipcRenderer.on('python:ready', listener)
    return () => ipcRenderer.removeListener('python:ready', listener)
  },

  // Events
  onScanProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('scan:progress', (_, progress) => callback(progress))
  },
  onModelDownloadProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('model:downloadProgress', (_, progress) => callback(progress))
  },
  onDownloadProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('download:progress', (_, progress) => callback(progress))
  },
  onImageProcessed: (callback: (result: any) => void) => {
    ipcRenderer.on('ai:imageProcessed', (_, result) => callback(result))
  },
  onFaceScanProgress: (callback: (progress: any) => void) => {
    const listener = (_: any, progress: any) => callback(progress)
    ipcRenderer.on('face-scan-progress', listener)
    return () => ipcRenderer.removeListener('face-scan-progress', listener)
  },
  onProcessingStatus: (callback: (status: any) => void) => {
    ipcRenderer.on('processing:status', (_, status) => callback(status))
  },
  onQueueResult: (callback: (result: any) => void) => {
    ipcRenderer.on('queue:result', (_, result) => callback(result))
  },
  removeDownloadProgressListener: () => {
    ipcRenderer.removeAllListeners('download:progress')
  },
  removeQueueListeners: () => {
    ipcRenderer.removeAllListeners('queue:result')
  }
})

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      minimizeToTray: () => Promise<void>
      showItemInFolder: (path: string) => Promise<void>
      openPath: (path: string) => Promise<string>
      copyToClipboard: (type: 'text' | 'image', content: string) => Promise<{ success: boolean }>
      selectFolder: () => Promise<string | null>
      scanFolder: (folderPath: string) => Promise<string[]>
      readImageAsBase64: (imagePath: string) => Promise<string | null>
      getImageThumbnail: (imagePath: string, metadata?: any) => Promise<string | null>
      showNotification: (title: string, body: string) => Promise<void>
      processImage: (imagePath: string) => Promise<any>
      queueImages: (imagePaths: string[]) => Promise<any>
      getProcessingStatus: () => Promise<any>
      clearCompletedTasks: () => Promise<any>
      downloadModel: (modelName: string) => Promise<any>
      downloadAllModels: () => Promise<any>
      getModelStatus: () => Promise<any>
      getFaces: () => Promise<any>
      getFaceMatches: (faceId: string) => Promise<any>
      setFaceName: (faceId: string, name: string) => Promise<any>
      mergeFaces: (faceIds: string[], targetName: string) => Promise<any>
      scanForFaces: () => Promise<any>
      findSimilarImages: (imagePaths: string[], threshold?: number) => Promise<any>
      deleteFace: (faceId: string) => Promise<any>
      deleteFaces: (faceIds: string[]) => Promise<any>
      resetFaces: () => Promise<any>
      factoryReset: () => Promise<any>
      getEmotions: () => Promise<any>
      aiChat: (imagePath: string, message: string) => Promise<any>
      saveImage: (imagePath: string, savePath?: string) => Promise<any>
      saveBase64Image: (base64Data: string, savePath: string) => Promise<any>
      deleteImage: (imagePath: string) => Promise<any>
      shareImage: (imagePath: string) => Promise<any>
      renameFile: (imagePath: string, newName: string) => Promise<any>
      moveToTrash: (imagePath: string) => Promise<any>
      restoreFromTrash: (imagePath: string) => Promise<any>
      permanentDelete: (imagePath: string) => Promise<any>
      moveToLocker: (imagePath: string) => Promise<any>
      removeFromLocker: (imagePath: string) => Promise<any>
      getLockerImages: () => Promise<any>
      verifyLockerPin: (pin: string) => Promise<boolean>
      setLockerPin: (pin: string) => Promise<void>
      exportToPDF: (imagePaths: string[], outputPath?: string) => Promise<any>
      exportToZip: (
        imagePaths: string[],
        options?: { includeVideos?: boolean; quality?: number; outputPath?: string }
      ) => Promise<any>
      saveImageMetadata: (metadata: any) => Promise<void>
      getImages: (filters?: any) => Promise<any[]>
      searchImages: (query: string) => Promise<any[]>
      updateImageTags: (imageId: string, tags: string[]) => Promise<void>
      updateImageFavorite: (imageId: string, isFavorite: boolean) => Promise<any>
      getDatabaseInfo: () => Promise<any>
      deleteImageFromDb: (imagePath: string) => Promise<any>
      removeImageFromFaces: (imagePath: string) => Promise<any>
      preloadModels: () => Promise<any>
      getPythonStatus: () => Promise<{ ready: boolean; processExists: boolean }>
      onPythonReady: (callback: (data: any) => void) => () => void
      onScanProgress: (callback: (progress: any) => void) => void
      onModelDownloadProgress: (callback: (progress: any) => void) => void
      onDownloadProgress: (callback: (progress: any) => void) => void
      onImageProcessed: (callback: (result: any) => void) => void
      onFaceScanProgress: (callback: (progress: any) => void) => () => void
      onProcessingStatus: (callback: (status: any) => void) => void
      onQueueProgress: (callback: (progress: any) => void) => void
      onQueueResult: (callback: (result: any) => void) => void
      onQueueComplete: (callback: (data: any) => void) => void
      removeDownloadProgressListener: () => void
      removeQueueListeners: () => void
    }
    electron?: {
      ipcRenderer: {
        on: (channel: string, listener: (...args: any[]) => void) => void
        removeListener: (channel: string, listener: (...args: any[]) => void) => void
      }
    }
  }
}
