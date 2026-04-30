/// <reference types="vite/client" />

interface Window {
  electron?: {
    selectFolder: () => Promise<string | null>
    selectFiles: () => Promise<string[] | null>
    scanFolder: (folderPath: string) => Promise<any>
    processImage: (imagePath: string) => Promise<any>
    checkModels: () => Promise<any>
    downloadModels: () => Promise<any>
    getFaces: () => Promise<any>
    setFaceName: (faceId: string, name: string) => Promise<any>
    aiChat: (imagePath: string, message: string) => Promise<any>
    downloadFile: (filePath: string) => Promise<void>
    convertFile: (toolId: string, files: string[], options?: any) => Promise<any>
  }
}

interface Window {
  electronAPI: {
    minimizeWindow: () => Promise<void>
    maximizeWindow: () => Promise<void>
    closeWindow: () => Promise<void>
    minimizeToTray: () => Promise<void>
    openPath: (path: string) => Promise<string>
    showItemInFolder: (path: string) => Promise<void>
    selectFolder: () => Promise<string | null>
    selectFiles: () => Promise<string[] | null>
    selectFilesWithFilter: (filters: { name: string; extensions: string[] }[], multiSelect?: boolean) => Promise<string[] | null>
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
    saveImageMetadata: (metadata: any) => Promise<void>
    getImages: (filters?: any) => Promise<any[]>
    searchImages: (query: string) => Promise<any[]>
    getDatabaseInfo: () => Promise<any>
    convertFile: (toolId: string, files: string[], options?: any) => Promise<any>
    downloadFile: (filePath: string) => Promise<any>
    // File operations
    saveImage: (imagePath: string, savePath?: string) => Promise<any>
    deleteImage: (imagePath: string) => Promise<any>
    shareImage: (imagePath: string) => Promise<any>
    exportToPDF: (imagePaths: string[], outputPath?: string) => Promise<any>
    exportToZip: (imagePaths: string[], options?: any) => Promise<any>
    // AI features
    aiChat: (imagePath: string, message: string) => Promise<any>
    getFaces: () => Promise<any>
    openExternal: (url: string) => Promise<void>
    setFaceName: (faceId: string, name: string) => Promise<any>
    scanForFaces: () => Promise<any>
    // Events
    onScanProgress: (callback: (progress: any) => void) => void
    onModelDownloadProgress: (callback: (progress: any) => void) => void
    onDownloadProgress: (callback: (progress: any) => void) => void
    onImageProcessed: (callback: (result: any) => void) => void
    onFaceScanProgress: (callback: (progress: any) => void) => void
    onProcessingStatus: (callback: (status: any) => void) => void
    onQueueResult: (callback: (result: any) => void) => void
    removeDownloadProgressListener: () => void
    removeQueueListeners: () => void
  }
  electron: {
    ipcRenderer: {
      on: (channel: string, listener: (...args: any[]) => void) => void
      removeListener: (channel: string, listener: (...args: any[]) => void) => void
    }
    invoke: (channel: string, ...args: any[]) => Promise<any>
  }
}
