import * as fs from 'fs';
import * as path from 'path';
import { ChatCompletionMessage } from '../types/llm-provider.js';

export interface Session {
  id: string;
  name: string;
  messages: ChatCompletionMessage[];
  createdAt: Date;
  lastModifiedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface SessionCreateOptions {
  name?: string;
  initialMessages?: ChatCompletionMessage[];
  metadata?: Record<string, unknown>;
}

export interface SessionListOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'lastModifiedAt';
  sortOrder?: 'asc' | 'desc';
}

export class FileBasedSessionManager {
  private sessionsDir: string;

  constructor(baseDir?: string) {
    this.sessionsDir = baseDir || path.join(process.env.HOME || '', '.mcagent', 'sessions');
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private getSessionFilePath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }

  create(options?: SessionCreateOptions): Session {
    const now = new Date();
    const session: Session = {
      id: this.generateId(),
      name: options?.name || `Session ${now.toLocaleString()}`,
      messages: options?.initialMessages || [],
      createdAt: now,
      lastModifiedAt: now,
      metadata: options?.metadata,
    };

    this.save(session);
    return session;
  }

  save(session: Session): void {
    session.lastModifiedAt = new Date();
    const filePath = this.getSessionFilePath(session.id);
    const data = JSON.stringify(session, null, 2);
    fs.writeFileSync(filePath, data);
  }

  load(sessionId: string): Session | undefined {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      if (!fs.existsSync(filePath)) {
        return undefined;
      }
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        lastModifiedAt: new Date(parsed.lastModifiedAt),
      };
    } catch {
      return undefined;
    }
  }

  list(options?: SessionListOptions): Session[] {
    try {
      const files = fs.readdirSync(this.sessionsDir);
      const sessionFiles = files.filter(f => f.endsWith('.json'));
      
      const sessions: Session[] = [];
      for (const file of sessionFiles) {
        const sessionId = file.replace('.json', '');
        const session = this.load(sessionId);
        if (session) {
          sessions.push(session);
        }
      }

      const sortBy = options?.sortBy || 'lastModifiedAt';
      const sortOrder = options?.sortOrder || 'desc';
      
      sessions.sort((a, b) => {
        const aVal = a[sortBy].getTime();
        const bVal = b[sortBy].getTime();
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      });

      const limit = options?.limit ?? sessions.length;
      const offset = options?.offset ?? 0;
      
      return sessions.slice(offset, offset + limit);
    } catch {
      return [];
    }
  }

  delete(sessionId: string): boolean {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  update(sessionId: string, updates: Partial<Session>): Session | undefined {
    const session = this.load(sessionId);
    if (!session) {
      return undefined;
    }

    const updated: Session = {
      ...session,
      ...updates,
      lastModifiedAt: new Date(),
    };

    this.save(updated);
    return updated;
  }

  addMessage(sessionId: string, message: ChatCompletionMessage): Session | undefined {
    const session = this.load(sessionId);
    if (!session) {
      return undefined;
    }

    session.messages.push(message);
    session.lastModifiedAt = new Date();
    this.save(session);

    return session;
  }

  clearMessages(sessionId: string): Session | undefined {
    const session = this.load(sessionId);
    if (!session) {
      return undefined;
    }

    session.messages = [];
    session.lastModifiedAt = new Date();
    this.save(session);

    return session;
  }

  getSessionCount(): number {
    try {
      const files = fs.readdirSync(this.sessionsDir);
      return files.filter(f => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const sessionManager = new FileBasedSessionManager();
