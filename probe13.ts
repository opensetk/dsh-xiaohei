import type { Context } from '@deepseek-ai/cordis'
import { scopeOf } from '@deepseek-ai/dsh-scope'

export const name = 'probe13'

export function apply(ctx: Context) {
  setTimeout(() => {
    const loader = ctx.get('loader') as {
      entries(): Iterable<{ options: { name: string }; fiber?: { ctx?: Context } | null }>
    }
    console.log('[p13] probe ctx scopeOf:', scopeOf(ctx))
    console.log('[p13] probe ctx.events === root.events:', ctx.events === (ctx as unknown as { root?: Context }).root?.events)
    for (const e of loader?.entries() ?? []) {
      if (e.options.name === 'dsh-pet') {
        const fc = e.fiber?.ctx
        console.log('[p13] dsh-pet fiber ctx exists:', fc !== undefined)
        if (fc) {
          console.log('[p13] dsh-pet ctx scopeOf:', scopeOf(fc))
          console.log('[p13] dsh-pet ctx.events === probe ctx.events:', fc.events === ctx.events)
          const hooks = (fc.events as unknown as { _hooks: Record<string, unknown[]> })._hooks['session/event']
          console.log('[p13] dsh-pet ctx._hooks[session/event] len:', hooks ? hooks.length : 'none')
        }
      }
    }
  }, 6000)
}
