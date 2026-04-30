"""
SmartMedia AI Engine - Image Processing Module
=================================================
AI-powered image analysis including EXIF extraction, caption generation,
tag extraction, emotion detection, photo type classification, and album categorization.
"""

import os
import io
import time
import json
import gc
import logging
from datetime import datetime
from typing import Dict
from collections import defaultdict

from config import (
    HAS_PIL, HAS_TORCH, HAS_EXIF, MAX_IMAGE_SIZE, MAX_OUTPUT_TOKENS,
    device
)

logger = logging.getLogger(__name__)

if HAS_PIL:
    from PIL import Image

if HAS_EXIF:
    from PIL.ExifTags import TAGS, GPSTAGS

if HAS_TORCH:
    import torch


def extract_exif_metadata(image_path: str) -> Dict:
    """Extract EXIF metadata including GPS, date, camera info."""
    metadata = {
        'date_taken': None,
        'latitude': None,
        'longitude': None,
        'camera_make': None,
        'camera_model': None,
        'orientation': None,
        'iso': None,
        'focal_length': None,
        'aperture': None,
        'shutter_speed': None,
        'width': None,
        'height': None
    }
    
    if not HAS_PIL or not HAS_EXIF:
        return metadata
    
    try:
        image = Image.open(image_path)
        exif_data = image._getexif()
        
        if not exif_data:
            return metadata
        
        # Extract basic EXIF data
        for tag_id, value in exif_data.items():
            tag = TAGS.get(tag_id, tag_id)
            
            if tag == 'DateTimeOriginal' or tag == 'DateTime':
                try:
                    # Convert EXIF date format to ISO format
                    dt = datetime.strptime(str(value), '%Y:%m:%d %H:%M:%S')
                    metadata['date_taken'] = dt.isoformat()
                except:
                    metadata['date_taken'] = str(value)
            
            elif tag == 'Make':
                metadata['camera_make'] = str(value).strip()
            
            elif tag == 'Model':
                metadata['camera_model'] = str(value).strip()
            
            elif tag == 'Orientation':
                metadata['orientation'] = int(value)
            
            elif tag == 'ISOSpeedRatings':
                metadata['iso'] = int(value)
            
            elif tag == 'FocalLength':
                if isinstance(value, tuple):
                    metadata['focal_length'] = f"{value[0]/value[1]:.1f}mm"
                else:
                    metadata['focal_length'] = f"{value}mm"
            
            elif tag == 'FNumber':
                if isinstance(value, tuple):
                    metadata['aperture'] = f"f/{value[0]/value[1]:.1f}"
                else:
                    metadata['aperture'] = f"f/{value}"
            
            elif tag == 'ExposureTime':
                if isinstance(value, tuple):
                    metadata['shutter_speed'] = f"{value[0]}/{value[1]}s"
                else:
                    metadata['shutter_speed'] = f"{value}s"
            
            elif tag == 'ExifImageWidth':
                metadata['width'] = int(value)
            
            elif tag == 'ExifImageHeight':
                metadata['height'] = int(value)
            
            elif tag == 'GPSInfo':
                # Extract GPS coordinates
                gps_data = {}
                for gps_tag_id in value:
                    gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                    gps_data[gps_tag] = value[gps_tag_id]
                
                # Convert GPS coordinates to decimal degrees
                if 'GPSLatitude' in gps_data and 'GPSLongitude' in gps_data:
                    lat = gps_data['GPSLatitude']
                    lon = gps_data['GPSLongitude']
                    lat_ref = gps_data.get('GPSLatitudeRef', 'N')
                    lon_ref = gps_data.get('GPSLongitudeRef', 'E')
                    
                    # Convert to decimal
                    def to_decimal(coord):
                        if isinstance(coord, (list, tuple)) and len(coord) >= 3:
                            degrees = float(coord[0])
                            minutes = float(coord[1])
                            seconds = float(coord[2]) if len(coord) > 2 else 0
                            return degrees + (minutes / 60.0) + (seconds / 3600.0)
                        return float(coord)
                    
                    latitude = to_decimal(lat)
                    longitude = to_decimal(lon)
                    
                    if lat_ref == 'S':
                        latitude = -latitude
                    if lon_ref == 'W':
                        longitude = -longitude
                    
                    metadata['latitude'] = latitude
                    metadata['longitude'] = longitude
        
        # If width/height not in EXIF, get from image
        if not metadata['width'] or not metadata['height']:
            metadata['width'] = image.width
            metadata['height'] = image.height
        
    except Exception as e:
        logger.warning(f"[EXIF] Error: {e}")
    
    return metadata


def get_media_type(file_path: str) -> str:
    """Detect media type based on file extension."""
    ext = os.path.splitext(file_path)[1].lower()
    
    image_exts = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.heic', '.heif'}
    video_exts = {'.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.m4v', '.3gp', '.mpeg', '.mpg'}
    audio_exts = {'.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'}
    document_exts = {'.pdf', '.doc', '.docx', '.txt', '.md', '.log', '.csv', '.rtf'}
    
    if ext in image_exts:
        return 'image'
    elif ext in video_exts:
        return 'video'
    elif ext in audio_exts:
        return 'audio'
    elif ext in document_exts:
        return 'document'
    else:
        return 'unknown'


