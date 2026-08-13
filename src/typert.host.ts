/**
 * dsh-pet —— TYPERT host manifest（`exports["./typert"]`）。
 *
 * typert-loader 扫描 loader entries 中声明 `./typert` 导出的包，把这里的
 * invocations 注册进 host 侧 typert.local 目录 —— 这是客户端
 * `remote.petMood` 服务能被发现的前提（Gateway 的 claims / 目录同步都看它）。
 *
 * 与 PetMoodGateway（src/index.ts，Service 侧）配套：
 *   - 目录条目：本文件（invocation 描述 + zod codec）
 *   - 实际执行：PetMoodGateway.get()（receiver）
 */
import { z } from 'zod'

const sessionIdSchema = z.string()
const petMoodResultSchema = z.object({
  mood: z.string(),
  lastSeq: z.number(),
})

export const TYPERT = {
  package: 'dsh-pet',
  face: 'host',
  schemas: [],
  invocations: [
    {
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
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-pet/types#SessionId',
            schema: sessionIdSchema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-pet/types#SessionPetState',
        schema: petMoodResultSchema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 1 },
    },
  ],
  model: {
    services: [],
    events: [],
    objects: [],
  },
}
