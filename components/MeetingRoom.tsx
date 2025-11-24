
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality, Chat, type LiveServerMessage, type Blob as GenAIBlob, Type, type FunctionDeclaration } from '@google/genai';
import { decode, encode, decodeAudioData } from '../services/audioUtils';
import { MicIcon, MicSlashIcon, PhoneIcon, BotIcon, PlusIcon, XIcon, SendIcon, ScreenShareIcon, ArrowPathIcon, DownloadIcon, DocumentIcon } from './icons/Icons';
import type { MeetingConfig, ConversationEntry, BotState, Persona, RoomResource, RoomReport } from '../types';
import { PERSONAS } from '../constants';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ReportEditor } from './ReportEditor';

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

function createBlob(data: Float32Array): GenAIBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
}

// --- TOOL DEFINITION ---
const createReportTool: FunctionDeclaration = {
  name: 'create_report',
  parameters: {
    type: Type.OBJECT,
    description: 'Generates and saves a formal Markdown report (e.g., Threat Model, Summary, Test Plan) to the meeting history. Use this whenever the user asks for a file or report to be created.',
    properties: {
      title: {
        type: Type.STRING,
        description: 'The title of the report (e.g., "STRIDE Analysis - Login System").',
      },
      content: {
        type: Type.STRING,
        description: 'The full content of the report in Markdown format. Do not truncate.',
      },
    },
    required: ['title', 'content'],
  },
};

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