def categorize_into_album(photo_type, caption, objects, emotion):
    """Perfect album categorization based on AI analysis - ULTRA STRICT DOCUMENT DETECTION."""
    caption_lower = caption.lower()
    objects_str = ' '.join(objects).lower()
    
    # Priority 1: Documents (ULTRA STRICT - only actual documents, not nature/landscape images)
    document_keywords_strong = [
        'screenshot', 'phone screen', 'app interface', 'ui elements', 'status bar',
        'whatsapp', 'telegram', 'chat interface', 'text message',
        'receipt', 'invoice', 'bill', 'document', 'text document',
        'form', 'certificate', 'scanned document', 'pdf',
        'spreadsheet', 'handwritten', 'document scan',
        'whiteboard', 'email interface'
    ]
    
    nature_exclusion_keywords = [
        'landscape', 'mountain', 'beach', 'ocean', 'sky', 'outdoor', 'nature', 'scenery',
        'forest', 'river', 'lake', 'park', 'garden', 'tree', 'trees', 'flower', 'flowers',
        'sunset', 'sunrise', 'cloud', 'clouds', 'field', 'grass', 'hill', 'valley',
        'waterfall', 'animal', 'bird', 'wildlife', 'sea', 'coast', 'desert', 'snow',
        'rain', 'storm', 'path', 'trail', 'rock', 'cliff', 'cave', 'meadow',
        'food', 'meal', 'dish', 'restaurant', 'cuisine',
        'car', 'vehicle', 'pet', 'dog', 'cat'
    ]
    
    has_nature = any(kw in caption_lower for kw in nature_exclusion_keywords)
    has_nature_objects = any(kw in objects_str for kw in nature_exclusion_keywords)
    is_nature_content = has_nature or has_nature_objects
    
    if photo_type in ['screenshot', 'document', 'whatsapp-chat', 'document-scan',
                      'receipt', 'form-document', 'certificate']:
        if not is_nature_content:
            return 'Documents'
    
    has_document_keywords = any(kw in caption_lower for kw in document_keywords_strong)
    if has_document_keywords and not is_nature_content:
        return 'Documents'
    
    # Priority 2: Events (multiple people, parties, celebrations)
    if photo_type in ['group-photo', 'photo-multiple-people', 'event']:
        return 'Events'
    event_keywords = ['party', 'celebration', 'wedding', 'birthday', 'gathering', 'group',
                     'crowd', 'friends', 'family photo', 'event', 'concert', 'festival',
                     'graduation', 'ceremony', 'reception']
    if any(kw in caption_lower for kw in event_keywords):
        return 'Events'
    if any(kw in objects_str for kw in ['people', 'crowd', 'group', 'friends', 'family', 'gathering']):
        if len([o for o in objects if 'person' in o.lower() or 'people' in o.lower()]) > 1:
            return 'Events'
    
    # Priority 3: Vehicles  
    if photo_type == 'vehicle':
        return 'Vehicles'
    vehicle_keywords = ['car', 'bike', 'motorcycle', 'motorbike', 'truck', 'bus', 'van',
                        'scooter', 'jeep', 'suv', 'automobile', 'vehicle', 'two-wheeler',
                        'bicycle', 'cycle', 'auto rickshaw', 'rickshaw', 'tractor', 'trailer']
    if any(kw in caption_lower for kw in vehicle_keywords):
        return 'Vehicles'
    if any(kw in objects_str for kw in vehicle_keywords):
        return 'Vehicles'
    
    # Priority 4: Animals
    if photo_type == 'animal':
        return 'Animals'
    animal_keywords = ['dog', 'cat', 'bird', 'horse', 'cow', 'elephant', 'lion', 'tiger',
                       'bear', 'monkey', 'rabbit', 'fish', 'snake', 'deer', 'fox',
                       'wolf', 'leopard', 'cheetah', 'giraffe', 'zebra', 'penguin',
                       'parrot', 'eagle', 'owl', 'duck', 'chicken', 'goat', 'sheep',
                       'pet', 'wildlife', 'animal', 'puppy', 'kitten']
    if any(kw in caption_lower for kw in animal_keywords):
        return 'Animals'
    if any(kw in objects_str for kw in animal_keywords):
        return 'Animals'
    
    # Priority 5: Architecture / Buildings
    if photo_type == 'architecture':
        return 'Architecture'
    arch_keywords = ['building', 'architecture', 'church', 'temple', 'mosque', 'monument',
                     'bridge', 'tower', 'skyscraper', 'castle', 'palace', 'fort', 'stadium',
                     'hospital', 'school', 'university', 'mall', 'airport', 'station']
    if any(kw in caption_lower for kw in arch_keywords):
        return 'Architecture'
    if any(kw in objects_str for kw in arch_keywords):
        return 'Architecture'
    
    # Priority 6: Sports & Fitness
    if photo_type == 'sports':
        return 'Sports'
    sports_keywords = ['gym', 'fitness', 'workout', 'exercise', 'cricket', 'football',
                       'basketball', 'tennis', 'swimming', 'running', 'cycling', 'yoga',
                       'boxing', 'wrestling', 'marathon', 'athlete', 'sport', 'match',
                       'stadium', 'field', 'court', 'pitch', 'training', 'race']
    if any(kw in caption_lower for kw in sports_keywords):
        return 'Sports'
    if any(kw in objects_str for kw in sports_keywords):
        return 'Sports'
    
    # Priority 7: People / Portraits
    if photo_type in ['portrait', 'selfie']:
        return 'People'
    people_keywords = ['person', 'people', 'man', 'woman', 'boy', 'girl', 'child',
                       'baby', 'guy', 'lady', 'selfie', 'portrait', 'face', 'couple', 'human']
    if any(kw in caption_lower for kw in people_keywords):
        return 'People'
    if any(kw in objects_str for kw in people_keywords):
        return 'People'
    
    # Priority 8: Locations (landscapes, travel, outdoor scenes)
    if photo_type in ['landscape', 'nature-landscape', 'outdoor-scene']:
        return 'Locations'
    location_keywords = ['landscape', 'mountain', 'beach', 'ocean', 'sky', 'outdoor', 'nature',
                         'scenery', 'travel', 'landmark', 'sunset', 'sunrise', 'view', 'vista',
                         'forest', 'river', 'lake', 'park', 'garden', 'monument', 'waterfall',
                         'valley', 'cliff', 'desert', 'snow', 'meadow', 'farm', 'rural']
    if any(kw in caption_lower for kw in location_keywords):
        return 'Locations'
    if any(kw in objects_str for kw in location_keywords):
        return 'Locations'
    
    # Default: Others (food, products, artwork, etc.)
    return 'Others'


