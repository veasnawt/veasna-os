import type {
  ProgramNode,
  WorldNode,
  ASTNode,
  BlockNode,
  CapabilityDecl,
} from "./parser";

export interface WorldEntity {
  name: string;
  fields: Record<string, any>;
  isAgent: boolean;
  isPersistent: boolean;
  capabilities: CapabilityDecl[];
}

export interface Relation {
  subject: string;
  verb: string;
  object: string;
}

export interface EventLogEntry {
  type: string;
  kind: string;
  data: any;
  detail: any;
  timestamp: number;
  t: number;
}

export class EntityRef {
  public name: string;
  public world: World;

  constructor(name: string, world: World) {
    this.name = name;
    this.world = world;
  }

  get fields() {
    const ent = this.world.getEntity(this.name);
    return ent.fields;
  }
}

export function truthy(val: any): boolean {
  if (val === false || val === null || val === undefined || val === 0 || val === "") return false;
  return true;
}

// Converts a runtime value into something safe to store in world.eventLog / JSON.stringify.
// EntityRef holds a back-reference to its World, and World holds eventLog, so logging a raw
// EntityRef (e.g. an entity-valued field assignment or action argument) creates a cycle that
// crashes JSON.stringify wherever the log is later serialized (EventLogPanel, --verbose, etc).
export function toLoggable(val: any): any {
  if (val instanceof EntityRef) return { entity: val.name };
  if (Array.isArray(val)) return val.map(toLoggable);
  return val;
}

export class World {
  public name: string;
  public entities = new Map<string, WorldEntity>();
  public relations: Relation[] = [];
  public events: { condition: ASTNode; block: BlockNode }[] = [];
  public timers: { type: "every" | "after"; ms: number; block: BlockNode; nextRun: number }[] = [];
  public intents: { name: string; ensure: ASTNode | null; otherwise: BlockNode | null }[] = [];
  public clock = 0;
  public eventLog: EventLogEntry[] = [];
  public onLog?: (msg: string) => void;
  public _depth = 0; // reentrancy guard for settle() cascades triggered from inside execStmt

  constructor(name: string, options: { log?: (msg: string) => void } = {}) {
    this.name = name;
    this.onLog = options.log;
  }

  logOccurrence(type: string, data: any) {
    this.eventLog.push({
      type,
      kind: type,
      data,
      detail: data,
      timestamp: this.clock,
      t: this.clock,
    });
    if (this.eventLog.length > 200) {
      this.eventLog.shift();
    }
    if (this.onLog) {
      this.onLog(`[${type}] ${JSON.stringify(toLoggable(data))}`);
    }
  }

  getEntity(name: string): WorldEntity {
    const ent = this.entities.get(name);
    if (!ent) {
      throw new Error(`Entity or Agent '${name}' not found in world '${this.name}'`);
    }
    return ent;
  }

  load(ast: WorldNode, interpreter: Interpreter) {
    for (const item of ast.body) {
      switch (item.kind) {
        case "EntityDecl": {
          const fieldsObj: Record<string, any> = {};
          for (const f of item.fields) {
            fieldsObj[f.name] = interpreter.evalExpr(f.value, this);
          }
          this.entities.set(item.name, {
            name: item.name,
            fields: fieldsObj,
            isAgent: item.isAgent,
            isPersistent: item.isPersistent,
            capabilities: item.capabilities,
          });
          break;
        }
        case "RelationDecl":
          this.relations.push({ subject: item.subject, verb: item.verb, object: item.object });
          break;
        case "EventDecl":
          this.events.push({ condition: item.condition, block: item.block });
          break;
        case "TimerDecl":
          this.timers.push({
            type: item.timerType,
            ms: item.amountMs,
            block: item.block,
            nextRun: this.clock + item.amountMs,
          });
          break;
        case "IntentDecl":
          this.intents.push({ name: item.name, ensure: item.ensure, otherwise: item.otherwise });
          break;
      }
    }
  }

  checkCapability(entityName: string, verb: "read" | "control" | "act", target: string) {
    const ent = this.entities.get(entityName);
    if (!ent || !ent.isAgent) return;
    const allowed = ent.capabilities.some(
      (c) => c.verb === verb && (c.target === null || c.target === target || target.startsWith(c.target + "."))
    );
    if (!allowed) {
      const err = new Error(`Agent '${entityName}' lacks capability '${verb}' for target '${target}'`);
      this.logOccurrence("permission_denied", { entity: entityName, verb, target });
      throw err;
    }
  }
}

export class Interpreter {
  public worlds = new Map<string, World>();
  public log: (msg: string) => void;

  constructor(options: { log?: (msg: string) => void } = {}) {
    this.log = options.log || console.log;
  }

  run(programAst: ProgramNode): Interpreter {
    for (const w of programAst.worlds) {
      const world = new World(w.name, { log: this.log });
      this.worlds.set(w.name, world);
      world.load(w, this);
    }
    for (const world of this.worlds.values()) {
      this.settle(world);
    }
    return this;
  }

