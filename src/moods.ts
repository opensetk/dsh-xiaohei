/**
 * dsh-pet —— 一颗基于会话事件推导"宠物姿态"的状态机。
 *
 * 输入：追加到会话日志的持久 SessionEvent（通过 `session/event` 广播）。
 * 输出：一个确定性的姿态(`PetMood`)。同一台状态机既能被宿主主进程使用，
 *      也能被浏览器侧复用（纯函数、无副作用、无 I/O）。
 *
 * 我们刻意不依赖实时 `agent/*` 事件，而是只消费持久化事实 `session/event`，
 * 这样在回放(重开会话)时也能重建出与当时一致的姿态 —— 宠物心情有据可查。
 *
 * 事件结构（dsh-session 的 `Session.append` 产物）：
 *   { type, seq, time, data }   —— 载荷全部在 `data` 里，不要在事件顶层找。
 *   turn/start      data: { turn }
 *   step/start      data: { turn, step }
 *   assistant/chunk data: { turn, step, chunk: StreamChunk }
 *   assistant/message data: { turn, step, message, usage? }
 *   tool/call       data: { turn, step, callId, name, arguments }
 *   tool/result     data: { turn, step, message, error?: { name, code }, meta? }
 *   turn/end        data: { turn, reason: { kind: 'completed'|'aborted'|'blocked'|'error'|... } }
 */

/** 宠物姿态：让 UI 呈现不同的形象/动作/表情。 */
export type PetMood =
  | 'idle'      // 空闲 / 等待
  | 'thinking'  // 正在思考（首块 assistant/chunk 已到达、尚未给整句）
  | 'streaming' // 正在输出（assistant 汉字增量进行中）
  | 'tool'      // 正在干活（工具已发起、结果未回）
  | 'busy'      // 忙碌（一个轮次进行中，等待本地上下文）
  | 'done'      // 一波完成 / 本轮收到完整 assistant/message
  | 'error'     // 受挫（轮次失败 或 工具返回错误）

/** 姿态元信息：UI 用它决定表情、动画与气泡文案。 */
export interface PetMoodInfo {
  mood: PetMood
  /** 给 UI 的情绪状态标签。 */
  label: string
  /** 轻量行动帧建议（UI 可自行覆盖）。 */
  animation?: string
  /** 是否算"行动中"，用于忽略旧的空闲态。 */
  active: boolean
}

/** 一条会话事实的最小视图（兼容持久化 SessionEvent）。 */
export interface PetEventLike {
  type: string
  /** 仅追加日志序号。 */
  seq?: number
  /** 事件载荷：dsh-session 把业务字段全部放在这里。 */
  data?: Record<string, unknown>
  // 兼容直接以顶层字段携带载荷的事件源（如测试/回放手写事件）。
  [k: string]: unknown
}

/** 取载荷：优先 `data`，顶层字段作为兜底（兼容手写回放事件）。 */
function payloadOf(ev: PetEventLike): Record<string, unknown> {
  return ev.data ?? ev
}

/**
 * 无状态、可复用的姿态折叠函数。
 * 以 `prev` 为基线，根据一条事件计算下一个姿态。
 * 例程来自官方事件词汇表（turn、step、assistant、tool 系列）。
 */
export function foldMood(prev: PetMood, ev: PetEventLike): PetMood {
  const data = payloadOf(ev)
  switch (ev.type) {
    // 轮次开始
    case 'turn/start':
      return 'busy'

    // 步骤开始 —— 一次"模型请求 + 它发起的工具"开始
    case 'step/start':
      return 'thinking'

    // 助手流式分片：text-delta 且带非空文本 → 正在输出；
    // 推理增量（reasoning-delta）等其它分片保持原姿态。
    case 'assistant/chunk': {
      const chunk = data.chunk as { type?: string; text?: string } | undefined
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string' && chunk.text.length > 0) {
        return 'streaming'
      }
      return prev
    }

    // 一条完整的 assistant 消息落定
    case 'assistant/message':
      return 'done'

    // 模型请求调用工具
    case 'tool/call':
      return 'tool'

    // 工具结果返回：错误则受挫，成功则回到完成态
    case 'tool/result': {
      const err = data.error as { code?: string } | undefined
      return err && typeof err === 'object' ? 'error' : 'done'
    }

    // 轮次结束：失败/中断 → 受挫；其余保持空闲
    case 'turn/end': {
      const reason = data.reason as { kind?: string } | string | undefined
      const kind = typeof reason === 'string' ? reason : reason?.kind
      return kind === 'error' || kind === 'aborted' ? 'error' : 'idle'
    }

    default:
      return prev
  }
}

/** 姿态 → 展示信息。配合 PetMoodInfo 让 UI 直接消费。 */
export const PET_MOODS: Record<PetMood, PetMoodInfo> = {
  idle:      { mood: 'idle',      label: '待命中', active: false, animation: 'breath' },
  thinking:  { mood: 'thinking',  label: '思考中…', active: true,  animation: 'blink' },
  streaming: { mood: 'streaming', label: '回复你', active: true,  animation: 'wave' },
  tool:      { mood: 'tool',      label: '干活中', active: true,  animation: 'bounce' },
  busy:      { mood: 'busy',      label: '忙碌中', active: true,  animation: 'pulse' },
  done:      { mood: 'done',      label: '搞定！', active: false, animation: 'celebrate' },
  error:     { mood: 'error',     label: '糟糕…', active: false, animation: 'shiver' },
}

/** 一系列事件回放，返回稳定终点姿态（用于重开/回放）。 */
export function replayMoods(events: readonly PetEventLike[]): PetMood {
  return events.reduce(foldMood, 'idle' as PetMood)
}
