"""
SmartMedia AI Engine - Face Detection Module
===============================================
Face detection, scanning, incremental processing, clustering, and database management.
"""

import os
import io
import time
import hashlib
import sqlite3
import logging
import base64

from config import (
    HAS_FACE_RECOGNITION, HAS_CLUSTERING, HAS_CV2,
    FACE_SCAN_SIZE, FACE_DETECTION_MODEL, FACE_UPSAMPLE
)

logger = logging.getLogger(__name__)


def detect_faces_in_image(engine, path):
    """Detect faces in an image and save to face database with thumbnails.
    
    Args:
        engine: SmartMediaEngine instance (provides face_db, etc.)
        path: Path to the image file
    """
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
            fid = engine.face_db.add_or_update_face(enc, path, loc, thumbnail)
            faces.append({"face_id": fid, "location": loc})
            logger.info(f"[FACE DETECTION] Added/Updated face {fid}")
        
        # Save face database
        engine.face_db._save()
        
        return faces
        
    except Exception as e:
        logger.error(f"[FACE DETECTION] Error processing {os.path.basename(path)}: {e}")
        import traceback
        traceback.print_exc()
        return []


def scan_all_images_for_faces(engine, paths, cb, force_rescan=False):
    """Scan images for faces with proper progress tracking (smart scanning)."""
    # If no paths provided, fetch all images from database
    if not paths or len(paths) == 0:
        logger.info("[FACE SCAN] No paths provided, fetching from database...")
        paths = _get_all_image_paths_from_db(engine, force_rescan)
        logger.info(f"[FACE SCAN] Found {len(paths)} images to scan")
    
    if len(paths) == 0:
        logger.info("[FACE SCAN] No new images to scan (all already processed)")
        return {
            "success": True,
            "message": "All images already scanned",
            "processed": 0,
            "faces_detected": 0,
            "new_faces": 0,
            "total_people": len(engine.face_db.faces)
        }
    
    faces_found = 0
    new_faces = 0
    skipped = 0
    processed = 0
    
    # Track faces before scanning
    faces_before = len(engine.face_db.faces)
    
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
            
            detected = detect_faces_in_image(engine, path)
            processed += 1
            
            if detected:
                faces_found += len(detected)
                logger.info(f"[FACE SCAN] ✓ Found {len(detected)} face(s) | Total faces so far: {faces_found}")
                # Update database to mark as scanned
                _mark_image_as_scanned(engine, path, len(detected))
            else:
                logger.info(f"[FACE SCAN] ○ No faces detected")
                # Mark as scanned even if no faces found
                _mark_image_as_scanned(engine, path, 0)
            
        except Exception as e:
            logger.error(f"[FACE SCAN] ✗ Error processing {os.path.basename(path)}: {e}")
            skipped += 1
            continue
    
    # Calculate new faces
    faces_after = len(engine.face_db.faces)
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


def scan_images_incrementally(engine, callback=None):
    """Incremental face scanning - only process new/unscanned images."""
    logger.info("[INCREMENTAL] Starting incremental face scanning...")
    
    # Get only unprocessed images
    unprocessed_paths = _get_unprocessed_images_only(engine)
    
    if not unprocessed_paths:
        logger.info("[INCREMENTAL] ✓ No new images to process - all up to date!")
        return {
            "success": True,
            "message": "No new images to scan",
            "processed": 0,
            "faces_detected": 0,
            "new_faces": 0,
            "existing_matches": 0,
            "total_people": len(engine.face_db.faces)
        }
    
    logger.info(f"[INCREMENTAL] Processing {len(unprocessed_paths)} new images...")
    
    # Track statistics
    faces_before = len(engine.face_db.faces)
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
            detected_faces = detect_faces_in_image(engine, image_path)
            processed_count += 1
            
            if detected_faces:
                total_faces_found += len(detected_faces)
                logger.info(f"[INCREMENTAL] ✓ Found {len(detected_faces)} face(s)")
            else:
                logger.info(f"[INCREMENTAL] ○ No faces detected")
            
            # Mark image as processed
            _mark_image_as_scanned(engine, image_path, len(detected_faces) if detected_faces else 0)
            
        except Exception as e:
            logger.error(f"[INCREMENTAL] ✗ Error processing {os.path.basename(image_path)}: {e}")
            continue
    
    # Calculate results
    faces_after = len(engine.face_db.faces)
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


def cluster_faces(engine, force_full_rescan=False):
    """Google Photos-style face clustering with incremental scanning."""
    if not HAS_FACE_RECOGNITION or not HAS_CLUSTERING:
        return {"success": False, "error": "Face clustering requires face_recognition and sklearn"}
    
    try:
        import face_recognition
        import numpy as np
        from sklearn.cluster import DBSCAN
        
        if force_full_rescan:
            logger.info("[CLUSTERING] Starting FULL face clustering (force rescan enabled)...")
            scan_result = scan_all_images_for_faces(engine, [], None, force_rescan=True)
        else:
            logger.info("[CLUSTERING] Starting smart face clustering with incremental scanning...")
            scan_result = scan_images_incrementally(engine)
        
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
        merge_result = engine.face_db.merge_duplicate_faces()
        if merge_result.get('merged', 0) > 0:
            logger.info(f"[CLUSTERING] ✓ Merged {merge_result['merged']} duplicate faces")
        
        # Current state after scanning and merging
        total_people = len(engine.face_db.faces)
        logger.info(f"[CLUSTERING] ✓ Total people in database: {total_people}")
        
        if total_people == 0:
            return {
                "success": True, 
                "message": "No faces found in any images", 
                "unique_people": 0, 
                "new_faces": scan_result.get('new_faces', 0),
                "processed_images": scan_result.get('processed', 0)
            }
        
        logger.info(f"[CLUSTERING] ✓ Face clustering complete - using incremental matching")
        
        return {
            "success": True,
            "unique_people": total_people,
            "faces_merged": merge_result.get('merged', 0),
            "total_faces": sum(len(face_data.get('images', [])) for face_data in engine.face_db.faces.values()),
            "new_faces": scan_result.get('new_faces', 0),
            "processed_images": scan_result.get('processed', 0),
            "message": f"Found {total_people} unique people. Processed {scan_result.get('processed', 0)} new images."
        }
        
    except Exception as e:
        logger.error(f"[CLUSTERING] Error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


def get_face_processing_stats(engine):
    """Get statistics about face processing status."""
    try:
        conn = sqlite3.connect(str(engine.db_path))
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
        total_people = len(engine.face_db.faces)
        
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


# ==================== DB Helper Functions ====================

def _get_all_image_paths_from_db(engine, force_rescan=False):
    """Fetch image paths from database (only unscanned images by default)."""
    try:
        conn = sqlite3.connect(str(engine.db_path))
        c = conn.cursor()
        
        if force_rescan:
            c.execute("SELECT path FROM images ORDER BY scanned_at DESC")
            logger.info("[DB] Force rescan enabled - fetching all images")
        else:
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


def _mark_image_as_scanned(engine, path, face_count):
    """Mark image as scanned for faces in the database."""
    try:
        conn = sqlite3.connect(str(engine.db_path))
        c = conn.cursor()
        c.execute("UPDATE images SET face_scanned = 1, face_count = ? WHERE path = ?", (face_count, path))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"[DB] Error marking image as scanned: {e}")


def _get_unprocessed_images_only(engine):
    """Get only images that haven't been processed for face detection yet."""
    try:
        conn = sqlite3.connect(str(engine.db_path))
        c = conn.cursor()
        
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
