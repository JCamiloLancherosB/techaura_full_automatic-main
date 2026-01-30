import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const SESSIONS_FILE = path.join(DATA_DIR, 'chat_sessions.json');

interface ChatSession {
  recipientPhone: string;
  currentState: string;
  pendingData: Record<string, any>;
  lastActivity: string;
}

export class SessionPersistence {
  saveSessions(sessions: Map<string, any>): boolean {
    try {
      const dir = path.dirname(SESSIONS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const data = Array.from(sessions.entries()).map(([phone, session]) => ({
        recipientPhone: phone,
        ...session,
        // Only set lastActivity if not already present
        lastActivity: session.lastActivity || new Date().toISOString()
      }));
      
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving sessions:', error);
      return false;
    }
  }

  loadSessions(): Map<string, any> {
    try {
      if (!fs.existsSync(SESSIONS_FILE)) {
        return new Map();
      }
      
      const data: ChatSession[] = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
      
      // Validate and filter sessions
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const validSessions = data.filter(s => {
        // Validate required fields
        if (!s.recipientPhone || !s.lastActivity) {
          console.warn('Skipping invalid session: missing required fields');
          return false;
        }
        // Filter old sessions (more than 24 hours)
        return s.lastActivity > cutoff;
      });
      
      return new Map(validSessions.map(s => [s.recipientPhone, s]));
    } catch (error) {
      console.error('Error loading sessions:', error);
      return new Map();
    }
  }
}

export const sessionPersistence = new SessionPersistence();
