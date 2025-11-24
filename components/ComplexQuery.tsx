import React, { useState, useRef, useEffect } from 'react';
import type { MeetingConfig, Room, RoomReport } from '../types';
import { ArrowLeftIcon, DocumentIcon, EyeIcon } from './icons/Icons';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ReportEditor } from './ReportEditor';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}

const Lobby: React.FC<{ onJoin: (config: MeetingConfig) => void; room?: Room; onBack?: () => void; onUpdateRoom?: (room: Room) => void }> = ({ onJoin, room, onBack, onUpdateRoom }) => {
  const [userName, setUserName] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [isKeySelected, setIsKeySelected] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [selectedReport, setSelectedReport] = useState<RoomReport | null>(null);
  
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
      if (!isJoiningRef.current) {
          streamRef.current?.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleSelectKey = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
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
    
    // Resume Logic: Grab the latest transcript if available
    let previousContext = '';
    if (room && room.reports && room.reports.length > 0) {
        // Use the most recent report to restore context
        previousContext = room.reports[0].transcript;
        console.log("Resuming session with previous context length:", previousContext.length);
    }

    onJoin({
      userName,
      stream: streamRef.current || undefined,
      room: room,
      previousContext
    });
  };

  const handleSaveReport = (updatedContent: string) => {
      if (room && onUpdateRoom && selectedReport) {
          const updatedReport = { ...selectedReport, summary: updatedContent };
          const updatedReports = room.reports.map(r => r.id === updatedReport.id ? updatedReport : r);
          onUpdateRoom({ ...room, reports: updatedReports });
          setSelectedReport(updatedReport); // Update local view
      }
  };

  const renderContent = () => {
    if (isCheckingKey) {
        return <p className="text-zinc-400 text-center">Checking API key status...</p>;
    }
    
    if (!isKeySelected) {
        return (
            <div className="text-center">
                <h1 className="text-3xl font-bold text-white mb-2">API Key Required</h1>
                <button
                    onClick={handleSelectKey}
                    className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-500 transition-colors mt-4"
                >
                    Select API Key
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-white mb-2">{room ? `Join ${room.name}` : 'Join Meeting'}</h1>
                {room && <p className="text-zinc-400">Host AI: {room.persona.name}</p>}
                {room?.reports && room.reports.length > 0 && (
                    <div className="inline-block mt-2 px-3 py-1 bg-green-900/50 border border-green-800 text-green-400 text-xs rounded-full">
                        Resume from last session ({new Date(room.reports[0].createdAt).toLocaleDateString()})
                    </div>
                )}
            </div>

            <form onSubmit={handleJoin} className="space-y-4">
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
                    className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-500 disabled:bg-zinc-600 transition-colors"
                >
                    {room?.reports?.length ? 'Resume Conversation' : 'Join now'}
                </button>
            </form>
        </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col md:flex-row p-4 relative h-full overflow-hidden">
      {onBack && (
        <button onClick={onBack} className="absolute top-4 left-4 text-zinc-400 hover:text-white flex items-center z-10">
            <ArrowLeftIcon className="w-5 h-5 mr-1"/> Back to Dashboard
        </button>
      )}
      
      {/* Report Editor Modal */}
      {selectedReport && (
          <ReportEditor 
            initialContent={selectedReport.summary}
            title="Session Report"
            timestamp={selectedReport.createdAt}
            onClose={() => setSelectedReport(null)} 
            onSave={handleSaveReport} 
          />
      )}
      
      {/* Left Column: Media Preview */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-4">
          <div className="w-full max-w-md space-y-6">
            <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center shadow-2xl ring-1 ring-zinc-800 relative">
                {mediaError ? (
                  <div className="text-center text-red-400 p-4"><p>{mediaError}</p></div>
                ) : (
                  <video ref={videoRef} autoPlay muted className="w-full h-full object-cover"></video>
                )}
                 <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded text-white text-sm">
                    Camera Check
                 </div>
            </div>
            {renderContent()}
          </div>
      </div>

      {/* Right Column: Room Details & History */}
      {room && (
          <div className="w-full md:w-1/2 bg-zinc-900/50 border-l border-zinc-800 p-6 overflow-y-auto">
             <div className="max-w-xl mx-auto space-y-8">
                 
                 {/* Resources Section */}
                 <div>
                     <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                         <DocumentIcon className="w-5 h-5 mr-2 text-blue-400"/> Room Resources
                     </h3>
                     {room.resources.length === 0 ? (
                         <p className="text-sm text-zinc-500 italic">No resources uploaded.</p>
                     ) : (
                         <div className="grid grid-cols-1 gap-2">
                             {room.resources.map(res => (
                                 <div key={res.id} className="flex items-center bg-zinc-800 p-2 rounded border border-zinc-700">
                                     <DocumentIcon className="w-4 h-4 text-zinc-400 mr-2"/>
                                     <div className="flex-grow min-w-0">
                                         <p className="text-sm text-gray-200 truncate">{res.name}</p>
                                     </div>
                                     <span className="text-xs text-zinc-500 uppercase ml-2">{res.type.split('/')[1]}</span>
                                 </div>
                             ))}
                         </div>
                     )}
                 </div>

                 {/* Reports Section */}
                 <div>
                     <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                         <DocumentIcon className="w-5 h-5 mr-2 text-green-400"/> Session History
                     </h3>
                      {(!room.reports || room.reports.length === 0) ? (
                         <p className="text-sm text-zinc-500 italic">No past sessions recorded.</p>
                     ) : (
                         <div className="space-y-4">
                             {room.reports.map((report, idx) => (
                                 <div key={report.id} className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 group hover:border-blue-500/50 transition-colors">
                                     <div className="flex justify-between items-center mb-2">
                                         <h4 className="font-medium text-white">Session {room.reports.length - idx}</h4>
                                         <span className="text-xs text-zinc-500">{new Date(report.createdAt).toLocaleString()}</span>
                                     </div>
                                     <div className="max-h-32 overflow-hidden relative mb-4">
                                         <div className="text-xs text-zinc-400 whitespace-pre-line">
                                            <MarkdownRenderer content={report.summary.slice(0, 300) + '...'} />
                                         </div>
                                         <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-zinc-800 to-transparent"></div>
                                     </div>
                                     <button 
                                        onClick={() => setSelectedReport(report)}
                                        className="w-full py-2.5 bg-zinc-700 hover:bg-blue-600 text-sm text-white rounded font-medium flex items-center justify-center transition-all shadow-lg"
                                     >
                                         <EyeIcon className="w-4 h-4 mr-2" /> View & Download Report
                                     </button>
                                 </div>
                             ))}
                         </div>
                     )}
                 </div>

             </div>
          </div>
      )}
    </div>
  );
};

export default Lobby;