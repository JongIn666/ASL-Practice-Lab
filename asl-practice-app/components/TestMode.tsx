'use client';

import { useEffect, useRef, useState } from 'react';
import { ASL_CLASSES } from '../utils/handUtils';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function TestMode({ videoRef, canvasRef }: Props) {
  const [prediction, setPrediction] = useState<string>('--');
  const [confidence, setConfidence] = useState<number>(0);
  const [status, setStatus] = useState<string>('Loading Model...');

  const modelRef = useRef<any>(null);
  const tfRef = useRef<any>(null);

  const loadedRef = useRef<boolean>(false);
  const isMounted = useRef<boolean>(true);

  // NEW: prevent overlapping hands.send calls
  const sendingRef = useRef<boolean>(false);

  // NEW: invalidate old loops/async work on cleanup
  const runIdRef = useRef<number>(0);

  useEffect(() => {
    isMounted.current = true;

    runIdRef.current += 1;
    const runId = runIdRef.current;

    if (loadedRef.current) return;
    loadedRef.current = true;

    let hands: any = null;
    let animationFrameId: number | undefined;

    const startApp = async () => {
      try {
        console.log('Loading TensorFlow & MediaPipe...');

        // Load TF & Model
        const tf = await import('@tensorflow/tfjs');
        tfRef.current = tf;

        if (!isMounted.current || runId !== runIdRef.current) return;

        await tf.ready();
        const model = await tf.loadGraphModel('/model/model.json');
        modelRef.current = model;

        if (isMounted.current) setStatus('Ready');

        // Load MediaPipe
        const { Hands, HAND_CONNECTIONS } = await import('@mediapipe/hands');
        const { drawConnectors, drawLandmarks } = await import('@mediapipe/drawing_utils');

        if (!isMounted.current || runId !== runIdRef.current) return;

        hands = new Hands({
          locateFile: (file: string) => {
            // ✅ Most stable: serve assets locally (put files in public/mediapipe/hands/)
            // return `/mediapipe/hands/${file}`;
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`;


            // If you insist on CDN, use *exact* matching versions everywhere:
            // return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`;
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

          const canvas = canvasRef.current;
          const video = videoRef.current;
          if (!canvas || !video) return;

          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          if (video.videoWidth > 0 && canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const handedness = results.multiHandedness?.[0];
            const isRightHand = handedness?.label === 'Left'; // Mirror logic

            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
            drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1, radius: 3 });

            if (modelRef.current && isRightHand && tfRef.current) {
              const wrist = landmarks[0];
              const inputData: number[] = [];

              for (const p of landmarks) {
                inputData.push(p.x - wrist.x);
                inputData.push(p.y - wrist.y);
                inputData.push(p.z - wrist.z);
              }

              const tfLocal = tfRef.current;

              const predictionResult = tfLocal.tidy(() => {
                if (inputData.length !== 63) return null;

                const inputTensor = tfLocal.tensor2d([inputData], [1, 63]);
                const output = modelRef.current.predict(inputTensor);
                const resultTensor = Array.isArray(output) ? output[0] : output;

                return resultTensor ? resultTensor.dataSync() : null;
              });

              if (!predictionResult) return;

              let maxProb = 0;
              let maxIndex = 0;
              for (let i = 0; i < predictionResult.length; i++) {
                if (predictionResult[i] > maxProb) {
                  maxProb = predictionResult[i];
                  maxIndex = i;
                }
              }

              if (!isMounted.current || runId !== runIdRef.current) return;

              if (maxProb > 0.85) {
                setPrediction(ASL_CLASSES[maxIndex] || '?');
                setConfidence(maxProb);
              } else {
                setPrediction('??');
                setConfidence(maxProb);
              }
            }
          } else {
            setPrediction('--');
            setConfidence(0);
          }
        });

        const sendFrame = async () => {
          if (!isMounted.current || runId !== runIdRef.current) return;

          const video = videoRef.current;

          if (!video || video.readyState < 2 || video.paused || video.videoWidth === 0 || video.videoHeight === 0) {
            animationFrameId = requestAnimationFrame(sendFrame);
            return;
          }

          if (!sendingRef.current) {
            sendingRef.current = true;
            try {
              await hands.send({ image: video });
            } catch (e) {
              // console.error('hands.send failed:', e);
            } finally {
              sendingRef.current = false;
            }
          }

          animationFrameId = requestAnimationFrame(sendFrame);
        };

        sendFrame();
        console.log('Test Mode Loaded Successfully');
      } catch (err) {
        console.error('Initialization Error:', err);
        if (isMounted.current) setStatus('Error: Check Console');
      }
    };

    startApp();

    return () => {
      isMounted.current = false;

      runIdRef.current += 1;
      sendingRef.current = false;

      if (animationFrameId) cancelAnimationFrame(animationFrameId);

      if (hands) {
        try {
          hands.close();
        } catch (e) {
          console.error(e);
        }
      }

      loadedRef.current = false;
    };
  }, [videoRef, canvasRef]);

  return (
    <div className="absolute top-0 left-0 z-10 h-full w-full pointer-events-none p-6">
      <div className="absolute top-6 left-6 pointer-events-auto">
        <div className="bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-xl border border-white/10">
          <h1 className="font-bold text-lg">ASL Recognition</h1>
          <p className="text-xs text-gray-300">{status}</p>
        </div>
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform text-center">
        <div className="text-[12rem] font-bold drop-shadow-2xl leading-none text-white tracking-tighter">
          {prediction}
        </div>
        <div
          className={`text-xl font-bold px-4 py-1 rounded-full inline-block backdrop-blur-sm ${
            confidence > 0.85 ? 'bg-green-500/80 text-black' : 'bg-gray-800/80 text-gray-400'
          }`}
        >
          {Math.round(confidence * 100)}% Confidence
        </div>
      </div>
    </div>
  );
}
