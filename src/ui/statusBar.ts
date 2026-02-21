import * as vscode from 'vscode';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private connected: boolean = false;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.updateText();
    }

    setConnected(connected: boolean): void {
        this.connected = connected;
        this.updateText();
    }

    private updateText(): void {
        if (this.connected) {
            this.statusBarItem.text = '$(check) AgentKMS';
            this.statusBarItem.tooltip = 'AgentKMS 服务已连接';
            this.statusBarItem.command = 'agentkms.searchKnowledge';
        } else {
            this.statusBarItem.text = '$(circle-outline) AgentKMS';
            this.statusBarItem.tooltip = 'AgentKMS 服务未连接 - 点击启动';
            this.statusBarItem.command = 'agentkms.activate';
        }
    }

    show(): void {
        this.statusBarItem.show();
    }

    hide(): void {
        this.statusBarItem.hide();
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}
