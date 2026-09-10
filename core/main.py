# import numpy as np
# import torch
# from transformers import AutoModelForAudioClassification, AutoFeatureExtractor

# MODEL_DIR = "./models/wav2vec2-deepfake-voice-detector"
# AI_INDEX = 1
# HUMAN_INDEX = 0

# DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# _model = None
# _feature_extractor = None


# def _load():
#     global _model, _feature_extractor
#     if _model is None:
#         _feature_extractor = AutoFeatureExtractor.from_pretrained(MODEL_DIR)
#         _model = AutoModelForAudioClassification.from_pretrained(MODEL_DIR)
#         _model.to(DEVICE)
#         _model.eval()
#         print(f"[core.main] Model loaded on: {DEVICE}")
#     return _model, _feature_extractor


# def predict(input_values: np.ndarray):
#     """
#     input_values: numpy float32 array, shape (1, sequence_length) or (sequence_length,)
#     returns: (ai_probability, human_probability)
#     """
#     model, feature_extractor = _load()

#     audio = np.asarray(input_values, dtype=np.float32).reshape(-1)

#     inputs = feature_extractor(audio, sampling_rate=16000, return_tensors="pt")
#     inputs = {k: v.to(DEVICE) for k, v in inputs.items()}

#     with torch.no_grad():
#         logits = model(**inputs).logits

#     probs = torch.softmax(logits, dim=-1)[0].cpu().numpy()

#     ai_probability = float(probs[AI_INDEX])
#     human_probability = float(probs[HUMAN_INDEX])

#     return ai_probability, human_probability

import os
import torch
import numpy as np
from transformers import AutoModelForAudioClassification, AutoFeatureExtractor

# 1. SETUP DEVICE & MODEL PATHS
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
RELATIVE_MODEL_PATH = "./models/wav2vec2-deepfake-voice-detector"
MODEL_PATH = os.path.abspath(RELATIVE_MODEL_PATH)

# Index positions for your classification outputs
AI_INDEX = 0
HUMAN_INDEX = 1

def _load():
    """Load model once from local directory or Hugging Face repository."""
    try:
        print(f"Loading Wav2Vec2 model from: {MODEL_PATH}")
        feature_extractor = AutoFeatureExtractor.from_pretrained(MODEL_PATH)
        model = AutoModelForAudioClassification.from_pretrained(MODEL_PATH)
        model.to(DEVICE)
        model.eval()
        return model, feature_extractor
    except Exception as e:
        print(f"Failed loading local model path. Falling back to hub load: {e}")
        # Fallback to default model hub if local path isn't present
        DEFAULT_REPO = "facebook/wav2vec2-base"
        feature_extractor = AutoFeatureExtractor.from_pretrained(DEFAULT_REPO)
        model = AutoModelForAudioClassification.from_pretrained(DEFAULT_REPO)
        model.to(DEVICE)
        model.eval()
        return model, feature_extractor

# 2. PRE-LOAD MODEL AT TOP LEVEL
MODEL, FEATURE_EXTRACTOR = _load()


def predict(input_values: np.ndarray):
    """
    Fast inference function. Accepts 1D float32 numpy audio array at 16kHz.
    Returns: (ai_probability, human_probability)
    """
    audio = np.asarray(input_values, dtype=np.float32).reshape(-1)

    # Extract audio features
    inputs = FEATURE_EXTRACTOR(audio, sampling_rate=16000, return_tensors="pt")
    inputs = {k: v.to(DEVICE) for k, v in inputs.items()}

    with torch.no_grad():
        logits = MODEL(**inputs).logits

    # Convert logits to normalized softmax probabilities
    probs = torch.softmax(logits, dim=-1)[0].cpu().numpy()

    ai_probability = float(probs[AI_INDEX]) if len(probs) > AI_INDEX else float(probs[0])
    human_probability = float(probs[HUMAN_INDEX]) if len(probs) > HUMAN_INDEX else 1.0 - ai_probability

    return ai_probability, human_probability