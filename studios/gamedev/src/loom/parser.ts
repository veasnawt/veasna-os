import { lex, Token, type TokenType, LoomSyntaxError } from "./lexer";

export type ASTNode =
  | ProgramNode
  | WorldNode
  | EntityDeclNode
  | RelationDeclNode
  | EventDeclNode
  | TimerDeclNode
  | IntentDeclNode
  | BlockNode
  | AssignmentNode
  | CallStmtNode
  | CallExprNode
  | LogStmtNode
  | BinaryNode
  | UnaryNode
  | FieldAccessNode
  | EntityRefNode
  | LiteralNode;

export interface ProgramNode {
  kind: "Program";
  worlds: WorldNode[];
}

export interface WorldNode {
  kind: "World";
  name: string;
  body: (EntityDeclNode | RelationDeclNode | EventDeclNode | TimerDeclNode | IntentDeclNode)[];
}

export interface FieldDecl {
  name: string;
  value: ASTNode;
}

export interface CapabilityDecl {
  verb: "read" | "control" | "act";
  target: string | null;
}

export interface EntityDeclNode {
  kind: "EntityDecl";
  name: string;
  isAgent: boolean;
  isPersistent: boolean;
  fields: FieldDecl[];
  capabilities: CapabilityDecl[];
}

export interface RelationDeclNode {
  kind: "RelationDecl";
  subject: string;
  verb: string;
  object: string;
}

export interface EventDeclNode {
  kind: "EventDecl";
  condition: ASTNode;
  block: BlockNode;
  _registered?: boolean;
}

export interface TimerDeclNode {
  kind: "TimerDecl";
  timerType: "every" | "after";
  amountMs: number;
  block: BlockNode;
  _registered?: boolean;
}

export interface IntentDeclNode {
  kind: "IntentDecl";
  name: string;
  ensure: ASTNode | null;
  otherwise: BlockNode | null;
}

export interface BlockNode {
  kind: "Block";
  statements: (AssignmentNode | CallStmtNode | LogStmtNode | EventDeclNode | TimerDeclNode)[];
}

export interface AssignmentNode {
  kind: "Assignment";
  entity: string;
  field: string;
  expr: ASTNode;
}

export interface CallStmtNode {
  kind: "CallStmt";
  entity: string;
  method: string;
  args: ASTNode[];
}

export interface CallExprNode {
  kind: "CallExpr";
  name: string;
  args: ASTNode[];
}

export interface LogStmtNode {
  kind: "LogStmt";
  expr: ASTNode;
}

export interface BinaryNode {
  kind: "Binary";
  op: string;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryNode {
  kind: "Unary";
  op: string;
  expr: ASTNode;
}

export interface FieldAccessNode {
  kind: "FieldAccess";
  entity: EntityRefNode;
  field: string;
}

export interface EntityRefNode {
  kind: "EntityRefExpr";
  name: string;
}

export interface LiteralNode {
  kind: "Literal";
  value: any;
}

export class Parser {
  private pos = 0;
  public tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(off = 0): Token {
    return this.tokens[this.pos + off] || this.tokens[this.tokens.length - 1];
  }

  private at(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType, msg?: string): Token {
    if (!this.at(type)) {
      const t = this.peek();
      throw new LoomSyntaxError(
        msg || `Expected ${type} but found ${t.type} (${JSON.stringify(t.value)})`,
        t.line
      );
    }
    return this.advance();
  }

  parseProgram(): ProgramNode {
    const worlds: WorldNode[] = [];

    // If program starts with entity/agent/when/every/intent/identifier instead of 'world',
    // auto-wrap all top-level statements into an implicit world named "MainWorld"
    if (!this.at("EOF") && !this.at("WORLD")) {
      const body: WorldNode["body"] = [];
      while (!this.at("EOF")) {
        body.push(this.parseWorldMember());
      }
      return {
        kind: "Program",
        worlds: [{ kind: "World", name: "MainWorld", body }],
      };
    }

    while (!this.at("EOF")) {
      if (this.at("WORLD")) {
        worlds.push(this.parseWorld());
      } else {
        if (worlds.length > 0) {
          const lastWorld = worlds[worlds.length - 1];
          while (!this.at("EOF") && !this.at("WORLD")) {
            lastWorld.body.push(this.parseWorldMember());
          }
        } else {
          const t = this.peek();
          throw new LoomSyntaxError(
            `Top-level declaration '${t.value || t.type}' must be inside a 'world WorldName { ... }' block (line ${t.line})`,
            t.line
          );
        }
      }
    }

    return { kind: "Program", worlds };
  }

