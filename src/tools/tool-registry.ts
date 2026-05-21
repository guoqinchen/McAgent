import { Tool } from '../types/tool.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private categories: Map<string, string[]> = new Map();

  register(tool: Tool, category: string = 'general'): void {
    this.tools.set(tool.name, tool);
    
    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    this.categories.get(category)?.push(tool.name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getByCategory(category: string): Tool[] {
    const names = this.categories.get(category) || [];
    return names.map(name => this.tools.get(name)!).filter(Boolean);
  }

  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  unregister(name: string): void {
    const tool = this.tools.get(name);
    if (tool) {
      this.tools.delete(name);
      for (const [category, names] of this.categories) {
        const index = names.indexOf(name);
        if (index !== -1) {
          names.splice(index, 1);
        }
      }
    }
  }

  toOpenAIFormat(): unknown[] {
    return this.getAll().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
}

export const toolRegistry = new ToolRegistry();
