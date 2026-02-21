import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ProjectAnalysis {
    name: string;
    language: string;
    framework: string[];
    dependencies: string[];
    devDependencies: string[];
    keywords: string[];
    detectedCapabilities: CapabilityInfo[];
}

export interface CapabilityInfo {
    type: string;
    name: string;
    category: string;
    confidence: number;
    source: string;
}

const CAPABILITY_PATTERNS: { pattern: RegExp; capability: string; category: string }[] = [
    { pattern: /axios|fetch|request|http client/i, capability: 'http_client', category: 'network' },
    { pattern: /ws|websocket|socket\.io/i, capability: 'websocket', category: 'network' },
    { pattern: /express|fastify|koa|hapi/i, capability: 'web_server', category: 'backend' },
    { pattern: /mongoose|sequelize|typeorm|prisma|db/i, capability: 'database', category: 'backend' },
    { pattern: /redis|memcached/i, capability: 'cache', category: 'backend' },
    { pattern: /jwt|oauth|passport|auth/i, capability: 'authentication', category: 'security' },
    { pattern: /bcrypt|argon2|crypto/i, capability: 'encryption', category: 'security' },
    { pattern: /vscode|extension/i, capability: 'vscode_extension', category: 'ide' },
    { pattern: /react|vue|angular|svelte/i, capability: 'frontend_framework', category: 'frontend' },
    { pattern: /webpack|vite|rollup|parcel/i, capability: 'build_tool', category: 'devops' },
    { pattern: /jest|vitest|mocha|jasmine|testing-library/i, capability: 'testing', category: 'devops' },
    { pattern: /eslint|prettier|husky|lint/i, capability: 'code_quality', category: 'devops' },
    { pattern: /docker|kubernetes|k8s/i, capability: 'containerization', category: 'devops' },
    { pattern: /git|github|gitlab|bitbucket/i, capability: 'version_control', category: 'devops' },
    { pattern: /mongodb|mysql|postgres|redis|elasticsearch/i, capability: 'database', category: 'backend' },
    { pattern: /aws|azure|gcp|cloud/i, capability: 'cloud_service', category: 'devops' },
    { pattern: /ai|ml|tensorflow|pytorch|openai|llm/i, capability: 'ai_ml', category: 'ai' },
    { pattern: /nlp|text|tokenizer|embedding/i, capability: 'nlp', category: 'ai' },
    { pattern: /vision|image|cv|opencv/i, capability: 'computer_vision', category: 'ai' },
    { pattern: /speech|tts|asr|voice|audio/i, capability: 'speech_processing', category: 'ai' },
    { pattern: /pdf|docx|excel|document/i, capability: 'document_processing', category: 'tools' },
    { pattern: /pdf|ocr/i, capability: 'ocr', category: 'ai' },
];

export class ProjectAnalyzer {
    async analyzeWorkspace(): Promise<ProjectAnalysis | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const packageJson = await this.readPackageJson(rootPath);
        
        if (!packageJson) {
            return null;
        }

        const allDeps = [
            ...Object.keys(packageJson.dependencies || {}),
            ...Object.keys(packageJson.devDependencies || {})
        ];

        const detectedCapabilities = this.detectCapabilities(allDeps);

