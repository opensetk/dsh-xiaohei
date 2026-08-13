---
name: install-dsh-pet
description: 把 dsh-pet 桌面宠物插件安装进 DSH web profile 的完整流程——构建、声明依赖、插入宿主插件行、重启、逐项验证、常见问题与回滚。
whenToUse: 用户要求安装 dsh-pet / 把宠物接入 DSH Web UI / 宠物不显示需要排查时。
---

# 安装 dsh-pet（Agent 执行指南）

> 本文件即安装教程本体，位于仓库 `docs/install-dsh-pet.skill.md`；
> 网络路径（raw）：`https://raw.githubusercontent.com/opensetk/dsh-xiaohei/main/docs/install-dsh-pet.skill.md`

目标：让 dsh-pet 的**宿主半**（Node 侧姿态状态机）与**浏览器半**（右下角宠物形象）
都在 DSH Web UI 生效。本 skill 面向执行安装的 agent，按步骤逐条执行并验证。

> 仓库根目录执行 `git rev-parse --show-toplevel` 得到 `<repo-root>`；
> 下文所有 `<repo-root>` 均指本仓库检出路径。

## 0. 前置检查

```sh
node --version                 # 需要 ≥ 20
dsh --version                  # 需要可用（本 skill 按 0.1.0-rc.6 验证）
ls ~/.dsh/profiles/web/        # web profile 必须存在（缺失时先 `dsh web` 启动一次自动生成）
```

任一不满足则停下并向用户说明，不要继续。

## 1. 构建（`lib/` 缺失或源码有改动时执行）

```sh
cd <repo-root>
node scripts/build.mjs         # 等价 npm run build
```

- 产物：`lib/index.js`（宿主）、`lib/client.js`（浏览器）
- **关键校验**：

```sh
head -c 120 lib/client.js
# 必须以 window.__ModuleLoader__.load({id:"dsh-pet",… 开头
```

> 浏览器 bundle 必须是 `__ModuleLoader__.load({ id, factory })` 注册格式（CJS 工厂）。
> 若是普通 ESM 产物，浏览器刷新会报
> `loaded without registering "dsh-pet" via __ModuleLoader__.load` —— 重新构建即可。

## 2. 声明依赖（profile 依赖集 = 浏览器扫描集）

编辑 `~/.dsh/profiles/web/package.json`，在 `dependencies` 里加入：

```json
"dsh-pet": "file:<repo-root>"
```

（从 GitHub 安装则执行：`dsh plugin --profile web add github:opensetk/dsh-xiaohei#dsh-plugin`）

然后安装/链接，确保 `dsh-pet` 可从 profile 目录解析：

```sh
cd ~/.dsh/profiles/web
pnpm install        # 或 npm install；两者都不可用时可用 ln -s 建软链到 node_modules
node -e "console.log(require.resolve('dsh-pet/package.json'))"
# 应打印 dsh-pet 的 package.json 路径，而不是报错
```

## 3. 插入宿主插件行

编辑 `~/.dsh/profiles/web/cordis.patch.yml`，保留顶部注释，把 `[]` 替换为：

```yaml
- insert:
  - id: dsh-pet-host
    name: dsh-pet
```

要点：`name` 用**包名**（loader 从 profile 目录按 Node 规则解析，会沿目录向上找到
`~/.dsh/profiles/node_modules/dsh-pet`）；不要用相对源码路径。

## 4. 重启

```sh
# 杀掉旧的 dsh web（找到监听 3080 的进程），然后：
cd ~/projects/dshpet        # 或原工作目录
nohup dsh web > /tmp/dsh-web.log 2>&1 &
# 等待端口就绪：
for i in $(seq 1 30); do lsof -nP -iTCP:3080 -sTCP:LISTEN >/dev/null 2>&1 && break; sleep 1; done
```

## 5. 逐项验证

```sh
# ① 启动日志无 dsh-pet 相关报错
grep -iE "dsh-pet|FAILED" /tmp/dsh-web.log || echo "no errors"

# ② boot 清单含 dsh-pet 条目
curl -s http://127.0.0.1:3080/ | grep -o '"id": "dsh-pet"'

# ③ bundle 路由可达且为注册格式
curl -s "http://127.0.0.1:3080/plugins/dsh-pet/client.js" | head -c 60

# ④ （可选，最可靠）宿主 fiber 状态：临时 overlay 探针
#    probe.ts: setTimeout(()=>{ for (const e of ctx.get('loader').entries())
#      console.log(e.options.name, e.fiber?.state) }, 4000)
#    dsh --profile web --patch /tmp/probe.patch.yml --port 3099
#    dsh-pet-host 的 fiber.state 应为 2（ACTIVE），3 为 FAILED
```

全部通过后，让用户在浏览器**刷新**页面：右下角应出现宠物；跑一轮会话观察
姿态切换（忙碌/思考/回复/干活/庆祝/失败）。

## 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面完全没有宠物 | 依赖未声明 / patch 行缺失 / 未重启 | 回到第 2~4 步；确认 `__DSH_BOOT__` 里有 dsh-pet |
| `loaded without registering "dsh-pet" via __ModuleLoader__.load` | `lib/client.js` 不是注册格式（被 ESM 构建覆盖） | 重新 `node scripts/build.mjs` 并校验首行 |
| 宠物永远是 idle | 客户端用旧版常量选择器 | 用本仓库最新 `src/client/Pet.tsx`（`useSessions((s) => s)`）重新构建 |
| 宿主插件 FAILED | 版本 API 不匹配 | 看启动日志具体报错；DSH 版本需 ≈0.1.0-rc.6 |

## 7. 回滚

1. 从 `~/.dsh/profiles/web/cordis.patch.yml` 删除 `dsh-pet-host` 行（恢复 `[]`）；
2. 从 `~/.dsh/profiles/web/package.json` 的 `dependencies` 删除 `dsh-pet`；
3. 重启 `dsh web`。
