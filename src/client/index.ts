/**
 * dsh-pet —— 浏览器侧插件入口。
 *
 * 这是 `package.json` 里 `dsh.client` 对应的那个 bundle（`exports["./client"]`）。
 * 模块宿主（`ctx.modules` / `__ModuleLoader__`）把它当作一个客户端 Cordis 插件加载。
 *
 * 本插件把宠物注册进 `shell.overlay` —— 由 ui-layout 的 AppFrame 声明的
 * 全局浮层 list slot（frame 级、可叠加、点击默认穿透）。宠物组件通过全局
 * 标准件 `useSessions` 订阅会话快照（running / pendingInteraction / completed），
 * 这是浏览器侧最稳定、零额外依赖的驱动方式（不用 remote/轮询）。
 */
import { type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import PetAvatar from './Pet.js'

/** 客户端注入表：声明本浏览器插件需要的客户端服务。 */
export const inject = [
  'slots',        // SlotRegistry —— 往 UI 槽位塞组件
  'sessions',     // ISessions —— 会话列表/当前会话（useSessions 标准件来源）
] as const

export function apply(ctx: Context) {
  // shell.overlay 是 list slot：需要唯一 id，可叠加；注册即随插件 fiber 卸载。
  ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-pet',
    order: 1,
  }, PetAvatar)
}
