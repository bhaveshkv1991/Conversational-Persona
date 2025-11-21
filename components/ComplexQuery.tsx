
import React, { useState, useRef, useEffect } from 'react';
import type { MeetingConfig } from '../types';

// Fix: The `AIStudio` interface was defined locally in the module, which can cause type conflicts
// if other files also augment the global `Window` object. Moving the interface declaration
// inside `declare global` makes `AIStudio` a single, globally-scoped type, resolving the error.
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}


const Lobby: React.FC<{ onJoin: (config: MeetingConfig) => void }> = ({ onJoin }) => {
  const [userName, setUserName] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [isKeySelected, setIsKeySelected] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isJoiningRef = useRef(false);

  const checkApiKey = async () => {
    setIsCheckingKey(true);
    try {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setIsKeySelected(hasKey);
      } else {
          console.warn("aistudio API key selection tool not found. Assuming key is provided.");
          setIsKeySelected(true); 
      }
    } catch (e) {
      console.error("Error checking API key status:", e);
      setIsKeySelected(false);
    } finally {
      setIsCheckingKey(false);
    }
  };

  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { noiseSuppression: true, echoCancellation: true } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setMediaError('');
      } catch (err) {
        console.error("Error accessing media devices.", err);
        setMediaError('Camera and microphone access is required to join. Please enable permissions and refresh.');
      }
    };
    getMedia();
    checkApiKey();

    return () => {
      // Only stop tracks if we are NOT joining the meeting.
      // If we are joining, we pass the stream to the next component.
      if (!isJoiningRef.current) {
          streamRef.current?.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleSelectKey = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        // Optimistically set to true to bypass race condition and allow user to proceed.
        setIsKeySelected(true);
      }
    } catch (e) {
      console.error("Could not open API key selection dialog:", e);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) return;
    
    isJoiningRef.current = true;
    onJoin({
      userName,
      stream: streamRef.current || undefined
    });
  };

  const renderContent = () => {
    if (isCheckingKey) {
        return (
            <div className="text-center text-zinc-400 h-28 flex items-center justify-center">
                <p>Checking API key status...</p>
            </div>
        );
    }
    
    if (!isKeySelected) {
        return (
            <div className="text-center">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">API Key Required</h1>
                <p className="text-zinc-400 mt-4 mb-6">
                    This feature requires a user-provided API key. Please select a key to continue.
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-1">
                        Learn about billing
                    </a>.
                </p>
                <button
                    onClick={handleSelectKey}
                    className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-500 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-950 focus:ring-blue-500"
                >
                    Select API Key
                </button>
            </div>
        );
    }

    return (
        <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Ready to join?</h1>
            <form onSubmit={handleJoin} className="space-y-4 mt-6">
                <div>
                  <label htmlFor="name" className="sr-only">Your Name</label>
                  <input
                      type="text"
                      id="name"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-200"
                  />
                </div>
                <button
                    type="submit"
                    disabled={!userName.trim() || !!mediaError}
                    className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-500 disabled:bg-zinc-600 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-950 focus:ring-blue-500"
                >
                    Join now
                </button>
            </form>
        </div>
    );
  }

  return (
    <div className="flex-grow flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center shadow-2xl ring-1 ring-zinc-800">
            {mediaError ? (
              <div className="text-center text-red-400 p-4">
                <p>{mediaError}</p>
              </div>
            ) : (
              <video ref={videoRef} autoPlay muted className="w-full h-full object-cover"></video>
            )}
        </div>
        {renderContent()}
      </div>
    </div>
  );
};

export default Lobby;