  parseWorld(): WorldNode {
    this.expect("WORLD");
    const name = this.expect("IDENT").value;
    this.expect("{");
    const body: WorldNode["body"] = [];
    while (!this.at("}")) {
      body.push(this.parseWorldMember());
    }
    this.expect("}");
    return { kind: "World", name, body };
  }

  parseWorldMember() {
    if (this.at("ENTITY") || this.at("AGENT") || this.at("PERSISTENT")) {
      return this.parseEntityDecl();
    }
    if (this.at("WHEN")) return this.parseEventDecl();
    if (this.at("EVERY") || this.at("AFTER")) return this.parseTimerDecl();
    if (this.at("INTENT")) return this.parseIntentDecl();
    if (this.at("IDENT")) return this.parseRelationDecl();
    const t = this.peek();
    throw new LoomSyntaxError(`Unexpected token ${t.type} in world body`, t.line);
  }

  parseEntityDecl(): EntityDeclNode {
    let isPersistent = false;
    let isAgent = false;
    if (this.at("PERSISTENT")) {
      this.advance();
      isPersistent = true;
    }
    if (this.at("AGENT")) {
      this.advance();
      isAgent = true;
    } else {
      this.expect("ENTITY");
    }

    const name = this.expect("IDENT").value;
    const fields: FieldDecl[] = [];
    const capabilities: CapabilityDecl[] = [];

    if (this.at("{")) {
      this.advance();
      while (!this.at("}")) {
        if (this.at("CAN")) {
          this.advance();
          this.expect(":");
          capabilities.push(...this.parseCapabilityList());
        } else {
          const fname = this.expect("IDENT").value;
          this.expect(":");
          const fexpr = this.parseExpr();
          fields.push({ name: fname, value: fexpr });
          if (this.at(",")) this.advance();
        }
      }
      this.expect("}");
    }

    return { kind: "EntityDecl", name, isAgent, isPersistent, fields, capabilities };
  }

  parseCapabilityList(): CapabilityDecl[] {
    const caps: CapabilityDecl[] = [];
    while (true) {
      if (this.at("READ") || this.at("CONTROL") || this.at("ACT")) {
        const verb = this.advance().type.toLowerCase() as "read" | "control" | "act";
        let target: string | null = null;
        if (this.at("IDENT")) {
          let t = this.advance().value;
          if (this.at(".")) {
            this.advance();
            t += "." + this.expect("IDENT").value;
          }
          target = t;
        }
        caps.push({ verb, target });
      } else break;

      if (this.at(",")) {
        this.advance();
        continue;
      }
      break;
    }
    return caps;
  }

  parseRelationDecl(): RelationDeclNode {
    const subject = this.expect("IDENT").value;
    let verb: string;
    if (this.at("KNOWS")) verb = this.advance().value;
    else verb = this.expect("IDENT").value;
    const object = this.expect("IDENT").value;
    return { kind: "RelationDecl", subject, verb, object };
  }

  parseEventDecl(): EventDeclNode {
    this.expect("WHEN");
    const condition = this.parseExpr();
    const block = this.parseBlock();
    return { kind: "EventDecl", condition, block };
  }

  parseTimerDecl(): TimerDeclNode {
    const timerType = this.advance().type.toLowerCase() as "every" | "after";
    const amountMs = this.expect("TIMEVALUE").value;
    const block = this.parseBlock();
    return { kind: "TimerDecl", timerType, amountMs, block };
  }

  parseIntentDecl(): IntentDeclNode {
    this.expect("INTENT");
    const name = this.expect("IDENT").value;
    let ensure: ASTNode | null = null;
    let otherwise: BlockNode | null = null;
    if (this.at("{")) {
      this.advance();
      if (this.at("ENSURE")) {
        this.advance();
        ensure = this.parseExpr();
      }
      if (this.at("OTHERWISE")) {
        this.advance();
        otherwise = this.parseBlock();
      }
      this.expect("}");
    }
    return { kind: "IntentDecl", name, ensure, otherwise };
  }

  parseBlock(): BlockNode {
    this.expect("{");
    const statements: BlockNode["statements"] = [];
    while (!this.at("}")) {
      statements.push(this.parseStatement());
    }
    this.expect("}");
    return { kind: "Block", statements };
  }

  parseStatement(): BlockNode["statements"][0] {
    if (this.at("WHEN")) return this.parseEventDecl();
    if (this.at("EVERY") || this.at("AFTER")) return this.parseTimerDecl();
    if (this.at("LOG")) {
      this.advance();
      const expr = this.parseExpr();
      return { kind: "LogStmt", expr };
    }

    const entity = this.expect("IDENT").value;
    this.expect(".");
    const member = this.expect("IDENT").value;

    if (this.at("=")) {
      this.advance();
      const expr = this.parseExpr();
      return { kind: "Assignment", entity, field: member, expr };
    }

    if (this.at("(")) {
      this.advance();
      const args: ASTNode[] = [];
      while (!this.at(")")) {
        args.push(this.parseExpr());
        if (this.at(",")) this.advance();
      }
      this.expect(")");
      return { kind: "CallStmt", entity, method: member, args };
    }

    const t = this.peek();
    throw new LoomSyntaxError(`Expected '=' or '(' after ${entity}.${member}`, t.line);
  }

