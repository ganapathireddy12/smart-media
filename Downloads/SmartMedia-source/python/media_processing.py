"""
SmartMedia AI Engine - Media Processing Module
=================================================
Video, audio, and document file processing including thumbnail generation.
"""

import os
import io
import time
import json
import hashlib
import logging
from datetime import datetime
from typing import Dict, Optional

from config import HAS_PIL, HAS_CV2, HAS_CONVERTER, doc_converter

logger = logging.getLogger(__name__)

if HAS_PIL:
    from PIL import Image


def generate_video_thumbnail(video_path: str, data_dir) -> Optional[str]:
    """Generate thumbnail for video file using OpenCV with improved error handling."""
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
        thumbnails_dir = data_dir / 'thumbnails'
        thumbnails_dir.mkdir(exist_ok=True)
        
        video_hash = hashlib.md5(video_path.encode()).hexdigest()
        thumb_path = thumbnails_dir / f"{video_hash}_thumb.jpg"
        thumb_img.save(str(thumb_path), 'JPEG', quality=85)
        
        logger.info(f"[THUMBNAIL] ✓ Video thumbnail saved: {thumb_path.name}")
        return str(thumb_path)
        
    except Exception as e:
        logger.error(f"[THUMBNAIL] ✗ Failed to generate video thumbnail: {e}", exc_info=True)
    
    return None


def generate_audio_thumbnail(audio_path: str, data_dir) -> Optional[str]:
    """Generate thumbnail for audio file (colored gradient image)."""
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
        thumbnails_dir = data_dir / 'thumbnails'
        thumbnails_dir.mkdir(exist_ok=True)
        
        audio_hash = hashlib.md5(audio_path.encode()).hexdigest()
        thumb_path = thumbnails_dir / f"{audio_hash}_thumb.jpg"
        img.save(str(thumb_path), 'JPEG', quality=85)
        
        logger.info(f"[THUMBNAIL] Generated audio thumbnail: {thumb_path.name}")
        return str(thumb_path)
    except Exception as e:
        logger.warning(f"[THUMBNAIL] Failed to generate audio thumbnail: {e}")
    
    return None


def generate_document_thumbnail(doc_path: str, data_dir) -> Optional[str]:
    """Generate thumbnail for document file (icon-based for now)."""
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
        thumbnails_dir = data_dir / 'thumbnails'
        thumbnails_dir.mkdir(exist_ok=True)
        
        doc_hash = hashlib.md5(doc_path.encode()).hexdigest()
        thumb_path = thumbnails_dir / f"{doc_hash}_thumb.jpg"
        img.save(str(thumb_path), 'JPEG', quality=85)
        
        logger.info(f"[THUMBNAIL] Generated document thumbnail: {thumb_path.name}")
        return str(thumb_path)
    except Exception as e:
        logger.warning(f"[THUMBNAIL] Failed to generate document thumbnail: {e}")
    
    return None


def process_document_file(engine, file_path: str) -> Dict:
    """Process document file - extract text for searching.
    
    Args:
        engine: SmartMediaEngine instance
        file_path: Path to the document file
    """
    from db_operations import save_document_to_db
    
    engine._ensure_model_loaded()
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
        thumbnail_path = generate_document_thumbnail(file_path, engine.data_dir)
        
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
        save_document_to_db(
            engine.db_path, file_path, media_type, file_size, modified_time,
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


def process_media_file(engine, file_path: str) -> Dict:
    """Process video or audio file - extract basic metadata without AI processing.
    
    Args:
        engine: SmartMediaEngine instance
        file_path: Path to the media file
    """
    from db_operations import save_media_to_db
    from image_processing import get_media_type, process_image
    
    engine._ensure_model_loaded()
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
        media_type = get_media_type(file_path)
        
        if media_type == 'image':
            # For images, use regular processing
            return process_image(engine, file_path)
        
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
            thumbnail_path = generate_video_thumbnail(file_path, engine.data_dir)
        
        elif media_type == 'audio':
            # Generate audio thumbnail (gradient)
            thumbnail_path = generate_audio_thumbnail(file_path, engine.data_dir)
        
        # Extract basic metadata
        filename = os.path.basename(file_path)
        
        # Save to database with thumbnail path and caption
        save_media_to_db(engine.db_path, file_path, media_type, duration, file_size, modified_time, thumbnail_path, caption=filename)
        
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
            "caption": filename,  # Use actual filename instead of generic "Audio file"
            "objects": [],
            "tags": [media_type],
            "emotion": "neutral",
            "processing_time": round(proc_time, 2),
            "date_modified": modified_time
        }
    except Exception as e:
        logger.error(f"Media process error: {e}")
        return {"success": False, "error": str(e)}
