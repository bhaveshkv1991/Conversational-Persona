
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import Lobby from './components/ComplexQuery'; 
import MeetingRoom from './components/MeetingRoom';
import Dashboard from './components/Dashboard';
import type { MeetingConfig, Room, RoomReport } from './types';

const App: React.FC = () => {
  const [meetingConfig, setMeetingConfig] = useState<MeetingConfig | null>(null);
  const [view, setView] = useState<'dashboard' | 'lobby' | 'meeting'>('dashboard');
  const [currentRoom, setCurrentRoom] = useState<Room | undefined>(undefined);

  useEffect(() => {
    // Basic routing based on URL search params
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');

    if (roomId) {
      const savedRooms = localStorage.getItem('gemini_showcase_rooms');
      if (savedRooms) {
        try {
          const rooms: Room[] = JSON.parse(savedRooms);
          const foundRoom = rooms.find(r => r.id === roomId);
          if (foundRoom) {
            setCurrentRoom(foundRoom);
            setView('lobby');
          } else {
             // Clean URL if room not found locally
             window.history.replaceState(null, '', window.location.pathname);
             setView('dashboard');
          }
        } catch (e) {
            console.error(e);
            setView('dashboard');
        }
      }
    }
  }, []);

  const handleJoinLobby = (roomId: string) => {
      const savedRooms = localStorage.getItem('gemini_showcase_rooms');
      if (savedRooms) {
          const rooms: Room[] = JSON.parse(savedRooms);
          const foundRoom = rooms.find(r => r.id === roomId);
          setCurrentRoom(foundRoom);
          setView('lobby');
          // Update URL for shareability (local only warning applied in Dashboard)
          const newUrl = `${window.location.pathname}?room=${roomId}`;
          window.history.pushState({ path: newUrl }, '', newUrl);
      }
  };

  const handleStartMeeting = (config: MeetingConfig) => {
    setMeetingConfig(config);
    setView('meeting');
  };

  const handleUpdateRoom = (updatedRoom: Room) => {
    setCurrentRoom(updatedRoom);
    try {
        const savedRooms = JSON.parse(localStorage.getItem('gemini_showcase_rooms') || '[]');
        const newRooms = savedRooms.map((r: Room) => r.id === updatedRoom.id ? updatedRoom : r);
        localStorage.setItem('gemini_showcase_rooms', JSON.stringify(newRooms));
    } catch(e) {
        console.error("Failed to save room update", e);
    }
  };

  const handleLeave = (report?: RoomReport) => {
    if (currentRoom && report) {
        const updatedRoom = { 
            ...currentRoom, 
            reports: [report, ...(currentRoom.reports || [])] 
        };
        
        // Update State
        setCurrentRoom(updatedRoom);
        
        // Persist to LocalStorage
        try {
            const savedRooms = JSON.parse(localStorage.getItem('gemini_showcase_rooms') || '[]');
            const newRooms = savedRooms.map((r: Room) => r.id === updatedRoom.id ? updatedRoom : r);
            localStorage.setItem('gemini_showcase_rooms', JSON.stringify(newRooms));
        } catch(e) {
            console.error("Failed to save report", e);
        }
    }

    setMeetingConfig(null);
    // Return to lobby instead of dashboard to see the new report
    setView('lobby');
  };
  
  const handleSaveSessionReport = (report: RoomReport) => {
     if (currentRoom) {
         const updatedRoom = { 
             ...currentRoom, 
             reports: [report, ...(currentRoom.reports || [])] 
         };
         handleUpdateRoom(updatedRoom);
     }
  };
  
  const handleBackToDashboard = () => {
    setView('dashboard');
    setCurrentRoom(undefined);
    window.history.replaceState(null, '', window.location.pathname);
  }

  return (
    <div className="h-[100dvh] bg-zinc-950 text-gray-100 flex flex-col font-sans overflow-hidden">
      <header className="flex-shrink-0 bg-zinc-950 border-b border-zinc-900 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-center">
            <h1 className="text-xl font-semibold text-white">Gemini Conversational AI Showcase</h1>
        </div>
      </header>
      <main className="flex-grow flex flex-col overflow-hidden relative">
        {view === 'dashboard' && (
            <Dashboard onJoinRoom={handleJoinLobby} />
        )}
        {view === 'lobby' && (
            <Lobby 
                onJoin={handleStartMeeting} 
                room={currentRoom} 
                onBack={handleBackToDashboard}
                onUpdateRoom={handleUpdateRoom}
            />
        )}
        {view === 'meeting' && meetingConfig && (
            <MeetingRoom 
                config={meetingConfig} 
                onLeave={handleLeave} 
                onSaveReport={handleSaveSessionReport} 
            />
        )}
      </main>
    </div>
  );
};

export default App;
