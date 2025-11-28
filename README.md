
# Conversational AI Showcase

A high-fidelity, real-time multimodal conversational agent built with React and the Google GenAI SDK. This application demonstrates the power of the **Gemini Live API** by simulating a professional video meeting where the AI is an active, seeing, and hearing participant.

## 🌟 Key Features

*   **Real-Time Bi-Directional Audio:** Speak naturally with the AI. The application streams raw audio to Gemini and plays back the response with low latency, supporting interruptions and natural turn-taking.
*   **Visual Context (Screen Sharing):** Share your screen during the call. The AI receives video frames in real-time, allowing it to analyze code, review designs, or debug UIs alongside you.
*   **Role-Based Expert Personas:**
    *   **Principal Architect:** Reviews system designs and scalability.
    *   **Security Threat Modeller:** Analyzes architecture for vulnerabilities.
    *   **QA Engineer:** Discusses testing strategies and edge cases.
    *   **Custom Expert:** Define your own persona with custom system prompts.
*   **Hybrid Interface:** Seamlessly switch between voice conversation and text chat, with a unified real-time transcription log.
*   **Browser-Native:** Uses Web Audio API and WebRTC standards for a plugin-free experience.

*   <img width="1313" height="853" alt="image" src="https://github.com/user-attachments/assets/afee8c89-57a0-4afc-8bb0-ffff0a2b3c32" />
*   <img width="1402" height="853" alt="image" src="https://github.com/user-attachments/assets/6a10bf45-5c50-43d7-ae33-b83896d5ed46" />
*   <img width="1402" height="853" alt="image" src="https://github.com/user-attachments/assets/0484c4e5-96bf-4600-8dfe-3c30d49de9fe" />
*   <img width="1402" height="853" alt="image" src="https://github.com/user-attachments/assets/041ed9e2-d4e6-4aff-a612-469047684907" />
*   <img width="1402" height="853" alt="image" src="https://github.com/user-attachments/assets/e86be75c-9365-4dac-9728-a06c7761cd9c" />

## 🛠️ Technologies

*   **Frontend Framework:** React 19 (Vite)
*   **Styling:** Tailwind CSS
*   **AI SDK:** `@google/genai` (Gemini 2.5 Flash & Flash Lite models)
*   **Audio Processing:** Web Audio API (`ScriptProcessorNode`, `AudioContext`) for PCM streaming.

## 🚀 Setup & Installation

### 1. Clone the Repository
```bash
git clone <repository_url>
cd gemini-conversational-showcase
```

### 2. Install Dependencies
```bash
npm install
```

### 3. API Key Configuration (Crucial!)
This application requires a valid Google Cloud API Key with access to the **Gemini API**.

**Why do I need to provide a key?**
The Gemini Live API uses high-performance models that incur costs and usage limits. A user-provided key ensures proper billing attribution, security (so your key isn't exposed), and prevents rate-limiting issues.

**Option A: Environment Variable (Recommended for Local Dev)**
Create a `.env` file in the project root:
```env
VITE_API_KEY=your_google_cloud_api_key_here
```
*Ensure your build tool (Vite) is configured to expose this as `process.env.API_KEY`.*

**Option B: AI Studio / IDX**
If running inside Google AI Studio or Project IDX, the application includes a built-in key selection dialog (`window.aistudio`) that handles key injection automatically.

### 4. Run the Application
```bash
npm run dev
```
Open your browser to `http://localhost:5173` (or the port shown in your terminal).

## ⚠️ Troubleshooting

### "Network Error" / Connection Failed
If you encounter a **"Connection error: Error: Network error"** when adding an AI bot:
1.  **Check API Key:** Ensure `process.env.API_KEY` is set. The client will fail immediately without it.
2.  **Enable API:** Go to the Google Cloud Console and ensure the **"Generative Language API"** is enabled for your project.
3.  **Billing:** The Multimodal Live API (Gemini 2.5) may require a billing-enabled project.
4.  **Permissions:** Ensure microphone and camera permissions are granted.

### "Disconnected" when Screen Sharing
This usually happens if the screen resolution is too high for the real-time websocket connection. The app automatically downscales frames to 1024px width to prevent this, but if you still face issues, try sharing a specific window instead of the entire screen.

## 📖 Architecture Overview

### Audio Pipeline
*   **Input:** Microphone audio is captured at 16kHz via `AudioContext`. Raw PCM data is extracted using a `ScriptProcessorNode` and sent via WebSocket to the Gemini Live endpoint.
*   **Output:** Incoming audio chunks (Base64 PCM) are decoded and queued in an `AudioBufferSourceNode` sequence to ensure gapless playback.

### Visual Pipeline
*   **Screen Share:** When screen sharing is active, the `<video>` element is drawn to an off-screen `<canvas>` roughly once per second.
*   **Transmission:** These frames are converted to JPEG blobs and sent as `realtimeInput` to the model, providing it with continuous visual context.
