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
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
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

/**
 * 把每会话宠物姿态暴露为 host remote 服务（Typert Gateway 自动发现）。
 * 浏览器侧客户端经 `ctx.remote.petMood.get({ sessionId })` 调用，
 * 返回 `{ ok: true, value: { mood, lastSeq } }`（失败为 `{ ok: false, error }`）。
 */
export class PetMoodGateway extends TypertRemoteService {
  static inject = ['pet']

  constructor(ctx: Context) {
    super(ctx, 'petMood')
  }

  @Remote('get')
  get(args: { sessionId: string }): SessionPetState {
    return this.ctx.pet.get(String(args?.sessionId ?? ''))
  }
}

// 本插件自己注册 ctx.pet 服务并监听全局 session/event，因此不强制注入外部服务。
// 如需调用会话 API（例如 ctx.sessions.surface / followup）再注入 'sessions'。
export function apply(ctx: Context) {
  // 注册服务（其生命周期绑定在本插件 fiber 上，卸载自动清理）。
  ctx.plugin(PetRegistry)
  // 注册 remote 服务：客户端可查询任意会话的精确姿态。
  ctx.plugin(PetMoodGateway)

  // 监听持久化会话事件流，持续折叠姿态。
  // dsh-session 在根 ctx 上广播追加的会话事实，参数为 (session, event)：
  //   session —— 事件源的 Session 实例（取其 .id）；
  //   event   —— { type, seq, time, data }，业务载荷在 event.data。
  //
  // 注意：不能用 `ctx.pet` 属性访问——Cordis 的注入守卫要求先声明 inject，
  // 本插件没有（服务是自己注册的），属性访问会抛
  // "cannot get property \"pet\" without inject" 并被事件系统静默吞掉。
  // 用 ctx.get('pet') 方法调用（事件到达时服务必已激活，且方法调用不受守卫限制）。
  ctx.on('session/event', (session, event) => {
    const pet = ctx.get('pet') as PetRegistry | undefined
    if (!pet) return
    const sessionId = (session as { id?: string }).id ?? String(session)
    const seq = (event as { seq?: number }).seq ?? -1
    pet.fold(sessionId, seq, event as unknown as PetEventLike)
  })
}
