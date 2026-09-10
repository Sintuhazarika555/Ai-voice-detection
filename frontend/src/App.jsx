// import React, { useState, useRef, useEffect } from 'react';
// import './App.css';

// const WEBSOCKET_URL = "ws://localhost:8000/ws/stream";
// const FILE_UPLOAD_URL = "http://localhost:8000/api/detect-audio";

// export default function ProxyPhoneVoiceDetector() {
//   const [selectedFile, setSelectedFile] = useState(null);
//   const [callState, setCallState] = useState("IDLE"); // IDLE, RINGING, CONNECTED
//   const [isProcessing, setIsProcessing] = useState(false);
//   const [result, setResult] = useState(null);
//   const [error, setError] = useState(null);
//   const [activeChunkCount, setActiveChunkCount] = useState(0);

//   // Hardware & WebAPI Audio Processing Refs
//   const socketRef = useRef(null);
//   const audioCtxRef = useRef(null);
//   const micStreamRef = useRef(null);
//   const processorRef = useRef(null);
//   const chunkCounterRef = useRef(0);

//   // Helper to safely format raw scores (supports both percentages like 95 or decimals like 0.95)
//   const formatScore = (val) => {
//     if (val === undefined || val === null) return "0.0";
//     const num = typeof val === 'string' ? parseFloat(val.replace('%', '')) : val;
//     return num <= 1 ? (num * 100).toFixed(1) : num.toFixed(1);
//   };

//   // WEBSOCKET INITIALIZATION
//   const setupWebSocket = () => {
//     return new Promise((resolve, reject) => {
//       try {
//         const socket = new WebSocket(WEBSOCKET_URL);
//         socketRef.current = socket;

//         socket.onopen = () => {
//           console.log("Connected to Python backend WebSocket stream");
//           resolve(socket);
//         };

//         socket.onmessage = (event) => {
//           try {
//             const data = JSON.parse(event.data);
//             setIsProcessing(false);
//             setResult({
//               verdict: data.verdict || data.prediction || "UNKNOWN",
//               ai_probability: data.ai_probability ?? data.AI_Voice ?? data.ai_score ?? 0,
//               human_probability: data.human_probability ?? data.Human_Voice ?? data.human_score ?? 0,
//               timestamp: new Date().toLocaleTimeString()
//             });
//           } catch (e) {
//             console.error("Failed to parse backend WS message:", e);
//           }
//         };

//         socket.onerror = (err) => {
//           console.error("WebSocket Error:", err);
//           setError("WebSocket connection failed. Ensure Python server is running.");
//           reject(err);
//         };

//         socket.onclose = () => {
//           console.log("WebSocket Disconnected");
//         };
//       } catch (err) {
//         console.error("WS Setup Error:", err);
//         reject(err);
//       }
//     });
//   };

//   const closeWebSocket = () => {
//     if (socketRef.current) {
//       if (socketRef.current.readyState === WebSocket.OPEN) {
//         socketRef.current.close();
//       }
//       socketRef.current = null;
//     }
//   };

//   // 1. FILE UPLOAD HANDLER
//   const handleSendAudioFile = async () => {
//     if (!selectedFile) {
//       setError("Please select an audio file first.");
//       return;
//     }

//     setError(null);
//     setResult(null);
//     setCallState("CONNECTED");
//     setIsProcessing(true);

//     const formData = new FormData();
//     formData.append("file", selectedFile);

//     try {
//       const response = await fetch(FILE_UPLOAD_URL, {
//         method: "POST",
//         body: formData,
//       });

//       if (!response.ok) {
//         throw new Error(`Server status: ${response.status}`);
//       }

//       const data = await response.json();

