import * as fs from 'fs';
import * as path from 'path';

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  summary?: string;
  source?: string;
  timestamp: string;
}

export class KnowledgeStore {
  private entries: KnowledgeEntry[] = [];
  private filePath: string;
  public readonly registryDir: string;

  constructor(private dataDir: string) {
    this.registryDir = dataDir;
    this.ensureDir(this.dataDir);
    this.filePath = path.join(this.dataDir, 'knowledge-registry.json');
    this.load();
  }

  // 重新加载数据（用于文件变化后刷新）
  reload(): void {
    this.load();
  }

  private ensureDir(dir: string) {
    try {
      const p = path.resolve(dir);
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
    } catch {
      // ignore
    }
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.entries = data;
        } else {
          this.entries = [];
        }
      }
    } catch {
      this.entries = [];
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), 'utf8');
    } catch {
      // ignore
    }
  }

    addEntry(entry: KnowledgeEntry): void {
        this.entries.push(entry);
        this.save();
    }

  getAll(): KnowledgeEntry[] {
    return this.entries;
  }

    search(query: string): KnowledgeEntry[] {
    if (!query) return this.entries;
    const q = query.toLowerCase();
    return this.entries.filter(e =>
      (e.title && e.title.toLowerCase().includes(q)) ||
      (e.summary && e.summary.toLowerCase().includes(q)) ||
      (e.keywords && e.keywords.join(' ').toLowerCase().includes(q))
    );
    }

    async importFromFile(filePath: string): Promise<number> {
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            const arr = Array.isArray(data) ? data : [];
            let added = 0;
            for (const item of arr) {
                const exists = this.entries.find(e => e.id === item.id);
                if (!exists) {
                    const entry: KnowledgeEntry = {
                        id: item.id ?? `import-${Date.now()}-${Math.random()}`,
                        title: item.title ?? 'Untitled',
                        category: item.category ?? 'Knowledge',
                        keywords: item.keywords ?? [],
                        summary: item.summary ?? '',
                        source: item.source ?? 'import',
                        timestamp: item.timestamp ?? new Date().toISOString()
                    };
                    this.entries.push(entry);
                    added++;
                }
            }
            this.save();
            return added;
        } catch {
            return 0;
        }
    }

    async exportToFile(filePath: string): Promise<void> {
        fs.writeFileSync(filePath, JSON.stringify(this.entries, null, 2), 'utf8');
    }
}
