"""
SmartMedia AI Engine - Similarity Engine Module
=================================================
Perceptual hash-based image similarity detection for finding duplicates.
"""

import logging

from config import HAS_IMAGEHASH, HAS_PIL

logger = logging.getLogger(__name__)

if HAS_PIL:
    from PIL import Image

if HAS_IMAGEHASH:
    import imagehash


class SimilarityEngine:
    def find_similar_images(self, paths, threshold=0.92, mode='similar'):
        if not HAS_IMAGEHASH:
            return []
        threshold = max(0.0, min(1.0, float(threshold or 0.92)))
        hashes = {}
        for p in paths:
            try:
                # Resize extremely small for hashing speed
                img = Image.open(p).resize((64, 64), Image.NEAREST)
                hashes[p] = {
                    'phash': imagehash.phash(img),
                    'dhash': imagehash.dhash(img),
                    'whash': imagehash.whash(img),
                }
            except:
                continue
            
        groups = []
        processed = set()
        keys = list(hashes.keys())
        
        # Calculate weighted multi-hash distance. Max differences per hash is 64 bits.
        if mode == 'exact':
            max_distance = 0  # Exact match (0 bit difference)
        else:
            max_distance = int(64 * (1.0 - threshold))
            
        for i, p1 in enumerate(keys):
            if p1 in processed:
                continue
            group = [{'path': p1, 'similarity': 1.0}]
            group_similarities = [1.0]
            for p2 in keys[i+1:]:
                if p2 in processed:
                    continue
                if mode == 'exact':
                    is_match = hashes[p1]['phash'] - hashes[p2]['phash'] <= max_distance
                    similarity = 1.0 if is_match else 0.0
                else:
                    ph = hashes[p1]['phash'] - hashes[p2]['phash']
                    dh = hashes[p1]['dhash'] - hashes[p2]['dhash']
                    wh = hashes[p1]['whash'] - hashes[p2]['whash']
                    weighted_distance = (0.5 * ph) + (0.3 * dh) + (0.2 * wh)
                    similarity = max(0.0, 1.0 - (weighted_distance / 64.0))
                    is_match = weighted_distance <= max_distance

                if is_match:
                    group.append({'path': p2})
                    group_similarities.append(similarity)
                    processed.add(p2)
            if len(group) > 1:
                processed.add(p1)
                avg_similarity = sum(group_similarities) / len(group_similarities)
                groups.append({'images': group, 'count': len(group), 'avg_similarity': avg_similarity})
        return groups
