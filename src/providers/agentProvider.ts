import * as vscode from 'vscode';
import { ApiClient } from '../api/client';

export class AgentProvider implements vscode.TreeDataProvider<AgentItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<AgentItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private apiClient: ApiClient) {}

    // 热更新：替换 API 客户端并刷新视图
    setApiClient(newApiClient: ApiClient): void {
        this.apiClient = newApiClient;
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AgentItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: AgentItem): Promise<AgentItem[]> {
        if (element) {
            return [];
        }

        try {
            const agents = await this.apiClient.listAgents();
            
            if (agents.length === 0) {
                return [new AgentItem('暂无Agent', '', vscode.TreeItemCollapsibleState.None)];
            }

            return agents.map(item => 
                new AgentItem(
                    item.name,
                    `${item.scenario} | ${item.knowledge_modules?.length || 0}个知识`,
                    vscode.TreeItemCollapsibleState.None,
                    item
                )
            );
        } catch (error) {
            return [new AgentItem('连接服务失败', '', vscode.TreeItemCollapsibleState.None)];
        }
    }
}

class AgentItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly data?: any
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip = `${label} - ${description}`;
        this.iconPath = new vscode.ThemeIcon('robot');
        this.contextValue = 'agent';
    }
}