//       setIsProcessing(false);
//       setResult({
//         verdict: data.verdict || data.prediction || "UNKNOWN",
//         ai_probability: data.ai_probability ?? data.AI_Voice ?? data.ai_score ?? 0,
//         human_probability: data.human_probability ?? data.Human_Voice ?? data.human_score ?? 0,
//         timestamp: new Date().toLocaleTimeString(),
//       });
//     } catch (err) {
//       console.error("Audio Upload Error:", err);
//       setIsProcessing(false);
//       setError("Failed to upload audio file to backend server.");
//     }
//   };

//   // 2. LIVE AUDIO STREAMING ENGINE (RAW 16-BIT PCM BINARY BUFFER AT 16KHZ)
//   const startContinuousStream = async () => {
//     try {
//       // Create native Audio Context at 16kHz sample rate
//       const AudioContextClass = window.AudioContext || window.webkitAudioContext;
//       const audioCtx = new AudioContextClass({ sampleRate: 16000 });
//       audioCtxRef.current = audioCtx;

//       // Request microphone access
//       const stream = await navigator.mediaDevices.getUserMedia({
//         audio: {
//           sampleRate: 16000,
//           channelCount: 1,
//           echoCancellation: true,
//           noiseSuppression: true,
//         },
//       });
//       micStreamRef.current = stream;

//       const source = audioCtx.createMediaStreamSource(stream);
//       // Process PCM audio frames in buffer chunks of 4096 samples
//       const processor = audioCtx.createScriptProcessor(4096, 1, 1);
//       processorRef.current = processor;

//       chunkCounterRef.current = 0;

//       processor.onaudioprocess = (e) => {
//         if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
//           const float32Data = e.inputBuffer.getChannelData(0);
          
//           // Convert Float32 (-1.0 to 1.0) to 16-bit PCM Signed Integers
//           const pcm16 = new Int16Array(float32Data.length);
//           for (let i = 0; i < float32Data.length; i++) {
//             const s = Math.max(-1, Math.min(1, float32Data[i]));
//             pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
//           }

//           // Transmit raw binary ArrayBuffer over WebSocket
//           socketRef.current.send(pcm16.buffer);

//           chunkCounterRef.current += 1;
//           setActiveChunkCount(chunkCounterRef.current);

//           if (chunkCounterRef.current % 10 === 0) {
//             setIsProcessing(true);
//           }
//         }
//       };

//       source.connect(processor);
//       processor.connect(audioCtx.destination);

//     } catch (err) {
//       console.error("Microphone Capture Error:", err);
//       setError("Microphone permission denied or Web Audio API unsupported.");
//       endCall();
//     }
//   };

//   const stopContinuousStream = () => {
//     if (processorRef.current) {
//       processorRef.current.disconnect();
//       processorRef.current = null;
//     }

//     if (micStreamRef.current) {
//       micStreamRef.current.getTracks().forEach((track) => track.stop());
//       micStreamRef.current = null;
//     }

//     if (audioCtxRef.current) {
//       audioCtxRef.current.close();
//       audioCtxRef.current = null;
//     }
//   };

//   // CALL CONTROLLERS
//   const startCall = () => {
//     setError(null);
//     setResult(null);
//     setCallState("RINGING");
//   };

//   const acceptCall = async () => {
//     setCallState("CONNECTED");
//     try {
//       await setupWebSocket();
//       await startContinuousStream();
//     } catch (err) {
//       console.error("Error connecting call:", err);
//     }
//   };

//   const endCall = () => {
//     stopContinuousStream();
//     closeWebSocket();
//     setCallState("IDLE");
//     setIsProcessing(false);
//     setActiveChunkCount(0);
//     setResult(null);
//   };

//   useEffect(() => {
//     return () => {
//       stopContinuousStream();
//       closeWebSocket();
//     };
//   }, []);

//   return (
//     <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 font-sans">
//       <h1 className="text-xl md:text-2xl font-extrabold mb-6 text-slate-200">
//         Real-Time In-Call AI Voice Detection
//       </h1>

//       <div className="w-full max-w-4xl rounded-3xl p-6 relative flex flex-col items-center">
//         <div className="w-full rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative">
          
