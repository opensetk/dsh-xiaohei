// src/typert.host.ts
import { z } from "zod";
var sessionIdSchema = z.string();
var petMoodResultSchema = z.object({
  mood: z.string(),
  lastSeq: z.number()
});
var TYPERT = {
  package: "dsh-pet",
  face: "host",
  schemas: [],
  invocations: [
    {
      id: "dsh-pet#petMood/get",
      service: "petMood",
      namespace: "petMood",
      method: "get",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "sessionId",
          wire: "sessionId",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: "dsh-pet/types#SessionId",
            schema: sessionIdSchema
          }
        }
      ],
      result: {
        mode: "strict",
        typeSymbol: "dsh-pet/types#SessionPetState",
        schema: petMoodResultSchema
      },
      sourceLocation: { file: "src/index.ts", line: 1, column: 1 }
    }
  ],
  model: {
    services: [],
    events: [],
    objects: []
  }
};
export {
  TYPERT
};
