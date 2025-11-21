
export interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  placeholder: string;
}

export interface MeetingConfig {
  userName: string;
  stream?: MediaStream;
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
