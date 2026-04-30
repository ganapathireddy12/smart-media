# SmartMedia - Project Appendix

## Table of Contents
1. [Source Code Snippets](#source-code-snippets)
2. [System Requirements](#system-requirements)
3. [Installation Guide](#installation-guide)
4. [API Reference](#api-reference)
5. [Configuration Guide](#configuration-guide)
6. [Troubleshooting](#troubleshooting)

---

## Source Code Snippets

### IPC Bridge - Electron to Python Communication

```typescript
// electron/main.ts - IPC Handler Setup
import { ipcMain } from 'electron';

ipcMain.handle('analyze-media', async (event, imagePath: string) => {
  try {
    const response = await fetch('http://localhost:5000/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_path: imagePath })
    });
    
    const result = await response.json();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

**Purpose:** Establishes secure communication between Electron frontend and Python backend for image analysis.

---

### Zustand Store - State Management

```typescript
// src/store/appStore.ts
import { create } from 'zustand';

interface AppState {
  currentScreen: string;
  showAiChatbot: boolean;
  mediaItems: MediaItem[];
  selectedAlbum: Album | null;
  setCurrentScreen: (screen: string) => void;
  toggleAiChatbot: () => void;
  addMediaItems: (items: MediaItem[]) => void;
  selectAlbum: (album: Album) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentScreen: 'home',
  showAiChatbot: false,
  mediaItems: [],
  selectedAlbum: null,
  
  setCurrentScreen: (screen) => set({ currentScreen: screen }),
  toggleAiChatbot: () => set((state) => ({ 
    showAiChatbot: !state.showAiChatbot 
  })),
  addMediaItems: (items) => set((state) => ({ 
    mediaItems: [...state.mediaItems, ...items] 
  })),
  selectAlbum: (album) => set({ selectedAlbum: album })
}));
```

**Purpose:** Centralized state management for application UI and data.

---

### AI Engine - Image Analysis

```python
# python/ai/engine.py
from transformers import Qwen2VLForConditionalGeneration
import torch

class AIEngine:
    def __init__(self, device='cuda' if torch.cuda.is_available() else 'cpu'):
        self.device = device
        self.model = Qwen2VLForConditionalGeneration.from_pretrained(
            "Qwen/Qwen2-VL-2B-Instruct",
            torch_dtype=torch.float16 if device == 'cuda' else torch.float32,
            device_map="auto"
        )
    
    def analyze_image(self, image_path: str) -> dict:
        """Analyze image and return captions, tags, and objects."""
        prompt = """Analyze this image and provide:
1. TYPE: selfie/screenshot/document/landscape/food/other
2. MOOD: happy/sad/neutral/calm
3. DESCRIPTION: One detailed sentence
4. OBJECTS: List of detected items
5. PEOPLE_COUNT: Number of people"""
        
        # Process image...
        result = self.model.generate(...)
        return {
            'caption': result['description'],
            'objects': result['objects'],
            'type': result['type'],
            'mood': result['mood']
        }
```

**Purpose:** Core AI inference engine using Qwen2-VL for image understanding.

---

### Database Query - Media Search

```python
# python/database/queries.py
import sqlite3
from typing import List

class MediaDatabase:
    def __init__(self, db_path: str = 'smartmedia.db'):
        self.conn = sqlite3.connect(db_path)
    
    def search_by_tags(self, tags: List[str]) -> List[dict]:
        """Search media items by tags with similarity matching."""
        query = """
        SELECT m.id, m.filename, m.caption, GROUP_CONCAT(t.tag_name)
        FROM media_items m
        LEFT JOIN tags t ON m.id = t.media_id
        WHERE t.tag_name IN ({})
        GROUP BY m.id
        """.format(','.join(['?' for _ in tags]))
        
        cursor = self.conn.execute(query, tags)
        return [
            {'id': row[0], 'filename': row[1], 'caption': row[2], 'tags': row[3].split(',')}
            for row in cursor.fetchall()
        ]
    
    def get_session_stats(self) -> dict:
        """Get session statistics."""
        query = """
        SELECT 
            COUNT(*) as total_items,
            COUNT(DISTINCT face_id) as unique_faces,
            COUNT(DISTINCT album_id) as albums
        FROM media_items
        """
        result = self.conn.execute(query).fetchone()
        return {
            'total_items': result[0],
            'unique_faces': result[1],
            'albums': result[2]
        }
```

**Purpose:** Database queries for media search, filtering, and statistics.

---

### Face Recognition - Clustering

```python
# python/face/recognizer.py
from sklearn.cluster import AgglomerativeClustering
import numpy as np

class FaceRecognizer:
    def __init__(self, threshold: float = 0.6):
        self.threshold = threshold
    
    def cluster_faces(self, encodings: np.ndarray) -> dict:
        """Cluster similar faces using agglomerative clustering."""
        if len(encodings) == 0:
            return {}
        
        clustering = AgglomerativeClustering(
            n_clusters=None,
            linkage='average',
            distance_threshold=1 - self.threshold
        )
        
        labels = clustering.fit_predict(encodings)
        
        clusters = {}
        for idx, label in enumerate(labels):
            if label not in clusters:
                clusters[label] = []
            clusters[label].append(idx)
        
        return clusters
```

**Purpose:** Groups similar faces for organization and identification.

---

### React Component - Media Grid

```typescript
// src/components/MediaGrid.tsx
import React, { useCallback } from 'react';
import Masonry from 'react-masonry-css';
import { useAppStore } from '../store/appStore';

export const MediaGrid: React.FC = () => {
  const mediaItems = useAppStore((state) => state.mediaItems);
  
  const handleMediaClick = useCallback((item: MediaItem) => {
    // Open media preview
    console.log('Opening:', item.id);
  }, []);
  
  return (
    <Masonry
      breakpointCols={{ default: 6, 1200: 4, 768: 2, 480: 1 }}
      className="masonry-grid"
      columnClassName="masonry-grid-col"
    >
      {mediaItems.map((item) => (
        <div
          key={item.id}
          onClick={() => handleMediaClick(item)}
          className="media-card cursor-pointer hover:opacity-80"
        >
          <img
            src={item.thumbnail}
            alt={item.filename}
            className="w-full aspect-square object-cover rounded"
          />
          <div className="p-2">
            <p className="text-sm font-semibold truncate">{item.emoji} {item.filename}</p>
            <p className="text-xs text-gray-400">{item.caption}</p>
          </div>
        </div>
      ))}
    </Masonry>
  );
};
```

**Purpose:** Responsive grid layout for displaying media items with masonry layout.

---

### HTTP Server - Route Handler

```python
# python/server/routes.py
from fastapi import FastAPI, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI()

@app.post("/analyze")
async def analyze_media(image_path: str) -> JSONResponse:
    """Analyze image and return metadata."""
    try:
        ai_engine = AIEngine()
        result = ai_engine.analyze_image(image_path)
        
        # Save to database
        db = MediaDatabase()
        db.save_media_item({
            'path': image_path,
            'caption': result['caption'],
            'tags': result['objects'],
            'type': result['type']
        })
        
        return JSONResponse({
            'success': True,
            'data': result
        })
    except Exception as e:
        return JSONResponse({
            'success': False,
            'error': str(e)
        }, status_code=500)

@app.get("/search")
async def search_media(query: str) -> JSONResponse:
    """Search media by natural language query."""
    db = MediaDatabase()
    results = db.search_by_tags(query.split())
    return JSONResponse({'results': results})
```

**Purpose:** REST API endpoints for frontend-backend communication.

---

## System Requirements

### Minimum Specifications
- **OS**: Windows 10/11, macOS 10.15+, or Linux (Ubuntu 20.04+)
- **CPU**: 4-core processor (Intel i5 / AMD Ryzen 5 equivalent)
- **RAM**: 8GB (16GB recommended)
- **Storage**: 10GB free space (3GB for AI models)
- **GPU**: Optional NVIDIA GPU with 6GB+ VRAM for acceleration

### Software Requirements
- **Node.js**: 18.x or higher
- **Python**: 3.9 to 3.12
- **npm**: 9.0.0 or higher
- **Git**: Latest version (for cloning)

### Recommended Configuration
- **CPU**: 6+ cores for faster processing
- **RAM**: 16GB or more
- **GPU**: NVIDIA RTX 3060 or better (12GB VRAM)
- **Storage**: SSD (NVMe preferred) for faster model loading

---

## Installation Guide

### Step 1: Clone the Repository

```bash
# Clone frontend and backend
cd /path/to/projects
git clone https://github.com/yourusername/smartmedia.git
cd smartmedia
```

### Step 2: Frontend Setup

```bash
# Install Node.js dependencies
npm install

# Build frontend assets
npm run build

# Start development server
npm run dev
```

**Expected Output:**
```
VITE v5.0.8  ready in XXX ms

➜  Local:   http://localhost:5173/
```

### Step 3: Python Backend Setup

```bash
# Navigate to python folder
cd python

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Download AI models (first run only)
python download_models.py

# Start backend server
python main.py
```

**Expected Output:**
```
[INFO] Starting SmartMedia Backend...
[INFO] Loading Qwen2-VL model...
[INFO] Server running on http://localhost:5000
```

### Step 4: Start Electron Application

```bash
# From project root
npm run electron:dev
```

**Expected Output:**
```
[Electron] App started successfully
[IPC] Connected to Python backend
[UI] Ready for user input
```

---

## API Reference

### Media Analysis Endpoint

**POST** `/analyze`

Request:
```json
{
  "image_path": "/path/to/image.jpg",
  "extract_faces": true,
  "extract_text": true
}
```

Response:
```json
{
  "success": true,
  "data": {
    "caption": "A sunset at the beach with calm waves",
    "objects": ["sunset", "beach", "ocean", "person"],
    "type": "landscape",
    "mood": "calm",
    "face_count": 1,
    "text_extracted": "No visible text"
  }
}
```

---

### Search Endpoint

**GET** `/search?query=dogs+at+beach`

Response:
```json
{
  "results": [
    {
      "id": "img_001",
      "filename": "IMG_0001.jpg",
      "caption": "Dogs playing at the beach",
      "tags": ["dogs", "beach", "ocean", "sunny"],
      "emoji": "🐕"
    }
  ],
  "total": 1,
  "time_ms": 245
}
```

---

### Face Detection Endpoint

**POST** `/faces/detect`

Request:
```json
{
  "image_path": "/path/to/image.jpg"
}
```

Response:
```json
{
  "success": true,
  "faces": [
    {
      "id": "face_001",
      "encoding": [0.234, -0.156, 0.892, ...],
      "box": {"x": 100, "y": 50, "width": 150, "height": 180},
      "confidence": 0.95
    }
  ]
}
```

---

### Database Statistics Endpoint

**GET** `/stats`

Response:
```json
{
  "total_media": 1247,
  "total_faces": 234,
  "albums": 8,
  "last_scan": "2024-03-04T14:32:15Z",
  "database_size_mb": 125.4
}
```

---

## Configuration Guide

### Environment Variables

Create `.env` file in project root:

```bash
# Backend Configuration
PYTHON_PORT=5000
MODEL_DEVICE=cuda  # or cpu
MODEL_QUANTIZE=true
MAX_IMAGE_SIZE=256

# Frontend Configuration
VITE_API_URL=http://localhost:5000
VITE_APP_NAME=SmartMedia

# Database Configuration
DATABASE_PATH=./data/smartmedia.db
DATABASE_ENABLE_WAL=true

# AI Model Configuration
TRANSFORMERS_CACHE=./models
TORCH_HOME=./models
```

### Model Configuration

Edit `python/main.py` to adjust:

```python
# Performance Tuning
MAX_IMAGE_SIZE = 256           # Smaller = faster
MAX_OUTPUT_TOKENS = 180        # Response length
FACE_SCAN_SIZE = 1280          # Face detection size
USE_QUANTIZATION = True        # 4-bit quantization
USE_PARALLEL_PROCESSING = True # Batch processing

# GPU Configuration
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
TORCH_DTYPE = torch.float16 if device == 'cuda' else torch.float32
```

### Database Configuration

SQLite with Write-Ahead Logging (WAL):

```bash
# Auto-enabled in main.py
# For manual optimization:
sqlite3 smartmedia.db "PRAGMA journal_mode=WAL;"
sqlite3 smartmedia.db "PRAGMA synchronous=NORMAL;"
sqlite3 smartmedia.db "PRAGMA cache_size=10000;"
```

---

## Troubleshooting

### Issue: "Python backend not responding"

**Solution:**
1. Verify Python is running: `ps aux | grep python`
2. Check port 5000 is available: `netstat -an | grep 5000`
3. Restart backend:
   ```bash
   cd python
   python main.py
   ```

---

### Issue: "AI Model download fails"

**Solution:**
1. Check internet connection
2. Manually download model:
   ```bash
   python -m download_models.py
   ```
3. Clear cache and retry:
   ```bash
   rm -rf ~/.cache/huggingface/
   python main.py
   ```

---

### Issue: "GPU out of memory (CUDA OOM)"

**Solution:**
1. Enable quantization in `.env`:
   ```bash
   USE_QUANTIZATION=true
   ```
2. Reduce image size:
   ```bash
   MAX_IMAGE_SIZE=224
   ```
3. Fall back to CPU:
   ```bash
   DEVICE=cpu
   ```

---

### Issue: "Database locked error"

**Solution:**
1. Check if another instance is running
2. Kill any stuck processes:
   ```bash
   pkill -f "python main.py"
   ```
3. Enable WAL mode:
   ```bash
   sqlite3 data/smartmedia.db "PRAGMA journal_mode=WAL;"
   ```

---

### Issue: "UI is slow/frozen during scanning"

**Solution:**
1. Verify background worker is running
2. Check if GPU is utilized:
   ```bash
   nvidia-smi
   ```
3. Reduce batch size in settings
4. Check system resources:
   ```bash
   # Windows
   tasklist | grep node
   tasklist | grep python
   
   # Linux/macOS
   ps aux | grep node
   ps aux | grep python
   ```

---

### Issue: "Face recognition not working"

**Solution:**
1. Verify dlib installation:
   ```bash
   python -c "import dlib; print('dlib OK')"
   ```
2. Reinstall face recognition:
   ```bash
   pip install --force-reinstall face-recognition
   ```
3. Check face detection logs:
   ```bash
   # Enable debug logging in main.py
   logging.basicConfig(level=logging.DEBUG)
   ```

---

## Performance Optimization Tips

### For Faster Processing
1. Enable GPU acceleration (NVIDIA CUDA 11.8+)
2. Use quantization: `USE_QUANTIZATION=true`
3. Reduce image size: `MAX_IMAGE_SIZE=224`
4. Close other applications to free RAM

### For Better UI Responsiveness
1. Enable background processing queue
2. Reduce progress update frequency
3. Use SSD for database storage
4. Keep 2GB+ free RAM available

### For Lower Memory Usage
1. Enable 4-bit quantization (reduces 4GB to 1.5GB)
2. Clear model cache periodically: `pip cache purge`
3. Disable face clustering if not needed
4. Reduce thumbnail cache size

---

## Quick Commands Reference

### Development
```bash
# Start all services
npm run dev &
cd python && python main.py &

# Build for production
npm run build
npm run electron:build

# Run tests
npm test
pytest python/test/
```

### Database Management
```bash
# Backup database
cp data/smartmedia.db data/smartmedia.db.backup

# Reset database
rm data/smartmedia.db

# View database schema
sqlite3 data/smartmedia.db ".schema"
```

### Debugging
```bash
# Enable verbose logging
RUST_LOG=debug npm run dev

# Profile performance
python -m cProfile -s cumulative python/main.py

# Monitor GPU usage
watch -n 1 nvidia-smi
```

---

**Last Updated:** March 4, 2026  
**Version:** 2.0+  
**Status:** Ready for Production
