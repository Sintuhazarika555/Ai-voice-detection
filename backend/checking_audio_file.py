# import numpy as np
# from scipy.signal import butter, sosfilt
# import noisereduce as nr
# import sys
# import os
# sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# from core.main import predict as ai_predict


# SAMPLE_RATE = 16000
# CHUNK_DURATION = 5
# CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_DURATION
# AI_VOICE = 0
# HUMAN_VOICE = 0
# max_try = 0

# def butter_bandpass(lowcut=80.0, highcut = 7500.0, fs=16000, order=5):
#     max_frequency_sample = fs/2
#     low = lowcut/max_frequency_sample
#     high = highcut/max_frequency_sample
#     sos = butter(order, [low, high], btype = "bandpass", output = "sos")
#     return sos

# SOS_FILTER = butter_bandpass()

# def apply_bandpass_filter(audio_bytes: np.ndarray)->np.ndarray:
#     """ Remove desk thumps, ac voices and other background voices"""
#     return sosfilt(SOS_FILTER, audio_bytes)

# def split_into_5sec_chunks(filtered_audio: np.ndarray, hop_seconds:float) -> np.ndarray:
#     """
#     Splitting 1d filtered audio array chunk into 5 sec clips
#     overlapping some old data(50%)
#     """
#     total_samples = len(filtered_audio)
#     hop_samples = int(hop_seconds * SAMPLE_RATE)
#     chunks = []
#     if total_samples == CHUNK_SAMPLES:
#         chunks.append(filtered_audio)
#         return chunks
#     elif total_samples < CHUNK_SAMPLES:
#         padding = CHUNK_SAMPLES - total_samples
#         padded_audio = np.pad(filtered_audio,(0, padding), mode="constant")
#         chunks.append(filtered_audio)
#         return chunks
#     else:
#         start = 0
#         total_bytes_read = 0
#         while start + CHUNK_SAMPLES <= total_samples:
#             chunks.append(filtered_audio[start: start + CHUNK_SAMPLES])
#             start = start + hop_samples
#             total_bytes_read = start + CHUNK_SAMPLES
#         if total_bytes_read < total_samples:
#             chunks.append(filtered_audio[total_bytes_read: total_samples])
#         return chunks

# def denoise_audio_chunk(audio_array_bytes: np.ndarray, fs=16000)-> np.ndarray:
#     """
#     surpress ambient noise using stationary spectral gating
#     prop_decrease = 0.65 means reducing noise by 65% without destroying noise feature
#     """
#     cleaned = nr.reduce_noise(
#         y = audio_array_bytes,
#         sr = fs,
#         prop_decrease= 0.65,
#         stationary= True,
#         n_fft= 1024,
#         hop_length= 256
#     )
#     return cleaned

# def preprocessing_audio_file(audio_bytes: np.ndarray, hop_seconds: float = 2.5):
#     """
#     Input: 32 bit floating point numpy array at 16000hz
#     Output: 5 second schunk ready for passing it to model
#     """
#     filtered_audio = apply_bandpass_filter(audio_bytes)
#     raw_chunks = split_into_5sec_chunks(filtered_audio, hop_seconds)
#     # Denoise 5 second chunks individually
#     for chunk in raw_chunks:
#         clean_chunk = denoise_audio_chunk(chunk, fs = SAMPLE_RATE)
#         # normalizing audio ampletude between -1.0 and 1.0
#         max_val = np.max(np.abs(clean_chunk))
#         if max_val > 0:
#             clean_chunk = clean_chunk/max_val
#         ai_prob, human_prob = ai_predict(clean_chunk)
#         max_try = max_try + 1
#         AI_VOICE = (AI_VOICE + ai_prob)/max_try
#         HUMAN_VOICE =(HUMAN_VOICE + human_prob)/max_try
#         if max_try == 3 and AI_VOICE > HUMAN_VOICE:
#             return 1
#         elif max_try == 3 and AI_VOICE <= HUMAN_VOICE:
#             max_try = 0
#             AI_VOICE = 0
#             HUMAN_VOICE = 0
#     return 0

import sys
import os
import numpy as np
from scipy.signal import butter, sosfilt
import noisereduce as nr

# Add project root directory to path for cross-folder imports
SYS_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SYS_ROOT not in sys.path:
    sys.path.append(SYS_ROOT)

from core.main import predict as ai_predict

SAMPLE_RATE = 16000
CHUNK_DURATION = 5
CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_DURATION


def butter_bandpass(lowcut=80.0, highcut=7500.0, fs=16000, order=5):
    max_freq = fs / 2.0
    low = lowcut / max_freq
    high = highcut / max_freq
    sos = butter(order, [low, high], btype="bandpass", output="sos")
    return sos


SOS_FILTER = butter_bandpass()


def apply_bandpass_filter(audio_bytes: np.ndarray) -> np.ndarray:
    """Filter out extreme low-frequency hums and high-frequency static."""
    return sosfilt(SOS_FILTER, audio_bytes)


def split_into_5sec_chunks(filtered_audio: np.ndarray, hop_seconds: float) -> list:
    """Slices audio array into 5-second (80,000 samples) evaluation chunks."""
    total_samples = len(filtered_audio)
    hop_samples = int(hop_seconds * SAMPLE_RATE)
    chunks = []

    if total_samples <= CHUNK_SAMPLES:
        padding = CHUNK_SAMPLES - total_samples
        padded = np.pad(filtered_audio, (0, padding), mode="constant")
        chunks.append(padded)
        return chunks

    start = 0
    total_bytes_read = 0
    while start + CHUNK_SAMPLES <= total_samples:
        chunks.append(filtered_audio[start : start + CHUNK_SAMPLES])
        start += hop_samples
        total_bytes_read = start + CHUNK_SAMPLES
    if total_bytes_read < total_samples:
        chunks.append(filtered_audio[total_bytes_read: total_samples])

    return chunks


def denoise_audio_chunk(audio_array: np.ndarray, fs=16000) -> np.ndarray:
    """Lightweight stationary spectral gating for fast streaming noise reduction."""
    try:
        cleaned = nr.reduce_noise(
            y=audio_array,
            sr=fs,
            prop_decrease=0.65,
            stationary=True,
            n_fft=1024,
            hop_length=256
        )
        return cleaned
    except Exception:
        return audio_array


def preprocessing_audio_file(audio_bytes: np.ndarray, hop_seconds: float = 2.5) -> int:
    """
    Main processing pipeline.
    Returns: 1 for AI Voice, 0 for Human Voice.
    """
    if audio_bytes is None or len(audio_bytes) == 0:
        return 0

    filtered_audio = apply_bandpass_filter(audio_bytes)
    raw_chunks = split_into_5sec_chunks(filtered_audio, hop_seconds)

    ai_scores = []
    human_scores = []

    for chunk in raw_chunks:
        clean_chunk = denoise_audio_chunk(chunk, fs=SAMPLE_RATE)

        # Normalize peak audio amplitude
        max_val = np.max(np.abs(clean_chunk))
        if max_val > 0:
            clean_chunk = clean_chunk / max_val

        ai_prob, human_prob = ai_predict(clean_chunk)
        ai_scores.append(ai_prob)
        human_scores.append(human_prob)

    avg_ai = np.mean(ai_scores) if ai_scores else 0.0
    avg_human = np.mean(human_scores) if human_scores else 1.0

    return 1 if avg_ai > avg_human else 0
