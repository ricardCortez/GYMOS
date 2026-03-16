"""
Servicio de Reconocimiento Facial con InsightFace (ArcFace buffalo_l)
No entrena desde cero — registra embeddings por miembro y compara por distancia coseno.
"""
import numpy as np, io, base64, logging, threading
from PIL import Image
from typing import Optional, List, Tuple

logger = logging.getLogger("gymOS.face")

try:
    from insightface.app import FaceAnalysis
    AVAILABLE = True
except ImportError:
    AVAILABLE = False
    logger.warning("InsightFace no instalado. pip install insightface onnxruntime")


class FaceService:
    def __init__(self, threshold: float = 0.45):
        self.threshold  = threshold
        self.app        = None
        self._ready     = False
        self._cache: dict[str, np.ndarray] = {}  # {member_id: embedding}
        self._lock      = threading.RLock()       # protege _cache en accesos concurrentes

    def initialize(self) -> bool:
        if not AVAILABLE:
            return False
        try:
            from .config import MODELS_DIR
            # root= controla dónde InsightFace busca/descarga el modelo buffalo_l.
            # En producción apunta a data/models/ (dentro de GYMOS_DATA_DIR),
            # evitando que el modelo se guarde en el $HOME del usuario del servicio.
            self.app = FaceAnalysis(
                name="buffalo_l",
                root=str(MODELS_DIR),
                providers=["CPUExecutionProvider"],
            )
            self.app.prepare(ctx_id=0, det_size=(640, 640))
            self._ready = True
            logger.info(f"Modelo InsightFace buffalo_l listo (CPU) — {MODELS_DIR}")
            return True
        except Exception as e:
            logger.error(f"Error cargando modelo: {e}")
            return False

    @property
    def ready(self):
        return self._ready

    # ── Imagen utils ──────────────────────────────────────────────────────────
    @staticmethod
    def decode_image(data) -> np.ndarray:
        import cv2
        if isinstance(data, str):
            if data.startswith("data:"):
                data = data.split(",", 1)[1]
            raw = base64.b64decode(data)
        else:
            raw = data
        img = np.array(Image.open(io.BytesIO(raw)).convert("RGB"))
        return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

    @staticmethod
    def emb_to_bytes(e: np.ndarray) -> bytes:
        return e.astype(np.float32).tobytes()

    @staticmethod
    def bytes_to_emb(b: bytes) -> np.ndarray:
        return np.frombuffer(b, dtype=np.float32).copy()

    @staticmethod
    def cosine_dist(a, b) -> float:
        a = a / (np.linalg.norm(a) + 1e-10)
        b = b / (np.linalg.norm(b) + 1e-10)
        return float(1.0 - np.dot(a, b))

    # ── Core ──────────────────────────────────────────────────────────────────
    def extract(self, image_data) -> Optional[np.ndarray]:
        """Extrae embedding de la imagen. Retorna None si no detecta rostro."""
        if not self._ready:
            raise RuntimeError("Modelo no inicializado")
        img   = self.decode_image(image_data)
        faces = self.app.get(img)
        if not faces:
            return None
        # Tomar el rostro más grande (más cercano a cámara)
        face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
        return face.embedding

    def register(self, member_id: str, images: list, existing: bytes = None):
        """
        Registra rostro con múltiples imágenes -> embedding promedio.
        Retorna (embedding_bytes, n_samples, mensaje)
        """
        embs = []
        if existing:
            embs.append(self.bytes_to_emb(existing))

        errors = []
        for i, img in enumerate(images):
            try:
                e = self.extract(img)
                if e is not None:
                    embs.append(e)
                else:
                    errors.append(f"img{i+1}: sin rostro")
            except Exception as ex:
                errors.append(f"img{i+1}: {ex}")

        if not embs:
            return None, 0, "No se detectaron rostros. " + "; ".join(errors)

        avg = np.mean(embs, axis=0)
        avg = avg / (np.linalg.norm(avg) + 1e-10)
        with self._lock:
            self._cache[member_id] = avg

        msg = f"Registrado con {len(embs)} muestra(s)"
        if errors:
            msg += " | " + "; ".join(errors)
        return self.emb_to_bytes(avg), len(embs), msg

    def load_all(self, members: list):
        """Carga todos los embeddings de la DB en memoria. Llamar al iniciar."""
        new_cache = {}
        for m in members:
            if m.get("face_embedding"):
                new_cache[m["id"]] = self.bytes_to_emb(m["face_embedding"])
        with self._lock:
            self._cache = new_cache
        logger.info(f"Cache facial: {len(self._cache)} miembros")

    def identify(self, image_data) -> Optional[Tuple[str, float]]:
        """
        Identifica rostro contra todos los registrados.
        Retorna (member_id, confidence 0-1) o None.
        """
        if not self._ready:
            return None
        with self._lock:
            if not self._cache:
                return None
            cache_snapshot = dict(self._cache)   # copia local para no mantener el lock durante inferencia

        emb = self.extract(image_data)
        if emb is None:
            return None

        best_id, best_dist = None, float("inf")
        for mid, stored in cache_snapshot.items():
            d = self.cosine_dist(emb, stored)
            if d < best_dist:
                best_dist, best_id = d, mid

        if best_dist <= self.threshold:
            confidence = round(1.0 - (best_dist / self.threshold) * 0.5, 3)
            return best_id, confidence
        return None

    def remove(self, member_id: str):
        with self._lock:
            self._cache.pop(member_id, None)

    def set_threshold(self, t: float):
        self.threshold = max(0.2, min(0.7, float(t)))


face_service = FaceService()   # singleton global