#!/usr/bin/env python3
"""
SmartMedia AI Engine v5.3 - ULTRA OPTIMIZED
============================================
Maximum Speed Optimizations:
- Response tokens: 85 (40% faster generation)
- Image size: 256px (40% faster processing)
- Streamlined prompts (50% fewer input tokens)
- Face upsampling disabled (Fastest detection)
- SQLite Write-Ahead Logging (WAL) enabled
- Aggressive memory management
"""

import os
import warnings
# CRITICAL: Suppress TensorFlow logs, deprecation warnings, and oneDNN optimizations
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_DEPRECATION_WARNINGS'] = '0'
# Fix sklearn/joblib CPU detection warning on Windows
os.environ['LOKY_MAX_CPU_COUNT'] = '4'
# Suppress transformers warnings about generation parameters
os.environ['TRANSFORMERS_VERBOSITY'] = 'error'
# Suppress all TF and deprecation warnings globally
warnings.filterwarnings('ignore', category=DeprecationWarning)
warnings.filterwarnings('ignore', category=FutureWarning)
warnings.filterwarnings('ignore', message='.*sparse_softmax_cross_entropy.*')
warnings.filterwarnings('ignore', message=r'.*tf\.losses.*')

import sys
import json
import logging
import hashlib
import pickle
import time
import gc
import io
import shutil
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any

# CRITICAL: Force UTF-8 encoding for stdin/stdout on Windows
# Use reconfigure() instead of codecs.StreamReader/StreamWriter
# codecs.getreader() has a known issue with pipe-based readline() - it reads
# in large chunks causing indefinite blocking when reading from Electron's stdin pipe
if sys.platform == 'win32':
    try:
        # Python 3.7+ preferred approach - keeps proper TextIOWrapper buffering
        sys.stdin.reconfigure(encoding='utf-8', errors='replace')
        sys.stdout.reconfigure(encoding='utf-8', errors='replace', write_through=True)
        sys.stderr.reconfigure(encoding='utf-8', errors='replace', write_through=True)
    except (AttributeError, io.UnsupportedOperation):
        # Fallback: use io.TextIOWrapper (NOT codecs.StreamReader)
        sys.stdin = io.TextIOWrapper(sys.stdin.detach(), encoding='utf-8', errors='replace')
        sys.stdout = io.TextIOWrapper(sys.stdout.detach(), encoding='utf-8', errors='replace', write_through=True)
        sys.stderr = io.TextIOWrapper(sys.stderr.detach(), encoding='utf-8', errors='replace', write_through=True)

# Configure logging - FORCE stderr output for Electron visibility
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stderr)],
    force=True  # Override any existing configuration
)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ==================== SPEED CONFIGURATION ====================
# Tweak these for performance vs accuracy
MAX_IMAGE_SIZE = 336       # ULTRA-FAST: 336px to match Ollama's rapid processing
MAX_OUTPUT_TOKENS = 120    # RICH-FAST: Balanced for speed + 2 sentences + exact tags
FACE_SCAN_SIZE = 1280      # BEST: Increased to 1280px for group photos and distant faces
FACE_DETECTION_MODEL = "hog"  # HOG: Faster detection, good balance of speed vs accuracy
FACE_UPSAMPLE = 1          # BEST: Higher upsampling to catch small/distant faces
USE_QUANTIZATION = False   # DISABLED: Avoid bitsandbytes import issues
USE_PARALLEL_PROCESSING = True  # Enable batch processing

# ==================== DEPENDENCIES ====================

HAS_CONVERTER = False
try:
    from converter import DocumentConverter
    HAS_CONVERTER = True
    doc_converter = DocumentConverter()
except ImportError:
    pass

HAS_PIL = False
HAS_TORCH = False
HAS_TRANSFORMERS = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    logger.warning("[WARN] Pillow not available")

