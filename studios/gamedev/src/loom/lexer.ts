export type TokenType =
  | "WORLD" | "ENTITY" | "AGENT" | "PERSISTENT" | "WHEN" | "EVERY" | "AFTER"
  | "UNTIL" | "FOR" | "INTENT" | "ENSURE" | "OTHERWISE" | "CAN" | "READ"
  | "CONTROL" | "ACT" | "KNOWS" | "LOG" | "NOT" | "TRUE" | "FALSE" | "AND" | "OR"
  | "STRING" | "NUMBER" | "TIMEVALUE" | "IDENT"
  | "==" | "!=" | ">=" | "<=" | "&&" | "||"
  | "{" | "}" | "(" | ")" | "[" | "]" | "," | "." | ":" | "=" | "+" | "-" | "*" | "/" | "<" | ">" | "!"
  | "EOF";

export const KEYWORDS: Record<string, TokenType> = {
  world: "WORLD",
  entity: "ENTITY",
  agent: "AGENT",
  persistent: "PERSISTENT",
  when: "WHEN",
  every: "EVERY",
  after: "AFTER",
  until: "UNTIL",
  for: "FOR",
  intent: "INTENT",
  ensure: "ENSURE",
  otherwise: "OTHERWISE",
  can: "CAN",
  read: "READ",
  control: "CONTROL",
  act: "ACT",
  knows: "KNOWS",
  log: "LOG",
  not: "NOT",
  true: "TRUE",
  false: "FALSE",
  and: "AND",
  or: "OR",
};

export const TIME_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60000,
  min: 60000,
  minute: 60000,
  minutes: 60000,
  second: 1000,
  seconds: 1000,
  h: 3600000,
  hours: 3600000,
};

export class Token {
  public type: TokenType;
  public value: any;
  public line: number;

  constructor(type: TokenType, value: any, line: number) {
    this.type = type;
    this.value = value;
    this.line = line;
  }

  toString(): string {
    return `${this.type}(${JSON.stringify(this.value)})`;
  }
}

export class LoomSyntaxError extends Error {
  public line: number;

  constructor(message: string, line: number) {
    super(`${message} (line ${line})`);
    this.name = "LoomSyntaxError";
    this.line = line;
  }
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isAlpha(c: string): boolean {
  return /[A-Za-z_]/.test(c);
}

function isAlnum(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c);
}

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const n = source.length;

  function peek(off = 0): string {
    return source[i + off] || "";
  }

  while (i < n) {
    const c = source[i];

    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }

    // Single-line comment
    if (c === "/" && peek(1) === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }

    // String literals
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let s = "";
      while (j < n && source[j] !== quote) {
        if (source[j] === "\\" && source[j + 1] === quote) {
          s += quote;
          j += 2;
          continue;
        }
        s += source[j];
        j++;
      }
      if (j >= n) throw new LoomSyntaxError(`Unterminated string`, line);
      tokens.push(new Token("STRING", s, line));
      i = j + 1;
      continue;
    }

    // Numbers & Time values (e.g., 500ms, 3.seconds, 16ms, 2s)
    if (isDigit(c)) {
      let j = i;
      let s = "";
      while (j < n && (isDigit(source[j]) || source[j] === ".")) {
        s += source[j];
        j++;
      }

      // Check dotted time unit: e.g. 5.seconds
      if (source[j] === "." && isAlpha(source[j + 1])) {
        let k = j + 1;
        let unit = "";
        while (k < n && isAlnum(source[k])) {
          unit += source[k];
          k++;
        }
        if (TIME_UNITS[unit] !== undefined) {
          const val = parseFloat(s) * TIME_UNITS[unit];
          tokens.push(new Token("TIMEVALUE", val, line));
          i = k;
          continue;
        }
      }

      // Check suffixed time unit: e.g. 500ms, 2s, 16ms
      let k = j;
      let unit = "";
      while (k < n && isAlpha(source[k])) {
        unit += source[k];
        k++;
      }
      if (unit && TIME_UNITS[unit] !== undefined) {
        const val = parseFloat(s) * TIME_UNITS[unit];
        tokens.push(new Token("TIMEVALUE", val, line));
        i = k;
        continue;
      }

      tokens.push(new Token("NUMBER", parseFloat(s), line));
      i = j;
      continue;
    }

    // Identifiers & Keywords
    if (isAlpha(c)) {
      let j = i;
      let s = "";
      while (j < n && isAlnum(source[j])) {
        s += source[j];
        j++;
      }
      const kw = KEYWORDS[s];
      if (kw) {
        tokens.push(new Token(kw, s, line));
      } else {
        tokens.push(new Token("IDENT", s, line));
      }
      i = j;
      continue;
    }

    // Multi-char operators
    const two = source.slice(i, i + 2);
    if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) {
      tokens.push(new Token(two as TokenType, two, line));
      i += 2;
      continue;
    }

    // Single-char operators & punctuation
    if ("{}()[],.:=+-*/<>!".includes(c)) {
      tokens.push(new Token(c as TokenType, c, line));
      i++;
      continue;
    }

    throw new LoomSyntaxError(`Unexpected character '${c}'`, line);
  }

  tokens.push(new Token("EOF", null, line));
  return tokens;
}
