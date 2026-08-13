/**
 * dsh-pet —— 宿主插件（Node / 主进程侧）。
 *
 * 职责：
 * 1) 监听每一份会话的 `session/event`，用 `foldMood` 折叠出当前姿态；
 * 2) 把每会话姿态缓存成可查询的小服务 `ctx.pet`（含事件流水位），
 *    并广播 `pet/mood-change`；
 * 3) 浏览器侧插件通过 `ctx.pet`（或直接复读 session/event）渲染宠物。
 *
 * 注意：apply 里通过 ctx 做的所有注册都是副作用，插件卸载时自动清理。
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import { foldMood, type PetEventLike, type PetMood } from './moods.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 每会话宠物姿态查询/订阅服务。 */
    pet: PetRegistry
  }
  interface Events {
    /** 某会话姿态变化（emit）。 */
    'pet/mood-change'(sessionId: string, mood: PetMood): void
  }
}

/** 一次会话的宠物状态。 */
export interface SessionPetState {
  /** 当前折叠出的姿态。 */
  mood: PetMood
  /** 最近触碰该状态的事件 seq（仅追加日志序号），客户端据此增量。 */
  lastSeq: number
}

/** 对外暴露的宠物服务：查询 + 订阅 + 折叠。 */
export class PetRegistry extends Service {
  private readonly states = new Map<string, SessionPetState>()

  constructor(ctx: Context) {
    super(ctx, 'pet')
  }

  /** 查询某会话的当前姿态；未知会话返回 idle。 */
  get(sessionId: string): SessionPetState {
    return this.states.get(sessionId) ?? { mood: 'idle', lastSeq: -1 }
  }

  /**
   * 折叠一条事件进某会话的状态，并发 `pet/mood-change`（仅当姿态真的变化）。
   * @returns 变化后的姿态；若 seq 已见过则原样返回当前姿态。
   */
  fold(sessionId: string, seq: number, event: PetEventLike): PetMood {
    const cur = this.states.get(sessionId) ?? { mood: 'idle' as PetMood, lastSeq: -1 }
    if (seq <= cur.lastSeq) return cur.mood // 增量去重
    const mood = foldMood(cur.mood, event)
    const next: SessionPetState = { mood, lastSeq: seq }
    this.states.set(sessionId, next)
    if (mood !== cur.mood) {
      this.ctx.emit('pet/mood-change', sessionId, mood)
    }
    return mood
  }
}

export const name = 'dsh-pet'

// 本插件自己注册 ctx.pet 服务并监听全局 session/event，因此不强制注入外部服务。
// 如需调用会话 API（例如 ctx.sessions.surface / followup）再注入 'sessions'。
export function apply(ctx: Context) {
  // 注册服务（其生命周期绑定在本插件 fiber 上，卸载自动清理）。
  ctx.plugin(PetRegistry)

  // 监听持久化会话事件流，持续折叠姿态。
  // dsh-session 在根 ctx 上广播追加的会话事实，参数为 (session, event)：
  //   session —— 事件源的 Session 实例（取其 .id）；
  //   event   —— { type, seq, time, data }，业务载荷在 event.data。
  ctx.on('session/event', (session, event) => {
    const sessionId = (session as { id?: string }).id ?? String(session)
    const seq = (event as { seq?: number }).seq ?? -1
    ctx.pet.fold(sessionId, seq, event as unknown as PetEventLike)
  })
}
