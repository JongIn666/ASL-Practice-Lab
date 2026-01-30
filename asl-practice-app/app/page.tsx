'use client';

import { useEffect, useRef, useState } from 'react';
import RecordMode from '../components/RecordMode';
import TestMode from '../components/TestMode';

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  
  const [mode, setMode] = useState<'TESTING' | 'RECORDING'>('TESTING');

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            // Wait for video to be ready
            videoRef.current.onloadeddata = () => {
              setCameraReady(true);
            };
        }
      } catch (err) {
        console.error("Camera Error:", err);
      }
    };
    startCamera();
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <div className="absolute top-0 left-0 h-full w-full -scale-x-100 transform">
        <video ref={videoRef} autoPlay playsInline muted className="absolute h-full w-full object-cover" />
        <canvas ref={canvasRef} className="absolute h-full w-full object-cover" />
      </div>

      <div className="absolute top-6 right-6 z-50 flex gap-4">
        <button 
          onClick={() => setMode('TESTING')} 
          className={`rounded-lg px-6 py-2 font-bold transition shadow-lg backdrop-blur-md ${mode === 'TESTING' ? 'bg-blue-600/90 hover:bg-blue-500' : 'bg-gray-800/60 hover:bg-gray-700/60'}`}
        >
          Test Mode
        </button>
        <button 
          onClick={() => setMode('RECORDING')} 
          className={`rounded-lg px-6 py-2 font-bold transition shadow-lg backdrop-blur-md ${mode === 'RECORDING' ? 'bg-red-600/90 hover:bg-red-500' : 'bg-gray-800/60 hover:bg-gray-700/60'}`}
        >
          Record Mode
        </button>
      </div>

      {cameraReady && (
        mode === 'RECORDING' ? (
            <RecordMode videoRef={videoRef} canvasRef={canvasRef} />
        ) : (
            <TestMode videoRef={videoRef} canvasRef={canvasRef} />
        )
      )}
    </main>
  );
}