  parseExpr(): ASTNode {
    return this.parseOr();
  }

  parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.at("||") || this.at("OR")) {
      this.advance();
      left = { kind: "Binary", op: "or", left, right: this.parseAnd() };
    }
    return left;
  }

  parseAnd(): ASTNode {
    let left = this.parseNot();
    while (this.at("&&") || this.at("AND")) {
      this.advance();
      left = { kind: "Binary", op: "and", left, right: this.parseNot() };
    }
    return left;
  }

  parseNot(): ASTNode {
    if (this.at("NOT") || this.at("!")) {
      this.advance();
      return { kind: "Unary", op: "not", expr: this.parseNot() };
    }
    if (this.at("-")) {
      this.advance();
      return { kind: "Unary", op: "-", expr: this.parseNot() };
    }
    if (this.at("+")) {
      this.advance();
      return { kind: "Unary", op: "+", expr: this.parseNot() };
    }
    return this.parseComparison();
  }

  parseComparison(): ASTNode {
    let left = this.parseAdditive();
    const ops = ["==", "!=", "<", ">", "<=", ">="];
    while (
      ops.includes(this.peek().type) ||
      (this.peek().type === "IDENT" && ["near", "collides", "touches", "inside", "knows", "sees"].includes(this.peek().value))
    ) {
      const opToken = this.advance();
      const op = opToken.type === "IDENT" ? opToken.value : opToken.type;
      left = { kind: "Binary", op, left, right: this.parseAdditive() };
    }
    return left;
  }

  parseAdditive(): ASTNode {
    let left = this.parseMultiplicative();
    while (this.at("+") || this.at("-")) {
      const op = this.advance().type;
      left = { kind: "Binary", op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  parseMultiplicative(): ASTNode {
    let left = this.parseUnary();
    while (this.at("*") || this.at("/")) {
      const op = this.advance().type;
      left = { kind: "Binary", op, left, right: this.parseUnary() };
    }
    return left;
  }

  // Handles a leading -/+ on ANY operand, not just the first token of a whole
  // expression. parseNot() already handles -/+ at the very start of an expression,
  // but its recursive calls bottom out at parseComparison -> parseAdditive ->
  // parseMultiplicative, whose right-hand-side operands never routed back through
  // unary handling -- so "x <= -70" or "5 * -3" failed to parse. This level sits
  // just above parsePrimary so every operand position reaches it.
  parseUnary(): ASTNode {
    if (this.at("-")) {
      this.advance();
      return { kind: "Unary", op: "-", expr: this.parseUnary() };
    }
    if (this.at("+")) {
      this.advance();
      return { kind: "Unary", op: "+", expr: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary(): ASTNode {
    const t = this.peek();
    if (t.type === "NUMBER" || t.type === "TIMEVALUE") {
      this.advance();
      return { kind: "Literal", value: t.value };
    }
    if (t.type === "STRING") {
      this.advance();
      return { kind: "Literal", value: t.value };
    }
    if (t.type === "TRUE") {
      this.advance();
      return { kind: "Literal", value: true };
    }
    if (t.type === "FALSE") {
      this.advance();
      return { kind: "Literal", value: false };
    }
    if (t.type === "(") {
      this.advance();
      const e = this.parseExpr();
      this.expect(")");
      return e;
    }
    if (t.type === "IDENT") {
      const name = this.advance().value;

      // Function call expression: near(Player, StarGoal)
      if (this.at("(")) {
        this.advance();
        const args: ASTNode[] = [];
        while (!this.at(")")) {
          args.push(this.parseExpr());
          if (this.at(",")) this.advance();
        }
        this.expect(")");
        return { kind: "CallExpr", name, args };
      }

      if (this.at(".")) {
        this.advance();
        const field = this.expect("IDENT").value;
        return { kind: "FieldAccess", entity: { kind: "EntityRefExpr", name }, field };
      }
      return { kind: "EntityRefExpr", name };
    }
    throw new LoomSyntaxError(`Unexpected token ${t.type} in expression`, t.line);
  }
}

export function parse(source: string): ProgramNode {
  const tokens = lex(source);
  const parser = new Parser(tokens);
  return parser.parseProgram();
}
