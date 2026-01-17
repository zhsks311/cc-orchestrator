/**
 * AST-grep Service
 * Provides structural code search and replace using ast-grep
 */

import { Lang, parse, SgNode } from '@ast-grep/napi';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../infrastructure/Logger.js';
import { ValidationError } from '../../types/errors.js';

// Language mapping from file extension to ast-grep Lang
const EXTENSION_TO_LANG: Record<string, Lang> = {
  '.ts': Lang.TypeScript,
  '.tsx': Lang.Tsx,
  '.js': Lang.JavaScript,
  '.jsx': Lang.JavaScript,
  '.py': Lang.Python,
  '.rs': Lang.Rust,
  '.go': Lang.Go,
  '.java': Lang.Java,
  '.c': Lang.C,
  '.cpp': Lang.Cpp,
  '.cc': Lang.Cpp,
  '.cxx': Lang.Cpp,
  '.h': Lang.C,
  '.hpp': Lang.Cpp,
  '.cs': Lang.CSharp,
  '.rb': Lang.Ruby,
  '.swift': Lang.Swift,
  '.kt': Lang.Kotlin,
  '.scala': Lang.Scala,
  '.lua': Lang.Lua,
  '.html': Lang.Html,
  '.css': Lang.Css,
  '.json': Lang.Json,
  '.yaml': Lang.Yaml,
  '.yml': Lang.Yaml,
};

// Language name mapping for user input
const LANG_NAME_MAP: Record<string, Lang> = {
  typescript: Lang.TypeScript,
  ts: Lang.TypeScript,
  tsx: Lang.Tsx,
  javascript: Lang.JavaScript,
  js: Lang.JavaScript,
  jsx: Lang.JavaScript,
  python: Lang.Python,
  py: Lang.Python,
  rust: Lang.Rust,
  rs: Lang.Rust,
  go: Lang.Go,
  golang: Lang.Go,
  java: Lang.Java,
  c: Lang.C,
  cpp: Lang.Cpp,
  'c++': Lang.Cpp,
  csharp: Lang.CSharp,
  'c#': Lang.CSharp,
  cs: Lang.CSharp,
  ruby: Lang.Ruby,
  rb: Lang.Ruby,
  swift: Lang.Swift,
  kotlin: Lang.Kotlin,
  kt: Lang.Kotlin,
  scala: Lang.Scala,
  lua: Lang.Lua,
  html: Lang.Html,
  css: Lang.Css,
  json: Lang.Json,
  yaml: Lang.Yaml,
  yml: Lang.Yaml,
};

export interface AstSearchResult {
  file: string;
  line: number;
  column: number;
  matchedText: string;
  context: string;
}

export interface AstReplaceResult {
  file: string;
  replacements: number;
  preview?: string;
}

export interface IAstGrepService {
  search(pattern: string, options: AstSearchOptions): Promise<AstSearchResult[]>;
  replace(pattern: string, replacement: string, options: AstReplaceOptions): Promise<AstReplaceResult[]>;
  getSupportedLanguages(): string[];
  isLanguageSupported(language: string): boolean;
}

export interface AstSearchOptions {
  path: string;
  language?: string;
  maxResults?: number;
}

export interface AstReplaceOptions {
  path: string;
  language?: string;
  dryRun?: boolean;
}

export class AstGrepService implements IAstGrepService {
  private logger: Logger;
  private workspaceRoot: string;

  constructor(workspaceRoot?: string) {
    this.logger = new Logger('AstGrepService');
    this.workspaceRoot = workspaceRoot || process.cwd();
  }

  /**
   * Validate and resolve path to prevent path traversal
   * Returns the resolved absolute path
   */
  private validatePath(inputPath: string): string {
    // Resolve to absolute path
    const resolvedPath = path.isAbsolute(inputPath)
      ? path.normalize(inputPath)
      : path.resolve(this.workspaceRoot, inputPath);

    // Check if path exists
    if (!fs.existsSync(resolvedPath)) {
      throw new ValidationError(`Path does not exist: ${inputPath}`);
    }

    // Check for path traversal outside workspace (optional security measure)
    const relativePath = path.relative(this.workspaceRoot, resolvedPath);
    if (relativePath.startsWith('..') && !path.isAbsolute(inputPath)) {
      this.logger.warn('Path traversal detected', {
        inputPath,
        resolvedPath,
        workspaceRoot: this.workspaceRoot,
      });
      // Allow absolute paths but warn on relative path traversal
      throw new ValidationError(
        `Path traversal not allowed: ${inputPath} escapes workspace root`
      );
    }

    return resolvedPath;
  }

  /**
   * Get language from file extension
   */
  private getLangFromFile(filePath: string): Lang | null {
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_TO_LANG[ext] || null;
  }

  /**
   * Get language from user-provided language name
   */
  private getLangFromName(langName: string): Lang | null {
    return LANG_NAME_MAP[langName.toLowerCase()] || null;
  }

