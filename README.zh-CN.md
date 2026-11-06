# ARTEX

**由大语言模型驱动的自主渗透测试平台，采用 Go 后端、Next.js 前端和 PostgreSQL，支持多智能体协作、资产管理、流量取证与人工介入。**

[English](README.md) | 简体中文

本仓库 [Sheldon1001/ARTEX-NEW](https://github.com/Sheldon1001/ARTEX-NEW) 基于 [BaaRai/ARTEX](https://github.com/BaaRai/ARTEX)，原始项目来自 [Autumn-27](https://github.com/Autumn-27)。当前版本恢复简体中文 Web 界面，补充 ARM64 Docker 依赖兼容修复与中文说明，并保留原项目的 AGPL-3.0 许可证和提交历史。

ARTEX 面向自有系统、隔离靶场和明确授权范围内的安全测试。实际测试会调用命令行、浏览器等工具并访问目标；运行前应明确测试范围与操作约束。

## 目录

- [项目定位](#项目定位)
- [主要功能](#主要功能)
- [运行原理](#运行原理)
- [技术栈与数据存储](#技术栈与数据存储)
- [界面预览](#界面预览)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [完成第一个任务](#完成第一个任务)
- [浏览器流量采集与资产同步](#浏览器流量采集与资产同步)
- [本地开发与检查](#本地开发与检查)
- [源码导读](#源码导读)
- [备份与升级](#备份与升级)
- [反向代理与远程访问](#反向代理与远程访问)
- [常见问题与功能边界](#常见问题与功能边界)
- [许可证与相关文档](#许可证与相关文档)

## 项目定位

ARTEX 把一次安全测试组织成持续推进的任务：用户给出目标与范围，规划智能体安排下一步工作，执行智能体使用实际工具验证，结果再进入后续规划。你可以在网页中查看它发现了哪些资产、尝试过哪些方向、调用过什么工具，以及漏洞结论由哪些证据支撑。

它将几类工作放在同一个平台中：

- **测试编排**：将自然语言目标拆成可执行工作，管理依赖、并发、暂停和运行预算。
- **资产与知识管理**：保存跨任务共享的资产，以及单个任务产生的事实、线索和探索过程。
- **过程观测与取证**：查看智能体会话、工具调用、HTTP 请求响应和模型调用记录。
- **人工协作**：补充信息、修改目标、处理工具调用审批，以及发起漏洞复测。
- **结果交付**：管理漏洞状态，生成报告，导出漏洞与相关证据。

它适合希望把测试过程、资产和证据集中管理的安全研究人员，也适合研究多智能体调度、工具调用和可追踪 AI 工作流的开发者。结果质量取决于模型能力、目标环境、工具可用性和提供的信息；漏洞结论仍需结合证据复核。

## 主要功能

| 能力 | 当前实现 |
| --- | --- |
| 多智能体协作 | 目标拆解、规划、并发执行、人工对话、漏洞报告和复测等角色分工 |
| 双图建模 | 全局资产图与任务探索图相互关联，展示发现路径和资产测试覆盖情况 |
| 任务管理 | 目标、范围、约束、执行记录、运行控制，以及任务归档与恢复 |
| 资产管理 | 域名、子域名、IP、服务、应用和接口的归一化管理，支持异步 DNS/HTTP 信息补全 |
| 流量录制 | 内置 HTTP/HTTPS MITM 代理，支持流量检索、详情查看和大响应体分段读取 |
| 浏览器采集 | Chrome/Edge 扩展将人工登录和浏览产生的流量导入平台 |
| 漏洞证据 | 将多条真实流量绑定到同一漏洞，标注对照、证明、验证等角色，保存独立证据快照 |
| 漏洞复测 | 独立复测会话，保存复测结论、证据和历史，确认修复后更新漏洞状态 |
| 人工审批 | 工具调用规则支持允许、拒绝、等待审批，可配置模型兜底判断并查看审批详情 |
| 模型配置 | 支持 Anthropic、OpenAI Chat Completions、OpenAI Responses 和 Ollama 格式；可配置多个模型及故障切换 |
| 能力扩展 | 通过 `SKILL.md` 技能目录、MCP 服务和工具配置扩展智能体能力 |
| 观测与通知 | 仪表盘、实时活动、后端日志、Token 用量，以及钉钉、飞书、企业微信、Telegram、邮件和 Webhook 通知 |
| 外部资产接入 | 从 ScopeSentry 按项目或任务导入资产，合并到平台资产图 |

## 运行原理

### 一次任务怎样推进

```mermaid
flowchart TD
    U[用户提交目标、范围与约束] --> G[目标拆解]
    G --> P[Planner 读取当前进展并规划]
    P --> Q[待执行意图队列]
    Q --> W[多个 Worker 并发领取工作]
    W --> T[命令行、HTTP、浏览器、MCP 等工具]
    T --> R[记录资产、事实、线索、漏洞与证据]
    R --> P
    R --> F[报告与漏洞复测]
    H[人工对话、补充信息与审批] --> P
    H --> T
```

引擎位于 `server/engine.go`，以图变化等事件唤醒规划器。规划器读取当前探索状态，生成新的执行意图（`intent`）；Worker 领取一个意图，使用工具执行，再将结果写回。新的事实和资产可以触发下一轮规划，任务由此逐步推进。

主要角色如下：

| 角色 | 作用 |
| --- | --- |
| `goals` | 从用户描述中拆解目标、提取范围 |
| `planner` | 判断当前进展、维护规划待办、生成执行意图 |
| `worker` | 执行领取的意图，写入资产、事实、线索和漏洞 |
| `mainagent` | 在任务中与用户交流，接收补充信息和干预 |
| 报告 Agent | 根据漏洞信息与已有证据撰写报告 |
| `retester` | 对已有漏洞发起独立复测，记录是否仍可复现 |

规划器保留跨轮次共享的待办列表，因此有前置依赖的工作可以逐步安排。Worker 还可以搜索其他 Worker 的执行轨迹，复用尚未被整理成正式事实的观察结果。

### 为什么使用两张图

**资产图回答“有哪些目标”。** 它跨任务共享，记录公司及其域名、IP、服务、应用、接口等资产。资产归一化、去重和父子关系由程序处理，智能体提交发现的信息。

**探索图回答“这次测试怎样推进”。** 它属于具体任务，包含 `goal`、`intent`、`fact`、`finding`、`hint` 等节点，并保存节点之间的来源和推导关系。

两张图通过资产锚点（`exploration_anchors`）关联。因此可以从某条漏洞追溯对应资产，也可以从某个资产查看本次任务对它做过哪些测试。

```mermaid
flowchart LR
    subgraph EG[任务探索图]
        G[目标 goal] --> I[执行意图 intent]
        I --> F[事实 fact]
        F --> V[漏洞 finding]
    end
    subgraph AG[共享资产图]
        D[域名] --> S[服务]
        S --> E[接口]
    end
    I -.资产锚点.-> S
    V -.资产锚点.-> E
```

### 取证与审批怎样衔接

工具调用可经过 `guard` 和 `intercept`，按当前规则允许、拒绝或等待人工审批。规则和工具启用范围可由用户配置；这些机制的效果取决于实际配置。

测试 HTTP 流量由录制代理或浏览器扩展采集。漏洞可以关联多条流量，并将其保存为独立证据快照。证据正文使用内容哈希校验，独立于可清理的原始流量目录。

“Agent 自动绑定流量”默认关闭，可在系统设置中启用。关闭时仍可采集流量、手动绑定证据和导出报告；启用后，报告 Agent 会检索和核对已有流量，再执行绑定，模型用量也会增加。具体规则见[漏洞流量证据说明](docs/vulnerability-traffic-evidence.md)。

## 技术栈与数据存储

| 部分 | 技术与说明 |
| --- | --- |
| 后端 | Go、标准库 `net/http`、JWT 鉴权、SSE 实时推送 |
| 智能体运行时 | Norma SDK；当前 `go.mod` 将 `Autumn-27/norma` 替换为 `BaaRai/Norma v0.4.4` |
| 前端 | Next.js 16、React 19、TypeScript、Tailwind CSS 4、shadcn/ui 等组件 |
| 图与可视化 | AntV G6/Graphin、React Flow、Recharts 等 |
| 主数据库 | PostgreSQL，通过 pgx 连接；保存资产图、探索图、配置、漏洞和业务记录 |
| 流量索引 | SQLite（`modernc.org/sqlite`），配合流量正文与大对象文件存储 |
| 本地文件 | 任务工作区、会话记录、流量、证据附件等保存在数据目录中 |
| 发布方式 | 前端静态导出后由 `go:embed` 嵌入 Go 程序，也可使用 Docker Compose 部署 |

**当前项目必须连接 PostgreSQL。** 部分源码注释仍提到早期的“双 SQLite 图”，应以 `db/db.go` 的 PostgreSQL 实现为准；SQLite 仍用于流量索引等子系统。

“单文件程序”指前端资源可嵌入可执行文件。运行仍依赖 PostgreSQL，实际测试还需要对应的外部工具和模型服务。

## 界面预览

| 仪表盘 | 任务执行 |
| :---: | :---: |
| ![仪表盘](screenshots/dashboard.png) | ![任务执行与工具调用](screenshots/sessions.png) |

| 探索图 | 资产测试覆盖图 |
| :---: | :---: |
| ![探索图](screenshots/graph.png) | ![资产测试覆盖图](screenshots/assets_test.png) |

| 漏洞管理 | 流量录制 |
| :---: | :---: |
| ![漏洞管理](screenshots/findings.png) | ![流量录制](screenshots/traffic.png) |

## 快速开始

### 环境要求

- **Docker 部署**：Docker 和 Docker Compose，可访问构建所需的软件源。
- **本地构建**：Go 工具链（当前 `go.mod` 声明 `go 1.26.10`）、Node.js 22、npm；使用 `build.sh` 还需要 `rsync`，打包需要 `zip`。
- **数据库**：必须配置 PostgreSQL；项目 Compose 与 CI 使用 PostgreSQL 16。
- **模型**：执行真实探索需要可用的 LLM，可在启动时通过环境变量配置，也可稍后在网页配置。

Docker 镜像包含 nmap、nuclei、httpx、subfinder、katana、ffuf、dalfox、sqlmap、BBOT 和 Playwright 等工具；本地运行时需要自行准备任务所需的工具。工具版本及安装细节见 [Dockerfile](Dockerfile)。

先获取本分支源码：

```bash
git clone https://github.com/Sheldon1001/ARTEX-NEW.git
cd ARTEX-NEW
```

### 方式一：交互式安装

在项目根目录执行：

```bash
./install.sh
```

脚本提供全 Docker 部署和本地构建两种路径，并引导配置数据库。全 Docker 路径会创建或复用 `.env`，从当前源码构建镜像并启动服务。macOS 使用 Docker 路径前需准备好 Docker Desktop。

### 方式二：手动 Docker Compose 部署

```bash
# 在项目根目录执行
cp .env.example .env

# 编辑 .env，至少修改 POSTGRES_PASSWORD
# LLM 密钥可在此填写，也可启动后在界面配置

docker compose up -d --build
docker compose logs -f artex
```

镜像由当前源码多阶段构建，自动完成前端导出和 Go 编译，无需预先构建可执行文件。首次构建会下载多种工具与浏览器，耗时取决于网络和机器性能。

启动后打开 **http://localhost:8787**。默认仅向宿主机回环地址发布 Web 端口，流量代理为 **127.0.0.1:8788**；Compose 内部 PostgreSQL 不向宿主机发布端口。

### 首次设置管理员

尚未设置管理员密码时，后端会在日志中打印一次性设置令牌：

```bash
docker compose logs artex | rg 'Setup token'
```

如果宿主机没有 `rg`，直接在 `docker compose logs artex` 输出中查找 `Setup token`。打开 `/setup`，输入令牌并设置管理员密码。本地运行则从启动终端读取该令牌。

### 方式三：本地源码构建

先准备可连接的 PostgreSQL，再在项目根目录创建 `config.json`：

```json
{
  "database": {
    "host": "127.0.0.1",
    "port": 5432,
    "user": "artex",
    "password": "replace-with-your-password",
    "dbname": "artex",
    "sslmode": "disable"
  },
  "skill_dir": "./skills"
}
```

这里的连接参数需要与你的数据库一致。随后构建并启动：

```bash
# 构建当前平台的程序，输出到项目根目录，便于使用 start.sh
ARTEX_OUTPUT=./artex ./build.sh
./start.sh
```

脚本会安装前端依赖、导出静态页面、同步到嵌入目录，再以 `-tags embedui` 编译。希望手动构建时，可执行：

```bash
cd web
npm ci
npm run build:static
cd ..

mkdir -p server/webui/dist
cp -R web/out/. server/webui/dist/
CGO_ENABLED=0 go build -tags embedui -o artex ./cmd/artex
./start.sh
```

`start.sh` / `start.bat` 会在程序异常退出后退避重启，也是程序内更新后的重启入口。Windows 用户可在准备好数据库配置和对应可执行文件后使用 `start.bat`。

## 配置说明

### 数据库与技能目录

`config.json` 只承载数据库连接和 `skill_dir`，模型及其他运行设置来自环境变量或网页配置。

| 配置 | 解析规则 |
| --- | --- |
| 配置文件位置 | `ARTEX_CONFIG` 指定路径优先，否则查找当前工作目录中的 `config.json`，再查可执行文件旁的同名文件 |
| 数据库连接 | `ARTEX_PG_DSN` 优先于配置文件中的 `database` |
| 数据库 DSN | `database.dsn` 非空时优先于 host、port 等分项字段 |
| 技能目录 | `ARTEX_SKILL_DIR` > `config.json` 的 `skill_dir` > 可执行文件旁的 `skills/` |
| 相对技能路径 | 相对于当前工作目录解析 |

可直接使用环境变量配置数据库：

```bash
export ARTEX_PG_DSN='postgres://artex:your-password@127.0.0.1:5432/artex?sslmode=disable'
export ARTEX_SKILL_DIR="$PWD/skills"
./start.sh
```

注意：仓库的 `config.example.json` 使用 **5433** 端口和 **`/opt/artex/skills`** 目录。本地直接复制时，应按自己的数据库端口与技能位置调整。连接串中的特殊字符需使用 URL 编码。

`.env` 由 Docker Compose 读取；直接执行 `./start.sh` 不会自动加载它。本地运行请使用 shell 环境变量或 `config.json`。

### 模型配置

推荐先进入网页“LLM 配置”添加并测试模型，选择要使用的配置。系统支持为不同智能体绑定模型，以及多个配置间的故障切换。

启动时可使用以下变量：

| 变量 | 说明 |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic 格式服务的密钥 |
| `OPENAI_API_KEY` | OpenAI 格式服务的密钥 |
| `ARTEX_LLM_PROVIDER` | `anthropic`、`openai`、`openai-responses` 或 `ollama` |
| `ARTEX_LLM_MODEL` | 模型 ID，应与实际服务提供的模型一致 |
| `ARTEX_LLM_BASE_URL` | 自定义模型服务地址 |
| `ARTEX_LLM_PROXY` | 模型请求专用的 HTTP/HTTPS/SOCKS5 代理 |
| `ARTEX_LLM_STREAM` | 本地进程可设为 `false`、`0` 或 `off` 关闭流式响应 |

本地 Ollama 可通过 `ollama` 格式接入，无需 API Key，默认地址为 `http://127.0.0.1:11434/v1`。在容器中运行 ARTEX 时，应将地址改为**容器可访问的 Ollama 地址**，容器的 `127.0.0.1` 指向容器自身。

未显式设置提供方时，环境变量配置优先检测 Anthropic 密钥，其次检测 OpenAI 密钥。建议显式指定提供方和模型 ID。`ARTEX_LLM_PROXY` 不会自动沿用通用的 `HTTP_PROXY` 等变量。

上表是后端支持的变量，并非全部已在 Compose 中转发。例如 `ARTEX_LLM_STREAM` 如需用于 Docker 部署，还需加入 `docker-compose.yml` 的 `environment`，仅写入 `.env` 不会自动进入容器。

### 监听地址与运行目录

| 参数或变量 | 说明 |
| --- | --- |
| `-addr` | Web/API 监听地址，本地程序默认 `127.0.0.1:8787` |
| `-proxy` | 流量代理监听地址，默认 `127.0.0.1:8788`，传入空字符串可关闭 |
| `-data` | 数据目录，默认位于可执行文件旁的 `data/`；`go run` 模式使用当前工作目录作为基准 |
| `ARTEX_JWT_KEY_DIR` | JWT 签名密钥目录；Compose 使用持久化的 `/app/keys` |
| `ARTEX_BIND_ADDR` | Compose 发布 Web 端口使用的宿主机地址，默认 `127.0.0.1` |
| `ARTEX_TRUSTED_PROXIES` | 登录限流信任的反向代理 CIDR 列表，默认不信任转发头 |

例如：

```bash
./start.sh -addr 127.0.0.1:8787 -proxy 127.0.0.1:8788 -data ./data
```

每个任务的 Worker 并发数在“系统设置”中配置，默认值为 3。模型、浏览器和外部工具的并发也会影响资源与 Token 消耗。

## 完成第一个任务

1. 启动服务，完成管理员初始化并登录。
2. 在“LLM 配置”中填写可用模型并测试连接。
3. 查看“Agent 管理”中的角色、工具、技能及模型绑定。
4. 创建任务，填写自有或已授权目标、测试目标、范围与操作约束；如需登录状态，可先用扩展采集相关流量。
5. 启动任务，在会话、活动流、探索图和覆盖图中观察执行。需要时补充信息或处理审批。
6. 查看漏洞详情，核对复现步骤、工具输出和相关流量，按需导出报告或发起复测。

复测独立于原始扫描任务。结论包括仍可复现、已修复和无法确认；成功确认“已修复”后可更新漏洞处理状态，同时保留原有证据。

## 浏览器流量采集与资产同步

### 浏览器扩展

`extension/` 是 Manifest V3 扩展，可将人工操作中的请求响应送到 ARTEX。它适用于需要人工完成验证码、邮件验证码或双因素认证的场景。

1. 在 Chrome/Edge 扩展管理页开启开发者模式，选择“加载已解压的扩展程序”，指向 `extension/`。
2. 在扩展弹窗填写 ARTEX 地址和有效登录 JWT。当前弹窗提示的令牌位置为 ARTEX 页面 `localStorage` 中的 `artex_token`。
3. 在目标标签页点击 **Start capture**，正常登录和浏览。
4. 扩展通过需鉴权的 `POST /api/traffic/ingest` 分批上传；完成后点击 **Stop**。
5. 在 ARTEX 流量页检索记录，并按需绑定到漏洞。

扩展跳过图片、字体等二进制正文；导入接口将每段正文限制在 256 KiB。当前扩展每批发送 10 条，服务端单批最多接受 50 条。扩展采集与代理录制的正文处理方式不同，不应将扩展记录视为无限制的完整响应存档。

### ScopeSentry 资产同步

在“资产同步”页面填写 ScopeSentry 地址和 API Key，按项目或任务选择要导入的资产类型。导入结果按公司资产范围合并到 ARTEX 资产图，供后续任务使用。

## 本地开发与检查

### 分别启动前后端

先配置开发数据库，再安装前端依赖：

```bash
cd web
npm ci
cd ..
```

终端一，在项目根目录运行后端：

```bash
go run ./cmd/artex -addr 127.0.0.1:8787 -proxy 127.0.0.1:8788
```

终端二运行前端：

```bash
cd web
npm run dev -- --port 3000
```

访问 **http://localhost:3000**。开发模式下，Next.js 将 `/api/*` 转发至后端，默认地址为 `http://localhost:8787`，可通过 `AUTOPENTEST_API` 修改。SSE 跨源连接的特殊配置见后文。

也可使用 `./dev.sh` 同时启动前后端。注意脚本提示中的前端端口仍写为 `5173`，但当前 `package.json` 使用未指定端口的 `next dev`，通常从 `3000` 启动，应以 Next.js 实际输出为准。

未使用 `-tags embedui` 的后端构建不包含网页资源，需要单独启动前端。只预览界面时，可运行：

```bash
cd web
NEXT_PUBLIC_MOCK=1 npm run dev -- --port 3000
```

Mock 模式使用模拟数据，不执行真实探索。

### 检查与测试

后端常用检查与 CI 保持一致：

```bash
go build ./...
go vet ./...

# 在专用测试环境中设置 ARTEX_PG_DSN 后运行
go test -p 1 ./...
```

测试会创建、修改和清理数据库记录。使用独立测试数据库，并为需要创建测试库的测试账号提供相应权限。部分测试包会在环境变量中的数据库名后添加包名后缀；未配置数据库时，部分数据库相关测试会跳过，不能据此认定完整验证通过。

前端检查：

```bash
cd web
npx tsc --noEmit
npm run check
npm run build:static
```

CI 还执行部分包的 Go 竞态检测和 ShellCheck。具体范围与已知跳过项见 [CI 配置](.github/workflows/ci.yml)。

### 构建发布包

```bash
./build.sh --release

# 自定义目标平台
ARTEX_TARGETS=linux/amd64,windows/amd64 ./build.sh --release
```

默认生成 Linux amd64/arm64、macOS amd64/arm64 和 Windows amd64 的 ZIP 包，输出位于 `dist/`。UPX 默认关闭，需要时可显式传入 `--upx`；其兼容性需在目标环境确认。

## 源码导读

```text
ARTEX/
├── cmd/artex/       程序入口、参数解析、服务启动与退出
├── config/          配置文件、路径与 PostgreSQL DSN 解析
├── server/          HTTP API、鉴权、SSE、任务引擎与系统集成
├── agent/           智能体角色、提示词、工具装配和执行逻辑
├── db/              PostgreSQL 数据访问、schema 与启动迁移
├── traffic/         MITM 代理、流量索引、正文与大对象管理
├── evidence/        独立证据附件存储与完整性校验
├── guard/           工具调用钩子与审计
├── intercept/       拦截规则、审批与模型兜底判断
├── llmpool/         模型故障切换与健康状态
├── llmrec/          模型请求、响应与用量记录
├── mcphttp/         远程 MCP 客户端
├── enrich/          资产 DNS/HTTP 信息补全
├── notify/          消息通知适配器
├── report/          报告生成与漏洞导出
├── sidequestion/    执行过程中的旁路问答
├── skills/          提供给 ARTEX 智能体的技能与辅助脚本
├── extension/       浏览器流量采集扩展
├── web/             Next.js 前端
├── scripts/         备份、基准评测和其他维护脚本
├── docs/            功能设计与技术说明
└── screenshots/     界面截图
```

建议按以下顺序阅读：

1. `cmd/artex/main.go`：了解进程启动、配置与服务生命周期。
2. `server/manager.go`、`server/engine.go`：了解任务、存储、规划器和 Worker 如何协作。
3. `agent/planner.go`、`agent/worker.go`、`agent/tools.go`：了解规划、工具执行和结果写回。
4. `db/schema.sql`、`db/assets.go`、`db/exploration.go`：理解资产图与探索图的数据结构。
5. `traffic/`、`evidence/`、`guard/`、`intercept/`：理解取证、工具审计与审批。
6. `web/src/app/`、`web/src/lib/api.ts`：对照前端路由理解产品功能与 API。

## 备份与升级

### 备份

Compose 部署包含以下持久化内容：

| 位置 | 内容 |
| --- | --- |
| Docker 卷 `pgdata` | PostgreSQL 主数据库 |
| `./data` | 流量、索引、证据附件、任务工作文件等 |
| `./keys` | JWT 签名密钥 |
| `./skills` | 智能体技能及自定义修改 |
| `.env` / `config.json` | 按部署方式保存的连接与运行配置 |

项目提供 Compose 备份脚本：

```bash
scripts/backup.sh --with-data
scripts/backup.sh --keep 7
```

默认写入 `backups/`，保留最近 14 份；`--with-data` 同时归档 `data/`。**该脚本不包含 `keys/`、`skills/` 和配置文件，应另行保存。** 数据库中的证据引用与 `data/evidence` 正文需要配套恢复。

向已启动的 Compose 数据库恢复转储时，可使用：

```bash
gunzip -c backups/artex-db-<timestamp>.sql.gz | docker compose exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

### 升级

先备份数据库、文件和自定义技能，再使用交互脚本：

```bash
./update.sh
```

或在确认本地修改已妥善保存后，手动更新 Compose 部署：

```bash
git pull
docker compose build artex
docker compose up -d artex
```

程序每次启动会幂等执行内嵌数据库 schema 和相关迁移。重建容器时，现有持久化卷和绑定目录仍被使用。源码更新可能修改版本控制中的技能文件，自定义内容应单独维护和备份。

## 反向代理与远程访问

生产构建中，前端、API 和实时活动流共用后端端口，通常只需将 HTTPS 入口转发到 `8787`。Nginx 示例中的关键设置为：

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

SSE 需要关闭代理缓冲，否则活动流可能已连接却迟迟没有更新。TLS 证书和域名配置需按实际部署补齐。

登录限流默认按直接连接的来源 IP 计算。经过反向代理时，可将 ARTEX 实际看到的代理地址加入 `ARTEX_TRUSTED_PROXIES`，例如本机直连部署使用 `127.0.0.1/32`。Docker 场景中来源可能是桥接网关地址，应按实际网络设置，仅信任自己的代理。

如需直接从其他设备访问 Compose 中的 Web 界面，在 `.env` 设置 `ARTEX_BIND_ADDR=0.0.0.0` 后重新创建服务；本地可执行文件则通过 `-addr` 修改监听地址。

`NEXT_PUBLIC_SSE_BASE` 仅用于实时流必须连接到其他源的特殊场景，需在**前端构建时**设置；同源部署无需配置，容器运行时再设置不会改变已生成的静态页面。

## 常见问题与功能边界

**网页能打开，任务却没有执行？**

先检查模型配置与连接测试，再查看后端日志、任务状态和待处理审批。真实探索需要可用 LLM；单独启动界面或使用 Mock 数据不会执行实际任务。

**本地数据库连不上？**

检查 `ARTEX_PG_DSN` 是否覆盖了 `config.json`，数据库实际端口是否与配置一致。默认 Compose 数据库只供容器网络访问；本地运行 Go 程序时，需要连接宿主机可访问的数据库。

**技能目录为空或找不到技能？**

检查 `ARTEX_SKILL_DIR`、`config.json` 的 `skill_dir`，以及启动时日志打印的实际目录。示例文件中的 `/opt/artex/skills` 需要按部署位置调整。

**HTTPS 流量是不是一定能完整录制？**

录制依赖代理、证书信任和目标协议的兼容性。当前实现遇到部分 MITM/协议失败时会透明隧道转发，请求可能成功但不会被录制。绑定漏洞证据前，应核对实际保存的记录与正文。

**浏览器扩展与漏洞证据是否保留登录信息？**

录制内容可能包含 Cookie、Authorization 头和响应正文等敏感信息。数据目录、导出包和备份应按测试数据管理；采集不等于自动脱敏。

**审批是否保证每次敏感操作都必须经过人工确认？**

实际行为取决于启用的工具、拦截规则和兜底判断配置。当前规则可以修改、停用或删除，不能将可配置审批当作不可绕过的强隔离边界。

**是否已经实现自动自我改进？**

项目包含任务结果度量和基于证据的经验提取。`ARTEX_RSI_LESSONS=off|shadow|inject` 可控制经验选择与提示注入，默认 `off`。当前没有自动修改自身代码、自动采纳提示词改动或完整的运行框架自我优化循环。详见 [RSI 设计边界](RSI.md)和[经验记忆说明](docs/rsi-lessons.md)。

**漏洞复测结果是否已经包含在所有导出中？**

当前复测历史通过漏洞详情与会话查看，尚未纳入漏洞报告导出和任务归档包，也不会自动关联采集流量。复测结论需要结合该次会话的证据查看。

## 许可证与相关文档

项目许可证为 **GNU Affero General Public License v3.0（AGPL-3.0）**，完整条款见 [LICENSE](LICENSE)。项目的使用声明及免责声明见[英文 README](README.md#license-and-disclaimer)。

- [变更记录](CHANGELOG.md)
- [漏洞流量证据与导出](docs/vulnerability-traffic-evidence.md)
- [经验记忆与注入模式](docs/rsi-lessons.md)
- [自我改进的设计约束](RSI.md)
- [AI PR 审查机制](docs/ai-pr-review-technology.md)
- [基准评测脚本](scripts/benchmark/README.md)
- [提交审查脚本](scripts/submission_review/README.md)
- [旁路问答设计](sidequestion/README.md)