def process_image(engine, image_path: str) -> Dict:
    """Process an image through the AI pipeline - caption, tags, emotion, album categorization.
    
    Args:
        engine: SmartMediaEngine instance (provides model, processor, device, db_path, etc.)
        image_path: Path to the image file
    
    Returns:
        Dict with processing results
    """
    from db_operations import save_to_db
    
    # Ensure model is loaded before processing
    engine._ensure_model_loaded()
    
    start_t = time.time()
    
    # Handle Unicode file paths properly
    try:
        image_path = os.path.normpath(image_path)
        if not os.path.exists(image_path):
            filename = os.path.basename(image_path)
            logger.error(f"[IMAGE] File not found: {filename}")
            return {"success": False, "error": f"File not found: {filename}"}
    except Exception as e:
        logger.error(f"[IMAGE] Path error: {e}")
        return {"success": False, "error": str(e)}
    
    try:
        # 1. FAST IMAGE LOADING
        with open(image_path, 'rb') as f:
            img_bytes = f.read()
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        
        # 2. SMART RESIZING - balanced accuracy vs speed
        w, h = image.size
        if max(w, h) > MAX_IMAGE_SIZE:
            scale = MAX_IMAGE_SIZE / max(w, h)
            new_w, new_h = int(w * scale), int(h * scale)
            # Align to 28px for Qwen2-VL
            new_w = max(28, (new_w//28)*28)
            new_h = max(28, (new_h//28)*28)
            # BILINEAR is 3-4x faster than LANCZOS and indistinguishable at 512px
            image = image.resize((new_w, new_h), Image.BILINEAR)
        
        # 3. EXTRACT EXIF METADATA (also get file size)
        exif_metadata = extract_exif_metadata(image_path)
        # Always include file size in metadata
        try:
            exif_metadata['file_size'] = os.path.getsize(image_path)
        except Exception:
            pass
        
        if engine.demo_mode:
            return {"success": True, "caption": "Demo Mode", "objects": [], "emotion": "neutral", "metadata": exif_metadata}

        # ================================================================
        # 4. PASS 1 — ULTRA-FAST TYPE DETECTION (≤40 tokens)
        # Determines what kind of image this is so we can send the best
        # expert prompt in Pass 2.
        # ================================================================
        type_detect_msgs = [{
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": (
                    "What is the main subject of this image? Reply with 1-2 keywords from this list ONLY: "
                    "document, text-page, person, animal, vehicle, "
                    "food, nature, architecture, artwork, other"
                )}
            ]
        }]
        type_text = engine.processor.apply_chat_template(type_detect_msgs, tokenize=False, add_generation_prompt=True)
        type_inputs = engine.processor(text=[type_text], images=[image], padding=True, return_tensors="pt").to(engine.model.device)
        with torch.inference_mode():
            type_ids = engine.model.generate(
                **type_inputs,
                max_new_tokens=40,
                do_sample=False,
                num_beams=1,
                use_cache=True,
                early_stopping=True,
                pad_token_id=engine.processor.tokenizer.pad_token_id,
                eos_token_id=engine.processor.tokenizer.eos_token_id,
            )
        detected_type_raw = engine.processor.batch_decode(
            type_ids[:, type_inputs.input_ids.shape[1]:], skip_special_tokens=True
        )[0].strip().lower().replace(',', ' ').replace('.', ' ')
        del type_inputs, type_ids
        if engine.device == "cuda":
            torch.cuda.empty_cache()
        logger.info(f"[TYPE-DETECT] Raw type: '{detected_type_raw}'")

        # Map detected type to a category bucket
        _TEXT_TYPES    = {'document', 'text-page', 'doc', 'receipt', 'invoice',
                          'form', 'certificate', 'whiteboard', 'pdf', 'scan', 'note', 'letter', 'page', 'text', 'screenshot'}
        _PERSON_TYPES  = {'person', 'people', 'man', 'woman', 'boy', 'girl', 'child',
                          'baby', 'selfie', 'portrait', 'group', 'crowd', 'human', 'face'}
        
        _words = detected_type_raw.split()
        _is_text = any(w in _TEXT_TYPES for w in _words)
        _is_person = any(w in _PERSON_TYPES for w in _words)
        
        # Priority resolution
        _img_bucket = 'other'
        if _is_person:
            _img_bucket = 'person'
        elif _is_text:
            _img_bucket = 'text'

        # ================================================================
        # 5. PASS 2 — EXPERT PROMPT based on detected image type
        # ================================================================
        if _img_bucket == 'text':
            # --- TEXT / DOCUMENT image: extract every visible word ---
            expert_prompt = (
                "This image contains text. Extract and transcribe ALL visible text exactly as it appears.\n"
                "Then list the main visual elements.\n"
                "Respond EXACTLY in this format:\n\n"
                "CAPTION: [Write what this document/page is about in 1-2 sentences.]\n"
                "TEXT: [Transcribe every word, number, symbol, heading, label, and sentence visible in the image. Preserve line breaks where possible.]\n"
                "TAGS: tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8"
            )
        elif _img_bucket == 'person':
            # --- PERSON image: clothing, accessories, colors, body details ---
            expert_prompt = (
                "Describe the person(s) in this image in detail using simple everyday English.\n"
                "Respond EXACTLY in this format:\n\n"
                "CAPTION: [1-2 sentences: who is in the picture, what they are doing, and where they are.]\n"
                "CLOTHING: [List every clothing item with its color, e.g. red t-shirt, blue jeans, white sneakers, black jacket, brown belt.]\n"
                "ACCESSORIES: [List all accessories: glasses, watch, bag, hat, jewelry, phone, etc. Include colors.]\n"
                "COLORS: [List all dominant colors present in the entire image, e.g. blue, white, green, beige.]\n"
                "TAGS: tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8, tag9, tag10"
            )
        else:
            # --- GENERAL image: all objects, colors, scene details ---
            expert_prompt = (
                "Describe everything visible in this image using simple everyday English.\n"
                "Respond EXACTLY in this format:\n\n"
                "CAPTION: [1-2 sentences describing the main subject, setting, and action.]\n"
                "OBJECTS: [List every object, item, and element visible in the image with its color or description.]\n"
                "COLORS: [List all dominant colors present in the image, e.g. blue sky, green grass, red car.]\n"
                "TAGS: tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8, tag9, tag10"
            )

        messages = [{
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": expert_prompt}
            ]
        }]

        # ================================================================
        # 6. PASS 2 INFERENCE — richer output (more tokens than pass 1)
        # ================================================================
        _pass2_tokens = 400 if _img_bucket == 'text' else 300   # text needs more room for OCR
        text = engine.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = engine.processor(text=[text], images=[image], padding=True, return_tensors="pt").to(engine.model.device)
        
        with torch.inference_mode():
            output_ids = engine.model.generate(
                **inputs,
                max_new_tokens=_pass2_tokens,
                do_sample=False,
                num_beams=1,
                use_cache=True,
                length_penalty=0.8,
                no_repeat_ngram_size=0,
                repetition_penalty=1.05,
                early_stopping=True,
                pad_token_id=engine.processor.tokenizer.pad_token_id,
                eos_token_id=engine.processor.tokenizer.eos_token_id,
            )
        
        response = engine.processor.batch_decode(output_ids[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0]
        
        # 7. STRUCTURED PARSING - Extract all lines with rich tag + text generation
        photo_type = "other"
        emotion = "neutral"
        caption = ""
        objects = []
        clothing_details = []
        colors_detected = []
        extracted_text = ""     # NEW: for text/document images
        accessories_list = []   # NEW: for person images
        
        try:
            # HARD TRUNCATE: safety net — never process more than 1200 chars
            raw_text = response.strip()[:1200]
            logger.info(f"[AI RAW] bucket='{_img_bucket}' | {len(response)} chars → {len(raw_text)} chars | Preview: {raw_text[:150]}")

            # --- Deduplicator: collapses "neutral, neutral..." / "Batman, Batman..." loops ---
            def _dedup_tokens(text):
                parts = [p.strip() for p in text.replace('\n', ',').split(',') if p.strip()]
                seen = set()
                result = []
                for p in parts:
                    pl = p.lower().strip('.,!?;:()"\'`')
                    if pl and pl not in seen:
                        seen.add(pl)
                        result.append(p)
                return result

            # --- Step 1: Try structured multi-key format ---
            parsed_data = {
                'caption': '',
                'tags': '',
                'objects': '',
                'colors': '',
                'clothing': '',
                'accessories': '',
                'text': ''
            }
            
            current_key = None
            for line in raw_text.split('\n'):
                line_stripped = line.strip()
                if not line_stripped:
                    continue
                
                ll = line_stripped.lower()
                colon_idx = line_stripped.find(':')
                
                # Check if this line is a new key
                is_new_key = False
                if colon_idx != -1:
                    potential_key = ll[:colon_idx].strip()
                    if potential_key in ('caption', 'sentence', 'description'):
                        current_key = 'caption'
                        is_new_key = True
                    elif potential_key in ('tags', 'keywords', 'tag'):
                        current_key = 'tags'
                        is_new_key = True
                    elif potential_key in ('objects', 'object', 'items', 'elements'):
                        current_key = 'objects'
                        is_new_key = True
                    elif potential_key in ('colors', 'colour', 'colors present', 'dominant colors'):
                        current_key = 'colors'
                        is_new_key = True
                    elif potential_key in ('clothing', 'clothes', 'outfit', 'dress', 'apparel'):
                        current_key = 'clothing'
                        is_new_key = True
                    elif potential_key in ('accessories', 'accessory', 'accessories list'):
                        current_key = 'accessories'
                        is_new_key = True
                    elif potential_key in ('text', 'extracted text', 'transcription', 'content'):
                        current_key = 'text'
                        is_new_key = True
                
                if is_new_key:
                    value = line_stripped[colon_idx + 1:].strip()
                    if value:
                        parsed_data[current_key] = value
                elif current_key:
                    # Append to current key if it's a multiline value
                    if parsed_data[current_key]:
                        parsed_data[current_key] += '\n' + line_stripped
                    else:
                        parsed_data[current_key] = line_stripped

            sentence_text = parsed_data['caption']
            tags_text = parsed_data['tags'].replace('\n', ', ')
            objects_text = parsed_data['objects'].replace('\n', ', ')
            colors_text = parsed_data['colors'].replace('\n', ', ')
            clothing_text = parsed_data['clothing'].replace('\n', ', ')
            accessories_text = parsed_data['accessories'].replace('\n', ', ')
            text_content = parsed_data['text']

            # Merge parsed sections into useful fields
            # Extracted text (for document/text images)
            if text_content:
                extracted_text = text_content

            # Colors from dedicated COLOR key
            if colors_text:
                for ct in colors_text.replace(';', ',').split(','):
                    ct = ct.strip().lower().lstrip('*•- ')
                    if ct and len(ct) > 1 and ct not in colors_detected:
                        colors_detected.append(ct)

            # Clothing from dedicated CLOTHING key
            if clothing_text:
                for cl in clothing_text.replace(';', ',').split(','):
                    cl = cl.strip().lower().lstrip('*•- ')
                    if cl and len(cl) > 1 and cl not in clothing_details:
                        clothing_details.append(cl)

            # Accessories
            if accessories_text:
                for ac in accessories_text.replace(';', ',').split(','):
                    ac = ac.strip().lower().lstrip('*•- ')
                    if ac and len(ac) > 1 and ac not in accessories_list:
                        accessories_list.append(ac)

            # Objects/items (for general images)
            ai_extra_objects = []
            if objects_text:
                for ob in objects_text.replace(';', ',').split(','):
                    ob = ob.strip().lower().lstrip('*•- ')
                    if ob and len(ob) > 1:
                        ai_extra_objects.append(ob)

            # --- Step 2: Fallback — take longest prose line (skip tag blobs) ---
            if not sentence_text:
                lines_clean = [l.strip() for l in raw_text.split('\n') if l.strip()]
                for line in sorted(lines_clean, key=lambda x: len(x), reverse=True):
                    words = line.split()
                    comma_count = line.count(',')
                    # Skip tag blobs: >3 commas = likely a tag list, not a sentence
                    if len(words) >= 6 and comma_count <= 3:
                        # Also skip lines that start with known tag-dump prefixes
                        ll2 = line.lower()
                        if not any(ll2.startswith(p) for p in ('tags:', 'tag(s):', 'keywords:')):
                            sentence_text = line
                            break

            # --- Step 3: Last resort - sentence will be synthesized after type/emotion parse ---
            _needs_synthesis = not sentence_text or len(sentence_text.split()) < 4
            if _needs_synthesis:
                sentence_text = ""  # synthesize later once we know photo_type and emotion

            # --- Build caption: strip prefix leakage, capitalise ---
            for pfx in ['caption:', 'caption :', 'sentence:', 'sentence :', 'desc:', 'description:']:
                if sentence_text.lower().startswith(pfx):
                    sentence_text = sentence_text[len(pfx):].strip()
                    break
            caption = sentence_text.strip()
            if caption and caption[0].islower():
                caption = caption[0].upper() + caption[1:]

            # --- Tags: parse TAGS line; fallback extracts short tokens only ---
            def _is_valid_tag(t):
                t = t.strip().lstrip('*•-– ')
                # Reject: empty, single char, starts with known prose prefixes, or is a long sentence
                if not t or len(t) < 2:
                    return False
                tl = t.lower()
                bad_prefixes = ('sentence', 'tags', 'tag(s)', 'description', 'caption', 'note', 'in this', 'the image')
                if any(tl.startswith(p) for p in bad_prefixes):
                    return False
                # Reject long prose (>5 words = sentence fragment, not a tag)
                if len(t.split()) > 5:
                    return False
                return True

            def _dedup_root_tags(tag_list):
                """Remove root-word spam: keep only 2 tags per dominant first word.
                e.g. 'indoor setting','indoor scene','indoor space','indoor workspace'
                collapses to the 2 shortest/most-specific ones."""
                root_groups = defaultdict(list)
                for t in tag_list:
                    first_word = t.split()[0] if t.split() else t
                    root_groups[first_word].append(t)
                result = []
                for root, group in root_groups.items():
                    # Sort by length (shortest = most specific, e.g. 'indoor' before 'indoor workspace')
                    group_sorted = sorted(group, key=len)
                    # Keep at most 2 variants per root word
                    result.extend(group_sorted[:2])
                # Restore original order
                order = {t: i for i, t in enumerate(tag_list)}
                return sorted(result, key=lambda t: order.get(t, 999))

            if tags_text:
                seen_t = set()
                ai_tags = []
                for raw_t in tags_text.split(','):
                    t = raw_t.strip().lstrip('*•-– ').lower()
                    if _is_valid_tag(t) and t not in seen_t:
                        seen_t.add(t)
                        ai_tags.append(t)
                ai_tags = _dedup_root_tags(ai_tags)
            else:
                # Fallback: extract short tokens from the whole response
                seen_t = set()
                ai_tags = []
                for raw_t in raw_text.replace('\n', ',').split(','):
                    t = raw_t.strip().lstrip('*•-– ').lower()
                    if _is_valid_tag(t) and t not in seen_t:
                        seen_t.add(t)
                        ai_tags.append(t)
                ai_tags = _dedup_root_tags(ai_tags)

            ai_objects = list(ai_tags)  # same pool; downstream clothing/color scan uses this

            # --- Scan FULL response for TYPE and MOOD regardless of format ---
            full_context = (raw_text + ' ' + caption + ' ' + ' '.join(ai_tags)).lower()
            type_line_lower = full_context
            mood_line_lower = full_context

            # --- Parse TYPE ---
            type_word_map = [
                (['landscape', 'nature', 'outdoor', 'scenery', 'mountain', 'beach', 'forest',
                  'river', 'lake', 'sunset', 'sunrise', 'sky', 'field', 'park', 'garden'], 'landscape'),
                (['vehicle', 'car', 'bike', 'motorcycle', 'truck', 'bus', 'automobile',
                  'scooter', 'van', 'jeep', 'suv', 'sedan'], 'vehicle'),
                (['animal', 'dog', 'cat', 'bird', 'pet', 'wildlife', 'lion', 'tiger',
                  'elephant', 'horse', 'cow', 'fish', 'rabbit'], 'animal'),
                (['architecture', 'building', 'church', 'temple', 'mosque', 'tower',
                  'monument', 'bridge', 'house', 'skyscraper'], 'architecture'),
                (['sports', 'gym', 'fitness', 'workout', 'exercise', 'cricket', 'football',
                  'basketball', 'tennis', 'swimming', 'running', 'cycling'], 'sports'),
                (['event', 'concert', 'festival', 'ceremony', 'wedding', 'birthday',
                  'graduation', 'celebration', 'party'], 'event'),
                (['group', 'crowd', 'multiple people', 'several people', 'gathering', 'family'], 'group-photo'),
                (['food', 'meal', 'dish', 'cuisine', 'restaurant', 'eating', 'drink',
                  'snack', 'dessert', 'coffee', 'tea', 'cake', 'pizza', 'burger'], 'food'),
                (['screenshot', 'screen', 'app', 'interface', 'whatsapp', 'chat', 'ui'], 'screenshot'),
                (['document', 'receipt', 'invoice', 'pdf', 'form', 'certificate'], 'document'),
                (['product', 'object on white', 'commercial item'], 'product'),
                (['artwork', 'poster', 'illustration', 'painting', 'art', 'digital art',
                  'graphic', 'render', 'wallpaper', 'drawing', 'sketch'], 'artwork'),
                (['portrait', 'person', 'individual', 'solo', 'woman', 'man', 'child',
                  'baby', 'character', 'selfie', 'figure'], 'portrait'),
            ]
            
            # --- Parse TYPE --- (seed from pass-1 bucket, then refine with keyword scan) ---
            _bucket_to_type = {
                'text': 'document',
                'person': 'portrait',
            }
            photo_type = _bucket_to_type.get(_img_bucket, 'other')
            for keywords, ptype in type_word_map:
                if any(kw in type_line_lower for kw in keywords):
                    # Don't overwrite a strong bucket classification with a weak generic match
                    if _img_bucket == 'text' and ptype not in ('screenshot', 'document'):
                        continue
                    photo_type = ptype
                    break
            
            logger.info(f"[PARSE] caption='{caption[:80]}' | photo_type='{photo_type}' | bucket='{_img_bucket}'")
            
            # --- Parse EMOTION ---
            emotion_map = [
                (['happy', 'joyful', 'cheerful', 'smiling', 'joy', 'enthusiastic', 'bright'], 'happy'),
                (['sad', 'melancholy', 'gloomy', 'somber', 'unhappy', 'crying', 'grief'], 'sad'),
                (['excited', 'energetic', 'vibrant', 'dynamic', 'lively', 'thrilling'], 'excited'),
                (['peaceful', 'calm', 'serene', 'tranquil', 'relaxed', 'quiet', 'gentle'], 'peaceful'),
                (['romantic', 'intimate', 'tender', 'love', 'affectionate', 'warm'], 'romantic'),
                (['dramatic', 'intense', 'powerful', 'epic', 'dark', 'cinematic', 'bold'], 'dramatic'),
                (['mysterious', 'suspenseful', 'eerie', 'moody', 'atmospheric', 'haunting'], 'mysterious'),
                (['neutral', 'ordinary', 'normal', 'casual', 'everyday'], 'neutral'),
            ]
            emotion = 'neutral'
            for keywords, emo in emotion_map:
                if any(kw in mood_line_lower for kw in keywords):
                    emotion = emo
                    break
            
            # --- Extract clothing and colors from caption + objects ---
            clothing_keywords = [
                'shirt', 'dress', 'jacket', 'pants', 'jeans', 'sweater', 'hoodie',
                'skirt', 'shoes', 'hat', 'glasses', 'spectacles', 'sunglasses', 'goggles',
                'watch', 'tie', 'suit', 'coat', 't-shirt', 'blouse', 'shorts',
                'sandals', 'boots', 'sneakers', 'polo', 'vest', 'scarf', 'gloves',
                'socks', 'belt', 'cap', 'helmet', 'bag', 'backpack', 'handbag',
                'kurta', 'saree', 'sari', 'lehenga', 'dupatta', 'turban', 'uniform',
                'blazer', 'cardigan', 'tuxedo', 'gown', 'tracksuit', 'sweatshirt'
            ]
            color_keywords = [
                'red', 'blue', 'green', 'yellow', 'black', 'white', 'gray', 'grey',
                'brown', 'pink', 'purple', 'orange', 'navy', 'beige', 'tan',
                'maroon', 'turquoise', 'gold', 'silver', 'cream', 'dark', 'light',
                'golden', 'crimson', 'cyan', 'magenta', 'violet', 'indigo', 'coral',
                'teal', 'olive', 'lime', 'rose', 'peach', 'lavender', 'bronze'
            ]
            
            all_text = (caption + ' ' + ' '.join(ai_objects) + ' ' + ' '.join(ai_tags)).lower()
            all_words = [w.strip('.,!?;:()"\\"') for w in all_text.split()]
            
            for word in all_words:
                if word in clothing_keywords and word not in clothing_details:
                    clothing_details.append(word)
                if word in color_keywords and word not in colors_detected:
                    colors_detected.append(word)
            
            # --- Build final rich objects/tags list with SYNONYM EXPANSION ---
            # Merge AI objects + AI tags + extra detected objects + accessories + clothing + colors
            combined = list(dict.fromkeys(
                ai_objects + ai_extra_objects + accessories_list +
                ai_tags + clothing_details + colors_detected
            ))
            
            # Synonym expansion: add canonical synonyms so ANY related word finds this image
            synonym_map = {
                # Eyewear
                'glasses': ['spectacles', 'eyewear', 'eyeglasses'],
                'sunglasses': ['shades', 'spectacles', 'eyewear', 'goggles'],
                'spectacles': ['glasses', 'eyeglasses', 'eyewear'],
                # Vehicles
                'car': ['vehicle', 'automobile', 'sedan', 'auto'],
                'motorcycle': ['bike', 'motorbike', 'vehicle', 'two-wheeler'],
                'bike': ['bicycle', 'cycle', 'two-wheeler'],
                'bicycle': ['bike', 'cycle', 'two-wheeler'],
                'scooter': ['bike', 'vehicle', 'two-wheeler', 'motorbike'],
                'truck': ['vehicle', 'lorry', 'automobile'],
                'bus': ['vehicle', 'transport', 'automobile'],
                'van': ['vehicle', 'automobile'],
                'jeep': ['suv', 'vehicle', 'car', 'automobile'],
                'suv': ['jeep', 'vehicle', 'car', 'automobile'],
                # Clothing synonyms
                'pants': ['trousers', 'bottoms'],
                'trousers': ['pants', 'bottoms'],
                'jacket': ['coat', 'outerwear', 'blazer'],
                't-shirt': ['tee', 'shirt', 'top'],
                'dress': ['gown', 'outfit', 'frock'],
                'saree': ['sari', 'traditional', 'indian wear'],
                'kurta': ['kurti', 'traditional', 'indian wear'],
                # People
                'woman': ['female', 'lady', 'girl', 'person'],
                'man': ['male', 'guy', 'boy', 'person'],
                'child': ['kid', 'boy', 'girl', 'young', 'baby'],
                'baby': ['infant', 'toddler', 'child'],
                # Animals
                'dog': ['puppy', 'pet', 'canine', 'animal'],
                'cat': ['kitten', 'pet', 'feline', 'animal'],
                # Nature
                'mountain': ['hill', 'peak', 'summit', 'highland', 'nature'],
                'beach': ['sea', 'ocean', 'coast', 'shore', 'seaside'],
                'sunset': ['dusk', 'golden hour', 'twilight', 'evening'],
                'sunrise': ['dawn', 'morning', 'golden hour'],
                'forest': ['woods', 'jungle', 'trees', 'nature'],
                'river': ['stream', 'creek', 'water', 'nature'],
                'flower': ['bloom', 'blossom', 'floral', 'plant'],
                # Food
                'pizza': ['food', 'meal', 'italian', 'dish'],
                'burger': ['food', 'meal', 'fast food', 'sandwich'],
                'cake': ['dessert', 'sweet', 'food', 'pastry'],
                'coffee': ['drink', 'beverage', 'cafe', 'latte'],
                # Places
                'temple': ['religious', 'architecture', 'place of worship', 'shrine'],
                'church': ['religious', 'architecture', 'place of worship', 'chapel'],
                'mosque': ['religious', 'architecture', 'place of worship', 'masjid'],
                # Activities
                'selfie': ['portrait', 'self-portrait', 'solo'],
                'wedding': ['marriage', 'ceremony', 'celebration', 'event'],
                'birthday': ['celebration', 'party', 'event', 'anniversary'],
                'graduation': ['ceremony', 'event', 'celebration', 'academic'],
            }
            
            expanded_tags = list(combined)  # start with what we have
            for tag in combined:
                tag_clean = tag.strip().lower()
                if tag_clean in synonym_map:
                    for syn in synonym_map[tag_clean]:
                        if syn not in expanded_tags:
                            expanded_tags.append(syn)
            
            # Also add photo type and emotion as implicit tags
            for implicit in [photo_type.replace('-', ' '), emotion]:
                if implicit and implicit not in expanded_tags:
                    expanded_tags.append(implicit)
            
            objects = [t for t in expanded_tags if len(t) > 1][:40]  # up to 40 rich tags

            # --- Synthesize caption when model skipped SENTENCE ---
            if not caption or _needs_synthesis:
                # Build a natural sentence from what we know
                subject_words = [t for t in ai_tags if t in (
                    'man', 'woman', 'person', 'boy', 'girl', 'child', 'baby',
                    'people', 'group', 'crowd', 'dog', 'cat', 'bird', 'animal'
                )]
                subject = subject_words[0] if subject_words else ('person' if photo_type == 'portrait' else photo_type.replace('-', ' '))
                article = 'An' if subject[0].lower() in 'aeiou' else 'A'
                # Pick up to 2 clothing/color descriptors
                descriptors = (colors_detected[:1] + clothing_details[:1])
                desc_str = (' in a ' + ' '.join(descriptors)) if descriptors else ''
                # Scene info from tags
                scene_words = [t for t in ai_tags if any(s in t for s in ('indoor', 'outdoor', 'room', 'street', 'park', 'office', 'home', 'kitchen', 'garden', 'beach', 'forest'))]
                scene_str = (', ' + scene_words[0]) if scene_words else ''
                mood_str = (', ' + emotion + ' mood') if emotion and emotion != 'neutral' else ''
                caption = f"{article} {subject}{desc_str}{scene_str}{mood_str}.".capitalize()
                if caption == "A .":
                    caption = "Image analyzed."

        except Exception as e:
            logger.warning(f"[PARSING] Error parsing AI response: {e}")
            caption = response.strip() if response else "Image processed"
        
        # 7. ALBUM CATEGORIZATION - Perfect segmentation
        album_category = categorize_into_album(photo_type, caption, objects, emotion)
        
        # Save to database with EXIF metadata and album category (explicitly set media_type='image')
        save_to_db(engine.db_path, image_path, caption, objects, emotion, exif_metadata, album_category, media_type='image', extracted_text=extracted_text)
        
        proc_time = time.time() - start_t
        engine._last_inference_time = proc_time
        logger.info(f"[⚡ DETAILED] {os.path.basename(image_path)} | {proc_time:.2f}s | bucket='{_img_bucket}' | {emotion} | Album: {album_category} | {len(objects)} details | Clothing: {len(clothing_details)} | Colors: {len(colors_detected)} | ExtractedText: {len(extracted_text)} chars")
        
        # Memory cleanup for faster sequential processing
        try:
            del image, inputs, output_ids
        except Exception:
            pass
        if engine.device == "cuda":
            torch.cuda.empty_cache()
        
        return {
            "success": True,
            "path": image_path,
            "caption": caption,
            "emotion": emotion,
            "objects": objects,
            "tags": objects,
            "clothing": clothing_details,
            "accessories": accessories_list,
            "colors": colors_detected,
            "extracted_text": extracted_text,   # full OCR-style text for document/text images
            "image_bucket": _img_bucket,        # 'text' | 'person' | 'other'
            "face_count": 0,
            "photo_type": photo_type,
            "album_category": album_category,
            "processing_time": round(proc_time, 2),
            "metadata": exif_metadata,
            "date_taken": exif_metadata.get('date_taken'),
            "location": {
                "latitude": exif_metadata.get('latitude'),
                "longitude": exif_metadata.get('longitude')
            } if exif_metadata.get('latitude') and exif_metadata.get('longitude') else None
        }
    except Exception as e:
        logger.error(f"Process error: {e}")
        return {"success": False, "error": str(e)}