//           {/* PHONE 1: CALLER */}
//           <div>
//             <div className="text-center mb-2">
//               <h2 className="text-base font-bold text-slate-300">Caller (Device 1)</h2>
//             </div>

//             <div className="w-full md:w-72 h-120 bg-slate-900 rounded-[35px] p-4 border-4 border-slate-700 shadow-2xl flex flex-col justify-between">
//               <div className="w-20 h-3 bg-slate-800 rounded-full mx-auto mb-2"></div>

//               <div className="flex-1 flex flex-col justify-between py-2">
                
//                 {/* File Upload Option */}
//                 <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50 space-y-2">
//                   <label className="block text-[11px] font-medium text-slate-300">Use Audio File For Call</label>
//                   <input
//                     type="file"
//                     accept="audio/*"
//                     onChange={(e) => setSelectedFile(e.target.files[0])}
//                     className="block w-full text-[10px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:bg-blue-600 file:text-white cursor-pointer"
//                   />
//                   <button
//                     onClick={handleSendAudioFile}
//                     disabled={!selectedFile || callState === "CONNECTED"}
//                     className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 font-bold rounded-lg text-[11px] text-white transition flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
//                   >
//                     Send Audio File
//                   </button>
//                 </div>

//                 {/* CALL INTERFACE SECTION */}
//                 <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col items-center text-center space-y-3">
//                   <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-2xl border border-slate-700">
//                     🎙️
//                   </div>
//                   <div>
//                     <h3 className="font-bold text-sm text-slate-100">Receiver</h3>
//                     <p className="text-[10px] text-slate-400">
//                       {callState === "IDLE" && "Ready to Call"}
//                       {callState === "RINGING" && "Outgoing Call..."}
//                       {callState === "CONNECTED" && "Call Active"}
//                     </p>
//                   </div>

//                   {callState === "CONNECTED" && (
//                     <div className="flex items-center gap-1 text-[10px] text-emerald-400 animate-pulse">
//                       <span>Streaming PCM (16kHz)</span>
//                       <span>• #{activeChunkCount}</span>
//                     </div>
//                   )}

//                   {/* CALL BUTTON CONTROLS */}
//                   <div className="w-full pt-2">
//                     {callState === "IDLE" && (
//                       <button
//                         onClick={startCall}
//                         className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer"
//                       >
//                         Start Call
//                       </button>
//                     )}

//                     {callState !== "IDLE" && (
//                       <button
//                         onClick={endCall}
//                         className="w-full py-2 bg-red-600 hover:bg-red-500 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer"
//                       >
//                         End Call
//                       </button>
//                     )}
//                   </div>
//                 </div>

//               </div>

//               <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-1"></div>
//             </div>
//           </div>

//           {/* PHONE 2: RECEIVER */}
//           <div>
//             <div className="text-center mb-2">
//               <h2 className="text-base font-bold text-slate-300">Receiver (Device 2)</h2>
//             </div>

//             <div className="w-full md:w-72 h-120 bg-slate-900 rounded-[35px] p-4 border-4 border-slate-700 shadow-2xl flex flex-col justify-between">
//               <div className="w-20 h-3 bg-slate-800 rounded-full mx-auto mb-2"></div>

//               <div className="flex-1 flex flex-col justify-between py-2">
                
//                 {/* IDLE STATE */}
//                 {callState === "IDLE" && (
//                   <div className="flex-1 flex flex-col justify-center items-center text-center text-slate-500 text-xs">
//                     Phone Locked / Waiting for incoming call...
//                   </div>
//                 )}

//                 {/* INCOMING RINGING STATE */}
//                 {callState === "RINGING" && (
//                   <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
//                     <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center text-2xl animate-bounce">
//                       📲
//                     </div>
//                     <div>
//                       <h3 className="font-bold text-sm text-slate-100">Incoming Call</h3>
//                       <p className="text-[10px] text-slate-400">Caller ID: Unknown</p>
//                     </div>

