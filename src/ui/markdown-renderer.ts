export interface RenderOptions {
  enableColors?: boolean;
  enableBold?: boolean;
  enableItalic?: boolean;
  enableUnderline?: boolean;
  enableCode?: boolean;
  enableLinks?: boolean;
}

export class MarkdownRenderer {
  private readonly enableColors: boolean;
  private readonly enableBold: boolean;
  private readonly enableItalic: boolean;
  private readonly enableUnderline: boolean;
  private readonly enableCode: boolean;
  private readonly enableLinks: boolean;

  constructor(options?: RenderOptions) {
    this.enableColors = options?.enableColors ?? true;
    this.enableBold = options?.enableBold ?? true;
    this.enableItalic = options?.enableItalic ?? true;
    this.enableUnderline = options?.enableUnderline ?? true;
    this.enableCode = options?.enableCode ?? true;
    this.enableLinks = options?.enableLinks ?? true;
  }

  render(markdown: string): string {
    let result = markdown;
    
    result = this.renderCodeBlocks(result);
    result = this.renderInlineCode(result);
    result = this.renderBold(result);
    result = this.renderItalic(result);
    result = this.renderUnderline(result);
    result = this.renderLinks(result);
    result = this.renderHeadings(result);
    result = this.renderLists(result);
    result = this.renderHorizontalRules(result);
    
    return result;
  }

  private renderCodeBlocks(text: string): string {
    if (!this.enableCode) return text;
    
    const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
    return text.replace(codeBlockPattern, (_, lang, code) => {
      const formattedCode = code.trim();
      return `\n${this.styleCode(formattedCode, lang)}\n`;
    });
  }

  private renderInlineCode(text: string): string {
    if (!this.enableCode) return text;
    
    const inlineCodePattern = /`([^`]+)`/g;
    return text.replace(inlineCodePattern, (_, code) => {
      return this.styleInlineCode(code);
    });
  }

  private renderBold(text: string): string {
    if (!this.enableBold) return text;
    
    const boldPattern = /\*\*([^*]+)\*\*/g;
    return text.replace(boldPattern, (_, content) => {
      return this.styleBold(content);
    });
  }

  private renderItalic(text: string): string {
    if (!this.enableItalic) return text;
    
    const italicPattern = /\*([^*]+)\*/g;
    return text.replace(italicPattern, (_, content) => {
      return this.styleItalic(content);
    });
  }

  private renderUnderline(text: string): string {
    if (!this.enableUnderline) return text;
    
    const underlinePattern = /__([^_]+)__/g;
    return text.replace(underlinePattern, (_, content) => {
      return this.styleUnderline(content);
    });
  }

  private renderLinks(text: string): string {
    if (!this.enableLinks) return text;
    
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    return text.replace(linkPattern, (_, text, url) => {
      return this.styleLink(text, url);
    });
  }

  private renderHeadings(text: string): string {
    const headingPattern = /^(#{1,6})\s+(.+)$/gm;
    return text.replace(headingPattern, (_, hashes, content) => {
      const level = hashes.length;
      return this.styleHeading(content, level);
    });
  }

  private renderLists(text: string): string {
    const bulletPattern = /^(\s*)([-*+])\s+(.+)$/gm;
    return text.replace(bulletPattern, (_, indent, bullet, content) => {
      return `${indent}${this.styleListBullet(bullet)} ${content}`;
    });
  }

  private renderHorizontalRules(text: string): string {
    const hrPattern = /^[-*_]{3,}$/gm;
    return text.replace(hrPattern, () => {
      return this.styleHorizontalRule();
    });
  }

  private styleCode(code: string, lang?: string): string {
    const gray = '\x1b[90m';
    const reset = '\x1b[0m';
    return `${gray}${code}${reset}`;
  }

  private styleInlineCode(code: string): string {
    const cyan = '\x1b[96m';
    const reset = '\x1b[0m';
    return `${cyan}${code}${reset}`;
  }

  private styleBold(text: string): string {
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    return `${bold}${text}${reset}`;
  }

  private styleItalic(text: string): string {
    const italic = '\x1b[3m';
    const reset = '\x1b[0m';
    return `${italic}${text}${reset}`;
  }

  private styleUnderline(text: string): string {
    const underline = '\x1b[4m';
    const reset = '\x1b[0m';
    return `${underline}${text}${reset}`;
  }

  private styleLink(text: string, url: string): string {
    const blue = '\x1b[34m';
    const reset = '\x1b[0m';
    return `${blue}${text}${reset} (${url})`;
  }

  private styleHeading(text: string, level: number): string {
    const bold = '\x1b[1m';
    const colors = ['\x1b[31m', '\x1b[32m', '\x1b[33m', '\x1b[34m', '\x1b[35m', '\x1b[36m'];
    const color = colors[level - 1] || colors[0];
    const reset = '\x1b[0m';
    
    const prefix = level <= 3 ? '#' : '';
    return `${bold}${color}${prefix} ${text}${reset}`;
  }

  private styleListBullet(bullet: string): string {
    const green = '\x1b[32m';
    const reset = '\x1b[0m';
    return `${green}${bullet}${reset}`;
  }

  private styleHorizontalRule(): string {
    const gray = '\x1b[90m';
    const reset = '\x1b[0m';
    return `${gray}────────────────────────────────────────────${reset}`;
  }
}

export const markdownRenderer = new MarkdownRenderer();
