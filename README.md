# ASL Alphabet Practice (Web) — Real-Time Fingerspelling Feedback

A web-based American Sign Language (ASL) alphabet practice tool that uses your laptop camera to detect your hand, extract 21 hand landmarks in real time, and recognize fingerspelled letters directly in the browser. Users can practice with instant visual feedback and (optionally) collect training data via a dedicated recording mode.

Privacy-friendly: all hand tracking + inference runs locally in your browser. No camera video is uploaded.

---

## Features

- **Real-time hand tracking** using MediaPipe Hands (21 landmarks)
- **In-browser inference** using a lightweight TensorFlow.js model
- **Two modes**
  - **Test Mode**: Live letter recognition with confidence display
  - **Record Mode**: Collect normalized landmark samples and export to JSONL for offline training
- **Fast feedback loop** for ASL students, self-learners, and educators

---

## Needs work on

- **A-E** currently my model only works on hand sign from A-E
- **static motion** My model takes in static motion. Some ASL sign includes dynamatic movement like J and Z.
- **right hand** The model shows inconsistency between right hand and left hand. Greater accuracy for right hand.

---

## Tech Stack

- **Next.js + React + TypeScript**
- **Tailwind CSS**
- **MediaPipe Hands** for landmark detection
- **TensorFlow.js** for running the classifier in the browser

---

## Getting Started

### Prerequisites
- Node.js (recommended: LTS)
- A webcam (laptop camera is fine)

### Install
```bash
npm install