  /**
   * Get all files in directory with supported extensions
   */
  private async getFilesRecursive(dir: string, lang?: Lang): Promise<string[]> {
    const files: string[] = [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip common non-code directories
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv'].includes(entry.name)) {
          continue;
        }
        files.push(...await this.getFilesRecursive(fullPath, lang));
      } else if (entry.isFile()) {
        const fileLang = this.getLangFromFile(fullPath);
        if (fileLang && (!lang || fileLang === lang)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  /**
   * Search for pattern in code using AST
   */
  async search(pattern: string, options: AstSearchOptions): Promise<AstSearchResult[]> {
    const results: AstSearchResult[] = [];
    const maxResults = options.maxResults || 100;

    // Validate and resolve path
    const targetPath = this.validatePath(options.path);
    const lang = options.language ? this.getLangFromName(options.language) : null;

    const stat = fs.statSync(targetPath);
    const files = stat.isDirectory()
      ? await this.getFilesRecursive(targetPath, lang || undefined)
      : [targetPath];

    for (const file of files) {
      if (results.length >= maxResults) break;

      const fileLang = lang || this.getLangFromFile(file);
      if (!fileLang) continue;

      try {
        const content = fs.readFileSync(file, 'utf-8');
        const root = parse(fileLang, content).root();
        const matches = root.findAll(pattern);

        for (const match of matches) {
          if (results.length >= maxResults) break;

          const range = match.range();
          const lines = content.split('\n');
          const lineIndex = range.start.line;
          const contextStart = Math.max(0, lineIndex - 1);
          const contextEnd = Math.min(lines.length, lineIndex + 2);
          const context = lines.slice(contextStart, contextEnd).join('\n');

          results.push({
            file,
            line: range.start.line + 1,
            column: range.start.column + 1,
            matchedText: match.text(),
            context,
          });
        }
      } catch (error) {
        this.logger.debug('AST parse error', { file, error: String(error) });
      }
    }

    return results;
  }

  /**
   * Replace pattern in code using AST
   */
  async replace(
    pattern: string,
    replacement: string,
    options: AstReplaceOptions
  ): Promise<AstReplaceResult[]> {
    const results: AstReplaceResult[] = [];

    // Validate and resolve path
    const targetPath = this.validatePath(options.path);
    const lang = options.language ? this.getLangFromName(options.language) : null;
    const dryRun = options.dryRun ?? true;

    const stat = fs.statSync(targetPath);
    const files = stat.isDirectory()
      ? await this.getFilesRecursive(targetPath, lang || undefined)
      : [targetPath];

    for (const file of files) {
      const fileLang = lang || this.getLangFromFile(file);
      if (!fileLang) continue;

      try {
        const content = fs.readFileSync(file, 'utf-8');
        const root = parse(fileLang, content).root();
        const matches = root.findAll(pattern);

        if (matches.length === 0) continue;

        // Build replacement by processing matches in reverse order
        let newContent = content;
        const sortedMatches = [...matches].sort((a, b) => {
          const aStart = a.range().start;
          const bStart = b.range().start;
          return bStart.index - aStart.index; // Reverse order
        });

        for (const match of sortedMatches) {
          const range = match.range();
          // Handle meta-variables in replacement
          let finalReplacement = replacement;

          // Collect all metavariable values first to avoid recursive replacement issues
          // and use callback-based replacement to prevent special pattern interpretation
          const metaVarCaptures = new Map<string, string>();
          const metaVarPattern = /\$([A-Z_][A-Z0-9_]*)/g;
          let metaMatch;

          while ((metaMatch = metaVarPattern.exec(replacement)) !== null) {
            const varName = metaMatch[1];
            if (!varName || metaVarCaptures.has(varName)) continue;
            const captured = match.getMatch(varName);
            if (captured) {
              metaVarCaptures.set(varName, captured.text());
            }
          }

          // Single-pass replacement with callback to avoid:
          // 1. Recursive replacement (content from $A affecting $B replacement)
          // 2. Special pattern interpretation ($&, $$, etc. in captured text)
          finalReplacement = replacement.replace(
            /\$([A-Z_][A-Z0-9_]*)/g,
            (fullMatch, varName) => {
              return metaVarCaptures.has(varName)
                ? metaVarCaptures.get(varName)!
                : fullMatch;
            }
          );

          newContent =
            newContent.slice(0, range.start.index) +
            finalReplacement +
            newContent.slice(range.end.index);
        }

        const result: AstReplaceResult = {
          file,
          replacements: matches.length,
        };

        if (dryRun) {
          result.preview = newContent.slice(0, 1000) + (newContent.length > 1000 ? '...' : '');
        } else {
          fs.writeFileSync(file, newContent, 'utf-8');
        }

        results.push(result);
      } catch (error) {
        this.logger.debug('AST replace error', { file, error: String(error) });
      }
    }

    return results;
  }

  /**
   * Get list of supported languages
   */
  getSupportedLanguages(): string[] {
    return Object.keys(LANG_NAME_MAP);
  }

  /**
   * Check if a language is supported
   */
  isLanguageSupported(language: string): boolean {
    return this.getLangFromName(language) !== null;
  }
}

// Singleton instance
let instance: AstGrepService | null = null;

export function getAstGrepService(): AstGrepService {
  if (!instance) {
    instance = new AstGrepService();
  }
  return instance;
}
