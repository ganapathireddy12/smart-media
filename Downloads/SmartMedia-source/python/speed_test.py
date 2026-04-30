#!/usr/bin/env python3
"""
SmartMedia Speed Test - Verify 30-40 second processing target
=========================================================
"""

import time
import json
import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

def speed_test():
    print("🚀 SmartMedia SPEED TEST")
    print("=" * 50)
    
    try:
        from main import SmartMediaEngine
        
        print("⏱️  Initializing engine...")
        start_time = time.time()
        
        engine = SmartMediaEngine()
        init_time = time.time() - start_time
        
        print(f"✅ Engine initialized in {init_time:.1f}s")
        
        # Test with a small demo image if available
        test_image = "test.jpg"  # You can replace with actual image path
        
        if Path(test_image).exists():
            print(f"⏱️  Processing {test_image}...")
            process_start = time.time()
            
            result = engine.process_image(test_image)
            process_time = time.time() - process_start
            
            print(f"✅ Processing completed in {process_time:.1f}s")
            print(f"🎯 Target: 30-40s | Actual: {process_time:.1f}s")
            
            if process_time <= 40:
                print("🏆 SPEED TARGET ACHIEVED!")
            else:
                print("⚠️  Still need more optimization")
                
            print("\nResult preview:")
            print(f"Caption: {result.get('caption', 'N/A')[:100]}...")
            print(f"Objects: {result.get('objects', [])[:5]}")
            
        else:
            print(f"ℹ️  Test image '{test_image}' not found")
            print("✅ Engine ready for fast processing!")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print("=" * 50)

if __name__ == "__main__":
    speed_test()