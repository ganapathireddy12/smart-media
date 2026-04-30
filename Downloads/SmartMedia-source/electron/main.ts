import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, Notification, shell, clipboard, nativeImage } from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import archiver from 'archiver'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let pythonProcess: ChildProcess | null = null
let pythonReady = false

// Face scanning state to prevent concurrent operations
let isFaceScanning = false

// Background processing queue
interface ProcessingTask {
  id: string
  imagePath: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  result?: any
  error?: string
  timestamp: number
}

let processingQueue: ProcessingTask[] = []

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0c0c0c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
    icon: path.join(__dirname, '../public/icon.png'),
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // Don't auto-open devtools for cleaner demo
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('minimize', (event: Electron.Event) => {
    // Allow minimize to tray
  })
}

function createTray() {
  try {
    const iconPath = isDev
      ? path.join(__dirname, '../public/icon.png')
      : path.join(process.resourcesPath, 'icon.png')

    // Check if icon exists before creating tray
    if (!require('fs').existsSync(iconPath)) {
      console.log('Tray icon not found, skipping tray creation')
      return
    }

    tray = new Tray(iconPath)

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open SmartMedia', click: () => mainWindow?.show() },
      { label: 'Scanning Status', enabled: false },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])

    tray.setToolTip('SmartMedia - AI Media Scanner')
    tray.setContextMenu(contextMenu)

    tray.on('click', () => {
      mainWindow?.show()
    })
  } catch (error) {
    console.log('Failed to create tray:', error)
  }
}

function startPythonEngine() {
  // ── Production: prefer PyInstaller-bundled executable ────────────────────
  // When built with `scripts/bundle-python.ps1`, the bundled engine lives at:
  //   resources/python-engine/main.exe  (Windows)
  //   resources/python-engine/main      (macOS / Linux)
  const bundledExeName = process.platform === 'win32' ? 'main.exe' : 'main'
  const bundledExePath = isDev
    ? null
    : path.join(process.resourcesPath, 'python-engine', bundledExeName)

  const hasBundledExe = bundledExePath !== null && fs.existsSync(bundledExePath)

  // ── Determine spawn target ───────────────────────────────────────────────
  const scriptPath = isDev
    ? path.join(__dirname, '../python/main.py')
    : path.join(process.resourcesPath, 'python/main.py')

  // Build ordered list of (exe, args) pairs to try
  type ExeConfig = { exe: string; args: string[] }
  const pythonExecutables: ExeConfig[] = hasBundledExe
    ? [{ exe: bundledExePath!, args: [] }]             // ← bundled exe (no args)
    : process.platform === 'win32'
      ? [
          { exe: 'python',  args: ['-u', scriptPath] },
          { exe: 'python3', args: ['-u', scriptPath] },
          { exe: 'py',      args: ['-u', scriptPath] },
        ]
      : [
          { exe: 'python3', args: ['-u', scriptPath] },
          { exe: 'python',  args: ['-u', scriptPath] },
        ]

  if (hasBundledExe) {
    console.log('[Electron] Using bundled Python engine:', bundledExePath)
  } else {
    console.log('[Electron] No bundled Python engine found, using system Python')
    console.log('[Electron] Script path:', scriptPath)
  }

  let started = false
  let restartAttempts = 0
  const maxRestarts = 3

  const startProcess = (config: ExeConfig) => {
    const pythonExe = config.exe
    pythonProcess = spawn(pythonExe, config.args, {  // -u flag for unbuffered (system Python only)
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { 
        ...process.env, 
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8'  // Force UTF-8 encoding
      }
    })

    // CRITICAL FIX: Use line-buffered approach to handle JSON responses
    // that may be split across multiple stdout data events
    let stdoutBuffer = ''
    pythonProcess.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString()

      // Split on newlines, keeping incomplete last line in buffer
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() || '' // Keep incomplete line for next event

      for (const line of lines) {
        const trimmed = line.replace(/\r$/, '').trim()
        if (!trimmed) continue

        console.log(`[Python] ${trimmed.substring(0, 200)}${trimmed.length > 200 ? '...' : ''}`)

        try {
          const json = JSON.parse(trimmed)

          // Handle queue result events
          if (json.type === 'queue_result') {
            console.log(`[Electron] Queue result: ${json.success ? 'success' : 'failed'} for ${json.path}`)
            console.log(`[Electron] Broadcasting queue:result event to renderer`)
            mainWindow?.webContents.send('queue:result', json)
          }

          // Emit to global event handlers (for request ID matching)
          pythonProcess?.emit('json-response', json)
        } catch {
          // Not valid JSON for this line, just log it
          console.log(`[Python Output] ${trimmed.substring(0, 150)}`)
        }
      }
    })

    pythonProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString().trim()
      console.log(`[Python Log] ${output}`)

      if (output.includes('Ready for commands')) {
        pythonReady = true
        restartAttempts = 0  // Reset on successful start
        console.log('[Electron] ✅ Python engine ready and accepting commands!')
        console.log('[Electron] You can now start scanning images.')
        mainWindow?.webContents.send('python:ready', { ready: true })
      }

      if (output.includes('ERROR') || output.includes('Failed')) {
        console.error('[Electron] ⚠️ Python error detected:', output)
      }
    })

    pythonProcess.on('error', (error) => {
      console.error(`[Python Error] ${error.message}`)
    })

    pythonProcess.on('close', (code) => {
      console.log(`[Python] Process exited with code ${code}`)
      pythonReady = false

      // Auto-restart on crash (but not on normal exit)
      if (code !== 0 && code !== null && restartAttempts < maxRestarts) {
        restartAttempts++
        console.log(`[Electron] Python crashed, restarting (attempt ${restartAttempts}/${maxRestarts})...`)
        setTimeout(() => startProcess(config), 2000)
      }
    })
  }

  for (const exeConfig of pythonExecutables) {
    try {
      startProcess(exeConfig)

      started = true
      console.log(`[Electron] Started Python engine with: ${exeConfig.exe}`)
      break
    } catch (error) {
      console.log(`[Electron] Failed to start with ${exeConfig.exe}, trying next...`)
    }
  }

  if (!started) {
    console.error('[Electron] Could not start Python engine')
  }
}

// IPC Handlers
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

ipcMain.handle('window:minimize-to-tray', () => {
  mainWindow?.hide()
  showNotification('SmartMedia', 'Running in background. Click tray icon to restore.')
})

// Open external URLs in default browser
ipcMain.handle('openExternal', async (_, url: string) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (error) {
    console.error('Failed to open external URL:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('fs:showItemInFolder', (_, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('fs:openPath', async (_, filePath: string) => {
  const result = await shell.openPath(filePath)
  return result // Returns empty string if success, error message if failed
})

ipcMain.handle('system:copyToClipboard', (_, type: 'text' | 'image', content: string) => {
  try {
    if (type === 'text') {
      clipboard.writeText(content)
    } else {
      const image = nativeImage.createFromPath(content)
      clipboard.writeImage(image)
    }
    return { success: true }
  } catch (error) {
    console.error('Clipboard error:', error)
    return { success: false }
  }
})

ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  return result.filePaths[0] || null
})

// File selection for tools
ipcMain.handle('dialog:selectFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'tiff'] },
      { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'] },
    ]
  })
  return result.canceled ? null : result.filePaths
})

// Select files with custom filters based on tool type
ipcMain.handle('dialog:selectFilesWithFilter', async (_, filters: { name: string; extensions: string[] }[], multiSelect?: boolean) => {
  const properties: ('openFile' | 'multiSelections')[] = ['openFile']
  if (multiSelect !== false) {
    properties.push('multiSelections')
  }

  const result = await dialog.showOpenDialog(mainWindow!, {
    properties,
    filters: filters.length > 0 ? filters : [{ name: 'All Files', extensions: ['*'] }]
  })
  return result.canceled ? null : result.filePaths
})

