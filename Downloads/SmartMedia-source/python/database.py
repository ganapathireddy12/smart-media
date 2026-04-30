"""
SmartMedia AI Engine - Database Module
=======================================
Database initialization, path management, and schema migrations.
"""

import os
import sys
import sqlite3
from pathlib import Path


def get_db_path():
    """Get the path to the SQLite database file."""
    if os.name == 'nt':
        appdata = os.getenv('APPDATA')
        db_dir = Path(appdata) / 'smartmedia'
    else:
        home = Path.home()
        db_dir = home / 'Library' / 'Application Support' / 'smartmedia' if sys.platform == 'darwin' else home / '.config' / 'smartmedia'
    
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / 'media.db'


def init_database():
    """Initialize the database schema and run migrations."""
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


# Initialize database on module import
init_database()
