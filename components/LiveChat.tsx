
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality, LiveSession, Chat, type LiveServerMessage, type Blob } from '@google/genai';
import { decode, encode, decodeAudioData } from '../services/audioUtils';
import { MicIcon, MicSlashIcon, PhoneIcon, BotIcon, PlusIcon, XIcon, SendIcon, ScreenShareIcon, PaperClipIcon, ArrowPathIcon } from './icons/Icons';
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
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [attachment, setAttachment] = useState<{ file: File; type: 'image' | 'text' | 'pdf' | 'unknown'; preview: string } | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const userStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const frameIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Ensure videoRef always has the stream when layout changes (e.g., screen share toggle)
  useEffect(() => {
      if (videoRef.current && userStreamRef.current) {
          videoRef.current.srcObject = userStreamRef.current;
      }
  }, [isSharingScreen]);
  
  const stopFrameSending = useCallback(() => {
    if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
    }
  }, []);

  const disconnectSession = useCallback(async (isCleanup: boolean = false) => {
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
    if (scriptProcessorRef.current) {
        try { scriptProcessorRef.current.disconnect(); } catch(e) {}
    }
    if (mediaStreamSourceRef.current) {
        try { mediaStreamSourceRef.current.disconnect(); } catch(e) {}
    }
    if (audioContextRef.current?.state !== 'closed') {
        try { await audioContextRef.current?.close(); } catch(e) {}
    }
    if (outputAudioContextRef.current?.state !== 'closed') {
        try { await outputAudioContextRef.current?.close(); } catch(e) {}
    }
    chatRef.current = null;

    if (isCleanup) {
        setConnectionStatus('idle');
    }
  }, [stopFrameSending]);
  
  const handleAddBot = (botJoinConfig: { persona: Persona, systemPrompt: string }) => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        alert("API Key is missing. Please ensure a valid API Key is provided in the code or environment variables.");
        return;
    }
    
    setBotConfig(botJoinConfig);
    try {
        const ai = new GoogleGenAI({ apiKey });
        chatRef.current = ai.chats.create({
          model: 'gemini-2.5-flash',
          config: { systemInstruction: botJoinConfig.systemPrompt },
        });
        setShowAddBotModal(false);
    } catch (e) {
        console.error("Failed to initialize chat client:", e);
        alert("Failed to initialize AI client. Check console for details.");
    }
  };
  
  const handleRemoveBot = useCallback(() => {
    disconnectSession(true);
    setBotConfig(null);
    setConversationHistory([]);
    setBotState('listening');
    setConnectionStatus('idle');
  }, [disconnectSession]);

  const startFrameSending = useCallback(() => {
    stopFrameSending(); // Ensure no multiple intervals running
    frameIntervalRef.current = window.setInterval(() => {
      if (!screenVideoRef.current || screenVideoRef.current.paused || screenVideoRef.current.ended || !sessionPromiseRef.current) return;
      
      const video = screenVideoRef.current;
      const canvas = canvasRef.current;
      
      // Scale down large screens to avoid websocket payload limits (disconnects)
      const MAX_WIDTH = 1024;
      const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
      
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
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

  const startConversation = useCallback(async (stream: MediaStream, systemPrompt: string, previousContext: string = '') => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return;

    if (sessionPromiseRef.current) await disconnectSession();
    
    setConnectionStatus('connecting');

    const ai = new GoogleGenAI({ apiKey });
    
    const conversationalStylePrompt = `Speak just like a real person—warm, natural, and clear. Use simple language and avoid technical jargon unless the user uses it first. Be concise; don’t stretch the discussion or add unnecessary details. Stay focused on what the user asks. When needed, ask short clarifying questions. Keep the conversation smooth, friendly, and human-like.`;

    const meetingBehaviorPrompt = `You are a helpful AI assistant in a meeting. Your goal is to be a seamless, helpful participant. Listen to the user and continuously observe their screen when they are sharing. Proactively use the visual information from the screen as context for your responses without waiting for the user to tell you to look. Respond directly and conversationally when the user speaks to you or when you have a relevant insight based on the conversation or the shared screen. Be proactive but not interruptive. Keep your responses concise and to the point.`;
    
    // Inject user name into the context
    const userContext = `The user you are speaking with is named ${config.userName}. Address them by name naturally in the conversation, but do not overdo it.`;

    let systemInstruction = `${userContext} ${systemPrompt} ${conversationalStylePrompt} ${meetingBehaviorPrompt}`;

    if (previousContext) {
        systemInstruction += `\n\nIMPORTANT: The connection was interrupted. Below is the transcript of the conversation so far. Resume the conversation naturally from where it left off. Do not simply repeat the last message.\n\n[PREVIOUS_TRANSCRIPT_START]\n${previousContext}\n[PREVIOUS_TRANSCRIPT_END]`;
    }

    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    sessionPromiseRef.current = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: { responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {}, systemInstruction },
      callbacks: {
        onopen: () => {
          console.log('Connection opened.');
          setConnectionStatus('connected');
          if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
          
          // Create media stream source from the stream
          const source = audioContextRef.current.createMediaStreamSource(stream);
          mediaStreamSourceRef.current = source;
          
          const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
          scriptProcessorRef.current = scriptProcessor;
          
          scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
            const pcmBlob: Blob = createBlob(inputData);
            sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
          };
          
          source.connect(scriptProcessor);
          scriptProcessor.connect(audioContextRef.current.destination); 
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
          setConnectionStatus('disconnected');
        },
        onclose: (e: CloseEvent) => { 
            console.log('Connection closed.'); 
            setConnectionStatus(prev => prev === 'connected' ? 'disconnected' : prev);
        },
      },
    });
  }, [disconnectSession, config.userName]);

  const handleReconnect = useCallback(() => {
      if (!botConfig || !userStreamRef.current) return;

      // Format recent history to provide context
      const historyContext = conversationHistory.slice(-30).map(entry => {
          if (entry.type === 'transcription') {
              return `${entry.speaker === 'user' ? 'User' : 'AI'}: ${entry.text}`;
          } else {
              return `${entry.role === 'user' ? 'User' : 'AI'}: ${entry.text}`;
          }
      }).join('\n');

      startConversation(userStreamRef.current, botConfig.systemPrompt, historyContext);
  }, [botConfig, conversationHistory, startConversation]);
  
  useEffect(() => {
    if (isSharingScreen && botConfig && connectionStatus === 'connected') {
        sessionPromiseRef.current?.then(() => {
            startFrameSending();
        });
    } else {
      stopFrameSending();
    }
    return () => {
        stopFrameSending();
    };
}, [isSharingScreen, botConfig, connectionStatus, startFrameSending, stopFrameSending]);

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
        disconnectSession(true);
        if (localStream && localStream !== config.stream) {
            localStream.getTracks().forEach(track => track.stop());
        }
    };
  }, [disconnectSession, onLeave, config.stream]);

  useEffect(() => {
      if (botConfig && userStreamRef.current && connectionStatus === 'idle') {
          if (userStreamRef.current.active) {
              startConversation(userStreamRef.current, botConfig.systemPrompt);
          } else {
              console.error("Stream is inactive, cannot start conversation");
              alert("Media stream is inactive. Please rejoin the meeting.");
          }
      }
  }, [botConfig, startConversation, connectionStatus]);

  const handleLeaveCall = useCallback(() => {
    disconnectSession(true);
    if (config.stream) {
        config.stream.getTracks().forEach(t => t.stop());
    }
    if (userStreamRef.current && userStreamRef.current !== config.stream) {
        userStreamRef.current.getTracks().forEach(t => t.stop());
    }
    onLeave();
  }, [disconnectSession, config.stream, onLeave]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      let type: 'image' | 'text' | 'pdf' | 'unknown' = 'unknown';
      let preview = '';

      if (file.type.startsWith('image/')) {
        type = 'image';
        preview = URL.createObjectURL(file);
      } else if (file.type === 'text/plain' || file.type === 'text/markdown' || file.type === 'application/json' || file.type === 'text/csv' || file.type === 'text/xml') {
        type = 'text';
        preview = '📄 ' + file.name;
      } else if (file.type === 'application/pdf') {
        type = 'pdf';
        preview = '📕 ' + file.name;
      } else {
          alert("Unsupported file type. Please upload images, text files, JSON, CSV, or PDFs.");
          return;
      }

      setAttachment({ file, type, preview });
    }
  };

  const removeAttachment = () => {
    if (attachment?.type === 'image') {
        URL.revokeObjectURL(attachment.preview);
    }
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!chatInput.trim() && !attachment) || isChatLoading || !chatRef.current) return;

    const messageText = chatInput.trim();
    const attachedFile = attachment; // capture current reference
    
    // Reset UI immediately
    setChatInput('');
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsChatLoading(true);

    // Update conversation history
    let displayMessage = messageText;
    if (attachedFile) {
        displayMessage = `[Attached: ${attachedFile.file.name}]\n${messageText}`;
    }
    setConversationHistory(prev => [...prev, { type: 'chat', role: 'user', text: displayMessage }]);

    try {
      let messageParts: any[] = [];
      if (messageText) {
        messageParts.push({ text: messageText });
      }

      if (attachedFile) {
        const base64Data = await blobToBase64(attachedFile.file);
        
        // 1. Add to Chat Context
        messageParts.push({
            inlineData: {
                mimeType: attachedFile.file.type,
                data: base64Data
            }
        });

        // 2. Send to Live Session (Voice Bot) if applicable and supported
        if (sessionPromiseRef.current && connectionStatus === 'connected') {
            const session = await sessionPromiseRef.current;
            try {
                 // We send the visual/document context to the live session so the voice bot can "see" it.
                 if (attachedFile.type === 'image' || attachedFile.type === 'pdf' || attachedFile.type === 'text') {
                     await session.sendRealtimeInput({ 
                        media: { 
                            mimeType: attachedFile.file.type, 
                            data: base64Data 
                        } 
                     });
                     console.log(`Sent ${attachedFile.type} attachment to Live Session context`);
                 }
            } catch (err) {
                console.error("Failed to send attachment to Live Session:", err);
            }
        }
      }
      
      const stream = await chatRef.current.sendMessageStream({ message: messageParts });
      
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
      setConversationHistory(prev => [...prev, { type: 'chat', role: 'model', text: 'Sorry, I encountered an error processing your message.' }]);
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

  const botBorderClass = connectionStatus === 'disconnected' 
    ? 'ring-2 ring-red-500'
    : botState === 'speaking' 
        ? 'ring-2 ring-green-500' 
        : 'ring-1 ring-zinc-700';

  const botStatusColor = connectionStatus === 'disconnected'
    ? 'bg-red-500'
    : botState === 'speaking' 
        ? 'bg-green-500' 
        : 'bg-blue-500';

  const getBotStatusText = () => {
    if (connectionStatus === 'disconnected') return 'Disconnected';
    if (connectionStatus === 'connecting') return 'Connecting...';
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
                            <BotIcon className={`w-10 h-10 ${connectionStatus === 'disconnected' ? 'text-red-400' : 'text-blue-400'}`} />
                            <h2 className="text-xs mt-1 font-bold text-center px-1">{botConfig.persona.name}</h2>
                            <div className="flex items-center mt-1">
                                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${botStatusColor} ${botState === 'speaking' && 'animate-pulse'}`}></span>
                                <p className="text-xs text-gray-400">{botStatusText}</p>
                            </div>
                            {connectionStatus === 'disconnected' && (
                                <button onClick={handleReconnect} className="mt-1 px-2 py-0.5 bg-blue-600 text-white text-[10px] rounded hover:bg-blue-500 flex items-center">
                                    <ArrowPathIcon className="w-3 h-3 mr-1" /> Retry
                                </button>
                            )}
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
                        <BotIcon className={`w-16 h-16 ${connectionStatus === 'disconnected' ? 'text-red-400' : 'text-blue-400'}`} />
                        <h2 className="text-xl mt-4 font-bold text-center px-4">{botConfig.persona.name}</h2>
                        <div className="flex items-center justify-center mt-2">
                            <span className={`w-2.5 h-2.5 rounded-full mr-2 ${botStatusColor} ${botState === 'speaking' && 'animate-pulse'}`}></span>
                            <p className="text-gray-400">{botStatusText}</p>
                        </div>
                         {connectionStatus === 'disconnected' && (
                                <button onClick={handleReconnect} className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-full hover:bg-blue-500 flex items-center shadow-lg">
                                    <ArrowPathIcon className="w-4 h-4 mr-2" /> Reconnect
                                </button>
                        )}
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
              <button onClick={handleLeaveCall} className="p-3 rounded-full bg-red-600 hover:bg-red-500 text-white" aria-label="Leave call">
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
        <div className="p-4 border-t border-zinc-800 bg-zinc-900 space-y-2">
            {attachment && (
                <div className="flex items-center bg-zinc-800 p-2 rounded-lg justify-between border border-zinc-700">
                    <div className="flex items-center space-x-2 overflow-hidden">
                        {attachment.type === 'image' ? (
                            <img src={attachment.preview} alt="Preview" className="w-8 h-8 object-cover rounded" />
                        ) : (
                             <span className="text-xl">📄</span>
                        )}
                        <span className="text-xs text-gray-300 truncate max-w-[150px]">{attachment.file.name}</span>
                    </div>
                    <button onClick={removeAttachment} className="text-gray-400 hover:text-white p-1">
                        <XIcon className="w-4 h-4" />
                    </button>
                </div>
            )}
            {botConfig ? (
                 <form onSubmit={handleSendChatMessage} className="flex items-center space-x-2">
                 <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    className="hidden" 
                    accept="image/*,application/pdf,text/plain,text/markdown,application/json,text/csv,text/xml"
                 />
                 <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 text-zinc-400 hover:text-white bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors"
                    title="Attach context (Image, PDF, Text)"
                 >
                    <PaperClipIcon className="w-5 h-5" />
                 </button>
                 <input
                   type="text"
                   value={chatInput}
                   onChange={(e) => setChatInput(e.target.value)}
                   placeholder="Type a message..."
                   className="flex-grow p-2.5 bg-zinc-800 border border-zinc-700 rounded-full focus:ring-2 focus:ring-blue-500 focus:outline-none px-4"
                   disabled={isChatLoading || connectionStatus !== 'connected'}
                 />
                 <button type="submit" disabled={isChatLoading || (!chatInput.trim() && !attachment) || connectionStatus !== 'connected'} className="p-2.5 bg-blue-600 rounded-full hover:bg-blue-500 disabled:bg-zinc-600 disabled:cursor-not-allowed transition-colors" aria-label="Send message">
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