        return {
            name: packageJson.name || 'unknown',
            language: this.detectLanguage(rootPath),
            framework: this.detectFramework(allDeps),
            dependencies: Object.keys(packageJson.dependencies || {}),
            devDependencies: Object.keys(packageJson.devDependencies || {}),
            keywords: packageJson.keywords || [],
            detectedCapabilities
        };
    }

    private async readPackageJson(rootPath: string): Promise<any> {
        const packagePath = path.join(rootPath, 'package.json');
        try {
            if (fs.existsSync(packagePath)) {
                const content = fs.readFileSync(packagePath, 'utf8');
                return JSON.parse(content);
            }
        } catch {
            // ignore
        }
        return null;
    }

    private detectLanguage(rootPath: string): string {
        const extensions = new Set<string>();
        
        const scanDir = (dir: string, depth: number = 0) => {
            if (depth > 3) return;
            try {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    if (file.startsWith('.')) continue;
                    const fullPath = path.join(dir, file);
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory() && file !== 'node_modules') {
                        scanDir(fullPath, depth + 1);
                    } else if (stat.isFile()) {
                        const ext = path.extname(file).toLowerCase();
                        extensions.add(ext);
                    }
                }
            } catch {
                // ignore
            }
        };

        scanDir(rootPath);

        if (extensions.has('.ts') || extensions.has('.tsx')) return 'TypeScript';
        if (extensions.has('.js') || extensions.has('.jsx')) return 'JavaScript';
        if (extensions.has('.py')) return 'Python';
        if (extensions.has('.java')) return 'Java';
        if (extensions.has('.go')) return 'Go';
        if (extensions.has('.rs')) return 'Rust';
        if (extensions.has('.cs')) return 'C#';
        
        return 'Unknown';
    }

    private detectFramework(dependencies: string[]): string[] {
        const frameworks: string[] = [];
        const frameworkMap: Record<string, string> = {
            'express': 'Express',
            'fastify': 'Fastify',
            'koa': 'Koa',
            'react': 'React',
            'vue': 'Vue',
            'angular': 'Angular',
            'next': 'Next.js',
            'nuxt': 'Nuxt',
            'svelte': 'Svelte',
            'nest': 'NestJS',
            'electron': 'Electron',
            'react-native': 'React Native',
            'flutter': 'Flutter',
        };

        for (const dep of dependencies) {
            if (frameworkMap[dep]) {
                frameworks.push(frameworkMap[dep]);
            }
        }

        return frameworks;
    }

    private detectCapabilities(dependencies: string[]): CapabilityInfo[] {
        const capabilities: CapabilityInfo[] = [];

        for (const dep of dependencies) {
            const depLower = dep.toLowerCase();
            for (const { pattern, capability, category } of CAPABILITY_PATTERNS) {
                if (pattern.test(depLower)) {
                    capabilities.push({
                        type: capability,
                        name: this.formatCapabilityName(capability),
                        category,
                        confidence: 0.9,
                        source: dep
                    });
                    break;
                }
            }
        }

        return capabilities;
    }

    private formatCapabilityName(capability: string): string {
        return capability.split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }
}

export async function analyzeAndRegisterKnowledge(
    apiClient: any,
    knowledgeProvider: any
): Promise<void> {
    const analyzer = new ProjectAnalyzer();
    const analysis = await analyzer.analyzeWorkspace();

    if (!analysis) {
        vscode.window.showWarningMessage('未找到可分析的项目');
        return;
    }

    const capabilityItems = analysis.detectedCapabilities.map(cap => ({
        label: cap.name,
        description: `来源: ${cap.source}`,
        picked: false,
        capability: cap
    }));

    if (capabilityItems.length === 0) {
        vscode.window.showInformationMessage('未检测到特殊能力');
        return;
    }

    const selected = await vscode.window.showQuickPick(capabilityItems, {
        placeHolder: '选择要注册的能力（可多选）',
        canPickMany: true
    });

    if (!selected || selected.length === 0) {
        return;
    }

    const scenarioItems = [
        { label: '工业自动化', value: 'industrial' },
        { label: '客户服务', value: 'customer_service' },
        { label: '数据分析', value: 'data_analysis' },
        { label: '代码开发', value: 'code_development' },
        { label: 'AI/ML', value: 'ai_ml' }
    ];

    const scenario = await vscode.window.showQuickPick(scenarioItems, {
        placeHolder: '选择场景类型'
    });

    if (!scenario) { return; }

    for (const item of selected) {
        const capability = item.capability;
        try {
            const result = await apiClient.registerKnowledge({
                name: capability.name,
                scenario: scenario.value,
                capability_type: capability.type,
                metadata: {
                    project: analysis.name,
                    language: analysis.language,
                    framework: analysis.framework,
                    confidence: capability.confidence,
                    source: capability.source,
                    dependencies: analysis.dependencies.slice(0, 20),
                    keywords: [capability.type, capability.category, ...analysis.keywords]
                }
            });

            vscode.window.showInformationMessage(
                `已注册知识: ${capability.name} (${result.module_id})`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`注册失败: ${capability.name} - ${error}`);
        }
    }

    if (knowledgeProvider) {
        knowledgeProvider.refresh();
    }
}
