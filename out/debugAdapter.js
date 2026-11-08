// debugAdapter.js
'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================
// DAP transport
// ============================================================
const os = require('os');
const LOG_FILE = path.join(os.homedir(), 'Desktop', 'skorpion-dap.log');
function dapLog(msg) { try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch (e) {} }

const input = process.stdin;
let inputBuffer = Buffer.alloc(0);
let seqCounter = 0;

function nextSeq() { return ++seqCounter; }
function sendMessage(msg) {
    const json = JSON.stringify(msg);
    dapLog('SENT: ' + json);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`);
}
function sendResponse(request, body, success) {
    sendMessage({ seq: nextSeq(), type: 'response', request_seq: request.seq, success: success !== false, command: request.command, body: body || {} });
}
function sendEvent(event, body) {
    sendMessage({ seq: nextSeq(), type: 'event', event, body: body || {} });
}

input.on('data', (chunk) => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    while (true) {
        const headerEnd = inputBuffer.indexOf('\r\n\r\n');
        if (headerEnd < 0) break;
        const header = inputBuffer.slice(0, headerEnd).toString('utf8');
        const m = /Content-Length:\s*(\d+)/i.exec(header);
        if (!m) { inputBuffer = inputBuffer.slice(headerEnd + 4); continue; }
        const len = parseInt(m[1], 10);
        const bodyStart = headerEnd + 4;
        if (inputBuffer.length < bodyStart + len) break;
        const body = inputBuffer.slice(bodyStart, bodyStart + len).toString('utf8');
        inputBuffer = inputBuffer.slice(bodyStart + len);
        let msg;
        try { msg = JSON.parse(body); } catch (e) { continue; }
        handleMessage(msg);
    }
});

// ============================================================
// Debug State
// ============================================================
const debugState = {
    cwd: null, mainFile: null, breakpoints: new Map(),
    paused: false, frames: [], pendingLaunch: null,
    stepMode: null, // 'stepIn' | 'stepOver'
    resumeResolve: null,
    exprStack: [], // Для отображения текущих вычисляемых узлов
};

// ============================================================
// Types
// ============================================================
const SK = { INT: 'int', FLOAT: 'float', DOUBLE: 'double', BOOL: 'bool', CHAR: 'char', STRING: 'string', ARR: 'arr', DICT: 'dict', ANY: 'any', VOID: 'void' };
function makeInt(v) { return { __sk: SK.INT, value: v | 0, __is_null: false }; }
function makeFloat(v) { return { __sk: SK.FLOAT, value: v, __is_null: false, prec: -1 }; }
function makeDouble(v) { return { __sk: SK.DOUBLE, value: v, __is_null: false, prec: -1 }; }
function makeBool(v) { return { __sk: SK.BOOL, value: !!v, __is_null: false }; }
function makeChar(v) { return { __sk: SK.CHAR, value: (v >>> 0) & 0xFF }; }
function makeString(v) { return { __sk: SK.STRING, value: v, __is_null: v === null || v === undefined }; }
function makeArr(v) { return { __sk: SK.ARR, value: v || [], __is_null: false }; }
function makeDict(v) { return { __sk: SK.DICT, value: v || new Map(), __is_null: false }; }
function makeAny(v) { if (v === null || v === undefined) return { __sk_any: true, type: 6, prec: -1, data: null }; if (typeof v === 'number') return { __sk_any: true, type: Number.isInteger(v) ? 0 : 3, prec: -1, data: v }; if (typeof v === 'boolean') return { __sk_any: true, type: 4, prec: -1, data: v }; if (typeof v === 'string') return { __sk_any: true, type: 1, prec: -1, data: v }; if (Array.isArray(v)) return { __sk_any: true, type: 5, prec: -1, data: v }; if (v instanceof Map) return { __sk_any: true, type: 8, prec: -1, data: v }; if (v && v.__sk === SK.CHAR) return { __sk_any: true, type: 7, prec: -1, data: v.value }; return { __sk_any: true, type: 6, prec: -1, data: null }; }
function nullOf(t) { switch (t) { case SK.INT: return { __sk: SK.INT, value: 0, __is_null: true }; case SK.FLOAT: return { __sk: SK.FLOAT, value: 0, __is_null: true, prec: -1 }; case SK.DOUBLE: return { __sk: SK.DOUBLE, value: 0, __is_null: true, prec: -1 }; case SK.BOOL: return { __sk: SK.BOOL, value: false, __is_null: true }; case SK.CHAR: return makeChar(0); case SK.STRING: return { __sk: SK.STRING, value: null, __is_null: true }; case SK.ARR: return { __sk: SK.ARR, value: [], __is_null: true }; case SK.DICT: return { __sk: SK.DICT, value: new Map(), __is_null: true }; case SK.ANY: return { __sk_any: true, type: 6, prec: -1, data: null }; default: return null; } }
function isNull(v) { if (v === null || v === undefined) return true; if (v.__sk_any) return v.type === 6; return v.__is_null === true; }

function displayValue(v) {
    if (v === null || v === undefined) return 'null';
    if (v.__sk_any) { switch (v.type) { case 0: return String(v.data); case 1: return `"${v.data}"`; case 2: case 3: return String(v.data); case 4: return v.data ? 'true' : 'false'; case 5: return '[' + v.data.map(displayValue).join(', ') + ']'; case 6: return 'null'; case 7: return `'${String.fromCharCode(v.data)}'`; case 8: { const p = []; for (const [k, val] of v.data) p.push(`${k}: ${displayValue(val)}`); return '{' + p.join(', ') + '}'; } default: return '?'; } }
    switch (v.__sk) { case SK.INT: return v.__is_null ? 'null' : String(v.value); case SK.FLOAT: case SK.DOUBLE: return v.__is_null ? 'null' : String(v.value); case SK.BOOL: return v.__is_null ? 'null' : (v.value ? 'true' : 'false'); case SK.CHAR: return `'${String.fromCharCode(v.value)}'`; case SK.STRING: return v.__is_null ? 'null' : `"${v.value}"`; case SK.ARR: return v.__is_null ? 'null' : '[' + v.value.map(displayValue).join(', ') + ']'; case SK.DICT: { const p = []; for (const [k, val] of v.value) p.push(`${k}: ${displayValue(val)}`); return '{' + p.join(', ') + '}'; } default: return String(v); }
}

// ============================================================
// Lexer
// ============================================================
const TOK = { EOF: 'EOF', IDENT: 'IDENT', NUMBER: 'NUMBER', STRING: 'STRING', CHARLIT: 'CHARLIT', UNICODE_LIT: 'UNICODE_LIT', KEYWORD: 'KEYWORD', VERSION: 'VERSION', LPAREN: 'LPAREN', RPAREN: 'RPAREN', LBRACE: 'LBRACE', RBRACE: 'RBRACE', LBRACKET: 'LBRACKET', RBRACKET: 'RBRACKET', SEMICOLON: 'SEMICOLON', COMMA: 'COMMA', PLUSEQ: 'PLUSEQ', MINUSEQ: 'MINUSEQ', STAREQ: 'STAREQ', SLASHEQ: 'SLASHEQ', PERCENTEQ: 'PERCENTEQ', POWEQ: 'POWEQ', PLUSPLUS: 'PLUSPLUS', MINUSMINUS: 'MINUSMINUS', NEQ: 'NEQ', EQEQ: 'EQEQ', LTE: 'LTE', GTE: 'GTE', PLUS: 'PLUS', MINUS: 'MINUS', STAR: 'STAR', SLASH: 'SLASH', CARET: 'CARET', POW: 'POW', EQUALS: 'EQUALS', LT: 'LT', GT: 'GT', NOT: 'NOT', AND: 'AND', OR: 'OR', AMPERSAND: 'AMPERSAND', HASH: 'HASH', DOLLAR: 'DOLLAR', DOT: 'DOT', DOTDOT: 'DOTDOT', ELLIPSIS: 'ELLIPSIS', QUESTION: 'QUESTION', COLON: 'COLON', INCLUDE_C: 'INCLUDE_C', TILDE: 'TILDE', PERCENT: 'PERCENT' };
const KEYWORDS = new Set(['use','const','func','if','elsif','else','case','for','in','break','continue','do','while','type','return','null','void','int','char','string','async','await','Promise','arr','dict','float','double','bool','any','true','false','T','new','Error','throw','try','catch','as','IknowIdo']);
const TYPE_KEYWORDS = new Set(['void','int','char','string','arr','dict','float','double','bool','any','T']);

class Lexer {
    constructor(input) { this.input = input; this.pos = 0; this.line = 1; this.col = 1; }
    peek() { return this.pos + 1 < this.input.length ? this.input[this.pos + 1] : ''; }
    nextToken() {
        this.skipWhitespace();
        if (this.pos >= this.input.length) return { type: TOK.EOF, value: '', line: this.line, col: this.col };
        const ch = this.input[this.pos]; const startLine = this.line; const startCol = this.col;
        if (ch === '/' && this.peek() === '*') { this.readMultilineComment(); return this.nextToken(); }
        if (ch === '/' && this.peek() === '/') { this.readSingleLineComment(); return this.nextToken(); }
        if (ch === '~') return this.readTildes();
        if (ch === 'U' && this.input.slice(this.pos, this.pos + 7) === 'Unicode' && this.pos + 7 < this.input.length && this.input[this.pos + 7] === '[') return this.readUnicodeLit();
        if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(this.input[this.pos + 1] || ''))) return this.readNumber();
        if (ch === "'") return this.readCharLit();
        if (ch === '"') return this.readString();
        if (/[A-Za-z_]/.test(ch)) return this.readIdent();
        const three = this.input.slice(this.pos, this.pos + 3);
        if (three === '...') { this.pos += 3; this.col += 3; return { type: TOK.ELLIPSIS, value: '...', line: startLine, col: startCol }; }
        if (three === '**=') { this.pos += 3; this.col += 3; return { type: TOK.POWEQ, value: '**=', line: startLine, col: startCol }; }
        const two = this.input.slice(this.pos, this.pos + 2);
        const twoMap = { '**': TOK.POW, '++': TOK.PLUSPLUS, '--': TOK.MINUSMINUS, '+=': TOK.PLUSEQ, '-=': TOK.MINUSEQ, '*=': TOK.STAREQ, '/=': TOK.SLASHEQ, '%=': TOK.PERCENTEQ, '==': TOK.EQEQ, '!=': TOK.NEQ, '<=': TOK.LTE, '>=': TOK.GTE, '&&': TOK.AND, '||': TOK.OR, '..': TOK.DOTDOT };
        if (twoMap[two]) { this.pos += 2; this.col += 2; return { type: twoMap[two], value: two, line: startLine, col: startCol }; }
        const make = (type) => { const t = { type, value: ch, line: startLine, col: startCol }; this.pos++; this.col++; return t; };
        switch (ch) { case '(': return make(TOK.LPAREN); case ')': return make(TOK.RPAREN); case '{': return make(TOK.LBRACE); case '}': return make(TOK.RBRACE); case '[': return make(TOK.LBRACKET); case ']': return make(TOK.RBRACKET); case ';': return make(TOK.SEMICOLON); case ',': return make(TOK.COMMA); case '+': return make(TOK.PLUS); case '-': return make(TOK.MINUS); case '*': return make(TOK.STAR); case '/': return make(TOK.SLASH); case '^': return make(TOK.CARET); case '=': return make(TOK.EQUALS); case '<': return make(TOK.LT); case '>': return make(TOK.GT); case '!': return make(TOK.NOT); case '&': return make(TOK.AMPERSAND); case '#': return make(TOK.HASH); case '$': return make(TOK.DOLLAR); case '.': return make(TOK.DOT); case '?': return make(TOK.QUESTION); case ':': return make(TOK.COLON); case '%': return make(TOK.PERCENT); case '@': return this.readVersion(); default: this.pos++; this.col++; return this.nextToken(); }
    }
    skipWhitespace() { while (this.pos < this.input.length) { const ch = this.input[this.pos]; if (ch === ' ' || ch === '\t' || ch === '\r') { this.pos++; this.col++; } else if (ch === '\n') { this.pos++; this.line++; this.col = 1; } else break; } }
    readIdent() { const start = this.pos; const startCol = this.col; while (this.pos < this.input.length && /[A-Za-z0-9_]/.test(this.input[this.pos])) { this.pos++; this.col++; } const lit = this.input.slice(start, this.pos); return { type: KEYWORDS.has(lit) ? TOK.KEYWORD : TOK.IDENT, value: lit, line: this.line, col: startCol }; }
    readNumber() { const start = this.pos; const startCol = this.col; if (this.input[this.pos] === '-') { this.pos++; this.col++; } while (this.pos < this.input.length && /[0-9]/.test(this.input[this.pos])) { this.pos++; this.col++; } if (this.pos + 1 < this.input.length && this.input[this.pos] === '.' && /[0-9]/.test(this.input[this.pos + 1])) { this.pos++; this.col++; while (this.pos < this.input.length && /[0-9]/.test(this.input[this.pos])) { this.pos++; this.col++; } } if (this.pos < this.input.length && (this.input[this.pos] === 'f' || this.input[this.pos] === 'F')) { this.pos++; this.col++; } return { type: TOK.NUMBER, value: this.input.slice(start, this.pos), line: this.line, col: startCol }; }
    readCharLit() { const startCol = this.col; const startLine = this.line; this.pos++; this.col++; let ch = ''; if (this.pos < this.input.length && this.input[this.pos] === '\\' && this.pos + 1 < this.input.length) { this.pos++; this.col++; const esc = this.input[this.pos]; switch (esc) { case 'n': ch = '\n'; break; case 't': ch = '\t'; break; case 'r': ch = '\r'; break; case '0': ch = '\0'; break; case '\\': ch = '\\'; break; case "'": ch = "'"; break; case '"': ch = '"'; break; default: ch = esc; } this.pos++; this.col++; } else if (this.pos < this.input.length) { ch = this.input[this.pos]; this.pos++; this.col++; } if (this.pos < this.input.length && this.input[this.pos] === "'") { this.pos++; this.col++; } return { type: TOK.CHARLIT, value: ch, line: startLine, col: startCol }; }
    readString() { const startCol = this.col; const startLine = this.line; this.pos++; this.col++; let result = ''; while (this.pos < this.input.length && this.input[this.pos] !== '"') { if (this.input[this.pos] === '\\' && this.pos + 1 < this.input.length) { this.pos++; this.col++; const esc = this.input[this.pos]; switch (esc) { case 'n': result += '\n'; break; case 't': result += '\t'; break; case 'r': result += '\r'; break; case '0': result += '\0'; break; case '\\': result += '\\'; break; case '"': result += '"'; break; case "'": result += "'"; break; default: result += '\\' + esc; } this.pos++; this.col++; } else { result += this.input[this.pos]; this.pos++; this.col++; } } if (this.pos < this.input.length) { this.pos++; this.col++; } return { type: TOK.STRING, value: result, line: startLine, col: startCol }; }
    readUnicodeLit() { const startCol = this.col; const startLine = this.line; this.pos += 7; this.col += 7; if (this.pos >= this.input.length || this.input[this.pos] !== '[') return { type: TOK.UNICODE_LIT, value: '', line: startLine, col: startCol }; this.pos++; this.col++; if (this.pos >= this.input.length || this.input[this.pos] !== '"') return { type: TOK.UNICODE_LIT, value: '', line: startLine, col: startCol }; this.pos++; this.col++; const hexStart = this.pos; while (this.pos < this.input.length && this.input[this.pos] !== '"') { this.pos++; this.col++; } const hex = this.input.slice(hexStart, this.pos); if (this.pos < this.input.length) { this.pos++; this.col++; } if (this.pos < this.input.length && this.input[this.pos] === ']') { this.pos++; this.col++; } return { type: TOK.UNICODE_LIT, value: hex, line: startLine, col: startCol }; }
    readVersion() { const startCol = this.col; const start = this.pos; this.pos++; this.col++; if (this.pos >= this.input.length || !/[0-9]/.test(this.input[this.pos])) return { type: TOK.VERSION, value: '@', line: this.line, col: startCol }; while (this.pos < this.input.length) { const ch = this.input[this.pos]; if (/[0-9]/.test(ch)) { this.pos++; this.col++; continue; } if (ch === '.' && this.pos + 1 < this.input.length && /[0-9]/.test(this.input[this.pos + 1])) { this.pos++; this.col++; continue; } break; } return { type: TOK.VERSION, value: this.input.slice(start, this.pos), line: this.line, col: startCol }; }
    readSingleLineComment() { while (this.pos < this.input.length && this.input[this.pos] !== '\n') { this.pos++; this.col++; } }
    readMultilineComment() { this.pos += 2; this.col += 2; while (this.pos < this.input.length - 1 && !(this.input[this.pos] === '*' && this.input[this.pos + 1] === '/')) { if (this.input[this.pos] === '\n') { this.line++; this.col = 1; } else this.col++; this.pos++; } if (this.pos < this.input.length - 1) { this.pos += 2; this.col += 2; } }
    readTildes() { const startCol = this.col; const startLine = this.line; this.pos++; this.col++; if (this.pos < this.input.length && this.input[this.pos] === '~') { this.pos++; this.col++; } if (this.pos < this.input.length && this.input[this.pos] === '~') { this.pos++; this.col++; } let code = ''; while (this.pos < this.input.length) { if (this.pos + 2 < this.input.length && this.input[this.pos] === '~' && this.input[this.pos + 1] === '~' && this.input[this.pos + 2] === '~') { this.pos += 3; this.col += 3; return { type: TOK.TILDE, value: code.trim(), line: startLine, col: startCol }; } if (this.input[this.pos] === '\n') { this.line++; this.col = 1; } else this.col++; code += this.input[this.pos]; this.pos++; } return { type: TOK.TILDE, value: code.trim(), line: startLine, col: startCol }; }
    tokenize() { const out = []; while (true) { const t = this.nextToken(); out.push(t); if (t.type === TOK.EOF) break; } return out; }
}
function lex(text) { return new Lexer(text).tokenize(); }

// ============================================================
// Parser (simplified for brevity, same as before)
// ============================================================
class Parser {
    constructor(tokens, fileName) { this.tokens = tokens; this.pos = 0; this.file = fileName || '<input>'; this.errors = []; }
    peek(o = 0) { return this.tokens[this.pos + o] || this.tokens[this.tokens.length - 1]; }
    advance() { return this.tokens[this.pos++]; }
    eof() { return this.peek().type === TOK.EOF; }
    error(msg, tok) { const t = tok || this.peek(); throw new Error(`Parse error: ${msg} at ${this.file}:${t.line}:${t.col}`); }
    expect(type, value) { const t = this.peek(); if (t.type !== type || (value !== undefined && t.value !== value)) this.error(`Expected ${value || type}, got '${t.value}'`); return this.advance(); }
    match(type, value) { const t = this.peek(); if (t.type === type && (value === undefined || t.value === value)) { this.advance(); return true; } return false; }
    isType(tok) { return tok && tok.type === TOK.KEYWORD && TYPE_KEYWORDS.has(tok.value); }

    parse() {
        const start = this.peek(); const prog = { type: 'Program', imports: [], functions: [], errorDecls: [], globalVars: [], globalIncludeC: [], allFunctions: [], line: start.line, col: start.col };
        while (this.peek().type === TOK.KEYWORD && this.peek().value === 'use') this.parseImport();
        while (this.peek().type === TOK.KEYWORD && this.peek().value === 'const') { const pos = this.peek(); this.advance(); if (this.isType(this.peek())) prog.globalVars.push(this.parseConstVarDeclAfterConst(pos)); else prog.errorDecls.push(this.parseErrorDeclAfterConst(pos)); }
        while (this.peek().type === TOK.INCLUDE_C) this.parseIncludeC();
        while (!this.eof()) {
            if (this.peek().type === TOK.INCLUDE_C) { this.parseIncludeC(); continue; }
            const isAsync = this.peek().type === TOK.KEYWORD && this.peek().value === 'async';
            if (this.isType(this.peek()) || isAsync) prog.functions.push(this.parseFunction());
            else this.advance();
        }
        return prog;
    }
    parseImport() { while (this.peek().type !== TOK.SEMICOLON && this.peek().type !== TOK.EOF && this.peek().type !== TOK.KEYWORD) this.advance(); if (this.peek().type === TOK.KEYWORD) this.advance(); }
    parseType() { if (this.peek().type === TOK.KEYWORD && this.peek().value === 'T') this.parseUnionType(); if (this.peek().type === TOK.KEYWORD && this.peek().value === 'arr') { this.advance(); if (this.peek().type === TOK.LBRACKET) return this.parseArrayType(); return 'arr[any]'; } if (!this.isType(this.peek())) this.error(`Expected type`); return this.advance().value; }
    parseArrayType() { this.expect(TOK.LBRACKET); let innerType; const t = this.peek(); if (t.type === TOK.KEYWORD) { switch (t.value) { case 'int': case 'string': case 'float': case 'double': case 'bool': case 'char': case 'any': innerType = t.value; this.advance(); break; case 'arr': this.advance(); innerType = this.parseArrayType(); break; default: this.error(`Unknown element type in arr[]: '${t.value}'`); } } else this.error(`Unknown element type in arr[]: '${t.value}'`); this.expect(TOK.RBRACKET); return 'arr[' + innerType + ']'; }
    parseUnionType() { this.advance(); this.expect(TOK.LT); const types = []; for (;;) { types.push(this.parseType()); if (this.match(TOK.COMMA)) continue; break; } this.expect(TOK.GT); if (types.length === 1) return types[0]; return 'T<' + types.join(',') + '>'; }
    parseFunction() {
        const pos = this.peek(); let isAsync = false;
        if (this.peek().type === TOK.KEYWORD && this.peek().value === 'async') { isAsync = true; this.advance(); }
        const returnType = this.parseType(); let isExport = true; if (this.match(TOK.STAR)) isExport = false;
        const nameTok = this.expect(TOK.IDENT); this.expect(TOK.LPAREN);
        const params = [];
        if (this.peek().type !== TOK.RPAREN) { for (;;) { if (!this.isType(this.peek())) this.error(`Expected parameter type`); const ptype = this.parseType(); const pname = this.expect(TOK.IDENT); let def = null; if (this.match(TOK.EQUALS)) def = this.parseExpression(); params.push({ name: pname.value, type: ptype, defaultValue: def, isVariadic: false, line: pname.line, col: pname.col }); if (this.match(TOK.COMMA)) continue; break; } }
        this.expect(TOK.RPAREN); const body = this.parseBlock();
        return { type: 'Function', name: nameTok.value, returnType, params, body, isExport, isAsync, file: this.file, line: nameTok.line, col: nameTok.col };
    }
    parseBlock() { const pos = this.peek(); this.expect(TOK.LBRACE); const statements = []; while (!this.eof() && this.peek().type !== TOK.RBRACE) { const stmt = this.parseStatement(); if (stmt) statements.push(stmt); if (this.peek().type === TOK.SEMICOLON) this.advance(); } this.expect(TOK.RBRACE); return { type: 'Block', statements, line: pos.line, col: pos.col }; }
    parseStatement() {
        const t = this.peek();
        if (t.type === TOK.KEYWORD) {
            switch (t.value) {
                case 'break': this.advance(); if (this.peek().type === TOK.SEMICOLON) this.advance(); return { type: 'BreakStmt', line: t.line, col: t.col };
                case 'continue': this.advance(); if (this.peek().type === TOK.SEMICOLON) this.advance(); return { type: 'ContinueStmt', line: t.line, col: t.col };
                case 'do': return this.parseDoWhile();
                case 'if': return this.parseIf();
                case 'while': return this.parseWhile();
                case 'for': return this.parseForIn();
                case 'return': return this.parseReturn();
                case 'case': return this.parseCase();
                case 'try': return this.parseTry();
                case 'throw': return this.parseThrow();
                case 'Promise': return this.parsePromiseSet();
                case 'await': return this.parseAwaitStmt();
                case 'const': this.advance(); if (this.isType(this.peek())) return this.parseConstVarDeclAfterConst(t); return this.parseErrorDeclAfterConst(t);
                case 'int': case 'string': case 'float': case 'double': case 'bool': case 'char': case 'arr': case 'dict': case 'any': case 'T': return this.parseVarDecl();
                default: this.error(`Unexpected keyword in statement position: '${t.value}'`);
            }
        }
        if (t.type === TOK.INCLUDE_C) return this.parseIncludeC();
        if (t.type === TOK.IDENT) return this.parseAssignmentOrCall();
        if (t.type === TOK.STRING || t.type === TOK.NUMBER || t.type === TOK.LPAREN || t.type === TOK.LBRACE || t.type === TOK.LBRACKET) return this.parseExpression();
        if (t.type === TOK.EOF) return null;
        this.error(`Expected statement, got '${t.value}'`);
    }
    parseDoWhile() { const pos = this.peek(); this.advance(); const body = this.parseBlock(); if (!(this.peek().type === TOK.KEYWORD && this.peek().value === 'while')) this.error(`Expected 'while' after do-block`); this.advance(); this.expect(TOK.LPAREN); const cond = this.parseExpression(); this.expect(TOK.RPAREN); if (this.peek().type === TOK.SEMICOLON) this.advance(); return { type: 'DoWhileStmt', body, condition: cond, line: pos.line, col: pos.col }; }
    parseTry() { const pos = this.peek(); this.advance(); const body = this.parseBlock(); const catches = []; while (this.peek().type === TOK.KEYWORD && this.peek().value === 'catch') { const cpos = this.peek(); this.advance(); let typeName = ''; let varName = ''; if (this.peek().type === TOK.LPAREN) { this.advance(); typeName = this.expect(TOK.IDENT).value; if (this.peek().type === TOK.KEYWORD && this.peek().value === 'as') { this.advance(); varName = this.expect(TOK.IDENT).value; } this.expect(TOK.RPAREN); } const cbody = this.parseBlock(); catches.push({ type: 'CatchClause', typeName, varName, body: cbody, line: cpos.line, col: cpos.col }); } if (catches.length === 0) this.error(`try requires at least one catch clause`); return { type: 'TryStmt', body, catches, line: pos.line, col: pos.col }; }
    parseIncludeC() { const pos = this.peek(); this.advance(); if (this.peek().type !== TOK.TILDE) this.error(`Expected ~~~ after includeC`); this.advance(); return { type: 'IncludeC', code: '', line: pos.line, col: pos.col }; }
    parseIf() { const pos = this.peek(); this.advance(); this.expect(TOK.LPAREN); const cond = this.parseExpression(); this.expect(TOK.RPAREN); const then = this.parseBlock(); const elsifs = []; while (this.peek().type === TOK.KEYWORD && this.peek().value === 'elsif') { const epos = this.peek(); this.advance(); this.expect(TOK.LPAREN); const ec = this.parseExpression(); this.expect(TOK.RPAREN); const et = this.parseBlock(); elsifs.push({ type: 'Elsif', condition: ec, then: et, line: epos.line, col: epos.col }); } let elseBlock = null; if (this.peek().type === TOK.KEYWORD && this.peek().value === 'else') { this.advance(); elseBlock = this.parseBlock(); } return { type: 'IfStmt', condition: cond, then, elsifs, else: elseBlock, line: pos.line, col: pos.col }; }
    parseCase() { const pos = this.peek(); this.advance(); this.expect(TOK.LPAREN); const value = this.parseExpression(); this.expect(TOK.RPAREN); this.expect(TOK.LBRACE); const branches = []; let defaultBlock = null; while (this.peek().type !== TOK.RBRACE && !this.eof()) { const bpos = this.peek(); if (this.peek().type === TOK.IDENT && this.peek().value === '_') { this.advance(); defaultBlock = this.parseBlock(); if (this.peek().type === TOK.COMMA) this.advance(); break; } const patterns = []; if (this.peek().type === TOK.LPAREN) { this.advance(); for (;;) { patterns.push(this.parseExpression()); if (this.match(TOK.COMMA)) continue; break; } this.expect(TOK.RPAREN); } else patterns.push(this.parseExpression()); const body = this.parseBlock(); branches.push({ type: 'CaseBranch', patterns, body, line: bpos.line, col: bpos.col }); if (this.peek().type === TOK.COMMA) this.advance(); else break; } this.expect(TOK.RBRACE); return { type: 'CaseStmt', value, branches, default: defaultBlock, line: pos.line, col: pos.col }; }
    parseWhile() { const pos = this.peek(); this.advance(); this.expect(TOK.LPAREN); const cond = this.parseExpression(); this.expect(TOK.RPAREN); const body = this.parseBlock(); return { type: 'WhileStmt', condition: cond, body, line: pos.line, col: pos.col }; }
    parseForIn() { const pos = this.peek(); this.advance(); this.expect(TOK.LPAREN); if (!this.isType(this.peek())) this.error(`Expected element type in for-in`); const varType = this.parseType(); const varName = this.expect(TOK.IDENT).value; if (!(this.peek().type === TOK.KEYWORD && this.peek().value === 'in')) this.error(`Expected 'in' in for-in`); this.advance(); const iterable = this.parseExpression(); this.expect(TOK.RPAREN); const body = this.parseBlock(); return { type: 'ForInStmt', varType, varName, iterable, body, line: pos.line, col: pos.col }; }
    parseReturn() { const pos = this.peek(); this.advance(); let expr = null; if (this.peek().type !== TOK.RBRACE && this.peek().type !== TOK.SEMICOLON) expr = this.parseExpression(); if (this.peek().type === TOK.SEMICOLON) this.advance(); return { type: 'ReturnStmt', expr, line: pos.line, col: pos.col }; }
    parsePromiseSet() { const pos = this.peek(); this.advance(); this.expect(TOK.LBRACKET); const value = this.parseExpression(); this.expect(TOK.RBRACKET); if (this.peek().type === TOK.SEMICOLON) this.advance(); return { type: 'PromiseSet', value, line: pos.line, col: pos.col }; }
    parseAwaitStmt() { const pos = this.peek(); this.advance(); const expr = this.parseUnary(); if (this.peek().type === TOK.SEMICOLON) this.advance(); return { type: 'AwaitExpr', expr, line: pos.line, col: pos.col }; }
    parseVarDecl() {
        const pos = this.peek();
        if (this.peek().value === 'arr') {
            const fullType = this.parseType(); const elemType = fullType === 'arr' ? 'any' : fullType.slice(4, -1);
            const nameTok = this.expect(TOK.IDENT); let expr = null;
            if (this.peek().type === TOK.EQUALS) { this.advance(); expr = this.parseExpression(); }
            if (this.peek().type === TOK.SEMICOLON) this.advance();
            return { type: 'VarDecl', name: nameTok.value, type: 'arr', elemType, expr, isArray: true, isConst: false, isExport: false, line: pos.line, col: pos.col };
        }
        const varType = this.parseType(); const nameTok = this.expect(TOK.IDENT); let expr = null;
        if (this.peek().type === TOK.EQUALS) { this.advance(); expr = this.parseExpression(); }
        if (this.peek().type === TOK.SEMICOLON) this.advance();
        return { type: 'VarDecl', name: nameTok.value, type: varType, expr, isArray: false, isConst: false, isExport: false, line: pos.line, col: pos.col };
    }
    parseConstVarDeclAfterConst(pos) { const varType = this.parseType(); let isExport = true; if (this.peek().type === TOK.STAR) { isExport = false; this.advance(); } const nameTok = this.expect(TOK.IDENT); this.expect(TOK.EQUALS); const expr = this.parseExpression(); if (this.peek().type === TOK.SEMICOLON) this.advance(); return { type: 'VarDecl', name: nameTok.value, type: varType, expr, isArray: false, isConst: true, isExport, line: pos.line, col: pos.col }; }
    parseAssignmentOrCall() {
        const pos = this.peek(); const name = this.advance().value;
        if (this.peek().type === TOK.PLUSPLUS || this.peek().type === TOK.MINUSMINUS) { const op = this.advance().value; if (this.peek().type === TOK.SEMICOLON) this.advance(); return { type: 'PostfixExpr', varName: name, op, line: pos.line, col: pos.col }; }
        if (this.peek().type === TOK.DOT) { this.advance(); const methodName = this.expect(TOK.IDENT).value; if (this.peek().type === TOK.LPAREN) return this.parseCall(name, methodName, pos); if (this.peek().type === TOK.EQUALS || this.peek().type === TOK.PLUSEQ || this.peek().type === TOK.MINUSEQ || this.peek().type === TOK.STAREQ || this.peek().type === TOK.SLASHEQ || this.peek().type === TOK.PERCENTEQ || this.peek().type === TOK.POWEQ) { const op = this.advance().value; const expr = this.parseExpression(); if (this.peek().type === TOK.SEMICOLON) this.advance(); return { type: 'Assign', name, field: methodName, index: null, expr, op, line: pos.line, col: pos.col }; } return { type: 'FieldAccess', object: name, field: methodName, line: pos.line, col: pos.col }; }
        if (this.peek().type === TOK.LPAREN) return this.parseCall(name, null, pos);
        if (this.peek().type === TOK.LBRACKET) { this.advance(); const index = this.parseExpression(); this.expect(TOK.RBRACKET); const op = this.peekAssignmentOp(); if (!op) this.error(`Expected assignment operator after array index`); this.advance(); const value = this.parseExpression(); if (this.peek().type === TOK.SEMICOLON) this.advance(); return { type: 'Assign', name, field: '', index, expr: value, op, line: pos.line, col: pos.col }; }
        const op = this.peekAssignmentOp();
        if (op) { this.advance(); const expr = this.parseExpression(); if (this.peek().type === TOK.SEMICOLON) this.advance(); return { type: 'Assign', name, field: '', index: null, expr, op, line: pos.line, col: pos.col }; }
        if (this.peek().type === TOK.SEMICOLON) this.advance();
        return { type: 'Ident', name, line: pos.line, col: pos.col };
    }
    peekAssignmentOp() { switch (this.peek().type) { case TOK.EQUALS: return '='; case TOK.PLUSEQ: return '+='; case TOK.MINUSEQ: return '-='; case TOK.STAREQ: return '*='; case TOK.SLASHEQ: return '/='; case TOK.PERCENTEQ: return '%='; case TOK.POWEQ: return '**='; } return null; }
    parseCall(receiver, methodName, pos) { let fullName; let receiverNode = null; if (methodName !== null) { fullName = `${receiver}.${methodName}`; receiverNode = { type: 'Ident', name: receiver, line: pos.line, col: pos.col }; } else fullName = receiver; this.expect(TOK.LPAREN); const args = []; if (this.peek().type !== TOK.RPAREN) { for (;;) { args.push(this.parseExpression()); if (this.match(TOK.COMMA)) continue; break; } } this.expect(TOK.RPAREN); return { type: 'CallExpr', name: fullName, args, receiver: methodName !== null ? receiver : '', receiverNode, line: pos.line, col: pos.col }; }
    parseExpression() { const cond = this.parseBinary(0); if (cond === null) return null; if (cond.type === 'RangeExpr' && this.peek().type === TOK.DOT) { this.advance(); const methodName = this.expect(TOK.IDENT).value; this.expect(TOK.LPAREN); const extra = []; if (this.peek().type !== TOK.RPAREN) { for (;;) { extra.push(this.parseExpression()); if (this.match(TOK.COMMA)) continue; break; } } this.expect(TOK.RPAREN); return { type: 'CallRangeExpr', name: methodName, range: cond, extra, line: cond.line, col: cond.col }; } if (this.peek().type === TOK.QUESTION) { this.advance(); const thenExpr = this.parseExpression(); this.expect(TOK.COLON); const elseExpr = this.parseExpression(); return { type: 'TernaryExpr', condition: cond, then: thenExpr, else: elseExpr, line: cond.line, col: cond.col }; } return cond; }
    parseUnary() { const pos = this.peek(); if (this.peek().type === TOK.DOLLAR) { this.advance(); const expr = this.parseUnary(); return { type: 'UnaryExpr', op: '$', expr, line: pos.line, col: pos.col }; } if (this.peek().type === TOK.NOT) { this.advance(); const expr = this.parseUnary(); return { type: 'UnaryExpr', op: '!', expr, line: pos.line, col: pos.col }; } if (this.peek().type === TOK.MINUS) { this.advance(); const expr = this.parseUnary(); return { type: 'UnaryExpr', op: '-', expr, line: pos.line, col: pos.col }; } let expr = this.parsePrimary(); if (expr === null) return null; expr = this.parsePostfix(expr); if (this.peek().type === TOK.CARET) return this.parseFormatSuffix(expr); return expr; }
    parseFormatSuffix(expr) { if (this.peek().type !== TOK.CARET) return expr; const pos = this.peek(); this.advance(); if (this.peek().type === TOK.NUMBER) { const val = this.advance().value; const n = parseInt(val.slice(0, -1), 10); return { type: 'FormatExpr', expr, mode: 'Nf', N: n, trimSet: '', line: pos.line, col: pos.col }; } if (this.peek().type === TOK.IDENT && this.peek().value.startsWith('X')) { let val = this.advance().value.slice(1); return { type: 'FormatExpr', expr, mode: 'X', N: 0, trimSet: val, line: pos.line, col: pos.col }; } this.error(`Expected 'Nf' or 'X...' after '^'`); }
    parseBinary(prec) { let left = this.parseUnary(); if (left === null) return null; for (;;) { const t = this.peek(); let nextPrec = -1; switch (t.type) { case TOK.DOTDOT: nextPrec = 6; break; case TOK.POW: nextPrec = 5; break; case TOK.STAR: case TOK.SLASH: case TOK.PERCENT: nextPrec = 4; break; case TOK.PLUS: case TOK.MINUS: nextPrec = 3; break; case TOK.LT: case TOK.GT: case TOK.EQUALS: case TOK.NEQ: case TOK.EQEQ: case TOK.LTE: case TOK.GTE: nextPrec = 2; break; case TOK.AND: nextPrec = 1; break; case TOK.OR: nextPrec = 0; break; default: return left; } if (nextPrec < prec) break; const opTok = this.advance(); const nextMin = nextPrec === 5 ? nextPrec : nextPrec + 1; const right = this.parseBinary(nextMin); if (right === null) break; if (opTok.value === '..') left = { type: 'RangeExpr', start: left, end: right, line: opTok.line, col: opTok.col }; else { let op = opTok.value; if (opTok.type === TOK.EQUALS) op = '=='; left = { type: 'BinaryExpr', left, op, right, line: opTok.line, col: opTok.col }; } } return left; }
    parsePrimary() {
        const t = this.peek();
        if (t.type === TOK.NUMBER) { this.advance(); return { type: 'Number', value: t.value, line: t.line, col: t.col }; }
        if (t.type === TOK.UNICODE_LIT) { this.advance(); const cp = parseInt(t.value, 16); return { type: 'UnicodeLiteral', codepoint: cp, line: t.line, col: t.col }; }
        if (t.type === TOK.LBRACE) { this.advance(); const elements = []; if (this.peek().type !== TOK.RBRACE) { for (;;) { const kt = this.peek(); if (kt.type !== TOK.IDENT) this.error(`Expected key in dict literal`); const key = this.advance().value; this.expect(TOK.COLON); const value = this.parseExpression(); elements.push({ type: 'DictElement', key, value, line: kt.line, col: kt.col }); if (this.match(TOK.COMMA)) continue; break; } } this.expect(TOK.RBRACE); return { type: 'DictLiteral', elements, line: t.line, col: t.col }; }
        if (t.type === TOK.STRING) { this.advance(); return { type: 'String', value: t.value, line: t.line, col: t.col }; }
        if (t.type === TOK.CHARLIT) { this.advance(); return { type: 'CharLiteral', value: t.value.charCodeAt(0) || 0, line: t.line, col: t.col }; }
        if (t.type === TOK.IDENT) { this.advance(); if (this.peek().type === TOK.PLUSPLUS || this.peek().type === TOK.MINUSMINUS) { const op = this.advance().value; return { type: 'PostfixExpr', varName: t.value, op, line: t.line, col: t.col }; } if (this.peek().type === TOK.LBRACE) return this.parseErrorInstance(t.value, t); if (this.peek().type === TOK.LPAREN) return this.parseCall(t.value, null, t); return { type: 'Ident', name: t.value, line: t.line, col: t.col }; }
        if (t.type === TOK.KEYWORD) { if (t.value === 'null') { this.advance(); return { type: 'NullLiteral', line: t.line, col: t.col }; } if (t.value === 'true' || t.value === 'false') { this.advance(); return { type: 'Ident', name: t.value, line: t.line, col: t.col }; } if (t.value === 'const') { this.advance(); return this.parsePrimary(); } if (t.value === 'type') return this.parseTypeOf(); if (t.value === 'Error') { this.advance(); if (this.peek().type !== TOK.LBRACE) this.error(`Expected '{' after 'Error'`); return this.parseErrorInstance('Error', t); } if (t.value === 'Promise') { this.advance(); this.expect(TOK.LBRACKET); const value = this.parseExpression(); this.expect(TOK.RBRACKET); return { type: 'PromiseSet', value, line: t.line, col: t.col }; } if (t.value === 'await') { this.advance(); const expr = this.parseUnary(); return { type: 'AwaitExpr', expr, line: t.line, col: t.col }; } this.error(`Unexpected keyword in expression: '${t.value}'`); }
        if (t.type === TOK.LPAREN) { this.advance(); const first = this.parseExpression(); if (this.peek().type === TOK.COMMA) { const items = [first]; while (this.match(TOK.COMMA)) items.push(this.parseExpression()); this.expect(TOK.RPAREN); return { type: 'ArrayLiteral', elements: items, line: t.line, col: t.col }; } this.expect(TOK.RPAREN); return first; }
        if (t.type === TOK.LBRACKET) { this.advance(); const elements = []; if (this.peek().type !== TOK.RBRACKET) { for (;;) { elements.push(this.parseExpression()); if (this.match(TOK.COMMA)) continue; break; } } this.expect(TOK.RBRACKET); return { type: 'ArrayLiteral', elements, line: t.line, col: t.col }; }
        if (t.type === TOK.EOF) this.error(`Unexpected end of file`);
        this.error(`Unexpected token in expression: '${t.value}'`);
    }
    parsePostfix(expr) { for (;;) { if (this.peek().type === TOK.LBRACKET) { this.advance(); const idx = this.parseExpression(); this.expect(TOK.RBRACKET); if (expr.type !== 'Ident') this.error(`Array indexing is only supported on identifiers`); expr = { type: 'ArrayIndex', name: expr.name, index: idx, line: expr.line, col: expr.col }; continue; } if (this.peek().type !== TOK.DOT) return expr; this.advance(); if (this.peek().type === TOK.IDENT && this.peek().value === 'length') { this.advance(); if (expr.type !== 'Ident') this.error(`.length is only supported on identifiers`); expr = { type: 'ArrayLength', name: expr.name, line: expr.line, col: expr.col }; continue; } if (this.peek().type === TOK.IDENT) { const methodName = this.advance().value; const mpos = this.peek(); if (this.peek().type === TOK.LPAREN) { this.advance(); const callArgs = []; if (this.peek().type !== TOK.RPAREN) { for (;;) { callArgs.push(this.parseExpression()); if (this.match(TOK.COMMA)) continue; break; } } this.expect(TOK.RPAREN); let recvName = ''; if (expr.type === 'Ident') recvName = expr.name; expr = { type: 'CallExpr', name: methodName, args: callArgs, receiver: recvName, receiverNode: expr, line: expr.line, col: expr.col }; continue; } if (expr.type === 'Ident') { expr = { type: 'FieldAccess', object: expr.name, field: methodName, line: expr.line, col: expr.col }; continue; } this.error(`Field access is only supported on identifiers`, mpos); } this.error(`Expected field or method name after '.'`); } }
    parseErrorDeclAfterConst(pos) { const nameTok = this.expect(TOK.IDENT); if (!/^[A-Z]/.test(nameTok.value)) this.error(`Error type name must start with uppercase letter`); this.expect(TOK.LBRACE); const fields = []; if (this.peek().type !== TOK.RBRACE) { for (;;) { const fpos = this.peek(); const fname = this.expect(TOK.IDENT).value; this.expect(TOK.COLON); if (!this.isType(this.peek())) this.error(`Expected field type`); const ftype = this.advance().value; let def = null; if (this.peek().type === TOK.LBRACKET) { this.advance(); def = this.parseExpression(); this.expect(TOK.RBRACKET); } fields.push({ name: fname, type: ftype, defaultValue: def, line: fpos.line, col: fpos.col }); if (this.match(TOK.COMMA)) continue; break; } } this.expect(TOK.RBRACE); this.expect(TOK.EQUALS); let isNew = false; if (this.peek().type === TOK.KEYWORD && this.peek().value === 'new') { isNew = true; this.advance(); } const parentTok = this.peek(); if (parentTok.type !== TOK.IDENT && !(parentTok.type === TOK.KEYWORD && parentTok.value === 'Error')) this.error(`Expected parent error type`); const parent = this.advance().value; return { type: 'ErrorDecl', name: nameTok.value, fields, parent, isNew, line: pos.line, col: pos.col }; }
    parseErrorInstance(typeName, pos) { this.expect(TOK.LBRACE); const fields = {}; if (this.peek().type !== TOK.RBRACE) { for (;;) { const fname = this.expect(TOK.IDENT).value; this.expect(TOK.COLON); const value = this.parseExpression(); fields[fname] = value; if (this.match(TOK.COMMA)) continue; break; } } this.expect(TOK.RBRACE); return { type: 'ErrorInstance', typeName, fields, line: pos.line, col: pos.col }; }
    parseThrow() { const pos = this.peek(); this.advance(); if (this.peek().type === TOK.SEMICOLON || this.peek().type === TOK.RBRACE || this.peek().type === TOK.EOF) this.error(`throw requires an expression`); const expr = this.parseExpression(); if (this.peek().type === TOK.SEMICOLON) this.advance(); return { type: 'ThrowStmt', expr, line: pos.line, col: pos.col }; }
}

// ============================================================
// Interpreter
// ============================================================
class Scope {
    constructor(parent) { this.parent = parent; this.symbols = new Map(); }
    define(name, info) { this.symbols.set(name, info); return info; }
    resolve(name) { if (this.symbols.has(name)) return this.symbols.get(name); if (this.parent) return this.parent.resolve(name); return null; }
}
const SYM_VARIABLE = 'variable';
const SYM_CONST = 'const';

class Interpreter {
    constructor(program, mainFile, opts) {
        this.program = program; this.mainFile = mainFile; this.opts = opts || {};
        this.globalScope = new Scope(null);
        this.errorTypes = new Map();
        this.functions = new Map();
        this.outputHandler = this.opts.onOutput || (() => {});
        this.exitHandler = this.opts.onExit || (() => {});
        this.frames = [];
        this.currentPromise = null;
    }

    prepare() {
        this.errorTypes.set('Error', { name: 'Error', fields: [{ name: 'msg', type: 'string', defaultValue: null }], parent: '', isNew: false });
        for (const d of this.program.errorDecls) this.errorTypes.set(d.name, d);
        for (const g of this.program.globalVars) this.globalScope.define(g.name, { kind: SYM_CONST, type: g.type, value: this.evalGlobalLiteral(g.expr) });
        for (const fn of this.program.functions) this.functions.set(fn.name, fn);
        const builtins = ['to_int','to_float','to_double','to_string','to_bool','to_arr','detruncate','type','isAsyncEnded','getConfig','getConfigField'];
        for (const b of builtins) if (!this.functions.has(b)) this.functions.set(b, { name: b, builtin: true, returnType: this.builtinReturnType(b) });
    }

    builtinReturnType(name) { switch (name) { case 'to_int': return 'int'; case 'to_float': return 'float'; case 'to_double': return 'double'; case 'to_string': return 'string'; case 'to_bool': return 'bool'; case 'to_arr': return 'arr[any]'; case 'detruncate': return 'string'; case 'type': return 'string'; case 'isAsyncEnded': return 'bool'; case 'getConfig': return 'dict'; case 'getConfigField': return 'any'; } return 'int'; }
    evalGlobalLiteral(expr) { if (!expr) return null; switch (expr.type) { case 'Number': { const v = expr.value; if (/f$/i.test(v)) return makeFloat(parseFloat(v.slice(0, -1))); if (v.includes('.')) return makeDouble(parseFloat(v)); return makeInt(parseInt(v, 10)); } case 'String': return makeString(expr.value); case 'CharLiteral': return makeChar(expr.value); case 'UnicodeLiteral': return makeChar(expr.codepoint); case 'NullLiteral': return null; case 'Ident': return expr.name === 'true' ? makeBool(true) : expr.name === 'false' ? makeBool(false) : null; case 'ArrayLiteral': return makeArr(expr.elements.map(e => this.evalGlobalLiteral(e))); case 'DictLiteral': { const d = new Map(); for (const el of expr.elements) d.set(el.key, this.evalGlobalLiteral(el.value)); return makeDict(d); } } return null; }

    // ============ MAIN LOOP ============
    async run() {
        this.prepare();
        const mainFn = this.functions.get('main');
        if (!mainFn) { this.outputHandler('error', 'No main() function found\n'); this.exitHandler(1); return; }
        const scope = new Scope(this.globalScope);
        const frame = { function: mainFn, scope, locals: new Map(), line: mainFn.line, col: mainFn.col, cfile: this.mainFile, promise: null };
        if (mainFn.params.length === 1) { const argArr = makeArr(process.argv.slice(2).map(a => makeString(a))); scope.define(mainFn.params[0].name, { kind: SYM_VARIABLE, type: 'arr[any]', value: argArr }); frame.locals.set(mainFn.params[0].name, argArr); }
        this.frames = [frame];
        try { await this.executeBlock(mainFn.body, frame); }
        catch (e) {
            if (e.__sk_throw) { this.outputHandler('stderr', `Panicked with error (${e.error.__type}) at ${e.file}:${e.line}:${e.col}\n`); this.exitHandler(1); return; }
            if (e.__sk_return) { /* ok */ }
            else { this.outputHandler('stderr', `Runtime error: ${e.message}\n${e.stack || ''}\n`); this.exitHandler(1); return; }
        }
        this.exitHandler(0);
    }

    async checkBreakpoints(line, col, label) {
        if (this.opts.onBreakpoint && this.opts.onBreakpoint(line)) {
            const frame = this.frames[this.frames.length - 1];
            frame.line = line; frame.col = col;
            this.outputHandler('stdout', `[STEP] ${label}\n`);
            this.opts.onPause({ reason: 'breakpoint', frame, line, file: frame.cfile });
            await new Promise(resolve => { this._resumeResolve = resolve; });
        }
    }

    async executeBlock(block, frame) {
        if (!block) return;
        for (const stmt of block.statements) {
            if (this.currentPromise && this.currentPromise.done) return;
            await this.executeStatement(stmt, frame);
        }
    }

    async executeStatement(stmt, frame) {
        if (!stmt) return;
        // Сначала останавливаемся на самой строке
        await this.checkBreakpoints(stmt.line, stmt.col, `statement line ${stmt.line}`);
        frame.line = stmt.line; frame.col = stmt.col;

        // А теперь проверяем ВНУТРЕННИЕ узлы (для Step In)
        if (debugState.stepMode === 'stepIn') {
            if (stmt.expr) {
                // Проходим по каждому подвыражению в stmt.expr (глубоко)
                await this.walkExpr(stmt.expr, frame);
            }
        }

        switch (stmt.type) {
            case 'VarDecl': return this.execVarDecl(stmt, frame);
            case 'Assign': return this.execAssign(stmt, frame);
            case 'PostfixExpr': return this.execPostfixStmt(stmt, frame);
            case 'BreakStmt': throw { __sk_break: true };
            case 'ContinueStmt': throw { __sk_continue: true };
            case 'ReturnStmt': return this.execReturn(stmt, frame);
            case 'IfStmt': return this.execIf(stmt, frame);
            case 'WhileStmt': return this.execWhile(stmt, frame);
            case 'ForInStmt': return this.execForIn(stmt, frame);
            case 'TryStmt': return this.execTry(stmt, frame);
            case 'ThrowStmt': return this.execThrow(stmt, frame);
            case 'IncludeC': return;
            case 'CallExpr': return this.execCallStmt(stmt, frame);
            case 'Ident': return this.evalIdent(stmt, frame);
            default: return this.evaluate(stmt, frame);
        }
    }

    // Рекурсивный проход по дереву выражения (для пошагового F11)
    async walkExpr(expr, frame) {
        if (!expr) return;
        // Сначала останавливаемся на литерале/узле
        await this.checkBreakpoints(expr.line, expr.col, `literal ${expr.value || expr.name || expr.type}`);
        if (expr.left) await this.walkExpr(expr.left, frame);
        if (expr.right) await this.walkExpr(expr.right, frame);
        if (expr.expr) await this.walkExpr(expr.expr, frame);
        if (expr.elements) for (const e of expr.elements) await this.walkExpr(e, frame);
    }

    execVarDecl(stmt, frame) {
        if (stmt.isArray) {
            let arrVal = stmt.expr ? this.evaluate(stmt.expr, frame) : makeArr([]);
            if (!arrVal || arrVal.__sk !== SK.ARR) arrVal = makeArr([]);
            const info = { kind: SYM_VARIABLE, type: 'arr[' + (stmt.elemType || 'any') + ']', value: arrVal, isArray: true, elemType: stmt.elemType || 'any', isConst: stmt.isConst };
            frame.scope.define(stmt.name, info); frame.locals.set(stmt.name, arrVal); return;
        }
        let val = null;
        if (stmt.expr) {
            val = this.evaluate(stmt.expr, frame);
            const valType = this.valueSkType(val);
            if (stmt.type !== 'any' && valType !== stmt.type && valType !== 'void') {
                const isNumeric = (t) => t === 'int' || t === 'float' || t === 'double';
                if (!(isNumeric(stmt.type) && isNumeric(valType))) {
                    const errMsg = `Type mismatch: cannot assign '${valType}' to '${stmt.type}'`;
                    this.outputHandler('stderr', `Runtime Error: ${errMsg}\n`);
                    throw { __sk_throw: true, error: this.makeError('Error', { msg: makeString(errMsg) }), file: frame.cfile, line: stmt.line, col: stmt.col };
                }
            }
            val = this.coerceTo(val, stmt.type, stmt, frame);
        } else { val = nullOf(stmt.type); }
        const info = { kind: SYM_VARIABLE, type: stmt.type, value: val, isConst: stmt.isConst };
        frame.scope.define(stmt.name, info); frame.locals.set(stmt.name, val);
    }

    coerceTo(val, targetType, node, frame) { if (val === null || val === undefined) return nullOf(targetType); if (targetType === 'any') return this.toAny(val); if (targetType === 'int' && val.__sk === SK.INT) return val; if (targetType === 'float' && val.__sk === SK.FLOAT) return val; if (targetType === 'double' && val.__sk === SK.DOUBLE) return val; if (targetType === 'bool' && val.__sk === SK.BOOL) return val; if (targetType === 'string' && val.__sk === SK.STRING) return val; if (targetType === 'char' && val.__sk === SK.CHAR) return val; if (targetType === 'arr' || targetType.startsWith('arr[')) { if (val.__sk === SK.ARR) return val; return makeArr([]); } if (targetType === 'dict' && val.__sk === SK.DICT) return val; return val; }
    toAny(v) { if (!v) return makeAny(null); if (v.__sk_any) return v; if (v.__sk === SK.INT) return { __sk_any: true, type: 0, prec: -1, data: v.value }; if (v.__sk === SK.FLOAT) return { __sk_any: true, type: 2, prec: v.prec, data: v.value }; if (v.__sk === SK.DOUBLE) return { __sk_any: true, type: 3, prec: v.prec, data: v.value }; if (v.__sk === SK.BOOL) return { __sk_any: true, type: 4, prec: -1, data: v.value }; if (v.__sk === SK.STRING) return { __sk_any: true, type: 1, prec: -1, data: v.value }; if (v.__sk === SK.ARR) return { __sk_any: true, type: 5, prec: -1, data: v.value }; if (v.__sk === SK.DICT) return { __sk_any: true, type: 8, prec: -1, data: v.value }; if (v.__sk === SK.CHAR) return { __sk_any: true, type: 7, prec: -1, data: v.value }; return makeAny(null); }

    execAssign(stmt, frame) {
        const info = frame.scope.resolve(stmt.name); if (!info) return;
        if (stmt.op && stmt.op !== '=') { const right = this.evaluate(stmt.expr, frame); info.value = this.applyCompoundOp(stmt.op, info.value, right); frame.locals.set(stmt.name, info.value); return; }
        const val = this.evaluate(stmt.expr, frame);
        if (info.type === 'any') info.value = this.toAny(val); else info.value = this.coerceTo(val, info.type, stmt, frame);
        frame.locals.set(stmt.name, info.value);
    }
    applyCompoundOp(op, cur, right) { return this.binaryOpOnValues(op.replace(/=$/, ''), cur, right); }
    binaryOpOnValues(op, a, b) { const at = this.valueSkType(a); const bt = this.valueSkType(b); let rt = 'int'; if (at === 'double' || bt === 'double') rt = 'double'; else if (at === 'float' || bt === 'float') rt = 'float'; const av = this.toNumber(a); const bv = this.toNumber(b); let res; switch (op) { case '+': res = av + bv; break; case '-': res = av - bv; break; case '*': res = av * bv; break; case '/': res = bv === 0 ? null : (rt === 'int' ? Math.trunc(av / bv) : av / bv); break; case '%': res = bv === 0 ? null : (av % bv); break; case '**': res = Math.pow(av, bv); break; default: return a; } if (res === null) return nullOf(rt); if (rt === 'int') return makeInt(res); if (rt === 'float') return makeFloat(res); return makeDouble(res); }
    execPostfixStmt(stmt, frame) { const info = frame.scope.resolve(stmt.varName); if (!info) return; const cur = this.toNumber(info.value); info.value = makeInt(stmt.op === '++' ? cur + 1 : cur - 1); frame.locals.set(stmt.varName, info.value); }
    execReturn(stmt, frame) { throw { __sk_return: true, value: stmt.expr ? this.evaluate(stmt.expr, frame) : null }; }
    execIf(stmt, frame) { if (this.isTruthy(this.evaluate(stmt.condition, frame))) return this.executeBlock(stmt.then, frame); if (stmt.else) return this.executeBlock(stmt.else, frame); }
    isTruthy(v) { if (!v) return false; if (v.__sk_any) { if (v.type === 6) return false; if (v.type === 4) return !!v.data; if (v.type === 0) return v.data !== 0; if (v.type === 3 || v.type === 2) return v.data !== 0; if (v.type === 1) return v.data && v.data.length > 0; return true; } if (v.__sk === SK.BOOL) return !!v.value; if (v.__sk === SK.INT) return v.value !== 0; if (v.__sk === SK.FLOAT || v.__sk === SK.DOUBLE) return v.value !== 0; if (v.__sk === SK.STRING) return v.value && v.value.length > 0; return true; }
    async execWhile(stmt, frame) { while (true) { if (this.currentPromise && this.currentPromise.done) return; if (!this.isTruthy(this.evaluate(stmt.condition, frame))) break; try { await this.executeBlock(stmt.body, frame); } catch (e) { if (e.__sk_break) break; if (e.__sk_continue) continue; throw e; } } }
    async execForIn(stmt, frame) { const iter = this.evaluate(stmt.iterable, frame); let items = []; if (iter && iter.__sk === SK.ARR) items = iter.value.slice(); else if (iter && iter.__sk === SK.STRING) items = Array.from(iter.value).map(c => makeString(c)); for (const el of items) { const info = { kind: SYM_VARIABLE, type: stmt.varType, value: el }; frame.scope.define(stmt.varName, info); frame.locals.set(stmt.varName, el); try { await this.executeBlock(stmt.body, frame); } catch (e) { if (e.__sk_break) break; if (e.__sk_continue) continue; throw e; } } }
    async execTry(stmt, frame) { try { await this.executeBlock(stmt.body, frame); } catch (e) { if (!e.__sk_throw) throw e; for (const clause of stmt.catches) { if (clause.varName) { frame.scope.define(clause.varName, { kind: SYM_VARIABLE, type: clause.typeName || 'Error', value: e.error }); frame.locals.set(clause.varName, e.error); } await this.executeBlock(clause.body, frame); return; } throw e; } }
    execThrow(stmt, frame) { throw { __sk_throw: true, error: this.makeError('Error', { msg: makeString('throw') }), file: frame.cfile, line: stmt.line, col: stmt.col }; }
    makeError(typeName, fields) { const err = { __is_sk_error: true, __type: typeName, __decl: typeName, __fields: {} }; for (const [k, v] of Object.entries(fields)) err[k] = v; return err; }

    async execCallStmt(stmt, frame) {
        const fnName = stmt.name.includes('.') ? stmt.name.split('.').pop() : stmt.name;
        const fn = this.functions.get(fnName); if (!fn) return;
        this.callFunction(fnName, stmt.args, frame, stmt);
    }

    callFunction(name, argNodes, callerFrame, callNode) {
        const fn = this.functions.get(name); if (!fn) return null;
        const argVals = argNodes.map(a => this.evaluate(a, callerFrame));
        const newScope = new Scope(this.globalScope); const newFrame = { function: fn, scope: newScope, locals: new Map(), line: fn.line, col: fn.col, cfile: this.mainFile, promise: null };
        for (let i = 0; i < fn.params.length; i++) { const p = fn.params[i]; const val = i < argVals.length ? argVals[i] : null; const coerced = this.coerceTo(val, p.type, callNode, newFrame); newScope.define(p.name, { kind: SYM_VARIABLE, type: p.type, value: coerced }); newFrame.locals.set(p.name, coerced); }
        this.frames.push(newFrame); let result = null;
        try { this.executeBlockSync(fn.body, newFrame); } catch (e) { if (e.__sk_return) { if (fn.returnType !== 'void') result = this.coerceTo(e.value, fn.returnType, callNode, newFrame); } else { this.frames.pop(); throw e; } } finally { this.frames.pop(); }
        return result || nullOf(fn.returnType);
    }
    executeBlockSync(block, frame) { if (!block) return; for (const stmt of block.statements) this.executeStatementSync(stmt, frame); }
    executeStatementSync(stmt, frame) { if (!stmt) return; switch (stmt.type) { case 'VarDecl': return this.execVarDecl(stmt, frame); case 'ReturnStmt': return this.execReturn(stmt, frame); case 'IfStmt': if (this.isTruthy(this.evaluate(stmt.condition, frame))) return this.executeBlockSync(stmt.then, frame); if (stmt.else) return this.executeBlockSync(stmt.else, frame); return; default: return this.evaluate(stmt, frame); } }

    evaluate(expr, frame) {
        if (expr === null || expr === undefined) return null;
        switch (expr.type) {
            case 'Number': { const v = expr.value; if (/f$/i.test(v)) return makeFloat(parseFloat(v.slice(0, -1))); if (v.includes('.')) return makeDouble(parseFloat(v)); return makeInt(parseInt(v, 10)); }
            case 'String': return makeString(expr.value); case 'CharLiteral': return makeChar(expr.value); case 'UnicodeLiteral': return makeChar(expr.codepoint); case 'NullLiteral': return null;
            case 'Ident': return this.evalIdent(expr, frame);
            case 'ArrayLiteral': return makeArr(expr.elements.map(e => this.evaluate(e, frame)));
            case 'DictLiteral': { const d = new Map(); for (const el of expr.elements) d.set(el.key, this.toAny(this.evaluate(el.value, frame))); return makeDict(d); }
            case 'BinaryExpr': return this.evalBinary(expr, frame); case 'UnaryExpr': return this.evalUnary(expr, frame); case 'TernaryExpr': return this.evalTernary(expr, frame);
            case 'FieldAccess': return this.evalFieldAccess(expr, frame); case 'ArrayIndex': return this.evalArrayIndex(expr, frame); case 'ArrayLength': return this.evalArrayLength(expr, frame);
            case 'CallExpr': return this.evalCallExpr(expr, frame);
            default: return null;
        }
    }
    evalIdent(expr, frame) { if (expr.name === 'true') return makeBool(true); if (expr.name === 'false') return makeBool(false); if (expr.name === 'null') return null; const info = frame.scope.resolve(expr.name); if (info) return info.value; const g = this.globalScope.resolve(expr.name); if (g) return g.value; return null; }
    evalBinary(expr, frame) { const l = this.evaluate(expr.left, frame); const op = expr.op; if (op === '&&' || op === '||') { const lt = this.toBool(l); if (op === '&&' && !lt) return makeBool(false); if (op === '||' && lt) return makeBool(true); const r = this.evaluate(expr.right, frame); return makeBool(this.toBool(r)); } const r = this.evaluate(expr.right, frame); return this.binaryOp(op, l, r); }
    binaryOp(op, l, r) { if ((l && l.__sk_any) || (r && r.__sk_any)) return this.anyBinaryOp(op, this.toAny(l), this.toAny(r)); if (isNull(l) || isNull(r)) { if (op === '==' || op === '!=') { const eq = isNull(l) && isNull(r); return makeBool(op === '==' ? eq : !eq); } return nullOf('bool'); } const lt = this.valueSkType(l); const rt = this.valueSkType(r); if (op === '+' && ((lt === 'string' || lt === 'char') && (rt === 'string' || rt === 'char'))) return this.charAwareConcat(l, r, lt, rt); if (op === '==' || op === '!=' || op === '<' || op === '>' || op === '<=' || op === '>=') return this.compareOp(op, l, r, lt, rt); return this.binaryOpOnValues(op, l, r); }
    anyBinaryOp(op, a, b) { if (a.type === 6 || b.type === 6) { if (op === '==') return makeBool(a.type === 6 && b.type === 6); if (op === '!=') return makeBool(!(a.type === 6 && b.type === 6)); return null; } if (op === '+' && (a.type === 1 || b.type === 1)) { const as = this.anyToString(a); const bs = this.anyToString(b); return { __sk_any: true, type: 1, prec: -1, data: as.value + bs.value }; } const an = this.anyToNumber(a); const bn = this.anyToNumber(b); let rt = 'int'; if (a.type === 3 || b.type === 3) rt = 'double'; else if (a.type === 2 || b.type === 2) rt = 'float'; const wrap = (v) => { if (rt === 'int') return { __sk_any: true, type: 0, prec: -1, data: v | 0 }; if (rt === 'float') return { __sk_any: true, type: 2, prec: -1, data: v }; return { __sk_any: true, type: 3, prec: -1, data: v }; }; if (['==', '!=', '<', '>', '<=', '>='].includes(op)) { let res; switch (op) { case '==': res = an === bn; break; case '!=': res = an !== bn; break; case '<': res = an < bn; break; case '>': res = an > bn; break; case '<=': res = an <= bn; break; case '>=': res = an >= bn; break; } return makeBool(res); } switch (op) { case '+': return wrap(an + bn); case '-': return wrap(an - bn); case '*': return wrap(an * bn); case '/': return bn === 0 ? makeAny(null) : wrap(rt === 'int' ? Math.trunc(an / bn) : an / bn); case '%': return bn === 0 ? makeAny(null) : wrap(an % bn); case '**': return wrap(Math.pow(an, bn)); } return makeAny(null); }
    charAwareConcat(l, r, lt, rt) { return this.concatStrings(lt === 'char' ? this.charToString(l) : l, rt === 'char' ? this.charToString(r) : r); }
    concatStrings(a, b) { const as = (a && a.__sk === SK.STRING) ? (a.__is_null ? 'null' : a.value) : (a && a.value ? a.value : 'null'); const bs = (b && b.__sk === SK.STRING) ? (b.__is_null ? 'null' : b.value) : (b && b.value ? b.value : 'null'); return makeString(String(as) + String(bs)); }
    charToString(c) { if (!c || c.__sk !== SK.CHAR) return makeString(''); return makeString(String.fromCharCode(c.value)); }
    compareOp(op, l, r, lt, rt) { if (lt === 'string' && rt === 'string') { const eq = l.value === r.value; if (op === '==') return makeBool(eq); if (op === '!=') return makeBool(!eq); return makeBool(false); } const a = this.toNumber(l); const b = this.toNumber(r); switch (op) { case '==': return makeBool(a === b); case '!=': return makeBool(a !== b); case '<': return makeBool(a < b); case '>': return makeBool(a > b); case '<=': return makeBool(a <= b); case '>=': return makeBool(a >= b); } return makeBool(false); }
    anyToString(a) { switch (a.type) { case 0: return makeString(String(a.data)); case 1: return makeString(a.data); case 2: case 3: return makeString(String(a.data)); case 4: return makeString(a.data ? 'true' : 'false'); case 5: return makeString(displayValue(a)); case 6: return makeString('null'); case 7: return makeString(String.fromCharCode(a.data)); case 8: return makeString(displayValue(a)); } return makeString(''); }
    anyToNumber(a) { switch (a.type) { case 0: return a.data; case 1: return parseFloat(a.data) || 0; case 2: case 3: return a.data; case 4: return a.data ? 1 : 0; case 7: return a.data; } return 0; }
    evalUnary(expr, frame) { switch (expr.op) { case '$': return this.toStringValue(this.evaluate(expr.expr, frame)); case '!': return makeBool(!this.toBool(this.evaluate(expr.expr, frame))); case '-': { const v = this.evaluate(expr.expr, frame); if (!v) return null; if (v.__sk_any) return makeAny(-this.anyToNumber(v)); if (v.__sk === SK.INT) return makeInt(-v.value); if (v.__sk === SK.FLOAT) return makeFloat(-v.value); if (v.__sk === SK.DOUBLE) return makeDouble(-v.value); return null; } } return null; }
    toStringValue(v) { if (!v) return makeString('null'); if (v.__sk_any) return this.anyToString(v); switch (v.__sk) { case SK.INT: return makeString(v.__is_null ? 'null' : String(v.value)); case SK.FLOAT: case SK.DOUBLE: return makeString(v.__is_null ? 'null' : String(v.value)); case SK.BOOL: return makeString(v.__is_null ? 'null' : (v.value ? 'true' : 'false')); case SK.STRING: return makeString(v.__is_null ? 'null' : v.value); case SK.CHAR: return makeString(String.fromCharCode(v.value)); case SK.ARR: case SK.DICT: return makeString(displayValue(v)); } return makeString(''); }
    evalTernary(expr, frame) { if (this.isTruthy(this.evaluate(expr.condition, frame))) return this.evaluate(expr.then, frame); return this.evaluate(expr.else, frame); }
    evalFieldAccess(expr, frame) { const obj = frame.scope.resolve(expr.object); if (!obj) { const g = this.globalScope.resolve(expr.object); if (!g) return null; return this.fieldOf(g.value, expr.field); } return this.fieldOf(obj.value, expr.field); }
    fieldOf(val, field) { if (!val) return null; if (val.__sk === SK.DICT) return val.value.get(field) || null; if (val.__is_sk_error) return val[field] !== undefined ? val[field] : null; return null; }
    evalArrayIndex(expr, frame) { const obj = frame.scope.resolve(expr.name); if (!obj) return null; if (obj.type === 'dict') { const key = this.evaluate(expr.index, frame); const d = obj.value; if (!d || d.__sk !== SK.DICT) return makeAny(null); return d.value.get(this.anyToKeyString(key)) || makeAny(null); } const idx = this.toIntVal(this.evaluate(expr.index, frame)); const arr = obj.value; if (!arr || arr.__sk !== SK.ARR) return null; if (idx < 0 || idx >= arr.value.length) return null; return arr.value[idx]; }
    evalArrayLength(expr, frame) { const obj = frame.scope.resolve(expr.name); if (!obj) return makeInt(0); if (obj.value.__sk === SK.ARR) return makeInt(obj.value.value.length); if (obj.value.__sk === SK.STRING) return makeInt(Array.from(obj.value.value || '').length); if (obj.value.__sk === SK.DICT) return makeInt(obj.value.value.size); return makeInt(0); }
    evalCallExpr(expr, frame) { const fnName = expr.name.includes('.') ? expr.name.split('.').pop() : expr.name; const fn = this.functions.get(fnName); if (!fn) return null; return this.callFunction(fnName, expr.args, frame, expr); }
    valueSkType(v) { if (!v) return 'void'; if (v.__sk_any) return 'any'; return v.__sk; }
    toNumber(v) { if (!v) return 0; if (v.__sk_any) return this.anyToNumber(v); switch (v.__sk) { case SK.INT: return v.value; case SK.FLOAT: case SK.DOUBLE: return v.value; case SK.BOOL: return v.value ? 1 : 0; case SK.CHAR: return v.value; case SK.STRING: return parseFloat(v.value) || 0; } return 0; }
    toIntVal(v) { return Math.trunc(this.toNumber(v)); }
    toBool(v) { return this.isTruthy(v); }
    resume() { if (this._resumeResolve) { const r = this._resumeResolve; this._resumeResolve = null; r(); } }
}

// ============================================================
// Manifest & DAP Handler
// ============================================================
function parseManifest(text) { const result = { vars: {} }; for (const rawLine of text.split(/\r?\n/)) { const line = rawLine.trim(); if (!line || line.startsWith('#!')) continue; const openIdx = line.indexOf('['); if (openIdx < 0) continue; const key = line.slice(0, openIdx).trim(); const rest = line.slice(openIdx + 1); const closeIdx = rest.lastIndexOf(']'); if (closeIdx < 0) continue; const vStr = rest.slice(0, closeIdx).trim(); if (vStr.startsWith('(') && vStr.endsWith(')')) result.vars[key] = vStr.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, '')); else if (vStr.startsWith('"') && vStr.endsWith('"')) result.vars[key] = vStr.slice(1, -1); else result.vars[key] = vStr; } return result; }

let interpreter = null;
function handleMessage(msg) { if (msg.type !== 'request') return; handleRequest(msg).catch(e => dapLog('ERR: ' + e.message)); }

async function handleRequest(request) {
    try {
        switch (request.command) {
            case 'initialize': sendResponse(request, { supportsConfigurationDoneRequest: true }); sendEvent('initialized'); break;
            case 'launch': {
                const args = request.arguments || {}; const cwd = args.cwd || process.cwd();
                const manifestPath = path.join(cwd, 'manifest.spc'); if (!fs.existsSync(manifestPath)) return sendError(request, 'manifest.spc not found');
                const manifest = parseManifest(fs.readFileSync(manifestPath, 'utf8'));
                const mainFile = path.resolve(cwd, manifest.vars['main'] || 'main.sk'); if (!fs.existsSync(mainFile)) return sendError(request, 'main file not found');
                const prog = new Parser(lex(fs.readFileSync(mainFile, 'utf8')), mainFile).parse();
                interpreter = new Interpreter(prog, mainFile, {
                    onOutput: (kind, text) => sendEvent('output', { category: kind === 'stdout' ? 'stdout' : 'stderr', output: text }),
                    onBreakpoint: (line) => { for (const lines of debugState.breakpoints.values()) if (lines.has(line)) return true; return false; },
                    onPause: (info) => { debugState.paused = true; sendEvent('stopped', { reason: info.reason, threadId: 1, allThreadsStopped: true }); },
                    onExit: (code) => { sendEvent('exited', { exitCode: code }); sendEvent('terminated'); },
                });
                interpreter.configVars = manifest.vars;
                sendResponse(request, {}); debugState.pendingLaunch = () => interpreter.run(); break;
            }
            case 'setBreakpoints': {
                const lines = new Set(); const result = [];
                for (const bp of (request.arguments.breakpoints || [])) { lines.add(bp.line); result.push({ verified: true, line: bp.line }); }
                if (request.arguments.source && request.arguments.source.path) debugState.breakpoints.set(request.arguments.source.path, lines);
                sendResponse(request, { breakpoints: result }); break;
            }
            case 'configurationDone': sendResponse(request, {}); if (debugState.pendingLaunch) { const l = debugState.pendingLaunch; debugState.pendingLaunch = null; l(); } break;
            case 'threads': sendResponse(request, { threads: [{ id: 1, name: 'main' }] }); break;
            case 'stackTrace': { const stack = []; if (interpreter) for (let i = interpreter.frames.length - 1; i >= 0; i--) { const f = interpreter.frames[i]; stack.push({ id: i, name: f.function.name, source: { name: path.basename(f.cfile), path: f.cfile }, line: f.line, column: f.col }); } sendResponse(request, { stackFrames: stack, totalFrames: stack.length }); break; }
            case 'scopes': { const frameId = request.arguments.frameId; sendResponse(request, { scopes: [{ name: 'Locals', variablesReference: frameId * 100 + 1, expensive: false }] }); break; }
            case 'variables': { const ref = request.arguments.variablesReference; const variables = []; if (interpreter) { const frameId = Math.floor(ref / 100); const frame = interpreter.frames[frameId]; if (frame) for (const [name, val] of frame.locals) variables.push({ name, value: displayValue(val), type: val ? (val.__sk_any ? 'any' : val.__sk) : 'unknown', variablesReference: 0 }); } sendResponse(request, { variables }); break; }
            case 'continue': if (interpreter) { debugState.stepMode = null; interpreter.resume(); } sendResponse(request, {}); break;
            case 'next': if (interpreter) { debugState.stepMode = null; interpreter.resume(); } sendResponse(request, {}); break;
            case 'stepIn': if (interpreter) { debugState.stepMode = 'stepIn'; interpreter.resume(); } sendResponse(request, {}); break;
            case 'stepOut': if (interpreter) { debugState.stepMode = null; interpreter.resume(); } sendResponse(request, {}); break;
            case 'disconnect': sendResponse(request, {}); process.exit(0);
            default: sendError(request, `Unsupported command: ${request.command}`);
        }
    } catch (e) { sendError(request, e.message); }
}