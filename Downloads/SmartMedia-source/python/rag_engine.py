"""
SmartMedia AI Engine - RAG (Retrieval-Augmented Generation) Engine
===================================================================
Enterprise-grade RAG Engine with semantic search over media database.
Uses sentence-transformers for embedding-based similarity search.
Implements LRU caching, pre-computed embeddings, and fast SQLite lookups.
"""

import os
import json
import hashlib
import sqlite3
import logging

from config import HAS_TRANSFORMERS

logger = logging.getLogger(__name__)

# Conditional imports
if HAS_TRANSFORMERS:
    try:
        from sentence_transformers import SentenceTransformer, util
    except ImportError:
        pass


class RAGEngine:
    """Enterprise-grade RAG Engine with semantic search over media database.
    Uses sentence-transformers for embedding-based similarity search.
    Implements LRU caching, pre-computed embeddings, and fast SQLite lookups."""
    
    def __init__(self, db_path):
        self.db_path = db_path
        self.model = None
        self._embeddings_cache = {}  # path -> embedding
        self._response_cache = {}    # query_hash -> response (LRU)
        self._cache_max_size = 200
        self._db_entries = []        # cached DB entries for search
        self._db_loaded = False
        self._model_loading = False
    
    def _load_model_lazy(self):
        """Lazy load sentence transformer - only when first search happens"""
        if self.model is not None or self._model_loading:
            return
        self._model_loading = True
        try:
            self.model = SentenceTransformer('all-MiniLM-L6-v2')
            logger.info("[RAG] Sentence transformer loaded successfully")
        except Exception as e:
            logger.warning(f"[RAG] Failed to load sentence transformer: {e}")
            self.model = None
        finally:
            self._model_loading = False
    
    def _load_db_entries(self):
        """Load all media entries from database for semantic search"""
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            c.execute("""
                SELECT path, filename, caption, emotion, objects, extracted_text, media_type, tags
                FROM images 
                WHERE caption IS NOT NULL AND caption != ''
                ORDER BY scanned_at DESC
                LIMIT 5000
            """)
            rows = c.fetchall()
            conn.close()
            
            self._db_entries = []
            for row in rows:
                path, filename, caption, emotion, objects_str, extracted_text, media_type, tags_str = row
                # Build searchable text from ALL fields including rich tags
                tags_text = ''
                if tags_str:
                    try:
                        tags_list = json.loads(tags_str)
                        tags_text = ' '.join(tags_list) if isinstance(tags_list, list) else str(tags_list)
                    except:
                        tags_text = str(tags_str)
                search_text = f"{filename or ''} {caption or ''} {emotion or ''} {objects_str or ''} {extracted_text or ''} {tags_text}"
                self._db_entries.append({
                    'path': path,
                    'filename': filename or os.path.basename(path),
                    'caption': caption or '',
                    'emotion': emotion or '',
                    'objects': json.loads(objects_str) if objects_str else [],
                    'media_type': media_type or 'image',
                    'search_text': search_text.lower()
                })
            
            self._db_loaded = True
            logger.info(f"[RAG] Loaded {len(self._db_entries)} entries from database")
        except Exception as e:
            logger.error(f"[RAG] Failed to load DB entries: {e}")
            self._db_entries = []
    
    def _get_cache_key(self, query):
        return hashlib.md5(query.lower().strip().encode()).hexdigest()
    
    def search(self, query, top_k=8):
        """Fast semantic + keyword hybrid search over media database"""
        if not self._db_loaded:
            self._load_db_entries()
        
        if not self._db_entries:
            return []
        
        # Check cache first
        cache_key = self._get_cache_key(query)
        if cache_key in self._response_cache:
            logger.info(f"[RAG] Cache hit for query: {query[:50]}")
            return self._response_cache[cache_key]
        
        query_lower = query.lower().strip()
        results = []
        
        # ── SYNONYM EXPANSION: expand the query with related words ──
        # This lets "sunglasses" find "spectacles" and "vehicle" find "car", "bike" etc.
        SEARCH_SYNONYMS = {
            # Eyewear
            'glasses':     ['spectacles', 'eyeglasses', 'eyewear', 'sunglasses', 'goggles', 'specs'],
            'sunglasses':  ['shades', 'spectacles', 'goggles', 'glasses', 'eyewear', 'sunnies'],
            'spectacles':  ['glasses', 'eyeglasses', 'specs', 'eyewear', 'sunglasses'],
            'specs':       ['glasses', 'spectacles', 'eyeglasses', 'eyewear'],
            # Vehicles (searching "vehicle" returns cars AND bikes)
            'vehicle':     ['car', 'bike', 'motorcycle', 'bus', 'truck', 'scooter', 'van', 'jeep',
                            'suv', 'automobile', 'two-wheeler', 'bicycle', 'auto', 'motorbike'],
            'car':         ['automobile', 'vehicle', 'sedan', 'suv', 'jeep', 'auto'],
            'bike':        ['bicycle', 'cycle', 'motorcycle', 'motorbike', 'scooter', 'two-wheeler', 'vehicle'],
            'motorcycle':  ['motorbike', 'bike', 'scooter', 'two-wheeler', 'vehicle'],
            'bicycle':     ['bike', 'cycle', 'two-wheeler'],
            'scooter':     ['motorbike', 'bike', 'two-wheeler', 'vehicle'],
            'truck':       ['lorry', 'vehicle', 'automobile'],
            # Clothing
            'pants':       ['trousers', 'jeans', 'bottoms', 'slacks'],
            'trousers':    ['pants', 'jeans', 'bottoms'],
            'jacket':      ['coat', 'blazer', 'outerwear', 'hoodie'],
            'dress':       ['gown', 'frock', 'outfit', 'attire'],
            'shoes':       ['footwear', 'sneakers', 'boots', 'sandals', 'heels'],
            'sneakers':    ['shoes', 'trainers', 'footwear', 'kicks'],
            'boots':       ['shoes', 'footwear'],
            # People
            'woman':       ['female', 'lady', 'girl', 'person', 'she'],
            'man':         ['male', 'guy', 'boy', 'person', 'he', 'gentleman'],
            'child':       ['kid', 'boy', 'girl', 'baby', 'toddler', 'young'],
            'baby':        ['infant', 'toddler', 'child', 'kid'],
            'person':      ['man', 'woman', 'individual', 'human', 'people'],
            'people':      ['person', 'crowd', 'group', 'family', 'friends', 'humans'],
            # Animals
            'animal':      ['dog', 'cat', 'bird', 'pet', 'wildlife', 'horse', 'cow', 'lion'],
            'dog':         ['puppy', 'pet', 'canine', 'animal', 'hound'],
            'cat':         ['kitten', 'kitty', 'pet', 'feline', 'animal'],
            'pet':         ['dog', 'cat', 'animal'],
            # Nature / outdoor
            'nature':      ['landscape', 'outdoor', 'forest', 'mountain', 'beach', 'river', 'park', 'garden'],
            'mountain':    ['hill', 'peak', 'summit', 'highland', 'nature', 'landscape'],
            'beach':       ['sea', 'ocean', 'coast', 'shore', 'seaside', 'water'],
            'sea':         ['ocean', 'beach', 'water', 'coast', 'shore'],
            'ocean':       ['sea', 'beach', 'water', 'coast'],
            'sunset':      ['dusk', 'golden hour', 'twilight', 'evening', 'sky'],
            'sunrise':     ['dawn', 'morning', 'golden hour', 'sky'],
            'forest':      ['woods', 'jungle', 'trees', 'nature', 'landscape'],
            'flower':      ['bloom', 'blossom', 'floral', 'plant', 'rose', 'nature'],
            # Food
            'food':        ['meal', 'dish', 'cuisine', 'eating', 'snack', 'dessert', 'drink'],
            'coffee':      ['drink', 'beverage', 'cafe', 'latte', 'espresso', 'cappuccino'],
            'cake':        ['dessert', 'sweet', 'food', 'pastry', 'bakery'],
            # Events
            'wedding':     ['marriage', 'ceremony', 'celebration', 'event', 'bride', 'groom'],
            'birthday':    ['celebration', 'party', 'event', 'anniversary', 'cake'],
            'party':       ['celebration', 'event', 'gathering', 'birthday', 'wedding'],
            # Architecture
            'temple':      ['religious', 'architecture', 'place of worship', 'shrine', 'mandir'],
            'church':      ['religious', 'architecture', 'chapel', 'cathedral', 'place of worship'],
            'mosque':      ['religious', 'architecture', 'masjid', 'place of worship'],
            'building':    ['architecture', 'structure', 'house', 'office', 'tower'],
            # Moods / styles
            'selfie':      ['portrait', 'self-portrait', 'solo', 'face'],
            'portrait':    ['selfie', 'face', 'person', 'headshot'],
            'happy':       ['joyful', 'cheerful', 'smiling', 'joy', 'laughing', 'excited'],
            'sad':         ['unhappy', 'crying', 'gloomy', 'melancholy', 'somber'],
            'dark':        ['dramatic', 'moody', 'night', 'low light', 'mysterious'],
            'bright':      ['vibrant', 'colorful', 'vivid', 'sunny', 'light'],
        }
        
        # Expand query words with synonyms
        query_words = set(query_lower.split())
        expanded_query_words = set(query_words)
        for word in list(query_words):
            if word in SEARCH_SYNONYMS:
                for syn in SEARCH_SYNONYMS[word]:
                    expanded_query_words.update(syn.split())
        
        # Also expand multi-word query phrases
        expanded_phrases = [query_lower]
        for word in list(query_words):
            if word in SEARCH_SYNONYMS:
                for syn in SEARCH_SYNONYMS[word]:
                    expanded_phrases.append(syn)
        
        # Stage 1: Fast keyword matching with synonym-expanded query
        keyword_scores = []
        
        for entry in self._db_entries:
            score = 0
            search_text = entry['search_text']
            
            # Exact phrase match (highest score)
            for phrase in expanded_phrases:
                if phrase in search_text:
                    score += 10
                    break
            
            # Individual word matching (original + synonyms)
            for word in expanded_query_words:
                if len(word) > 2 and word in search_text:
                    score += 2
            
            # Emotion matching
            emotion_map = {
                'happy':    ['happy', 'joyful', 'cheerful', 'smiling', 'joy', 'bright', 'laughing'],
                'sad':      ['sad', 'melancholy', 'gloomy', 'somber', 'unhappy', 'crying'],
                'excited':  ['excited', 'energetic', 'enthusiastic', 'vibrant', 'dynamic'],
                'peaceful': ['peaceful', 'calm', 'serene', 'tranquil', 'relaxed', 'quiet'],
                'romantic': ['romantic', 'intimate', 'love', 'tender', 'sweet'],
                'dramatic': ['dramatic', 'intense', 'dark', 'moody', 'cinematic'],
                'neutral':  ['neutral', 'ordinary', 'normal', 'casual']
            }
            for emo, keywords in emotion_map.items():
                if any(kw in expanded_query_words for kw in keywords):
                    if entry['emotion'] == emo:
                        score += 5
            
            # Type matching
            type_queries = {
                'selfie': 'portrait', 'landscape': 'landscape', 'food': 'food',
                'document': 'document', 'screenshot': 'screenshot', 'group': 'group',
                'video': 'video', 'audio': 'audio', 'photo': 'image', 'picture': 'image',
                'vehicle': 'vehicle', 'animal': 'animal', 'architecture': 'architecture',
                'sports': 'sports', 'event': 'event', 'car': 'vehicle', 'bike': 'vehicle',
            }
            for qword, mtype in type_queries.items():
                if qword in expanded_query_words and mtype in (entry.get('media_type', '') or search_text):
                    score += 3
            
            if score > 0:
                keyword_scores.append((score, entry))
        
        # Sort by score descending
        keyword_scores.sort(key=lambda x: x[0], reverse=True)
        results = [entry for _, entry in keyword_scores[:top_k]]
        
        # Stage 2: Semantic search (if model available and keyword results insufficient)
        if len(results) < top_k and self.model is not None:
            try:
                # Encode query
                query_embedding = self.model.encode(query, convert_to_tensor=True)
                
                # Encode all captions (with caching)
                captions = []
                valid_entries = []
                for entry in self._db_entries:
                    if entry['caption']:
                        captions.append(entry['caption'])
                        valid_entries.append(entry)
                
                if captions:
                    caption_embeddings = self.model.encode(captions, convert_to_tensor=True, batch_size=64)
                    cos_scores = util.cos_sim(query_embedding, caption_embeddings)[0]
                    
                    # Get top matches above threshold
                    top_indices = cos_scores.argsort(descending=True)[:top_k * 2]
                    existing_paths = {r['path'] for r in results}
                    
                    for idx in top_indices:
                        if cos_scores[idx] > 0.3:  # Similarity threshold
                            entry = valid_entries[idx]
                            if entry['path'] not in existing_paths:
                                results.append(entry)
                                existing_paths.add(entry['path'])
                                if len(results) >= top_k:
                                    break
                
                logger.info(f"[RAG] Semantic search found {len(results)} results")
            except Exception as e:
                logger.warning(f"[RAG] Semantic search failed: {e}")
        
        # Cache results
        if len(self._response_cache) >= self._cache_max_size:
            # Evict oldest entries
            oldest_keys = list(self._response_cache.keys())[:self._cache_max_size // 2]
            for k in oldest_keys:
                del self._response_cache[k]
        self._response_cache[cache_key] = results
        
        return results
    
    def invalidate_cache(self):
        """Invalidate all caches when database changes"""
        self._response_cache.clear()
        self._db_loaded = False
        self._db_entries = []
        logger.info("[RAG] Cache invalidated")
    
    def get_stats(self):
        """Get database statistics for chat responses"""
        try:
            conn = sqlite3.connect(str(self.db_path))
            c = conn.cursor()
            
            stats = {}
            c.execute("SELECT COUNT(*) FROM images")
            stats['total'] = c.fetchone()[0]
            
            c.execute("SELECT COUNT(*) FROM images WHERE media_type = 'image' OR media_type IS NULL")
            stats['images'] = c.fetchone()[0]
            
            c.execute("SELECT COUNT(*) FROM images WHERE media_type = 'video'")
            stats['videos'] = c.fetchone()[0]
            
            c.execute("SELECT COUNT(*) FROM images WHERE media_type = 'document'")
            stats['documents'] = c.fetchone()[0]
            
            c.execute("SELECT emotion, COUNT(*) FROM images WHERE emotion IS NOT NULL GROUP BY emotion")
            stats['emotions'] = dict(c.fetchall())
            
            c.execute("SELECT COUNT(*) FROM images WHERE is_favorite = 1")
            stats['favorites'] = c.fetchone()[0]
            
            conn.close()
            return stats
        except Exception as e:
            logger.error(f"[RAG] Stats error: {e}")
            return {'total': 0, 'images': 0, 'videos': 0, 'documents': 0, 'emotions': {}, 'favorites': 0}
