#!/usr/bin/env python3
"""
SmartMedia AI Engine - Configuration & Dependencies
====================================================
Environment setup, constants, logging configuration, and dependency checks.
All other modules import from this module to access shared configuration.
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
    doc_converter = None

HAS_PIL = False
HAS_TORCH = False
HAS_TRANSFORMERS = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    logger.warning("[WARN] Pillow not available")

# PyTorch setup
device = "cpu"
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
