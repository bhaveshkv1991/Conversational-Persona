import React, { useState } from 'react';
import Lobby from './components/ComplexQuery'; 
import MeetingRoom from './components/LiveChat';
import type { MeetingConfig } from './types';

const App: React.FC = () => {
  const [meetingConfig, setMeetingConfig] = useState<MeetingConfig | null>(null);

  const handleJoin = (config: MeetingConfig) => {
    setMeetingConfig(config);
  };

  const handleLeave = () => {
    setMeetingConfig(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-gray-100 flex flex-col font-sans">
      <header className="flex-shrink-0 bg-zinc-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-center">
            <h1 className="text-xl font-semibold text-white">Gemini Conversational AI Showcase</h1>
        </div>
      </header>
      <main className="flex-grow flex flex-col overflow-hidden">
        {!meetingConfig ? (
            <Lobby onJoin={handleJoin} />
        ) : (
            <MeetingRoom config={meetingConfig} onLeave={handleLeave} />
        )}
      </main>
    </div>
  );
};

export default App;