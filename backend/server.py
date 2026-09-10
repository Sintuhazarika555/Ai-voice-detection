# from fastapi import FastAPI, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
# from fastapi.middleware.cors import CORSMiddleware
# from converting_audio_file import convert_to_standard_audio
# from checking_audio_file import preprocessing_audio_file
# from collections import deque
# import numpy as np
# import json
# app = FastAPI()

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins = ["*"],
#     allow_credentials = True,
#     allow_methods = ["*"],
#     allow_headers = ["*"]
# )

# @app.post("/api/detect-audio")
# async def check_audio_file(file: UploadFile = File(...)):
#     # if not file.content_type.startswith("/audio"):
#     #     print("file must be an audio file")
#     #     raise HTTPException(
#     #         status_code= 400,
#     #         detail= "File must be an audio file"
#     #     )
#     try:
#         total_read_bytes = 0
#         max_file_size = 50*1024*1024 # maximum audio file size: 50Mb
#         chunk_size = 64*1024 # maximum chunk size 64kb
#         in_memory_buffer = bytearray()
#         while chunk:= await file.read(chunk_size):
#             total_read_bytes = total_read_bytes + len(chunk)
#             if total_read_bytes > max_file_size:
#                 print("file size greater than 50mb")
#                 raise HTTPException(
#                     status_code= 413,
#                     detail= "maximum file size supported is 50mb"
#                 )
#             in_memory_buffer.extend(chunk)
#         audio_1d = convert_to_standard_audio(in_memory_buffer)
#         answer = preprocessing_audio_file(audio_1d, hop_seconds = 2.5)
#         if answer == 1:
#             print("most probable voice ai ")
#             return {
#                 "success": True,
#                 "AI_Voice": 1,
#                 "Human_Voice": 0
#             }
#         return {
#             "success": True,
#             "AI_Voice": 0,
#             "Human_Voice": 1
#         }
#     except Exception as e:
#         print(f"some error occured: {e}")
#         raise HTTPException(
#             status_code= 500,
#             detail= "something went wrong in the server"
#         )

# @app.websocket("/ws/stream")
# async def check_real_audio(websocket: WebSocket):
#     await websocket.accept()
#     print("Websocket connection accpted with frontend")
#     #rolling buffer to hold 5sec chunk data
#     sample_rate = 16000
#     chunk_duration = 5
#     queue_size = sample_rate * chunk_duration
#     audio_buffer = deque(maxlen = queue_size)
#     try:
#         while True:
#             # receiving chunk of 1sec from the frontend
#             raw_bytes = await websocket.receive_bytes()
#             if "text" in raw_bytes:
#                 data = json.load(raw_bytes["text"])
#                 if data.get("action") == "STOP_RECORDING":
#                     print("User finished his speech")
#                     await websocket.send_json({
#                         "success": True,
#                         "AI_Voice": 0,
#                         "Human_Voice": 1
#                     })
#             audio_chunk = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
#             audio_buffer.extend(audio_chunk)
#             if len(audio_buffer) == queue_size:
#                 audio_bytes_array = np.array(audio_buffer, dtype= np.float32)
#                 answer = preprocessing_audio_file(audio_bytes_array,hop_seconds=2.5)
#                 if answer == 1:
#                     await websocket.send_json({
#                         "success": True,
#                         "AI_Voice": 1,
#                         "Human_Voice": 0
#                     })
#     except Exception as e:
#         if e == WebSocketDisconnect:
#             print("client discoonected")
#         else:
#             print(f"some error occured: {e}")
#         await websocket.close()


# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run("server:app", host = "0.0.0.0", port = 8000, reload = True)

import json
from collections import deque
import numpy as np
import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from converting_audio_file import convert_to_standard_audio
from checking_audio_file import preprocessing_audio_file

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/detect-audio")
async def check_audio_file(file: UploadFile = File(...)):
    try:
        total_read_bytes = 0
        max_file_size = 50 * 1024 * 1024  # 50MB
        chunk_size = 64 * 1024
        in_memory_buffer = bytearray()

        while chunk := await file.read(chunk_size):
            total_read_bytes += len(chunk)
            if total_read_bytes > max_file_size:
                raise HTTPException(status_code=413, detail="File exceeds maximum size of 50MB")
            in_memory_buffer.extend(chunk)

        audio_1d = convert_to_standard_audio(in_memory_buffer)
        answer = preprocessing_audio_file(audio_1d, hop_seconds=2.5)

        return {
            "success": True,
            "AI_Voice": 1 if answer == 1 else 0,
            "Human_Voice": 0 if answer == 1 else 1
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Server File Endpoint Error: {e}")
        raise HTTPException(status_code=500, detail="Failed processing audio upload")


@app.websocket("/ws/stream")
async def check_real_audio(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket connected with React frontend")

    sample_rate = 16000
    chunk_duration = 5
    queue_size = sample_rate * chunk_duration
    audio_buffer = deque(maxlen=queue_size)

    try:
        while True:
            message = await websocket.receive()

            # 1. PROCESS BINARY 16-BIT PCM AUDIO BUFFERS
            if "bytes" in message and message["bytes"]:
                raw_bytes = message["bytes"]

                # Convert binary Int16 buffer into normalized Float32
                # audio_chunk = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                audio_chunk = np.frombuffer(raw_bytes, dtype=np.float32).astype(np.float32) / 32768.0                
                audio_buffer.extend(audio_chunk)

                # Execute evaluation once 5 seconds of audio accumulates
                if len(audio_buffer) == queue_size:
                    audio_bytes_array = np.array(audio_buffer, dtype=np.float32)
                    answer = preprocessing_audio_file(audio_bytes_array, hop_seconds=2.5)

                    await websocket.send_json({
                        "success": True,
                        "verdict": "AI_CLONE" if answer == 1 else "HUMAN",
                        "AI_Voice": 1 if answer == 1 else 0,
                        "Human_Voice": 0 if answer == 1 else 1
                    })

            # 2. PROCESS JSON CONTROL COMMANDS
            elif "text" in message and message["text"]:
                try:
                    data = json.loads(message["text"])
                    if data.get("action") == "STOP_RECORDING":
                        print("Recording stopped by client")
                        await websocket.send_json({
                            "success": True,
                            "verdict": "HUMAN",
                            "AI_Voice": 0,
                            "Human_Voice": 1
                        })
                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        print("WebSocket client disconnected cleanly")
    except Exception as e:
        print(f"WebSocket execution error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)