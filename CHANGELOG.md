# AgentKMS VS Code 插件加载指南

## 方法一：开发模式加载（推荐）

### 步骤：

1. **打开 VS Code**

2. **打开插件目录**
   ```
   文件 -> 打开文件夹 -> 选择 f:\AI\20260221-1\agentkms-vscode
   ```

3. **启动调试**
   - 按 `F5` 键
   - 或点击菜单 `运行 -> 启动调试`

4. **验证加载**
   - 将打开一个新的 VS Code 窗口（扩展开发宿主）
   - 侧边栏应该出现 AgentKMS 图标
   - 状态栏显示 "AgentKMS" 状态

## 方法二：打包安装

### 步骤：

1. **安装 vsce 工具**（如果尚未安装）
   ```bash
   npm install -g @vscode/vsce
   ```

2. **打包插件**
   ```bash
   cd f:\AI\20260221-1\agentkms-vscode
   vsce package
   ```

3. **安装 .vsix 文件**
   - VS Code 中按 `Ctrl+Shift+P`
   - 输入 `Extensions: Install from VSIX`
   - 选择生成的 `agentkms-1.0.0.vsix` 文件

4. **重启 VS Code**

## 使用前提

**必须先启动 AgentKMS 后端服务：**

```bash
cd f:\AI\20260221-1
python start.py --port 8080
```

## 功能验证

加载成功后，可以：

1. **查看侧边栏**
   - 点击左侧活动栏的 AgentKMS 图标
   - 查看 "知识模块" 和 "我的Agent" 面板

2. **使用命令**
   - 按 `Ctrl+Shift+P` 打开命令面板
   - 输入 `AgentKMS` 查看所有可用命令

3. **检查状态栏**
   - 右下角应显示 AgentKMS 连接状态

## 常见问题

### Q: 插件显示"连接服务失败"？

A: 确保后端服务已启动：
```bash
python start.py --port 8080
```

### Q: 编译错误？

A: 重新安装依赖：
```bash
npm install --prefix f:\AI\20260221-1\agentkms-vscode
npm run compile --prefix f:\AI\20260221-1\agentkms-vscode
```

### Q: 如何修改 API 地址？

A: 在 VS Code 设置中搜索 `agentkms`，修改 `apiUrl` 配置。
