import * as vscode from 'vscode';
import { KnowledgeProvider } from './providers/knowledgeProvider';
import { AgentProvider } from './providers/agentProvider';
import { ApiClient } from './api/client';
import { StatusBarManager } from './ui/statusBar';
import { KnowledgeStore, KnowledgeEntry } from './knowledge/registry';
import * as os from 'os';
import { ProjectAnalyzer, analyzeAndRegisterKnowledge } from './knowledge/analyzer';
import * as path from 'path';
import { Logger } from './utils/logger';
import { spawn, ChildProcess } from 'child_process';

let logger: Logger;
let knowledgeStore: KnowledgeStore | undefined;

let apiClient: ApiClient;
let statusBar: StatusBarManager;
let knowledgeProviderInstance: KnowledgeProvider | undefined;
let agentProviderInstance: AgentProvider | undefined;
let backendProcess: ChildProcess | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('AgentKMS 插件开始激活...');

    // 初始化日志系统
    const logDir = path.join(os.homedir(), '.agentkms', 'logs');
    logger = new Logger('AgentKMS', logDir);
    Logger.info('AgentKMS 插件开始激活...', 'EXTENSION');

    // 获取配置
    const config = vscode.workspace.getConfiguration('agentkms');
    const apiUrl = config.get<string>('apiUrl', 'http://localhost:8080');

    // 自动启动后端服务
    const autoStartBackend = config.get<boolean>('autoStartBackend', true);
    if (autoStartBackend) {
        await startBackendService(context);
    }

    // 初始化API客户端
    apiClient = new ApiClient(apiUrl);

    // 初始化状态栏
    statusBar = new StatusBarManager();
    statusBar.show();

    // 初始化知识点 registry 存储
    // 强制使用扩展目录下的 data 文件夹，确保数据一致性
    let registryDir: string;
    
    // 获取扩展所在目录（使用 __dirname 向上找到项目根目录）
    const extensionDir = path.join(__dirname, '..');
    registryDir = path.join(extensionDir, 'data');
    
    Logger.info(`使用扩展目录: ${extensionDir}`, 'KNOWLEDGE_STORE');
    
    // 检查文件是否存在
    const registryFile = path.join(registryDir, 'knowledge-registry.json');
    const fs = require('fs');
    if (fs.existsSync(registryFile)) {
        const stats = fs.statSync(registryFile);
        Logger.info(`找到知识注册库文件: ${registryFile}, 大小: ${stats.size} bytes`, 'KNOWLEDGE_STORE');
    } else {
        Logger.warn(`知识注册库文件不存在: ${registryFile}，将创建新文件`, 'KNOWLEDGE_STORE');
    }
    
    try {
        knowledgeStore = new KnowledgeStore(registryDir);
        const entryCount = knowledgeStore.getAll().length;
        Logger.info(`知识点注册库已初始化: ${registryDir}, 条目数: ${entryCount}`, 'KNOWLEDGE_STORE');
        console.log(`[AgentKMS] KnowledgeStore 初始化: ${registryDir}, 条目数: ${entryCount}`);
    } catch (e) {
        console.error('KnowledgeStore 初始化失败:', e);
        Logger.error('KnowledgeStore 初始化失败: ' + e, 'KNOWLEDGE_STORE');
    }

    // 注册视图提供者
    knowledgeProviderInstance = new KnowledgeProvider(apiClient, knowledgeStore);
    agentProviderInstance = new AgentProvider(apiClient);

    // 注册树视图
    const knowledgeView = vscode.window.createTreeView('agentkms.knowledgeView', {
        treeDataProvider: knowledgeProviderInstance!
    });

    const agentView = vscode.window.createTreeView('agentkms.agentView', {
        treeDataProvider: agentProviderInstance!
    });

    // 保存视图引用，供命令使用
    const knowledgeViewRef = knowledgeView;

    // 注册视图清理
    context.subscriptions.push({
        dispose: () => {
            knowledgeProviderInstance?.dispose();
        }
    });

    // 注册所有命令 - 必须在最开始注册，确保命令可用
    const commands = [
        // 启动服务
        vscode.commands.registerCommand('agentkms.activate', async () => {
            Logger.userAction('激活服务连接');
            try {
                await apiClient.checkHealth();
                vscode.window.showInformationMessage('AgentKMS 服务已连接');
                statusBar.setConnected(true);
                knowledgeProviderInstance?.refresh();
                agentProviderInstance?.refresh();
                Logger.info('AgentKMS 服务已连接', 'API');
            } catch (error) {
                Logger.error('AgentKMS 服务连接失败，请确保服务已启动', 'API');
                vscode.window.showErrorMessage('AgentKMS 服务连接失败，请确保服务已启动');
                statusBar.setConnected(false);
            }
        }),

        // 搜索知识
        vscode.commands.registerCommand('agentkms.searchKnowledge', async () => {
            const query = await vscode.window.showInputBox({
                prompt: '输入搜索关键词',
                placeHolder: '例如: 故障诊断'
            });

            if (query) {
                Logger.userAction('搜索知识', { query });
                const scenario = config.get<string>('defaultScenario');
                try {
                    const results = await apiClient.searchKnowledge(query, scenario);
                    // 知识点自动登记：将检索到的知识模块归档为知识点
                    try {
                        results.forEach((r: any) => {
                            const entry: KnowledgeEntry = {
                                id: `kms-search-${r.module_id}-${Date.now()}`,
                                title: r.name,
                                category: 'Knowledge',
                                keywords: [r.name, r.scenario, r.capability_type].filter(Boolean) as string[],
                                summary: `版本 ${r.version}，场景 ${r.scenario}，能力 ${r.capability_type}`,
                                source: 'knowledge-search',
                                timestamp: new Date().toISOString()
                            };
                            knowledgeStore?.addEntry(entry);
                        });
                    } catch { /* ignore */ }
                    
                    if (results.length > 0) {
                        const items = results.map(r => ({
                            label: r.name,
                            description: `v${r.version} - ${r.scenario}`,
                            detail: `质量: ${r.quality_level || 'N/A'}`,
                            module: r
                        }));
                        
                        const selected = await vscode.window.showQuickPick(items, {
                            placeHolder: '选择知识模块'
                        });
                        
                        if (selected) {
                            // 显示详情
                            const detail = await apiClient.getKnowledge(selected.module.module_id);
                            showKnowledgeDetail(detail);
                        }
                    } else {
                        vscode.window.showInformationMessage('未找到匹配的知识模块');
                    }
                } catch (error) {
                    vscode.window.showErrorMessage('搜索失败: ' + error);
                }
            }
        }),

        // 注册知识
        vscode.commands.registerCommand('agentkms.registerKnowledge', async () => {
            Logger.userAction('打开注册知识对话框');
            const name = await vscode.window.showInputBox({
                prompt: '知识名称',
                placeHolder: '例如: 工业设备故障诊断'
            });
            
            if (!name) { return; }

            const scenarioItems = [
                { label: '工业自动化', value: 'industrial' },
                { label: '客户服务', value: 'customer_service' },
                { label: '数据分析', value: 'data_analysis' }
            ];
            
            const scenario = await vscode.window.showQuickPick(scenarioItems, {
                placeHolder: '选择场景类型'
            });
            
            if (!scenario) { return; }

            const capability = await vscode.window.showInputBox({
                prompt: '能力类型',
                placeHolder: '例如: fault_diagnosis'
            });
            
            if (!capability) { return; }

            try {
                Logger.knowledgeAction('注册知识', undefined, { name, scenario: scenario.value, capability });
                const result = await apiClient.registerKnowledge({
                    name,
                    scenario: scenario.value,
                    capability_type: capability
                });
                
                vscode.window.showInformationMessage(
                    `知识注册成功: ${result.module_id}`
                );
                // 记录知识注册为知识点
                const entry: KnowledgeEntry = {
                    id: `kms-register-${result.module_id}-${Date.now()}`,
                    title: name,
                    category: 'Knowledge',
                    keywords: [scenario.value, capability].filter(Boolean) as string[],
                    summary: `注册于场景 ${scenario.value}，能力 ${capability}`,
                    source: 'knowledge-register',
                    timestamp: new Date().toISOString()
                };
                knowledgeStore?.addEntry(entry);
                knowledgeProviderInstance?.refresh();
                Logger.knowledgeAction('注册知识成功', result.module_id);
            } catch (error) {
                Logger.error('注册失败: ' + error, 'KNOWLEDGE');
                vscode.window.showErrorMessage('注册失败: ' + error);
            }
        }),

        // 查看质量评分
        vscode.commands.registerCommand('agentkms.showQuality', async (item: any) => {
            // 从参数或当前选中的树视图项中获取数据
            let module: any;
            if (item) {
                module = item?.data || item;
            } else {
                // 从树视图中获取当前选中的项
                const selected = knowledgeViewRef.selection[0];
                module = selected?.data || selected;
            }

            // 兼容本地知识点(id)和远程模块(module_id)
            const moduleId = module?.module_id || module?.id;
            const moduleName = module?.name || module?.title;

            if (!module || !moduleId) {
                vscode.window.showWarningMessage('请先选择一个知识模块');
                return;
            }

            Logger.userAction('查看质量评分', { moduleId });

            // 本地知识点显示基础质量报告
            if (!module?.module_id && module?.id) {
                const panel = vscode.window.createWebviewPanel(
                    'qualityReport',
                    `质量报告: ${moduleName || moduleId}`,
                    vscode.ViewColumn.One,
                    {}
                );

                // 为本地知识点生成基础质量报告
                const localQuality = {
                    score: 0.75,
                    level: 'B+',
                    dimensions: {
                        accuracy: 0.8,
                        completeness: 0.7,
                        consistency: 0.75,
                        safety: 0.8,
                        usability: 0.7
                    },
                    isLocal: true
                };

                panel.webview.html = getQualityHtml(localQuality);
                Logger.info('本地知识点质量报告已显示', 'KNOWLEDGE', { moduleId });
                return;
            }

            try {
                const quality = await apiClient.getQuality(moduleId);

                const panel = vscode.window.createWebviewPanel(
                    'qualityReport',
                    `质量报告: ${moduleName || moduleId}`,
                    vscode.ViewColumn.One,
                    {}
                );

                panel.webview.html = getQualityHtml(quality);
                Logger.info('质量报告已显示', 'KNOWLEDGE', { moduleId });
            } catch (error) {
                Logger.error('获取质量报告失败: ' + error, 'KNOWLEDGE');
                vscode.window.showErrorMessage('获取质量报告失败: ' + error);
            }
        }),

        // 导出知识包
        vscode.commands.registerCommand('agentkms.exportBundle', async () => {
            Logger.userAction('导出知识包');
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('knowledge-bundle.akb'),
                filters: {
                    'AgentKMS Bundle': ['akb']
                }
            });
            
            if (uri) {
                Logger.info(`知识包已导出: ${uri.fsPath}`, 'BUNDLE');
                vscode.window.showInformationMessage(`知识包已导出: ${uri.fsPath}`);
            }
        }),

        // 导入知识包
        vscode.commands.registerCommand('agentkms.importBundle', async () => {
            Logger.userAction('导入知识包');
            const uris = await vscode.window.showOpenDialog({
                filters: {
                    'AgentKMS Bundle': ['akb']
                }
            });
            
            if (uris && uris.length > 0) {
                try {
                    Logger.info(`开始导入知识包: ${uris[0].fsPath}`, 'BUNDLE');
                    const result = await apiClient.importBundle(uris[0].fsPath);
                    vscode.window.showInformationMessage(
                        `导入成功: ${result.imported?.length || 0} 个模块`
                    );
                    Logger.knowledgeAction('导入知识包成功', undefined, { 
                        count: result.imported?.length || 0,
                        path: uris[0].fsPath
                    });
                    // 记录导入的知识点
                    (result.imported || []).forEach((m: any) => {
                        const entry: KnowledgeEntry = {
                            id: `kms-import-${m.module_id}-${Date.now()}`,
                            title: m.name || m.module_id,
                            category: 'Knowledge',
                            keywords: [m.name, m.scenario, m.capability_type].filter(Boolean) as string[],
                            summary: '从知识包导入',
                            source: 'knowledge-import',
                            timestamp: new Date().toISOString()
                        };
                        knowledgeStore?.addEntry(entry);
                    });
                    knowledgeProviderInstance?.refresh();
                } catch (error) {
                    vscode.window.showErrorMessage('导入失败: ' + error);
                }
            }
        }),

        // 刷新视图
        vscode.commands.registerCommand('agentkms.refresh', () => {
            Logger.userAction('刷新视图');
            knowledgeProviderInstance?.refresh();
            agentProviderInstance?.refresh();
        }),

        // 学习知识
        vscode.commands.registerCommand('agentkms.learnKnowledge', async (item: any) => {
            // 从参数或当前选中的树视图项中获取数据
            let module: any;
            if (item) {
                module = item?.data || item;
            } else {
                // 从树视图中获取当前选中的项
                const selected = knowledgeViewRef.selection[0];
                module = selected?.data || selected;
            }
            
            // 兼容本地知识点(id)和远程模块(module_id)
            const moduleId = module?.module_id || module?.id;
            const moduleName = module?.name || module?.title;
            
            if (!module || !moduleId) { 
                vscode.window.showWarningMessage('请先选择一个知识模块');
                return; 
            }
            
            // 本地知识点不支持学习功能
            if (!module?.module_id && module?.id) {
                vscode.window.showInformationMessage(`本地知识点 "${moduleName}" 不支持学习功能`);
                return;
            }
            
            Logger.userAction('学习知识', { moduleId: module.module_id });
            const agentId = 'current-agent'; // TODO: 从配置获取
            
            try {
                const decision = await apiClient.decideLearning({
                    agent_id: agentId,
                    skill_type: module.capability_type || '',
                    scenario: module.scenario
                });
                
                const answer = await vscode.window.showInformationMessage(
                    `${decision.reason}\n是否学习?`,
                    '是', '否'
                );
                
                if (answer === '是') {
                    Logger.knowledgeAction('开始学习知识', module.module_id);
                    await apiClient.learnKnowledge(agentId, module.module_id);
                    vscode.window.showInformationMessage('学习成功');
                    Logger.knowledgeAction('学习知识成功', module.module_id);
                    // 记录学习行为为知识点
                    const entry: KnowledgeEntry = {
                        id: `kms-learn-${module.module_id}-${Date.now()}`,
                        title: module.name || module.module_id,
                        category: 'Learning',
                        keywords: [module.scenario, module.capability_type].filter(Boolean) as string[],
                        summary: '学习知识点',
                        source: 'learning',
                        timestamp: new Date().toISOString()
                    };
                    knowledgeStore?.addEntry(entry);
                    agentProviderInstance?.refresh();
                }
            } catch (error) {
                Logger.error('学习失败: ' + error, 'KNOWLEDGE');
                vscode.window.showErrorMessage('学习失败: ' + error);
            }
        }),

        // 根据项目依赖自动分析并注册知识
        vscode.commands.registerCommand('agentkms.analyzeAndRegister', async () => {
            Logger.userAction('分析项目并注册知识');
            await analyzeAndRegisterKnowledge(apiClient, knowledgeProviderInstance);
        }),

        // 将本地知识点注册到后端
        vscode.commands.registerCommand('agentkms.registerLocalKnowledge', async (item: any) => {
            // 从参数或当前选中的树视图项中获取数据
            let module: any;
            if (item) {
                module = item?.data || item;
            } else {
                const selected = knowledgeViewRef.selection[0];
                module = selected?.data || selected;
            }

            const moduleId = module?.module_id || module?.id;
            const moduleName = module?.name || module?.title;

            if (!module || !moduleId) {
                vscode.window.showWarningMessage('请先选择一个知识模块');
                return;
            }

            // 只有本地知识点需要注册
            if (module?.module_id) {
                vscode.window.showInformationMessage(`"${moduleName}" 已经是远程模块，无需重复注册`);
                return;
            }

            try {
                Logger.userAction('注册本地知识点到后端', { moduleId });

                // 准备注册数据
                const registerData = {
                    name: moduleName,
                    scenario: 'industrial', // 默认场景，可以从配置或用户选择
                    capability_type: module.category || 'general',
                    metadata: {
                        originalId: moduleId,
                        keywords: module.keywords || [],
                        summary: module.summary || '',
                        source: module.source || 'local',
                        registeredAt: new Date().toISOString()
                    }
                };

                const result = await apiClient.registerKnowledge(registerData);

                vscode.window.showInformationMessage(`知识点 "${moduleName}" 已成功注册到后端，模块ID: ${result.module_id}`);
                Logger.info(`本地知识点已注册到后端: ${result.module_id}`, 'KNOWLEDGE');

                // 刷新视图
                knowledgeProviderInstance?.refresh();
            } catch (error) {
                Logger.error('注册到后端失败: ' + error, 'KNOWLEDGE');
                vscode.window.showErrorMessage('注册到后端失败: ' + error + '\n请确保后端服务已启动 (http://localhost:8080)');
            }
        }),

        // 导出知识点注册库
        vscode.commands.registerCommand('agentkms.exportKnowledgeRegistry', async () => {
            if (!knowledgeStore) { 
                vscode.window.showWarningMessage('知识点注册库未初始化');
                return; 
            }
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('knowledge-registry.json'),
                filters: { 'Knowledge Registry': ['json'] }
            });
            if (uri) {
                await knowledgeStore!.exportToFile(uri.fsPath);
                vscode.window.showInformationMessage(`知识点注册库已导出: ${uri.fsPath}`);
            }
        }),

        // 导入知识点注册库
        vscode.commands.registerCommand('agentkms.importKnowledgeRegistry', async () => {
            if (!knowledgeStore) { 
                vscode.window.showWarningMessage('知识点注册库未初始化');
                return; 
            }
            const uris = await vscode.window.showOpenDialog({
                filters: { 'Knowledge Registry': ['json'] }
            });
            if (uris && uris.length > 0) {
                const count = await knowledgeStore!.importFromFile(uris[0].fsPath);
                knowledgeProviderInstance?.refresh();
                agentProviderInstance?.refresh();
                vscode.window.showInformationMessage(`导入完成，新增 ${count} 条知识点`);
            }
        }),

        // 注册一个方便查看知识点注册库的命令
        vscode.commands.registerCommand('agentkms.showKnowledgeRegistry', async () => {
            const store = knowledgeStore;
            if (!store) {
                vscode.window.showInformationMessage('知识点注册库未初始化');
                return;
            }
            const items = store.getAll().map(e => ({ label: e.title, description: e.category, detail: e.summary || '' }));
            const pick = await vscode.window.showQuickPick(items, { placeHolder: '知识点注册库' });
            if (pick) {
                const found = store.getAll().find(e => e.title === pick.label);
                if (found) {
                    vscode.window.showInformationMessage(`知识点: ${found.title} - ${found.summary ?? ''}`);
                }
            }
        })
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));
    context.subscriptions.push(knowledgeView, agentView);

    // 配置变更热更新：API URL 变化时重建客户端并热更新视图
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('agentkms.apiUrl')) {
            const newUrl = vscode.workspace.getConfiguration('agentkms').get<string>('apiUrl', 'http://localhost:8080');
            apiClient = new ApiClient(newUrl);
            knowledgeProviderInstance?.setApiClient(apiClient);
            agentProviderInstance?.setApiClient(apiClient);
            knowledgeProviderInstance?.refresh();
            agentProviderInstance?.refresh();
            Logger.info(`API URL 更新为 ${newUrl}，已热更新提供者并刷新视图`, 'CONFIG');
            vscode.window.showInformationMessage('AgentKMS 配置已热更新，已应用新的 API URL');
        }
        // 也监听其他可能影响运行的配置项，后续可扩展
        if (e.affectsConfiguration('agentkms')) {
            Logger.info('AgentKMS 配置已变更', 'CONFIG');
        }
    }));

    // 自动连接
    if (config.get<boolean>('autoStart')) {
        try {
            await vscode.commands.executeCommand('agentkms.activate');
        } catch (err) {
            console.log('自动连接失败:', err);
        }
    }

    Logger.info('AgentKMS 插件激活完成', 'EXTENSION');
}

