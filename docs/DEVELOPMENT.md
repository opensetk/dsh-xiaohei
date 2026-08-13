# dsh-pet 开发指南

面向想改这个插件（或照着写自己的 DSH Web UI 插件）的人。所有结论都对着
DSH `0.1.0-rc.6` 的安装源码核对过，不是文档脑补。

---

## 1. 构建管线

`node scripts/build.mjs`（或 `npm run build`）产出两枚 bundle：

### 宿主 bundle → `lib/index.js`

```sh
esbuild src/index.ts --bundle --platform=node --format=esm \
  --target=node20 --external:@deepseek-ai/* --outfile=lib/index.js
```

普通 Node ESM 即可；`@deepseek-ai/*` 保持 external，运行时由 DSH 进程解析。

### 浏览器 bundle → `lib/client.js`（关键格式！）

```sh
esbuild src/client/index.ts --bundle --platform=browser --format=cjs \
  --target=es2020 --jsx=automatic \
  --loader:.gif=dataurl --loader:.png=dataurl --loader:.webp=dataurl \
  --external:@deepseek-ai/* --external:react --external:react/jsx-runtime \
  --banner:js='window.__ModuleLoader__.load({id:"dsh-pet",factory:(require)=>{var module={exports:{}};var exports=module.exports;Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"});' \
  --footer:js='return module.exports;}});' \
  --outfile=lib/client.js
```

**为什么不能是普通 ESM？** `dsh-client-modules` 的浏览器内核（`ClientModuleSystem`）
是这样消费 bundle 的：

1. `arrive(row)`：用 `<script>` 标签（**经典脚本**）加载 `/plugins/<id>/client.js`；
2. 加载完成后检查 `factories.has(id)` —— bundle 必须**同步**调用
   `window.__ModuleLoader__.load({ id, factory })` 注册自己，否则抛
   `loaded without registering "<id>" via __ModuleLoader__.load`；
3. `materialize(id)`：调用 `factory(require)`，`require` 解析顺序为
   平台 seed → shell 静态模块 → 已注册的其它工厂；
4. 工厂返回 `module.exports`（内含 `apply` / `inject`），即该插件的模块面。

所以浏览器 bundle = **包进 `load` 调用的 CJS 工厂**。官方包的 `lib/client.js`
（如 `@deepseek-ai/dsh-client-ui-layout`）就是这个形态，可对照。

### 平台 seed（`require` 能直接要到的模块）

来自 `dsh-client-web` 的 `PLATFORM_MODULES`：

```js
react, react/jsx-runtime, react-dom, react-dom/client,
@deepseek-ai/cordis, @deepseek-ai/dsh-client-ui-slots,
@deepseek-ai/dsh-client-web-react, @deepseek-ai/dsh-client-ui-primitives,
@deepseek-ai/dsh-client-ui-attachment, @deepseek-ai/dsh-client-schema-form
```

**外部依赖只能从这里要**。其它 `@deepseek-ai/*` 若声明了 `dsh.client` 也会以
图条目身份进模块表（如 `@deepseek-ai/dsh-client-runtime`），但跨插件 import
官方视为构建错误，别依赖它。

---

## 2. 宿主侧 API 事实（对照 `dsh-session`）

### `session/event` 广播

- 广播位置：**根 ctx**（session store 的 ctx），普通插件 `ctx.on` 就能收到；
- 参数：`(session, event)` —— 第一参是 `Session` 实例，取 `session.id`；
- 事件结构（`Session.append` 产物，deep-freeze 后进日志）：

```ts
{ type: string, seq: number, time: number, data: payload }
```

**业务字段全在 `data` 里**。常用事件的 `data` 形态（`SessionEventMap`）：

| type | data |
|---|---|
| `turn/start` | `{ turn }` |
| `step/start` | `{ turn, step }` |
| `assistant/chunk` | `{ turn, step, chunk: StreamChunk }` |
| `assistant/message` | `{ turn, step, message, usage? }` |
| `tool/call` | `{ turn, step, callId, name, arguments }` |
| `tool/result` | `{ turn, step, message, error?: { name, code }, meta? }` |
| `turn/end` | `{ turn, reason: { kind, … } }` |

- `StreamChunk`：`{type:'text-delta', text}` / `{type:'reasoning-delta', text}` /
  `{type:'tool-call-delta', argumentsDelta}` / `{type:'block-start'|'block-end'|'usage'|'finish', …}`
