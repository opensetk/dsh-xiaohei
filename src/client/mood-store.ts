/**
 * 模块级姿态 store：host remote（ctx.remote.petMood.get）轮询写入，
 * React 组件用 useSyncExternalStore 订阅。模块级而非 React context，
 * 是因为全局槽位组件（shell.overlay）拿不到 session 级上下文。
 */

export type PetMood = 'idle' | 'thinking' | 'streaming' | 'tool' | 'busy' | 'done' | 'error'

export interface PetMoodSnapshot {
  /** 该姿态所属的会话 id；与当前会话不一致时组件应回退到快照推导。 */
  sessionId?: string
  mood: PetMood
}

/** 拉取某会话精确姿态的 fetcher（由 client/index.ts apply 注入）。 */
export type MoodFetcher = (sessionId: string) => Promise<PetMood | null>

let fetcher: MoodFetcher | null = null
let snapshot: PetMoodSnapshot = { sessionId: undefined, mood: 'idle' }
const listeners = new Set<() => void>()

/** 注入 remote 拉取函数（client apply 时调用）。 */
export function setMoodFetcher(f: MoodFetcher | null): void {
  fetcher = f
}

/** 更新姿态快照（引用替换，useSyncExternalStore 依赖它触发重渲染）。 */
export function setMood(sessionId: string, mood: PetMood): void {
  if (snapshot.sessionId === sessionId && snapshot.mood === mood) return
  snapshot = { sessionId, mood }
  for (const l of listeners) l()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSnapshot(): PetMoodSnapshot {
  return snapshot
}

/** 拉取一次当前姿态（供轮询定时器调用）；失败时静默保持旧值。 */
export async function refreshMood(sessionId: string | undefined): Promise<void> {
  if (!sessionId || !fetcher) return
  try {
    const mood = await fetcher(sessionId)
    if (mood) setMood(sessionId, mood)
  } catch {
    /* remote 未就绪/调用失败：保持上次姿态，组件会回退到会话快照推导 */
  }
}