export function deactivate() {
    console.log('AgentKMS 插件已停用');
    Logger.info('AgentKMS 插件已停用', 'EXTENSION');
    if (statusBar) {
        statusBar.dispose();
    }
    if (logger) {
        logger.dispose();
    }
}

function showKnowledgeDetail(knowledge: any) {
    const panel = vscode.window.createWebviewPanel(
        'knowledgeDetail',
        knowledge.name,
        vscode.ViewColumn.One,
        {}
    );
    
    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; }
                .header { font-size: 1.5em; font-weight: bold; margin-bottom: 10px; }
                .meta { color: var(--vscode-descriptionForeground); margin-bottom: 20px; }
                .section { margin-bottom: 20px; }
                .section-title { font-weight: bold; margin-bottom: 8px; }
                .config { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; }
            </style>
        </head>
        <body>
            <div class="header">${knowledge.name}</div>
            <div class="meta">
                版本: ${knowledge.version} | 场景: ${knowledge.scenario} | 
                能力: ${knowledge.capability_type}
            </div>
            
            <div class="section">
                <div class="section-title">配置信息</div>
                <pre class="config">${JSON.stringify(knowledge.config, null, 2)}</pre>
            </div>
            
            <div class="section">
                <div class="section-title">元数据</div>
                <pre class="config">${JSON.stringify(knowledge.metadata, null, 2)}</pre>
            </div>
        </body>
        </html>
    `;
}

function getQualityHtml(quality: any): string {
    const dims = quality.dimensions || {};
    const isLocal = quality.isLocal;

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; }
                .header { font-size: 1.5em; font-weight: bold; margin-bottom: 20px; }
                .overall { font-size: 2em; text-align: center; margin: 30px 0; }
                .bar-container { margin: 10px 0; }
                .bar-label { display: inline-block; width: 120px; }
                .bar-bg { display: inline-block; width: 200px; height: 20px; background: var(--vscode-input-background); border-radius: 4px; }
                .bar-fill { height: 100%; border-radius: 4px; }
                .bar-value { display: inline-block; width: 60px; text-align: right; }
                .local-badge { background: #2196F3; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.8em; margin-left: 10px; }
                .info-box { background: var(--vscode-textCodeBlock-background); padding: 15px; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="header">
                质量报告
                ${isLocal ? '<span class="local-badge">本地知识点</span>' : ''}
            </div>

            ${isLocal ? `
            <div class="info-box">
                <strong>说明：</strong>这是基于本地知识点的基本信息生成的预估质量报告。
                如需获取更精确的质量评估，请将该知识点注册到后端服务。
            </div>
            ` : ''}

            <div class="overall">
                <div>综合评分</div>
                <div style="font-size: 3em; color: ${quality.level === 'A' || quality.level === 'A+' ? 'green' : quality.level === 'B' ? 'orange' : 'red'}">
                    ${(quality.score * 100).toFixed(0)}%
                </div>
                <div>等级: ${quality.level}</div>
            </div>

            <div class="bar-container">
                <span class="bar-label">准确性</span>
                <div class="bar-bg"><div class="bar-fill" style="width: ${dims.accuracy * 100}%; background: #4CAF50;"></div></div>
                <span class="bar-value">${(dims.accuracy * 100).toFixed(0)}%</span>
            </div>

            <div class="bar-container">
                <span class="bar-label">完整性</span>
                <div class="bar-bg"><div class="bar-fill" style="width: ${dims.completeness * 100}%; background: #2196F3;"></div></div>
                <span class="bar-value">${(dims.completeness * 100).toFixed(0)}%</span>
            </div>

            <div class="bar-container">
                <span class="bar-label">一致性</span>
                <div class="bar-bg"><div class="bar-fill" style="width: ${dims.consistency * 100}%; background: #FF9800;"></div></div>
                <span class="bar-value">${(dims.consistency * 100).toFixed(0)}%</span>
            </div>

            <div class="bar-container">
                <span class="bar-label">安全性</span>
                <div class="bar-bg"><div class="bar-fill" style="width: ${dims.safety * 100}%; background: #F44336;"></div></div>
                <span class="bar-value">${(dims.safety * 100).toFixed(0)}%</span>
            </div>

            <div class="bar-container">
                <span class="bar-label">可用性</span>
                <div class="bar-bg"><div class="bar-fill" style="width: ${dims.usability * 100}%; background: #9C27B0;"></div></div>
                <span class="bar-value">${(dims.usability * 100).toFixed(0)}%</span>
            </div>
        </body>
        </html>
    `;
}