//                     <div className="w-full flex gap-2">
//                       <button
//                         onClick={acceptCall}
//                         className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl text-xs text-white transition animate-pulse cursor-pointer"
//                       >
//                         Answer
//                       </button>
//                       <button
//                         onClick={endCall}
//                         className="flex-1 py-2 bg-red-600 hover:bg-red-500 font-bold rounded-xl text-xs text-white transition cursor-pointer"
//                       >
//                         Decline
//                       </button>
//                     </div>
//                   </div>
//                 )}

//                 {/* CONNECTED STATE & AI INSPECTION DISPLAY */}
//                 {callState === "CONNECTED" && (
//                   <div className="flex-1 flex flex-col justify-between space-y-2">
                    
//                     {/* Live Status Header */}
//                     <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex items-center justify-between px-3">
//                       <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
//                         ● Call Active
//                       </span>
//                       <button
//                         onClick={endCall}
//                         className="bg-red-600/80 hover:bg-red-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer"
//                       >
//                         End Call
//                       </button>
//                     </div>

//                     {/* AI Inspection Card */}
//                     <div className="flex-1 bg-slate-950 rounded-2xl border border-slate-800 p-3 flex flex-col justify-center items-center text-center">
//                       {isProcessing && (
//                         <div className="space-y-1.5">
//                           <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
//                           <p className="text-[10px] text-blue-400">Evaluating Audio Stream...</p>
//                         </div>
//                       )}

//                       {error && (
//                         <p className="text-red-400 text-[10px] bg-red-950/50 p-2 rounded-lg">{error}</p>
//                       )}

//                       {!isProcessing && !result && !error && (
//                         <p className="text-slate-500 text-[10px]">Listening to incoming audio stream...</p>
//                       )}

//                       {result && !isProcessing && (
//                         <div className="w-full space-y-2">
//                           <div className={`p-2 rounded-xl border ${
//                             result.verdict === "AI_CLONE" || result.verdict === "AI" || result.verdict === "FAKE"
//                               ? "bg-red-950/80 border-red-600 text-red-200 animate-pulse"
//                               : "bg-emerald-950/80 border-emerald-600 text-emerald-200"
//                           }`}>
//                             <div className="text-base mb-0.5">
//                               {result.verdict === "AI_CLONE" || result.verdict === "AI" || result.verdict === "FAKE" ? "🚨" : "🛡️"}
//                             </div>
//                             <h3 className="text-[10px] font-black uppercase">
//                               {result.verdict === "AI_CLONE" || result.verdict === "AI" || result.verdict === "FAKE"
//                                 ? "AI Impersonation Detected!"
//                                 : "Safe Human Call"}
//                             </h3>
//                           </div>

//                           <div className="text-left text-[10px] bg-slate-900 p-2 rounded-lg border border-slate-800 space-y-1">
//                             <div className="flex justify-between">
//                               <span className="text-slate-400">AI Confidence:</span>
//                               <span className="font-bold text-red-400">{formatScore(result.ai_probability)}%</span>
//                             </div>
//                             <div className="flex justify-between">
//                               <span className="text-slate-400">Human Confidence:</span>
//                               <span className="font-bold text-emerald-400">{formatScore(result.human_probability)}%</span>
//                             </div>
//                           </div>
//                         </div>
//                       )}
//                     </div>

//                     {/* Receiver Direct Hangup Button */}
//                     <button
//                       onClick={endCall}
//                       className="w-full py-1.5 bg-red-600 hover:bg-red-500 font-bold rounded-xl text-xs text-white transition flex items-center justify-center gap-1.5 cursor-pointer"
//                     >
//                       🔴 Hang Up
//                     </button>
//                   </div>
//                 )}

//               </div>

//               <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-1"></div>
//             </div>
//           </div>

//         </div>
//       </div>
//     </div>
//   );
// }


import React, { useState, useRef, useEffect } from 'react';