const MeetingRoom: React.FC<{ config: MeetingConfig; onLeave: (report?: RoomReport) => void; onSaveReport?: (report: RoomReport) => void }> = ({ config, onLeave, onSaveReport }) => {
  const [botConfig, setBotConfig] = useState<{ persona: Persona; systemPrompt: string } | null>(
      config.room ? { persona: config.room.persona, systemPrompt: config.room.persona.systemPrompt } : null
  );
  const [showAddBotModal, setShowAddBotModal] = useState(false);
  const [botState, setBotState] = useState<BotState>('listening');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [attachment, setAttachment] = useState<{ file: File; type: 'image' | 'text' | 'pdf' | 'unknown'; preview: string } | null>(null);
  const [viewingReport, setViewingReport] = useState<string | null>(null);
  
  // Real-time transcription state
  const [realtimeInput, setRealtimeInput] = useState('');
  const [smoothOutput, setSmoothOutput] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const userStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const frameIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const chatRef = useRef<Chat | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const conversationHistoryRef = useRef<ConversationEntry[]>([]);

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const targetOutputRef = useRef('');
  
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());

  // Auto-reconnect Refs
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  const isIntentionalDisconnectRef = useRef(false);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // --- TYPEWRITER EFFECT FOR AI RESPONSE ---
  useEffect(() => {
    const interval = setInterval(() => {
        setSmoothOutput(current => {
            const target = targetOutputRef.current;
            if (current === target) return current;
            if (target === '') return '';
            if (target.length < current.length) return target;
            
            const dist = target.length - current.length;
            const step = Math.ceil(dist / 25); 
            
            return target.slice(0, current.length + Math.max(1, step));
        });
    }, 50); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    conversationHistoryRef.current = conversationHistory;
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationHistory, realtimeInput, smoothOutput]);

  // Ensure videoRef always has the stream when layout changes
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
    
    if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
    }

    if (sourcesRef.current) {
        for (const source of sourcesRef.current.values()) {
            try { source.stop(); } catch (e) {}
        }
        sourcesRef.current.clear();
    }
    nextStartTimeRef.current = 0;

    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
      } catch (e) { 
        console.warn('Error closing session:', e); 
      }
      sessionPromiseRef.current = null;
    }

    if (scriptProcessorRef.current) {
        try { scriptProcessorRef.current.disconnect(); } catch(e) {}
    }
    if (mediaStreamSourceRef.current) {
        try { mediaStreamSourceRef.current.disconnect(); } catch(e) {}
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { await audioContextRef.current.close(); } catch(e) {}
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        try { await outputAudioContextRef.current.close(); } catch(e) {}
    }
    
    chatRef.current = null;
    setRealtimeInput('');
    setSmoothOutput('');
    targetOutputRef.current = '';

    if (isCleanup) {
        setConnectionStatus('idle');
    }
  }, [stopFrameSending]);
  
  const handleAddBot = (botJoinConfig: { persona: Persona, systemPrompt: string }) => {
    setBotConfig(botJoinConfig);
    isIntentionalDisconnectRef.current = false;
  };
  
  const handleRemoveBot = useCallback(() => {
    isIntentionalDisconnectRef.current = true;
    disconnectSession(true);
    setBotConfig(null);
    setConversationHistory([]);
    setBotState('listening');
    setConnectionStatus('idle');
  }, [disconnectSession]);

  const startFrameSending = useCallback(() => {
    stopFrameSending(); 
    frameIntervalRef.current = window.setInterval(() => {
      if (!screenVideoRef.current || screenVideoRef.current.paused || screenVideoRef.current.ended || !sessionPromiseRef.current) return;
      
      const video = screenVideoRef.current;
      const canvas = canvasRef.current;
      
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
    }, 1000); 
  }, [stopFrameSending]);

  const startConversation = useCallback(async (stream: MediaStream, systemPrompt: string, previousContext: string = '') => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return;

    if (sessionPromiseRef.current) await disconnectSession();
    
    setConnectionStatus('connecting');
    setBotState('listening');
    if (retryCountRef.current > 0) {
         isIntentionalDisconnectRef.current = false;
    }

    const ai = new GoogleGenAI({ apiKey });

    // Initialize Chat Client
    chatRef.current = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { 
            systemInstruction: systemPrompt,
            tools: [{ googleSearch: {} }] 
        },
    });
    
    // UPDATED SYSTEM PROMPTS FOR BEHAVIOR
    const conversationalStylePrompt = `
    Speak just like a real person—warm, natural, and clear. 
    Use simple language and avoid technical jargon unless the user uses it first. 
    Be concise; don’t stretch the discussion or add unnecessary details. 
    Stay focused on what the user asks. When needed, ask short clarifying questions, but do NOT ask repetitive questions if you have enough context.
    IMPORTANT: If asked to create a report, use Markdown with clear headers (#).
    
    [WAITING BEHAVIOR]
    If the user says "wait", "hold on", or "just a second", you must stop talking immediately and remain SILENT. 
    Do not say "Okay I'll wait". Just be silent.
    Wait until the user speaks again to re-engage. 

    [NOISE HANDLING]
    If you hear very short, unclear audio or background noise, ignore it. Do not respond with "I didn't catch that". Just wait for clear speech.
    `;

    const meetingBehaviorPrompt = `You are a helpful AI assistant in a meeting. Your goal is to be a seamless, helpful participant. Listen to the user and continuously observe their screen when they are sharing. Proactively use the visual information from the screen as context for your responses without waiting for the user to tell you to look. Respond directly and conversationally when the user speaks to you or when you have a relevant insight based on the conversation or the shared screen. Be proactive but not interruptive.`;
    
    const toolInstruction = " You have access to a 'create_report' tool. Use it whenever the user asks to generate a file, report, summary, or document. Do not speak the full content of such documents; generate them using the tool.";

    const userContext = `The user you are speaking with is named ${config.userName}. Address them by name naturally in the conversation, but do not overdo it.`;

    let resourceContext = "";
    const imageResources: RoomResource[] = [];
    let loadedResourceCount = 0;
    
    if (config.room?.resources) {
        const textResources = config.room.resources.filter(r => {
             if (r.type.startsWith('image/') || r.type.startsWith('video/') || r.type.startsWith('audio/')) return false;
             const isTextType = r.type.includes('text') || r.type.includes('json') || r.type.includes('xml') || r.type.includes('javascript') || r.type.includes('markdown');
             const isTextExt = /\.(md|txt|json|csv|xml|js|ts|tsx|jsx|html|css|py|rb|go|java|c|cpp|h)$/i.test(r.name);
             return isTextType || isTextExt || r.type === 'application/json';
        });

        config.room.resources.forEach(r => {
             if (r.type.startsWith('image/')) {
                 imageResources.push(r);
             }
        });

        const linkResources = config.room.resources.filter(r => r.type === 'link');
        if (linkResources.length > 0) {
            resourceContext += "\n\n[SHARED LINKS]\nThe user has shared the following relevant links. You can use these as context or starting points for discussion. Use your built-in Google Search tool to access their content if you do not know it:\n";
            linkResources.forEach(res => {
                resourceContext += `- ${res.content}\n`;
            });
            loadedResourceCount += linkResources.length;
        }

        if (textResources.length > 0) {
            resourceContext += "\n\n[ATTACHED DOCUMENTS]\nThe following documents are attached to this session. You MUST refer to them to answer user questions regarding the system or topic:\n";
            textResources.forEach(res => {
                try {
                    const textContent = atob(res.content);
                    const truncatedContent = textContent.length > 20000 ? textContent.substring(0, 20000) + "\n...[TRUNCATED]" : textContent;
                    resourceContext += `\n--- START OF DOCUMENT: ${res.name} ---\n${truncatedContent}\n--- END OF DOCUMENT: ${res.name} ---\n`;
                    loadedResourceCount++;
                } catch (e) { console.warn("Failed to decode text resource", res.name); }
            });
            resourceContext += "\n[END ATTACHED DOCUMENTS]\nUse the above documents as primary context for your answers.";
        }
        loadedResourceCount += imageResources.length;
    }

    if (loadedResourceCount > 0 && retryCountRef.current === 0) {
        setConversationHistory(prev => [...prev, { type: 'chat', role: 'model', text: `*System Note: Successfully loaded ${loadedResourceCount} resource(s) into context.*` }]);
    }

    let systemInstruction = `${userContext} ${systemPrompt} ${resourceContext} ${conversationalStylePrompt} ${meetingBehaviorPrompt} ${toolInstruction}`;

    const combinedContext = (config.previousContext || '') + (previousContext ? `\n\n[RECENT_DISCONNECTION_CONTEXT]\n${previousContext}` : '');

    if (combinedContext) {
        systemInstruction += `\n\n[SYSTEM UPDATE] The conversation is resuming. Below is the transcript of the previous session. Resume the conversation naturally from where it left off using this context. Do NOT repeat the last message unless asked.\n\n[PREVIOUS_TRANSCRIPT_START]\n${combinedContext}\n[PREVIOUS_TRANSCRIPT_END]`;
    }

    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    try {
        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          config: { 
            responseModalities: [Modality.AUDIO], 
            inputAudioTranscription: {}, 
            outputAudioTranscription: {}, 
            systemInstruction,
            tools: [{ googleSearch: {}, functionDeclarations: [createReportTool] }],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
            }
          },
          callbacks: {
            onopen: async () => {
              console.log('Connection opened.');
              setConnectionStatus('connected');
              retryCountRef.current = 0; 
              
              if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
              
              const source = audioContextRef.current.createMediaStreamSource(stream);
              mediaStreamSourceRef.current = source;
              
              const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
              scriptProcessorRef.current = scriptProcessor;
              
              scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const pcmBlob: GenAIBlob = createBlob(inputData);
                sessionPromiseRef.current?.then(session => {
                    try {
                        session.sendRealtimeInput({ media: pcmBlob });
                    } catch (e) { }
                }).catch(() => { });
              };
              
              source.connect(scriptProcessor);
              scriptProcessor.connect(audioContextRef.current.destination); 
            },
            onmessage: async (message: LiveServerMessage) => {
              // Handle Function Calling
              if (message.toolCall) {
                  sessionPromiseRef.current?.then(session => {
                      for (const fc of message.toolCall!.functionCalls) {
                          if (fc.name === 'create_report') {
                              const { title, content } = fc.args as { title: string; content: string };
                              const reportId = crypto.randomUUID();
                              const report: RoomReport = {
                                  id: reportId,
                                  createdAt: Date.now(),
                                  summary: content,
                                  transcript: "Generated via Live Tool"
                              };
                              
                              // Save to History
                              if (onSaveReport) onSaveReport(report);
                              
                              // Add "File" to Chat
                              const fileDisplayMessage = `# 📄 Report Generated: ${title}\n\n${content}`;
                              setConversationHistory(prev => [...prev, { 
                                  type: 'chat', 
                                  role: 'model', 
                                  text: fileDisplayMessage 
                              }]);

                              // Respond to Tool
                              session.sendToolResponse({
                                  functionResponses: [{
                                      id: fc.id,
                                      name: fc.name,
                                      response: { result: { success: true, message: "Report saved and displayed to user." } }
                                  }]
                              });
                          }
                      }
                  });
              }

              if (message.serverContent?.outputTranscription) {
                  setBotState('speaking');
                  const text = message.serverContent.outputTranscription.text;
                  currentOutputTranscriptionRef.current += text;
                  targetOutputRef.current = currentOutputTranscriptionRef.current;
              } else if (message.serverContent?.inputTranscription) {
                const text = message.serverContent.inputTranscription.text;
                currentInputTranscriptionRef.current += text;
                setRealtimeInput(currentInputTranscriptionRef.current);
              }

              if (message.serverContent?.turnComplete) {
                const fullInput = currentInputTranscriptionRef.current.trim();
                const fullOutput = currentOutputTranscriptionRef.current.trim();
                if (fullInput) {
                    const correctedInput = fullInput.charAt(0).toUpperCase() + fullInput.slice(1);
                    setConversationHistory(prev => [...prev, { type: 'transcription', speaker: 'user', text: correctedInput }]);
                }
                if (fullOutput) setConversationHistory(prev => [...prev, { type: 'transcription', speaker: 'model', text: fullOutput }]);
                
                currentInputTranscriptionRef.current = '';
                currentOutputTranscriptionRef.current = '';
                targetOutputRef.current = '';
                
                setRealtimeInput('');
                setSmoothOutput('');
                setBotState('listening');
              }

              if (message.serverContent?.interrupted) {
                for (const source of sourcesRef.current.values()) {
                  source.stop();
                }
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                
                currentOutputTranscriptionRef.current = '';
                targetOutputRef.current = '';
                setSmoothOutput('');
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
            },
            onclose: (e: CloseEvent) => { 
                console.log('Connection closed.', e); 
                
                if (!isIntentionalDisconnectRef.current && retryCountRef.current < MAX_RETRIES) {
                    retryCountRef.current += 1;
                    console.log(`Connection dropped. Attempting reconnect ${retryCountRef.current}/${MAX_RETRIES} in 2s...`);
                    setConnectionStatus('connecting');
                    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
                    reconnectTimeoutRef.current = window.setTimeout(() => {
                        console.log("Triggering auto-reconnect...");
                        reconnectRef.current(); 
                    }, 2000);
                } else {
                    setConnectionStatus(prev => prev === 'connected' || prev === 'connecting' ? 'disconnected' : prev);
                }
            },
          },
        });
        
        sessionPromiseRef.current = sessionPromise;

        sessionPromise.then(async (session) => {
             if (imageResources.length > 0) {
                  for (const img of imageResources) {
                      try {
                          await session.sendRealtimeInput({
                              media: { mimeType: img.type, data: img.content }
                          });
                          await new Promise(r => setTimeout(r, 200)); 
                      } catch (e) {
                          console.error("Failed to send image context", e);
                      }
                  }
              }
        }).catch(err => {
            console.error("Session connection failed:", err);
            setConnectionStatus('disconnected');
        });

    } catch (err) {
        console.error("Failed to initiate session:", err);
        setConnectionStatus('disconnected');
    }

  }, [disconnectSession, config.userName, config.room, config.previousContext]);

  const reconnectRef = useRef<() => void>(() => {});

  const handleReconnect = useCallback(() => {
      const activeStream = userStreamRef.current && userStreamRef.current.active ? userStreamRef.current : config.stream;

      if (!botConfig || !activeStream) {
          console.error("Cannot reconnect: Missing configuration or active media stream.");
          setConnectionStatus('disconnected');
          return;
      }
      
      console.log("Attempting to reconnect...");
      isIntentionalDisconnectRef.current = false;
      setConnectionStatus('connecting');

      const historyContext = conversationHistoryRef.current.slice(-30).map(entry => {
          if (entry.type === 'transcription') {
              return `${entry.speaker === 'user' ? 'User' : 'AI'}: ${entry.text}`;
          } else {
              return `${entry.role === 'user' ? 'User' : 'AI'}: ${entry.text}`;
          }
      }).join('\n');

      startConversation(activeStream, botConfig.systemPrompt, historyContext);
  }, [botConfig, startConversation, config.stream]);

  useEffect(() => {
      reconnectRef.current = handleReconnect;
  }, [handleReconnect]);
  
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
        isIntentionalDisconnectRef.current = true;
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

  const generateReport = (): RoomReport => {
      const timestamp = new Date().toLocaleString();
      const content = conversationHistory.map(entry => {
          const role = entry.type === 'transcription' ? (entry.speaker === 'user' ? 'User (Voice)' : 'AI (Voice)') : (entry.role === 'user' ? 'User (Chat)' : 'AI (Chat)');
          return `**${role}:**\n${entry.text}\n`;
      }).join('\n');
      
      const summaryMarkdown = `# Meeting Summary - ${botConfig?.persona.name || 'AI Assistant'}\nDate: ${timestamp}\nParticipant: ${config.userName}\n\n## Transcript\n\n${content}`;
      
      return {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          summary: summaryMarkdown,
          transcript: content
      };
  };

  const handleLeaveCall = useCallback(() => {
    isIntentionalDisconnectRef.current = true;
    const report = generateReport();
    disconnectSession(true);
    if (config.stream) {
        config.stream.getTracks().forEach(t => t.stop());
    }
    if (userStreamRef.current && userStreamRef.current !== config.stream) {
        userStreamRef.current.getTracks().forEach(t => t.stop());
    }
    onLeave(report);
  }, [disconnectSession, config.stream, onLeave, generateReport]);

  const handleSaveReportFromChat = (content: string) => {
    if (onSaveReport) {
        const report: RoomReport = {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            summary: content,
            transcript: "Generated from AI Chat Interaction"
        };
        onSaveReport(report);
        setViewingReport(null);
        alert("Report saved to Room History.");
    }
  };

  const downloadSummary = () => {
    const report = generateReport();
    const blob = new Blob([report.summary], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-summary-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
          if (fileInputRef.current) fileInputRef.current.value = '';
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
    const attachedFile = attachment;
    
    setChatInput('');
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsChatLoading(true);

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
        
        messageParts.push({
            inlineData: {
                mimeType: attachedFile.file.type,
                data: base64Data
            }
        });

        if (sessionPromiseRef.current && connectionStatus === 'connected' && attachedFile.type === 'image') {
            const session = await sessionPromiseRef.current;
            try {
                 await session.sendRealtimeInput({ 
                    media: { 
                        mimeType: attachedFile.file.type, 
                        data: base64Data 
                    } 
                 });
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
                alert('Screen sharing permission was denied.');
            } else {
                alert('An unexpected error occurred while trying to start screen sharing.');
            }
        }
    }
  };

  const botStatusColor = connectionStatus === 'disconnected'
    ? 'bg-red-500'
    : botState === 'speaking' 
        ? 'bg-green-500' 
        : 'bg-blue-500';

  const getBotStatusText = () => {
    if (connectionStatus === 'disconnected') return 'Disconnected';
    if (connectionStatus === 'connecting') return 'Connecting...';
    if (isSharingScreen && botState === 'listening') return 'Watching Screen';
    if (botState === 'hand_raised') return 'Hand Raised';
    return botState === 'speaking' ? 'Speaking...' : 'Listening...';
  };
  const botStatusText = getBotStatusText();

  return (
    <div className="flex flex-col h-full bg-zinc-950 relative overflow-hidden font-sans">
      {showAddBotModal && <AddBotModal onAdd={handleAddBot} onCancel={() => setShowAddBotModal(false)} />}
      
      {/* Report Modal */}
      {viewingReport && (
          <ReportEditor 
            initialContent={viewingReport} 
            onClose={() => setViewingReport(null)}
            title="Generated Report"
            onSave={onSaveReport ? handleSaveReportFromChat : undefined}
          />
      )}

      {/* --- TOP SECTION: VISUAL STAGE --- */}
      <div className="flex-none h-[40vh] min-h-[250px] bg-black relative flex items-center justify-center p-4 z-0">
         <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
         
         <div className="flex gap-4 w-full max-w-6xl h-full items-center justify-center relative z-10">
             {/* LEFT: USER VIDEO / SCREEN SHARE */}
             <div className={`relative rounded-2xl overflow-hidden shadow-2xl transition-all duration-500 border border-zinc-800 bg-zinc-900 ${isSharingScreen ? 'flex-grow aspect-video max-w-4xl' : 'aspect-video w-full max-w-md'}`}>
                 {isSharingScreen ? (
                     <>
                        <video ref={screenVideoRef} autoPlay className="w-full h-full object-contain bg-zinc-900" />
                        <div className="absolute top-2 left-2 bg-blue-600/90 text-white text-xs px-2 py-1 rounded-full flex items-center"><ScreenShareIcon className="w-3 h-3 mr-1"/> You are sharing screen</div>
                     </>
                 ) : (
                    <>
                        <video ref={videoRef} autoPlay muted className="w-full h-full object-cover mirror-mode" />
                        <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-sm font-medium flex items-center">
                            {isMuted ? <MicSlashIcon className="w-3 h-3 text-red-400 mr-2"/> : <MicIcon className="w-3 h-3 text-green-400 mr-2"/>}
                            {config.userName}
                        </div>
                    </>
                 )}
             </div>

             {/* RIGHT: AI VISUALIZER */}
             {!isSharingScreen && (
                 <div className="aspect-video w-full max-w-md relative rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 bg-zinc-900 flex flex-col items-center justify-center">
                     {botConfig ? (
                        <>
                            <div className="relative flex items-center justify-center w-32 h-32">
                                <div className={`w-24 h-24 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 z-10 flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.4)] ${connectionStatus === 'disconnected' ? 'grayscale opacity-50' : ''}`}>
                                    <BotIcon className="w-12 h-12 text-white/90" />
                                </div>
                                {botState === 'speaking' && (
                                    <>
                                        <div className="absolute inset-0 rounded-full border-2 border-blue-400/50 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                                        <div className="absolute inset-2 rounded-full border border-purple-400/30 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite_0.5s]"></div>
                                    </>
                                )}
                            </div>
                            
                            <h2 className="mt-6 text-xl font-bold text-white tracking-wide">{botConfig.persona.name}</h2>
                            <div className="mt-2 flex items-center space-x-2">
                                <span className={`w-2 h-2 rounded-full ${botStatusColor} ${botState === 'speaking' ? 'animate-pulse' : ''}`}></span>
                                <span className="text-sm text-zinc-400 font-medium uppercase tracking-wider">{botStatusText}</span>
                            </div>

                             {connectionStatus === 'disconnected' && (
                                <button onClick={handleReconnect} className="mt-4 px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-xs rounded-full flex items-center transition-colors">
                                    <ArrowPathIcon className="w-3 h-3 mr-1.5" /> Reconnect
                                </button>
                            )}
                        </>
                     ) : (
                        <button onClick={() => setShowAddBotModal(true)} className="group flex flex-col items-center justify-center text-zinc-500 hover:text-blue-400 transition-colors">
                             <div className="p-4 rounded-full bg-zinc-800 group-hover:bg-zinc-700 transition-colors mb-2">
                                <PlusIcon className="w-8 h-8"/>
                             </div>
                             <span className="text-sm font-medium">Add AI Participant</span>
                        </button>
                     )}
                 </div>
             )}
         </div>

         {/* FLOATING CONTROLS */}
         <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
              <div className="bg-zinc-900/90 backdrop-blur-md px-6 py-3 rounded-full flex items-center space-x-6 border border-zinc-700/50 shadow-2xl">
                  <button onClick={toggleMute} className={`p-3 rounded-full transition-all duration-200 ${isMuted ? 'bg-red-500 text-white rotate-0' : 'bg-zinc-700 hover:bg-zinc-600 text-white hover:scale-110'}`} title={isMuted ? "Unmute" : "Mute"}>
                    {isMuted ? <MicSlashIcon className="w-5 h-5" /> : <MicIcon className="w-5 h-5" />}
                  </button>
                  <button onClick={handleToggleScreenShare} className={`p-3 rounded-full transition-all duration-200 ${isSharingScreen ? 'bg-blue-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-white hover:scale-110'}`} title="Share Screen">
                    <ScreenShareIcon className="w-5 h-5" />
                  </button>
                  <div className="w-px h-8 bg-zinc-700 mx-2"></div>
                  <button onClick={handleLeaveCall} className="p-3 rounded-full bg-red-600 hover:bg-red-500 text-white hover:scale-110 transition-all duration-200" title="Leave Call">
                    <PhoneIcon className="w-5 h-5" />
                  </button>
              </div>
         </div>
      </div>

      {/* --- BOTTOM SECTION: CHAT --- */}
      <div className="flex-grow flex flex-col min-h-0 bg-zinc-950 relative max-w-5xl mx-auto w-full border-x border-zinc-900/50">
           {/* Chat Header */}
           <div className="flex-none flex items-center justify-between px-6 py-3 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur z-10">
               <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Live Transcript & Chat</span>
               <div className="flex items-center space-x-2">
                    <button onClick={downloadSummary} className="text-zinc-500 hover:text-white transition-colors flex items-center bg-zinc-900 py-1 px-2 rounded hover:bg-zinc-800" title="Download Report Now">
                        <DownloadIcon className="w-4 h-4 mr-1"/> <span className="text-xs">Export Transcript</span>
                    </button>
               </div>
           </div>

           {/* Scrollable List */}
           <div className="flex-grow overflow-y-auto p-4 space-y-6 scroll-smooth">
               <div className="flex justify-center my-4">
                   <span className="text-xs text-zinc-600 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
                       Session Started • {new Date().toLocaleTimeString()}
                   </span>
               </div>

               {conversationHistory.map((entry, index) => {
                   const isUser = entry.type === 'transcription' ? entry.speaker === 'user' : entry.role === 'user';
                   const isVoice = entry.type === 'transcription';
                   const isReportCandidate = !isUser && (entry.text.includes('# ') || entry.text.length > 300);
                   
                   return (
                       <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                           <div className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
                               <div className={`px-4 py-3 rounded-2xl shadow-sm text-[15px] leading-relaxed relative group
                                   ${isUser 
                                     ? 'bg-blue-600 text-white rounded-br-sm' 
                                     : 'bg-zinc-800 text-gray-100 rounded-bl-sm border border-zinc-700/50'
                                   }
                                   ${isVoice ? (isUser ? 'bg-blue-600/80' : 'bg-zinc-800/80') : ''}
                               `}>
                                   {isReportCandidate ? (
                                       <div className="space-y-2">
                                           <div className="max-h-40 overflow-hidden relative opacity-80 text-sm">
                                                <MarkdownRenderer content={entry.text.slice(0, 300)} />
                                                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-zinc-800 to-transparent"></div>
                                           </div>
                                           <button 
                                                onClick={() => setViewingReport(entry.text)}
                                                className="w-full py-2 bg-zinc-700 hover:bg-blue-600 rounded text-xs font-semibold text-white flex items-center justify-center transition-colors"
                                            >
                                                <DocumentIcon className="w-4 h-4 mr-2" /> View Full Report
                                           </button>
                                       </div>
                                   ) : (
                                       <MarkdownRenderer content={entry.text} />
                                   )}
                                   
                                   <div className={`absolute -bottom-5 ${isUser ? 'right-1' : 'left-1'} text-[10px] text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center`}>
                                       {isVoice && <MicIcon className="w-3 h-3 mr-1 inline"/>}
                                       {isVoice ? 'Transcribed' : 'Typed'}
                                   </div>
                               </div>
                           </div>
                       </div>
                   );
               })}

               {/* Ghosts */}
               {realtimeInput && realtimeInput.trim().length > 0 && (
                   <div className="flex justify-end">
                       <div className="max-w-[85%] md:max-w-[70%] flex flex-col items-end">
                           <div className="px-4 py-3 rounded-2xl rounded-br-sm bg-blue-600/40 text-blue-100 border border-blue-500/30 backdrop-blur-sm animate-pulse">
                               <p className="text-[15px] leading-relaxed">{realtimeInput.charAt(0).toUpperCase() + realtimeInput.slice(1)}</p>
                           </div>
                           <span className="text-[10px] text-blue-400 mt-1 mr-1 flex items-center">
                               <MicIcon className="w-3 h-3 mr-1 animate-bounce"/> Listening...
                           </span>
                       </div>
                   </div>
               )}

               {smoothOutput && (
                   <div className="flex justify-start">
                       <div className="max-w-[85%] md:max-w-[70%] flex flex-col items-start">
                           <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-zinc-800/60 text-gray-300 border border-zinc-700/50 backdrop-blur-sm">
                               <p className="text-[15px] leading-relaxed">{smoothOutput}<span className="inline-block w-1.5 h-4 bg-zinc-400 ml-1 align-middle animate-blink"></span></p>
                           </div>
                           <span className="text-[10px] text-zinc-500 mt-1 ml-1 flex items-center">
                               <BotIcon className="w-3 h-3 mr-1 animate-spin"/> Generating audio...
                           </span>
                       </div>
                   </div>
               )}

               {isChatLoading && (
                   <div className="flex justify-start">
                        <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-zinc-800 text-gray-400">
                             <div className="flex space-x-1">
                                 <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0s'}}></div>
                                 <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s'}}></div>
                                 <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s'}}></div>
                             </div>
                        </div>
                   </div>
               )}

               <div ref={conversationEndRef} className="h-4" />
           </div>

           {/* Input Area */}
           <div className="flex-none p-4 border-t border-zinc-900 bg-zinc-950">
                <div className="max-w-4xl mx-auto">
                    {attachment && (
                        <div className="flex items-center mb-2 bg-zinc-900 p-2 rounded-lg border border-zinc-800 w-fit">
                            {attachment.type === 'image' ? (
                                <img src={attachment.preview} alt="Attachment" className="w-8 h-8 rounded object-cover mr-2"/>
                            ) : (
                                <div className="w-8 h-8 bg-zinc-800 rounded flex items-center justify-center mr-2 text-zinc-400">
                                    <DocumentIcon className="w-5 h-5"/>
                                </div>
                            )}
                            <span className="text-xs text-zinc-300 mr-2 max-w-[150px] truncate">{attachment.file.name}</span>
                            <button onClick={removeAttachment} className="text-zinc-500 hover:text-red-400"><XIcon className="w-4 h-4"/></button>
                        </div>
                    )}
                    
                    {botConfig ? (
                        <form onSubmit={handleSendChatMessage} className="flex items-center gap-2 bg-zinc-900 p-2 rounded-full border border-zinc-800 focus-within:ring-2 focus-within:ring-blue-600/50 transition-all shadow-lg">
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
                                className="p-2 text-zinc-400 hover:text-blue-400 transition-colors rounded-full hover:bg-zinc-800"
                                title="Attach context"
                            >
                                <PlusIcon className="w-5 h-5" />
                            </button>
                            
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Type a message to AI..."
                                className="flex-grow bg-transparent border-none focus:ring-0 text-white placeholder-zinc-500 text-sm"
                                disabled={isChatLoading || connectionStatus !== 'connected'}
                            />
                            
                            <button 
                                type="submit" 
                                disabled={isChatLoading || (!chatInput.trim() && !attachment) || connectionStatus !== 'connected'} 
                                className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:opacity-50 disabled:bg-zinc-700 transition-colors"
                            >
                                <SendIcon className="w-4 h-4"/>
                            </button>
                        </form>
                    ) : (
                        <div className="text-center text-sm text-zinc-500 py-3">Add an AI Expert above to start the session.</div>
                    )}
                </div>
           </div>
      </div>
    </div>
  );
};

export default MeetingRoom;