  evalExpr(node: ASTNode, world: World): any {
    switch (node.kind) {
      case "Literal":
        return node.value;
      case "EntityRefExpr":
        return new EntityRef(node.name, world);
      case "FieldAccess": {
        const ref = this.evalExpr(node.entity, world);
        const name = ref instanceof EntityRef ? ref.name : String(ref);
        const ent = world.entities.get(name);
        if (!ent || !(node.field in ent.fields)) {
          return 0; // Soft fallback for missing fields or input keys
        }
        return ent.fields[node.field];
      }
      case "CallExpr": {
        const name = node.name;
        const args = node.args.map((a: ASTNode) => this.evalExpr(a, world));
        if (name === "near") {
          const first = args[0];
          const second = args[1];
          const distThreshold = typeof args[1] === "number" ? args[1] : typeof args[2] === "number" ? args[2] : 100;
          const nameA = first instanceof EntityRef ? first.name : String(first);
          const nameB = second instanceof EntityRef ? second.name : String(second);
          const entA = world.entities.get(nameA);
          const entB = world.entities.get(nameB);
          if (entA && entB) {
            const ax = entA.fields.x || 0;
            const ay = entA.fields.y || 0;
            const bx = entB.fields.x || 0;
            const by = entB.fields.y || 0;
            return Math.hypot(ax - bx, ay - by) < distThreshold;
          }
          return false;
        }
        if (name === "collides") {
          const first = args[0];
          const second = args[1];
          const nameA = first instanceof EntityRef ? first.name : String(first);
          const nameB = second instanceof EntityRef ? second.name : String(second);
          const entA = world.entities.get(nameA);
          const entB = world.entities.get(nameB);
          if (entA && entB) {
            const ax = entA.fields.x || 0;
            const ay = entA.fields.y || 0;
            const aw = entA.fields.width || 32;
            const ah = entA.fields.height || 32;
            const bx = entB.fields.x || 0;
            const by = entB.fields.y || 0;
            const bw = entB.fields.width || 32;
            const bh = entB.fields.height || 32;
            return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
          }
          return false;
        }
        return false;
      }
      case "Unary": {
        const v = this.evalExpr(node.expr, world);
        if (node.op === "not") return !truthy(v);
        if (node.op === "-") return -v;
        if (node.op === "+") return +v;
        throw new Error(`Unknown unary op ${node.op}`);
      }
      case "Binary": {
        const op = node.op;
        if (op === "and") return truthy(this.evalExpr(node.left, world)) && truthy(this.evalExpr(node.right, world));
        if (op === "or") return truthy(this.evalExpr(node.left, world)) || truthy(this.evalExpr(node.right, world));

        const l = this.evalExpr(node.left, world);
        const r = this.evalExpr(node.right, world);

        switch (op) {
          case "+":
            return typeof l === "string" || typeof r === "string" ? String(l) + String(r) : l + r;
          case "-":
            return l - r;
          case "*":
            return l * r;
          case "/":
            return l / r;
          case "==":
            return l === r;
          case "!=":
            return l !== r;
          case "<":
            return l < r;
          case ">":
            return l > r;
          case "<=":
            return l <= r;
          case ">=":
            return l >= r;
          case "near": {
            const nameA = l instanceof EntityRef ? l.name : String(l);
            const nameB = r instanceof EntityRef ? r.name : String(r);
            const entA = world.entities.get(nameA);
            const entB = world.entities.get(nameB);
            if (entA && entB) {
              const ax = typeof entA.fields.x === "number" ? entA.fields.x : 0;
              const ay = typeof entA.fields.y === "number" ? entA.fields.y : 0;
              const bx = typeof entB.fields.x === "number" ? entB.fields.x : 0;
              const by = typeof entB.fields.y === "number" ? entB.fields.y : 0;
              const dist = Math.hypot(ax - bx, ay - by);
              return dist < 100;
            }
            return !!(world as any)[`_near_${nameA}_${nameB}`];
          }
          case "collides": {
            const nameA = l instanceof EntityRef ? l.name : String(l);
            const nameB = r instanceof EntityRef ? r.name : String(r);
            const entA = world.entities.get(nameA);
            const entB = world.entities.get(nameB);
            if (entA && entB) {
              const ax = typeof entA.fields.x === "number" ? entA.fields.x : 0;
              const ay = typeof entA.fields.y === "number" ? entA.fields.y : 0;
              const aw = typeof entA.fields.width === "number" ? entA.fields.width : 32;
              const ah = typeof entA.fields.height === "number" ? entA.fields.height : 32;

              const bx = typeof entB.fields.x === "number" ? entB.fields.x : 0;
              const by = typeof entB.fields.y === "number" ? entB.fields.y : 0;
              const bw = typeof entB.fields.width === "number" ? entB.fields.width : 32;
              const bh = typeof entB.fields.height === "number" ? entB.fields.height : 32;

              return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
            }
            return false;
          }
          default:
            throw new Error(`Unknown binary op ${op}`);
        }
      }
      default:
        throw new Error(`Cannot evaluate node kind ${(node as any).kind}`);
    }
  }

  execBlock(block: BlockNode, world: World) {
    for (const stmt of block.statements) {
      this.execStmt(stmt, world);
    }
  }

