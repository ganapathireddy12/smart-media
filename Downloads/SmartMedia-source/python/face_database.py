"""
SmartMedia AI Engine - Face Database Module
=============================================
Face storage, matching, merging, and clustering using face_recognition library.
"""

import os
import json
import hashlib
import pickle
import logging
import io

from config import HAS_FACE_RECOGNITION, HAS_CLUSTERING

logger = logging.getLogger(__name__)


class FaceDatabase:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.faces = {}
        self._load()
    
    def _load(self):
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'rb') as f:
                    data = pickle.load(f)
                    self.faces = data.get('faces', {})
                # Ensure JSON cache is up-to-date on load
                self._save_json_cache()
            except:
                self.faces = {}
    
    def _save(self):
        try:
            with open(self.db_path, 'wb') as f:
                pickle.dump({'faces': self.faces}, f)
            # Also save a JSON cache for fast loading by Electron without Python
            self._save_json_cache()
        except:
            pass
    
    def _save_json_cache(self):
        """Save a JSON version of faces for instant loading by Electron"""
        try:
            cache_path = os.path.join(os.path.dirname(self.db_path), 'faces_cache.json')
            faces_list = []
            for face_id, face_data in self.faces.items():
                faces_list.append({
                    'id': face_id,
                    'name': face_data.get('name'),
                    'thumbnail': face_data.get('thumbnail'),
                    'image_count': len(face_data.get('images', [])),
                    'images': face_data.get('images', []),
                    'avg_confidence': None
                })
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(faces_list, f)
        except Exception as e:
            logger.warning(f"[CACHE] Failed to save face cache: {e}")
    
    def add_or_update_face(self, encoding, image_path, location, thumbnail):
        """Add or update face with proper matching using face_recognition distance"""
        if encoding is None:
            # No encoding, create unique ID from location
            face_id = hashlib.md5(str(location).encode()).hexdigest()[:12]
            self.faces[face_id] = {
                'images': [image_path],
                'thumbnail': thumbnail,
                'name': f'Person {len(self.faces)+1}',
                'encoding': None,
                'locations': [location]
            }
            return face_id
        
        # Try to match with existing faces using face_recognition distance
        encoding_list = encoding.tolist() if hasattr(encoding, 'tolist') else encoding
        
        if HAS_FACE_RECOGNITION:
            import face_recognition
            import numpy as np
            
            # BEST PRACTICE: Find the closest matching face (not just first match)
            # This prevents creating duplicates when same person appears multiple times
            best_match_id = None
            best_match_distance = float('inf')
            best_match_data = None
            
            # Check against ALL existing faces to find best match
            for face_id, face_data in self.faces.items():
                stored_encoding = face_data.get('encoding')
                if stored_encoding is not None:
                    # Calculate face distance (lower = more similar)
                    distance = face_recognition.face_distance(
                        [np.array(stored_encoding)], 
                        np.array(encoding_list)
                    )[0]
                    
                    # Track the closest match
                    if distance < best_match_distance:
                        best_match_distance = distance
                        best_match_id = face_id
                        best_match_data = face_data
            
            # CUSTOM TUNED: Use 0.55 threshold (balanced for this dataset)
            # This is slightly stricter than standard 0.6 but looser than 0.5
            # Reference: https://github.com/ageitgey/face_recognition
            # - 0.6 = Standard (recommended for production)
            # - 0.55 = Balanced (better duplicate prevention)
            # - 0.5 = Strict (may create duplicates with lighting/angle changes)
            FACE_MATCH_THRESHOLD = 0.55
            
            if best_match_id and best_match_distance < FACE_MATCH_THRESHOLD:
                # Match found! Update existing face with best match
                if image_path not in best_match_data['images']:
                    best_match_data['images'].append(image_path)
                if 'locations' not in best_match_data:
                    best_match_data['locations'] = []
                best_match_data['locations'].append(location)
                # Update thumbnail if this one is better (use first thumbnail only)
                if not best_match_data.get('thumbnail') and thumbnail:
                    best_match_data['thumbnail'] = thumbnail
                logger.info(f"[FACE MATCH] ✓ Matched existing person {best_match_data.get('name', best_match_id)} (distance: {best_match_distance:.3f})")
                return best_match_id
        
        # No match found, create new face ID
        face_id = hashlib.md5(str(encoding_list[:10]).encode()).hexdigest()[:12]
        person_number = len(self.faces) + 1
        logger.info(f"[FACE MATCH] ✗ No match found, creating new Person {person_number} (ID: {face_id})")
        self.faces[face_id] = {
            'images': [image_path],
            'thumbnail': thumbnail,
            'name': f'Person {person_number}',
            'encoding': encoding_list,
            'locations': [location]
        }
        return face_id
    
    def get_all_faces(self):
        result = []
        for face_id, face_data in self.faces.items():
            # Calculate average confidence if available
            confidence_scores = face_data.get('confidence_scores', [])
            avg_confidence = None
            if confidence_scores:
                avg_confidence = sum(confidence_scores) / len(confidence_scores)
            
            result.append({
                'id': face_id,
                'name': face_data.get('name'),
                'thumbnail': face_data.get('thumbnail'),
                'image_count': len(face_data.get('images', [])),
                'images': face_data.get('images', []),
                'avg_confidence': avg_confidence  # Add confidence score for UI display
            })
        return result

    def delete_face(self, fid):
        if fid in self.faces:
            del self.faces[fid]
            self._save()
            return True
        return False
        
    def set_face_name(self, fid, name):
        if fid in self.faces:
            self.faces[fid]['name'] = name
            self._save()
            return True
        return False
    
    def reset_database(self):
        self.faces = {}
        self._save()
        return True
    
    def merge_duplicate_faces(self):
        """Advanced duplicate face merging using DBSCAN clustering"""
        if not HAS_FACE_RECOGNITION or not HAS_CLUSTERING:
            return {"merged": 0, "message": "face_recognition and sklearn not available"}
        
        import face_recognition
        import numpy as np
        from sklearn.cluster import DBSCAN
        
        if len(self.faces) < 2:
            return {"merged": 0, "message": "Not enough faces to merge"}
        
        logger.info(f"[FACE MERGE] Starting advanced duplicate detection on {len(self.faces)} people...")
        
        # Collect face data for clustering
        face_items = []
        face_encodings = []
        
        for face_id, face_data in self.faces.items():
            encoding = face_data.get('encoding')
            if encoding is not None:
                face_items.append((face_id, face_data))
                face_encodings.append(np.array(encoding))
        
        if len(face_encodings) < 2:
            return {"merged": 0, "message": "Not enough valid encodings to merge"}
        
        # Use DBSCAN clustering to find duplicate persons
        # eps=0.55 matches the face matching threshold for consistency
        clustering = DBSCAN(
            eps=0.55,           # Threshold aligned with face matching (0.55)
            min_samples=1,      # Each person can be a cluster
            metric='euclidean', # Euclidean distance like Google Photos
            n_jobs=-1          # Use all CPU cores
        )
        
        cluster_labels = clustering.fit_predict(face_encodings)
        
        # Group faces by cluster
        clusters = {}
        for i, (face_id, face_data) in enumerate(face_items):
            label = cluster_labels[i]
            if label not in clusters:
                clusters[label] = []
            clusters[label].append((face_id, face_data))
        
        merged_count = 0
        
        # Process clusters - merge faces in same cluster
        for label, cluster_faces in clusters.items():
            if label == -1:  # Outliers - skip
                continue
                
            if len(cluster_faces) > 1:
                # Multiple faces in same cluster = duplicates to merge
                logger.info(f"[FACE MERGE] Found duplicate cluster with {len(cluster_faces)} faces")
                
                # Find the face with most images as the main face
                main_face_id, main_data = max(cluster_faces, 
                    key=lambda x: len(x[1].get('images', [])))
                
                # Calculate average confidence for main face
                all_confidences = []
                
                # Merge data from other faces into main face
                for face_id, face_data in cluster_faces:
                    if face_id != main_face_id:
                        logger.info(f"[FACE MERGE] Merging {face_id} -> {main_face_id}")
                        
                        # Combine images (deduplicate)
                        main_images = set(main_data.get('images', []))
                        other_images = set(face_data.get('images', []))
                        main_data['images'] = list(main_images | other_images)
                        
                        # Combine locations
                        main_locs = main_data.get('locations', [])
                        other_locs = face_data.get('locations', [])
                        main_data['locations'] = main_locs + other_locs
                        
                        # Combine confidence scores
                        main_conf = main_data.get('confidence_scores', [])
                        other_conf = face_data.get('confidence_scores', [])
                        all_confidences.extend(main_conf + other_conf)
                        
                        # Use better thumbnail if available
                        if not main_data.get('thumbnail') and face_data.get('thumbnail'):
                            main_data['thumbnail'] = face_data['thumbnail']
                        
                        # Delete the duplicate face
                        if face_id in self.faces:
                            del self.faces[face_id]
                            merged_count += 1
                
                # Update confidence scores for merged face
                if all_confidences:
                    main_data['confidence_scores'] = all_confidences
                    avg_confidence = sum(all_confidences) / len(all_confidences)
                    logger.info(f"[FACE MERGE] {main_face_id} now has {len(main_data.get('images', []))} images (avg confidence: {avg_confidence:.1f}%)")
        
        if merged_count > 0:
            self._save()  # Save changes
            logger.info(f"[FACE MERGE] ✓ Successfully merged {merged_count} duplicate faces")
        
        return {
            "merged": merged_count,
            "message": f"Merged {merged_count} duplicate faces using DBSCAN clustering",
            "unique_people": len(self.faces)
        }
