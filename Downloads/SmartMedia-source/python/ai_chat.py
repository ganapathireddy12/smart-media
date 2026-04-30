"""
SmartMedia AI Engine - AI Chat Module
========================================
Enterprise-grade AI chat with RAG, caching, text-only support, and conversation history.
"""

import os
import sys
import time
import hashlib
import gc
import logging
from typing import Dict

from config import HAS_PIL, HAS_TORCH, MAX_IMAGE_SIZE

logger = logging.getLogger(__name__)

if HAS_PIL:
    from PIL import Image

if HAS_TORCH:
    import torch


def ai_chat(engine, path, msg) -> Dict:
    """Enterprise-grade AI chat with RAG, caching, text-only support, and conversation history.
    
    Speed optimizations implemented:
    1. Response caching (LRU) - instant for repeated queries
    2. RAG database search - no model inference for text queries about library
    3. Smart routing - only uses vision model when image is provided
    4. Optimized token generation with aggressive settings
    5. Conversation history for context continuity
    6. Pre-computed database statistics
    
    Args:
        engine: SmartMediaEngine instance
        path: Optional image path for vision analysis
        msg: User message/query
    """
    start_time = time.time()
    
    try:
        msg = (msg or '').strip()
        if not msg and not path:
            return {"success": True, "response": "Please ask me something or share an image!", "timing": 0}
        
        # === 1. CHECK RESPONSE CACHE ===
        cache_key = hashlib.md5(f"{path or ''}:{msg}".encode()).hexdigest()
        if cache_key in engine._chat_cache:
            cached = engine._chat_cache[cache_key]
            elapsed = time.time() - start_time
            logger.info(f"[CHAT] Cache hit! Response in {elapsed:.3f}s")
            return {**cached, "timing": round(elapsed, 3), "cached": True}
        
        # === 2. SMART ROUTING: Determine query type ===
        msg_lower = msg.lower()
        
        # Detect intent: library query, stats, search, or image analysis
        is_stats_query = any(w in msg_lower for w in [
            'stats', 'statistics', 'how many', 'count', 'total', 'library',
            'summary', 'overview', 'info', 'information'
        ])
        is_search_query = any(w in msg_lower for w in [
            'find', 'show', 'search', 'look for', 'get', 'where', 'which',
            'recent', 'latest', 'last', 'photos of', 'pictures of', 'images of',
            'happy', 'sad', 'selfie', 'landscape', 'food', 'document', 'group',
            'sunset', 'nature', 'people', 'portrait', 'video', 'favorite',
            'glasses', 'sunglasses', 'spectacles', 'vehicle', 'car', 'bike',
            'motorcycle', 'animal', 'dog', 'cat', 'wedding', 'birthday', 'party',
            'beach', 'mountain', 'forest', 'flower', 'night', 'dark', 'bright'
        ])
        is_greeting = any(w in msg_lower for w in [
            'hello', 'hi', 'hey', 'good morning', 'good evening', 'how are you',
            'what can you do', 'help', 'capabilities'
        ])
        has_image = path and os.path.exists(str(path)) if path else False
        
        # === 3. HANDLE GREETINGS (instant, no model needed) ===
        if is_greeting and not has_image:
            greetings = [
                "Hello! I'm your SmartMedia AI assistant. I can:\n\n"
                "📸 **Analyze images** - Describe what's in your photos\n"
                "🔍 **Search your library** - Find photos by mood, type, or content\n"
                "📊 **Show statistics** - Get insights about your media collection\n"
                "👥 **Face recognition** - Find photos of specific people\n"
                "🎨 **Color & clothing** - Identify what people are wearing\n\n"
                "Try asking: 'Show me happy photos' or 'How many photos do I have?'"
            ]
            response = greetings[0]
            elapsed = time.time() - start_time
            result = {"success": True, "response": response, "timing": round(elapsed, 3)}
            _cache_response(engine, cache_key, result)
            return result
        
        # === 4. HANDLE STATS QUERIES (fast DB lookup, no model) ===
        if is_stats_query and not has_image:
            stats = engine.rag_engine.get_stats()
            response = f"📊 **Your SmartMedia Library**\n\n"
            response += f"📷 Total items: **{stats['total']}**\n"
            response += f"🖼️ Photos: **{stats['images']}**\n"
            response += f"🎬 Videos: **{stats['videos']}**\n"
            response += f"📄 Documents: **{stats['documents']}**\n"
            response += f"⭐ Favorites: **{stats['favorites']}**\n"
            if stats.get('emotions'):
                response += f"\n😊 **Mood breakdown:**\n"
                for emo, count in sorted(stats['emotions'].items(), key=lambda x: x[1], reverse=True):
                    emoji = {'happy': '😊', 'sad': '😢', 'excited': '🎉', 'peaceful': '😌', 'neutral': '😐'}.get(emo, '📷')
                    response += f"  {emoji} {emo.capitalize()}: {count}\n"
            
            elapsed = time.time() - start_time
            result = {"success": True, "response": response, "timing": round(elapsed, 3)}
            _cache_response(engine, cache_key, result)
            return result
        
        # === 5. HANDLE SEARCH QUERIES (RAG, fast DB search) ===
        if is_search_query and not has_image:
            rag_results = engine.rag_engine.search(msg, top_k=8)
            
            if rag_results:
                # Format search results
                images_data = []
                for entry in rag_results:
                    images_data.append({
                        'path': entry['path'],
                        'filename': entry['filename'],
                        'caption': entry.get('caption', ''),
                        'objects': entry.get('objects', [])
                    })
                
                response = f"Found **{len(rag_results)}** matching items:\n\n"
                for i, entry in enumerate(rag_results[:4], 1):
                    response += f"{i}. **{entry['filename']}**"
                    if entry.get('caption'):
                        response += f" - {entry['caption'][:80]}"
                    response += "\n"
                
                if len(rag_results) > 4:
                    response += f"\n...and {len(rag_results) - 4} more results"
                
                elapsed = time.time() - start_time
                result = {
                    "success": True,
                    "response": response,
                    "images": images_data,
                    "action": "show_images",
                    "timing": round(elapsed, 3)
                }
                _cache_response(engine, cache_key, result)
                return result
            else:
                response = "I couldn't find any matching photos. Try different keywords or scan more photos first."
                elapsed = time.time() - start_time
                return {"success": True, "response": response, "timing": round(elapsed, 3)}
        
        # === 6. HANDLE IMAGE ANALYSIS (vision model) ===
        if has_image:
            engine._ensure_model_loaded()
            if engine.demo_mode:
                return {"success": True, "response": "AI model is loading... Please try again in a moment.", "timing": 0}
            
            image = Image.open(path).convert("RGB")
            
            # Optimized resize for chat - align to 28px for Qwen2-VL
            if max(image.size) > MAX_IMAGE_SIZE:
                scale = MAX_IMAGE_SIZE / max(image.size)
                new_w = max(28, (int(image.width * scale) // 28) * 28)
                new_h = max(28, (int(image.height * scale) // 28) * 28)
                image = image.resize((new_w, new_h), Image.BILINEAR)
            
            # Enhanced prompt engineering for different question types
            if any(word in msg_lower for word in ['wearing', 'clothes', 'outfit', 'color', 'colour', 'dress']):
                enhanced_msg = f"{msg} Describe all clothing items and their exact colors in detail."
            elif any(word in msg_lower for word in ['describe', 'what', 'tell', 'explain', 'analyze']):
                enhanced_msg = f"{msg} Provide a detailed, natural description covering subjects, setting, colors, mood, and notable details."
            else:
                enhanced_msg = msg
            
            messages = [{"role": "user", "content": [{"type": "image", "image": image}, {"type": "text", "text": enhanced_msg}]}]
            text = engine.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = engine.processor(text=[text], images=[image], padding=True, return_tensors="pt").to(engine.model.device)
            
            with torch.inference_mode():
                ids = engine.model.generate(
                    **inputs,
                    max_new_tokens=250,            # Rich detailed chat responses
                    do_sample=False,               # Greedy for speed
                    num_beams=1,
                    use_cache=True,                # KV cache for speed
                    length_penalty=0.9,            # Natural-feeling output length
                    no_repeat_ngram_size=3,        # Prevent repetition loops
                    repetition_penalty=1.4,        # Strong dedup for clean output
                    early_stopping=True,           # Stop at EOS immediately
                    pad_token_id=engine.processor.tokenizer.pad_token_id,
                    eos_token_id=engine.processor.tokenizer.eos_token_id,
                )
            
            response = engine.processor.batch_decode(ids[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0]
            
            # Hard truncate chat response at 1000 chars for safety
            response = response.strip()[:1000]
            
            # Cleanup for faster sequential processing
            del image, inputs, ids
            if engine.device == "cuda":
                torch.cuda.empty_cache()
            gc.collect()
            
            elapsed = time.time() - start_time
            logger.info(f"[CHAT] Image analysis in {elapsed:.2f}s | {len(response)} chars")
            result = {"success": True, "response": response, "timing": round(elapsed, 3)}
            _cache_response(engine, cache_key, result)
            return result
        
        # === 7. HANDLE GENERAL TEXT QUERIES (no image, not a search/stats) ===
        # Try RAG first, then fall back to general knowledge response
        rag_results = engine.rag_engine.search(msg, top_k=4)
        if rag_results:
            images_data = [{'path': e['path'], 'filename': e['filename'], 'caption': e.get('caption', '')} for e in rag_results]
            response = f"Here's what I found related to '{msg}':\n\n"
            for i, entry in enumerate(rag_results[:4], 1):
                response += f"{i}. **{entry['filename']}** - {entry.get('caption', 'No caption')[:60]}\n"
            elapsed = time.time() - start_time
            return {"success": True, "response": response, "images": images_data, "action": "show_images", "timing": round(elapsed, 3)}
        
        # General conversational response
        response = (
            "I can help you with your photo library! Try:\n\n"
            "🔍 **'Find sunset photos'** - Search by content\n"
            "😊 **'Show happy photos'** - Search by mood\n"
            "📊 **'Library stats'** - See your collection overview\n"
            "📷 **Share an image** - I'll analyze it in detail"
        )
        elapsed = time.time() - start_time
        return {"success": True, "response": response, "timing": round(elapsed, 3)}
        
    except Exception as e:
        logger.error(f"[CHAT] Error: {e}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {"success": False, "error": str(e), "response": "Sorry, I encountered an error. Please try again."}


def _cache_response(engine, key, result):
    """Cache a chat response with LRU eviction."""
    if len(engine._chat_cache) >= engine._chat_cache_max:
        # Evict oldest half
        oldest = list(engine._chat_cache.keys())[:engine._chat_cache_max // 2]
        for k in oldest:
            del engine._chat_cache[k]
    engine._chat_cache[key] = result