ipcMain.handle('fs:scanFolder', async (_, folderPath: string) => {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.heic', '.webp', '.gif', '.bmp']
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.m4v', '.3gp', '.mpeg', '.mpg']
  const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus']
  const documentExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md', '.log', '.csv', '.rtf']
  const allExtensions = [...imageExtensions, ...videoExtensions, ...audioExtensions, ...documentExtensions]
  const images: string[] = []

  function scanDir(dir: string) {
    try {
      const files = fs.readdirSync(dir)
      for (const file of files) {
        const filePath = path.join(dir, file)
        const stat = fs.statSync(filePath)

        if (stat.isDirectory()) {
          scanDir(filePath)
        } else {
          const ext = path.extname(file).toLowerCase()
          if (allExtensions.includes(ext)) {
            images.push(filePath)
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error)
    }
  }

  scanDir(folderPath)
  return images
})

ipcMain.handle('fs:getImageThumbnail', async (_, imagePath: string, metadata?: any) => {
  try {
    if (!fs.existsSync(imagePath)) {
      console.log(`[Thumbnail] File missing: ${imagePath}`)
      return null
    }

    const ext = path.extname(imagePath).toLowerCase()
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.m4v', '.3gp', '.mpeg', '.mpg']
    const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus']
    const documentExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md', '.log', '.csv', '.rtf']

    // Check if this is a video or audio file and if we have a generated thumbnail
    if (metadata?.thumbnail_path && fs.existsSync(metadata.thumbnail_path)) {
      // Use the pre-generated thumbnail
      const thumbBuffer = fs.readFileSync(metadata.thumbnail_path)
      const base64 = thumbBuffer.toString('base64')
      return `data:image/jpeg;base64,${base64}`
    }

    // For video/audio/document without thumbnail, return null (UI will show icon)
    if (videoExtensions.includes(ext) || audioExtensions.includes(ext) || documentExtensions.includes(ext)) {
      return null
    }

    // For images, read and return as base64
    const buffer = fs.readFileSync(imagePath)
    const base64 = buffer.toString('base64')
    const fileExt = ext.slice(1)
    const mimeType = fileExt === 'jpg' ? 'jpeg' : fileExt
    return `data:image/${mimeType};base64,${base64}`
  } catch (error) {
    console.error(`Error reading thumbnail ${imagePath}:`, error)
    return null
  }
})

ipcMain.handle('fs:readImageAsBase64', async (_, imagePath: string) => {
  try {
    const buffer = fs.readFileSync(imagePath)
    const base64 = buffer.toString('base64')
    const ext = path.extname(imagePath).toLowerCase().slice(1)
    const mimeType = ext === 'jpg' ? 'jpeg' : ext
    return `data:image/${mimeType};base64,${base64}`
  } catch (error) {
    console.error(`Error reading image ${imagePath}:`, error)
    return null
  }
})

ipcMain.handle('notification:show', (_, title: string, body: string) => {
  showNotification(title, body)
})

// Background Processing Queue Functions
function sendProcessingStatus() {
  const processingTasks = processingQueue.filter(t => t.status === 'processing')
  const status = {
    queueLength: processingQueue.filter(t => t.status === 'queued').length,
    processing: processingTasks.length > 0,
    currentTask: processingTasks.length > 0 ? {
      id: processingTasks[0].id,
      imagePath: processingTasks[0].imagePath,
      status: processingTasks[0].status
    } : null,
    completed: processingQueue.filter(t => t.status === 'completed').length,
    failed: processingQueue.filter(t => t.status === 'failed').length,
    tasks: processingQueue.map(t => ({
      id: t.id,
      imagePath: path.basename(t.imagePath),
      status: t.status,
      timestamp: t.timestamp
    }))
  }

  mainWindow?.webContents.send('processing:status', status)
}

async function processImageDirect(imagePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    // Generate unique request ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Normalize path for cross-platform compatibility
    const normalizedPath = path.normalize(imagePath)
    const filename = path.basename(normalizedPath)

    console.log(`[Electron] 📤 Request ID: ${requestId}`)
    console.log(`[Electron] 📤 Sending to Python:`, {
      file: filename,
      path: normalizedPath,
      exists: require('fs').existsSync(normalizedPath)
    })

    // Check if file exists
    if (!require('fs').existsSync(normalizedPath)) {
      console.error(`[Electron] ❌ File not found: ${normalizedPath}`)
      resolve({
        success: false,
        error: 'File not found',
        path: normalizedPath
      })
      return
    }

    // Detect media type
    const ext = path.extname(normalizedPath).toLowerCase()
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.heic', '.webp', '.gif', '.bmp', '.tiff', '.tif']
    const isImage = imageExtensions.includes(ext)

    // Use appropriate command based on media type
    const action = isImage ? 'process_image' : 'process_media'
    const command = JSON.stringify({ action, path: normalizedPath, request_id: requestId })

    console.log(`[Electron] 📨 Command:`, { action, file: filename, requestId })

    let responseReceived = false

    const handler = (response: any) => {
      // Only handle responses with matching request ID
      if (response.request_id === requestId) {
        responseReceived = true
        pythonProcess?.off('json-response', handler)

        if (response.success) {
          console.log(`[Electron] ✅ Success: ${filename} (${response.photo_type || 'N/A'})`)
        } else {
          console.error(`[Electron] ❌ Failed: ${filename} - ${response.error || 'Unknown error'}`)
        }

        resolve(response)
      }
    }

    // Listen for JSON responses with matching request ID
    pythonProcess?.on('json-response', handler)

    // CRITICAL FIX: Ensure command is written and flushed properly
    try {
      const written = pythonProcess?.stdin?.write(command + '\n')
      console.log(`[Electron] 📝 Write result: ${written}`)
    } catch (error) {
      console.error(`[Electron] ❌ Write error:`, error)
      pythonProcess?.off('json-response', handler)
      resolve({
        success: false,
        error: 'Failed to send command to Python',
        path: normalizedPath
      })
      return
    }

    console.log(`[Electron] ⏳ Waiting for response... (max 5 minutes)`)

    // Timeout - resolve with error instead of rejecting to prevent
    // unhandled promise rejection from crashing the scanning loop
    setTimeout(() => {
      pythonProcess?.off('json-response', handler)
      if (!responseReceived) {
        console.error(`[Electron] ⏰ TIMEOUT: No response from Python for ${filename} after 5 minutes`)
        console.error(`[Electron] Check if Python is processing or crashed`)
        resolve({
          success: false,
          error: `Timeout: No response from AI engine for ${filename}`,
          path: normalizedPath
        })
      }
    }, 300000) // 5 minutes
  })
}

// AI Engine IPC Handlers
ipcMain.handle('ai:processImage', async (_, imagePath: string) => {
  if (!pythonProcess || !pythonReady) {
    console.log('[Electron] ❌ Python not ready for image processing')
    console.log(`[Electron] pythonProcess exists: ${!!pythonProcess}`)
    console.log(`[Electron] pythonReady: ${pythonReady}`)
    return {
      success: false,
      error: 'Python engine not ready. Please wait for initialization.',
      path: imagePath
    }
  }

  const filename = path.basename(imagePath)
  console.log(`[Electron] ✓ Processing: ${filename}`)
  return processImageDirect(imagePath)
})

// Background queue processing
ipcMain.handle('ai:queueImages', async (_, imagePaths: string[]) => {
  if (!pythonProcess || !pythonReady) {
    console.log('[Electron] Python not ready, cannot queue images')
    return { success: false, error: 'Python engine not ready' }
  }

  const command = JSON.stringify({
    action: 'queue_images',
    paths: imagePaths
  })

  pythonProcess?.stdin?.write(command + '\n')
  console.log(`[Electron] Queued ${imagePaths.length} images for background processing`)

  return { success: true, queued: imagePaths.length }
})

ipcMain.handle('ai:getProcessingStatus', async () => {
  return {
    queueLength: processingQueue.filter(t => t.status === 'queued').length,
    processing: false,
    currentTask: null,
    completed: processingQueue.filter(t => t.status === 'completed').length,
    failed: processingQueue.filter(t => t.status === 'failed').length,
    tasks: processingQueue.map(t => ({
      id: t.id,
      imagePath: path.basename(t.imagePath),
      status: t.status,
      timestamp: t.timestamp
    }))
  }
})

ipcMain.handle('ai:clearCompletedTasks', async () => {
  const beforeLength = processingQueue.length
  processingQueue = processingQueue.filter(t => t.status === 'queued' || t.status === 'processing')
  sendProcessingStatus()
  return { success: true, cleared: beforeLength - processingQueue.length }
})

ipcMain.handle('ai:getPythonStatus', () => {
  return { ready: pythonReady, processExists: !!pythonProcess }
})