/**
 * 自动启动后端服务
 */
async function startBackendService(context: vscode.ExtensionContext): Promise<void> {
    // 检查后端是否已经在运行
    try {
        const response = await fetch('http://localhost:8080/health');
        if (response.ok) {
            Logger.info('后端服务已经在运行', 'BACKEND');
            return;
        }
    } catch {
        // 后端未运行，继续启动
    }

    // 查找后端服务路径
    let backendPath: string | undefined;

    // 1. 首先检查工作区父目录
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const workspaceRoot = path.dirname(vscode.workspace.workspaceFolders[0].uri.fsPath);
        const possiblePaths = [
            path.join(workspaceRoot, 'start.py'),
            path.join(workspaceRoot, 'agentkms', 'main.py'),
        ];

        for (const p of possiblePaths) {
            if (require('fs').existsSync(p)) {
                backendPath = p;
                break;
            }
        }
    }

    if (!backendPath) {
        Logger.warn('未找到后端服务启动文件，跳过自动启动', 'BACKEND');
        return;
    }

    Logger.info(`正在启动后端服务: ${backendPath}`, 'BACKEND');

    try {
        // 启动 Python 后端服务
        const isWindows = process.platform === 'win32';
        const pythonCmd = isWindows ? 'python' : 'python3';

        backendProcess = spawn(pythonCmd, [backendPath, '--host', '127.0.0.1', '--port', '8080'], {
            cwd: path.dirname(backendPath),
            detached: false,
            windowsHide: true
        });

        // 监听输出
        backendProcess.stdout?.on('data', (data) => {
            Logger.info(`[Backend] ${data.toString().trim()}`, 'BACKEND');
        });

        backendProcess.stderr?.on('data', (data) => {
            Logger.error(`[Backend] ${data.toString().trim()}`, 'BACKEND');
        });

        backendProcess.on('error', (error) => {
            Logger.error(`后端服务启动失败: ${error.message}`, 'BACKEND');
        });

        backendProcess.on('exit', (code) => {
            Logger.info(`后端服务已退出，退出码: ${code}`, 'BACKEND');
            backendProcess = undefined;
        });

        // 等待后端服务启动
        await new Promise<void>((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 30;
            const interval = setInterval(async () => {
                attempts++;
                try {
                    const response = await fetch('http://localhost:8080/health');
                    if (response.ok) {
                        clearInterval(interval);
                        Logger.info('后端服务启动成功', 'BACKEND');
                        resolve();
                    }
                } catch {
                    if (attempts >= maxAttempts) {
                        clearInterval(interval);
                        reject(new Error('后端服务启动超时'));
                    }
                }
            }, 1000);
        });

        // 注册销毁回调
        context.subscriptions.push({
            dispose: () => {
                if (backendProcess) {
                    Logger.info('正在停止后端服务...', 'BACKEND');
                    backendProcess.kill();
                }
            }
        });

    } catch (error) {
        Logger.error(`启动后端服务失败: ${error}`, 'BACKEND');
        vscode.window.showWarningMessage('自动启动后端服务失败，请手动启动');
    }
}
