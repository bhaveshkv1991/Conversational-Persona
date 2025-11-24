
export interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  placeholder: string;
}

export interface RoomResource {
  id: string;
  name: string;
  type: string;
  content: string; // Base64 content
}

export interface RoomReport {
  id: string;
  createdAt: number;
  summary: string;
  transcript: string;
}

export interface Room {
  id: string;
  name: string;
  persona: Persona;
  resources: RoomResource[];
  reports: RoomReport[];
  createdAt: number;
}

export interface MeetingConfig {
  userName: string;
  stream?: MediaStream;
  room?: Room; // Context from the dashboard
  previousContext?: string; // Text from previous sessions to restore context
}

export interface Transcription {
  type: 'transcription';
  speaker: 'user' | 'model';
  text: string;
}

export type BotState = 'listening' | 'hand_raised' | 'speaking';

export interface ChatMessage {
  type: 'chat';
  role: 'user' | 'model';
  text: string;
}

export type ConversationEntry = Transcription | ChatMessage;
