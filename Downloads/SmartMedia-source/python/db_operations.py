"""
SmartMedia AI Engine - Database Operations Module
====================================================
Save/update operations for images, media files, and documents in SQLite.
"""

import os
import json
import hashlib
import sqlite3
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def save_to_db(db_path, path, caption, objects, emotion="neutral", exif_metadata=None, album_category="Others", media_type="image", extracted_text=None):
    """Save or update image metadata in the database."""
    try:
        conn = sqlite3.connect(str(db_path))
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
                SET caption = ?, emotion = ?, objects = ?, scanned_at = ?, 
                    exif_data = ?, date_taken = ?, 
                    latitude = ?, longitude = ?, 
                    gps_latitude = ?, gps_longitude = ?,
                    camera_make = ?, camera_model = ?, media_type = ?,
                    file_size = ?, extracted_text = ?
                WHERE id = ?
            """, (
                caption, emotion, json.dumps(objects), datetime.now().isoformat(),
                exif_json, date_taken,
                latitude, longitude,
                latitude, longitude,
                camera_make, camera_model, media_type,
                file_size, extracted_text,
                existing_id
            ))
        else:
            # Insert new image
            image_id = hashlib.md5(path.encode()).hexdigest()
            c.execute("""
                INSERT INTO images 
                (id, path, filename, caption, emotion, objects, scanned_at, exif_data, date_taken, 
                 latitude, longitude, gps_latitude, gps_longitude, camera_make, camera_model, media_type,
                 file_size, extracted_text) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                image_id, path, os.path.basename(path), caption, emotion, json.dumps(objects), 
                datetime.now().isoformat(), exif_json, date_taken,
                latitude, longitude, latitude, longitude,
                camera_make, camera_model, media_type,
                file_size, extracted_text
            ))
        
        conn.commit()
        conn.close()
        
    except Exception as e:
        logger.error(f"[DB] Error saving to database: {e}")
        import traceback
        traceback.print_exc()


def save_media_to_db(db_path, path, media_type, duration, file_size, modified_time, thumbnail_path=None, caption=None):
    """Save media file metadata to database."""
    try:
        conn = sqlite3.connect(str(db_path))
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


def save_document_to_db(db_path, path, media_type, file_size, modified_time, thumbnail_path, extracted_text, caption, page_count=None):
    """Save document to database with extracted text."""
    try:
        logger.info(f"[DB] Saving document with page_count: {page_count} (type: {type(page_count)})")
        conn = sqlite3.connect(str(db_path))
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


def fix_media_types_in_db(db_path):
    """Fix any videos/audio that were saved with wrong media_type (auto-correction)."""
    try:
        conn = sqlite3.connect(str(db_path))
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
