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
 */
import { type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import PetAvatar from './Pet.js'
import { setMoodFetcher, type PetMood } from './mood-store.js'

/** 客户端注入表：声明本浏览器插件需要的客户端服务。 */
export const inject = [
  'slots',            // SlotRegistry —— 往 UI 槽位塞组件
  'sessions',         // ISessions —— 会话列表/当前会话（useSessions 标准件来源）
  'remote',           // Typert remote 客户端注册表
  'remote.petMood',   // host 侧 PetMoodGateway 生成的客户端服务面
] as const

export function apply(ctx: Context) {
  // 把 host remote 拉取函数注入模块级 store（Pet.tsx 轮询调用）。
  setMoodFetcher(async (sessionId) => {
    const remote = ctx.get('remote') as
      | { petMood?: { get(args: { sessionId: string }): Promise<{ ok: boolean; value?: { mood: string }; error?: { code: string; message: string } }> } }
      | undefined
    const gateway = remote?.petMood
    if (!gateway) return null
    const result = await gateway.get({ sessionId })
    return result.ok && result.value ? (result.value.mood as PetMood) : null
  })

  // shell.overlay 是 list slot：需要唯一 id，可叠加；注册即随插件 fiber 卸载。
  ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-pet',
    order: 1,
  }, PetAvatar)
}
