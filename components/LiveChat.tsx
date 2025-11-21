
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality, LiveSession, Chat, type LiveServerMessage, type Blob } from '@google/genai';
import { decode, encode, decodeAudioData } from '../services/audioUtils';
import { MicIcon, MicSlashIcon, PhoneIcon, BotIcon, PlusIcon, XIcon, SendIcon, ScreenShareIcon } from './icons/Icons';
import type { MeetingConfig, ConversationEntry, BotState, Persona, ChatMessage } from '../types';
import { PERSONAS } from '../constants';
import { MarkdownRenderer } from './MarkdownRenderer';

const blobToBase64 = (blob: globalThis.Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
}

const AddBotModal: React.FC<{ onAdd: (config: { persona: Persona; systemPrompt: string }) => void; onCancel: () => void; }> = ({ onAdd, onCancel }) => {
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);
  const [customPrompt, setCustomPrompt] = useState(PERSONAS[0].systemPrompt);
  const [customName, setCustomName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setCustomPrompt(selectedPersona.systemPrompt);
    setCustomName('');
    setError('');
  }, [selectedPersona]);

  const handleAdd = () => {
    if (selectedPersona.id === 'custom' && !customName.trim()) {
      setError('Custom expert name is required.');
      return;
    }
    setError('');

    const finalPersona = selectedPersona.id === 'custom'
      ? { ...selectedPersona, name: customName.trim() }
      : selectedPersona;

    onAdd({ persona: finalPersona, systemPrompt: customPrompt });
  };

  return (
    <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 p-8 rounded-lg w-full max-w-lg space-y-6 shadow-2xl">
        <h2 className="text-2xl font-bold text-white">Add AI Expert to Call</h2>
        <div>
          <label htmlFor="persona" className="block text-sm font-medium text-gray-300 mb-1">AI Expert Persona</label>
          <select id="persona" value={selectedPersona.id} onChange={(e) => setSelectedPersona(PERSONAS.find(p => p.id === e.target.value) || PERSONAS[0])} className="w-full p-3 bg-zinc-800 border border-zinc-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-200">
            {PERSONAS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {selectedPersona.id === 'custom' && (
            <div>
                 <label htmlFor="customName" className="block text-sm font-medium text-gray-300 mb-1">AI Expert Name</label>
                 <input
                    id="customName"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full p-3 bg-zinc-800 border border-zinc-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-200"
                    placeholder="e.g., Lead Frontend Developer"
                 />
                 {error && <p className="text-red-400 text-sm mt-1">{error}</p>}
            </div>
        )}
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-1">Customize AI Instructions</label>
          <textarea id="prompt" value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} rows={4} className="w-full p-3 bg-zinc-800 border border-zinc-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-200 resize-none" />
        </div>
        <div className="flex justify-end space-x-4">
          <button onClick={onCancel} className="px-4 py-2 bg-zinc-700 text-white font-semibold rounded-md hover:bg-zinc-600 transition-colors">Cancel</button>
          <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-500 transition-colors">Add to Call</button>
        </div>
      </div>
    </div>
  );
};


