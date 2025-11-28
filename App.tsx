import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import Lobby from './components/ComplexQuery'; 
import MeetingRoom from './components/MeetingRoom';
import Dashboard from './components/Dashboard';
import type { MeetingConfig, Room, RoomReport } from './types';
import { PERSONAS } from './constants';

const App: React.FC = () => {
  const [meetingConfig, setMeetingConfig] = useState<MeetingConfig | null>(null);
  const [view, setView] = useState<'dashboard' | 'lobby' | 'meeting'>('dashboard');
  const [currentRoom, setCurrentRoom] = useState<Room | undefined>(undefined);
  const [guestHostId, setGuestHostId] = useState<string | null>(null);

  useEffect(() => {
    // Routing based on URL search params
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    const hostId = params.get('hostId');

    if (hostId) {
        setGuestHostId(hostId);
        // Create a temporary guest room if one doesn't exist
        const guestRoom: Room = {
            id: 'guest-room',
            name: 'Guest Session',
            persona: PERSONAS[0],
            resources: [],
            reports: [],
            createdAt: Date.now()
        };
        setCurrentRoom(guestRoom);
        setView('lobby');
    } else if (roomId) {
      const savedRooms = localStorage.getItem('gemini_showcase_rooms');
      if (savedRooms) {
        try {
          const rooms: Room[] = JSON.parse(savedRooms);
          const foundRoom = rooms.find(r => r.id === roomId);
          if (foundRoom) {
            setCurrentRoom(foundRoom);
            setView('lobby');
          } else {
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
          const newUrl = `${window.location.pathname}?room=${roomId}`;
          window.history.pushState({ path: newUrl }, '', newUrl);
      }
  };

  const handleStartMeeting = (config: MeetingConfig) => {
    // If we have a hostId from the URL, inject it into the config
    if (guestHostId) {
        config.connectToHostId = guestHostId;
    }
    setMeetingConfig(config);
    setView('meeting');
  };

  const handleUpdateRoom = (updatedRoom: Room) => {
    // Don't save guest rooms
    if (updatedRoom.id === 'guest-room') return;

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
    if (currentRoom && report && currentRoom.id !== 'guest-room') {
        const updatedRoom = { 
            ...currentRoom, 
            reports: [report, ...(currentRoom.reports || [])] 
        };
        
        setCurrentRoom(updatedRoom);
        
        try {
            const savedRooms = JSON.parse(localStorage.getItem('gemini_showcase_rooms') || '[]');
            const newRooms = savedRooms.map((r: Room) => r.id === updatedRoom.id ? updatedRoom : r);
            localStorage.setItem('gemini_showcase_rooms', JSON.stringify(newRooms));
        } catch(e) {
            console.error("Failed to save report", e);
        }
    }

    setMeetingConfig(null);
    setView('lobby');
    
    // Clear host ID on leave so user can start fresh if they want
    if (guestHostId) {
        setGuestHostId(null);
        window.history.replaceState(null, '', window.location.pathname);
    }
  };
  
  const handleSaveSessionReport = (report: RoomReport) => {
     if (currentRoom && currentRoom.id !== 'guest-room') {
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
    setGuestHostId(null);
    window.history.replaceState(null, '', window.location.pathname);
  }

  return (
    <div className="h-[100dvh] bg-zinc-950 text-gray-100 flex flex-col font-sans overflow-hidden">
      <header className="flex-shrink-0 bg-zinc-950 border-b border-zinc-900 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-center relative">
            <h1 className="text-xl font-semibold text-white">Expert Call Assistant</h1>
            {guestHostId && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-1 bg-blue-900/50 border border-blue-800 text-blue-200 text-xs rounded-full animate-pulse">
                    Joining as Guest
                </div>
            )}
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