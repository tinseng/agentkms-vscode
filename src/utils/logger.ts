import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    source?: string;
    details?: any;
}

export class Logger {
    private static instance: Logger;
    private logChannel: vscode.OutputChannel;
    private logFile: string;
    private logEntries: LogEntry[] = [];
    private maxLogEntries = 1000;

    constructor(private outputChannelName: string = 'AgentKMS', private logDir: string = './logs') {
        this.logChannel = vscode.window.createOutputChannel(outputChannelName);
        this.ensureLogDirectory();
        this.logFile = path.join(this.logDir, `agentkms-${new Date().toISOString().split('T')[0]}.log`);
        Logger.instance = this;
    }

    private ensureLogDirectory() {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
        } catch (error) {
            console.error('Failed to create log directory:', error);
        }
    }

    private formatMessage(entry: LogEntry): string {
        const timestamp = entry.timestamp;
        const levelStr = LogLevel[entry.level].padEnd(5);
        const source = entry.source ? `[${entry.source}] ` : '';
        let message = `${timestamp} ${levelStr} ${source}${entry.message}`;
        
        if (entry.details) {
            message += `\nDetails: ${JSON.stringify(entry.details, null, 2)}`;
        }
        
        return message;
    }

    private writeToFile(entry: LogEntry) {
        try {
            const formatted = this.formatMessage(entry);
            fs.appendFileSync(this.logFile, formatted + '\n', 'utf8');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    private addToMemory(entry: LogEntry) {
        this.logEntries.push(entry);
        if (this.logEntries.length > this.maxLogEntries) {
            this.logEntries = this.logEntries.slice(-this.maxLogEntries);
        }
    }

    private log(level: LogLevel, message: string, source?: string, details?: any) {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            source,
            details
        };

        // 输出到VSCode输出面板
        if (level >= LogLevel.INFO) {
            this.logChannel.appendLine(this.formatMessage(entry));
        }

        // 写入文件
        this.writeToFile(entry);

        // 保存到内存
        this.addToMemory(entry);

        // 错误级别额外处理
        if (level === LogLevel.ERROR) {
            vscode.window.showErrorMessage(`AgentKMS Error: ${message}`);
        }
    }

    static debug(message: string, source?: string, details?: any) {
        if (!Logger.instance) return;
        Logger.instance.log(LogLevel.DEBUG, message, source, details);
    }

    static info(message: string, source?: string, details?: any) {
        if (!Logger.instance) return;
        Logger.instance.log(LogLevel.INFO, message, source, details);
    }

    static warn(message: string, source?: string, details?: any) {
        if (!Logger.instance) return;
        Logger.instance.log(LogLevel.WARN, message, source, details);
    }

    static error(message: string, source?: string, details?: any) {
        if (!Logger.instance) return;
        Logger.instance.log(LogLevel.ERROR, message, source, details);
    }

    // 记录API调用
    static apiCall(method: string, url: string, status?: number, responseTime?: number, error?: any) {
        if (!Logger.instance) return;
        
        const details: any = {
            method,
            url,
            status
        };
        
        if (responseTime) {
            details.responseTime = `${responseTime}ms`;
        }
        
        if (error) {
            details.error = error;
        }
        
        const message = status && status >= 400 
            ? `API调用失败: ${method} ${url} (${status})`
            : `API调用: ${method} ${url}`;
            
        if (Logger.instance) {
            Logger.instance.log(
                status && status >= 400 ? LogLevel.ERROR : LogLevel.INFO,
                message,
                'API',
                details
            );
        }
    }

    // 记录用户操作
    static userAction(action: string, details?: any) {
        if (!Logger.instance) return;
        Logger.instance.log(LogLevel.INFO, `用户操作: ${action}`, 'USER', details);
    }

    // 记录知识操作
    static knowledgeAction(action: string, moduleId?: string, details?: any) {
        if (!Logger.instance) return;
        
        const message = moduleId 
            ? `知识操作: ${action} (${moduleId})`
            : `知识操作: ${action}`;
            
        Logger.instance.log(LogLevel.INFO, message, 'KNOWLEDGE', details);
    }

    // 获取最近的日志
    static getRecentLogs(count: number = 50): LogEntry[] {
        if (!Logger.instance) return [];
        return Logger.instance.logEntries.slice(-count);
    }

    // 清理日志
    static clearLogs() {
        if (!Logger.instance) return;
        Logger.instance.logEntries = [];
        Logger.instance.logChannel.clear();
        Logger.instance.log(LogLevel.INFO, '日志已清理', 'SYSTEM');
    }

    // 导出日志
    static exportLogs(filePath?: string): string | null {
        if (!Logger.instance) return null;
        
        const exportPath = filePath || path.join(Logger.instance.logDir, `agentkms-export-${Date.now()}.json`);
        
        try {
            const exportData = {
                exportTime: new Date().toISOString(),
                logs: Logger.instance.logEntries
            };
            
            fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2), 'utf8');
            return exportPath;
        } catch (error) {
            console.error(`导出日志失败: ${error}`);
            if (Logger.instance) {
                Logger.instance.log(LogLevel.ERROR, `导出日志失败: ${error}`, 'EXPORT');
            }
            return null;
        }
    }

    show() {
        this.logChannel.show();
    }

    dispose() {
        this.logChannel.dispose();
    }
}