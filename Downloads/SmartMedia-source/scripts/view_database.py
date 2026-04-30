#!/usr/bin/env python3
"""
SmartMedia Database Viewer
View your stored data in a readable format
"""

import sqlite3
import json
import os
from pathlib import Path

def get_db_path():
    """Get the SQLite database path based on OS"""
    if os.name == 'nt':  # Windows
        appdata = os.getenv('APPDATA')
        db_dir = Path(appdata) / 'smartmedia'
    else:  # macOS/Linux
        home = Path.home()
        if os.name == 'darwin':  # macOS
            db_dir = home / 'Library' / 'Application Support' / 'smartmedia'
        else:  # Linux
            db_dir = home / '.config' / 'smartmedia'
    
    return db_dir / 'media.db'

def view_database():
    """View database contents"""
    db_path = get_db_path()
    
    if not db_path.exists():
        print(f"❌ Database not found at: {db_path}")
        print("\n💡 Tip: Scan some images in SmartMedia to create the database")
        return
    
    print(f"📍 Database Location: {db_path}")
    print("="*70)
    
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    # Get image count
    cursor.execute("SELECT COUNT(*) FROM images")
    total_images = cursor.fetchone()[0]
    print(f"\n📸 Total Images: {total_images}")
    
    if total_images == 0:
        print("\n⚠️ No images found in database")
        conn.close()
        return
    
    # Get emotions breakdown
    cursor.execute("SELECT emotion, COUNT(*) FROM images WHERE emotion IS NOT NULL GROUP BY emotion")
    emotions = cursor.fetchall()
    if emotions:
        print("\n😊 Emotions:")
        for emotion, count in emotions:
            print(f"  • {emotion}: {count}")
    
    # Get file types
    cursor.execute("SELECT metadata FROM images WHERE metadata IS NOT NULL")
    file_types = {}
    for row in cursor.fetchall():
        try:
            metadata = json.loads(row[0])
            file_type = metadata.get('file_type', 'unknown')
            file_types[file_type] = file_types.get(file_type, 0) + 1
        except:
            pass
    
    if file_types:
        print("\n📁 File Types:")
        for ftype, count in sorted(file_types.items(), key=lambda x: x[1], reverse=True):
            print(f"  • {ftype}: {count}")
    
    # Show sample images
    print(f"\n📋 Recent Images (showing 10):")
    print("-" * 70)
    cursor.execute("""
        SELECT filename, caption, emotion, objects, scanned_at 
        FROM images 
        ORDER BY scanned_at DESC 
        LIMIT 10
    """)
    
    for idx, (filename, caption, emotion, objects_json, scanned_at) in enumerate(cursor.fetchall(), 1):
        print(f"\n{idx}. {filename}")
        if emotion:
            print(f"   Emotion: {emotion}")
        if caption:
            caption_preview = caption[:70] + "..." if len(caption) > 70 else caption
            print(f"   Caption: {caption_preview}")
        if objects_json:
            try:
                objects = json.loads(objects_json)
                print(f"   Objects: {', '.join(objects[:5])}")
            except:
                pass
        print(f"   Scanned: {scanned_at}")
    
    conn.close()
    
    print("\n" + "="*70)
    print(f"💡 Open this database in DB Browser for SQLite:")
    print(f"   {db_path}")
    print("="*70)

if __name__ == '__main__':
    view_database()
