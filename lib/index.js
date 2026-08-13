var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name2, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name: name2, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name2, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name2]() {
    return __privateGet(this, extra);
  }, set [name2](x) {
    return __privateSet(this, extra, x);
  } }, name2));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name2) : __name(target, name2);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name2, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name2 in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name2];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name2] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name2, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/index.ts
import { Service } from "@deepseek-ai/cordis";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

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
var _get_dec, _a, _init;
var PetMoodGateway = class extends (_a = TypertRemoteService, _get_dec = [Remote("get")], _a) {
  constructor(ctx) {
    super(ctx, "petMood");
    __runInitializers(_init, 5, this);
  }
  get(args) {
    return this.ctx.pet.get(String(args?.sessionId ?? ""));
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "get", _get_dec, PetMoodGateway);
__decoratorMetadata(_init, PetMoodGateway);
__publicField(PetMoodGateway, "inject", ["pet"]);
function apply(ctx) {
  ctx.plugin(PetRegistry);
  ctx.plugin(PetMoodGateway);
  ctx.on("session/event", (session, event) => {
    const pet = ctx.get("pet");
    if (!pet) return;
    const sessionId = session.id ?? String(session);
    const seq = event.seq ?? -1;
    pet.fold(sessionId, seq, event);
  });
}
export {
  PetMoodGateway,
  PetRegistry,
  apply,
  name
};
