
import React, { useState, useEffect, useRef } from 'react';
import type { Persona, Room, RoomResource } from '../types';
import { PERSONAS } from '../constants';
import { PlusIcon, TrashIcon, DocumentIcon, CopyIcon, ArrowPathIcon, LinkIcon, VideoCameraIcon, ShareIcon } from './icons/Icons';

interface DashboardProps {
  onJoinRoom: (roomId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onJoinRoom }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);
  const [roomName, setRoomName] = useState('');
  const [resources, setResources] = useState<RoomResource[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load rooms from localStorage
    const savedRooms = localStorage.getItem('gemini_showcase_rooms');
    if (savedRooms) {
      try {
        setRooms(JSON.parse(savedRooms));
      } catch (e) {
        console.error("Failed to parse rooms", e);
      }
    }
  }, []);

  const saveRooms = (newRooms: Room[]) => {
    setRooms(newRooms);
    localStorage.setItem('gemini_showcase_rooms', JSON.stringify(newRooms));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files: File[] = Array.from(e.target.files);
      const newResources: RoomResource[] = [];

      for (const file of files) {
        // Basic size check (1MB limit to prevent LocalStorage quota errors)
        if (file.size > 1 * 1024 * 1024) {
          alert(`File ${file.name} is too large (>1MB). Skipping to prevent storage issues.`);
          continue;
        }

        // Manual MIME type detection for common text formats that browsers might miss or mislabel
        let mimeType = file.type;
        if (!mimeType || mimeType === "") {
             const ext = file.name.split('.').pop()?.toLowerCase();
             if (ext === 'md') mimeType = 'text/markdown';
             else if (ext === 'txt') mimeType = 'text/plain';
             else if (ext === 'json') mimeType = 'application/json';
             else if (ext === 'csv') mimeType = 'text/csv';
             else if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'py', 'rb', 'java', 'c', 'cpp'].includes(ext || '')) mimeType = 'text/plain';
        }

        try {
          const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file); // Store as Base64
          });

          newResources.push({
            id: crypto.randomUUID(),
            name: file.name,
            type: mimeType || 'application/octet-stream',
            content: content.split(',')[1] // Remove data URL prefix
          });
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
      setResources(prev => [...prev, ...newResources]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddLink = () => {
    if (!linkInput.trim()) return;
    try {
        new URL(linkInput); // Simple validation
        const newResource: RoomResource = {
            id: crypto.randomUUID(),
            name: linkInput,
            type: 'link',
            content: linkInput
        };
        setResources(prev => [...prev, newResource]);
        setLinkInput('');
    } catch (e) {
        alert("Please enter a valid URL (e.g., https://example.com)");
    }
  };

  const removeResource = (id: string) => {
    setResources(prev => prev.filter(r => r.id !== id));
  };

  const createRoom = () => {
    if (!roomName.trim()) return;

    const newRoom: Room = {
      id: crypto.randomUUID(),
      name: roomName,
      persona: selectedPersona,
      resources: resources,
      reports: [], // Initialize empty reports
      createdAt: Date.now()
    };

    const updatedRooms = [newRoom, ...rooms];
    saveRooms(updatedRooms);
    setIsCreating(false);
    resetForm();
    onJoinRoom(newRoom.id);
  };

  const deleteRoom = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedRooms = rooms.filter(r => r.id !== id);
    saveRooms(updatedRooms);
  };

  const resetForm = () => {
    setRoomName('');
    setResources([]);
    setLinkInput('');
    setSelectedPersona(PERSONAS[0]);
  };

  const copyLink = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Use origin + pathname to ensure we stay on the same app path (e.g. if hosted in subdir or on IDX)
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    alert("Lobby link copied to clipboard!");
  };

  const getResourceIcon = (type: string) => {
      if (type === 'link') return <LinkIcon className="w-4 h-4 text-green-400 flex-shrink-0" />;
      if (type.startsWith('video/')) return <VideoCameraIcon className="w-4 h-4 text-purple-400 flex-shrink-0" />;
      if (type.startsWith('image/')) return <DocumentIcon className="w-4 h-4 text-yellow-400 flex-shrink-0" />;
      return <DocumentIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />;
  };

  if (isCreating) {
    return (
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-6">
          <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
            <h2 className="text-2xl font-bold text-white">Create New Lobby</h2>
            <button onClick={() => setIsCreating(false)} className="text-zinc-400 hover:text-white">Cancel</button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Lobby Name</label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g., Q3 Architecture Review"
                className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-md focus:ring-2 focus:ring-blue-500 text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Select AI Expert</label>
              <select
                value={selectedPersona.id}
                onChange={(e) => setSelectedPersona(PERSONAS.find(p => p.id === e.target.value) || PERSONAS[0])}
                className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-md focus:ring-2 focus:ring-blue-500 text-white"
              >
                {PERSONAS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Context Resources</label>
              <div className="flex flex-col space-y-2 mb-2">
                 <div className="flex space-x-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      multiple
                      className="hidden"
                      accept=".txt,.md,.json,.pdf,.csv,.xml,.js,.ts,.tsx,.html,.css,image/*,video/*"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-2 rounded flex-1 flex items-center justify-center"
                    >
                      <PlusIcon className="w-4 h-4 mr-2" /> Upload Files
                    </button>
                 </div>
                 <div className="flex space-x-2">
                     <input 
                        type="text" 
                        value={linkInput}
                        onChange={(e) => setLinkInput(e.target.value)}
                        placeholder="Or add a URL link..."
                        className="flex-grow p-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white"
                     />
                     <button
                        onClick={handleAddLink}
                        disabled={!linkInput}
                        className="text-sm bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-2 rounded disabled:opacity-50"
                     >
                         Add Link
                     </button>
                 </div>
              </div>
              <p className="text-xs text-zinc-500 mb-2">Supported: Images, Video, PDF, Text, Markdown, JSON, Links. (Max 1MB per file for local demo).</p>
              
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {resources.length === 0 && <div className="text-sm text-zinc-600 italic text-center py-4 border border-zinc-800 rounded border-dashed">No resources added</div>}
                {resources.map(res => (
                  <div key={res.id} className="flex items-center justify-between bg-zinc-800 p-2 rounded border border-zinc-700">
                    <div className="flex items-center space-x-2 overflow-hidden">
                      {getResourceIcon(res.type)}
                      <span className="text-sm text-gray-200 truncate">{res.name}</span>
                      <span className="text-xs text-gray-500 uppercase">({res.type.includes('link') ? 'LINK' : res.type.split('/').pop()})</span>
                    </div>
                    <button onClick={() => removeResource(res.id)} className="text-zinc-500 hover:text-red-400">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={createRoom}
              disabled={!roomName.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col items-center p-6 max-w-7xl mx-auto w-full">
      <div className="w-full flex justify-between items-center mb-8">
        <div>
           <h1 className="text-3xl font-bold text-white">AI Meeting Lobbies</h1>
           <p className="text-zinc-400">Manage your persistent meeting rooms and contexts.</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md font-semibold flex items-center shadow-lg transition-transform hover:scale-105"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          New Lobby
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        {rooms.length === 0 ? (
           <div className="col-span-full text-center py-20 bg-zinc-900/50 rounded-xl border border-dashed border-zinc-800">
               <div className="text-zinc-500 mb-4">No lobbies found. Create one to get started.</div>
           </div>
        ) : (
          rooms.map(room => (
            <div
              key={room.id}
              onClick={() => onJoinRoom(room.id)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-blue-500/50 transition-all cursor-pointer group relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-bold text-white truncate pr-8">{room.name}</h3>
                <div className="flex space-x-1 absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => deleteRoom(room.id, e)}
                        className="p-1.5 bg-zinc-800 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-700"
                        title="Delete Lobby"
                    >
                        <TrashIcon className="w-4 h-4" />
                    </button>
                </div>
              </div>
              
              <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-zinc-400">
                      <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                      {room.persona.name}
                  </div>
                  <div className="flex items-center text-sm text-zinc-400">
                      <DocumentIcon className="w-4 h-4 mr-2" />
                      {room.resources.length} Resources
                  </div>
                  {room.reports && room.reports.length > 0 && (
                     <div className="flex items-center text-sm text-zinc-400">
                        <ArrowPathIcon className="w-4 h-4 mr-2" />
                        {room.reports.length} Past Sessions
                     </div>
                  )}
              </div>
              
              <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center">
                  <span className="text-xs text-zinc-600">Created {new Date(room.createdAt).toLocaleDateString()}</span>
                  
                  <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => copyLink(room.id, e)}
                        className="text-zinc-400 hover:text-white px-2 py-1 rounded text-xs font-medium flex items-center transition-colors hover:bg-zinc-800"
                        title="Share Lobby Link"
                      >
                        <ShareIcon className="w-3.5 h-3.5 mr-1.5" /> Share
                      </button>
                      <span className="text-blue-400 text-sm font-medium group-hover:underline pl-2 border-l border-zinc-800">Enter &rarr;</span>
                  </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Dashboard;
