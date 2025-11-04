# 部署到 Smithery 指南

## 📋 前置条件

1. **GitHub 账户**：项目需要推送到 GitHub 仓库
2. **Smithery 账户**：访问 [smithery.ai](https://smithery.ai) 注册/登录
3. **Node.js 环境**：本地需要 Node.js 18+ 用于测试

## 🚀 部署步骤

### 步骤 1: 确保项目已推送到 GitHub

```bash
# 如果还没有推送到 GitHub，执行以下命令：
git init  # 如果还没有初始化
git add .
git commit -m "Initial commit for Smithery deployment"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 步骤 2: 验证项目配置

确保以下文件存在且配置正确：

- ✅ `smithery.yaml` - 已存在，配置完整
- ✅ `Dockerfile` - 已存在，配置正确
- ✅ `package.json` - 已存在，包含构建脚本
- ✅ `dist/index.js` - 需要先构建（运行 `npm run build`）

### 步骤 3: 本地构建测试

在部署前，建议先本地测试构建：

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 验证 dist/index.js 已生成
ls -la dist/index.js
```

### 步骤 4: 通过 Smithery CLI 发布

#### 4.1 安装 Smithery CLI（如果还没安装）

```bash
npm install -g @smithery/cli
```

#### 4.2 登录 Smithery

```bash
npx @smithery/cli login
```

#### 4.3 发布到 Smithery

```bash
# 在项目根目录执行
npx @smithery/cli publish
```

或者指定特定路径：

```bash
npx @smithery/cli publish --path .
```

### 步骤 5: 通过 Smithery Web 界面发布（替代方案）

如果 CLI 不工作，可以通过 Web 界面：

1. 访问 [smithery.ai](https://smithery.ai)
2. 登录你的账户
3. 点击 "Create Server" 或 "Publish"
4. 连接到你的 GitHub 仓库
5. 选择包含 `smithery.yaml` 的仓库
6. Smithery 会自动检测配置并开始构建

### 步骤 6: 验证部署

部署成功后，你可以通过以下方式验证：

```bash
# 测试安装（使用 Smithery 包名）
npx -y @smithery/cli install @YourUsername/selfhosted-supabase-mcp --client claude
```

## 📝 配置说明

### smithery.yaml 配置分析

你的 `smithery.yaml` 配置了以下内容：

- **必需参数**：
  - `supabaseUrl`: Supabase HTTP URL
  - `supabaseAnonKey`: Supabase 匿名密钥

- **可选参数**：
  - `supabaseServiceRoleKey`: 服务角色密钥（用于高级操作）
  - `databaseUrl`: PostgreSQL 直接连接字符串
  - `supabaseAuthJwtSecret`: JWT 密钥
  - `toolsConfig`: 工具配置文件路径

### Dockerfile 说明

你的 Dockerfile 使用：
- `node:lts-alpine` 作为基础镜像
- 复制依赖文件并安装
- 构建项目（`npm run build`）
- 入口点设置为 `node dist/index.js`

## ⚠️ 注意事项

1. **构建产物**：确保 `dist/index.js` 在构建后存在
2. **敏感信息**：不要在代码中硬编码密钥，使用配置参数
3. **版本管理**：建议使用 Git tags 管理版本
4. **README 更新**：README.md 中已经有 Smithery badge，部署后会自动更新

## 🔍 故障排查

### 问题 1: 构建失败

```bash
# 检查 Node.js 版本
node --version  # 应该是 18+

# 清理并重新安装
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 问题 2: Smithery 无法检测配置

- 确保 `smithery.yaml` 在仓库根目录
- 检查 YAML 语法是否正确
- 查看 Smithery 构建日志

### 问题 3: 运行时错误

- 检查 `dist/index.js` 是否正确生成
- 验证所有依赖都已安装
- 查看 MCP 客户端日志

## 📚 相关资源

- [Smithery 文档](https://smithery.ai/docs)
- [MCP 规范](https://github.com/modelcontextprotocol/specification)
- [项目 README](./README.md)

## ✅ 部署检查清单

- [ ] 项目已推送到 GitHub
- [ ] `npm run build` 成功执行
- [ ] `dist/index.js` 文件存在
- [ ] `smithery.yaml` 配置正确
- [ ] `Dockerfile` 配置正确
- [ ] 已登录 Smithery CLI 或 Web 界面
- [ ] 发布成功并可以安装

## 🎉 部署成功后

部署成功后，你的 MCP 服务器可以通过以下方式安装：

```bash
npx -y @smithery/cli install @YourUsername/selfhosted-supabase-mcp --client claude
```

然后用户可以在他们的 MCP 客户端（如 Claude Desktop、Cursor 等）中配置使用。
