'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Landmark, RecordedSample, getDistance } from '../utils/handUtils';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function RecordMode({ videoRef, canvasRef }: Props) {
  const [status, setStatus] = useState<string>('Initializing Recorder...');
  const [targetLabel, setTargetLabel] = useState<string>('A');
  const [recordedSamples, setRecordedSamples] = useState<RecordedSample[]>([]);
  const [isStable, setIsStable] = useState<boolean>(false);

  // Refs
  const lastLandmarksRef = useRef<Landmark[] | null>(null);
  const stabilityCounterRef = useRef<number>(0);
  const latestResultsRef = useRef<any>(null);
  const sessionID = useRef<string>(`session_${Date.now()}`);

  // Lifecycle Guards
  const loadedRef = useRef<boolean>(false);
  const isMounted = useRef<boolean>(true);

  // NEW: prevent overlapping hands.send calls (single-flight)
  const sendingRef = useRef<boolean>(false);

  // NEW: invalidate old loops/async work on cleanup
  const runIdRef = useRef<number>(0);

  // --- CAPTURE LOGIC ---
  const attemptCapture = useCallback(() => {
    const results = latestResultsRef.current;
    if (!results?.multiHandLandmarks?.length) {
      setStatus('Error: No hand detected!');
      return;
    }

    const handednessLog = results.multiHandedness?.[0];
    const isRightHand = handednessLog?.label === 'Left'; // Mirror logic

    if (!isRightHand) {
      setStatus('Error: Use RIGHT Hand Only!');
      return;
    }
    if (stabilityCounterRef.current < 5) {
      setStatus('Error: Hand is moving too much!');
      return;
    }

    const rawLandmarks = results.multiHandLandmarks[0];
    const wrist = rawLandmarks[0];

    const normalizedLandmarks = rawLandmarks.map((p: any) => ({
      x: p.x - wrist.x,
      y: p.y - wrist.y,
      z: p.z - wrist.z,
    }));

    const newSample: RecordedSample = {
      label: targetLabel,
      timestamp_ms: Date.now(),
      handedness: 'Right',
      landmarks: normalizedLandmarks,
      raw_landmarks: rawLandmarks,
      confidence: handednessLog?.score ?? 0,
      session_id: sessionID.current,
    };

    setRecordedSamples((prev) => [...prev, newSample]);
    setStatus(`Saved "${targetLabel}"!`);
  }, [targetLabel]);

  // --- KEYBOARD LISTENER ---
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        attemptCapture();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [attemptCapture]);

  // --- MEDIAPIPE INITIALIZATION ---
  useEffect(() => {
    isMounted.current = true;

    // Invalidate any previous run (important in dev/StrictMode patterns)
    runIdRef.current += 1;
    const runId = runIdRef.current;

    if (loadedRef.current) return;
    loadedRef.current = true;

    let hands: any = null;
    let animationFrameId: number | undefined;

    const startApp = async () => {
      try {
        console.log('Loading MediaPipe Hands...');
        const { Hands, HAND_CONNECTIONS } = await import('@mediapipe/hands');
        const { drawConnectors, drawLandmarks } = await import('@mediapipe/drawing_utils');

        if (!isMounted.current || runId !== runIdRef.current) return;

        hands = new Hands({
          locateFile: (file: string) => {
            // ✅ Most stable: serve assets locally (put files in public/mediapipe/hands/)
            // return `/mediapipe/hands/${file}`;

            // If you insist on CDN, use *exact* matching versions everywhere:
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`;
          },
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        hands.onResults((results: any) => {
          if (!isMounted.current || runId !== runIdRef.current) return;

          latestResultsRef.current = results;

          const canvas = canvasRef.current;
          const video = videoRef.current;
          if (!canvas || !video) return;

          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // Sync Canvas Size
          if (video.videoWidth > 0 && canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const handedness = results.multiHandedness?.[0];
            const isRightHand = handedness?.label === 'Left';

            // Wrong Hand UI overlay
            if (!isRightHand) {
              ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = 'white';
              ctx.font = 'bold 40px Arial';
              ctx.fillText('WRONG HAND', 50, canvas.height / 2);
            }

            // Stability Check
            if (lastLandmarksRef.current) {
              const movement = landmarks.reduce((sum: number, point: any, index: number) => {
                return sum + getDistance(point, lastLandmarksRef.current![index]);
              }, 0);

              if (movement < 0.8) stabilityCounterRef.current++;
              else stabilityCounterRef.current = 0;
            }

            lastLandmarksRef.current = landmarks;

            const stableNow = stabilityCounterRef.current > 10;
            // avoid setting state when unmounted
            if (isMounted.current) setIsStable(stableNow);

            // Draw Skeleton
            const connectorColor = stableNow ? '#00FF00' : '#FFFFFF';
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: connectorColor, lineWidth: 2 });
            drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1, radius: 3 });
          }
        });

        const sendFrame = async () => {
          if (!isMounted.current || runId !== runIdRef.current) return;

          const video = videoRef.current;

          // If video isn't ready yet, keep looping without calling hands.send
          if (!video || video.readyState < 2 || video.paused || video.videoWidth === 0 || video.videoHeight === 0) {
            animationFrameId = requestAnimationFrame(sendFrame);
            return;
          }

          // ✅ Single-flight: never overlap hands.send
          if (!sendingRef.current) {
            sendingRef.current = true;
            try {
              await hands.send({ image: video });
            } catch (e) {
              // If this throws during mode switch, the runId guard will prevent future damage
              // console.error('hands.send failed:', e);
            } finally {
              sendingRef.current = false;
            }
          }

          animationFrameId = requestAnimationFrame(sendFrame);
        };

        // Start Loop
        sendFrame();
        if (isMounted.current) setStatus('Ready. Press SPACE to capture.');
      } catch (err) {
        console.error('MediaPipe Error:', err);
        if (isMounted.current) setStatus('System Error: Check Console');
      }
    };

    startApp();

    // CLEANUP
    return () => {
      isMounted.current = false;

      // Invalidate any in-flight async + loop
      runIdRef.current += 1;
      sendingRef.current = false;

      if (animationFrameId) cancelAnimationFrame(animationFrameId);

      if (hands) {
        try {
          hands.close();
        } catch (e) {
          console.error('Cleanup error', e);
        }
      }

      loadedRef.current = false;
    };
  }, [videoRef, canvasRef]);

  // --- DOWNLOAD HELPER ---
  const downloadData = () => {
    const jsonlContent = recordedSamples.map((s) => JSON.stringify(s)).join('\n');
    const blob = new Blob([jsonlContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asl_data_${targetLabel}_${Date.now()}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute top-0 left-0 z-10 flex h-full w-full flex-col pointer-events-none p-6">
      <div className="absolute top-6 left-6 pointer-events-auto">
        <div className="bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-xl border border-white/10">
          <h1 className="font-bold text-lg">ASL Collector</h1>
          <p className="text-xs text-gray-300">{status}</p>
        </div>
      </div>

      <div className="mt-auto mb-10 flex w-full flex-col items-center gap-6 pointer-events-auto">
        <div className="flex items-center gap-6 rounded-xl bg-black/70 p-6 backdrop-blur-md border border-white/10">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Target</label>
            <input
              type="text"
              maxLength={1}
              value={targetLabel}
              onChange={(e) => setTargetLabel(e.target.value.toUpperCase())}
              className="w-16 rounded border border-gray-600 bg-gray-800 p-2 text-center text-3xl font-bold text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="h-12 w-px bg-gray-600"></div>

          <div className="flex flex-col text-center min-w-[80px]">
            <span className="text-4xl font-bold text-blue-400">{recordedSamples.length}</span>
            <span className="text-xs text-gray-400">Samples</span>
          </div>

          <div className="h-12 w-px bg-gray-600"></div>

          <button
            onClick={attemptCapture}
            disabled={!isStable}
            className="rounded-lg bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition"
          >
            CAPTURE
          </button>

          <button
            onClick={downloadData}
            disabled={recordedSamples.length === 0}
            className="rounded-lg bg-green-600 px-6 py-3 font-bold text-white hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition"
          >
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
}