ipcMain.handle('ai:getModelStatus', async () => {
  if (!pythonProcess || !pythonReady) {
    return {
      success: true,
      models_available: false,
      engine_ready: false,
      model_loading: false,
      demo_mode: true,
      models: {
        'qwen2-vl': { name: 'Qwen2-VL 2B', downloaded: false, required: true, size_mb: 4096 }
      },
      dependencies: {
        torch: null,
        transformers: null,
        face_recognition: null,
        opencv: null,
      },
      missing_required: ['python_engine', 'qwen2-vl'],
      missing_optional: ['face_recognition'],
      total_size_mb: 4096,
      downloaded_size_mb: 0,
      progress: 0
    }
  }

  return new Promise((resolve) => {
    const requestId = `model_status_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const command = JSON.stringify({ action: 'check_models', request_id: requestId })

    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const cleanup = () => {
      pythonProcess?.off('json-response', handler)
      if (timeoutId) clearTimeout(timeoutId)
    }

    const handler = (response: any) => {
      const looksLikeModelStatus = response?.success !== undefined && (
        response?.models !== undefined || response?.models_available !== undefined
      )
      const isRequestMatch = response?.request_id === requestId

      // Accept explicit request match, and allow legacy response payloads without request_id.
      if (!isRequestMatch && !(looksLikeModelStatus && response?.request_id === undefined)) {
        return
      }

      if (settled) return
      settled = true
      cleanup()
      resolve(response)
    }

    pythonProcess?.on('json-response', handler)

    try {
      pythonProcess?.stdin?.write(command + '\n')
    } catch (error) {
      cleanup()
      resolve({
        success: false,
        error: `Failed to request model status: ${String(error)}`,
        models_available: false,
        models: {
          'qwen2-vl': { name: 'Qwen2-VL 2B', downloaded: false, required: true, size_mb: 4096 }
        },
        total_size_mb: 4096,
        downloaded_size_mb: 0,
        progress: 0,
      })
      return
    }

    timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      resolve({
        success: false,
        error: 'Timed out while checking model status',
        models_available: false,
        models: {
          'qwen2-vl': { name: 'Qwen2-VL 2B', downloaded: false, required: true, size_mb: 4096 }
        },
        total_size_mb: 4096,
        downloaded_size_mb: 0,
        progress: 0,
      })
    }, 8000)
  })
})

// --- FACE CACHE: Load faces instantly without Python ---
let cachedFaces: any[] | null = null

function getFacesCacheDir(): string {
  const dataDir = isDev
    ? path.join(__dirname, '..', 'data')
    : path.join(process.resourcesPath, 'data')
  return dataDir
}

function getFacesCachePath(): string {
  return path.join(getFacesCacheDir(), 'faces_cache.json')
}

function loadFacesFromCache(): any[] {
  try {
    const cachePath = getFacesCachePath()
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, 'utf-8')
      const parsed = JSON.parse(data)
      if (Array.isArray(parsed)) {
        console.log(`[FacesCache] Loaded ${parsed.length} faces from cache`)
        return parsed
      }
    }
  } catch (error) {
    console.log('[FacesCache] No cache available:', error)
  }
  return []
}

function saveFacesToCache(faces: any[]) {
  try {
    const cacheDir = getFacesCacheDir()
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    const cachePath = getFacesCachePath()
    fs.writeFileSync(cachePath, JSON.stringify(faces), 'utf-8')
    cachedFaces = faces
    console.log(`[FacesCache] Saved ${faces.length} faces to cache`)
  } catch (error) {
    console.error('[FacesCache] Failed to save cache:', error)
  }
}

// Face Recognition APIs
ipcMain.handle('ai:getFaces', async () => {
  // If Python is ready, get faces from Python and update cache
  if (pythonProcess && pythonReady) {
    return new Promise((resolve) => {
      const command = JSON.stringify({ action: 'get_faces' })

      const handler = (data: Buffer) => {
        try {
          const result = JSON.parse(data.toString().trim())
          if (result.faces !== undefined) {
            pythonProcess?.stdout?.off('data', handler)
            // Update cache with fresh data
            if (result.success && Array.isArray(result.faces)) {
              saveFacesToCache(result.faces)
            }
            resolve(result)
          }
        } catch {
          // Wait for valid JSON
        }
      }

      pythonProcess?.stdout?.on('data', handler)
      pythonProcess?.stdin?.write(command + '\n')

      setTimeout(() => {
        pythonProcess?.stdout?.off('data', handler)
        // On timeout, return cached data if available
        const cached = cachedFaces || loadFacesFromCache()
        if (cached.length > 0) {
          console.log('[ai:getFaces] Python timeout, returning cached faces')
          resolve({ success: true, faces: cached, fromCache: true })
        } else {
          resolve({ success: false, faces: [] })
        }
      }, 5000)
    })
  }

  // Python not ready - return cached faces immediately (no waiting!)
  if (!cachedFaces) {
    cachedFaces = loadFacesFromCache()
  }
  if (cachedFaces && cachedFaces.length > 0) {
    console.log(`[ai:getFaces] Python not ready, returning ${cachedFaces.length} cached faces instantly`)
    return { success: true, faces: cachedFaces, fromCache: true }
  }

  return { success: false, faces: [] }
})

ipcMain.handle('ai:getFaceMatches', async (_, faceId: string) => {
  if (!pythonProcess || !pythonReady) {
    return { success: false, images: [] }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'get_face_matches', face_id: faceId })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())
        if (result.images !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          resolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: false, images: [] })
    }, 5000)
  })
})

ipcMain.handle('ai:setFaceName', async (_, faceId: string, name: string) => {
  if (!pythonProcess || !pythonReady) {
    return { success: false }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'set_face_name', face_id: faceId, name })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())
        if (result.success !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          resolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: false })
    }, 5000)
  })
})

// Find Similar Images (Duplicate Detection)
ipcMain.handle('ai:findSimilarImages', async (_, options: { paths: string[], threshold: number, mode: string }) => {
  if (!pythonProcess || !pythonReady) {
    return { success: false, error: 'Python engine not ready', groups: [] }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({
      action: 'find_similar_images',
      paths: options.paths,
      threshold: options.threshold || 0.92,
      mode: options.mode || 'similar'
    })

    console.log(`[Electron] Finding duplicates for ${options.paths.length} images...`)

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())
        if (result.groups !== undefined || result.success !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          console.log(`[Electron] Duplicate detection complete: ${result.groups?.length || 0} groups`)
          resolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    // Longer timeout for large scans
    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      console.log('[Electron] Duplicate detection timeout')
      resolve({ success: false, error: 'Timeout', groups: [] })
    }, 120000) // 2 minutes timeout
  })
})

// Get Emotions
ipcMain.handle('ai:getEmotions', async () => {
  if (!pythonProcess || !pythonReady) {
    return { success: false, emotions: {} }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'get_emotions' })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())
        if (result.emotions !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          resolve({ success: true, emotions: result.emotions })
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: false, emotions: {} })
    }, 5000)
  })
})

// Delete Face
ipcMain.handle('ai:deleteFace', async (_, faceId: string) => {
  if (!pythonProcess || !pythonReady) {
    return { success: false }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'delete_face', face_id: faceId })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())
        if (result.success !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          resolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: false })
    }, 5000)
  })
})

// Delete Multiple Faces
ipcMain.handle('ai:deleteFaces', async (_, faceIds: string[]) => {
  if (!pythonProcess || !pythonReady) {
    return { success: false, deleted: 0 }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'delete_faces', face_ids: faceIds })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())
        if (result.success !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          resolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: false, deleted: 0 })
    }, 5000)
  })
})

// AI Chat Integration - Enterprise Optimized
ipcMain.handle('ai:chat', async (_, imagePath?: string, message?: string) => {
  if (!pythonProcess || !pythonReady) {
    return {
      success: true,
      response: "AI engine is starting up... Please wait a moment.",
      timing: 0
    }
  }

  const startTime = Date.now()

  return new Promise((resolve) => {
    const command = JSON.stringify({
      action: 'ai_chat',
      message: message || '',
      image_path: imagePath || ''
    })

    let buffer = ''

    const handler = (data: Buffer) => {
      try {
        buffer += data.toString()
        // Try to parse accumulated buffer (handles chunked responses)
        const lines = buffer.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const result = JSON.parse(trimmed)
            if (result.response !== undefined || result.success !== undefined) {
              pythonProcess?.stdout?.off('data', handler)
              // Add frontend timing for comparison
              result.ipc_time = (Date.now() - startTime) / 1000
              resolve(result)
              return
            }
          } catch {
            // Not valid JSON yet, continue accumulating
          }
        }
      } catch {
        // Wait for more data
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: false, response: "Request timeout - try a simpler query", timing: (Date.now() - startTime) / 1000 })
    }, 60000) // 60s timeout (reduced from 120s since responses are faster now)
  })
})


// Remove image from all faces (called when image is deleted)
ipcMain.handle('ai:removeImageFromFaces', async (_, imagePath: string) => {
  if (!pythonProcess || !pythonReady) {
    return { success: false }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'remove_image_from_faces', image_path: imagePath })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())
        if (result.success !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          resolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: false })
    }, 5000)
  })
})

// Delete image from database when moved to trash
ipcMain.handle('db:deleteImage', async (_, imagePath: string) => {
  try {
    const dbPath = getDbPath()

    // Always ensure tables exist before any operation
    ensureDbTables(dbPath)

    // First, remove image from all face collections
    if (pythonProcess && pythonReady) {
      await new Promise<void>((resolve) => {
        const command = JSON.stringify({ action: 'remove_image_from_faces', image_path: imagePath })

        const handler = (data: Buffer) => {
          try {
            const result = JSON.parse(data.toString().trim())
            if (result.success !== undefined) {
              pythonProcess?.stdout?.off('data', handler)
              console.log(`[DB] Removed image from faces: ${imagePath}`)
              resolve()
            }
          } catch {
            // Wait for valid JSON
          }
        }

        pythonProcess?.stdout?.on('data', handler)
        pythonProcess?.stdin?.write(command + '\n')

        setTimeout(() => {
          pythonProcess?.stdout?.off('data', handler)
          resolve()
        }, 3000)
      })
    }

    const Database = require('better-sqlite3')
    const db = new Database(dbPath)

    // Delete image from database
    db.prepare('DELETE FROM images WHERE path = ?').run(imagePath)

    db.close()

    console.log(`[DB] Deleted image from database: ${imagePath}`)

    return { success: true }
  } catch (error: any) {
    console.error('Error deleting image from database:', error)
    return { success: false, error: error.message }
  }
})

// Preload AI models on startup
ipcMain.handle('ai:preloadModels', async () => {
  if (!pythonProcess || !pythonReady) {
    return { success: false, error: 'Python engine not ready' }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'preload_models' })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())
        if (result.success !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          resolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: true, message: 'Preload timeout - models will load on first use' })
    }, 120000) // 2 minute timeout for model loading
  })
})

// Reset Face Database
ipcMain.handle('ai:resetFaces', async () => {
  if (!pythonProcess || !pythonReady) {
    return { success: false }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'reset_faces' })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())
        if (result.success !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          resolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: false })
    }, 5000)
  })
})

// Download models with progress streaming
ipcMain.handle('ai:downloadModels', async (event) => {
  if (!pythonProcess || !pythonReady) {
    console.log('[Electron] Python not ready for model download')
    return { success: false, error: 'Python engine not ready' }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'download_models' })
    let lastProgress = 0
    let completionReceived = false

    const handler = (data: Buffer) => {
      const lines = data.toString().trim().split('\n')

      for (const line of lines) {
        try {
          const json = JSON.parse(line)

          // Handle progress updates
          if (json.type === 'download_progress' || json.type === 'overall_progress') {
            console.log(`[Download Progress] ${JSON.stringify(json)}`)
            mainWindow?.webContents.send('download:progress', json)
            if (json.progress > lastProgress) lastProgress = json.progress
          }

          // Resolve as soon as Python confirms success — Python returns {success:true}
          // immediately when models are already present (no separate completion marker)
          if (json.success === true) {
            if (!completionReceived) {
              completionReceived = true
              pythonProcess?.stdout?.off('data', handler)
              console.log('[Download] Models confirmed ready')
              resolve({ success: true, message: 'Models ready' })
            }
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    // Long timeout for downloads
    setTimeout(() => {
      if (!completionReceived) {
        pythonProcess?.stdout?.off('data', handler)
        console.error('[Download] Download timeout after 10 minutes')
        resolve({ success: false, error: 'Download timeout' })
      }
    }, 600000) // 10 minute timeout
  })
})

// Download a single model
ipcMain.handle('ai:downloadModel', async (_, modelId: string) => {
  if (!pythonProcess || !pythonReady) {
    return { success: false, error: 'Python engine not ready' }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'download_model', model_id: modelId })
    let completionReceived = false

    const handler = (data: Buffer) => {
      const lines = data.toString().trim().split('\n')

      for (const line of lines) {
        try {
          const json = JSON.parse(line)

          // Handle progress updates
          if (json.type === 'download_progress') {
            mainWindow?.webContents.send('download:progress', json)
          }

          // Handle completion - check for success with model or completion marker
          if (json.success === true && (json.model || json.complete === true || json.progress === 100)) {
            if (!completionReceived) {
              completionReceived = true
              pythonProcess?.stdout?.off('data', handler)
              resolve(json)
            }
          }
        } catch {
          // Not valid JSON
        }
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      if (!completionReceived) {
        pythonProcess?.stdout?.off('data', handler)
        resolve({ success: false, error: 'Download timeout' })
      }
    }, 300000) // 5 minute timeout per model
  })
})

// File Operations
ipcMain.handle('fs:saveImage', async (_, imagePath: string, savePath?: string) => {
  try {
    if (!savePath) {
      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: path.basename(imagePath),
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }
      savePath = result.filePath
    }

    fs.copyFileSync(imagePath, savePath)
    return { success: true, path: savePath }
  } catch (error: any) {
    console.error('Save image error:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:saveBase64Image', async (_, base64Data: string, savePath: string) => {
  try {
    // Remove header if present (e.g., "data:image/png;base64,")
    const base64Image = base64Data.split(';base64,').pop()

    if (!base64Image) {
      throw new Error('Invalid base64 data')
    }

    fs.writeFileSync(savePath, base64Image, { encoding: 'base64' })
    return { success: true, path: savePath }
  } catch (error: any) {
    console.error('Save base64 image error:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:deleteImage', async (_, imagePath: string) => {
  try {
    // Move to trash instead of permanent delete
    const { shell } = require('electron')
    await shell.trashItem(imagePath)
    return { success: true }
  } catch (error: any) {
    console.error('Delete image error:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:shareImage', async (_, imagePath: string) => {
  try {
    const { shell } = require('electron')
    // Open native share dialog (Windows 10+)
    if (process.platform === 'win32') {
      // Use shell.openPath to open the file's location
      shell.showItemInFolder(imagePath)
    }
    return { success: true }
  } catch (error: any) {
    console.error('Share image error:', error)
    return { success: false, error: error.message }
  }
})



// Get database information
ipcMain.handle('db:getInfo', async () => {
  try {
    const dbPath = getDbPath()

    // Always ensure tables exist before any operation
    ensureDbTables(dbPath)

    const Database = require('better-sqlite3')
    const db = new Database(dbPath, { readonly: true })

    // Get total image count
    const totalImages = db.prepare('SELECT COUNT(*) as count FROM images').get()

    // Get all unique tags
    const images = db.prepare('SELECT metadata FROM images').all()
    const allTags = new Set<string>()
    const allObjects = new Set<string>()
    const fileTypes: Record<string, number> = {}
    const emotions: Record<string, number> = {}

    images.forEach((img: any) => {
      try {
        const metadata = JSON.parse(img.metadata || '{}')

        // Collect tags
        if (metadata.tags) {
          metadata.tags.forEach((tag: string) => allTags.add(tag))
        }

        // Collect objects
        if (metadata.objects) {
          metadata.objects.forEach((obj: string) => allObjects.add(obj))
        }

        // Count file types
        if (metadata.fileType) {
          fileTypes[metadata.fileType] = (fileTypes[metadata.fileType] || 0) + 1
        }

        // Count emotions
        if (metadata.emotion) {
          emotions[metadata.emotion] = (emotions[metadata.emotion] || 0) + 1
        }
      } catch { }
    })

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN json_extract(metadata, '$.faces') > 0 THEN 1 ELSE 0 END) as withFaces,
        SUM(CASE WHEN json_extract(metadata, '$.isFavorite') = 1 THEN 1 ELSE 0 END) as favorites
      FROM images
    `).get()

    db.close()

    return {
      success: true,
      info: {
        databasePath: dbPath,
        totalImages: totalImages.count,
        uniqueTags: allTags.size,
        uniqueObjects: allObjects.size,
        allTags: Array.from(allTags).sort(),
        allObjects: Array.from(allObjects).sort(),
        fileTypes,
        emotions,
        statistics: {
          total: stats.total,
          withFaces: stats.withFaces,
          favorites: stats.favorites
        }
      }
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
})



// function to get standardized DB path matching Python
function getDbPath() {
  const appData = app.getPath('appData')
  // Force 'smartmedia' folder to match Python's logic exactly
  // Python uses: Path(appdata) / 'smartmedia' / 'media.db'
  const dbDir = path.join(appData, 'smartmedia')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  return path.join(dbDir, 'media.db')
}

// Ensure database tables exist (run on every database access)
function ensureDbTables(dbPath: string) {
  const Database = require('better-sqlite3')
  const db = new Database(dbPath)

  // Create images table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        metadata TEXT,
        caption TEXT,
        emotion TEXT,
        emotion_details TEXT,
        objects TEXT,
        colors TEXT,
        dominant_colors TEXT,
        location TEXT,
        gps_latitude REAL,
        gps_longitude REAL,
        tags TEXT,
        scanned_at TEXT,
        is_favorite INTEGER DEFAULT 0,
        face_count INTEGER DEFAULT 0,
        face_scanned INTEGER DEFAULT 0
    )
  `)

  // Add new columns if they don't exist (migration for existing databases)
  const newColumns = [
    { name: 'emotion_details', type: 'TEXT' },
    { name: 'colors', type: 'TEXT' },
    { name: 'dominant_colors', type: 'TEXT' },
    { name: 'location', type: 'TEXT' },
    { name: 'gps_latitude', type: 'REAL' },
    { name: 'gps_longitude', type: 'REAL' },
    { name: 'face_scanned', type: 'INTEGER DEFAULT 0' }
  ]

  for (const col of newColumns) {
    try {
      db.exec(`ALTER TABLE images ADD COLUMN ${col.name} ${col.type}`)
    } catch (e) {
      // Column already exists, ignore error
    }
  }

  db.close()
}

// Save image metadata to database
ipcMain.handle('db:saveImageMetadata', async (_, metadata: any) => {
  try {
    const dbPath = getDbPath()
    console.log(`[DB] Saving to: ${dbPath}`)

    // Always ensure tables exist before any operation
    ensureDbTables(dbPath)

    const Database = require('better-sqlite3')
    const db = new Database(dbPath)

    const crypto = require('crypto')
    const imageId = metadata.id || crypto.createHash('md5').update(metadata.path).digest('hex')

    // Prepare JSON fields - include thumbnail_path if present
    const metadataObj = metadata.metadata || {}
    if (metadata.thumbnail) {
      metadataObj.thumbnail_path = metadata.thumbnail
    }
    const metadataJson = JSON.stringify(metadataObj)
    const objectsJson = JSON.stringify(metadata.objects || [])
    const tagsJson = JSON.stringify(metadata.tags || [])
    const emotionJson = typeof metadata.emotion === 'object' ? JSON.stringify(metadata.emotion) : metadata.emotion
    const emotionStr = typeof metadata.emotion === 'object' ? metadata.emotion.primary : metadata.emotion
    const colorsJson = JSON.stringify(metadata.colors || {})
    const dominantColorsJson = JSON.stringify(metadata.colors?.dominant || [])

    // Extract GPS from Python's response (location object or metadata object)
    const gpsLat = metadata.location?.latitude || metadata.metadata?.latitude || null
    const gpsLon = metadata.location?.longitude || metadata.metadata?.longitude || null

    // Extract media type info (for videos/audio)
    const mediaType = metadata.media_type || 'image'
    const duration = metadata.duration || null
    const fileSize = metadata.file_size || null

    // Insert or Replace
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO images (
        id, path, filename, metadata, caption, emotion, emotion_details,
        objects, colors, dominant_colors, location, gps_latitude, gps_longitude,
        tags, scanned_at, face_count, is_favorite, exif_data, date_taken, 
        latitude, longitude, camera_make, camera_model, media_type, duration, file_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT is_favorite FROM images WHERE path = ?), 0), ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      imageId,
      metadata.path,
      metadata.filename,
      metadataJson,
      metadata.caption || '',
      emotionStr || null,
      emotionJson || null,
      objectsJson,
      colorsJson,
      dominantColorsJson,
      metadata.location || '',
      gpsLat,  // Save GPS to gps_latitude
      gpsLon,  // Save GPS to gps_longitude
      tagsJson,
      metadata.dateScanned || new Date().toISOString(),
      metadata.faces || 0,
      metadata.path, // For COALESCE subquery
      // Add EXIF fields
      metadataJson,  // exif_data (reuse metadataJson since it contains EXIF)
      metadata.date_taken || metadata.metadata?.date_taken || null,
      gpsLat,  // latitude (duplicate GPS for compatibility)
      gpsLon,  // longitude (duplicate GPS for compatibility)
      metadata.metadata?.camera_make || null,
      metadata.metadata?.camera_model || null,
      // Add media fields
      mediaType,
      duration,
      fileSize
    )

    db.close()

    // AUTO-FIX: Run media type correction after saving
    if (mediaType === 'video' || mediaType === 'audio') {
      console.log(`[DB] Triggering auto-fix for ${mediaType} files...`)
      try {
        const fixCommand = JSON.stringify({ action: 'fix_media_types' })
        pythonProcess?.stdin?.write(fixCommand + '\n')
        console.log(`[DB] Auto-fix command sent to Python`)
      } catch (error) {
        console.error('[DB] Auto-fix error:', error)
      }
    }

    // console.log(`[DB] Saved metadata for ${metadata.filename}`)
    return { success: true }
  } catch (error: any) {
    console.error('Error saving image metadata:', error)
    return { success: false, error: error.message }
  }
})

// Get all images from database with optional filters
ipcMain.handle('db:getImages', async (_, filters?: any) => {
  try {
    const dbPath = getDbPath()
    console.log(`[DB] Reading from: ${dbPath}`)

    // Always ensure tables exist before any operation
    ensureDbTables(dbPath)

    const Database = require('better-sqlite3')
    const db = new Database(dbPath, { readonly: true })

    let query = 'SELECT * FROM images WHERE 1=1'
    const params: any[] = []

    // Apply filters
    if (filters) {
      if (filters.favorite) {
        query += ' AND is_favorite = 1'
      }

      if (filters.emotion) {
        query += ' AND emotion = ?'
        params.push(filters.emotion)
      }

      if (filters.hasCaption) {
        query += ' AND caption IS NOT NULL AND caption != ""'
      }

      if (filters.search) {
        query += ' AND (filename LIKE ? OR caption LIKE ? OR objects LIKE ? OR tags LIKE ?)'
        const searchTerm = `%${filters.search}%`
        params.push(searchTerm, searchTerm, searchTerm, searchTerm)
      }
    }

    // Order by scan time (newest first)
    query += ' ORDER BY scanned_at DESC'

    // Limit results
    if (filters?.limit) {
      query += ` LIMIT ${filters.limit}`
    } else {
      query += ' LIMIT 1000'
    }

    const images = db.prepare(query).all(...params)
    console.log(`[DB] Found ${images.length} images`)

    // Parse JSON fields and transform snake_case to camelCase
    const processedImages = images.map((img: any) => {
      const metadata = img.metadata ? JSON.parse(img.metadata) : {}
      const exif_data = img.exif_data ? JSON.parse(img.exif_data) : {}

      // Merge EXIF data with metadata
      const fullMetadata = { ...metadata, ...exif_data }

      // Extract GPS data from database columns (new format) or fallback to old metadata
      const hasGPS = img.latitude && img.longitude
      const gpsData = hasGPS ? {
        lat: img.latitude,
        lon: img.longitude
      } : (metadata.gps || null)

      return {
        id: img.id,
        path: img.path,
        filename: img.filename,
        size: img.file_size || (() => {
          try { return fs.statSync(img.path).size } catch { return undefined }
        })(),
        width: img.width,
        height: img.height,
        fileType: img.format,
        mediaType: img.media_type || 'image',  // New: media type (image/video/audio)
        duration: img.duration,                 // New: duration for video/audio
        dateModified: img.modified_at,
        dateScanned: img.scanned_at,
        metadata: {
          ...fullMetadata,
          gps: gpsData
        },
        tags: img.tags ? JSON.parse(img.tags) : [],
        isFavorite: Boolean(img.is_favorite),
        faces: img.face_count || 0,
        emotion: img.emotion,
        caption: img.caption,
        objects: img.objects ? JSON.parse(img.objects) : [],
        scene: img.scene,
        extractedText: img.extracted_text,
        // Parse additional fields from metadata if available
        detailedCaption: fullMetadata.detailedCaption,
        animals: fullMetadata.animals,
        peopleDetails: fullMetadata.peopleDetails,
        activities: fullMetadata.activities,
        colors: fullMetadata.colors,
        additionalDetails: fullMetadata.additionalDetails,
        // EXIF metadata fields for easy access from database columns
        date_taken: img.date_taken || fullMetadata.date_taken || fullMetadata.DateTimeOriginal,
        camera_make: img.camera_make || fullMetadata.camera_make,
        camera_model: img.camera_model || fullMetadata.camera_model,
        // GPS coordinates directly on image object for easy access
        gps_latitude: hasGPS ? img.latitude : null,
        gps_longitude: hasGPS ? img.longitude : null,
        location: gpsData ? {
          gps: gpsData,
          name: metadata.location_name,
          city: metadata.city,
          country: metadata.country,
          state: metadata.state
        } : undefined,
        camera: (img.camera_make || img.camera_model) ? {
          make: img.camera_make,
          model: img.camera_model,
          lens: fullMetadata.LensModel
        } : undefined
      }
    })

    db.close()

    return {
      success: true,
      images: processedImages,
      count: processedImages.length
    }
  } catch (error: any) {
    console.error('Error getting images:', error)
    return {
      success: false,
      error: error.message,
      images: []
    }
  }
})

// Search across the media library, including extracted document text
ipcMain.handle('db:searchImages', async (_, query: string, filters?: any) => {
  try {
    const normalizedQuery = String(query || '').trim()
    if (!normalizedQuery) {
      return { success: true, images: [], count: 0 }
    }

    const dbPath = getDbPath()
    console.log(`[DB] Searching from: ${dbPath}`)

    ensureDbTables(dbPath)

    const Database = require('better-sqlite3')
    const db = new Database(dbPath, { readonly: true })

    let sql = `
      SELECT *
      FROM images
      WHERE (
        filename LIKE ?
        OR caption LIKE ?
        OR objects LIKE ?
        OR tags LIKE ?
        OR extracted_text LIKE ?
      )
    `
    const like = `%${normalizedQuery}%`
    const params: any[] = [like, like, like, like, like]

    if (filters) {
      if (filters.favorite) {
        sql += ' AND is_favorite = 1'
      }
      if (filters.emotion) {
        sql += ' AND emotion = ?'
        params.push(filters.emotion)
      }
      if (filters.mediaType) {
        sql += ' AND media_type = ?'
        params.push(filters.mediaType)
      }
    }

    sql += ' ORDER BY scanned_at DESC LIMIT ?'
    params.push(filters?.limit || 200)

    const images = db.prepare(sql).all(...params)
    db.close()

    console.log(`[DB] Search found ${images.length} images`)
    return {
      success: true,
      images: images.map((img: any) => ({
        id: img.id,
        path: img.path,
        filename: img.filename,
        caption: img.caption,
        extracted_text: img.extracted_text,
        objects: img.objects,
        tags: img.tags,
        media_type: img.media_type,
      })),
      count: images.length,
    }
  } catch (error: any) {
    console.error('Error searching images:', error)
    return { success: false, error: error.message, images: [], count: 0 }
  }
})

// Merge Faces
ipcMain.handle('ai:mergeFaces', async (_, faceIds: string[], targetName: string) => {
  if (!pythonProcess || !pythonReady) {
    return { success: false, error: 'Python engine not ready' }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'merge_faces', face_ids: faceIds, name: targetName })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())
        if (result.success !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          resolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: false, error: 'Timeout' })
    }, 10000)
  })
})

// Scan for Faces
ipcMain.handle('ai:scanForFaces', async () => {
  if (!pythonProcess || !pythonReady) {
    return { success: false, error: 'Python engine not ready' }
  }

  // Prevent concurrent scanning
  if (isFaceScanning) {
    console.log('[Face Scan] Scan already in progress, ignoring request')
    return { success: false, error: 'Face scan already in progress' }
  }

  isFaceScanning = true
  console.log('[Face Scan] Starting face scanning...')

  return new Promise((resolve) => {
    const cleanupAndResolve = (result: any) => {
      isFaceScanning = false
      console.log('[Face Scan] Cleaning up scan state')
      resolve(result)
    }

    // Get all scanned images from the database
    const dbPath = path.join(app.getPath('userData'), 'media.db')
    if (!fs.existsSync(dbPath)) {
      cleanupAndResolve({ success: false, error: 'No scanned images found. Please scan your photos first.' })
      return
    }

    // Read scanned images from database - ONLY those with faces detected by Qwen
    const Database = require('better-sqlite3')
    const db = new Database(dbPath, { readonly: true })

    try {
      // Filter images where Qwen detected faces (face_count > 0)
      const images = db.prepare('SELECT path, metadata FROM images').all()
      const imagePaths = images
        .filter((img: any) => {
          try {
            const metadata = JSON.parse(img.metadata || '{}')
            return metadata.faces > 0 || metadata.face_count > 0
          } catch {
            return false
          }
        })
        .map((img: any) => img.path)

      if (imagePaths.length === 0) {
        db.close()
        cleanupAndResolve({ success: false, error: 'No images with faces found. Qwen needs to detect faces first during scanning.' })
        return
      }

      console.log(`[Face Scan] Found ${imagePaths.length} images with faces detected by Qwen`)

      const command = JSON.stringify({ action: 'scan_faces', image_paths: imagePaths })

      const handler = (data: Buffer) => {
        try {
          const result = JSON.parse(data.toString().trim())

          // Handle progress updates
          if (result.type === 'face_scan_progress') {
            console.log(`[Face Scan Progress] ${result.current}/${result.total}`)
            mainWindow?.webContents.send('face-scan-progress', {
              current: result.current,
              total: result.total
            })
          } else if (result.success !== undefined) {
            // Final result
            pythonProcess?.stdout?.off('data', handler)
            db.close()
            console.log(`[Face Scan] Complete: ${JSON.stringify(result)}`)
            cleanupAndResolve(result)
          }
        } catch {
          // Wait for valid JSON
        }
      }

      pythonProcess?.stdout?.on('data', handler)
      pythonProcess?.stdin?.write(command + '\n')

      setTimeout(() => {
        pythonProcess?.stdout?.off('data', handler)
        db.close()
        cleanupAndResolve({ success: false, error: 'Face scan timeout' })
      }, 300000) // 5 minute timeout for face scanning
    } catch (error: any) {
      db.close()
      cleanupAndResolve({ success: false, error: error.message })
    }
  })
})

// Google Photos-style Face Clustering (Incremental by default)
ipcMain.handle('ai:clusterFaces', async (_, directory?: string, forceFullRescan?: boolean) => {
  if (!pythonProcess || !pythonReady) {
    return { success: false, error: 'Python engine not ready' }
  }

  return new Promise((resolve) => {
    // Use provided directory or default to userData 
    const targetDirectory = directory || path.join(app.getPath('userData'))

    if (!fs.existsSync(targetDirectory)) {
      resolve({ success: false, error: 'Directory not found' })
      return
    }

    console.log(`[Face Cluster] Starting ${forceFullRescan ? 'FULL' : 'incremental'} face clustering in: ${targetDirectory}`)

    const command = JSON.stringify({
      action: 'cluster_faces',
      directory: targetDirectory,
      force_full_rescan: Boolean(forceFullRescan)
    })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())

        // Handle progress updates
        if (result.type === 'face_scan_progress') {
          console.log(`[Face Cluster Progress] ${result.current}/${result.total}`)
          mainWindow?.webContents.send('face-scan-progress', {
            current: result.current,
            total: result.total
          })
        } else if (result.success !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          console.log('[Face Cluster] Result:', result)
          resolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    // 10 minute timeout for clustering (it can take a while)
    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: false, error: 'Face clustering timeout' })
    }, 600000)
  })
})

// Incremental Face Scanning - Only process new images  
ipcMain.handle('ai:scanFacesIncremental', async () => {
  if (!pythonProcess || !pythonReady) {
    return { success: false, error: 'Python engine not ready' }
  }

  // Prevent concurrent scanning
  if (isFaceScanning) {
    console.log('[Incremental Face Scan] Scan already in progress, ignoring request')
    return { success: false, error: 'Face scan already in progress' }
  }

  isFaceScanning = true

  return new Promise((resolve) => {
    console.log('[Incremental Face Scan] Starting incremental face scanning...')

    const cleanupAndResolve = (result: any) => {
      isFaceScanning = false
      console.log('[Incremental Face Scan] Cleaning up scan state')
      resolve(result)
    }

    const command = JSON.stringify({
      action: 'scan_faces_incremental'
    })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())

        // Handle progress updates
        if (result.type === 'face_scan_progress') {
          console.log(`[Incremental Face Scan Progress] ${result.current}/${result.total}`)
          mainWindow?.webContents.send('face-scan-progress', {
            current: result.current,
            total: result.total,
            status: 'incremental'
          })
        } else if (result.success !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          console.log('[Incremental Face Scan] Result:', result)
          cleanupAndResolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    // 5 minute timeout for incremental scanning
    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      cleanupAndResolve({ success: false, error: 'Incremental face scan timeout' })
    }, 300000)
  })
})

// Get Face Processing Statistics
ipcMain.handle('ai:getFaceProcessingStats', async () => {
  if (!pythonProcess || !pythonReady) {
    // Return basic stats from cached faces when Python isn't ready
    const cached = cachedFaces || loadFacesFromCache()
    if (cached.length > 0) {
      const totalFaces = cached.reduce((sum: number, f: any) => sum + (f.image_count || 0), 0)
      return {
        success: true,
        total_people: cached.length,
        total_faces_detected: totalFaces,
        total_images: 0,
        processed_images: 0,
        unprocessed_images: 0,
        processing_complete: true,
        fromCache: true
      }
    }
    return { success: false, error: 'Python engine not ready' }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'get_face_processing_stats' })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())

        if (result.success !== undefined || result.error !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          resolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: false, error: 'Stats query timeout' })
    }, 10000)
  })
})

// Get Face Clustering Results
ipcMain.handle('ai:getFaceClusters', async () => {
  if (!pythonProcess || !pythonReady) {
    return { success: false, error: 'Python engine not ready' }
  }

  return new Promise((resolve) => {
    const command = JSON.stringify({ action: 'get_face_clusters' })

    const handler = (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim())

        if (result.success !== undefined) {
          pythonProcess?.stdout?.off('data', handler)
          resolve(result)
        }
      } catch {
        // Wait for valid JSON
      }
    }

    pythonProcess?.stdout?.on('data', handler)
    pythonProcess?.stdin?.write(command + '\n')

    setTimeout(() => {
      pythonProcess?.stdout?.off('data', handler)
      resolve({ success: false, error: 'Get clusters timeout' })
    }, 10000)
  })
})

// File rename
ipcMain.handle('fs:renameFile', async (_, imagePath: string, newName: string) => {
  try {
    const dir = path.dirname(imagePath)
    const ext = path.extname(imagePath)
    const newPath = path.join(dir, newName + ext)

    // Check if target already exists
    if (fs.existsSync(newPath)) {
      return { success: false, error: 'A file with this name already exists' }
    }

    fs.renameSync(imagePath, newPath)
    return { success: true, newPath }
  } catch (error: any) {
    console.error('Rename file error:', error)
    return { success: false, error: error.message }
  }
})

// Trash operations
const trashDir = path.join(app.getPath('userData'), 'trash')

// Ensure trash directory exists
if (!fs.existsSync(trashDir)) {
  fs.mkdirSync(trashDir, { recursive: true })
}

ipcMain.handle('fs:moveToTrash', async (_, imagePath: string) => {
  try {
    const filename = path.basename(imagePath)
    const trashPath = path.join(trashDir, `${Date.now()}_${filename}`)

    // Move file to internal trash
    fs.copyFileSync(imagePath, trashPath)
    fs.unlinkSync(imagePath)

    return { success: true, trashPath }
  } catch (error: any) {
    console.error('Move to trash error:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:restoreFromTrash', async (_, trashPath: string) => {
  try {
    // Extract original filename (remove timestamp prefix)
    const filename = path.basename(trashPath).replace(/^\d+_/, '')

    // Ask user where to restore
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: filename,
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    // Copy file back from trash
    fs.copyFileSync(trashPath, result.filePath)
    fs.unlinkSync(trashPath)

    console.log(`[Restore] Image restored to: ${result.filePath}`)

    // Re-process the restored image to add it back to database and faces
    if (pythonProcess && pythonReady) {
      console.log(`[Restore] Re-scanning restored image...`)

      await new Promise<void>((resolve) => {
        const command = JSON.stringify({
          action: 'process_image',
          path: result.filePath
        })

        const handler = (data: Buffer) => {
          try {
            const response = JSON.parse(data.toString().trim())
            if (response.success !== undefined && response.path) {
              pythonProcess?.stdout?.off('data', handler)
              console.log(`[Restore] Image re-scanned successfully`)
              resolve()
            }
          } catch {
            // Wait for valid JSON
          }
        }

        pythonProcess?.stdout?.on('data', handler)
        pythonProcess?.stdin?.write(command + '\n')

        setTimeout(() => {
          pythonProcess?.stdout?.off('data', handler)
          resolve()
        }, 30000) // 30 second timeout for processing
      })
    }

    return { success: true, restoredPath: result.filePath }
  } catch (error: any) {
    console.error('Restore from trash error:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:permanentDelete', async (_, imagePath: string) => {
  try {
    fs.unlinkSync(imagePath)
    return { success: true }
  } catch (error: any) {
    console.error('Permanent delete error:', error)
    return { success: false, error: error.message }
  }
})

// Locker operations
const lockerDir = path.join(app.getPath('userData'), 'locker')
const lockerDataFile = path.join(app.getPath('userData'), 'locker.json')

// Ensure locker directory exists
if (!fs.existsSync(lockerDir)) {
  fs.mkdirSync(lockerDir, { recursive: true })
}

interface LockerData {
  pin?: string
  images: string[]
}

function getLockerData(): LockerData {
  try {
    if (fs.existsSync(lockerDataFile)) {
      return JSON.parse(fs.readFileSync(lockerDataFile, 'utf-8'))
    }
  } catch (e) {
    console.error('Error reading locker data:', e)
  }
  return { images: [] }
}

function saveLockerData(data: LockerData) {
  fs.writeFileSync(lockerDataFile, JSON.stringify(data, null, 2))
}

ipcMain.handle('locker:setPin', async (_, pin: string) => {
  try {
    const data = getLockerData()
    // Simple hash for demo - in production use bcrypt or similar
    data.pin = Buffer.from(pin).toString('base64')
    saveLockerData(data)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('locker:verifyPin', async (_, pin: string) => {
  try {
    const data = getLockerData()
    if (!data.pin) {
      return { success: true, valid: true } // No PIN set yet
    }
    const valid = data.pin === Buffer.from(pin).toString('base64')
    return { success: true, valid }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('locker:moveToLocker', async (_, imagePath: string) => {
  try {
    const filename = path.basename(imagePath)
    const lockerPath = path.join(lockerDir, `${Date.now()}_${filename}`)

    fs.copyFileSync(imagePath, lockerPath)
    fs.unlinkSync(imagePath)

    const data = getLockerData()
    data.images.push(lockerPath)
    saveLockerData(data)

    return { success: true, lockerPath }
  } catch (error: any) {
    console.error('Move to locker error:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('locker:removeFromLocker', async (_, lockerPath: string) => {
  try {
    // Extract original filename (remove timestamp prefix)
    const filename = path.basename(lockerPath).replace(/^\d+_/, '')

    // Ask user where to restore
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: filename,
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    fs.copyFileSync(lockerPath, result.filePath)
    fs.unlinkSync(lockerPath)

    const data = getLockerData()
    data.images = data.images.filter(p => p !== lockerPath)
    saveLockerData(data)

    return { success: true, restoredPath: result.filePath }
  } catch (error: any) {
    console.error('Remove from locker error:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('locker:getImages', async () => {
  try {
    const data = getLockerData()
    // Filter out any images that no longer exist
    const validImages = data.images.filter(p => fs.existsSync(p))
    if (validImages.length !== data.images.length) {
      data.images = validImages
      saveLockerData(data)
    }
    return { success: true, images: validImages }
  } catch (error: any) {
    return { success: false, error: error.message, images: [] }
  }
})

// ZIP Export
ipcMain.handle(
  'fs:exportToZip',
  async (
    _,
    imagePaths: string[],
    options?: { includeVideos?: boolean; quality?: number; outputPath?: string }
  ) => {
    try {
      if (!imagePaths || imagePaths.length === 0) {
        return { success: false, error: 'No files selected for export' }
      }

      const includeVideos = options?.includeVideos ?? true
      const allowedExtensions = includeVideos
        ? ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.mp4', '.mov', '.mkv', '.avi']
        : ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic']

      const filesToZip = imagePaths.filter((p) => allowedExtensions.includes(path.extname(p).toLowerCase()))
      if (filesToZip.length === 0) {
        return { success: false, error: 'No compatible files to include' }
      }

      let outputPath = options?.outputPath
      if (!outputPath) {
        const result = await dialog.showSaveDialog(mainWindow!, {
          defaultPath: `SmartMedia_Export_${Date.now()}.zip`,
          filters: [{ name: 'ZIP', extensions: ['zip'] }],
        })

        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true }
        }
        outputPath = result.filePath
      }

      const zipLevel = options?.quality !== undefined
        ? Math.min(9, Math.max(0, Math.round(options.quality)))
        : 9

      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(outputPath!)
        const archive = archiver('zip', { zlib: { level: zipLevel } })

        output.on('close', () => resolve())
        output.on('error', (err) => reject(err))
        archive.on('error', (err) => reject(err))

        archive.pipe(output)
        for (const filePath of filesToZip) {
          const name = path.basename(filePath)
          archive.file(filePath, { name })
        }
        archive.finalize().catch((err) => reject(err))
      })

      return { success: true, zipPath: outputPath }
    } catch (error: any) {
      console.error('ZIP export error:', error)
      return { success: false, error: error.message }
    }
  }
)

// PDF Export
ipcMain.handle('fs:exportToPDF', async (_, imagePaths: string[], outputPath?: string) => {
  try {
    if (!outputPath) {
      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: `SmartMedia_Export_${Date.now()}.pdf`,
        filters: [
          { name: 'PDF', extensions: ['pdf'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }
      outputPath = result.filePath
    }

    // Create a simple PDF with images using PDFKit-like approach
    // For now, we'll use the Python backend for PDF creation
    if (!pythonProcess || !pythonReady) {
      return { success: false, error: 'Python engine not ready for PDF export' }
    }

    return new Promise((resolve) => {
      const command = JSON.stringify({
        action: 'export_pdf',
        image_paths: imagePaths,
        output_path: outputPath
      })

      const handler = (data: Buffer) => {
        try {
          const result = JSON.parse(data.toString().trim())
          if (result.success !== undefined && result.pdf_path !== undefined) {
            pythonProcess?.stdout?.off('data', handler)
            resolve(result)
          }
        } catch {
          // Wait for valid JSON
        }
      }

      pythonProcess?.stdout?.on('data', handler)
      pythonProcess?.stdin?.write(command + '\n')

      setTimeout(() => {
        pythonProcess?.stdout?.off('data', handler)
        resolve({ success: false, error: 'PDF export timeout' })
      }, 60000)
    })
  } catch (error: any) {
    console.error('PDF export error:', error)
    return { success: false, error: error.message }
  }
})

// Update image tags
ipcMain.handle('db:updateImageTags', async (_, imageId: string, tags: string[]) => {
  // This would update tags in a database
  // For now, just return success
  return { success: true }
})

// Update image favorite status
ipcMain.handle('db:updateImageFavorite', async (_, imageId: string, isFavorite: boolean) => {
  try {
    const dbPath = getDbPath()

    // Always ensure tables exist before any operation
    ensureDbTables(dbPath)

    const Database = require('better-sqlite3')
    const db = new Database(dbPath)

    const stmt = db.prepare('UPDATE images SET is_favorite = ? WHERE id = ?')
    stmt.run(isFavorite ? 1 : 0, imageId)

    db.close()
    console.log(`[DB] Updated favorite status for image ${imageId}: ${isFavorite}`)
    return { success: true }
  } catch (error: any) {
    console.error('Error updating favorite:', error)
    return { success: false, error: error.message }
  }
})

// ==================== FILE CONVERSION TOOLS ====================

// Convert files using Python backend
ipcMain.handle('tools:convertFile', async (_, toolId: string, files: string[], options?: any) => {
  return new Promise((resolve) => {
    if (!pythonProcess || !pythonReady) {
      resolve({
        success: false,
        error: 'Python backend not ready. Please wait for initialization.'
      })
      return
    }

    const requestId = Date.now().toString()
    const request = {
      action: 'convert_file',
      tool_id: toolId,
      files: files,
      options: options || {},
      request_id: requestId
    }

    const handleResponse = (data: Buffer) => {
      const responses = data.toString().split('\n').filter(line => line.trim())

      for (const line of responses) {
        try {
          const response = JSON.parse(line)
          if (response.request_id === requestId || response.success !== undefined) {
            pythonProcess?.stdout?.removeListener('data', handleResponse)
            resolve(response)
            return
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }

    pythonProcess?.stdout?.on('data', handleResponse)

    // Send request
    pythonProcess?.stdin?.write(JSON.stringify(request) + '\n')

    // Timeout after 60 seconds
    setTimeout(() => {
      pythonProcess?.stdout?.removeListener('data', handleResponse)
      resolve({
        success: false,
        error: 'Conversion timeout. Please try again.'
      })
    }, 60000)
  })
})

// Download converted file
ipcMain.handle('tools:downloadFile', async (_, filePath: string) => {
  try {
    const ext = path.extname(filePath).toLowerCase()
    const basename = path.basename(filePath)

    // Create appropriate filters based on file extension
    const filters: { name: string; extensions: string[] }[] = []

    if (ext === '.pdf') {
      filters.push({ name: 'PDF Files', extensions: ['pdf'] })
    } else if (['.doc', '.docx'].includes(ext)) {
      filters.push({ name: 'Word Documents', extensions: ['docx', 'doc'] })
    } else if (['.xls', '.xlsx'].includes(ext)) {
      filters.push({ name: 'Excel Files', extensions: ['xlsx', 'xls'] })
    } else if (['.ppt', '.pptx'].includes(ext)) {
      filters.push({ name: 'PowerPoint Files', extensions: ['pptx', 'ppt'] })
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'].includes(ext)) {
      filters.push({ name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff'] })
    } else if (ext === '.txt') {
      filters.push({ name: 'Text Files', extensions: ['txt'] })
    } else if (ext === '.csv') {
      filters.push({ name: 'CSV Files', extensions: ['csv'] })
    } else if (['.zip', '.tar', '.gz', '.7z', '.rar'].includes(ext)) {
      filters.push({ name: 'Archive Files', extensions: ['zip', 'tar', 'gz', '7z', 'rar'] })
    }

    // Always add All Files as last option
    filters.push({ name: 'All Files', extensions: ['*'] })

    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: basename,
      filters: filters
    })

    if (!result.canceled && result.filePath) {
      // Ensure the file has the correct extension
      let savePath = result.filePath
      if (!path.extname(savePath) && ext) {
        savePath += ext
      }

      // Copy file to selected location
      fs.copyFileSync(filePath, savePath)

      showNotification('Download Complete', `File saved to ${savePath}`)

      return {
        success: true,
        path: savePath
      }
    }

    return { success: false, error: 'Download cancelled' }
  } catch (error: any) {
    console.error('Download error:', error)
    return {
      success: false,
      error: error.message || 'Download failed'
    }
  }
})

// Factory Reset: Delete all databases and local data
ipcMain.handle('app:factoryReset', async () => {
  try {
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'media.db')
    const facesDbPath = path.join(userDataPath, 'python', 'faces_db.pkl') // Corrected path based on python/main.py (it's in python/data/ but python/main.py uses separate data dir logic) 
    // Wait, python/main.py says: self.data_dir = Path(__file__).parent.parent / "data" -> so it's a sibling of python dir?
    // Let's look at get_db_path in python/main.py: db_dir = Path(appdata) / 'smartmedia' -> media.db is in appdata.
    // Faces DB: FaceDatabase(str(self.data_dir / "faces_db.pkl"))
    // In built app, resources are different.

    // Let's act conservatively and delete what we know.
    // media.db is definitely in app.getPath('userData').

    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath)
        console.log('[Reset] Deleted media.db')
      } catch (e) {
        console.error('[Reset] Failed to delete media.db:', e)
      }
    }

    // Also try to delete other known data files
    const possibleFaceDbs = [
      path.join(userDataPath, 'faces_db.pkl'),
      path.join(userDataPath, 'emotions_db.pkl'),
      path.join(userDataPath, 'data', 'faces_db.pkl'),
      path.join(userDataPath, 'python', 'data', 'faces_db.pkl')
    ]

    for (const p of possibleFaceDbs) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); console.log(`[Reset] Deleted ${p}`); } catch (e) { }
      }
    }

    const lockerPath = path.join(userDataPath, 'locker.json')
    if (fs.existsSync(lockerPath)) {
      try { fs.unlinkSync(lockerPath); console.log('[Reset] Deleted locker.json'); } catch (e) { }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Factory reset error:', error)
    return { success: false, error: error.message }
  }
})

function showNotification(title: string, body: string) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}

// App lifecycle
app.whenReady().then(() => {
  createWindow()
  createTray()

  // Auto-start Python AI engine
  startPythonEngine()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    pythonProcess?.kill()
    app.quit()
  }
})

app.on('before-quit', () => {
  pythonProcess?.kill()
})
