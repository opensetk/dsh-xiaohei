/**
 * dsh-pet —— 宠物 React 组件（浏览器侧）。
 *
 * 挂载在 `shell.overlay`（全局浮层 list slot），根据 agent 运行状态
 * 切换不同姿态动画（GIF/PNG 素材全部内联进 bundle）。
 *
 * 姿态来源（两级）：
 * 1. 精确姿态：host 侧 PetMoodGateway 逐事件折叠（session/event → foldMood），
 *    客户端经 `ctx.remote.petMood.get()` 轮询（800ms），写入 mood-store，
 *    组件用 useSyncExternalStore 订阅 —— 思考/输出/干活/完成/失败都能区分；
 * 2. 回退姿态：remote 未就绪时用 useSessions 快照（running/pendingInteraction/
 *    completed）粗粒度推导，保证宠物永远有表现。
 *
 * 点击宠物：随机播一个互动动画（吃鸡腿/偷吃/玩嘿咻/蠕动/翻滚）后恢复。
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ASSETS } from './assets.js'
import { getSnapshot, refreshMood, subscribe } from './mood-store.js'

/** 框架注入的全局槽位标准件（GlobalStandardProps）。 */
export interface GlobalSlotProps {
  useSessions?: (selector: (snap: unknown) => unknown) => unknown
  useWorkspaces?: (selector: (snap: unknown) => unknown) => unknown
}

/** 会话摘要的防御性读取接口。 */
interface SessionLike {
  running?: boolean
  pendingInteraction?: unknown
  completed?: boolean
}

const SESSION_STYLE = `
.dsh-pet{position:fixed;right:24px;bottom:24px;z-index:2147483000;pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:6px;user-select:none;font-family:ui-rounded,system-ui,sans-serif}
.dsh-pet-face{width:auto;height:120px;max-width:180px;object-fit:contain;cursor:pointer;filter:drop-shadow(0 4px 10px rgba(0,0,0,.28));transition:transform .18s ease}
.dsh-pet-face:hover{transform:scale(1.08)}
.dsh-pet-bubble{background:rgba(20,20,24,.82);color:#fff;font-size:12px;line-height:1.4;padding:5px 10px;border-radius:12px;max-width:170px;text-align:center;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.25);backdrop-filter:blur(2px)}
`

/**
 * 姿态 → 素材。GIF 循环动画表现"正在…"，PNG 为静止姿态。
 * 自定义映射：思考→吃东西、输出→奔跑、调工具→玩嘿咻、轮次开始→摇摆。
 */
const MOOD_ASSET = {
  idle: ASSETS.base,
  thinking: ASSETS.eat,
  streaming: ASSETS.run,
  tool: ASSETS.playHeixiu,
  busy: ASSETS.wave,
  done: ASSETS.celebrate,
  error: ASSETS.roll,
} as const

/** 点击宠物时随机播放的互动动画。 */
const POKE_ASSETS = [ASSETS.eat, ASSETS.sneakEat, ASSETS.playHeixiu, ASSETS.wiggle, ASSETS.roll] as const

/** 姿态标签（气泡文案，可爱风）。 */
const MOOD_LABEL = {
  idle: '陪着你~',
  thinking: '边想边吃…',
  streaming: '冲鸭鸭！',
  tool: '和嘿咻玩会儿~',
  busy: '忙忙哒',
  done: '耶！搞定~',
  error: '呜哇…',
} as const

export type Mood = keyof typeof MOOD_ASSET

/** 从会话列表快照推导宠物姿态（remote 不可用时的回退）。 */
function moodFromSessions(snap: unknown): Mood {
  const s = snap as { current?: string; byId?: Record<string, SessionLike> } | null
  const cur = s?.current
  const row = (cur && s?.byId?.[cur]) || undefined
  if (!row) return 'idle'
  if (row.pendingInteraction) return 'thinking'   // 在等用户确认/提问
  if (row.running) return 'busy'                  // agent 正在跑（思考/输出/调工具）
  if (row.completed) return 'done'                // 刚完成
  return 'idle'
}

export default function PetAvatar(props: GlobalSlotProps) {
  const useSessions = props.useSessions
  // 会话列表快照（含 current），引用随 store 更新变化。
  const snap = useSessions ? useSessions((s) => s) : null
  const current = (snap as { current?: string } | null)?.current

  // 精确姿态：host remote 轮询结果；只有属于当前会话时才采信。
  const exact = useSyncExternalStore(subscribe, getSnapshot)
  const fallback = useMemo<Mood>(() => moodFromSessions(snap), [snap])
  const baseMood: Mood = exact.sessionId === current ? exact.mood : fallback

  // 轮询精确姿态：会话切换立即拉一次，之后每 800ms 刷新。
  useEffect(() => {
    refreshMood(current)
    const timer = window.setInterval(() => refreshMood(current), 800)
    return () => window.clearInterval(timer)
  }, [current])

  // 点击互动：临时换图播动画，动画结束后回到当前姿态。
  const [pokeSrc, setPokeSrc] = useState<string | null>(null)
  const [pokeLabel, setPokeLabel] = useState<string | null>(null)

  const handleClick = () => {
    const src = POKE_ASSETS[Math.floor(Math.random() * POKE_ASSETS.length)]
    setPokeSrc(src)
    setPokeLabel(
      src === ASSETS.eat
        ? '吃个鸡腿🍗'
        : src === ASSETS.sneakEat
          ? '偷吃一口🤫'
          : src === ASSETS.playHeixiu
            ? '玩嘿咻！'
            : src === ASSETS.wiggle
              ? '蠕动蠕动~'
              : '咕噜咕噜',
    )
    window.setTimeout(() => {
      setPokeSrc(null)
      setPokeLabel(null)
    }, 1600)
  }

  const src = pokeSrc ?? MOOD_ASSET[baseMood]
  const label = pokeLabel ?? MOOD_LABEL[baseMood]
  const alt = pokeLabel ? 'dsh-pet 互动' : MOOD_LABEL[baseMood]

  return (
    <div className="dsh-pet" data-mood={baseMood} role="img" aria-label={alt}>
      <style>{SESSION_STYLE}</style>
      <div className="dsh-pet-bubble">{label}</div>
      <img
        className="dsh-pet-face"
        src={src}
        alt={alt}
        draggable={false}
        onClick={handleClick}
      />
    </div>
  )
}
