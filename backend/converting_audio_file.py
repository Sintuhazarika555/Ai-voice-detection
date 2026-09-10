# import io
# import torch
# import torchaudio
# import numpy as np

# Target_sample_rate = 16000

# def convert_to_standard_audio(file_bytes: bytes) -> np.ndarray:
#     """
#     Taking raw bytes of audio file from frontend
#     Outputs: Clean 1D Numpy float32 array at exactly 16,000hz Mono
#     """
#     #decode audio bytes directly in memory
#     audio_stream = io.BytesIO(file_bytes)
#     waveform, original_sample_rate = torchaudio.load(audio_stream)
#     if waveform[0].shape > 1:
#         waveform = torch.mean(waveform, dim=0, keepdim=True)
#     if original_sample_rate != Target_sample_rate:
#         resampler = torchaudio.transforms.Resample(
#             orig_freq = original_sample_rate,
#             new_freq = Target_sample_rate
#         )
#         waveform = resampler(waveform)
#     #Converting to 1D 32 bit floating point array
#     audio_1d = waveform.squeeze(0).numpy.astype(np.float32)
#     return audio_1d

import io
import numpy as np
import soundfile as sf
import librosa


def convert_to_standard_audio(byte_data: bytearray, target_sr: int = 16000) -> np.ndarray:
    """
    Converts raw in-memory audio file bytes into standard 1D float32 array at 16kHz.
    """
    try:
        # Load audio buffer via SoundFile
        audio_stream = io.BytesIO(byte_data)
        data, sr = sf.read(audio_stream, dtype="float32")

        # Convert stereo to mono if needed
        if len(data.shape) > 1:
            data = np.mean(data, axis=1)

        # Resample to target 16kHz if necessary
        if sr != target_sr:
            data = librosa.resample(data, orig_sr=sr, target_sr=target_sr)

        return data.astype(np.float32)

    except Exception as e:
        print(f"Error reading audio file buffer: {e}")
        # Fallback raw byte conversion
        return np.frombuffer(byte_data, dtype=np.int16).astype(np.float32) / 32768.0