import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ApiClient } from '../api/client';
import { KnowledgeStore } from '../knowledge/registry';
import { Logger } from '../utils/logger';

export class KnowledgeProvider implements vscode.TreeDataProvider<KnowledgeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<KnowledgeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private apiClient: ApiClient;
    private knowledgeStore?: KnowledgeStore;
    private isConnected = false;
    private fileWatcher?: vscode.FileSystemWatcher;
    private refreshInterval?: NodeJS.Timeout;

    constructor(apiClient: ApiClient, knowledgeStore?: KnowledgeStore) {
        this.apiClient = apiClient;
        this.knowledgeStore = knowledgeStore;
        
        // 设置文件监听，自动刷新视图
        this.setupFileWatcher();
        
        // 设置定时刷新（每5秒检查一次）
        this.setupAutoRefresh();
    }

    // 设置文件系统监听器
    private setupFileWatcher(): void {
        if (!this.knowledgeStore) {
            return;
        }

        // 获取知识注册库文件路径
        const registryDir = (this.knowledgeStore as any).registryDir || 
                           path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'data');
        const filePath = path.join(registryDir, 'knowledge-registry.json');

        Logger.info(`设置文件监听器: ${filePath}`, 'KNOWLEDGE_PROVIDER');

        // 创建文件监听器
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.workspace.workspaceFolders?.[0] || vscode.Uri.file(registryDir), 'data/knowledge-registry.json')
        );

        // 文件变化时刷新
        this.fileWatcher.onDidChange(() => {
            Logger.info('知识注册库文件发生变化，自动刷新视图', 'KNOWLEDGE_PROVIDER');
            this.refresh();
        });

        this.fileWatcher.onDidCreate(() => {
            Logger.info('知识注册库文件被创建，自动刷新视图', 'KNOWLEDGE_PROVIDER');
            this.refresh();
        });

        this.fileWatcher.onDidDelete(() => {
            Logger.info('知识注册库文件被删除，自动刷新视图', 'KNOWLEDGE_PROVIDER');
            this.refresh();
        });
    }

    // 设置定时自动刷新
    private setupAutoRefresh(): void {
        // 每5秒检查一次文件修改时间
        let lastModified = 0;
        const registryDir = (this.knowledgeStore as any)?.registryDir || 
                           path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'data');
        const filePath = path.join(registryDir, 'knowledge-registry.json');

        this.refreshInterval = setInterval(() => {
            try {
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    const currentModified = stats.mtimeMs;
                    
                    if (lastModified !== 0 && currentModified !== lastModified) {
                        Logger.info('检测到知识注册库文件更新，自动刷新视图', 'KNOWLEDGE_PROVIDER');
                        this.refresh();
                    }
                    lastModified = currentModified;
                }
            } catch (error) {
                // 忽略错误
            }
        }, 5000);
    }

    // 热更新：替换 API 客户端并刷新视图
    setApiClient(client: ApiClient): void {
        this.apiClient = client;
    }

    refresh(): void {
        // 重新加载 KnowledgeStore 数据
        if (this.knowledgeStore) {
            (this.knowledgeStore as any).reload?.();
        }
        this._onDidChangeTreeData.fire();
    }

    // 清理资源
    dispose(): void {
        this.fileWatcher?.dispose();
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }

    getTreeItem(element: KnowledgeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: KnowledgeItem): Promise<KnowledgeItem[]> {
        if (element) {
            return [];
        }

        const items: KnowledgeItem[] = [];

        // 1. 首先加载本地知识点（不依赖后端）
        try {
            Logger.info(`KnowledgeStore 状态: ${this.knowledgeStore ? '已初始化' : '未初始化'}`, 'KNOWLEDGE_PROVIDER');
            const local = this.knowledgeStore?.getAll() ?? [];
            Logger.info(`本地知识点数量: ${local.length}`, 'KNOWLEDGE_PROVIDER');
            if (local.length > 0) {
                items.push(new KnowledgeItem(
                    '📚 本地知识点',
                    `${local.length} 条`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    { isHeader: true }
                ));
                local.forEach(item => {
                    items.push(new KnowledgeItem(
                        item.title,
                        item.category,
                        vscode.TreeItemCollapsibleState.None,
                        item,
                        'local'
                    ));
                });
            }
        } catch (error) {
            Logger.error('加载本地知识点失败: ' + error, 'KNOWLEDGE_PROVIDER');
        }

        // 2. 尝试从后端加载知识模块
        try {
            const results = await this.apiClient.searchKnowledge('');
            this.isConnected = true;

            if (results.length > 0) {
                items.push(new KnowledgeItem(
                    '🌐 远程知识模块',
                    `${results.length} 个`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    { isHeader: true }
                ));
                results.forEach(item => {
                    items.push(new KnowledgeItem(
                        item.name,
                        `v${item.version} | ${item.scenario}`,
                        vscode.TreeItemCollapsibleState.None,
                        item,
                        'remote'
                    ));
                });
            }
        } catch (error) {
            this.isConnected = false;
            Logger.warn('连接后端服务失败，仅显示本地知识点', 'KNOWLEDGE_PROVIDER');

            // 如果没有本地知识点，显示提示信息
            if (items.length === 0) {
                items.push(new KnowledgeItem(
                    '⚠️ 未连接到后端服务',
                    '点击"AgentKMS: 启动服务"连接',
                    vscode.TreeItemCollapsibleState.None,
                    { isEmpty: true }
                ));
            }
        }

        return items;
    }
}

export class KnowledgeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly data?: any,
        public readonly source?: 'local' | 'remote' | 'header'
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip = `${label} - ${description}`;

        // 根据类型设置 contextValue 和图标
        if (data?.isHeader) {
            this.contextValue = 'header';
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (data?.isEmpty) {
            this.contextValue = 'empty';
            this.iconPath = new vscode.ThemeIcon('info');
        } else if (source === 'local') {
            this.contextValue = 'knowledge';
            this.iconPath = new vscode.ThemeIcon('book');
        } else {
            this.contextValue = 'knowledge';
            // 根据质量等级设置图标
            if (data?.quality_level === 'A' || data?.quality_level === 'A+') {
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            } else if (data?.quality_level === 'B') {
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
            } else {
                this.iconPath = new vscode.ThemeIcon('info');
            }
        }
    }
}
