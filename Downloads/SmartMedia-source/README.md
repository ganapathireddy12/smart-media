# SmartMedia - AI-Powered Media Organizer

Automatically tag, caption, and organize your photos using state-of-the-art AI - **100% offline** on your computer.

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.9%2B-blue.svg)
![Node](https://img.shields.io/badge/node-18%2B-green.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

<div align="center">
  <img src="https://img.shields.io/badge/AI-Qwen2--VL-orange.svg" alt="AI Model" />
  <img src="https://img.shields.io/badge/Framework-Electron-blue.svg" alt="Framework" />
  <img src="https://img.shields.io/badge/UI-React-61dafb.svg" alt="UI" />
</div>

---

## ✨ Features

### 🤖 **Powered by Qwen2-VL 2B**
- **One Model, Everything:** Single vision-language AI handles all tasks
- **Detailed Captions:** Natural language descriptions of images
- **Object Detection:** Identifies 12-18 objects per image
- **Scene Understanding:** Indoor/outdoor, location type classification
- **Face Detection:** Counts people and describes appearances
- **Text Recognition:** Extracts visible text from images
- **Smart Categorization:** Auto-organizes into 8+ album types

### 🎯 **Smart Organization**
- 📸 **Auto Albums:** Selfies, People, Nature, Food, Screenshots, Events
- 🔍 **Natural Language Search:** "dogs at the beach" or "sunset photos"
- 🗂️ **Tag-Based Filtering:** Fast object and scene searches
- 📅 **Date Organization:** By EXIF date taken
- 🗺️ **Location Support:** GPS coordinates from photos

### 💬 **AI Chatbot**
- Ask questions: "What's in this photo?"
- Search: "find all beach photos"
- Get statistics: "how many selfies do I have?"
- Natural conversation about your library

### 🚀 **Performance**
- **Fast Mode:** 8-15 seconds per image (CPU)
- **GPU Accelerated:** 3-8 seconds per image (NVIDIA GPU)
- **4-bit Quantization:** 2-5 seconds per image (75% less VRAM)
- **Optimized Pipeline:** Parallel processing, caching, smart resizing

### 🔒 **Privacy First**
- **100% Offline:** All AI runs locally on your machine
- **No Cloud:** Your photos never leave your computer
- **Local Database:** SQLite stores metadata locally
- **No Telemetry:** No data collection or phone-home

---

## 🏗️ Architecture

### Frontend
- **Electron.js** - Cross-platform desktop app
- **React.js** - Modern reactive UI
- **TypeScript** - Type-safe code
- **TailwindCSS** - Beautiful styling
- **Zustand** - State management
- **Vite** - Lightning-fast builds

### AI Engine (Python)
- **Qwen2-VL 2B** (4.5GB) - Vision-language model
  - Image captioning
  - Object detection
  - Scene classification
  - Text recognition (OCR)
  - Face detection
- **Sentence Transformers** - Semantic search embeddings
- **Face Recognition** - Face encodings and matching
- **PyTorch** - Deep learning framework

### Storage
- **SQLite** - Fast local database
- **Better-sqlite3** - Native Node.js SQLite bindings

**Total AI Models:** ~5GB  
**System Requirements:** 8GB RAM minimum, 16GB recommended

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** - [Download](https://nodejs.org/)
- **Python 3.9-3.12** - [Download](https://www.python.org/)
- **10GB free storage** - For models and workspace

### Installation (5 minutes)

```bash
# 1. Get the project
cd /path/to/SmartMedia

# 2. Install Node dependencies
npm install

# 3. Setup Python environment
cd python
python -m venv venv

# Activate virtual environment:
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install Python packages
pip install --upgrade pip
pip install -r requirements.txt

# 4. Return to project root
cd ..

# 5. Run the application
npm run dev
```

**First run:** AI models download automatically (~5GB, 10-20 min)

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| **[INSTALLATION.md](INSTALLATION.md)** | Complete setup guide with troubleshooting |
| **[QUICK_START.md](QUICK_START.md)** | Get running in 5 minutes |
| **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** | Common issues and solutions |
| **[PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md)** | Technical architecture details |

---

## 🎯 Usage

### 1. Start the App
```bash
npm run dev
```

### 2. Scan Photos
1. Click **"Scan Folder"** button
2. Select folder with images
3. Watch AI analyze each photo (8-15s per image)

### 3. Browse & Search
- **Albums:** Auto-organized categories
- **Search Bar:** Natural language queries
- **Filters:** By date, location, objects
- **Chat:** Ask AI about your photos

---

## ⚡ Performance Optimization

### Current Settings (Optimized for Speed)

✅ **Image Resolution:** 384px early resize, 448px for AI  
✅ **Token Generation:** 120 tokens (balanced)  
✅ **RAG Enhancement:** Disabled by default  
✅ **Thread Count:** 4 threads for parallel ops  
✅ **Inference Mode:** PyTorch inference_mode()  
✅ **4-bit Ready:** Automatic if bitsandbytes installed  

### Enable GPU Acceleration

**For NVIDIA GPU users (3x speedup):**

```bash
cd python
# Activate venv first!

# Install CUDA PyTorch
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Verify
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"
```

**Expected Performance:**
- CPU: 8-15 seconds per image
- GPU: 3-8 seconds per image  
- GPU + 4-bit: 2-5 seconds per image

---

## 🗂️ Project Structure

```
SmartMedia/
├── electron/              # Electron main process
│   ├── main.ts           # App entry point
│   └── preload.ts        # Bridge API
├── src/                  # React frontend
│   ├── components/       # UI components
│   ├── pages/           # Screen components
│   ├── store/           # State management
│   └── App.tsx          # Root component
├── python/               # Python AI engine
│   ├── main.py          # AI processing (4200+ lines)
│   ├── converter.py     # File conversion
│   ├── requirements.txt # Python deps
│   └── scripts/         # Utility scripts
├── models/               # Downloaded AI models (~5GB)
├── public/               # Static assets
├── INSTALLATION.md       # Setup guide
├── QUICK_START.md        # Quick guide
└── package.json          # Node dependencies
```

---

## 🛠️ Development

### Available Scripts

```bash
# Development mode
npm run dev              # Start Vite + Electron

# Production build
npm run build            # Build for production
npm run electron:build   # Package as desktop app

# Database tools
cd python
python scripts/view_database.py    # View all images
python scripts/create_database.py  # Reset database
```

### Tech Stack Details

**Frontend:**
- React 18
- TypeScript 5
- TailwindCSS 3
- Vite 5
- Electron 28

**AI/ML:**
- PyTorch 2.10+
- Transformers 4.45+
- Qwen2-VL-2B-Instruct
- Sentence-Transformers
- BitsAndBytes (optional, for 4-bit)

---

## 📱 Application Screens

### Main Gallery
Beautiful masonry grid layout with smart auto-organization

### Albums View  
Auto-categorized into Selfies, People, Nature, Food, and more

### AI Chat
Natural language interaction with your photo library

### Search
Semantic search with object and scene filtering

---

## 🤝 Contributing

We welcome contributions! 

---

## 📝 License

This project is licensed under the MIT License.

---

## 🙏 Acknowledgments

- **Qwen Team** - For the Qwen2-VL vision-language model
- **HuggingFace** - For Transformers library
- **Electron & React** - For enabling desktop apps

---

## 📞 Support

- 📖 **Documentation:** [INSTALLATION.md](INSTALLATION.md), [QUICK_START.md](QUICK_START.md)
- 🐛 **Issues:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

**Built with ❤️ for intelligent photo organization**

1. **Splash Screen** - Animated intro with branding
2. **Name Screen** - User onboarding
3. **Model Download** - Download AI models with progress
4. **Folder Selection** - Choose folder to scan
5. **Scanning Screen** - Real-time AI processing view
6. **Home Gallery** - Pinterest-style photo grid with filters

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guide.
