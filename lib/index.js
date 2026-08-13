// src/index.ts
import { Service } from "@deepseek-ai/cordis";

// src/moods.ts
function payloadOf(ev) {
  return ev.data ?? ev;
}
function foldMood(prev, ev) {
  const data = payloadOf(ev);
  switch (ev.type) {
    case "turn/start":
      return "busy";
    case "step/start":
      return "thinking";
    case "assistant/chunk": {
      const chunk = data.chunk;
      if (chunk?.type === "text-delta" && typeof chunk.text === "string" && chunk.text.length > 0) {
        return "streaming";
      }
      return prev;
    }
    case "assistant/message":
      return "done";
    case "tool/call":
      return "tool";
    case "tool/result": {
      const err = data.error;
      return err && typeof err === "object" ? "error" : "done";
    }
    case "turn/end": {
      const reason = data.reason;
      const kind = typeof reason === "string" ? reason : reason?.kind;
      return kind === "error" || kind === "aborted" ? "error" : "idle";
    }
    default:
      return prev;
  }
}

// src/index.ts
var PetRegistry = class extends Service {
  states = /* @__PURE__ */ new Map();
  constructor(ctx) {
    super(ctx, "pet");
  }
  /** 查询某会话的当前姿态；未知会话返回 idle。 */
  get(sessionId) {
    return this.states.get(sessionId) ?? { mood: "idle", lastSeq: -1 };
  }
  /**
   * 折叠一条事件进某会话的状态，并发 `pet/mood-change`（仅当姿态真的变化）。
   * @returns 变化后的姿态；若 seq 已见过则原样返回当前姿态。
   */
  fold(sessionId, seq, event) {
    const cur = this.states.get(sessionId) ?? { mood: "idle", lastSeq: -1 };
    if (seq <= cur.lastSeq) return cur.mood;
    const mood = foldMood(cur.mood, event);
    const next = { mood, lastSeq: seq };
    this.states.set(sessionId, next);
    if (mood !== cur.mood) {
      this.ctx.emit("pet/mood-change", sessionId, mood);
    }
    return mood;
  }
};
var name = "dsh-pet";
function apply(ctx) {
  ctx.plugin(PetRegistry);
  ctx.on("session/event", (session, event) => {
    const sessionId = session.id ?? String(session);
    const seq = event.seq ?? -1;
    ctx.pet.fold(sessionId, seq, event);
  });
}
export {
  PetRegistry,
  apply,
  name
};
