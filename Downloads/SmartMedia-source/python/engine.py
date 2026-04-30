"""
SmartMedia AI Engine - Engine Orchestrator
=============================================
SmartMediaEngine class: the central orchestrator that initializes all sub-modules
and delegates to the appropriate feature module for processing.
"""

import os
import sys
import time
import hashlib
import threading
import logging
from pathlib import Path

from config import (
    HAS_PIL, HAS_TORCH, HAS_TRANSFORMERS, HAS_FACE_RECOGNITION, HAS_IMAGEHASH,
    device, MAX_IMAGE_SIZE, MAX_OUTPUT_TOKENS, USE_QUANTIZATION
)
from database import get_db_path
from face_database import FaceDatabase
from rag_engine import RAGEngine
from similarity_engine import SimilarityEngine

logger = logging.getLogger(__name__)

if HAS_TORCH:
    import torch

if HAS_TRANSFORMERS:
    from transformers import Qwen2VLForConditionalGeneration, AutoProcessor


class SmartMediaEngine:
    """Central orchestrator for the SmartMedia AI Engine.
    
    Delegates to feature modules:
    - image_processing: AI image analysis, EXIF, album categorization
    - media_processing: video/audio/document processing
    - ai_chat: AI chat with RAG, caching, routing
    - face_detection: face detection, scanning, clustering
    - db_operations: database save/update operations
    """
    
    def __init__(self, model_path=None):
        # Model & processor
        self.model = None
        self.processor = None
        self.device = device
        self.model_path = model_path or "Qwen/Qwen2-VL-2B-Instruct"
        self._model_loaded = False
        self._model_loading = False
        self.demo_mode = False
        self._last_inference_time = 0
        
        # Paths
        self.db_path = get_db_path()
        self.data_dir = Path(__file__).parent.parent / "data"
        self.data_dir.mkdir(exist_ok=True)
        
        # Face database
        face_db_path = os.path.join(str(self.data_dir), "faces_db.pkl")
        self.face_db = FaceDatabase(face_db_path)
        
        # RAG engine
        self.rag_engine = RAGEngine(self.db_path)
        
        # Similarity engine
        self.similarity_engine = SimilarityEngine()
        
        # Chat cache
        self._chat_cache = {}
        self._chat_cache_max = 100
        
        # Start loading model in background
        self._load_model_background()
        
        logger.info(f"[ENGINE] SmartMediaEngine initialized (device={self.device})")
    
    def _load_model_background(self):
        """Load AI model in background thread for faster startup."""
        def _load():
            self._load_model()
        
        thread = threading.Thread(target=_load, daemon=True)
        thread.start()
    
    def _load_model(self):
        """Load Qwen2-VL model and processor."""
        if self._model_loaded or self._model_loading:
            return
        
        self._model_loading = True
        
        try:
            if not HAS_TRANSFORMERS:
                logger.warning("[MODEL] Transformers not available - running in demo mode")
                self.demo_mode = True
                return
            
            logger.info(f"[MODEL] Loading {self.model_path}...")
            start = time.time()
            
            # Load processor
            self.processor = AutoProcessor.from_pretrained(self.model_path)
            
            # Determine optimal SDPA attention (PyTorch 2.0+ free 20-30% speedup)
            attn_impl = "sdpa" if hasattr(torch.nn.functional, 'scaled_dot_product_attention') else "eager"
            
            # Load model with optimizations
            model_kwargs = {
                "device_map": "auto" if self.device == "cuda" else None,
                "low_cpu_mem_usage": True,
                "attn_implementation": attn_impl,
            }
            
            # Optimal dtype selection
            if self.device == "cuda":
                model_kwargs["torch_dtype"] = torch.float16
            else:
                # Try bfloat16 for Intel CPUs (faster than float32)
                try:
                    _ = torch.tensor([1.0], dtype=torch.bfloat16)
                    model_kwargs["torch_dtype"] = torch.bfloat16
                    logger.info("[MODEL] Using bfloat16 for CPU (faster)")
                except Exception:
                    model_kwargs["torch_dtype"] = torch.float32
            
            # Try quantization if available and enabled
            if USE_QUANTIZATION and self.device == "cuda":
                try:
                    from transformers import BitsAndBytesConfig
                    model_kwargs["quantization_config"] = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_compute_dtype=torch.float16,
                        bnb_4bit_use_double_quant=True,
                        bnb_4bit_quant_type="nf4"
                    )
                    logger.info("[MODEL] Using 4-bit quantization")
                except ImportError:
                    logger.warning("[MODEL] bitsandbytes not available, using full precision")
            
            self.model = Qwen2VLForConditionalGeneration.from_pretrained(
                self.model_path, **model_kwargs
            )
            
            if self.device == "cpu" or model_kwargs.get("device_map") is None:
                self.model = self.model.to(self.device)
            
            self.model.eval()
            
            # Try to use torch.compile for faster inference
            try:
                if hasattr(torch, 'compile') and self.device == "cuda":
                    self.model = torch.compile(self.model, mode="reduce-overhead")
                    logger.info("[MODEL] Using torch.compile for faster inference")
            except Exception:
                pass
            
            elapsed = time.time() - start
            logger.info(f"[MODEL] ✓ Model loaded in {elapsed:.1f}s ({self.device.upper()}, attn={attn_impl})")
            self._model_loaded = True
            
            # === WARMUP INFERENCE (Ollama/LM Studio technique) ===
            # Pre-fills KV cache, JIT-compiles kernels → first real image is 2-3x faster
            try:
                import gc
                from PIL import Image as PILImage
                logger.info("[WARMUP] Running warmup inference...")
                warmup_start = time.time()
                dummy_img = PILImage.new('RGB', (56, 56), (128, 128, 128))
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
            logger.error(f"[MODEL] Failed to load model: {e}")
            self.demo_mode = True
        finally:
            self._model_loading = False
    
    def _ensure_model_loaded(self):
        """Ensure model is loaded before processing."""
        if not self._model_loaded and not self.demo_mode:
            self._load_model()
    
    # ==================== DELEGATION METHODS ====================
    # These methods delegate to the appropriate feature module.
    
    def process_image(self, image_path):
        """Process an image through the AI pipeline."""
        from image_processing import process_image
        return process_image(self, image_path)
    
    def process_media_file(self, file_path):
        """Process video or audio file."""
        from media_processing import process_media_file
        return process_media_file(self, file_path)
    
    def process_document_file(self, file_path):
        """Process document file."""
        from media_processing import process_document_file
        return process_document_file(self, file_path)
    
    def ai_chat(self, path, msg):
        """AI chat with RAG, caching, and smart routing."""
        from ai_chat import ai_chat
        return ai_chat(self, path, msg)
    
    def detect_faces_in_image(self, path):
        """Detect faces in an image."""
        from face_detection import detect_faces_in_image
        return detect_faces_in_image(self, path)
    
    def scan_all_images_for_faces(self, paths, cb, force_rescan=False):
        """Scan images for faces."""
        from face_detection import scan_all_images_for_faces
        return scan_all_images_for_faces(self, paths, cb, force_rescan)
    
    def scan_images_incrementally(self, callback=None):
        """Incremental face scanning."""
        from face_detection import scan_images_incrementally
        return scan_images_incrementally(self, callback)
    
    def cluster_faces(self, force_full_rescan=False):
        """Face clustering."""
        from face_detection import cluster_faces
        return cluster_faces(self, force_full_rescan)
    
    def get_face_processing_stats(self):
        """Get face processing statistics."""
        from face_detection import get_face_processing_stats
        return get_face_processing_stats(self)
    
    def get_media_type(self, file_path):
        """Detect media type from file extension."""
        from image_processing import get_media_type
        return get_media_type(file_path)
    
    def fix_media_types_in_db(self):
        """Fix incorrect media types in database."""
        from db_operations import fix_media_types_in_db
        return fix_media_types_in_db(self.db_path)
    
    # ==================== FACE DATABASE PASS-THROUGH ====================
    
    def get_faces(self):
        return self.face_db.get_all_faces()
    
    def delete_face(self, fid):
        return self.face_db.delete_face(fid)
    
    def delete_faces(self, fids):
        results = []
        for fid in fids:
            results.append(self.face_db.delete_face(fid))
        return all(results)
    
    def name_face(self, fid, name):
        return self.face_db.set_face_name(fid, name)
    
    def reset_face_database(self):
        return self.face_db.reset_database()
    
    def merge_duplicate_faces(self):
        return self.face_db.merge_duplicate_faces()
    
    def get_face_matches(self, fid):
        """Get all images matching a face ID."""
        face_data = self.face_db.faces.get(fid)
        if face_data:
            return {
                "success": True,
                "face_id": fid,
                "name": face_data.get("name"),
                "images": face_data.get("images", []),
                "thumbnail": face_data.get("thumbnail")
            }
        return {"success": False, "error": "Face not found"}
    
    # ==================== SIMILARITY ====================
    
    def find_similar_images(self, paths, threshold=0.92, mode='similar'):
        return self.similarity_engine.find_similar_images(paths, threshold, mode)
