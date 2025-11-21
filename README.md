# Gemini Conversational AI Showcase

A high-fidelity React application demonstrating the capabilities of the **Google Gemini Live API**. This project serves as a reference implementation for building real-time, multimodal AI agents that can see, hear, and speak.

## 🚀 Features

*   **Real-Time Voice Interaction**: Utilizes WebSocket-based streaming for low-latency, bidirectional audio conversations with Gemini.
*   **Visual Context Awareness**: Supports screen sharing, where video frames are sampled and sent to the model, allowing the AI to analyze and discuss visual content (code, diagrams, UIs) in real-time.
*   **Persona System**: Includes pre-configured expert personas (Security Engineer, Software Architect, QA Lead) and allows for custom prompt configuration.
*   **Live Transcription**: Displays real-time speech-to-text logs for both the user and the AI.
*   **Audio Processing**: Implements raw PCM audio encoding/decoding and sample rate conversion for compatibility with the Gemini Live API.

## 🛠️ Tech Stack

*   **Frontend**: React 19, Vite, TypeScript
*   **Styling**: Tailwind CSS
*   **AI Integration**: `@google/genai` SDK (Gemini 2.5 Flash/Pro models)
*   **Audio/Video**: Web Audio API, MediaStream API, HTML5 Canvas (for frame extraction)

## 📋 Prerequisites

*   Node.js (v18 or higher)
*   A modern web browser (Chrome/Edge recommended for full Web Audio API support)
*   A valid **Google Cloud Project** with Gemini API access enabled.

## ⚙️ Installation

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd gemini-conversational-showcase
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    The application expects the API key to be handled via the `process.env.API_KEY` variable or the `window.aistudio` selection tool (if running within Google AI Studio environments).

    For local development, ensure your bundler injects the key or configure a `.env` file:
    ```env
    VITE_API_KEY=your_api_key_here
    ```
    *(Note: You may need to adjust the code in `MeetingRoom.tsx` to use `import.meta.env.VITE_API_KEY` if strictly using Vite env vars, or rely on the provided `window.aistudio` flow)*.

4.  **Run the development server**
    ```bash
    npm run dev
    ```

## 📖 Usage Guide

### 1. The Lobby
Upon launching, you will enter the Lobby.
*   **Permissions**: Grant access to your microphone and camera.
*   **API Key**: If prompted, select your Google Cloud Project API key.
*   **Join**: Enter your name and click "Join Now".

### 2. The Meeting Room
The main interface represents a video call.
*   **Add AI Expert**: Click the "+" button (or "Add AI Expert") to invite a bot.
    *   Select a specific role (e.g., *Lead Security Threat Modeller*).
    *   The AI will join and greet you.
*   **Voice Chat**: Speak naturally. The AI will listen and respond.
    *   Use the **Microphone** icon to mute/unmute yourself.
    *   Use the **Red Phone** icon to leave the call.
*   **Screen Sharing**: Click the **Screen Share** icon to present your screen to the AI.
    *   *Note:* The AI will automatically start receiving video frames of your shared screen and can answer questions about what is visible.
*   **Text Chat**: You can type messages in the sidebar if you prefer text or need to paste code snippets.

## 🧩 Architecture Highlights

### Audio Streaming
The app uses the `AudioContext` API to capture raw PCM data from the microphone. This data is downsampled (if necessary) and sent via the `LiveSession` connection. Incoming audio from the model is decoded from Base64 and played back using an `AudioBufferSourceNode` queue to ensure gapless playback.

### Video Streaming
Video is not sent as a continuous stream but as a sequence of images. When screen sharing is active, the app draws the `<video>` element to a hidden `<canvas>`, converts it to a JPEG Blob, and sends it to the model via `session.sendRealtimeInput` roughly once per second.

### Personas
Personas are defined in `constants.ts`. Each persona consists of a specific `systemInstruction` that primes the model's behavior, tone, and knowledge base before the conversation begins.

## 📄 License

MIT License
