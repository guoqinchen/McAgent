import * as path from 'path';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { writeFile, readFile, unlink } from 'node:fs/promises';
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
    // Constructor can remain sync — runs once at startup, not on hot path
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
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

    // Fire and forget — this.ensureDirExists() already ran in constructor
    this.save(session);
    return session;
  }

  async save(session: Session): Promise<void> {
    session.lastModifiedAt = new Date();
    const filePath = this.getSessionFilePath(session.id);
    const data = JSON.stringify(session, null, 2);
    await writeFile(filePath, data, 'utf-8');
  }

  async load(sessionId: string): Promise<Session | undefined> {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      if (!existsSync(filePath)) {
        return undefined;
      }
      const data = await readFile(filePath, 'utf-8');
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

  async list(options?: SessionListOptions): Promise<Session[]> {
    try {
      const files = readdirSync(this.sessionsDir);
      const sessionFiles = files.filter(f => f.endsWith('.json'));

      const sessions: Session[] = [];
      for (const file of sessionFiles) {
        const sessionId = file.replace('.json', '');
        const session = await this.load(sessionId);
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

  async delete(sessionId: string): Promise<boolean> {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      if (existsSync(filePath)) {
        await unlink(filePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async update(sessionId: string, updates: Partial<Session>): Promise<Session | undefined> {
    const session = await this.load(sessionId);
    if (!session) {
      return undefined;
    }

    const updated: Session = {
      ...session,
      ...updates,
      lastModifiedAt: new Date(),
    };

    await this.save(updated);
    return updated;
  }

  async addMessage(sessionId: string, message: ChatCompletionMessage): Promise<Session | undefined> {
    const session = await this.load(sessionId);
    if (!session) {
      return undefined;
    }

    session.messages.push(message);
    session.lastModifiedAt = new Date();
    await this.save(session);

    return session;
  }

  async clearMessages(sessionId: string): Promise<Session | undefined> {
    const session = await this.load(sessionId);
    if (!session) {
      return undefined;
    }

    session.messages = [];
    session.lastModifiedAt = new Date();
    await this.save(session);

    return session;
  }

  getSessionCount(): number {
    try {
      const files = readdirSync(this.sessionsDir);
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