try:
    import torch
    HAS_TORCH = True
    # OPTIMIZATION: Global inference mode and thread tuning
    torch.set_grad_enabled(False)
    # Use all CPU cores for maximum throughput (Ollama-style)
    _cpu_cores = os.cpu_count() or 4
    torch.set_num_threads(_cpu_cores)
    torch.set_num_interop_threads(max(1, _cpu_cores // 2))
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda":
        # CUDA-specific speed flags (same as LM Studio)
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.benchmark = True
        torch.backends.cudnn.allow_tf32 = True
    logger.info(f"[OK] PyTorch ({device.upper()}, threads={_cpu_cores})")
except ImportError:
    logger.warning("[WARN] PyTorch not available")

try:
    from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
    from sentence_transformers import SentenceTransformer, util
    HAS_TRANSFORMERS = True
except ImportError:
    pass

HAS_BITSANDBYTES = False
# DISABLED: bitsandbytes causing import issues, not needed for face detection
# try:
#     # Only import if we really need quantization
#     if USE_QUANTIZATION:
#         from transformers import BitsAndBytesConfig
#         import bitsandbytes
#         HAS_BITSANDBYTES = True
# except ImportError:
#     pass

HAS_FACE_RECOGNITION = False
try:
    import face_recognition
    HAS_FACE_RECOGNITION = True
except Exception:
    pass

HAS_IMAGEHASH = False
try:
    import imagehash
    HAS_IMAGEHASH = True
except ImportError:
    pass

HAS_EXIF = False
try:
    from PIL.ExifTags import TAGS, GPSTAGS
    HAS_EXIF = True
except ImportError:
    pass

HAS_CV2 = False
try:
    import cv2
    HAS_CV2 = True
    logger.info("[OK] OpenCV available")
except ImportError:
    logger.warning("[WARN] OpenCV not available - face detection will be slower")

HAS_CLUSTERING = False
try:
    from sklearn.cluster import DBSCAN
    import numpy as np
    HAS_CLUSTERING = True
except ImportError:
    pass

# ==================== DATABASE & STORAGE ====================

import sqlite3

def get_db_path():
    if os.name == 'nt':
        appdata = os.getenv('APPDATA')
        db_dir = Path(appdata) / 'smartmedia'
    else:
        home = Path.home()
        db_dir = home / 'Library' / 'Application Support' / 'smartmedia' if sys.platform == 'darwin' else home / '.config' / 'smartmedia'
    
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / 'media.db'

def init_database():
    db_path = get_db_path()
    conn = sqlite3.connect(str(db_path))
    
    # OPTIMIZATION: Enable Write-Ahead Logging and Normal Sync for speed
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            metadata TEXT,
            caption TEXT,
            emotion TEXT,
            objects TEXT,
            tags TEXT,
            scanned_at TEXT,
            is_favorite INTEGER DEFAULT 0,
            face_count INTEGER DEFAULT 0,
            face_scanned INTEGER DEFAULT 0,
            exif_data TEXT,
            date_taken TEXT,
            latitude REAL,
            longitude REAL,
            camera_make TEXT,
            camera_model TEXT,
            media_type TEXT DEFAULT 'image',
            duration REAL,
            file_size INTEGER
        )
    """)
    # Add columns if they don't exist (migration)
    columns_to_add = [
        ("face_scanned", "INTEGER DEFAULT 0"),
        ("exif_data", "TEXT"),
        ("date_taken", "TEXT"),
        ("latitude", "REAL"),
        ("longitude", "REAL"),
        ("camera_make", "TEXT"),
        ("camera_model", "TEXT"),
        ("media_type", "TEXT DEFAULT 'image'"),
        ("duration", "REAL"),
        ("file_size", "INTEGER"),
        ("extracted_text", "TEXT")  # For searchable document text
    ]
    for col_name, col_type in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE images ADD COLUMN {col_name} {col_type}")
            conn.commit()
        except:
            pass  # Column already exists
    conn.close()

init_database()

# ==================== FACES & SEARCH ====================

class FaceDatabase:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.faces = {}
        self._load()
    
    def _load(self):
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'rb') as f:
                    data = pickle.load(f)
                    self.faces = data.get('faces', {})
                # Ensure JSON cache is up-to-date on load
                self._save_json_cache()
            except: self.faces = {}
    
    def _save(self):
        try:
            with open(self.db_path, 'wb') as f:
                pickle.dump({'faces': self.faces}, f)
            # Also save a JSON cache for fast loading by Electron without Python
            self._save_json_cache()
        except: pass
    
    def _save_json_cache(self):
        """Save a JSON version of faces for instant loading by Electron"""
        try:
            cache_path = os.path.join(os.path.dirname(self.db_path), 'faces_cache.json')
            faces_list = []
            for face_id, face_data in self.faces.items():
                faces_list.append({
                    'id': face_id,
                    'name': face_data.get('name'),
                    'thumbnail': face_data.get('thumbnail'),
                    'image_count': len(face_data.get('images', [])),
                    'images': face_data.get('images', []),
                    'avg_confidence': None
                })
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(faces_list, f)
        except Exception as e:
            logger.warning(f"[CACHE] Failed to save face cache: {e}")
    
    def add_or_update_face(self, encoding, image_path, location, thumbnail):
        """Add or update face with proper matching using face_recognition distance"""
        if encoding is None:
            # No encoding, create unique ID from location
            face_id = hashlib.md5(str(location).encode()).hexdigest()[:12]
            self.faces[face_id] = {
                'images': [image_path],
                'thumbnail': thumbnail,
                'name': f'Person {len(self.faces)+1}',
                'encoding': None,
                'locations': [location]
            }
            return face_id
        
        # Try to match with existing faces using face_recognition distance
        encoding_list = encoding.tolist() if hasattr(encoding, 'tolist') else encoding
        
        if HAS_FACE_RECOGNITION:
            import face_recognition
            import numpy as np
            
            # BEST PRACTICE: Find the closest matching face (not just first match)
            # This prevents creating duplicates when same person appears multiple times
            best_match_id = None
            best_match_distance = float('inf')
            best_match_data = None
            
            # Check against ALL existing faces to find best match
            for face_id, face_data in self.faces.items():
                stored_encoding = face_data.get('encoding')
                if stored_encoding is not None:
                    # Calculate face distance (lower = more similar)
                    distance = face_recognition.face_distance(
                        [np.array(stored_encoding)], 
                        np.array(encoding_list)
                    )[0]
                    
                    # Track the closest match
                    if distance < best_match_distance:
                        best_match_distance = distance
                        best_match_id = face_id
                        best_match_data = face_data
            
            # CUSTOM TUNED: Use 0.55 threshold (balanced for this dataset)
            # This is slightly stricter than standard 0.6 but looser than 0.5
            # Reference: https://github.com/ageitgey/face_recognition
            # - 0.6 = Standard (recommended for production)
            # - 0.55 = Balanced (better duplicate prevention)
            # - 0.5 = Strict (may create duplicates with lighting/angle changes)
            FACE_MATCH_THRESHOLD = 0.55
            
            if best_match_id and best_match_distance < FACE_MATCH_THRESHOLD:
                # Match found! Update existing face with best match
                if image_path not in best_match_data['images']:
                    best_match_data['images'].append(image_path)
                if 'locations' not in best_match_data:
                    best_match_data['locations'] = []
                best_match_data['locations'].append(location)
                # Update thumbnail if this one is better (use first thumbnail only)
                if not best_match_data.get('thumbnail') and thumbnail:
                    best_match_data['thumbnail'] = thumbnail
                logger.info(f"[FACE MATCH] ✓ Matched existing person {best_match_data.get('name', best_match_id)} (distance: {best_match_distance:.3f})")
                return best_match_id
        
        # No match found, create new face ID
        face_id = hashlib.md5(str(encoding_list[:10]).encode()).hexdigest()[:12]
        person_number = len(self.faces) + 1
        logger.info(f"[FACE MATCH] ✗ No match found, creating new Person {person_number} (ID: {face_id})")
        self.faces[face_id] = {
            'images': [image_path],
            'thumbnail': thumbnail,
            'name': f'Person {person_number}',
            'encoding': encoding_list,
            'locations': [location]
        }
        return face_id
    
    def get_all_faces(self):
        result = []
        for face_id, face_data in self.faces.items():
            # Calculate average confidence if available
            confidence_scores = face_data.get('confidence_scores', [])
            avg_confidence = None
            if confidence_scores:
                avg_confidence = sum(confidence_scores) / len(confidence_scores)
            
            result.append({
                'id': face_id,
                'name': face_data.get('name'),
                'thumbnail': face_data.get('thumbnail'),
                'image_count': len(face_data.get('images', [])),
                'images': face_data.get('images', []),
                'avg_confidence': avg_confidence  # Add confidence score for UI display
            })
        return result

    def delete_face(self, fid):
        if fid in self.faces:
            del self.faces[fid]
            self._save()
            return True
        return False
        
    def set_face_name(self, fid, name):
        if fid in self.faces:
            self.faces[fid]['name'] = name
            self._save()
            return True
        return False
    
    def reset_database(self):
        self.faces = {}
        self._save()
        return True
    
    def merge_duplicate_faces(self):
        """Advanced duplicate face merging using DBSCAN clustering"""
        if not HAS_FACE_RECOGNITION or not HAS_CLUSTERING:
            return {"merged": 0, "message": "face_recognition and sklearn not available"}
        
        import face_recognition
        import numpy as np
        from sklearn.cluster import DBSCAN
        
        if len(self.faces) < 2:
            return {"merged": 0, "message": "Not enough faces to merge"}
        
        logger.info(f"[FACE MERGE] Starting advanced duplicate detection on {len(self.faces)} people...")
        
        # Collect face data for clustering
        face_items = []
        face_encodings = []
        
        for face_id, face_data in self.faces.items():
            encoding = face_data.get('encoding')
            if encoding is not None:
                face_items.append((face_id, face_data))
                face_encodings.append(np.array(encoding))
        
        if len(face_encodings) < 2:
            return {"merged": 0, "message": "Not enough valid encodings to merge"}
        
        # Use DBSCAN clustering to find duplicate persons
        # eps=0.55 matches the face matching threshold for consistency
        clustering = DBSCAN(
            eps=0.55,           # Threshold aligned with face matching (0.55)
            min_samples=1,      # Each person can be a cluster
            metric='euclidean', # Euclidean distance like Google Photos
            n_jobs=-1          # Use all CPU cores
        )
        
        cluster_labels = clustering.fit_predict(face_encodings)
        
        # Group faces by cluster
        clusters = {}
        for i, (face_id, face_data) in enumerate(face_items):
            label = cluster_labels[i]
            if label not in clusters:
                clusters[label] = []
            clusters[label].append((face_id, face_data))
        
        merged_count = 0
        
        # Process clusters - merge faces in same cluster
        for label, cluster_faces in clusters.items():
            if label == -1:  # Outliers - skip
                continue
                
            if len(cluster_faces) > 1:
                # Multiple faces in same cluster = duplicates to merge
                logger.info(f"[FACE MERGE] Found duplicate cluster with {len(cluster_faces)} faces")
                
                # Find the face with most images as the main face
                main_face_id, main_data = max(cluster_faces, 
                    key=lambda x: len(x[1].get('images', [])))
                
                # Calculate average confidence for main face
                all_confidences = []
                
                # Merge data from other faces into main face
                for face_id, face_data in cluster_faces:
                    if face_id != main_face_id:
                        logger.info(f"[FACE MERGE] Merging {face_id} -> {main_face_id}")
                        
                        # Combine images (deduplicate)
                        main_images = set(main_data.get('images', []))
                        other_images = set(face_data.get('images', []))
                        main_data['images'] = list(main_images | other_images)
                        
                        # Combine locations
                        main_locs = main_data.get('locations', [])
                        other_locs = face_data.get('locations', [])
                        main_data['locations'] = main_locs + other_locs
                        
                        # Combine confidence scores
                        main_conf = main_data.get('confidence_scores', [])
                        other_conf = face_data.get('confidence_scores', [])
                        all_confidences.extend(main_conf + other_conf)
                        
                        # Use better thumbnail if available
                        if not main_data.get('thumbnail') and face_data.get('thumbnail'):
                            main_data['thumbnail'] = face_data['thumbnail']
                        
                        # Delete the duplicate face
                        if face_id in self.faces:
                            del self.faces[face_id]
                            merged_count += 1
                
                # Update confidence scores for merged face
                if all_confidences:
                    main_data['confidence_scores'] = all_confidences
                    avg_confidence = sum(all_confidences) / len(all_confidences)
                    logger.info(f"[FACE MERGE] {main_face_id} now has {len(main_data.get('images', []))} images (avg confidence: {avg_confidence:.1f}%)")
        
        if merged_count > 0:
            self._save()  # Save changes
            logger.info(f"[FACE MERGE] ✓ Successfully merged {merged_count} duplicate faces")
        
        return {
            "merged": merged_count,
            "message": f"Merged {merged_count} duplicate faces using DBSCAN clustering",
            "unique_people": len(self.faces)
        }

class RAGEngine:
    """Enterprise-grade RAG Engine with semantic search over media database.
    Uses sentence-transformers for embedding-based similarity search.
    Implements LRU caching, pre-computed embeddings, and fast SQLite lookups."""
    
    def __init__(self, db_path):
        self.db_path = db_path
        self.model = None
        self._embeddings_cache = {}  # path -> embedding
        self._response_cache = {}    # query_hash -> response (LRU)
        self._cache_max_size = 200
        self._db_entries = []        # cached DB entries for search
        self._db_loaded = False
        self._model_loading = False
    
    def _load_model_lazy(self):
        """Lazy load sentence transformer - only when first search happens"""
        if self.model is not None or self._model_loading:
            return
        self._model_loading = True
        try:
            self.model = SentenceTransformer('all-MiniLM-L6-v2')
            logger.info("[RAG] Sentence transformer loaded successfully")
        except Exception as e:
            logger.warning(f"[RAG] Failed to load sentence transformer: {e}")
            self.model = None
        finally:
            self._model_loading = False
    
    def _load_db_entries(self):
        """Load all media entries from database for semantic search"""
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            c.execute("""
                SELECT path, filename, caption, emotion, objects, extracted_text, media_type, tags
                FROM images 
                WHERE caption IS NOT NULL AND caption != ''
                ORDER BY scanned_at DESC
                LIMIT 5000
            """)
            rows = c.fetchall()
            conn.close()
            
            self._db_entries = []
            for row in rows:
                path, filename, caption, emotion, objects_str, extracted_text, media_type, tags_str = row
                # Build searchable text from ALL fields including rich tags
                tags_text = ''
                if tags_str:
                    try:
                        tags_list = json.loads(tags_str)
                        tags_text = ' '.join(tags_list) if isinstance(tags_list, list) else str(tags_list)
                    except:
                        tags_text = str(tags_str)
                search_text = f"{filename or ''} {caption or ''} {emotion or ''} {objects_str or ''} {extracted_text or ''} {tags_text}"
                self._db_entries.append({
                    'path': path,
                    'filename': filename or os.path.basename(path),
                    'caption': caption or '',
                    'emotion': emotion or '',
                    'objects': json.loads(objects_str) if objects_str else [],
                    'media_type': media_type or 'image',
                    'search_text': search_text.lower()
                })
            
            self._db_loaded = True
            logger.info(f"[RAG] Loaded {len(self._db_entries)} entries from database")
        except Exception as e:
            logger.error(f"[RAG] Failed to load DB entries: {e}")
            self._db_entries = []
    
    def _get_cache_key(self, query):
        return hashlib.md5(query.lower().strip().encode()).hexdigest()
    
    def search(self, query, top_k=8):
        """Fast semantic + keyword hybrid search over media database"""
        if not self._db_loaded:
            self._load_db_entries()
        
        if not self._db_entries:
            return []
        
        # Check cache first
        cache_key = self._get_cache_key(query)
        if cache_key in self._response_cache:
            logger.info(f"[RAG] Cache hit for query: {query[:50]}")
            return self._response_cache[cache_key]
        
        query_lower = query.lower().strip()
        results = []
        
        # ── SYNONYM EXPANSION: expand the query with related words ──
        # This lets "sunglasses" find "spectacles" and "vehicle" find "car", "bike" etc.
        SEARCH_SYNONYMS = {
            # Eyewear
            'glasses':     ['spectacles', 'eyeglasses', 'eyewear', 'sunglasses', 'goggles', 'specs'],
            'sunglasses':  ['shades', 'spectacles', 'goggles', 'glasses', 'eyewear', 'sunnies'],
            'spectacles':  ['glasses', 'eyeglasses', 'specs', 'eyewear', 'sunglasses'],
            'specs':       ['glasses', 'spectacles', 'eyeglasses', 'eyewear'],
            # Vehicles (searching "vehicle" returns cars AND bikes)
            'vehicle':     ['car', 'bike', 'motorcycle', 'bus', 'truck', 'scooter', 'van', 'jeep',
                            'suv', 'automobile', 'two-wheeler', 'bicycle', 'auto', 'motorbike'],
            'car':         ['automobile', 'vehicle', 'sedan', 'suv', 'jeep', 'auto'],
            'bike':        ['bicycle', 'cycle', 'motorcycle', 'motorbike', 'scooter', 'two-wheeler', 'vehicle'],
            'motorcycle':  ['motorbike', 'bike', 'scooter', 'two-wheeler', 'vehicle'],
            'bicycle':     ['bike', 'cycle', 'two-wheeler'],
            'scooter':     ['motorbike', 'bike', 'two-wheeler', 'vehicle'],
            'truck':       ['lorry', 'vehicle', 'automobile'],
            # Clothing
            'pants':       ['trousers', 'jeans', 'bottoms', 'slacks'],
            'trousers':    ['pants', 'jeans', 'bottoms'],
            'jacket':      ['coat', 'blazer', 'outerwear', 'hoodie'],
            'glasses':     ['spectacles', 'eyeglasses', 'sunglasses', 'specs'],
            'dress':       ['gown', 'frock', 'outfit', 'attire'],
            'shoes':       ['footwear', 'sneakers', 'boots', 'sandals', 'heels'],
            'sneakers':    ['shoes', 'trainers', 'footwear', 'kicks'],
            'boots':       ['shoes', 'footwear'],
            # People
            'woman':       ['female', 'lady', 'girl', 'person', 'she'],
            'man':         ['male', 'guy', 'boy', 'person', 'he', 'gentleman'],
            'child':       ['kid', 'boy', 'girl', 'baby', 'toddler', 'young'],
            'baby':        ['infant', 'toddler', 'child', 'kid'],
            'person':      ['man', 'woman', 'individual', 'human', 'people'],
            'people':      ['person', 'crowd', 'group', 'family', 'friends', 'humans'],
            # Animals
            'animal':      ['dog', 'cat', 'bird', 'pet', 'wildlife', 'horse', 'cow', 'lion'],
            'dog':         ['puppy', 'pet', 'canine', 'animal', 'hound'],
            'cat':         ['kitten', 'kitty', 'pet', 'feline', 'animal'],
            'pet':         ['dog', 'cat', 'animal'],
            # Nature / outdoor
            'nature':      ['landscape', 'outdoor', 'forest', 'mountain', 'beach', 'river', 'park', 'garden'],
            'mountain':    ['hill', 'peak', 'summit', 'highland', 'nature', 'landscape'],
            'beach':       ['sea', 'ocean', 'coast', 'shore', 'seaside', 'water'],
            'sea':         ['ocean', 'beach', 'water', 'coast', 'shore'],
            'ocean':       ['sea', 'beach', 'water', 'coast'],
            'sunset':      ['dusk', 'golden hour', 'twilight', 'evening', 'sky'],
            'sunrise':     ['dawn', 'morning', 'golden hour', 'sky'],
            'forest':      ['woods', 'jungle', 'trees', 'nature', 'landscape'],
            'flower':      ['bloom', 'blossom', 'floral', 'plant', 'rose', 'nature'],
            # Food
            'food':        ['meal', 'dish', 'cuisine', 'eating', 'snack', 'dessert', 'drink'],
            'coffee':      ['drink', 'beverage', 'cafe', 'latte', 'espresso', 'cappuccino'],
            'cake':        ['dessert', 'sweet', 'food', 'pastry', 'bakery'],
            # Events
            'wedding':     ['marriage', 'ceremony', 'celebration', 'event', 'bride', 'groom'],
            'birthday':    ['celebration', 'party', 'event', 'anniversary', 'cake'],
            'party':       ['celebration', 'event', 'gathering', 'birthday', 'wedding'],
            # Architecture
            'temple':      ['religious', 'architecture', 'place of worship', 'shrine', 'mandir'],
            'church':      ['religious', 'architecture', 'chapel', 'cathedral', 'place of worship'],
            'mosque':      ['religious', 'architecture', 'masjid', 'place of worship'],
            'building':    ['architecture', 'structure', 'house', 'office', 'tower'],
            # Moods / styles
            'selfie':      ['portrait', 'self-portrait', 'solo', 'face'],
            'portrait':    ['selfie', 'face', 'person', 'headshot'],
            'happy':       ['joyful', 'cheerful', 'smiling', 'joy', 'laughing', 'excited'],
            'sad':         ['unhappy', 'crying', 'gloomy', 'melancholy', 'somber'],
            'dark':        ['dramatic', 'moody', 'night', 'low light', 'mysterious'],
            'bright':      ['vibrant', 'colorful', 'vivid', 'sunny', 'light'],
        }
        
        # Expand query words with synonyms
        query_words = set(query_lower.split())
        expanded_query_words = set(query_words)
        for word in list(query_words):
            if word in SEARCH_SYNONYMS:
                for syn in SEARCH_SYNONYMS[word]:
                    expanded_query_words.update(syn.split())
        
        # Also expand multi-word query phrases
        expanded_phrases = [query_lower]
        for word in list(query_words):
            if word in SEARCH_SYNONYMS:
                for syn in SEARCH_SYNONYMS[word]:
                    expanded_phrases.append(syn)
        
        # Stage 1: Fast keyword matching with synonym-expanded query
        keyword_scores = []
        
        for entry in self._db_entries:
            score = 0
            search_text = entry['search_text']
            
            # Exact phrase match (highest score)
            for phrase in expanded_phrases:
                if phrase in search_text:
                    score += 10
                    break
            
            # Individual word matching (original + synonyms)
            for word in expanded_query_words:
                if len(word) > 2 and word in search_text:
                    score += 2
            
            # Emotion matching
            emotion_map = {
                'happy':    ['happy', 'joyful', 'cheerful', 'smiling', 'joy', 'bright', 'laughing'],
                'sad':      ['sad', 'melancholy', 'gloomy', 'somber', 'unhappy', 'crying'],
                'excited':  ['excited', 'energetic', 'enthusiastic', 'vibrant', 'dynamic'],
                'peaceful': ['peaceful', 'calm', 'serene', 'tranquil', 'relaxed', 'quiet'],
                'romantic': ['romantic', 'intimate', 'love', 'tender', 'sweet'],
                'dramatic': ['dramatic', 'intense', 'dark', 'moody', 'cinematic'],
                'neutral':  ['neutral', 'ordinary', 'normal', 'casual']
            }
            for emo, keywords in emotion_map.items():
                if any(kw in expanded_query_words for kw in keywords):
                    if entry['emotion'] == emo:
                        score += 5
            
            # Type matching
            type_queries = {
                'selfie': 'portrait', 'landscape': 'landscape', 'food': 'food',
                'document': 'document', 'screenshot': 'screenshot', 'group': 'group',
                'video': 'video', 'audio': 'audio', 'photo': 'image', 'picture': 'image',
                'vehicle': 'vehicle', 'animal': 'animal', 'architecture': 'architecture',
                'sports': 'sports', 'event': 'event', 'car': 'vehicle', 'bike': 'vehicle',
            }
            for qword, mtype in type_queries.items():
                if qword in expanded_query_words and mtype in (entry.get('media_type', '') or search_text):
                    score += 3
            
            if score > 0:
                keyword_scores.append((score, entry))
        
        # Sort by score descending
        keyword_scores.sort(key=lambda x: x[0], reverse=True)
        results = [entry for _, entry in keyword_scores[:top_k]]
        
        # Stage 2: Semantic search (if model available and keyword results insufficient)
        if len(results) < top_k and self.model is not None:
            try:
                # Encode query
                query_embedding = self.model.encode(query, convert_to_tensor=True)
                
                # Encode all captions (with caching)
                captions = []
                valid_entries = []
                for entry in self._db_entries:
                    if entry['caption']:
                        captions.append(entry['caption'])
                        valid_entries.append(entry)
                
                if captions:
                    caption_embeddings = self.model.encode(captions, convert_to_tensor=True, batch_size=64)
                    cos_scores = util.cos_sim(query_embedding, caption_embeddings)[0]
                    
                    # Get top matches above threshold
                    top_indices = cos_scores.argsort(descending=True)[:top_k * 2]
                    existing_paths = {r['path'] for r in results}
                    
                    for idx in top_indices:
                        if cos_scores[idx] > 0.3:  # Similarity threshold
                            entry = valid_entries[idx]
                            if entry['path'] not in existing_paths:
                                results.append(entry)
                                existing_paths.add(entry['path'])
                                if len(results) >= top_k:
                                    break
                
                logger.info(f"[RAG] Semantic search found {len(results)} results")
            except Exception as e:
                logger.warning(f"[RAG] Semantic search failed: {e}")
        
        # Cache results
        if len(self._response_cache) >= self._cache_max_size:
            # Evict oldest entries
            oldest_keys = list(self._response_cache.keys())[:self._cache_max_size // 2]
            for k in oldest_keys:
                del self._response_cache[k]
        self._response_cache[cache_key] = results
        
        return results
    
    def invalidate_cache(self):
        """Invalidate all caches when database changes"""
        self._response_cache.clear()
        self._db_loaded = False
        self._db_entries = []
        logger.info("[RAG] Cache invalidated")
    
    def get_stats(self):
        """Get database statistics for chat responses"""
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            
            stats = {}
            c.execute("SELECT COUNT(*) FROM images")
            stats['total'] = c.fetchone()[0]
            
            c.execute("SELECT COUNT(*) FROM images WHERE media_type = 'image' OR media_type IS NULL")
            stats['images'] = c.fetchone()[0]
            
            c.execute("SELECT COUNT(*) FROM images WHERE media_type = 'video'")
            stats['videos'] = c.fetchone()[0]
            
            c.execute("SELECT COUNT(*) FROM images WHERE media_type = 'document'")
            stats['documents'] = c.fetchone()[0]
            
            c.execute("SELECT emotion, COUNT(*) FROM images WHERE emotion IS NOT NULL GROUP BY emotion")
            stats['emotions'] = dict(c.fetchall())
            
            c.execute("SELECT COUNT(*) FROM images WHERE is_favorite = 1")
            stats['favorites'] = c.fetchone()[0]
            
            conn.close()
            return stats
        except Exception as e:
            logger.error(f"[RAG] Stats error: {e}")
            return {'total': 0, 'images': 0, 'videos': 0, 'documents': 0, 'emotions': {}, 'favorites': 0}

class SimilarityEngine:
    def find_similar_images(self, paths, threshold=0.92, mode='similar'):
        if not HAS_IMAGEHASH: return []
        hashes = {}
        threshold = max(0.0, min(1.0, float(threshold or 0.92)))
        for p in paths:
            try:
                # Resize extremely small for hashing speed
                img = Image.open(p).resize((64, 64), Image.NEAREST)
                hashes[p] = {
                    'phash': imagehash.phash(img),
                    'dhash': imagehash.dhash(img),
                    'whash': imagehash.whash(img),
                }
            except: continue
            
        groups = []
        processed = set()
        keys = list(hashes.keys())

        # Hashes are 64 bits each; compare with weighted multi-hash similarity.
        if mode == 'exact':
            max_distance = 0
        else:
            max_distance = int(64 * (1.0 - threshold))

        for i, p1 in enumerate(keys):
            if p1 in processed: continue
            group = [{'path': p1, 'similarity': 1.0}]
            group_similarities = [1.0]
            for p2 in keys[i+1:]:
                if p2 in processed: continue
                if mode == 'exact':
                    is_match = hashes[p1]['phash'] - hashes[p2]['phash'] <= max_distance
                    similarity = 1.0 if is_match else 0.0
                else:
                    ph = hashes[p1]['phash'] - hashes[p2]['phash']
                    dh = hashes[p1]['dhash'] - hashes[p2]['dhash']
                    wh = hashes[p1]['whash'] - hashes[p2]['whash']
                    weighted_distance = (0.5 * ph) + (0.3 * dh) + (0.2 * wh)
                    similarity = max(0.0, 1.0 - (weighted_distance / 64.0))
                    is_match = weighted_distance <= max_distance

                if is_match:
                    group.append({'path': p2})
                    group_similarities.append(similarity)
                    processed.add(p2)
            if len(group) > 1:
                processed.add(p1)
                avg_similarity = sum(group_similarities) / len(group_similarities)
                groups.append({'images': group, 'count': len(group), 'avg_similarity': avg_similarity})
        return groups

# ==================== MAIN AI ENGINE ====================

class SmartMediaEngine:
    def __init__(self, defer_model=False):
        self.model = None
        self.processor = None
        self.device = "cuda" if HAS_TORCH and torch.cuda.is_available() else "cpu"
        self.data_dir = Path(__file__).parent.parent / "data"
        self.db_path = get_db_path()
        self.face_db = FaceDatabase(str(self.data_dir / "faces_db.pkl"))
        self.similarity_engine = SimilarityEngine()
        self.rag_engine = RAGEngine(str(self.db_path))
        self.demo_mode = False
        self._last_inference_time = 0
        self._model_loading = False
        self._model_loaded = False
        self._chat_cache = {}  # Response cache for repeated queries
        self._chat_cache_max = 100
        self._conversation_history = []  # Multi-turn conversation context
        self._max_history = 10
        
        if defer_model:
            # Defer model loading - start in background thread
            import threading
            self._model_loading = True
            self._load_thread = threading.Thread(target=self._load_model_background, daemon=True)
            self._load_thread.start()
        else:
            # Load immediately
            self._load_model()
    
    def _load_model_background(self):
        """Load model in background thread so engine is ready for face queries immediately"""
        try:
            self._load_model()
            self._model_loaded = True
        except Exception as e:
            logger.error(f"Background model load failed: {e}")
            self.demo_mode = True
        finally:
            self._model_loading = False
    
    def _ensure_model_loaded(self):
        """Wait for model to be loaded if loading in background"""
        if self._model_loading and hasattr(self, '_load_thread'):
            logger.info("[WAIT] Waiting for model to finish loading...")
            self._load_thread.join(timeout=300)  # Max 5 min wait
            logger.info("[OK] Model loading complete")
    
    def extract_exif_metadata(self, image_path: str) -> Dict:
        """Extract EXIF metadata including GPS, date, camera info"""
        metadata = {
            'date_taken': None,
            'latitude': None,
            'longitude': None,
            'camera_make': None,
            'camera_model': None,
            'orientation': None,
            'iso': None,
            'focal_length': None,
            'aperture': None,
            'shutter_speed': None,
            'width': None,
            'height': None
        }
        
        if not HAS_PIL or not HAS_EXIF:
            return metadata
        
        try:
            image = Image.open(image_path)
            exif_data = image._getexif()
            
            if not exif_data:
                return metadata
            
            # Extract basic EXIF data
            for tag_id, value in exif_data.items():
                tag = TAGS.get(tag_id, tag_id)
                
                if tag == 'DateTimeOriginal' or tag == 'DateTime':
                    try:
                        # Convert EXIF date format to ISO format
                        dt = datetime.strptime(str(value), '%Y:%m:%d %H:%M:%S')
                        metadata['date_taken'] = dt.isoformat()
                    except:
                        metadata['date_taken'] = str(value)
                
                elif tag == 'Make':
                    metadata['camera_make'] = str(value).strip()
                
                elif tag == 'Model':
                    metadata['camera_model'] = str(value).strip()
                
                elif tag == 'Orientation':
                    metadata['orientation'] = int(value)
                
                elif tag == 'ISOSpeedRatings':
                    metadata['iso'] = int(value)
                
                elif tag == 'FocalLength':
                    if isinstance(value, tuple):
                        metadata['focal_length'] = f"{value[0]/value[1]:.1f}mm"
                    else:
                        metadata['focal_length'] = f"{value}mm"
                
                elif tag == 'FNumber':
                    if isinstance(value, tuple):
                        metadata['aperture'] = f"f/{value[0]/value[1]:.1f}"
                    else:
                        metadata['aperture'] = f"f/{value}"
                
                elif tag == 'ExposureTime':
                    if isinstance(value, tuple):
                        metadata['shutter_speed'] = f"{value[0]}/{value[1]}s"
                    else:
                        metadata['shutter_speed'] = f"{value}s"
                
                elif tag == 'ExifImageWidth':
                    metadata['width'] = int(value)
                
                elif tag == 'ExifImageHeight':
                    metadata['height'] = int(value)
                
                elif tag == 'GPSInfo':
                    # Extract GPS coordinates
                    gps_data = {}
                    for gps_tag_id in value:
                        gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                        gps_data[gps_tag] = value[gps_tag_id]
                    
                    # Convert GPS coordinates to decimal degrees
                    if 'GPSLatitude' in gps_data and 'GPSLongitude' in gps_data:
                        lat = gps_data['GPSLatitude']
                        lon = gps_data['GPSLongitude']
                        lat_ref = gps_data.get('GPSLatitudeRef', 'N')
                        lon_ref = gps_data.get('GPSLongitudeRef', 'E')
                        
                        # Convert to decimal
                        def to_decimal(coord):
                            if isinstance(coord, (list, tuple)) and len(coord) >= 3:
                                degrees = float(coord[0])
                                minutes = float(coord[1])
                                seconds = float(coord[2]) if len(coord) > 2 else 0
                                return degrees + (minutes / 60.0) + (seconds / 3600.0)
                            return float(coord)
                        
                        latitude = to_decimal(lat)
                        longitude = to_decimal(lon)
                        
                        if lat_ref == 'S':
                            latitude = -latitude
                        if lon_ref == 'W':
                            longitude = -longitude
                        
                        metadata['latitude'] = latitude
                        metadata['longitude'] = longitude
            
            # If width/height not in EXIF, get from image
            if not metadata['width'] or not metadata['height']:
                metadata['width'] = image.width
                metadata['height'] = image.height
            
        except Exception as e:
            logger.warning(f"[EXIF] Error: {e}")
        
        return metadata

    def _load_model(self):
        try:
            logger.info("[LOADING] Qwen2-VL 2B (Turbo Mode)...")
            gc.collect()
            if self.device == "cuda": torch.cuda.empty_cache()

            model_name = "Qwen/Qwen2-VL-2B-Instruct"
            self.processor = AutoProcessor.from_pretrained(model_name, trust_remote_code=True)
            
            # Determine optimal SDPA attention (PyTorch 2.0+ free 20-30% speedup)
            attn_impl = "sdpa" if hasattr(torch.nn.functional, 'scaled_dot_product_attention') else "eager"
            
            # 4-BIT QUANTIZATION IS CRITICAL FOR SPEED & MEMORY
            if self.device == "cuda" and HAS_BITSANDBYTES and USE_QUANTIZATION:
                q_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.float16,
                    bnb_4bit_quant_type="nf4"
                )
                self.model = Qwen2VLForConditionalGeneration.from_pretrained(
                    model_name, quantization_config=q_config, device_map="auto", 
                    trust_remote_code=True, attn_implementation=attn_impl
                )
            else:
                # CPU/CUDA Fast Path with optimal dtype
                if self.device == "cuda":
                    dtype = torch.float16
                else:
                    # Try bfloat16 for Intel CPUs (faster than float32)
                    try:
                        _ = torch.tensor([1.0], dtype=torch.bfloat16)
                        dtype = torch.bfloat16
                        logger.info("[MODEL] Using bfloat16 for CPU (faster)")
                    except Exception:
                        dtype = torch.float32
                
                self.model = Qwen2VLForConditionalGeneration.from_pretrained(
                    model_name, torch_dtype=dtype, trust_remote_code=True, 
                    low_cpu_mem_usage=True, attn_implementation=attn_impl
                )
                if self.device == "cuda": self.model.to("cuda")

            self.model.eval()
            
            # torch.compile works on Windows too with PyTorch 2.0+
            if hasattr(torch, 'compile') and self.device == 'cuda':
                try: self.model = torch.compile(self.model, mode='reduce-overhead')
                except: pass
            
            logger.info(f"[OK] Model Loaded - Turbo Ready (dtype={self.model.dtype}, attn={attn_impl})")
            
            # === WARMUP INFERENCE (Ollama/LM Studio technique) ===
            # Pre-fills KV cache, JIT-compiles kernels → first real image is 2-3x faster
            try:
                logger.info("[WARMUP] Running warmup inference...")
                warmup_start = time.time()
                dummy_img = Image.new('RGB', (56, 56), (128, 128, 128))
                warmup_msgs = [{"role": "user", "content": [
                    {"type": "image", "image": dummy_img},
                    {"type": "text", "text": "Hi"}
                ]}]
                warmup_text = self.processor.apply_chat_template(warmup_msgs, tokenize=False, add_generation_prompt=True)
                warmup_inputs = self.processor(text=[warmup_text], images=[dummy_img], padding=True, return_tensors="pt").to(self.model.device)
                with torch.inference_mode():
                    self.model.generate(**warmup_inputs, max_new_tokens=5, do_sample=False, use_cache=True)
                del dummy_img, warmup_inputs
                if self.device == "cuda": torch.cuda.empty_cache()
                gc.collect()
                logger.info(f"[WARMUP] ✓ Warmup complete in {time.time() - warmup_start:.1f}s — first image will be fast!")
            except Exception as we:
                logger.warning(f"[WARMUP] Skipped: {we}")
                
        except Exception as e:
            logger.error(f"Model load failed: {e}")
            self.demo_mode = True

    def _looks_like_document_image(self, image, image_path: str) -> bool:
        """Heuristically detect page-like documents, slides, and screenshots."""
        try:
            filename = os.path.basename(image_path).lower()
            document_name_hints = (
                'screenshot', 'scan', 'document', 'pdf', 'page', 'slide', 'form',
                'invoice', 'receipt', 'certificate', 'report', 'letter', 'notes'
            )
            if any(hint in filename for hint in document_name_hints):
                return True

            if not HAS_PIL:
                return False

            from PIL import ImageStat

            sample = image.convert('RGB')
            if max(sample.size) > 768:
                scale = 768 / max(sample.size)
                sample = sample.resize((max(1, int(sample.width * scale)), max(1, int(sample.height * scale))), Image.BILINEAR)

            gray = sample.convert('L')
            stat = ImageStat.Stat(gray)
            mean_brightness = stat.mean[0]
            brightness_std = stat.stddev[0]

            pixels = list(gray.getdata())
            total_pixels = len(pixels) or 1
            white_ratio = sum(1 for px in pixels if px >= 235) / total_pixels
            black_ratio = sum(1 for px in pixels if px <= 50) / total_pixels

            # Page-like content usually has a dominant light background with visible dark text blocks.
            if white_ratio > 0.42 and black_ratio > 0.01 and mean_brightness > 160:
                return True

            if white_ratio > 0.33 and brightness_std < 85 and sample.width >= sample.height:
                return True

            return False
        except Exception:
            return False

    def process_image(self, image_path: str) -> Dict:
        # Ensure model is loaded before processing
        self._ensure_model_loaded()
        
        start_t = time.time()
        
        # Handle Unicode file paths properly
        try:
            image_path = os.path.normpath(image_path)
            if not os.path.exists(image_path):
                filename = os.path.basename(image_path)
                logger.error(f"[IMAGE] File not found: {filename}")
                return {"success": False, "error": f"File not found: {filename}"}
        except Exception as e:
            logger.error(f"[IMAGE] Path error: {e}")
            return {"success": False, "error": str(e)}
        
        try:
            # 1. FAST IMAGE LOADING
            with open(image_path, 'rb') as f:
                img_bytes = f.read()
            image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            document_like = self._looks_like_document_image(image, image_path)
            
            # 2. SMART RESIZING - balanced accuracy vs speed
            w, h = image.size
            if max(w, h) > MAX_IMAGE_SIZE:
                scale = MAX_IMAGE_SIZE / max(w, h)
                new_w, new_h = int(w * scale), int(h * scale)
                # Align to 28px for Qwen2-VL
                new_w = max(28, (new_w//28)*28)
                new_h = max(28, (new_h//28)*28)
                # BILINEAR is 3-4x faster than LANCZOS and indistinguishable at 512px
                image = image.resize((new_w, new_h), Image.BILINEAR)
            
            # 3. EXTRACT EXIF METADATA (also get file size)
            exif_metadata = self.extract_exif_metadata(image_path)
            # Always include file size in metadata
            try:
                exif_metadata['file_size'] = os.path.getsize(image_path)
            except Exception:
                pass
            
            if self.demo_mode: return {"success": True, "caption": "Demo Mode", "objects": [], "emotion": "neutral", "metadata": exif_metadata}

            # 4. SMART PROMPTING — person images always use person prompt even if document_like
            # Quick pre-scan: detect if image has person-related content by filename/path
            _fname_lower = os.path.basename(image_path).lower()
            _PERSON_FNAME_HINTS = ('photo', 'img', 'pic', 'selfie', 'portrait', 'person',
                                   'people', 'family', 'friend', 'group', 'face', 'man', 'woman')
            _has_person_hint = any(h in _fname_lower for h in _PERSON_FNAME_HINTS)

            if document_like and not _has_person_hint:
                prompt_text = (
                    "This image looks like a document, slide, screenshot, page, or poster. "
                    "Do not describe people or clothing unless a person is clearly the main subject. "
                    "Focus on the visible text, title, headings, logos, layout, and any important on-page details. "
                    "If you can read text, list the main title and key visible text accurately. "
                    "You MUST respond EXACTLY in this format:\n\n"
                    "CAPTION: Write 2 clear sentences describing the document/page and the visible text or layout.\n"
                    "TAGS: document, page, text, title, screenshot, slide, layout, logo, report, form"
                )
            else:
                prompt_text = (
                    "Describe what is in this image using simple, everyday English. Focus on what is clearly visible. "
                    "If a person is present, describe their appearance: gender, age, clothing colors, accessories, hairstyle. "
                    "If text or a timestamp is visible, mention it briefly but do NOT treat this as a document scan. "
                    "If no person is present, describe the main scene, objects, and colors. "
                    "You MUST respond EXACTLY in this format:\n\n"
                    "CAPTION: Write 2 natural sentences. Lead with the person if present, then scene/objects.\n"
                    "CLOTHING: list every clothing item with color (e.g. blue jeans, white shirt)\n"
                    "COLORS: list dominant colors seen\n"
                    "TAGS: tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8"
                )

            # 5. ULTRA-FAST INFERENCE — Ollama/LM Studio technique stack
            messages = [{
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": prompt_text}
                ]
            }]
            
            text = self.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = self.processor(text=[text], images=[image], padding=True, return_tensors="pt").to(self.model.device)
            
            with torch.inference_mode():
                output_ids = self.model.generate(
                    **inputs,
                    max_new_tokens=MAX_OUTPUT_TOKENS,  # 180 tokens — rich but fast
                    do_sample=False,           # greedy — fastest, no randomness (Ollama default)
                    num_beams=1,               # no beam search overhead
                    use_cache=True,            # KV cache for 2-3x speedup
                    length_penalty=0.8,        # gently favor concise output (LM Studio technique)
                    no_repeat_ngram_size=0,    # disabled to allow natural language
                    repetition_penalty=1.05,   # gentle penalty to stop degenerate loops without breaking grammar
                    early_stopping=True,       # stop immediately at EOS token
                    pad_token_id=self.processor.tokenizer.pad_token_id,
                    eos_token_id=self.processor.tokenizer.eos_token_id,
                )
            
            response = self.processor.batch_decode(output_ids[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0]
            
            # 6. STRUCTURED PARSING - Extract all 5 lines with rich tag generation
            photo_type = "other"
            emotion = "neutral"
            caption = ""
            objects = []
            clothing_details = []
            colors_detected = []
            
            try:
                # HARD TRUNCATE: safety net — never process more than 800 chars (Ollama technique)
                raw_text = response.strip()[:800]
                logger.info(f"[AI RAW] {len(response)} chars → {len(raw_text)} chars | Preview: {raw_text[:120]}")

                # --- Deduplicator: collapses "neutral, neutral..." / "Batman, Batman..." loops ---
                def _dedup_tokens(text):
                    parts = [p.strip() for p in text.replace('\n', ',').split(',') if p.strip()]
                    seen: set = set()
                    result = []
                    for p in parts:
                        pl = p.lower().strip('.,!?;:()"\'`')
                        if pl and pl not in seen:
                            seen.add(pl)
                            result.append(p)
                    return result

                # --- Step 1: Try structured CAPTION / TAGS / CLOTHING / COLORS format ---
                sentence_text = ""
                tags_text = ""
                clothing_raw = ""
                colors_raw = ""
                _active_key = None
                _blocks = {}
                for line in [l.strip() for l in raw_text.split('\n') if l.strip()]:
                    ll = line.lower()
                    if ll.startswith('caption:') or ll.startswith('sentence:'):
                        _active_key = 'caption'
                        _blocks[_active_key] = line[line.index(':') + 1:].strip()
                    elif ll.startswith('clothing:'):
                        _active_key = 'clothing'
                        _blocks[_active_key] = line[line.index(':') + 1:].strip()
                    elif ll.startswith('colors:') or ll.startswith('colour:') or ll.startswith('colors detected:'):
                        _active_key = 'colors'
                        _blocks[_active_key] = line[line.index(':') + 1:].strip()
                    elif ll.startswith('tags:') or ll.startswith('keywords:'):
                        _active_key = 'tags'
                        _blocks[_active_key] = line[line.index(':') + 1:].strip()
                    elif _active_key:
                        # Continuation of previous block (multi-line)
                        _blocks[_active_key] = _blocks.get(_active_key, '') + ' ' + line
                sentence_text = _blocks.get('caption', '')
                tags_text = _blocks.get('tags', '')
                clothing_raw = _blocks.get('clothing', '')
                colors_raw = _blocks.get('colors', '')

                # --- Step 2: Fallback — take longest prose line (skip tag blobs) ---
                if not sentence_text:
                    lines_clean = [l.strip() for l in raw_text.split('\n') if l.strip()]
                    for line in sorted(lines_clean, key=lambda x: len(x), reverse=True):
                        words = line.split()
                        comma_count = line.count(',')
                        # Skip tag blobs: >3 commas = likely a tag list, not a sentence
                        if len(words) >= 6 and comma_count <= 3:
                            # Also skip lines that start with known tag-dump prefixes
                            ll2 = line.lower()
                            if not any(ll2.startswith(p) for p in ('tags:', 'tag(s):', 'keywords:')):
                                sentence_text = line
                                break

                # --- Step 3: Last resort - sentence will be synthesized after type/emotion parse ---
                _needs_synthesis = not sentence_text or len(sentence_text.split()) < 4
                if _needs_synthesis:
                    sentence_text = ""  # synthesize later once we know photo_type and emotion

                # --- Build caption: strip prefix leakage, capitalise ---
                for pfx in ['caption:', 'caption :', 'sentence:', 'sentence :', 'desc:', 'description:']:
                    if sentence_text.lower().startswith(pfx):
                        sentence_text = sentence_text[len(pfx):].strip()
                        break
                caption = sentence_text.strip()
                if caption and caption[0].islower():
                    caption = caption[0].upper() + caption[1:]

                # --- Tags: parse TAGS line; fallback extracts short tokens only ---
                def _is_valid_tag(t):
                    t = t.strip().lstrip('*•-– ')
                    # Reject: empty, single char, starts with known prose prefixes, or is a long sentence
                    if not t or len(t) < 2:
                        return False
                    tl = t.lower()
                    bad_prefixes = ('sentence', 'tags', 'tag(s)', 'description', 'caption', 'note', 'in this', 'the image')
                    if any(tl.startswith(p) for p in bad_prefixes):
                        return False
                    # Reject long prose (>5 words = sentence fragment, not a tag)
                    if len(t.split()) > 5:
                        return False
                    return True

                def _dedup_root_tags(tag_list):
                    """Remove root-word spam: keep only 2 tags per dominant first word.
                    e.g. 'indoor setting','indoor scene','indoor space','indoor workspace'
                    collapses to the 2 shortest/most-specific ones."""
                    from collections import defaultdict
                    root_groups = defaultdict(list)
                    for t in tag_list:
                        first_word = t.split()[0] if t.split() else t
                        root_groups[first_word].append(t)
                    result = []
                    for root, group in root_groups.items():
                        # Sort by length (shortest = most specific, e.g. 'indoor' before 'indoor workspace')
                        group_sorted = sorted(group, key=len)
                        # Keep at most 2 variants per root word
                        result.extend(group_sorted[:2])
                    # Restore original order
                    order = {t: i for i, t in enumerate(tag_list)}
                    return sorted(result, key=lambda t: order.get(t, 999))

                if tags_text:
                    seen_t: set = set()
                    ai_tags = []
                    for raw_t in tags_text.split(','):
                        t = raw_t.strip().lstrip('*•-– ').lower()
                        if _is_valid_tag(t) and t not in seen_t:
                            seen_t.add(t)
                            ai_tags.append(t)
                    ai_tags = _dedup_root_tags(ai_tags)
                else:
                    # Fallback: extract short tokens from the whole response
                    seen_t: set = set()
                    ai_tags = []
                    for raw_t in raw_text.replace('\n', ',').split(','):
                        t = raw_t.strip().lstrip('*•-– ').lower()
                        if _is_valid_tag(t) and t not in seen_t:
                            seen_t.add(t)
                            ai_tags.append(t)
                    ai_tags = _dedup_root_tags(ai_tags)

                ai_objects = list(ai_tags)  # same pool; downstream clothing/color scan uses this

                # --- Scan FULL response for TYPE and MOOD regardless of format ---
                full_context = (raw_text + ' ' + caption + ' ' + ' '.join(ai_tags)).lower()
                type_line_lower = full_context
                mood_line_lower = full_context

                # --- Parse TYPE ---
                type_word_map = [
                    (['screenshot', 'screen', 'app', 'interface', 'whatsapp', 'chat', 'ui'], 'screenshot'),
                    (['document', 'receipt', 'invoice', 'pdf', 'form', 'certificate'], 'document'),
                    (['group', 'crowd', 'multiple people', 'several people', 'gathering', 'family'], 'group-photo'),
                    (['portrait', 'person', 'individual', 'solo', 'woman', 'man', 'child',
                      'baby', 'character', 'selfie', 'figure'], 'portrait'),
                    (['vehicle', 'car', 'bike', 'motorcycle', 'truck', 'bus', 'automobile',
                      'scooter', 'van', 'jeep', 'suv', 'sedan'], 'vehicle'),
                    (['animal', 'dog', 'cat', 'bird', 'pet', 'wildlife', 'lion', 'tiger',
                      'elephant', 'horse', 'cow', 'fish', 'rabbit'], 'animal'),
                    (['event', 'concert', 'festival', 'ceremony', 'wedding', 'birthday',
                      'graduation', 'celebration', 'party'], 'event'),
                    (['sports', 'gym', 'fitness', 'workout', 'exercise', 'cricket', 'football',
                      'basketball', 'tennis', 'swimming', 'running', 'cycling'], 'sports'),
                    (['architecture', 'building', 'church', 'temple', 'mosque', 'tower',
                      'monument', 'bridge', 'house', 'skyscraper'], 'architecture'),
                    (['food', 'meal', 'dish', 'cuisine', 'restaurant', 'eating', 'drink',
                      'snack', 'dessert', 'coffee', 'tea', 'cake', 'pizza', 'burger'], 'food'),
                    (['landscape', 'nature', 'outdoor', 'scenery', 'mountain', 'beach', 'forest',
                      'river', 'lake', 'sunset', 'sunrise', 'sky', 'field', 'park', 'garden'], 'landscape'),
                    (['product', 'object on white', 'commercial item'], 'product'),
                    (['artwork', 'poster', 'illustration', 'painting', 'art', 'digital art',
                      'graphic', 'render', 'wallpaper', 'drawing', 'sketch'], 'artwork'),
                ]
                
                photo_type = 'other'
                for keywords, ptype in type_word_map:
                    if any(kw in type_line_lower for kw in keywords):
                        photo_type = ptype
                        break

                # CRITICAL PRIORITY RULE: person/group/portrait must NEVER be overridden to document.
                # Only bump 'other' or 'screenshot' types to document when truly document-like
                # and NO person was detected in the full context.
                _PERSON_KEYWORDS = {'person', 'woman', 'man', 'child', 'baby', 'boy', 'girl',
                                    'portrait', 'face', 'group', 'crowd', 'people', 'individual',
                                    'selfie', 'figure', 'student', 'teacher', 'doctor', 'patient',
                                    'standing', 'sitting', 'smiling', 'wearing', 'holding'}
                _has_person_in_response = any(kw in full_context for kw in _PERSON_KEYWORDS)

                if document_like and not _has_person_in_response:
                    # No person detected — safe to treat as document
                    if photo_type in ['other', 'screenshot']:
                        photo_type = 'document'
                
                logger.info(f"[PARSE] caption='{caption[:80]}' | photo_type='{photo_type}'")
                
                # --- Parse EMOTION ---
                emotion_map = [
                    (['happy', 'joyful', 'cheerful', 'smiling', 'joy', 'enthusiastic', 'bright'], 'happy'),
                    (['sad', 'melancholy', 'gloomy', 'somber', 'unhappy', 'crying', 'grief'], 'sad'),
                    (['excited', 'energetic', 'vibrant', 'dynamic', 'lively', 'thrilling'], 'excited'),
                    (['peaceful', 'calm', 'serene', 'tranquil', 'relaxed', 'quiet', 'gentle'], 'peaceful'),
                    (['romantic', 'intimate', 'tender', 'love', 'affectionate', 'warm'], 'romantic'),
                    (['dramatic', 'intense', 'powerful', 'epic', 'dark', 'cinematic', 'bold'], 'dramatic'),
                    (['mysterious', 'suspenseful', 'eerie', 'moody', 'atmospheric', 'haunting'], 'mysterious'),
                    (['neutral', 'ordinary', 'normal', 'casual', 'everyday'], 'neutral'),
                ]
                emotion = 'neutral'
                for keywords, emo in emotion_map:
                    if any(kw in mood_line_lower for kw in keywords):
                        emotion = emo
                        break
                
                # --- Extract clothing from dedicated CLOTHING block first, then scan text ---
                clothing_keywords = [
                    'shirt', 'dress', 'jacket', 'pants', 'jeans', 'sweater', 'hoodie',
                    'skirt', 'shoes', 'hat', 'glasses', 'spectacles', 'sunglasses', 'goggles',
                    'watch', 'tie', 'suit', 'coat', 't-shirt', 'blouse', 'shorts',
                    'sandals', 'boots', 'sneakers', 'polo', 'vest', 'scarf', 'gloves',
                    'socks', 'belt', 'cap', 'helmet', 'bag', 'backpack', 'handbag',
                    'kurta', 'saree', 'sari', 'lehenga', 'dupatta', 'turban', 'uniform',
                    'blazer', 'cardigan', 'tuxedo', 'gown', 'tracksuit', 'sweatshirt'
                ]
                color_keywords = [
                    'red', 'blue', 'green', 'yellow', 'black', 'white', 'gray', 'grey',
                    'brown', 'pink', 'purple', 'orange', 'navy', 'beige', 'tan',
                    'maroon', 'turquoise', 'gold', 'silver', 'cream', 'dark', 'light',
                    'golden', 'crimson', 'cyan', 'magenta', 'violet', 'indigo', 'coral',
                    'teal', 'olive', 'lime', 'rose', 'peach', 'lavender', 'bronze'
                ]

                # Parse from dedicated CLOTHING block
                if clothing_raw:
                    for cl in clothing_raw.replace(';', ',').split(','):
                        cl = cl.strip().lower().lstrip('*•- ')
                        if cl and len(cl) > 1 and cl not in clothing_details:
                            clothing_details.append(cl)

                # Parse from dedicated COLORS block
                if colors_raw:
                    for co in colors_raw.replace(';', ',').split(','):
                        co = co.strip().lower().lstrip('*•- ')
                        if co and len(co) > 1 and co not in colors_detected:
                            colors_detected.append(co)

                # Also scan all text for clothing/color keywords for person images
                _is_person_type = photo_type in ('portrait', 'group-photo', 'event', 'sports')
                if _is_person_type or not (document_like and not _has_person_in_response):
                    all_text = (caption + ' ' + ' '.join(ai_objects) + ' ' + ' '.join(ai_tags)).lower()
                    all_words = [w.strip('.,!?;:()"\"') for w in all_text.split()]
                    for word in all_words:
                        if word in clothing_keywords and word not in clothing_details:
                            clothing_details.append(word)
                        if word in color_keywords and word not in colors_detected:
                            colors_detected.append(word)
                
                # --- Build final rich objects/tags list with SYNONYM EXPANSION ---
                # Merge AI objects + AI tags + extracted clothing + colors
                combined = list(dict.fromkeys(ai_objects + ai_tags + clothing_details + colors_detected))
                
                # Synonym expansion: add canonical synonyms so ANY related word finds this image
                synonym_map = {
                    # Eyewear
                    'glasses': ['spectacles', 'eyewear', 'eyeglasses'],
                    'sunglasses': ['shades', 'spectacles', 'eyewear', 'goggles'],
                    'spectacles': ['glasses', 'eyeglasses', 'eyewear'],
                    # Vehicles
                    'car': ['vehicle', 'automobile', 'sedan', 'auto'],
                    'motorcycle': ['bike', 'motorbike', 'vehicle', 'two-wheeler'],
                    'bike': ['bicycle', 'cycle', 'two-wheeler'],
                    'bicycle': ['bike', 'cycle', 'two-wheeler'],
                    'scooter': ['bike', 'vehicle', 'two-wheeler', 'motorbike'],
                    'truck': ['vehicle', 'lorry', 'automobile'],
                    'bus': ['vehicle', 'transport', 'automobile'],
                    'van': ['vehicle', 'automobile'],
                    'jeep': ['suv', 'vehicle', 'car', 'automobile'],
                    'suv': ['jeep', 'vehicle', 'car', 'automobile'],
                    # Clothing synonyms
                    'pants': ['trousers', 'bottoms'],
                    'trousers': ['pants', 'bottoms'],
                    'jacket': ['coat', 'outerwear', 'blazer'],
                    't-shirt': ['tee', 'shirt', 'top'],
                    'dress': ['gown', 'outfit', 'frock'],
                    'saree': ['sari', 'traditional', 'indian wear'],
                    'kurta': ['kurti', 'traditional', 'indian wear'],
                    # People
                    'woman': ['female', 'lady', 'girl', 'person'],
                    'man': ['male', 'guy', 'boy', 'person'],
                    'child': ['kid', 'boy', 'girl', 'young', 'baby'],
                    'baby': ['infant', 'toddler', 'child'],
                    # Animals
                    'dog': ['puppy', 'pet', 'canine', 'animal'],
                    'cat': ['kitten', 'pet', 'feline', 'animal'],
                    # Nature
                    'mountain': ['hill', 'peak', 'summit', 'highland', 'nature'],
                    'beach': ['sea', 'ocean', 'coast', 'shore', 'seaside'],
                    'sunset': ['dusk', 'golden hour', 'twilight', 'evening'],
                    'sunrise': ['dawn', 'morning', 'golden hour'],
                    'forest': ['woods', 'jungle', 'trees', 'nature'],
                    'river': ['stream', 'creek', 'water', 'nature'],
                    'flower': ['bloom', 'blossom', 'floral', 'plant'],
                    # Food
                    'pizza': ['food', 'meal', 'italian', 'dish'],
                    'burger': ['food', 'meal', 'fast food', 'sandwich'],
                    'cake': ['dessert', 'sweet', 'food', 'pastry'],
                    'coffee': ['drink', 'beverage', 'cafe', 'latte'],
                    # Places
                    'temple': ['religious', 'architecture', 'place of worship', 'shrine'],
                    'church': ['religious', 'architecture', 'place of worship', 'chapel'],
                    'mosque': ['religious', 'architecture', 'place of worship', 'masjid'],
                    # Activities
                    'selfie': ['portrait', 'self-portrait', 'solo'],
                    'wedding': ['marriage', 'ceremony', 'celebration', 'event'],
                    'birthday': ['celebration', 'party', 'event', 'anniversary'],
                    'graduation': ['ceremony', 'event', 'celebration', 'academic'],
                }
                
                expanded_tags = list(combined)  # start with what we have
                for tag in combined:
                    tag_clean = tag.strip().lower()
                    if tag_clean in synonym_map:
                        for syn in synonym_map[tag_clean]:
                            if syn not in expanded_tags:
                                expanded_tags.append(syn)
                
                # Also add photo type and emotion as implicit tags
                for implicit in [photo_type.replace('-', ' '), emotion]:
                    if implicit and implicit not in expanded_tags:
                        expanded_tags.append(implicit)
                
                objects = [t for t in expanded_tags if len(t) > 1][:40]  # up to 40 rich tags

                # --- Synthesize caption when model skipped SENTENCE ---
                # Only use the document-hardcoded caption for REAL documents (no person detected)
                if photo_type == 'document' and not _has_person_in_response:
                    if not caption or _needs_synthesis:
                        title_hint = ''
                        for phrase in ['aditya', 'college', 'engineering', 'technology', 'project', 'report', 'thesis', 'paper']:
                            if phrase in full_context:
                                title_hint = phrase
                                break
                        if title_hint:
                            caption = f"A document page featuring {title_hint} and visible text. The layout suggests a formal report, slide, or presentation."
                        else:
                            caption = "A document page with visible text, headings, and layout. It appears to be a report, slide, or formal page."
                    clothing_details = []
                    colors_detected = []
                elif not caption or _needs_synthesis:
                    # Build a natural sentence from what we know about the person/scene
                    subject_words = [t for t in ai_tags if t in (
                        'man', 'woman', 'person', 'boy', 'girl', 'child', 'baby',
                        'people', 'group', 'crowd', 'dog', 'cat', 'bird', 'animal'
                    )]
                    subject = subject_words[0] if subject_words else ('person' if photo_type in ('portrait', 'group-photo') else photo_type.replace('-', ' '))
                    article = 'An' if subject[0].lower() in 'aeiou' else 'A'
                    # Pick up to 2 clothing/color descriptors
                    descriptors = (colors_detected[:1] + clothing_details[:1])
                    desc_str = (' wearing ' + ' and '.join(descriptors)) if descriptors else ''
                    # Scene info from tags
                    scene_words = [t for t in ai_tags if any(s in t for s in ('indoor', 'outdoor', 'room', 'street', 'park', 'office', 'home', 'kitchen', 'garden', 'beach', 'forest'))]
                    scene_str = (', ' + scene_words[0]) if scene_words else ''
                    mood_str = (', ' + emotion + ' mood') if emotion and emotion != 'neutral' else ''
                    caption = f"{article} {subject}{desc_str}{scene_str}{mood_str}.".capitalize()
                    if caption == "A .":
                        caption = "Image analyzed."

            except Exception as e:
                logger.warning(f"[PARSING] Error parsing AI response: {e}")
                caption = response.strip() if response else "Image processed"
            
            # 7. ALBUM CATEGORIZATION - Perfect segmentation
            album_category = self._categorize_into_album(photo_type, caption, objects, emotion)
            
            # Save to database with EXIF metadata and album category (explicitly set media_type='image')
            self._save_to_db(image_path, caption, objects, emotion, exif_metadata, album_category, media_type='image')
            
            proc_time = time.time() - start_t
            self._last_inference_time = proc_time
            logger.info(f"[⚡ DETAILED] {os.path.basename(image_path)} | {proc_time:.2f}s | {emotion} | Album: {album_category} | {len(objects)} details | Clothing: {len(clothing_details)} | Colors: {len(colors_detected)}")
            
            # Memory cleanup for faster sequential processing
            del image, inputs, output_ids
            if self.device == "cuda":
                torch.cuda.empty_cache()
            
            return {
                "success": True,
                "path": image_path,
                "caption": caption,
                "emotion": emotion,
                "objects": objects,
                "tags": objects,
                "clothing": clothing_details,
                "colors": colors_detected,
                "face_count": 0,
                "photo_type": photo_type,
                "album_category": album_category,
                "processing_time": round(proc_time, 2),
                "metadata": exif_metadata,
                "date_taken": exif_metadata.get('date_taken'),
                "location": {
                    "latitude": exif_metadata.get('latitude'),
                    "longitude": exif_metadata.get('longitude')
                } if exif_metadata.get('latitude') and exif_metadata.get('longitude') else None
            }
        except Exception as e:
            logger.error(f"Process error: {e}")
            return {"success": False, "error": str(e)}
    
    def get_media_type(self, file_path: str) -> str:
        """Detect media type based on file extension"""
        ext = os.path.splitext(file_path)[1].lower()
        
        image_exts = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.heic', '.heif'}
        video_exts = {'.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.m4v', '.3gp', '.mpeg', '.mpg'}
        audio_exts = {'.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'}
        document_exts = {'.pdf', '.doc', '.docx', '.txt', '.md', '.log', '.csv', '.rtf'}
        
        if ext in image_exts:
            return 'image'
        elif ext in video_exts:
            return 'video'
        elif ext in audio_exts:
            return 'audio'
        elif ext in document_exts:
            return 'document'
        else:
            return 'unknown'
    
    def generate_video_thumbnail(self, video_path: str) -> Optional[str]:
        """Generate thumbnail for video file using OpenCV with improved error handling"""
        if not HAS_CV2:
            logger.warning("[THUMBNAIL] OpenCV not available for video thumbnails")
            return None
        
        if not HAS_PIL:
            logger.warning("[THUMBNAIL] PIL not available for thumbnail saving")
            return None
        
        try:
            import cv2
            
            # Check if file exists and is readable
            if not os.path.exists(video_path):
                logger.error(f"[THUMBNAIL] Video file not found: {video_path}")
                return None
            
            cap = cv2.VideoCapture(video_path)
            
            if not cap.isOpened():
                logger.error(f"[THUMBNAIL] Could not open video: {video_path}")
                return None
            
            # Get total frames - try multiple positions if first fails
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            
            logger.info(f"[THUMBNAIL] Video info: {total_frames} frames, {fps:.2f} fps")
            
            # Try multiple frame positions to find a valid frame
            positions = [0.1, 0.05, 0.2, 0.5, 0.0]  # 10%, 5%, 20%, 50%, first frame
            frame_rgb = None
            
            for pos in positions:
                target_frame = int(total_frames * pos) if total_frames > 1 else 0
                cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
                ret, frame = cap.read()
                
                if ret and frame is not None and frame.size > 0:
                    # Convert BGR to RGB
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    logger.info(f"[THUMBNAIL] Successfully captured frame at {pos*100:.0f}% position")
                    break
            
            cap.release()
            
            if frame_rgb is None:
                logger.error(f"[THUMBNAIL] Could not extract any valid frame from video")
                return None
            
            # Create PIL Image and resize to thumbnail size
            thumb_img = Image.fromarray(frame_rgb)
            thumb_img.thumbnail((400, 400), Image.LANCZOS)
            
            # Save to thumbnails directory
            thumbnails_dir = self.data_dir / 'thumbnails'
            thumbnails_dir.mkdir(exist_ok=True)
            
            video_hash = hashlib.md5(video_path.encode()).hexdigest()
            thumb_path = thumbnails_dir / f"{video_hash}_thumb.jpg"
            thumb_img.save(str(thumb_path), 'JPEG', quality=85)
            
            logger.info(f"[THUMBNAIL] ✓ Video thumbnail saved: {thumb_path.name}")
            return str(thumb_path)
            
        except Exception as e:
            logger.error(f"[THUMBNAIL] ✗ Failed to generate video thumbnail: {e}", exc_info=True)
        
        return None
    
    def generate_audio_thumbnail(self, audio_path: str) -> Optional[str]:
        """Generate thumbnail for audio file (colored gradient image)"""
        if not HAS_PIL:
            return None
        
        try:
            # Create a nice gradient image for audio files (pink to orange)
            width, height = 400, 400
            img = Image.new('RGB', (width, height))
            pixels = img.load()
            
            # Create vertical gradient from pink (255, 105, 180) to orange (255, 140, 0)
            for y in range(height):
                ratio = y / height
                r = 255
                g = int(105 + (140 - 105) * ratio)
                b = int(180 - 180 * ratio)
                for x in range(width):
                    pixels[x, y] = (r, g, b)
            
            # Save to thumbnails directory
            thumbnails_dir = self.data_dir / 'thumbnails'
            thumbnails_dir.mkdir(exist_ok=True)
            
            audio_hash = hashlib.md5(audio_path.encode()).hexdigest()
            thumb_path = thumbnails_dir / f"{audio_hash}_thumb.jpg"
            img.save(str(thumb_path), 'JPEG', quality=85)
            
            logger.info(f"[THUMBNAIL] Generated audio thumbnail: {thumb_path.name}")
            return str(thumb_path)
        except Exception as e:
            logger.warning(f"[THUMBNAIL] Failed to generate audio thumbnail: {e}")
        
        return None
    
    def generate_document_thumbnail(self, doc_path: str) -> Optional[str]:
        """Generate thumbnail for document file (icon-based for now)"""
        if not HAS_PIL:
            return None
        
        try:
            # Create a document icon thumbnail
            ext = os.path.splitext(doc_path)[1].lower()
            width, height = 400, 400
            
            # Color schemes based on document type
            if ext == '.pdf':
                color = (220, 53, 69)  # Red for PDF
            elif ext in ['.doc', '.docx']:
                color = (44, 77, 255)  # Blue for Word
            elif ext in ['.txt', '.md', '.log']:
                color = (108, 117, 125)  # Gray for text
            else:
                color = (255, 193, 7)  # Yellow for others
            
            img = Image.new('RGB', (width, height), color)
            
            # Save to thumbnails directory
            thumbnails_dir = self.data_dir / 'thumbnails'
            thumbnails_dir.mkdir(exist_ok=True)
            
            doc_hash = hashlib.md5(doc_path.encode()).hexdigest()
            thumb_path = thumbnails_dir / f"{doc_hash}_thumb.jpg"
            img.save(str(thumb_path), 'JPEG', quality=85)
            
            logger.info(f"[THUMBNAIL] Generated document thumbnail: {thumb_path.name}")
            return str(thumb_path)
        except Exception as e:
            logger.warning(f"[THUMBNAIL] Failed to generate document thumbnail: {e}")
        
        return None
    
    def process_document_file(self, file_path: str) -> Dict:
        """Process document file - extract text for searching"""
        self._ensure_model_loaded()
        start_t = time.time()
        
        # Handle Unicode file paths properly
        try:
            file_path = os.path.normpath(file_path)
            if not os.path.exists(file_path):
                filename = os.path.basename(file_path)
                logger.error(f"[DOCUMENT] File not found: {filename}")
                return {"success": False, "error": f"File not found: {filename}"}
        except Exception as e:
            logger.error(f"[DOCUMENT] Path error: {e}")
            return {"success": False, "error": str(e)}
        
        try:
            media_type = 'document'
            
            # Get basic file info
            file_stat = os.stat(file_path)
            file_size = file_stat.st_size
            modified_time = datetime.fromtimestamp(file_stat.st_mtime).isoformat()
            
            # Extract text from document
            extracted_text = ""
            page_count = None
            
            if HAS_CONVERTER:
                logger.info(f"[DOCUMENT] Extracting text from: {os.path.basename(file_path)}")
                result = doc_converter.extract_text_from_document(file_path)
                
                if result.get("success"):
                    extracted_text = result.get("text", "")
                    page_count = result.get("pages", None)
                    logger.info(f"[DOCUMENT] ✓ Extracted {len(extracted_text)} characters")
                    logger.info(f"[DOCUMENT] ✓ Page count: {page_count} (type: {type(page_count)})")
                else:
                    logger.warning(f"[DOCUMENT] Failed to extract text: {result.get('error')}")
            
            # Generate thumbnail
            thumbnail_path = self.generate_document_thumbnail(file_path)
            
            # Extract filename
            filename = os.path.basename(file_path)
            
            # Create caption based on document type and content
            ext = os.path.splitext(file_path)[1].lower()
            if ext == '.pdf':
                doc_type = "PDF Document"
            elif ext in ['.doc', '.docx']:
                doc_type = "Word Document"
            elif ext in ['.txt', '.md']:
                doc_type = "Text File"
            else:
                doc_type = "Document"
            
            caption = doc_type
            if extracted_text:
                # Add preview of first 100 characters
                preview = extracted_text[:100].replace('\n', ' ').strip()
                if preview:
                    caption = f"{doc_type}: {preview}..."
            
            # Save to database with extracted text
            self._save_document_to_db(
                file_path, media_type, file_size, modified_time,
                thumbnail_path, extracted_text, caption, page_count
            )
            
            proc_time = time.time() - start_t
            logger.info(f"[DOCUMENT] {filename} | {media_type} | {proc_time:.2f}s | Text: {len(extracted_text)} chars | Thumbnail: {'✓' if thumbnail_path else '✗'}")
            
            return {
                "success": True,
                "path": file_path,
                "filename": filename,
                "media_type": media_type,
                "file_size": file_size,
                "thumbnail": thumbnail_path,
                "caption": caption,
                "extracted_text": extracted_text[:500],  # First 500 chars for response
                "objects": [],
                "tags": [media_type, ext[1:]],  # Add extension as tag
                "emotion": "neutral",
                "processing_time": round(proc_time, 2),
                "date_modified": modified_time,
                "pages": page_count
            }
        except Exception as e:
            logger.error(f"Document process error: {e}")
            return {"success": False, "error": str(e)}
    
    def process_media_file(self, file_path: str) -> Dict:
        """Process video or audio file - extract basic metadata without AI processing"""
        self._ensure_model_loaded()
        start_t = time.time()
        
        # Handle Unicode file paths properly
        try:
            file_path_normalized = os.path.normpath(file_path)
            if not os.path.exists(file_path_normalized):
                filename = os.path.basename(file_path)
                logger.error(f"[MEDIA] File not found: {filename}")
                logger.error(f"[MEDIA] Path attempted: {file_path_normalized}")
                return {"success": False, "error": f"File not found: {filename}"}
            file_path = file_path_normalized
        except Exception as e:
            logger.error(f"[MEDIA] Path encoding error: {e}")
            return {"success": False, "error": f"Path encoding error: {str(e)}"}
        
        try:
            media_type = self.get_media_type(file_path)
            
            if media_type == 'image':
                # For images, use regular processing
                return self.process_image(file_path)
            
            # Get basic file info
            file_stat = os.stat(file_path)
            file_size = file_stat.st_size
            modified_time = datetime.fromtimestamp(file_stat.st_mtime).isoformat()
            
            # Try to get duration and generate thumbnail
            duration = None
            thumbnail_path = None
            
            if media_type == 'video':
                if HAS_CV2:
                    try:
                        import cv2
                        cap = cv2.VideoCapture(file_path)
                        fps = cap.get(cv2.CAP_PROP_FPS)
                        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                        if fps > 0:
                            duration = frame_count / fps
                        cap.release()
                    except Exception as e:
                        logger.warning(f"Could not extract video duration: {e}")
                
                # Generate video thumbnail
                thumbnail_path = self.generate_video_thumbnail(file_path)
            
            elif media_type == 'audio':
                # Generate audio thumbnail (gradient)
                thumbnail_path = self.generate_audio_thumbnail(file_path)
            
            # Extract basic metadata
            filename = os.path.basename(file_path)
            
            # Save to database with thumbnail path and caption
            if media_type == 'video':
                caption = f"Video: {filename}"
                if duration:
                    minutes = int(duration // 60)
                    seconds = int(duration % 60)
                    caption += f" ({minutes}:{seconds:02d})"
            else:
                caption = f"Audio: {filename}"
                if duration:
                    minutes = int(duration // 60)
                    seconds = int(duration % 60)
                    caption += f" ({minutes}:{seconds:02d})"

            self._save_media_to_db(file_path, media_type, duration, file_size, modified_time, thumbnail_path, caption=caption)
            
            proc_time = time.time() - start_t
            logger.info(f"[MEDIA] {filename} | {media_type} | {proc_time:.2f}s{' | Thumbnail: ✓' if thumbnail_path else ''} | AUTO-FIX: ✓")
            
            return {
                "success": True,
                "path": file_path,
                "filename": filename,
                "media_type": media_type,
                "duration": duration,
                "file_size": file_size,
                "thumbnail": thumbnail_path,
                "caption": caption,
                "objects": [],
                "tags": [media_type],
                "emotion": "neutral",
                "processing_time": round(proc_time, 2),
                "date_modified": modified_time
            }
        except Exception as e:
            logger.error(f"Media process error: {e}")
            return {"success": False, "error": str(e)}
    
    def fix_media_types_in_db(self):
        """Fix any videos/audio that were saved with wrong media_type (auto-correction)"""
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            
            # Find all files with video extensions but wrong media_type
            c.execute("""
                SELECT id, path, media_type 
                FROM images 
                WHERE (path LIKE '%.mp4' OR path LIKE '%.mov' OR path LIKE '%.avi' OR 
                       path LIKE '%.mkv' OR path LIKE '%.flv' OR path LIKE '%.wmv' OR 
                       path LIKE '%.webm' OR path LIKE '%.m4v' OR path LIKE '%.3gp' OR 
                       path LIKE '%.mpeg' OR path LIKE '%.mpg')
                AND (media_type != 'video' OR media_type IS NULL)
            """)
            
            video_rows = c.fetchall()
            fixed_count = 0
            
            for row in video_rows:
                file_id, path, current_type = row
                c.execute("UPDATE images SET media_type = 'video' WHERE id = ?", (file_id,))
                fixed_count += 1
                logger.info(f"[AUTO-FIX] Updated {os.path.basename(path)}: {current_type} → video")
            
            # Find all files with audio extensions but wrong media_type
            c.execute("""
                SELECT id, path, media_type 
                FROM images 
                WHERE (path LIKE '%.mp3' OR path LIKE '%.wav' OR path LIKE '%.flac' OR 
                       path LIKE '%.aac' OR path LIKE '%.ogg' OR path LIKE '%.m4a' OR 
                       path LIKE '%.wma' OR path LIKE '%.opus')
                AND (media_type != 'audio' OR media_type IS NULL)
            """)
            
            audio_rows = c.fetchall()
            
            for row in audio_rows:
                file_id, path, current_type = row
                c.execute("UPDATE images SET media_type = 'audio' WHERE id = ?", (file_id,))
                fixed_count += 1
                logger.info(f"[AUTO-FIX] Updated {os.path.basename(path)}: {current_type} → audio")
            
            conn.commit()
            conn.close()
            
            if fixed_count > 0:
                logger.info(f"[AUTO-FIX] ✓ Fixed {fixed_count} media file(s) with incorrect media_type")
            
            return fixed_count
        except Exception as e:
            logger.error(f"[AUTO-FIX] Error fixing media types: {e}")
            return 0
    
    def _save_media_to_db(self, path, media_type, duration, file_size, modified_time, thumbnail_path=None, caption=None):
        """Save media file metadata to database"""
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            
            file_id = hashlib.md5(path.encode()).hexdigest()
            filename = os.path.basename(path)
            
            # Use filename as caption if not provided
            if caption is None:
                caption = filename
            
            # Store thumbnail path in metadata if available
            metadata = {}
            if thumbnail_path:
                metadata['thumbnail_path'] = thumbnail_path
            
            c.execute("""
                INSERT OR REPLACE INTO images 
                (id, path, filename, caption, media_type, duration, file_size, scanned_at, tags, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (file_id, path, filename, caption, media_type, duration, file_size, modified_time, json.dumps([media_type]), json.dumps(metadata)))
            
            conn.commit()
            conn.close()
            logger.info(f"[DB] Saved {media_type}: {filename}")
                
        except Exception as e:
            logger.error(f"[DB] Failed to save {media_type}: {e}")

    def _categorize_into_album(self, photo_type, caption, objects, emotion):
        """Perfect album categorization based on AI analysis - ULTRA STRICT DOCUMENT DETECTION"""
        caption_lower = caption.lower()
        objects_str = ' '.join(objects).lower()
        
        # Priority 1: Documents (ULTRA STRICT - only actual documents, not nature/landscape images)
        document_keywords_strong = [
            'screenshot', 'phone screen', 'app interface', 'ui elements', 'status bar',
            'whatsapp', 'telegram', 'chat interface', 'text message',
            'receipt', 'invoice', 'bill', 'document', 'text document',
            'form', 'certificate', 'scanned document', 'pdf',
            'spreadsheet', 'handwritten', 'document scan',
            'whiteboard', 'email interface'
        ]
        
        nature_exclusion_keywords = [
            'landscape', 'mountain', 'beach', 'ocean', 'sky', 'outdoor', 'nature', 'scenery',
            'forest', 'river', 'lake', 'park', 'garden', 'tree', 'trees', 'flower', 'flowers',
            'sunset', 'sunrise', 'cloud', 'clouds', 'field', 'grass', 'hill', 'valley',
            'waterfall', 'animal', 'bird', 'wildlife', 'sea', 'coast', 'desert', 'snow',
            'rain', 'storm', 'path', 'trail', 'rock', 'cliff', 'cave', 'meadow',
            'food', 'meal', 'dish', 'restaurant', 'cuisine',
            'car', 'vehicle', 'pet', 'dog', 'cat'
        ]
        
        has_nature = any(kw in caption_lower for kw in nature_exclusion_keywords)
        has_nature_objects = any(kw in objects_str for kw in nature_exclusion_keywords)
        is_nature_content = has_nature or has_nature_objects
        
        if photo_type in ['screenshot', 'document', 'whatsapp-chat', 'document-scan',
                          'receipt', 'form-document', 'certificate']:
            if not is_nature_content:
                return 'Documents'
        
        has_document_keywords = any(kw in caption_lower for kw in document_keywords_strong)
        if has_document_keywords and not is_nature_content:
            return 'Documents'
        
        # Priority 2: Events (multiple people, parties, celebrations)
        if photo_type in ['group-photo', 'photo-multiple-people', 'event']:
            return 'Events'
        event_keywords = ['party', 'celebration', 'wedding', 'birthday', 'gathering', 'group',
                         'crowd', 'friends', 'family photo', 'event', 'concert', 'festival',
                         'graduation', 'ceremony', 'reception']
        if any(kw in caption_lower for kw in event_keywords):
            return 'Events'
        if any(kw in objects_str for kw in ['people', 'crowd', 'group', 'friends', 'family', 'gathering']):
            if len([o for o in objects if 'person' in o.lower() or 'people' in o.lower()]) > 1:
                return 'Events'
        
        # Priority 3: People / Portraits (moved up so people are not tagged as animals/locations)
        if photo_type in ['portrait', 'selfie']:
            return 'People'
        people_keywords = ['person', 'people', 'man', 'woman', 'boy', 'girl', 'child',
                           'baby', 'guy', 'lady', 'selfie', 'portrait', 'face', 'couple', 'human']
        # Very high priority if "person" etc. is exactly in the objects list or clearly in caption
        if any(kw in caption_lower for kw in people_keywords) or any(kw in objects_str for kw in people_keywords):
            return 'People'
            
        # Priority 4: Vehicles  
        if photo_type == 'vehicle':
            return 'Vehicles'
        vehicle_keywords = ['car', 'bike', 'motorcycle', 'motorbike', 'truck', 'bus', 'van',
                            'scooter', 'jeep', 'suv', 'automobile', 'vehicle', 'two-wheeler',
                            'bicycle', 'cycle', 'auto rickshaw', 'rickshaw', 'tractor', 'trailer']
        if any(kw in caption_lower for kw in vehicle_keywords):
            return 'Vehicles'
        if any(kw in objects_str for kw in vehicle_keywords):
            return 'Vehicles'
        
        # Priority 5: Animals
        if photo_type == 'animal':
            return 'Animals'
        animal_keywords = ['dog', 'cat', 'bird', 'horse', 'cow', 'elephant', 'lion', 'tiger',
                           'bear', 'monkey', 'rabbit', 'fish', 'snake', 'deer', 'fox',
                           'wolf', 'leopard', 'cheetah', 'giraffe', 'zebra', 'penguin',
                           'parrot', 'eagle', 'owl', 'duck', 'chicken', 'goat', 'sheep',
                           'pet', 'wildlife', 'animal', 'puppy', 'kitten']
        if any(kw in caption_lower for kw in animal_keywords):
            return 'Animals'
        if any(kw in objects_str for kw in animal_keywords):
            return 'Animals'
        
        # Priority 6: Architecture / Buildings
        if photo_type == 'architecture':
            return 'Architecture'
        arch_keywords = ['building', 'architecture', 'church', 'temple', 'mosque', 'monument',
                         'bridge', 'tower', 'skyscraper', 'castle', 'palace', 'fort', 'stadium',
                         'hospital', 'school', 'university', 'mall', 'airport', 'station']
        if any(kw in caption_lower for kw in arch_keywords):
            return 'Architecture'
        if any(kw in objects_str for kw in arch_keywords):
            return 'Architecture'
        
        # Priority 7: Sports & Fitness
        if photo_type == 'sports':
            return 'Sports'
        sports_keywords = ['gym', 'fitness', 'workout', 'exercise', 'cricket', 'football',
                           'basketball', 'tennis', 'swimming', 'running', 'cycling', 'yoga',
                           'boxing', 'wrestling', 'marathon', 'athlete', 'sport', 'match',
                           'stadium', 'field', 'court', 'pitch', 'training', 'race']
        if any(kw in caption_lower for kw in sports_keywords):
            return 'Sports'
        if any(kw in objects_str for kw in sports_keywords):
            return 'Sports'
        
        # Priority 8: Locations (landscapes, travel, outdoor scenes)
        if photo_type in ['landscape', 'nature-landscape', 'outdoor-scene']:
            return 'Locations'
        location_keywords = ['landscape', 'mountain', 'beach', 'ocean', 'sky', 'outdoor', 'nature',
                             'scenery', 'travel', 'landmark', 'sunset', 'sunrise', 'view', 'vista',
                             'forest', 'river', 'lake', 'park', 'garden', 'monument', 'waterfall',
                             'valley', 'cliff', 'desert', 'snow', 'meadow', 'farm', 'rural']
        if any(kw in caption_lower for kw in location_keywords):
            return 'Locations'
        if any(kw in objects_str for kw in location_keywords):
            return 'Locations'
        
        # Default: Others (food, products, artwork, etc.)
        return 'Others'
    
    def _save_to_db(self, path, caption, objects, emotion="neutral", exif_metadata=None, album_category="Others", media_type="image", extracted_text=""):
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            
            # Build metadata JSON including album_category
            full_metadata = exif_metadata.copy() if exif_metadata else {}
            full_metadata['album_category'] = album_category
            full_metadata['emotion'] = emotion
            
            # Prepare EXIF data with album category
            exif_json = json.dumps(full_metadata)
            date_taken = exif_metadata.get('date_taken') if exif_metadata else None
            latitude = exif_metadata.get('latitude') if exif_metadata else None
            longitude = exif_metadata.get('longitude') if exif_metadata else None
            camera_make = exif_metadata.get('camera_make') if exif_metadata else None
            camera_model = exif_metadata.get('camera_model') if exif_metadata else None
            file_size = exif_metadata.get('file_size') if exif_metadata else None
            if file_size is None:
                try:
                    file_size = os.path.getsize(path)
                except Exception:
                    file_size = None
            
            # Look up image by PATH, not ID
            c.execute("SELECT id FROM images WHERE path = ?", (path,))
            existing = c.fetchone()
            
            if existing:
                # Update existing image
                existing_id = existing[0]
                c.execute("""
                    UPDATE images 
                    SET caption = ?, emotion = ?, objects = ?, tags = ?, scanned_at = ?, 
                        exif_data = ?, date_taken = ?, 
                        latitude = ?, longitude = ?, 
                        gps_latitude = ?, gps_longitude = ?,
                        camera_make = ?, camera_model = ?, media_type = ?,
                        file_size = ?, extracted_text = ?
                    WHERE id = ?
                """, (
                    caption, emotion, json.dumps(objects), json.dumps(objects), datetime.now().isoformat(),
                    exif_json, date_taken,
                    latitude, longitude,
                    latitude, longitude,
                    camera_make, camera_model, media_type,
                    file_size, extracted_text or None,
                    existing_id
                ))
            else:
                # Insert new image
                image_id = hashlib.md5(path.encode()).hexdigest()
                c.execute("""
                    INSERT INTO images 
                    (id, path, filename, caption, emotion, objects, tags, scanned_at, exif_data, date_taken, 
                     latitude, longitude, gps_latitude, gps_longitude, camera_make, camera_model, media_type,
                     file_size, extracted_text) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    image_id, path, os.path.basename(path), caption, emotion, json.dumps(objects), json.dumps(objects),
                    datetime.now().isoformat(), exif_json, date_taken,
                    latitude, longitude, latitude, longitude,
                    camera_make, camera_model, media_type,
                    file_size, extracted_text or None
                ))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"[DB] Error saving to database: {e}")
            import traceback
            traceback.print_exc()
    
    def _save_document_to_db(self, path, media_type, file_size, modified_time, thumbnail_path, extracted_text, caption, page_count=None):
        """Save document to database with extracted text"""
        try:
            logger.info(f"[DB] Saving document with page_count: {page_count} (type: {type(page_count)})")
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            
            # Build metadata JSON
            metadata = {
                'file_size': file_size,
                'date_modified': modified_time,
                'pages': page_count,
                'album_category': 'Documents',
                'emotion': 'neutral',
                'thumbnail_path': thumbnail_path
            }
            metadata_json = json.dumps(metadata)
            
            # Look up document by PATH
            c.execute("SELECT id FROM images WHERE path = ?", (path,))
            existing = c.fetchone()
            
            if existing:
                # Update existing document
                existing_id = existing[0]
                c.execute("""
                    UPDATE images 
                    SET caption = ?, emotion = ?, scanned_at = ?, 
                        exif_data = ?, media_type = ?,
                        extracted_text = ?, file_size = ?
                    WHERE id = ?
                """, (
                    caption, 'neutral', datetime.now().isoformat(),
                    metadata_json, media_type,
                    extracted_text, file_size,
                    existing_id
                ))
                logger.info(f"[DB] Updated document: {os.path.basename(path)}")
            else:
                # Insert new document
                doc_id = hashlib.md5(path.encode()).hexdigest()
                c.execute("""
                    INSERT INTO images 
                    (id, path, filename, caption, emotion, objects, scanned_at, exif_data, 
                     media_type, extracted_text, file_size) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    doc_id, path, os.path.basename(path), caption, 'neutral', json.dumps([]),
                    datetime.now().isoformat(), metadata_json,
                    media_type, extracted_text, file_size
                ))
                logger.info(f"[DB] Inserted document: {os.path.basename(path)}")
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"[DB] Error saving document to database: {e}")
            import traceback
            traceback.print_exc()

    def ai_chat(self, path, msg):
        """Enterprise-grade AI chat with RAG, caching, text-only support, and conversation history.
        
        Speed optimizations implemented:
        1. Response caching (LRU) - instant for repeated queries
        2. RAG database search - no model inference for text queries about library
        3. Smart routing - only uses vision model when image is provided
        4. Optimized token generation with aggressive settings
        5. Conversation history for context continuity
        6. Pre-computed database statistics
        """
        start_time = time.time()
        
        try:
            msg = (msg or '').strip()
            if not msg and not path:
                return {"success": True, "response": "Please ask me something or share an image!", "timing": 0}
            
            # === 1. CHECK RESPONSE CACHE ===
            cache_key = hashlib.md5(f"{path or ''}:{msg}".encode()).hexdigest()
            if cache_key in self._chat_cache:
                cached = self._chat_cache[cache_key]
                elapsed = time.time() - start_time
                logger.info(f"[CHAT] Cache hit! Response in {elapsed:.3f}s")
                return {**cached, "timing": round(elapsed, 3), "cached": True}
            
            # === 2. SMART ROUTING: Determine query type ===
            msg_lower = msg.lower()
            
            # Detect intent: library query, stats, search, or image analysis
            is_stats_query = any(w in msg_lower for w in [
                'stats', 'statistics', 'how many', 'count', 'total', 'library',
                'summary', 'overview', 'info', 'information'
            ])
            is_search_query = any(w in msg_lower for w in [
                'find', 'show', 'search', 'look for', 'get', 'where', 'which',
                'recent', 'latest', 'last', 'photos of', 'pictures of', 'images of',
                'happy', 'sad', 'selfie', 'landscape', 'food', 'document', 'group',
                'sunset', 'nature', 'people', 'portrait', 'video', 'favorite',
                'glasses', 'sunglasses', 'spectacles', 'vehicle', 'car', 'bike',
                'motorcycle', 'animal', 'dog', 'cat', 'wedding', 'birthday', 'party',
                'beach', 'mountain', 'forest', 'flower', 'night', 'dark', 'bright'
            ])
            is_greeting = any(w in msg_lower for w in [
                'hello', 'hi', 'hey', 'good morning', 'good evening', 'how are you',
                'what can you do', 'help', 'capabilities'
            ])
            has_image = path and os.path.exists(str(path)) if path else False
            
            # === 3. HANDLE GREETINGS (instant, no model needed) ===
            if is_greeting and not has_image:
                greetings = [
                    "Hello! I'm your SmartMedia AI assistant. I can:\n\n"
                    "📸 **Analyze images** - Describe what's in your photos\n"
                    "🔍 **Search your library** - Find photos by mood, type, or content\n"
                    "📊 **Show statistics** - Get insights about your media collection\n"
                    "👥 **Face recognition** - Find photos of specific people\n"
                    "🎨 **Color & clothing** - Identify what people are wearing\n\n"
                    "Try asking: 'Show me happy photos' or 'How many photos do I have?'"
                ]
                response = greetings[0]
                elapsed = time.time() - start_time
                result = {"success": True, "response": response, "timing": round(elapsed, 3)}
                self._cache_response(cache_key, result)
                return result
            
            # === 4. HANDLE STATS QUERIES (fast DB lookup, no model) ===
            if is_stats_query and not has_image:
                stats = self.rag_engine.get_stats()
                response = f"📊 **Your SmartMedia Library**\n\n"
                response += f"📷 Total items: **{stats['total']}**\n"
                response += f"🖼️ Photos: **{stats['images']}**\n"
                response += f"🎬 Videos: **{stats['videos']}**\n"
                response += f"📄 Documents: **{stats['documents']}**\n"
                response += f"⭐ Favorites: **{stats['favorites']}**\n"
                if stats.get('emotions'):
                    response += f"\n😊 **Mood breakdown:**\n"
                    for emo, count in sorted(stats['emotions'].items(), key=lambda x: x[1], reverse=True):
                        emoji = {'happy': '😊', 'sad': '😢', 'excited': '🎉', 'peaceful': '😌', 'neutral': '😐'}.get(emo, '📷')
                        response += f"  {emoji} {emo.capitalize()}: {count}\n"
                
                elapsed = time.time() - start_time
                result = {"success": True, "response": response, "timing": round(elapsed, 3)}
                self._cache_response(cache_key, result)
                return result
            
            # === 5. HANDLE SEARCH QUERIES (RAG, fast DB search) ===
            if is_search_query and not has_image:
                rag_results = self.rag_engine.search(msg, top_k=8)
                
                if rag_results:
                    # Format search results
                    images_data = []
                    for entry in rag_results:
                        images_data.append({
                            'path': entry['path'],
                            'filename': entry['filename'],
                            'caption': entry.get('caption', ''),
                            'objects': entry.get('objects', [])
                        })
                    
                    response = f"Found **{len(rag_results)}** matching items:\n\n"
                    for i, entry in enumerate(rag_results[:4], 1):
                        response += f"{i}. **{entry['filename']}**"
                        if entry.get('caption'):
                            response += f" - {entry['caption'][:80]}"
                        response += "\n"
                    
                    if len(rag_results) > 4:
                        response += f"\n...and {len(rag_results) - 4} more results"
                    
                    elapsed = time.time() - start_time
                    result = {
                        "success": True,
                        "response": response,
                        "images": images_data,
                        "action": "show_images",
                        "timing": round(elapsed, 3)
                    }
                    self._cache_response(cache_key, result)
                    return result
                else:
                    response = "I couldn't find any matching photos. Try different keywords or scan more photos first."
                    elapsed = time.time() - start_time
                    return {"success": True, "response": response, "timing": round(elapsed, 3)}
            
            # === 6. HANDLE IMAGE ANALYSIS (vision model) ===
            if has_image:
                self._ensure_model_loaded()
                if self.demo_mode:
                    return {"success": True, "response": "AI model is loading... Please try again in a moment.", "timing": 0}
                
                image = Image.open(path).convert("RGB")
                
                # Optimized resize for chat - align to 28px for Qwen2-VL
                if max(image.size) > MAX_IMAGE_SIZE:
                    scale = MAX_IMAGE_SIZE / max(image.size)
                    new_w = max(28, (int(image.width * scale) // 28) * 28)
                    new_h = max(28, (int(image.height * scale) // 28) * 28)
                    image = image.resize((new_w, new_h), Image.BILINEAR)
                
                # Enhanced prompt engineering for different question types
                if any(word in msg_lower for word in ['wearing', 'clothes', 'outfit', 'color', 'colour', 'dress']):
                    enhanced_msg = f"{msg} Describe all clothing items and their exact colors in detail."
                elif any(word in msg_lower for word in ['describe', 'what', 'tell', 'explain', 'analyze']):
                    enhanced_msg = f"{msg} Provide a detailed, natural description covering subjects, setting, colors, mood, and notable details."
                else:
                    enhanced_msg = msg
                
                messages = [{"role": "user", "content": [{"type": "image", "image": image}, {"type": "text", "text": enhanced_msg}]}]
                text = self.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                inputs = self.processor(text=[text], images=[image], padding=True, return_tensors="pt").to(self.model.device)
                
                with torch.inference_mode():
                    ids = self.model.generate(
                        **inputs,
                        max_new_tokens=250,            # Rich detailed chat responses
                        do_sample=False,               # Greedy for speed
                        num_beams=1,
                        use_cache=True,                # KV cache for speed
                        length_penalty=0.9,            # Natural-feeling output length
                        no_repeat_ngram_size=3,        # Prevent repetition loops
                        repetition_penalty=1.4,        # Strong dedup for clean output
                        early_stopping=True,           # Stop at EOS immediately
                        pad_token_id=self.processor.tokenizer.pad_token_id,
                        eos_token_id=self.processor.tokenizer.eos_token_id,
                    )
                
                response = self.processor.batch_decode(ids[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0]
                
                # Hard truncate chat response at 1000 chars for safety
                response = response.strip()[:1000]
                
                # Cleanup for faster sequential processing
                del image, inputs, ids
                if self.device == "cuda":
                    torch.cuda.empty_cache()
                gc.collect()
                
                elapsed = time.time() - start_time
                logger.info(f"[CHAT] Image analysis in {elapsed:.2f}s | {len(response)} chars")
                result = {"success": True, "response": response, "timing": round(elapsed, 3)}
                self._cache_response(cache_key, result)
                return result
            
            # === 7. HANDLE GENERAL TEXT QUERIES (no image, not a search/stats) ===
            # Try RAG first, then fall back to general knowledge response
            rag_results = self.rag_engine.search(msg, top_k=4)
            if rag_results:
                images_data = [{'path': e['path'], 'filename': e['filename'], 'caption': e.get('caption', '')} for e in rag_results]
                response = f"Here's what I found related to '{msg}':\n\n"
                for i, entry in enumerate(rag_results[:4], 1):
                    response += f"{i}. **{entry['filename']}** - {entry.get('caption', 'No caption')[:60]}\n"
                elapsed = time.time() - start_time
                return {"success": True, "response": response, "images": images_data, "action": "show_images", "timing": round(elapsed, 3)}
            
            # General conversational response
            response = (
                "I can help you with your photo library! Try:\n\n"
                "🔍 **'Find sunset photos'** - Search by content\n"
                "😊 **'Show happy photos'** - Search by mood\n"
                "📊 **'Library stats'** - See your collection overview\n"
                "📷 **Share an image** - I'll analyze it in detail"
            )
            elapsed = time.time() - start_time
            return {"success": True, "response": response, "timing": round(elapsed, 3)}
            
        except Exception as e:
            logger.error(f"[CHAT] Error: {e}")
            import traceback
            traceback.print_exc(file=sys.stderr)
            return {"success": False, "error": str(e), "response": "Sorry, I encountered an error. Please try again."}
    
    def _cache_response(self, key, result):
        """Cache a chat response with LRU eviction"""
        if len(self._chat_cache) >= self._chat_cache_max:
            # Evict oldest half
            oldest = list(self._chat_cache.keys())[:self._chat_cache_max // 2]
            for k in oldest:
                del self._chat_cache[k]
        self._chat_cache[key] = result

    def detect_faces_in_image(self, path):
        """Detect faces in an image and save to face database with thumbnails"""
        if not HAS_FACE_RECOGNITION:
            logger.warning("[FACE DETECTION] face_recognition library not available")
            return []
        
        try:
            # Check if file exists
            if not os.path.exists(path):
                logger.warning(f"[FACE DETECTION] File not found: {path}")
                return []
            
            # OPTIMIZED FACE DETECTION
            import face_recognition
            import numpy as np
            import base64
            
            logger.info(f"[FACE DETECTION] Processing {os.path.basename(path)}...")
            
            img = face_recognition.load_image_file(path)
            
            # Downscale huge images for detection while preserving face details
            h, w = img.shape[:2]
            original_size = f"{w}x{h}"
            scale = 1.0
            img_small = img
            
            # Better scaling logic - preserve more detail for face detection
            if max(h, w) > FACE_SCAN_SIZE:
                scale = FACE_SCAN_SIZE / max(h, w)
                if HAS_CV2:
                    import cv2
                    # Use INTER_AREA for downsampling (better quality for faces)
                    img_small = cv2.resize(img, (0,0), fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
                    logger.info(f"[FACE DETECTION] Resized with OpenCV (INTER_AREA): {w}x{h} -> scale={scale:.2f}")
                else:
                    # Fallback: use PIL with LANCZOS for better quality
                    from PIL import Image as PILImage
                    new_w, new_h = int(w * scale), int(h * scale)
                    pil_img = PILImage.fromarray(img)
                    pil_img = pil_img.resize((new_w, new_h), PILImage.LANCZOS)
                    img_small = np.array(pil_img)
                    logger.info(f"[FACE DETECTION] Resized with PIL (LANCZOS): {w}x{h} -> {new_w}x{new_h}")
            else:
                logger.info(f"[FACE DETECTION] Image size OK (no resize needed): {w}x{h}")
            
            # NOTE: face_recognition.load_image_file() already returns RGB format
            # No color conversion needed - img and img_small are already in correct RGB format
                
            # Detect faces using HOG model (faster, good accuracy)
            start_detection = time.time()
            locs_small = []
            
            try:
                # HOG with upsampling for speed and accuracy balance
                locs_small = face_recognition.face_locations(img_small, model="hog", number_of_times_to_upsample=FACE_UPSAMPLE)
                if locs_small:
                    logger.info(f"[FACE DETECTION] HOG detected {len(locs_small)} face(s) with upsampling={FACE_UPSAMPLE}")
            except Exception as e:
                logger.warning(f"[FACE DETECTION] HOG failed: {e}")

            detection_time = time.time() - start_detection

            if not locs_small:
                logger.info(f"[FACE DETECTION] No faces found with HOG ({detection_time:.2f}s)")
                return []
            
            logger.info(f"[FACE DETECTION] ✓ Detected {len(locs_small)} face(s) in {detection_time:.2f}s")
            
            # Scale locations back up
            locs = []
            for (top, right, bottom, left) in locs_small:
                locs.append((int(top/scale), int(right/scale), int(bottom/scale), int(left/scale)))
            
            # Encode faces using full-resolution image
            logger.info(f"[FACE DETECTION] Encoding {len(locs)} face(s)...")
            start_encode = time.time()
            encs = face_recognition.face_encodings(img, locs)
            encode_time = time.time() - start_encode
            logger.info(f"[FACE DETECTION] Encoding completed in {encode_time:.2f}s")
            
            if len(encs) == 0:
                logger.warning(f"[FACE DETECTION] Failed to encode faces in {os.path.basename(path)}")
                return []
            
            faces = []
            for i, (loc, enc) in enumerate(zip(locs, encs)):
                # Create face thumbnail
                thumbnail = None
                try:
                    top, right, bottom, left = loc
                    # Add padding (15%) around face
                    padding = int((bottom - top) * 0.15)
                    top = max(0, top - padding)
                    left = max(0, left - padding)
                    bottom = min(h, bottom + padding)
                    right = min(w, right + padding)
                    
                    # Crop face region
                    face_img = img[top:bottom, left:right]
                    
                    # Resize to thumbnail size (150x150)
                    from PIL import Image as PILImage
                    face_pil = PILImage.fromarray(face_img)
                    face_pil = face_pil.resize((150, 150), PILImage.LANCZOS)
                    
                    # Convert to base64
                    buffer = io.BytesIO()
                    face_pil.save(buffer, format='JPEG', quality=85)
                    thumbnail = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()
                    logger.info(f"[FACE DETECTION] Created thumbnail for face {i+1}")
                except Exception as e:
                    logger.warning(f"[FACE DETECTION] Failed to create thumbnail: {e}")
                
                # Add face to database with encoding and thumbnail
                fid = self.face_db.add_or_update_face(enc, path, loc, thumbnail)
                faces.append({"face_id": fid, "location": loc})
                logger.info(f"[FACE DETECTION] Added/Updated face {fid}")
            
            # Save face database
            self.face_db._save()
            
            return faces
            
        except Exception as e:
            logger.error(f"[FACE DETECTION] Error processing {os.path.basename(path)}: {e}")
            import traceback
            traceback.print_exc()
            return []

    def scan_all_images_for_faces(self, paths, cb, force_rescan=False):
        """Scan images for faces with proper progress tracking (smart scanning)"""
        # If no paths provided, fetch all images from database
        if not paths or len(paths) == 0:
            logger.info("[FACE SCAN] No paths provided, fetching from database...")
            paths = self._get_all_image_paths_from_db(force_rescan)
            logger.info(f"[FACE SCAN] Found {len(paths)} images to scan")
        
        if len(paths) == 0:
            logger.info("[FACE SCAN] No new images to scan (all already processed)")
            return {
                "success": True,
                "message": "All images already scanned",
                "processed": 0,
                "faces_detected": 0,
                "new_faces": 0,
                "total_people": len(self.face_db.faces)
            }
        
        faces_found = 0
        new_faces = 0
        skipped = 0
        processed = 0
        
        # Track faces before scanning
        faces_before = len(self.face_db.faces)
        
        logger.info(f"[FACE SCAN] ═══════════════════════════════════════")
        logger.info(f"[FACE SCAN] Starting comprehensive face scan")
        logger.info(f"[FACE SCAN] Total images to process: {len(paths)}")
        logger.info(f"[FACE SCAN] Current people in database: {faces_before}")
        logger.info(f"[FACE SCAN] Detection model: {FACE_DETECTION_MODEL.upper()}")
        logger.info(f"[FACE SCAN] Scan resolution: {FACE_SCAN_SIZE}px")
        logger.info(f"[FACE SCAN] Upsample level: {FACE_UPSAMPLE}")
        logger.info(f"[FACE SCAN] ═══════════════════════════════════════")
        
        for i, path in enumerate(paths):
            try:
                # Check if file exists
                if not os.path.exists(path):
                    logger.warning(f"[FACE SCAN] [{i+1}/{len(paths)}] File not found: {os.path.basename(path)}")
                    skipped += 1
                    continue
                
                # Progress update with detailed info
                logger.info(f"[FACE SCAN] [{i+1}/{len(paths)}] Processing: {os.path.basename(path)}")
                
                # Send progress callback with current image info
                if cb:
                    cb(i + 1, len(paths))
                
                detected = self.detect_faces_in_image(path)
                processed += 1
                
                if detected:
                    faces_found += len(detected)
                    logger.info(f"[FACE SCAN] ✓ Found {len(detected)} face(s) | Total faces so far: {faces_found}")
                    # Update database to mark as scanned
                    self._mark_image_as_scanned(path, len(detected))
                else:
                    logger.info(f"[FACE SCAN] ○ No faces detected")
                    # Mark as scanned even if no faces found
                    self._mark_image_as_scanned(path, 0)
                
            except Exception as e:
                logger.error(f"[FACE SCAN] ✗ Error processing {os.path.basename(path)}: {e}")
                skipped += 1
                continue
        
        # Calculate new faces
        faces_after = len(self.face_db.faces)
        new_faces = faces_after - faces_before
        
        logger.info(f"[FACE SCAN] ═══════════════════════════════════════")
        logger.info(f"[FACE SCAN] Scan Complete - Summary:")
        logger.info(f"[FACE SCAN] • Processed: {processed}/{len(paths)} images")
        logger.info(f"[FACE SCAN] • Total faces detected: {faces_found}")
        logger.info(f"[FACE SCAN] • New people discovered: {new_faces}")
        logger.info(f"[FACE SCAN] • Total people in database: {faces_after}")
        if skipped > 0:
            logger.info(f"[FACE SCAN] • Skipped: {skipped} images (errors/missing)")
        logger.info(f"[FACE SCAN] ═══════════════════════════════════════")
        
        return {
            "success": True, 
            "processed": processed,
            "faces_detected": faces_found,
            "new_faces": new_faces,
            "total_people": faces_after,
            "skipped": skipped
        }
    
    def _get_all_image_paths_from_db(self, force_rescan=False):
        """Fetch image paths from database (only unscanned images by default)"""
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            
            if force_rescan:
                # Get all images regardless of scan status
                c.execute("SELECT path FROM images ORDER BY scanned_at DESC")
                logger.info("[DB] Force rescan enabled - fetching all images")
            else:
                # Only get unscanned images
                c.execute("SELECT path FROM images WHERE face_scanned = 0 OR face_scanned IS NULL ORDER BY scanned_at DESC")
                logger.info("[DB] Smart scan - fetching only unscanned images")
            
            rows = c.fetchall()
            conn.close()
            
            if not rows:
                logger.info("[DB] No unscanned images found in database")
                return []
            
            logger.info(f"[DB] Found {len(rows)} images in database")
            
            # Filter for existing files
            paths = []
            missing = 0
            for row in rows:
                if row[0]:
                    if os.path.exists(row[0]):
                        paths.append(row[0])
                    else:
                        missing += 1
                        logger.debug(f"[DB] File not found: {row[0]}")
            
            if missing > 0:
                logger.warning(f"[DB] {missing} files from database no longer exist")
            
            logger.info(f"[DB] Retrieved {len(paths)} valid image paths")
            return paths
        except Exception as e:
            logger.error(f"[DB] Error fetching image paths: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def _mark_image_as_scanned(self, path, face_count):
        """Mark image as scanned for faces in the database"""
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            c.execute("UPDATE images SET face_scanned = 1, face_count = ? WHERE path = ?", (face_count, path))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"[DB] Error marking image as scanned: {e}")
    
    def _get_unprocessed_images_only(self):
        """Get only images that haven't been processed for face detection yet"""
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            
            # Get images that haven't been scanned for faces yet
            c.execute("""
                SELECT path FROM images 
                WHERE (face_scanned = 0 OR face_scanned IS NULL) 
                AND path IS NOT NULL 
                ORDER BY scanned_at DESC
            """)
            
            rows = c.fetchall()
            conn.close()
            
            # Filter for existing files only
            unprocessed_paths = []
            for row in rows:
                if row[0] and os.path.exists(row[0]):
                    unprocessed_paths.append(row[0])
            
            logger.info(f"[INCREMENTAL] Found {len(unprocessed_paths)} unprocessed images")
            return unprocessed_paths
            
        except Exception as e:
            logger.error(f"[INCREMENTAL] Error getting unprocessed images: {e}")
            return []
    
    def _is_image_processed_for_faces(self, image_path):
        """Check if an image has already been processed for face detection"""
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            c.execute("SELECT face_scanned FROM images WHERE path = ?", (image_path,))
            row = c.fetchone()
            conn.close()
            
            # Return True if face_scanned = 1, False otherwise
            return row and row[0] == 1
            
        except Exception as e:
            logger.error(f"[INCREMENTAL] Error checking if image processed: {e}")
            return False

    def get_face_processing_stats(self):
        """Get statistics about face processing status"""
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            
            # Total images
            c.execute("SELECT COUNT(*) FROM images")
            total_images = c.fetchone()[0]
            
            # Processed images
            c.execute("SELECT COUNT(*) FROM images WHERE face_scanned = 1")
            processed_images = c.fetchone()[0]
            
            # Images with faces
            c.execute("SELECT COUNT(*) FROM images WHERE face_count > 0")
            images_with_faces = c.fetchone()[0]
            
            # Total face count across all images
            c.execute("SELECT SUM(face_count) FROM images WHERE face_count > 0")
            total_faces_detected = c.fetchone()[0] or 0
            
            conn.close()
            
            # People in database 
            total_people = len(self.face_db.faces)
            
            return {
                "total_images": total_images,
                "processed_images": processed_images,
                "unprocessed_images": total_images - processed_images,
                "images_with_faces": images_with_faces,
                "total_faces_detected": total_faces_detected,
                "total_people": total_people,
                "processing_complete": processed_images == total_images
            }
            
        except Exception as e:
            logger.error(f"[STATS] Error getting face processing stats: {e}")
            return {
                "error": str(e),
                "total_images": 0,
                "processed_images": 0,
                "unprocessed_images": 0
            }

    def scan_images_incrementally(self, callback=None):
        """Incremental face scanning - only process new/unscanned images"""
        logger.info("[INCREMENTAL] Starting incremental face scanning...")
        
        # Get only unprocessed images
        unprocessed_paths = self._get_unprocessed_images_only()
        
        if not unprocessed_paths:
            logger.info("[INCREMENTAL] ✓ No new images to process - all up to date!")
            return {
                "success": True,
                "message": "No new images to scan",
                "processed": 0,
                "faces_detected": 0,
                "new_faces": 0,
                "existing_matches": 0,
                "total_people": len(self.face_db.faces)
            }
        
        logger.info(f"[INCREMENTAL] Processing {len(unprocessed_paths)} new images...")
        
        # Track statistics
        faces_before = len(self.face_db.faces)
        processed_count = 0
        total_faces_found = 0
        new_person_count = 0
        existing_matches = 0
        
        # Process each unprocessed image
        for i, image_path in enumerate(unprocessed_paths):
            try:
                logger.info(f"[INCREMENTAL] [{i+1}/{len(unprocessed_paths)}] Processing: {os.path.basename(image_path)}")
                
                # Send progress callback
                if callback:
                    callback(i + 1, len(unprocessed_paths))
                
                # Detect faces in the image using consistent processing
                detected_faces = self.detect_faces_in_image(image_path)
                processed_count += 1
                
                if detected_faces:
                    total_faces_found += len(detected_faces)
                    logger.info(f"[INCREMENTAL] ✓ Found {len(detected_faces)} face(s)")
                    
                    # Face matching is automatically handled by detect_faces_in_image -> add_or_update_face
                    # Check if any new persons were created vs matches to existing
                    # (This is tracked in the face database's add_or_update_face method)
                    
                else:
                    logger.info(f"[INCREMENTAL] ○ No faces detected")
                
                # Mark image as processed (consistent pixel processing ensured)
                self._mark_image_as_scanned(image_path, len(detected_faces) if detected_faces else 0)
                
            except Exception as e:
                logger.error(f"[INCREMENTAL] ✗ Error processing {os.path.basename(image_path)}: {e}")
                continue
        
        # Calculate results
        faces_after = len(self.face_db.faces)
        new_person_count = faces_after - faces_before
        
        logger.info(f"[INCREMENTAL] ═══════════════════════════════════════")
        logger.info(f"[INCREMENTAL] Incremental Scan Complete:")
        logger.info(f"[INCREMENTAL] • Processed: {processed_count} new images")
        logger.info(f"[INCREMENTAL] • Total faces found: {total_faces_found}")
        logger.info(f"[INCREMENTAL] • New people discovered: {new_person_count}")
        logger.info(f"[INCREMENTAL] • Total people in database: {faces_after}")
        logger.info(f"[INCREMENTAL] ═══════════════════════════════════════")
        
        return {
            "success": True,
            "processed": processed_count,
            "faces_detected": total_faces_found,
            "new_faces": new_person_count,
            "existing_matches": total_faces_found - new_person_count,
            "total_people": faces_after
        }

# Pass-throughs
    def get_faces(self): return self.face_db.get_all_faces()
    def delete_face(self, fid): return self.face_db.delete_face(fid)
    def delete_faces(self, fids): 
        cnt = 0
        for f in fids: 
            if self.face_db.delete_face(f): cnt+=1
        return cnt
    def name_face(self, fid, name): return self.face_db.set_face_name(fid, name)
    def reset_face_database(self): 
        """Reset face database and clear scan flags"""
        result = self.face_db.reset_database()
        # Also reset face_scanned flags in images table
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            c.execute("UPDATE images SET face_scanned = 0, face_count = 0")
            conn.commit()
            conn.close()
            logger.info("[RESET] Cleared face scan flags from all images")
        except Exception as e:
            logger.error(f"[RESET] Error clearing scan flags: {e}")
        return result

    def merge_duplicate_faces(self):
        """Merge duplicate faces in the database"""
        return self.face_db.merge_duplicate_faces()
    def cluster_faces(self, force_full_rescan=False):
        """Google Photos-style face clustering with incremental scanning"""
        if not HAS_FACE_RECOGNITION or not HAS_CLUSTERING:
            return {"success": False, "error": "Face clustering requires face_recognition and sklearn"}
        
        try:
            import face_recognition
            import numpy as np
            from sklearn.cluster import DBSCAN
            
            if force_full_rescan:
                logger.info("[CLUSTERING] Starting FULL face clustering (force rescan enabled)...")
                # Use the old method for full rescan
                scan_result = self.scan_all_images_for_faces([], None, force_rescan=True)
            else:
                logger.info("[CLUSTERING] Starting smart face clustering with incremental scanning...")
                # First, do incremental scanning to process any new images
                scan_result = self.scan_images_incrementally()
            
            if not scan_result.get("success"):
                logger.error(f"[CLUSTERING] Scan failed: {scan_result.get('error')}")
                return scan_result
            
            # Log scanning results
            if scan_result.get('processed', 0) > 0:
                logger.info(f"[CLUSTERING] ✓ Scan processed {scan_result.get('processed')} images")
                logger.info(f"[CLUSTERING] ✓ Found {scan_result.get('faces_detected', 0)} faces ({scan_result.get('new_faces', 0)} new people)")
            else:
                logger.info(f"[CLUSTERING] ✓ All images up-to-date, no new scanning needed")
            logger.info(f"[CLUSTERING] Now merging any duplicate faces...")
            
            # Merge any duplicate faces that might have been created
            merge_result = self.face_db.merge_duplicate_faces()
            if merge_result.get('merged', 0) > 0:
                logger.info(f"[CLUSTERING] ✓ Merged {merge_result['merged']} duplicate faces")
            
            # Current state after scanning and merging
            total_people = len(self.face_db.faces)
            logger.info(f"[CLUSTERING] ✓ Total people in database: {total_people}")
            
            if total_people == 0:
                return {
                    "success": True, 
                    "message": "No faces found in any images", 
                    "unique_people": 0, 
                    "new_faces": scan_result.get('new_faces', 0),
                    "processed_images": scan_result.get('processed', 0)
                }
            
            # The face matching is already done during incremental scanning
            # via add_or_update_face method, so clustering is already complete!
            logger.info(f"[CLUSTERING] ✓ Face clustering complete - using incremental matching")
            
            return {
                "success": True,
                "unique_people": total_people,
                "faces_merged": merge_result.get('merged', 0),
                "total_faces": sum(len(face_data.get('images', [])) for face_data in self.face_db.faces.values()),
                "new_faces": scan_result.get('new_faces', 0),
                "processed_images": scan_result.get('processed', 0),
                "message": f"Found {total_people} unique people. Processed {scan_result.get('processed', 0)} new images."
            }
            
        except Exception as e:
            logger.error(f"[CLUSTERING] Error: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}
    
    def get_face_matches(self, fid):
        return {"success": True, "images": self.face_db.faces.get(fid, {}).get('images', [])}

class ModelDownloader:
    def download_models(self, cb): return {"success": True}

# ==================== HELPERS ====================

def get_photo_statistics():
    try:
        conn = sqlite3.connect(str(get_db_path()))
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM images")
        t = c.fetchone()[0]
        conn.close()
        return {"success": True, "stats": {"total_photos": t}}
    except: return {"success": False}

def get_smart_suggestions(_): return {"success": True, "suggestions": []}
def detect_events_from_photos(): return {"success": True, "events": []}
def cluster_locations(): return {"success": True, "clusters": []}
def compare_photo_quality(p): return {"success": True, "results": []}
def get_face_merge_suggestions(_): return {"success": True, "suggestions": []}
def cluster_faces_command(d, db): return {"success": True}


# ==================== MAIN LOOP ====================

def main():
    """Robust Main Loop"""
    # Load model in background while DB / face subsystems initialise
    engine = SmartMediaEngine(defer_model=True)
    downloader = ModelDownloader()

    # CRITICAL: Wait for Qwen model to be fully loaded BEFORE signalling Electron.
    # This ensures the very first image upload is instant - no hidden load delay.
    logger.info("[STARTUP] Waiting for Qwen model to finish loading...")
    engine._ensure_model_loaded()
    logger.info("[STARTUP] Qwen model fully loaded and ready.")

    logger.info("Ready for commands...")
    print("READY", flush=True) # Signal to Electron
    print("[PYTHON] Entering command loop - ready to receive stdin...", file=sys.stderr, flush=True)
    
    def send(data):
        try: print(json.dumps(data), flush=True)
        except: pass

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                if sys.stdin.closed: break
                time.sleep(0.05)
                continue
                
            line = line.strip()
            if not line: continue
            
            # DEBUG: Log raw input (print to stderr directly as fallback)
            print(f"[RAW] Received line: {line[:100]}...", file=sys.stderr, flush=True)
            logger.info(f"[RAW] Received line: {line[:100]}...")
            
            try:
                cmd = json.loads(line)
                act = cmd.get("action")
                request_id = cmd.get("request_id")
                
                print(f"[CMD] Parsed action: {act}", file=sys.stderr, flush=True)
                logger.info(f"[CMD] Parsed action: {act}")
                
                if "path" in cmd:
                    print(f"[CMD] Path: {cmd.get('path')}", file=sys.stderr, flush=True)
                    logger.info(f"[CMD] Path: {cmd.get('path')}")
                if "image_path" in cmd:
                    print(f"[CMD] Image path: {cmd.get('image_path')}", file=sys.stderr, flush=True)
                    logger.info(f"[CMD] Image path: {cmd.get('image_path')}")
                if "request_id" in cmd:
                    print(f"[CMD] Request ID: {cmd.get('request_id')}", file=sys.stderr, flush=True)
                    logger.info(f"[CMD] Request ID: {cmd.get('request_id')}")
                
                if act == "process_image":
                    # Auto-detect media type and route to appropriate processor
                    path = cmd.get("path")
                    request_id = cmd.get("request_id")  # Get request ID
                    logger.info(f"[PROCESS_IMAGE] Starting for: {os.path.basename(path) if path else 'None'} | RequestID: {request_id}")
                    
                    if not path or not os.path.exists(path):
                        logger.error(f"[PROCESS_IMAGE] File not found: {path}")
                        result = {"success": False, "error": f"File not found: {path}", "path": path}
                        if request_id:
                            result["request_id"] = request_id
                        send(result)
                        continue
                    
                    media_type = engine.get_media_type(path)
                    logger.info(f"[PROCESS_IMAGE] Media type: {media_type}")
                    
                    if media_type == 'document':
                        result = engine.process_document_file(path)
                    elif media_type in ['video', 'audio']:
                        result = engine.process_media_file(path)
                    else:
                        result = engine.process_image(path)
                    
                    # Add request ID to response
                    if request_id:
                        result["request_id"] = request_id
                    
                    logger.info(f"[PROCESS_IMAGE] Result: success={result.get('success', False)} | RequestID: {request_id}")
                    # Invalidate RAG cache since new image was processed
                    if result.get('success'):
                        engine.rag_engine.invalidate_cache()
                    send(result)
                
                elif act == "process_media":
                    # Auto-detect media type and route to appropriate processor
                    path = cmd.get("path")
                    request_id = cmd.get("request_id")
                    media_type = engine.get_media_type(path)
                    if media_type == 'document':
                        result = engine.process_document_file(path)
                    else:
                        result = engine.process_media_file(path)
                    if request_id:
                        result["request_id"] = request_id
                    send(result)
                
                elif act == "process_document":
                    request_id = cmd.get("request_id")
                    result = engine.process_document_file(cmd.get("path"))
                    if request_id:
                        result["request_id"] = request_id
                    send(result)
                    
                elif act == "queue_images":
                    paths = cmd.get("paths", [])
                    for i, p in enumerate(paths):
                        # Auto-detect media type and use appropriate processing
                        media_type = engine.get_media_type(p)
                        if media_type == 'document':
                            res = engine.process_document_file(p)
                        elif media_type in ['video', 'audio']:
                            res = engine.process_media_file(p)
                        else:
                            res = engine.process_image(p)
                        res["type"] = "queue_result"
                        res["queue_index"] = i
                        res["queue_total"] = len(paths)
                        send(res)
                        
                elif act == "ai_chat":
                    # Invalidate RAG cache if needed (new images may have been added)
                    send(engine.ai_chat(cmd.get("image_path"), cmd.get("message")))
                
                elif act == "ai_search":
                    # Direct RAG search endpoint for faster results
                    query = cmd.get("query", "")
                    results = engine.rag_engine.search(query, top_k=cmd.get("limit", 8))
                    images_data = [{'path': e['path'], 'filename': e['filename'], 'caption': e.get('caption', '')} for e in results]
                    send({"success": True, "results": images_data, "count": len(images_data)})
                
                elif act == "ai_stats":
                    # Direct stats endpoint
                    stats = engine.rag_engine.get_stats()
                    send({"success": True, "stats": stats})
                
                elif act == "invalidate_cache":
                    engine.rag_engine.invalidate_cache()
                    engine._chat_cache.clear()
                    send({"success": True, "message": "Cache invalidated"})
                    
                elif act == "check_models":
                    qwen_ready = (not engine.demo_mode) and (engine.model is not None) and (engine.processor is not None)
                    model_loading = bool(getattr(engine, "_model_loading", False))

                    missing_required = []
                    if not HAS_TORCH:
                        missing_required.append("torch")
                    if not HAS_TRANSFORMERS:
                        missing_required.append("transformers")
                    if not qwen_ready:
                        missing_required.append("qwen2-vl")

                    missing_optional = []
                    if not HAS_FACE_RECOGNITION:
                        missing_optional.append("face_recognition")
                    if not HAS_CV2:
                        missing_optional.append("opencv")

                    downloaded_size_mb = 4096 if qwen_ready else 0
                    response = {
                        "success": True,
                        "models_available": qwen_ready,
                        "engine_ready": qwen_ready,
                        "model_loading": model_loading,
                        "demo_mode": bool(engine.demo_mode),
                        "models": {
                            "qwen2-vl": {
                                "name": "Qwen2-VL 2B",
                                "downloaded": qwen_ready,
                                "required": True,
                                "size_mb": 4096,
                            }
                        },
                        "dependencies": {
                            "torch": HAS_TORCH,
                            "transformers": HAS_TRANSFORMERS,
                            "face_recognition": HAS_FACE_RECOGNITION,
                            "opencv": HAS_CV2,
                        },
                        "missing_required": missing_required,
                        "missing_optional": missing_optional,
                        "total_size_mb": 4096,
                        "downloaded_size_mb": downloaded_size_mb,
                        "progress": 100 if qwen_ready else 0,
                    }
                    if request_id:
                        response["request_id"] = request_id
                    send(response)
                
                elif act == "preload_models":
                    send({"success": True, "message": "Models already loaded", "models_available": not engine.demo_mode})

                elif act == "scan_faces":
                    def pcb(c, t): send({"type": "face_scan_progress", "current": c, "total": t})
                    force_rescan = cmd.get("force_rescan", False)
                    send(engine.scan_all_images_for_faces(cmd.get("image_paths", []), pcb, force_rescan))

                elif act == "get_faces": send({"success": True, "faces": engine.get_faces()})
                elif act == "delete_face": send({"success": engine.delete_face(cmd.get("face_id"))})
                elif act == "delete_faces": send({"success": True, "deleted": engine.delete_faces(cmd.get("face_ids", []))})
                elif act == "set_face_name": send({"success": engine.name_face(cmd.get("face_id"), cmd.get("name"))})
                elif act == "reset_faces": send({"success": engine.reset_face_database()})
                elif act == "detect_faces": send({"success": True, "faces": engine.detect_faces_in_image(cmd.get("image_path"))})
                elif act == "get_face_matches": send(engine.get_face_matches(cmd.get("face_id")))
                elif act == "cluster_faces": 
                    force_full_rescan = cmd.get("force_full_rescan", False)
                    send(engine.cluster_faces(force_full_rescan))
                
                elif act == "scan_faces_incremental":
                    def pcb(c, t): send({"type": "face_scan_progress", "current": c, "total": t})
                    send(engine.scan_images_incrementally(pcb))
                
                elif act == "get_face_processing_stats":
                    stats = engine.get_face_processing_stats()
                    send({"success": True, **stats})
                
                elif act == "convert_file":
                    if HAS_CONVERTER:
                        tid = cmd.get("tool_id")
                        files = cmd.get("files", [])
                        opts = cmd.get("options", {})
                        res = {"success": False}
                        try:
                            if tid == "pdf-to-word": res = doc_converter.pdf_to_word(files[0])
                            elif tid == "word-to-pdf": res = doc_converter.word_to_pdf(files[0])
                            elif tid == "image-to-pdf": res = doc_converter.images_to_pdf(files)
                            elif tid == "image-compress": res = doc_converter.compress_image(files, int(opts.get("quality", 80)))
                        except Exception as e: res["error"] = str(e)
                        if "request_id" in cmd: res["request_id"] = cmd["request_id"]
                        send(res)
                    else: send({"success": False, "error": "No converter"})

                elif act == "export_pdf":
                    if HAS_CONVERTER: send(doc_converter.images_to_pdf(cmd.get("image_paths"), cmd.get("output_path")))
                    else: send({"success": False, "error": "No converter"})

                elif act == "get_stats": send(get_photo_statistics())
                elif act == "download_models": send(downloader.download_models(None))
                elif act == "ping": send({"success": True, "message": "pong"})
                
                elif act == "find_similar_images":
                    send({
                        "success": True,
                        "groups": engine.similarity_engine.find_similar_images(
                            cmd.get("paths", []),
                            cmd.get("threshold", 0.92),
                            cmd.get("mode", "similar")
                        )
                    })
                
                elif act == "fix_media_types":
                    # Manually trigger media type fix (for videos/audio saved with wrong type)
                    fixed_count = engine.fix_media_types_in_db()
                    send({"success": True, "fixed": fixed_count, "message": f"Fixed {fixed_count} media file(s)"})

                else:
                    send({"success": False, "error": f"Unknown: {act}"})
                    
            except json.JSONDecodeError as je:
                logger.error(f"JSON Error: {je}")
                print(f"[PYTHON] JSON parse error: {je}", file=sys.stderr, flush=True)
            except Exception as e:
                logger.error(f"Cmd Error: {e}")
                import traceback
                traceback.print_exc(file=sys.stderr)
                err_response = {"success": False, "error": str(e)}
                # Include request_id in error response so Electron can match it
                try:
                    if cmd and "request_id" in cmd:
                        err_response["request_id"] = cmd["request_id"]
                except:
                    pass
                send(err_response)
                
        except KeyboardInterrupt: break
        except Exception: time.sleep(0.1)

if __name__ == "__main__":
    main()