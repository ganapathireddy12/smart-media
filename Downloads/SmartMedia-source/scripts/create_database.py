#!/usr/bin/env python3
"""
SmartMedia Database Migration Script
Creates SQLite database and migrates existing pickle data
"""

import sqlite3
import pickle
import json
import os
from pathlib import Path
from datetime import datetime

def get_database_path():
    """Get the correct database path based on OS"""
    if os.name == 'nt':  # Windows
        appdata = os.getenv('APPDATA')
        db_dir = Path(appdata) / 'smartmedia'
    else:  # macOS/Linux
        home = Path.home()
        if os.name == 'darwin':  # macOS
            db_dir = home / 'Library' / 'Application Support' / 'smartmedia'
        else:  # Linux
            db_dir = home / '.config' / 'smartmedia'
    
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / 'media.db'

def create_database_schema(db_path):
    """Create the SQLite database schema"""
    print(f"Creating database at: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Images table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            file_size INTEGER,
            width INTEGER,
            height INTEGER,
            format TEXT,
            created_at TEXT,
            modified_at TEXT,
            scanned_at TEXT,
            metadata TEXT,
            tags TEXT,
            is_favorite INTEGER DEFAULT 0,
            face_count INTEGER DEFAULT 0,
            emotion TEXT,
            caption TEXT,
            objects TEXT,
            scene TEXT,
            extracted_text TEXT
        )
    ''')
    
    # Faces table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS faces (
            id TEXT PRIMARY KEY,
            name TEXT,
            image_id TEXT,
            encoding BLOB,
            bbox TEXT,
            created_at TEXT,
            FOREIGN KEY (image_id) REFERENCES images(id)
        )
    ''')
    
    # Albums table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS albums (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            cover_image TEXT,
            created_at TEXT,
            description TEXT
        )
    ''')
    
    # Album images junction table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS album_images (
            album_id TEXT,
            image_id TEXT,
            added_at TEXT,
            PRIMARY KEY (album_id, image_id),
            FOREIGN KEY (album_id) REFERENCES albums(id),
            FOREIGN KEY (image_id) REFERENCES images(id)
        )
    ''')
    
    # Emotions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS emotions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_path TEXT NOT NULL,
            emotion TEXT NOT NULL,
            confidence REAL,
            detected_at TEXT,
            UNIQUE(image_path, emotion)
        )
    ''')
    
    # Create indexes for faster queries
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_images_filename ON images(filename)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_images_favorite ON images(is_favorite)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_images_scanned_at ON images(scanned_at)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_faces_name ON faces(name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_emotions_path ON emotions(image_path)')
    
    conn.commit()
    print("✅ Database schema created successfully!")
    return conn

def migrate_pickle_data(conn, project_dir):
    """Migrate existing pickle data to SQLite"""
    cursor = conn.cursor()
    
    # Paths to pickle files
    data_dir = Path(project_dir) / 'data'
    emotions_file = data_dir / 'emotions_db.pkl'
    caption_file = data_dir / 'caption_cache.pkl'
    faces_file = data_dir / 'faces_db.pkl'
    
    migrated_count = 0
    
    # Migrate emotions data
    if emotions_file.exists():
        print(f"\n📦 Migrating emotions from: {emotions_file}")
        try:
            with open(emotions_file, 'rb') as f:
                emotions_data = pickle.load(f)
            
            if isinstance(emotions_data, dict):
                for image_path, emotion_info in emotions_data.items():
                    try:
                        # Insert into emotions table
                        if isinstance(emotion_info, dict):
                            emotion = emotion_info.get('emotion', 'unknown')
                            confidence = emotion_info.get('confidence', 0.0)
                        else:
                            emotion = str(emotion_info)
                            confidence = 0.0
                        
                        cursor.execute('''
                            INSERT OR IGNORE INTO emotions (image_path, emotion, confidence, detected_at)
                            VALUES (?, ?, ?, ?)
                        ''', (image_path, emotion, confidence, datetime.now().isoformat()))
                        
                        # Update or insert image record
                        image_id = hashlib.md5(image_path.encode()).hexdigest()
                        filename = os.path.basename(image_path)
                        
                        cursor.execute('''
                            INSERT OR IGNORE INTO images 
                            (id, path, filename, emotion, scanned_at)
                            VALUES (?, ?, ?, ?, ?)
                        ''', (image_id, image_path, filename, emotion, datetime.now().isoformat()))
                        
                        cursor.execute('''
                            UPDATE images 
                            SET emotion = ?
                            WHERE path = ?
                        ''', (emotion, image_path))
                        
                        migrated_count += 1
                    except Exception as e:
                        print(f"  ⚠️ Error migrating emotion for {image_path}: {e}")
                
                print(f"  ✅ Migrated {migrated_count} emotion records")
        except Exception as e:
            print(f"  ❌ Error loading emotions file: {e}")
    
    # Migrate captions data
    if caption_file.exists():
        print(f"\n📦 Migrating captions from: {caption_file}")
        try:
            with open(caption_file, 'rb') as f:
                captions_data = pickle.load(f)
            
            caption_count = 0
            if isinstance(captions_data, dict):
                for image_path, caption in captions_data.items():
                    try:
                        image_id = hashlib.md5(image_path.encode()).hexdigest()
                        filename = os.path.basename(image_path)
                        
                        # Insert or update image with caption
                        cursor.execute('''
                            INSERT OR IGNORE INTO images 
                            (id, path, filename, caption, scanned_at)
                            VALUES (?, ?, ?, ?, ?)
                        ''', (image_id, image_path, filename, caption, datetime.now().isoformat()))
                        
                        cursor.execute('''
                            UPDATE images 
                            SET caption = ?
                            WHERE path = ?
                        ''', (caption, image_path))
                        
                        caption_count += 1
                    except Exception as e:
                        print(f"  ⚠️ Error migrating caption for {image_path}: {e}")
                
                print(f"  ✅ Migrated {caption_count} caption records")
        except Exception as e:
            print(f"  ❌ Error loading captions file: {e}")
    
    # Migrate faces data
    if faces_file.exists():
        print(f"\n📦 Migrating faces from: {faces_file}")
        try:
            with open(faces_file, 'rb') as f:
                faces_data = pickle.load(f)
            
            face_count = 0
            if isinstance(faces_data, dict):
                for face_id, face_info in faces_data.items():
                    try:
                        if isinstance(face_info, dict):
                            name = face_info.get('name', 'Unknown')
                            image_path = face_info.get('image_path', '')
                            encoding = pickle.dumps(face_info.get('encoding', []))
                            
                            image_id = hashlib.md5(image_path.encode()).hexdigest() if image_path else None
                            
                            cursor.execute('''
                                INSERT OR IGNORE INTO faces 
                                (id, name, image_id, encoding, created_at)
                                VALUES (?, ?, ?, ?, ?)
                            ''', (face_id, name, image_id, encoding, datetime.now().isoformat()))
                            
                            face_count += 1
                    except Exception as e:
                        print(f"  ⚠️ Error migrating face {face_id}: {e}")
                
                print(f"  ✅ Migrated {face_count} face records")
        except Exception as e:
            print(f"  ❌ Error loading faces file: {e}")
    
    conn.commit()
    print(f"\n✅ Migration complete! Total records migrated: {migrated_count}")

def display_database_stats(conn):
    """Display statistics about the database"""
    cursor = conn.cursor()
    
    print("\n" + "="*50)
    print("📊 DATABASE STATISTICS")
    print("="*50)
    
    # Images count
    cursor.execute('SELECT COUNT(*) FROM images')
    images_count = cursor.fetchone()[0]
    print(f"📸 Total Images: {images_count}")
    
    # Faces count
    cursor.execute('SELECT COUNT(*) FROM faces')
    faces_count = cursor.fetchone()[0]
    print(f"👤 Total Faces: {faces_count}")
    
    # Emotions count
    cursor.execute('SELECT COUNT(*) FROM emotions')
    emotions_count = cursor.fetchone()[0]
    print(f"😊 Total Emotions: {emotions_count}")
    
    # Albums count
    cursor.execute('SELECT COUNT(*) FROM albums')
    albums_count = cursor.fetchone()[0]
    print(f"📁 Total Albums: {albums_count}")
    
    # Recent images
    if images_count > 0:
        print("\n📋 Recent Images:")
        cursor.execute('SELECT filename, caption, emotion FROM images LIMIT 5')
        for row in cursor.fetchall():
            filename, caption, emotion = row
            print(f"  • {filename}")
            if caption:
                print(f"    Caption: {caption[:50]}...")
            if emotion:
                print(f"    Emotion: {emotion}")
    
    print("="*50)

def main():
    """Main migration function"""
    print("🚀 SmartMedia Database Migration Tool")
    print("="*50)
    
    # Get project directory
    project_dir = Path(__file__).parent.parent
    print(f"📂 Project Directory: {project_dir}")
    
    # Get database path
    db_path = get_database_path()
    
    # Check if database already exists
    if db_path.exists():
        response = input(f"\n⚠️ Database already exists at {db_path}\nOverwrite? (y/N): ")
        if response.lower() != 'y':
            print("❌ Migration cancelled")
            return
        os.remove(db_path)
        print("🗑️ Old database removed")
    
    # Create database and schema
    conn = create_database_schema(db_path)
    
    # Migrate pickle data
    migrate_pickle_data(conn, project_dir)
    
    # Display stats
    display_database_stats(conn)
    
    # Close connection
    conn.close()
    
    print(f"\n✅ SUCCESS! Database ready at:")
    print(f"   {db_path}")
    print(f"\n💡 You can now open this file in DB Browser for SQLite")

if __name__ == '__main__':
    main()