  execStmt(stmt: BlockNode["statements"][0], world: World) {
    switch (stmt.kind) {
      case "Assignment": {
        // A bare `Target.field = expr` written directly inside a world's own when/every/
        // after/intent body is the world's own trusted rule (like top-level code in any
        // language) -- there is no "acting agent" to check it against, so it is never
        // capability-checked. The capability-gated write path for agents is
        // `Agent.set(Target, "field", value)`, handled in the CallStmt case below.
        const ent = world.getEntity(stmt.entity);
        const value = this.evalExpr(stmt.expr, world);
        ent.fields[stmt.field] = value;
        world.logOccurrence("state_changed", { entity: stmt.entity, field: stmt.field, value: toLoggable(value) });
        this.settle(world);
        return;
      }
      case "CallStmt": {
        // Scoped to the method being called, so `can: act someMethod` can meaningfully
        // restrict which actions an agent may perform. A bare `can: act` still matches
        // everything.
        world.checkCapability(stmt.entity, "act", stmt.method);
        const ent = world.getEntity(stmt.entity);
        const evaluatedArgs = stmt.args.map((a) => this.evalExpr(a, world));
        if (stmt.method === "say") {
          const msg = evaluatedArgs.map(String).join(" ");
          world.logOccurrence("speech", { entity: stmt.entity, text: msg });
          this.log(`[${world.name}] ${stmt.entity} says: "${msg}"`);
        } else if (stmt.method === "set") {
          // The capability-gated write path: Agent.set(Target, "field", value).
          // Unlike a bare `Target.field = value`, this is checked against the *acting*
          // entity's own `can: control ...` list before the write happens.
          const [targetRef, fieldName, value] = evaluatedArgs;
          if (!(targetRef instanceof EntityRef)) {
            throw new Error(`${stmt.entity}.set() expects an entity as its first argument`);
          }
          if (typeof fieldName !== "string") {
            throw new Error(`${stmt.entity}.set() expects a field name string as its second argument`);
          }
          const targetName = targetRef.name;
          world.checkCapability(stmt.entity, "control", `${targetName}.${fieldName}`);
          const targetEnt = world.getEntity(targetName);
          targetEnt.fields[fieldName] = value;
          world.logOccurrence("state_changed", {
            entity: targetName,
            field: fieldName,
            value: toLoggable(value),
            via: stmt.entity,
          });
        } else if (typeof ent.fields[stmt.method] === "function") {
          ent.fields[stmt.method](...evaluatedArgs);
        }
        this.settle(world);
        return;
      }
      case "LogStmt": {
        const val = this.evalExpr(stmt.expr, world);
        this.log(`[${world.name}] LOG: ${JSON.stringify(toLoggable(val))}`);
        return;
      }
      case "EventDecl":
        // A `when` nested inside a block (e.g. inside `every`) is registered once, lazily.
        if (!stmt._registered) {
          world.events.push({ condition: stmt.condition, block: stmt.block });
          stmt._registered = true;
        }
        return;
      case "TimerDecl":
        if (!stmt._registered) {
          world.timers.push({
            type: stmt.timerType,
            ms: stmt.amountMs,
            block: stmt.block,
            nextRun: world.clock + stmt.amountMs,
          });
          stmt._registered = true;
        }
        return;
    }
  }

  settle(world: World) {
    // execStmt calls settle() again after every Assignment/CallStmt so cascading rules
    // converge within a single settle() pass. But a rule whose own effect doesn't clear
    // its trigger condition (e.g. `when A collides B { A.vx = -A.vx }` -- flipping velocity
    // doesn't change position, so the two are still colliding) would otherwise recurse
    // forever and blow the call stack. Once a settle() is already in progress higher up
    // the call stack, nested calls are no-ops -- the in-progress settle()'s own while loop
    // (bounded by maxPasses) is what re-checks events/intents, not the recursive call.
    if (world._depth > 0) return;
    world._depth++;
    try {
      let changed = true;
      let passes = 0;
      const maxPasses = 50;

      while (changed && passes < maxPasses) {
        changed = false;
        passes++;

        for (const intent of world.intents) {
          if (intent.ensure) {
            const ok = truthy(this.evalExpr(intent.ensure, world));
            if (!ok && intent.otherwise) {
              world.logOccurrence("intent_violated", { intent: intent.name });
              this.execBlock(intent.otherwise, world);
              changed = true;
            }
          }
        }

        for (const ev of world.events) {
          const val = truthy(this.evalExpr(ev.condition, world));
          if (val) {
            world.logOccurrence("event_fired", { condition: ev.condition.kind || "when_rule" });
            this.execBlock(ev.block, world);
          }
        }
      }
    } finally {
      world._depth--;
    }
  }

  advanceTime(world: World, dtMs: number) {
    world.clock += dtMs;
    for (const timer of world.timers) {
      if (world.clock >= timer.nextRun) {
        this.execBlock(timer.block, world);
        if (timer.type === "every") {
          timer.nextRun = world.clock + timer.ms;
        } else {
          timer.nextRun = Infinity;
        }
      }
    }
    this.settle(world);
  }
}
