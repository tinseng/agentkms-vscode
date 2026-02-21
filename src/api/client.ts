import axios from 'axios';
import { Logger } from '../utils/logger';

export class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private async request(method: string, path: string, data?: any): Promise<any> {
        const url = `${this.baseUrl}/api/v1${path}`;
        const startTime = Date.now();
        
        try {
            const response = await axios({
                method,
                url,
                data,
                timeout: 10000
            });
            
            const responseTime = Date.now() - startTime;
            Logger.apiCall(method, url, response.status, responseTime);
            
            return response.data;
        } catch (error: any) {
            const responseTime = Date.now() - startTime;
            const status = error.response?.status;

            // 特殊处理：后端未实现 /agent/list 接口时，不弹错误，只返回空列表
            if (status === 404 && path === '/agent/list') {
                Logger.warn('后端未实现 /agent/list 接口，Agent 视图将显示为空', 'API', {
                    url,
                    status,
                    responseTime
                });
                return { agents: [] };
            }

            Logger.apiCall(method, url, status, responseTime, error);
            throw error;
        }
    }

    // 健康检查
    async checkHealth(): Promise<boolean> {
        const response = await axios.get(`${this.baseUrl}/health`);
        return response.data.status === 'ok';
    }

    // 搜索知识
    async searchKnowledge(query: string, scenario?: string): Promise<any[]> {
        const params = new URLSearchParams({ q: query });
        if (scenario) { params.append('scenario', scenario); }
        
        const result = await this.request('GET', `/knowledge/search?${params}`);
        return result.results || [];
    }

    // 获取知识详情
    async getKnowledge(moduleId: string): Promise<any> {
        return this.request('GET', `/knowledge/${moduleId}`);
    }

    // 注册知识
    async registerKnowledge(data: {
        name: string;
        scenario: string;
        capability_type: string;
        model_path?: string;
        config?: any;
        metadata?: any;
    }): Promise<any> {
        return this.request('POST', '/knowledge/register', data);
    }

    // 获取质量评分
    async getQuality(moduleId: string): Promise<any> {
        return this.request('GET', `/knowledge/${moduleId}/quality`);
    }

    // 检测冲突
    async detectConflicts(moduleId: string): Promise<any> {
        return this.request('POST', `/knowledge/${moduleId}/detect-conflicts`);
    }

    // 学习决策
    async decideLearning(data: {
        agent_id: string;
        skill_type: string;
        scenario?: string;
        min_accuracy?: number;
    }): Promise<any> {
        return this.request('POST', '/learning/decide', data);
    }

    // 执行学习
    async learnKnowledge(agentId: string, moduleId: string): Promise<any> {
        return this.request('POST', `/learning/learn?agent_id=${agentId}&module_id=${moduleId}`);
    }

    // 导入知识包
    async importBundle(packagePath: string): Promise<any> {
        return this.request('POST', `/bundle/import?package_path=${encodeURIComponent(packagePath)}`);
    }

    // 导出知识包
    async exportBundle(moduleIds: string[], outputPath: string): Promise<any> {
        return this.request('GET', `/bundle/export?module_ids=${moduleIds.join(',')}&output_path=${encodeURIComponent(outputPath)}`);
    }

    // 获取Agent列表
    async listAgents(): Promise<any[]> {
        const result = await this.request('GET', '/agent/list');
        return result.agents || [];
    }
}
