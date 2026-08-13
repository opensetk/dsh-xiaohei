/**
 * dsh-pet —— 浏览器侧插件入口。
 *
 * 这是 `package.json` 里 `dsh.client` 对应的那个 bundle（`exports["./client"]`）。
 * 模块宿主（`ctx.modules` / `__ModuleLoader__`）把它当作一个客户端 Cordis 插件加载：
 * 它会拿到客户端侧的 `ctx`（含 `ctx.sessions / ctx.workspaces / ctx.slots /
 * ctx.conversationEvents / ctx.conversationViews / ctx.locale / ctx.remote` 等）。
 *
 * 本插件把宠物注册进 `shell.overlay` —— 由 ui-layout 的 AppFrame 声明的
 * 全局浮层 list slot（frame 级、可叠加、点击默认穿透，条目可自行 opt-in
 * 指针事件）。宠物组件通过全局标准件 `useSessions` 订阅会话状态；
 * 精确姿态（thinking/streaming/tool/busy/…）经 host remote 服务
 * `petMood.get({ sessionId })` 轮询获取（见 src/index.ts 的 PetMoodGateway）。
 *
 * remote 服务面：`remote.<svc>` 客户端服务只对 api-remotes 内嵌清单里的官方包
 * 自动生成；第三方包必须在 apply 里用 `ctx.remote.$mount()` 显式挂载自己的
 * descriptors（与官方 api-remotes 的挂载机制相同）。这里用 `src-json` codec，
 * 避免把 zod 塞进浏览器 bundle。
 */
import { type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import PetAvatar from './Pet.js'
import { setMoodFetcher, type PetMood } from './mood-store.js'

/**
 * 本包 remote 服务的客户端描述（与 src/typert.host.ts 的 invocation 对应）。
 * 挂载后生成 `ctx.remote.petMood.get({ sessionId })`。
 */
const PET_MOOD_DESCRIPTORS = [{
  id: 'dsh-pet#petMood/get',
  service: 'petMood',
  namespace: 'petMood',
  method: 'get',
  invocation: { kind: 'direct' },
  parameters: [
    {
      name: 'sessionId',
      wire: 'sessionId',
      source: 'json',
      codec: { mode: 'src-json', typeSymbol: 'dsh-pet/types#SessionId' },
    },
  ],
  result: { mode: 'src-json', typeSymbol: 'dsh-pet/types#SessionPetState' },
}]

/** 客户端注入表：声明本浏览器插件需要的客户端服务。 */
export const inject = [
  'slots',        // SlotRegistry —— 往 UI 槽位塞组件
  'sessions',     // ISessions —— 会话列表/当前会话（useSessions 标准件来源）
  'remote',       // Typert remote 客户端注册表（$mount / 生成的 remote.<svc> 面）
] as const

export function apply(ctx: Context) {
  // 挂载本包 remote 服务面：生成 ctx.remote.petMood（失败不阻塞插件，组件会回退）。
  const remote = ctx.get('remote') as
    | { $mount?(contribution: { package: string; descriptors: unknown[] }): Promise<unknown> }
    | undefined
  void remote?.$mount?.({ package: 'dsh-pet', descriptors: PET_MOOD_DESCRIPTORS }).catch(() => {})

  // 把 host remote 拉取函数注入模块级 store（Pet.tsx 轮询调用）。
  setMoodFetcher(async (sessionId) => {
    const remote = ctx.get('remote') as
      | { petMood?: { get(args: { sessionId: string }): Promise<unknown> } }
      | undefined
    const gateway = remote?.petMood
    if (!gateway) return null
    const result = (await gateway.get({ sessionId })) as { ok: boolean; value?: { mood: string } }
    return result.ok && result.value ? (result.value.mood as PetMood) : null
  })

  // shell.overlay 是 list slot：需要唯一 id，可叠加；注册即随插件 fiber 卸载。
  ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-pet',
    order: 1,
  }, PetAvatar)
}