const MeetingRoom: React.FC<{ config: MeetingConfig; onLeave: () => void }> = ({ config, onLeave }) => {
  const [botConfig, setBotConfig] = useState<{ persona: Persona; systemPrompt: string } | null>(null);
  const [showAddBotModal, setShowAddBotModal] = useState(false);
  const [botState, setBotState] = useState<BotState>('listening');
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const userStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const frameIntervalRef = useRef<number | null>(null);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const chatRef = useRef<Chat | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());


  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationHistory]);
  
  const stopFrameSending = useCallback(() => {
    if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
    }
  }, []);

  const stopConversation = useCallback(async () => {
    stopFrameSending();
    if (sourcesRef.current) {
        for (const source of sourcesRef.current.values()) {
            source.stop();
        }
        sourcesRef.current.clear();
    }
    nextStartTimeRef.current = 0;
    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
      } catch (e) { console.error('Error closing session:', e); }
      sessionPromiseRef.current = null;
    }
    if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
    if (mediaStreamSourceRef.current) mediaStreamSourceRef.current.disconnect();
    if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
    if (outputAudioContextRef.current?.state !== 'closed') outputAudioContextRef.current?.close();
    chatRef.current = null;
  }, [stopFrameSending]);
  
  const handleAddBot = (botJoinConfig: { persona: Persona, systemPrompt: string }) => {
    setBotConfig(botJoinConfig);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    chatRef.current = ai.chats.create({
      model: 'gemini-flash-lite-latest',
      config: { systemInstruction: botJoinConfig.systemPrompt },
    });
    setShowAddBotModal(false);
  };
  
  const handleRemoveBot = useCallback(() => {
    stopConversation();
    setBotConfig(null);
    setConversationHistory([]);
    setBotState('listening');
  }, [stopConversation]);

  const startFrameSending = useCallback(() => {
    stopFrameSending(); // Ensure no multiple intervals running
    frameIntervalRef.current = window.setInterval(() => {
      if (!screenVideoRef.current || screenVideoRef.current.paused || screenVideoRef.current.ended || !sessionPromiseRef.current) return;
      
      const video = screenVideoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
          if (blob) {
              try {
                  const base64Data = await blobToBase64(blob);
                  const session = await sessionPromiseRef.current;
                  if (session) {
                    session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'image/jpeg' } });
                  }
              } catch (err) { 
                  console.error("Error processing/sending frame:", err);
                  stopFrameSending();
              }
          }
      }, 'image/jpeg', 0.8);
    }, 1000); // 1 frame per second
  }, [stopFrameSending]);

  const startConversation = useCallback(async (stream: MediaStream, systemPrompt: string) => {
    if (sessionPromiseRef.current) await stopConversation();
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    const conversationalStylePrompt = `Speak just like a real person—warm, natural, and clear. Use simple language and avoid technical jargon unless the user uses it first. Be concise; don’t stretch the discussion or add unnecessary details. Stay focused on what the user asks. When needed, ask short clarifying questions. Keep the conversation smooth, friendly, and human-like.`;

    const meetingBehaviorPrompt = `You are a helpful AI assistant in a meeting. Your goal is to be a seamless, helpful participant. Listen to the user and continuously observe their screen when they are sharing. Proactively use the visual information from the screen as context for your responses without waiting for the user to tell you to look. Respond directly and conversationally when the user speaks to you or when you have a relevant insight based on the conversation or the shared screen. Be proactive but not interruptive. Keep your responses concise and to the point.`;
    
    const systemInstruction = `${systemPrompt} ${conversationalStylePrompt} ${meetingBehaviorPrompt}`;

    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    sessionPromiseRef.current = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: { responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {}, systemInstruction },
      callbacks: {
        onopen: () => {
          console.log('Connection opened.');
          if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
          const source = audioContextRef.current!.createMediaStreamSource(stream);
          mediaStreamSourceRef.current = source;
          const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
          scriptProcessorRef.current = scriptProcessor;
          scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
            const pcmBlob: Blob = createBlob(inputData);
            sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(audioContextRef.current.destination); // Required for onaudioprocess to fire in all browsers
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.outputTranscription) {
              setBotState('speaking');
              currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
          } else if (message.serverContent?.inputTranscription) {
            currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
          }

          if (message.serverContent?.turnComplete) {
            const fullInput = currentInputTranscriptionRef.current.trim();
            const fullOutput = currentOutputTranscriptionRef.current.trim();
            if (fullInput) setConversationHistory(prev => [...prev, { type: 'transcription', speaker: 'user', text: `You (Spoken): ${fullInput}` }]);
            if (fullOutput) setConversationHistory(prev => [...prev, { type: 'transcription', speaker: 'model', text: `AI (Spoken): ${fullOutput}` }]);
            currentInputTranscriptionRef.current = '';
            currentOutputTranscriptionRef.current = '';
            setBotState('listening');
          }

          if (message.serverContent?.interrupted) {
            for (const source of sourcesRef.current.values()) {
              source.stop();
            }
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
          }

          const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64Audio && outputAudioContextRef.current) {
            const audioCtx = outputAudioContextRef.current;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
            const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtx.destination);
            source.addEventListener('ended', () => {
              sourcesRef.current.delete(source);
            });
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            sourcesRef.current.add(source);
          }
        },
        onerror: (e: ErrorEvent) => { 
          console.error('Connection error:', e);
          alert('Failed to connect to the AI service. This could be due to a network issue or an invalid API key. Please check your connection and API key, then try joining again.');
          onLeave();
        },
        onclose: (e: CloseEvent) => { console.log('Connection closed.'); },
      },
    });
  }, [handleRemoveBot, stopConversation, onLeave]);
  
  useEffect(() => {
    if (isSharingScreen && botConfig) {
        sessionPromiseRef.current?.then(() => {
            startFrameSending();
        });
    } else {
      stopFrameSending();
    }
    return () => {
        stopFrameSending();
    };
}, [isSharingScreen, botConfig, startFrameSending, stopFrameSending]);

  useEffect(() => {
    let localStream: MediaStream | null = null;

    const initMedia = async () => {
        try {
            if (config.stream) {
                localStream = config.stream;
            } else {
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { noiseSuppression: true, echoCancellation: true } });
            }
            
            userStreamRef.current = localStream;
            if (videoRef.current) videoRef.current.srcObject = localStream;
        } catch (err) {
            console.error("Error accessing media devices.", err);
            alert('Failed to access camera and microphone. Please ensure permissions are granted and try again.');
            onLeave();
        }
    };

    initMedia();
      
    return () => {
        stopConversation();
        // If we requested the stream locally (not passed via config), or if we assume ownership, we stop it.
        // Since Lobby passes it and expects MeetingRoom to "take over", we stop it here on unmount.
        localStream?.getTracks().forEach(track => track.stop());
    };
  }, [stopConversation, onLeave, config.stream]);

  useEffect(() => {
      if (botConfig && userStreamRef.current) {
          startConversation(userStreamRef.current, botConfig.systemPrompt);
      }
  }, [botConfig, startConversation]);

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading || !chatRef.current) return;

    const userMessage: ChatMessage = { type: 'chat', role: 'user', text: chatInput };
    setConversationHistory(prev => [...prev, userMessage]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const stream = await chatRef.current.sendMessageStream({ message: chatInput });
      let fullResponse = '';
      setConversationHistory(prev => [...prev, { type: 'chat', role: 'model', text: '...' }]);
      for await (const chunk of stream) {
        fullResponse += chunk.text;
        setConversationHistory(prev => {
            const newHistory = [...prev];
            const lastMessage = newHistory[newHistory.length - 1];
            if(lastMessage.type === 'chat' && lastMessage.role === 'model') {
                lastMessage.text = fullResponse;
            }
            return newHistory;
        });
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setConversationHistory(prev => [...prev, { type: 'chat', role: 'model', text: 'Sorry, I encountered an error.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const toggleMute = () => {
    if (userStreamRef.current) {
        const isCurrentlyMuted = !userStreamRef.current.getAudioTracks()[0].enabled;
        userStreamRef.current.getAudioTracks().forEach(track => track.enabled = isCurrentlyMuted);
        setIsMuted(!isCurrentlyMuted);
        
        // Mute the local script processor to prevent echo
        if (audioContextRef.current && scriptProcessorRef.current) {
            const gainNode = audioContextRef.current.createGain();
            gainNode.gain.setValueAtTime(isCurrentlyMuted ? 1 : 0, audioContextRef.current.currentTime);
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current.connect(gainNode);
            gainNode.connect(audioContextRef.current.destination);
        }
    }
  };
  
  const handleToggleScreenShare = async () => {
    if (isSharingScreen) {
        screenStreamRef.current?.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
        if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
        setIsSharingScreen(false);
    } else {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
            stream.getVideoTracks()[0].onended = () => {
              setIsSharingScreen(false);
              screenStreamRef.current = null;
              if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
            };
            screenStreamRef.current = stream;
            if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
            setIsSharingScreen(true);
        } catch (err) {
            console.error("Error starting screen share:", err);
            setIsSharingScreen(false);
            if (err instanceof Error && err.name === 'NotAllowedError') {
                alert('Screen sharing permission was denied. To share your screen, please grant permission when prompted.');
            } else {
                alert('An unexpected error occurred while trying to start screen sharing.');
            }
        }
    }
  };

  const botBorderClass = botState === 'speaking' 
    ? 'ring-2 ring-green-500' 
    : 'ring-1 ring-zinc-700';

  const botStatusColor = botState === 'speaking' ? 'bg-green-500' : 'bg-blue-500';

  const getBotStatusText = () => {
    if (isSharingScreen && botState === 'listening') return 'Analyzing Screen';
    if (botState === 'hand_raised') return 'Hand Raised';
    return botState.charAt(0).toUpperCase() + botState.slice(1);
  };
  const botStatusText = getBotStatusText();

  const participantCount = 1 + (botConfig ? 1 : 0);

  return (
    <div className="flex h-full w-full bg-zinc-950 relative overflow-hidden">
      {showAddBotModal && <AddBotModal onAdd={handleAddBot} onCancel={() => setShowAddBotModal(false)} />}
      
      <div className="flex-grow flex flex-col relative">
         <div className="flex-grow flex items-center justify-center p-4 relative">
            {isSharingScreen ? (
              <div className="w-full h-full bg-black rounded-lg overflow-hidden relative">
                  <video ref={screenVideoRef} autoPlay className="w-full h-full object-contain" />
                  {/* Pinned participants */}
                  <div className="absolute top-4 right-4 w-48 lg:w-56 space-y-2">
                      <div className="bg-zinc-900 rounded-lg overflow-hidden relative shadow-lg ring-1 ring-zinc-700 aspect-video">
                          <video ref={videoRef} autoPlay muted className="w-full h-full object-cover"></video>
                          <div className="absolute bottom-1 left-2 bg-black/50 text-white px-2 py-0.5 rounded text-xs font-medium">{config.userName} (You)</div>
                      </div>
                      {botConfig && (
                          <div className={`bg-zinc-800 rounded-lg flex flex-col items-center justify-center relative aspect-video transition-all duration-300 shadow-lg ${botBorderClass}`}>
                            <button onClick={handleRemoveBot} className="absolute top-1 right-1 p-1 bg-black/30 rounded-full hover:bg-black/60 z-10"><XIcon className="w-3 h-3"/></button>
                            <BotIcon className="w-10 h-10 text-blue-400" />
                            <h2 className="text-xs mt-1 font-bold text-center px-1">{botConfig.persona.name}</h2>
                            <div className="flex items-center mt-1">
                                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${botStatusColor} ${botState === 'speaking' && 'animate-pulse'}`}></span>
                                <p className="text-xs text-gray-400">{botStatusText}</p>
                            </div>
                            <div className="absolute bottom-1 left-2 bg-black/50 text-white px-2 py-0.5 rounded text-xs font-medium">Subject Expert AI</div>
                          </div>
                      )}
                  </div>
              </div>
            ) : (
                <div className={`grid gap-4 w-full h-full items-center justify-center ${participantCount === 1 ? 'max-w-4xl mx-auto' : 'grid-cols-1 md:grid-cols-2 max-w-7xl mx-auto'}`}>
                    <div className="bg-black rounded-lg overflow-hidden relative aspect-video">
                        <video ref={videoRef} autoPlay muted className="w-full h-full object-cover"></video>
                        <div className="absolute bottom-2 left-3 bg-black/50 text-white px-2 py-1 rounded text-sm font-medium">{config.userName} (You)</div>
                    </div>
                    {botConfig ? (
                    <div className={`bg-zinc-900 rounded-lg flex flex-col items-center justify-center relative aspect-video transition-all duration-300 ${botBorderClass}`}>
                        <button onClick={handleRemoveBot} className="absolute top-2 right-2 p-1 bg-black/30 rounded-full hover:bg-black/60 z-10"><XIcon className="w-5 h-5"/></button>
                        <BotIcon className="w-16 h-16 text-blue-400" />
                        <h2 className="text-xl mt-4 font-bold text-center px-4">{botConfig.persona.name}</h2>
                        <div className="flex items-center justify-center mt-2">
                            <span className={`w-2.5 h-2.5 rounded-full mr-2 ${botStatusColor} ${botState === 'speaking' && 'animate-pulse'}`}></span>
                            <p className="text-gray-400">{botStatusText}</p>
                        </div>
                        <div className="absolute bottom-2 left-3 bg-black/50 text-white px-2 py-1 rounded text-sm font-medium">Subject Expert AI</div>
                    </div>
                    ) : (
                        <div className="bg-zinc-900/80 rounded-lg flex items-center justify-center border-2 border-dashed border-zinc-700 aspect-video">
                            <button onClick={() => setShowAddBotModal(true)} className="flex flex-col items-center justify-center text-zinc-400 hover:text-white transition-colors">
                                <PlusIcon className="w-12 h-12"/>
                                <span className="mt-2 text-base font-semibold">Add AI Expert</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
         </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <div className="bg-zinc-800/80 backdrop-blur-sm p-2 rounded-full flex items-center space-x-3 shadow-2xl ring-1 ring-zinc-700/50">
              <button onClick={toggleMute} className={`p-3 rounded-full transition-colors ${isMuted ? 'bg-red-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-white'}`} aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? <MicSlashIcon className="w-6 h-6" /> : <MicIcon className="w-6 h-6" />}
              </button>
              <button onClick={handleToggleScreenShare} className={`p-3 rounded-full transition-colors ${isSharingScreen ? 'bg-blue-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-white'}`} aria-label={isSharingScreen ? 'Stop sharing screen' : 'Share screen'}>
                <ScreenShareIcon className="w-6 h-6" />
              </button>
              <button onClick={onLeave} className="p-3 rounded-full bg-red-600 hover:bg-red-500 text-white" aria-label="Leave call">
              <PhoneIcon className="w-6 h-6" />
              </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm flex-shrink-0 bg-zinc-900 border-l border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-white">Meeting Chat & Transcript</h2>
        </div>
        <div className="flex-grow p-4 overflow-y-auto space-y-4">
            {conversationHistory.map((entry, index) => {
                if (entry.type === 'transcription') {
                    return (
                        <div key={index} className="text-xs text-zinc-400 italic px-1">
                            <span>{entry.text}</span>
                        </div>
                    );
                }
                return (
                    <div key={index} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-sm p-3 rounded-2xl ${entry.role === 'user' ? 'bg-blue-600 text-white rounded-br-lg' : 'bg-zinc-700 text-white rounded-bl-lg'}`}>
                            <MarkdownRenderer content={entry.text} />
                        </div>
                    </div>
                );
            })}
             {isChatLoading && conversationHistory[conversationHistory.length - 1]?.type === 'chat' && conversationHistory[conversationHistory.length-1].role !== 'model' && (
             <div className="flex justify-start">
                <div className="max-w-md p-3 rounded-2xl bg-zinc-700 text-white rounded-bl-lg">
                  <div className="text-sm">...</div>
                </div>
              </div>
           )}
          <div ref={conversationEndRef} />
        </div>
        <div className="p-4 border-t border-zinc-800 bg-zinc-900">
            {botConfig ? (
                 <form onSubmit={handleSendChatMessage} className="flex items-center space-x-2">
                 <input
                   type="text"
                   value={chatInput}
                   onChange={(e) => setChatInput(e.target.value)}
                   placeholder="Type a message..."
                   className="flex-grow p-2.5 bg-zinc-800 border border-zinc-700 rounded-full focus:ring-2 focus:ring-blue-500 focus:outline-none px-4"
                   disabled={isChatLoading}
                 />
                 <button type="submit" disabled={isChatLoading || !chatInput.trim()} className="p-2.5 bg-blue-600 rounded-full hover:bg-blue-500 disabled:bg-zinc-600 disabled:cursor-not-allowed transition-colors" aria-label="Send message">
                   <SendIcon className="w-5 h-5 text-white"/>
                 </button>
               </form>
            ) : (
                <div className="text-center text-sm text-zinc-400">Add an AI Expert to start chatting.</div>
            )}
        </div>
      </div>
    </div>
  );
};

export default MeetingRoom;