- `turn/end` 的 `reason` 是**对象**：`{kind:'completed'}` `{kind:'aborted', reason}`
  `{kind:'blocked'}` `{kind:'error', error}` `{kind:'max-tokens'}` `{kind:'interrupted'}`
  —— 判断失败不要比字符串 `'failed'`，要比 `reason.kind`。

`src/moods.ts` 的 `foldMood` 只消费这些事实，`payloadOf()` 会优先读 `data`，
顶层字段兜底（兼容手写回放事件）。

---

## 3. 浏览器侧 API 事实

### 槽位注册

`shell.overlay` 是 `dsh-client-ui-layout` 的 AppFrame 声明的 **list 槽**
（`{ kind: 'list', scope: 'root' }`，渲染在全局浮层层，`z-index:20`，默认穿透）。
注册签名（`SlotCore.register(options, component)`）：

```ts
ctx.slots.register(
  { name: 'shell.overlay', id: 'dsh-pet', order: 1 },
  PetAvatar,
)
```

- list 槽必须给 `id`；`order` 参与排序；`priority` 用于覆盖（小的赢）；
- 其它槽位种类：`single`（唯一，同 priority 重复注册会抛错）、`keyed`（按 key）、`chain`。

### 标准件 props

全局槽位（`scope:'root'`）组件会收到 `GlobalStandardProps`：

```ts
{ useSessions: SnapshotSelectorHook<SessionListState>,
  useWorkspaces: SnapshotSelectorHook<WorkspaceListState> }
```

`SessionListState`：`{ ids, byId, current, phase, subagentsByParent, jobsBySession, currentAddress }`；
`SessionSummary`：`{ id, running, pendingInteraction?, completed?, blank, updatedAt, … }`。

**坑**：`useSessions` 是 selector hook，选择器返回常量（如 `() => null`）时组件
永远不会因 store 变化重渲染。要拿整份快照就 `useSessions((s) => s)`。

### 客户端服务名

`inject: ['slots', 'sessions']` —— `slots`（SlotRegistry）、`sessions`（SessionRuntime，
经 `ctx.reflect.provide('sessions', …)` 提供）、`workspaces`、`conversationEvents`、
`conversationViews`、`modules`、`theme`、`locale` 等。

---

## 4. 调试手段

### 看宿主 fiber 是否 ACTIVE

临时 patch 一个探针插件（`--patch` 是全局选项，要放在子命令前面）：

```sh
dsh --profile web --patch /tmp/probe.patch.yml --port 3099
```

探针 `apply(ctx)` 里延迟几秒遍历 `ctx.loader.entries()`，打印
`entry.options.name` 与 `entry.fiber.state`（`2`=ACTIVE，`3`=FAILED）。

### 看浏览器 bundle 是否被收录

```sh
curl -s http://127.0.0.1:3080/ | grep -o '"id": "dsh-pet"[^}]*'
curl -s "http://127.0.0.1:3080/plugins/dsh-pet/client.js" | head -c 200
```

### 在 Node 里模拟浏览器加载器契约（免开浏览器）

```js
const factories = new Map()
globalThis.__ModuleLoader__ = { load: (h) => factories.set(h.id, h.factory) }
globalThis.window = globalThis
new Function(fs.readFileSync('lib/client.js', 'utf8'))()
const mod = factories.get('dsh-pet')((spec) => ({ 'react': {}, 'react/jsx-runtime': {} })[spec])
// 断言 mod.apply 是函数、mod.inject 是 ['slots','sessions']
```

---

## 5. 发布

```sh
git tag dsh-plugin          # 语义版本 tag 也建议打：git tag v0.1.0
git push origin dsh-plugin v0.1.0
```

用户侧安装：`dsh plugin --profile web add github:opensetk/dsh-xiaohei#dsh-plugin`。
仓库已提交 `lib/` 预构建产物 + `prepare` 脚本，两种安装路径都覆盖。

---

## 6. 素材

`assets/manifest.json` 记录每张图的尺寸、帧数、时长与文案标签（来源见仓库外
`pet/` 目录的同一份清单）。构建时 GIF/PNG/WebP 全部以 data URL 内联进
`lib/client.js`，运行时无额外网络请求。
