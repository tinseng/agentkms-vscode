# AgentKMS VS Code Extension

## 安装方法

### 方式一：开发模式安装

1. **安装依赖**
   ```bash
   cd agentkms-vscode
   npm install
   ```

2. **编译 TypeScript**
   ```bash
   npm run compile
   ```

3. **在 VS Code 中调试**
   - 在 VS Code 中打开 `agentkms-vscode` 文件夹
   - 按 `F5` 启动调试
   - 这将打开一个新的 VS Code 窗口，插件已加载

### 方式二：打包安装

1. **安装 vsce 工具**
   ```bash
   npm install -g @vscode/vsce
   ```

2. **打包插件**
   ```bash
   cd agentkms-vscode
   vsce package
   ```

3. **安装 .vsix 文件**
   - 在 VS Code 中按 `Ctrl+Shift+P`
   - 输入 `Extensions: Install from VSIX`
   - 选择生成的 `.vsix` 文件

## 使用方法

1. **启动 AgentKMS 服务**
   ```bash
   cd ..
   python start.py --port 8080
   ```

2. **在 VS Code 中使用**
   - 插件会自动连接到 `http://localhost:8080`
   - 侧边栏会显示 AgentKMS 图标
   - 点击图标查看知识模块和 Agent 列表

## 快捷命令

| 命令 | 快捷键 | 功能 |
|------|--------|------|
| AgentKMS: 启动服务 | - | 连接到 AgentKMS 服务 |
| AgentKMS: 搜索知识 | - | 搜索知识模块 |
| AgentKMS: 注册知识 | - | 注册新知识 |
| AgentKMS: 查看质量 | - | 查看质量评分报告 |
| AgentKMS: 导出知识包 | - | 导出 .akb 文件 |
| AgentKMS: 导入知识包 | - | 导入 .akb 文件 |

## 配置选项

在 VS Code 设置中搜索 `agentkms` 可以配置：

| 选项 | 默认值 | 说明 |
|------|--------|------|
| apiUrl | http://localhost:8080 | API 服务地址 |
| autoStart | true | 自动连接服务 |
| dataDir | ./data | 数据目录 |
| defaultScenario | industrial | 默认场景 |
| qualityThreshold | 0.7 | 质量阈值 |