const WEBSOCKET_URL = "ws://localhost:8000/ws/stream";
const FILE_UPLOAD_URL = "http://localhost:8000/api/detect-audio";

export default function ProxyPhoneVoiceDetector() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [callState, setCallState] = useState("IDLE"); // IDLE, RINGING, CONNECTED
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeChunkCount, setActiveChunkCount] = useState(0);

  const socketRef = useRef(null);
  const audioCtxRef = useRef(null);
  const micStreamRef = useRef(null);
  const processorRef = useRef(null);
  const chunkCounterRef = useRef(0);

  const formatScore = (val) => {
    if (val === undefined || val === null) return "0.0";
    const num = typeof val === 'string' ? parseFloat(val.replace('%', '')) : val;
    return num <= 1 ? (num * 100).toFixed(1) : num.toFixed(1);
  };

  const setupWebSocket = () => {
    return new Promise((resolve, reject) => {
      try {
        const socket = new WebSocket(WEBSOCKET_URL);
        socketRef.current = socket;

        socket.onopen = () => {
          console.log("WebSocket stream connected");
          resolve(socket);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setIsProcessing(false);
            setResult({
              verdict: data.verdict || (data.AI_Voice === 1 ? "AI_CLONE" : "HUMAN"),
              ai_probability: data.AI_Voice ?? 0,
              human_probability: data.Human_Voice ?? 0,
              timestamp: new Date().toLocaleTimeString()
            });
          } catch (e) {
            console.error("Error parsing WS message:", e);
          }
        };

        socket.onerror = (err) => {
          setError("WebSocket connection failed. Ensure server is running on port 8000.");
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
    });
  };

  const closeWebSocket = () => {
    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
      socketRef.current = null;
    }
  };

  const handleSendAudioFile = async () => {
    if (!selectedFile) {
      setError("Please select an audio file first.");
      return;
    }

    setError(null);
    setResult(null);
    setCallState("CONNECTED");
    setIsProcessing(true);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(FILE_UPLOAD_URL, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const data = await response.json();

      setIsProcessing(false);
      setResult({
        verdict: data.AI_Voice === 1 ? "AI_CLONE" : "HUMAN",
        ai_probability: data.AI_Voice ?? 0,
        human_probability: data.Human_Voice ?? 0,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setIsProcessing(false);
      setError("Failed uploading audio file to server.");
    }
  };

  const startContinuousStream = async () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      micStreamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      chunkCounterRef.current = 0;

      processor.onaudioprocess = (e) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          const float32Data = e.inputBuffer.getChannelData(0);

          // Convert Float32 to Int16 PCM array
          const pcm16 = new Int16Array(float32Data.length);
          for (let i = 0; i < float32Data.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Data[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }

          // Transmit raw ArrayBuffer binary frame over WebSocket
          socketRef.current.send(pcm16.buffer);

          chunkCounterRef.current += 1;
          setActiveChunkCount(chunkCounterRef.current);

          if (chunkCounterRef.current % 10 === 0) {
            setIsProcessing(true);
          }
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
    } catch (err) {
      setError("Microphone permission denied or unsupported.");
      endCall();
    }
  };

  const stopContinuousStream = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  };

  const startCall = () => {
    setError(null);
    setResult(null);
    setCallState("RINGING");
  };

  const acceptCall = async () => {
    setCallState("CONNECTED");
    try {
      await setupWebSocket();
      await startContinuousStream();
    } catch (err) {
      console.error(err);
    }
  };

  const endCall = () => {
    stopContinuousStream();
    closeWebSocket();
    setCallState("IDLE");
    setIsProcessing(false);
    setActiveChunkCount(0);
    setResult(null);
  };

  useEffect(() => {
    return () => {
      stopContinuousStream();
      closeWebSocket();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 font-sans">
      <h1 className="text-xl md:text-2xl font-extrabold mb-6 text-slate-200">
        Real-Time In-Call AI Voice Detection
      </h1>

      <div className="w-full max-w-4xl rounded-3xl p-6 relative flex flex-col items-center">
        <div className="w-full rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative">
          
          {/* CALLER DEVICE */}
          <div className="w-full md:w-72 h-120 bg-slate-900 rounded-[35px] p-4 border-4 border-slate-700 shadow-2xl flex flex-col justify-between">
            <div className="w-20 h-3 bg-slate-800 rounded-full mx-auto mb-2"></div>
            <div className="flex-1 flex flex-col justify-between py-2">
              <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50 space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">Use Audio File For Call</label>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                  className="block w-full text-[10px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:bg-blue-600 file:text-white cursor-pointer"
                />
                <button
                  onClick={handleSendAudioFile}
                  disabled={!selectedFile || callState === "CONNECTED"}
                  className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 font-bold rounded-lg text-[11px] text-white transition cursor-pointer"
                >
                  Send Audio File
                </button>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col items-center text-center space-y-3">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-2xl border border-slate-700">🎙️</div>
                <h3 className="font-bold text-sm text-slate-100">Caller</h3>
                {callState === "IDLE" && (
                  <button onClick={startCall} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl text-xs transition cursor-pointer">
                    Start Call
                  </button>
                )}
                {callState !== "IDLE" && (
                  <button onClick={endCall} className="w-full py-2 bg-red-600 hover:bg-red-500 font-bold rounded-xl text-xs transition cursor-pointer">
                    End Call
                  </button>
                )}
              </div>
            </div>
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-1"></div>
          </div>

          {/* RECEIVER DEVICE */}
          <div className="w-full md:w-72 h-120 bg-slate-900 rounded-[35px] p-4 border-4 border-slate-700 shadow-2xl flex flex-col justify-between">
            <div className="w-20 h-3 bg-slate-800 rounded-full mx-auto mb-2"></div>
            <div className="flex-1 flex flex-col justify-between py-2">
              {callState === "IDLE" && (
                <div className="flex-1 flex items-center justify-center text-center text-slate-500 text-xs">
                  Waiting for incoming call...
                </div>
              )}

              {callState === "RINGING" && (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center text-2xl animate-bounce">📲</div>
                  <div className="w-full flex gap-2">
                    <button onClick={acceptCall} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl text-xs text-white cursor-pointer">Answer</button>
                    <button onClick={endCall} className="flex-1 py-2 bg-red-600 hover:bg-red-500 font-bold rounded-xl text-xs text-white cursor-pointer">Decline</button>
                  </div>
                </div>
              )}

              {callState === "CONNECTED" && (
                <div className="flex-1 flex flex-col justify-between space-y-2">
                  <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex items-center justify-between px-3">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">● Call Active</span>
                  </div>

                  <div className="flex-1 bg-slate-950 rounded-2xl border border-slate-800 p-3 flex flex-col justify-center items-center text-center">
                    {isProcessing && <p className="text-[10px] text-blue-400">Evaluating Stream...</p>}
                    {error && <p className="text-red-400 text-[10px]">{error}</p>}
                    {result && !isProcessing && (
                      <div className="w-full space-y-2">
                        <div className={`p-2 rounded-xl border ${result.verdict === "AI_CLONE" ? "bg-red-950/80 border-red-600 text-red-200" : "bg-emerald-950/80 border-emerald-600 text-emerald-200"}`}>
                          <h3 className="text-[10px] font-black uppercase">{result.verdict === "AI_CLONE" ? "🚨 AI Voice Detected!" : "🛡️ Safe Human Call"}</h3>
                        </div>
                      </div>
                    )}
                  </div>

                  <button onClick={endCall} className="w-full py-1.5 bg-red-600 hover:bg-red-500 font-bold rounded-xl text-xs text-white cursor-pointer">🔴 Hang Up</button>
                </div>
              )}
            </div>
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-1"></div>
          </div>

        </div>
      </div>
    </div>
  );
}