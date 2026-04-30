#!/usr/bin/env python3
"""
SmartMedia Model Downloader v5.0 - Qwen2-VL Edition
Downloads the Qwen2-VL 2B model for all AI tasks

Single Model Architecture:
- Qwen2-VL 2B with INT4 quantization (~4GB download, ~1.5GB after quantization)
- Replaces: YOLO + BLIP + CLIP
- Features: Captions, Objects, Scenes, Faces all in one model
"""

import os
import sys
import time
import logging
from pathlib import Path
from typing import Callable, Optional

# Setup logging
logger = logging.getLogger('SmartMedia.Downloader')

# Model directory
MODELS_DIR = Path(__file__).parent.parent / 'models'
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Qwen2-VL model name
QWEN_MODEL_NAME = "Qwen/Qwen2-VL-2B-Instruct"


class ModelDownloader:
    """
    Class interface for downloading Qwen2-VL model.
    Used by main.py for integration with Electron frontend.
    """
    
    def __init__(self):
        self.models_dir = MODELS_DIR
        self.qwen_model_path = self.models_dir / 'qwen2-vl'
        
    def download_qwen2vl(self, progress_callback: Optional[Callable] = None) -> bool:
        """Download Qwen2-VL 2B model with progress callback"""
        
        # Check if already downloaded
        if self.qwen_model_path.exists() and any(self.qwen_model_path.iterdir()):
            logger.info("Qwen2-VL already downloaded")
            if progress_callback:
                progress_callback('Qwen2-VL', 100, 0, 4096, 4096)
            return True
        
        try:
            if progress_callback:
                progress_callback('Qwen2-VL', 5, 10.0, 200, 4096)
            
            logger.info("Downloading Qwen2-VL 2B from Hugging Face...")
            
            # Import transformers
            from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
            
            if progress_callback:
                progress_callback('Qwen2-VL', 15, 15.0, 600, 4096)
            
            # Download processor first (smaller)
            logger.info("Downloading processor...")
            processor = AutoProcessor.from_pretrained(
                QWEN_MODEL_NAME,
                trust_remote_code=True
            )
            
            if progress_callback:
                progress_callback('Qwen2-VL', 25, 20.0, 1024, 4096)
            
            # Save processor
            processor.save_pretrained(str(self.qwen_model_path))
            
            if progress_callback:
                progress_callback('Qwen2-VL', 30, 25.0, 1200, 4096)
            
            # Download model
            logger.info("Downloading model (this may take a while)...")
            
            # Try to download with INT4 quantization if bitsandbytes available
            try:
                from transformers import BitsAndBytesConfig
                import torch
                
                # INT4 quantization config
                bnb_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_use_double_quant=True,
                    bnb_4bit_compute_dtype=torch.float16
                )
                
                model = Qwen2VLForConditionalGeneration.from_pretrained(
                    QWEN_MODEL_NAME,
                    quantization_config=bnb_config,
                    device_map="auto",
                    trust_remote_code=True
                )
                logger.info("Downloaded with INT4 quantization")
                
            except ImportError:
                logger.warning("bitsandbytes not available, downloading full model")
                model = Qwen2VLForConditionalGeneration.from_pretrained(
                    QWEN_MODEL_NAME,
                    torch_dtype="auto",
                    device_map="auto",
                    trust_remote_code=True
                )
            
            if progress_callback:
                progress_callback('Qwen2-VL', 90, 30.0, 3700, 4096)
            
            # Save model
            model.save_pretrained(str(self.qwen_model_path))
            
            if progress_callback:
                progress_callback('Qwen2-VL', 100, 0, 4096, 4096)
            
            logger.info(f"Qwen2-VL saved to {self.qwen_model_path}")
            return True
            
        except ImportError as e:
            logger.error(f"Required packages not installed: {e}")
            return False
        except Exception as e:
            logger.error(f"Error downloading Qwen2-VL: {e}")
            return False
    
    def download_all_models(self, progress_callback: Optional[Callable] = None) -> bool:
        """Download all required models (just Qwen2-VL now)"""
        
        def wrapped_callback(model, progress, speed, downloaded, total):
            if progress_callback:
                # Convert to overall progress format
                progress_callback({
                    'type': 'download_progress',
                    'model': model,
                    'progress': progress,
                    'speed_mbps': speed,
                    'downloaded_mb': downloaded,
                    'total_mb': total
                })
        
        # Download Qwen2-VL
        success = self.download_qwen2vl(wrapped_callback)
        
        if success and progress_callback:
            progress_callback({
                'type': 'overall_progress',
                'progress': 100,
                'current_model': 'complete'
            })
        
        return success
    
    def check_models(self) -> dict:
        """Check which models are downloaded"""
        return {
            'qwen2-vl': self.qwen_model_path.exists() and any(self.qwen_model_path.iterdir()) if self.qwen_model_path.exists() else False
        }


def download_with_progress():
    """Download models with console progress output"""
    downloader = ModelDownloader()
    
    def progress_callback(data):
        if isinstance(data, dict):
            if data.get('type') == 'download_progress':
                model = data.get('model', 'Unknown')
                progress = data.get('progress', 0)
                speed = data.get('speed_mbps', 0)
                print(f"\r[{model}] {progress:.1f}% @ {speed:.1f} MB/s", end='', flush=True)
            elif data.get('type') == 'overall_progress':
                if data.get('current_model') == 'complete':
                    print("\n✓ All models downloaded!")
    
    print("="*50)
    print("SmartMedia AI Model Downloader v5.0")
    print("Downloading: Qwen2-VL 2B (~4 GB)")
    print("="*50)
    print()
    
    success = downloader.download_all_models(progress_callback)
    
    if success:
        print("\n✓ Download complete!")
        print(f"  Models saved to: {MODELS_DIR}")
    else:
        print("\n✗ Download failed!")
        print("  Please check your internet connection and try again.")
        return 1
    
    return 0


def main():
    """Main entry point for CLI usage"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Download SmartMedia AI models')
    parser.add_argument('--check', action='store_true', help='Check which models are downloaded')
    args = parser.parse_args()
    
    if args.check:
        downloader = ModelDownloader()
        status = downloader.check_models()
        print("Model Status:")
        for model, downloaded in status.items():
            status_icon = "✓" if downloaded else "✗"
            print(f"  {status_icon} {model}")
        return 0
    
    return download_with_progress()


if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    sys.exit(main())
