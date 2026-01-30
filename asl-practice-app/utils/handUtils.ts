// src/utils/handUtils.ts

export type Landmark = { x: number; y: number; z: number };

export type RecordedSample = {
  label: string;
  timestamp_ms: number;
  handedness: 'Right' | 'Left';
  landmarks: Landmark[]; 
  raw_landmarks: Landmark[];
  confidence: number;
  session_id: string;
};

// Math Helper
export const getDistance = (p1: Landmark, p2: Landmark) => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
};

// MUST MATCH YOUR PYTHON CLASSES EXACTLY
export const ASL_CLASSES = ['A', 'B', 'C', 'D', 'E'];