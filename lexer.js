// lexer.js
'use strict';

// ============================================================
// Типы токенов — 1:1 с твоим lexer.go
// ============================================================

const TOK = {
    EOF: 'EOF',
    IDENT: 'IDENT',
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    KEYWORD: 'KEYWORD',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    LBRACE: 'LBRACE',
    RBRACE: 'RBRACE',
    LBRACKET: 'LBRACKET',
    RBRACKET: 'RBRACKET',
    SEMICOLON: 'SEMICOLON',
    COMMA: 'COMMA',
    NEQ: 'NEQ',           // !=
    EQEQ: 'EQEQ',         // ==
    LTE: 'LTE',           // <=
    GTE: 'GTE',           // >=
    PLUS: 'PLUS',
    MINUS: 'MINUS',
    STAR: 'STAR',
    SLASH: 'SLASH',
    CARET: 'CARET',       // ^
    POW: 'POW',           // **
    EQUALS: 'EQUALS',     // =
    LT: 'LT',             // <
    GT: 'GT',             // >
    NOT: 'NOT',           // !
    AND: 'AND',           // &&
    OR: 'OR',             // ||
    AMPERSAND: 'AMPERSAND', // &
    HASH: 'HASH',         // #
    DOLLAR: 'DOLLAR',     // $
    DOT: 'DOT',           // .
    DOTDOT: 'DOTDOT',     // ..
    QUESTION: 'QUESTION', // ?
    COLON: 'COLON',       // :
    INCLUDE_C: 'INCLUDE_C', // includeC
    TILDE: 'TILDE',       // ~~~
    PERCENT: 'PERCENT',   // %
};

// Ключевые слова — из твоего lexer.go
const KEYWORDS = new Set([
    'use', 'const', 'func', 'if', 'elsif', 'else', 'case', 'for', 'while',
    'type', 'return', 'null', 'void', 'int', 'char', 'string', 'arr',
    'dict', 'float', 'double', 'bool', 'any', 'true', 'false', 'T',
    'new', 'Error', 'throw', 'try', 'catch', 'as'
]);

// Типы (подмножество KEYWORDS)
const TYPE_KEYWORDS = new Set([
    'void', 'int', 'char', 'string', 'arr', 'dict',
    'float', 'double', 'bool', 'any', 'T'
]);

// ============================================================
// Лексер — порт lexer.go
// ============================================================

class Lexer {
    constructor(input) {
        this.input = input;
        this.pos = 0;
        this.line = 1;
        this.col = 1;
    }

    peek() {
        return this.pos + 1 < this.input.length ? this.input[this.pos + 1] : '';
    }

    makeToken(type, literal, startLine, startCol) {
        this.pos++;
        this.col++;
        return { type, value: literal, line: startLine, col: startCol };
    }

    skipWhitespace() {
        while (this.pos < this.input.length) {
            const ch = this.input[this.pos];
            if (ch === ' ' || ch === '\t' || ch === '\r') {
                this.pos++;
                this.col++;
            } else if (ch === '\n') {
                this.pos++;
                this.line++;
                this.col = 1;
            } else {
                break;
            }
        }
    }

    readIdent() {
        const start = this.pos;
        const startCol = this.col;
        while (this.pos < this.input.length) {
            const ch = this.input[this.pos];
            if (/[A-Za-z0-9_]/.test(ch)) {
                this.pos++;
                this.col++;
            } else {
                break;
            }
        }
        const literal = this.input.slice(start, this.pos);
        let type = TOK.IDENT;
        if (KEYWORDS.has(literal)) type = TOK.KEYWORD;
        return { type, value: literal, line: this.line, col: startCol };
    }

    readNumber() {
        const start = this.pos;
        const startCol = this.col;
        if (this.input[this.pos] === '-') {
            this.pos++;
            this.col++;
        }
        while (this.pos < this.input.length && /[0-9]/.test(this.input[this.pos])) {
            this.pos++;
            this.col++;
        }
        // .digits
        if (this.pos + 1 < this.input.length &&
            this.input[this.pos] === '.' &&
            /[0-9]/.test(this.input[this.pos + 1])) {
            this.pos++;
            this.col++;
            while (this.pos < this.input.length && /[0-9]/.test(this.input[this.pos])) {
                this.pos++;
                this.col++;
            }
        }
        // суффикс f/F — float
        if (this.pos < this.input.length &&
            (this.input[this.pos] === 'f' || this.input[this.pos] === 'F')) {
            this.pos++;
            this.col++;
        }
        const literal = this.input.slice(start, this.pos);
        return { type: TOK.NUMBER, value: literal, line: this.line, col: startCol };
    }

    readString() {
        const startCol = this.col;
        const startLine = this.line;
        this.pos++; // пропустить "
        this.col++;

        let result = '';
        while (this.pos < this.input.length && this.input[this.pos] !== '"') {
            if (this.input[this.pos] === '\\' && this.pos + 1 < this.input.length) {
                this.pos++;
                this.col++;
                const esc = this.input[this.pos];
                // Упрощённо: сохраняем escape как есть
                switch (esc) {
                    case 'n': result += '\n'; break;
                    case 't': result += '\t'; break;
                    case 'r': result += '\r'; break;
                    case '\\': result += '\\'; break;
                    case '"': result += '"'; break;
                    case "'": result += "'"; break;
                    default: result += '\\' + esc;
                }
                this.pos++;
                this.col++;
            } else {
                result += this.input[this.pos];
                this.pos++;
                this.col++;
            }
        }
        if (this.pos < this.input.length) {
            this.pos++; // закрывающая "
            this.col++;
        }
        return { type: TOK.STRING, value: result, line: startLine, col: startCol };
    }

    readSingleLineComment() {
        while (this.pos < this.input.length && this.input[this.pos] !== '\n') {
            this.pos++;
            this.col++;
        }
    }

    readMultilineComment() {
        this.pos += 2;
        this.col += 2;
        while (this.pos < this.input.length - 1 &&
               !(this.input[this.pos] === '*' && this.input[this.pos + 1] === '/')) {
            if (this.input[this.pos] === '\n') {
                this.line++;
                this.col = 1;
            } else {
                this.col++;
            }
            this.pos++;
        }
        if (this.pos < this.input.length - 1) {
            this.pos += 2;
            this.col += 2;
        }
    }

    readTildes() {
        const startCol = this.col;
        const startLine = this.line;

        // три ~
        this.pos++; this.col++;
        if (this.pos < this.input.length && this.input[this.pos] === '~') {
            this.pos++; this.col++;
        }
        if (this.pos < this.input.length && this.input[this.pos] === '~') {
            this.pos++; this.col++;
        }

        let code = '';
        while (this.pos < this.input.length) {
            if (this.pos + 2 < this.input.length &&
                this.input[this.pos] === '~' &&
                this.input[this.pos + 1] === '~' &&
                this.input[this.pos + 2] === '~') {
                this.pos += 3;
                this.col += 3;
                return { type: TOK.TILDE, value: code.trim(), line: startLine, col: startCol };
            }
            if (this.input[this.pos] === '\n') {
                this.line++;
                this.col = 1;
            } else {
                this.col++;
            }
            code += this.input[this.pos];
            this.pos++;
        }
        return { type: TOK.TILDE, value: code.trim(), line: startLine, col: startCol };
    }

    nextToken() {
        this.skipWhitespace();
        if (this.pos >= this.input.length) {
            return { type: TOK.EOF, value: '', line: this.line, col: this.col };
        }

        const ch = this.input[this.pos];
        const startLine = this.line;
        const startCol = this.col;

        // /* */
        if (ch === '/' && this.peek() === '*') {
            this.readMultilineComment();
            return this.nextToken();
        }
        // //
        if (ch === '/' && this.peek() === '/') {
            this.readSingleLineComment();
            return this.nextToken();
        }

        // ~~~
        if (ch === '~') {
            return this.readTildes();
        }

        // Число
        if (/[0-9]/.test(ch) ||
            (ch === '-' && /[0-9]/.test(this.input[this.pos + 1] || ''))) {
            return this.readNumber();
        }

        // Строка
        if (ch === '"') {
            return this.readString();
        }

        // Идентификатор / ключевое слово
        if (/[A-Za-z_]/.test(ch)) {
            return this.readIdent();
        }

        // Двухсимвольные операторы
        const two = this.input.slice(this.pos, this.pos + 2);
        switch (two) {
            case '**': this.pos += 2; this.col += 2; return { type: TOK.POW, value: '**', line: startLine, col: startCol };
            case '==': this.pos += 2; this.col += 2; return { type: TOK.EQEQ, value: '==', line: startLine, col: startCol };
            case '!=': this.pos += 2; this.col += 2; return { type: TOK.NEQ, value: '!=', line: startLine, col: startCol };
            case '<=': this.pos += 2; this.col += 2; return { type: TOK.LTE, value: '<=', line: startLine, col: startCol };
            case '>=': this.pos += 2; this.col += 2; return { type: TOK.GTE, value: '>=', line: startLine, col: startCol };
            case '&&': this.pos += 2; this.col += 2; return { type: TOK.AND, value: '&&', line: startLine, col: startCol };
            case '||': this.pos += 2; this.col += 2; return { type: TOK.OR, value: '||', line: startLine, col: startCol };
            case '..': this.pos += 2; this.col += 2; return { type: TOK.DOTDOT, value: '..', line: startLine, col: startCol };
        }

        // Одиночные
        const make = (type) => {
            const t = { type, value: ch, line: startLine, col: startCol };
            this.pos++; this.col++;
            return t;
        };
        switch (ch) {
            case '(': return make(TOK.LPAREN);
            case ')': return make(TOK.RPAREN);
            case '{': return make(TOK.LBRACE);
            case '}': return make(TOK.RBRACE);
            case '[': return make(TOK.LBRACKET);
            case ']': return make(TOK.RBRACKET);
            case ';': return make(TOK.SEMICOLON);
            case ',': return make(TOK.COMMA);
            case '+': return make(TOK.PLUS);
            case '-': return make(TOK.MINUS);
            case '*': return make(TOK.STAR);
            case '/': return make(TOK.SLASH);
            case '^': return make(TOK.CARET);
            case '=': return make(TOK.EQUALS);
            case '<': return make(TOK.LT);
            case '>': return make(TOK.GT);
            case '!': return make(TOK.NOT);
            case '&': return make(TOK.AMPERSAND);
            case '#': return make(TOK.HASH);
            case '$': return make(TOK.DOLLAR);
            case '.': return make(TOK.DOT);
            case '?': return make(TOK.QUESTION);
            case ':': return make(TOK.COLON);
            case '%': return make(TOK.PERCENT);
            default:
                // Неизвестный символ — пропускаем
                this.pos++;
                this.col++;
                return this.nextToken();
        }
    }

    tokenize() {
        const tokens = [];
        while (true) {
            const t = this.nextToken();
            tokens.push(t);
            if (t.type === TOK.EOF) break;
        }
        return tokens;
    }
}

function lex(text) {
    return new Lexer(text).tokenize();
}

// ============================================================
// Парсеры объявлений — по мотивам parser.go
// ============================================================

/**
 * Парсит тип, начиная с позиции idx.
 * Возвращает { type, args, end } или null.
 *
 * Формат типа:
 *   int, float, string, bool, any, void
 *   arr[int], arr[arr[int]], arr[] (→ arr[any])
 *   T<A, B, C> (union)
 *   Error, BaseError, ... (custom types — на будущее)
 */
function parseType(tokens, idx) {
    const tok = tokens[idx];
    if (!tok) return null;

    // arr[...]
    if (tok.type === TOK.KEYWORD && tok.value === 'arr') {
        const next = tokens[idx + 1];
        if (next && next.type === TOK.LBRACKET) {
            // arr[...] — рекурсивно парсим содержимое
            const args = [];
            let j = idx + 2;
            let depth = 1;
            const innerStart = j;
            while (j < tokens.length && depth > 0) {
                if (tokens[j].type === TOK.LBRACKET) depth++;
                else if (tokens[j].type === TOK.RBRACKET) {
                    depth--;
                    if (depth === 0) break;
                }
                j++;
            }
            if (depth !== 0) return null;
            // Парсим содержимое
            const parsed = parseType(tokens, innerStart);
            if (parsed) args.push(parsed);
            return {
                type: 'arr',
                args: args.length ? args : null,
                end: j + 1,
            };
        }
        // arr без []
        return { type: 'arr', args: null, end: idx + 1 };
    }

    // T<A, B, ...> — union
    if (tok.type === TOK.KEYWORD && tok.value === 'T') {
        const next = tokens[idx + 1];
        if (next && next.type === TOK.LT) {
            const args = [];
            let j = idx + 2;
            let depth = 1;
            let argStart = j;
            while (j < tokens.length && depth > 0) {
                if (tokens[j].type === TOK.LT) depth++;
                else if (tokens[j].type === TOK.GT) {
                    depth--;
                    if (depth === 0) break;
                } else if (tokens[j].type === TOK.COMMA && depth === 1) {
                    const t = parseType(tokens, argStart);
                    if (t) args.push(t);
                    argStart = j + 1;
                }
                j++;
            }
            if (depth !== 0) return null;
            // Последний аргумент
            const t = parseType(tokens, argStart);
            if (t) args.push(t);
            return {
                type: 'T',
                args,
                end: j + 1,
            };
        }
        return null;
    }

    // Примитивные типы
    if (tok.type === TOK.KEYWORD && TYPE_KEYWORDS.has(tok.value)) {
        return { type: tok.value, args: null, end: idx + 1 };
    }

    // Идентификатор (custom type: Error, BaseError, ...)
    if (tok.type === TOK.IDENT && /^[A-Z]/.test(tok.value)) {
        return { type: tok.value, args: null, end: idx + 1 };
    }

    return null;
}

/**
 * Форматирует тип обратно в строку.
 */
function formatType(t) {
    if (!t) return '';
    if (!t.args || t.args.length === 0) {
        return t.type === 'arr' ? 'arr' : t.type;
    }
    if (t.type === 'arr') {
        return `arr[${formatType(t.args[0])}]`;
    }
    if (t.type === 'T') {
        return `T<${t.args.map(formatType).join(', ')}>`;
    }
    return t.type;
}

// ============================================================
// Извлечение объявлений
// ============================================================

/**
 * Собирает функции.
 * Формат: <type> [*] <name>(<params>) { ... }
 *
 * Возвращает: name, returnType, params, line, col, bodyStart, bodyEnd
 * где bodyStart/bodyEnd — позиции { и } (0-based, для VS Code).
 */
function extractFunctions(tokens) {
    const result = [];
    const seen = new Set();

    for (let i = 0; i < tokens.length; i++) {
        const typeTok = tokens[i];
        if (typeTok.type !== TOK.KEYWORD && typeTok.type !== TOK.IDENT) continue;

        const parsedType = parseType(tokens, i);
        if (!parsedType) continue;

        let j = parsedType.end;

        // Опциональный `*` (non-exportable)
        if (tokens[j] && tokens[j].type === TOK.STAR) j++;

        // Имя функции
        const nameTok = tokens[j];
        if (!nameTok || nameTok.type !== TOK.IDENT) continue;
        if (KEYWORDS.has(nameTok.value)) continue;

        j++;

        // `(`
        if (!tokens[j] || tokens[j].type !== TOK.LPAREN) continue;
        j++;

        // Параметры
        const params = [];
        let paramError = false;

        while (j < tokens.length && tokens[j].type !== TOK.RPAREN && tokens[j].type !== TOK.EOF) {
            if (tokens[j].type === TOK.COMMA) { j++; continue; }

            const paramType = parseType(tokens, j);
            if (!paramType) { paramError = true; break; }
            j = paramType.end;

            const paramName = tokens[j];
            if (!paramName || paramName.type !== TOK.IDENT) { paramError = true; break; }
            if (KEYWORDS.has(paramName.value)) { paramError = true; break; }

            params.push({
                type: paramType,
                name: paramName.value,
                line: paramName.line - 1,
                col: paramName.col - 1,
            });
            j++;

            // `= default`
            if (tokens[j] && tokens[j].type === TOK.EQUALS) {
                j++;
                let depth = 0;
                while (j < tokens.length) {
                    const t = tokens[j];
                    if (t.type === TOK.LPAREN || t.type === TOK.LBRACKET || t.type === TOK.LBRACE) depth++;
                    else if (t.type === TOK.RPAREN || t.type === TOK.RBRACKET || t.type === TOK.RBRACE) {
                        if (depth === 0) break;
                        depth--;
                    } else if (t.type === TOK.COMMA && depth === 0) {
                        break;
                    }
                    j++;
                }
            }

            if (tokens[j] && tokens[j].type === TOK.COMMA) {
                j++;
                continue;
            }
        }

        if (paramError) continue;
        if (!tokens[j] || tokens[j].type !== TOK.RPAREN) continue;
        j++;

        // После `)` — `{`
        if (!tokens[j] || tokens[j].type !== TOK.LBRACE) continue;

        const bodyStartTok = tokens[j];
        const bodyStart = { line: bodyStartTok.line - 1, col: bodyStartTok.col - 1 };

        // Ищем соответствующую `}`
        let depth = 1;
        let k = j + 1;
        while (k < tokens.length && depth > 0) {
            if (tokens[k].type === TOK.LBRACE) depth++;
            else if (tokens[k].type === TOK.RBRACE) {
                depth--;
                if (depth === 0) break;
            }
            k++;
        }
        if (depth !== 0) continue;
        if (!tokens[k] || tokens[k].type !== TOK.RBRACE) continue;

        const bodyEnd = { line: tokens[k].line - 1, col: tokens[k].col - 1 };

        const key = `${nameTok.value}@${nameTok.line}:${nameTok.col}`;
        if (seen.has(key)) continue;
        seen.add(key);

        result.push({
            name: nameTok.value,
            returnType: parsedType,
            params,
            line: nameTok.line - 1,
            col: nameTok.col - 1,
            isExport: true,
            bodyStart,
            bodyEnd,
        });

        // Не пропускаем — могут быть вложенные функции? Нет, у Skorpion плоские.
        // i = k; // раскомментировать, если хотим быстрее
    }

    return result;
}

/**
 * Собирает переменные верхнего уровня.
 * Формат: <type> <name> = <expr>
 *
 * Исключает:
 *   - аргументы функций (внутри `(...)`)
 *   - имена после `.` (поля)
 *   - ключевые слова
 */
function extractVariables(tokens) {
    const result = [];
    const seen = new Set();

    let parenDepth = 0;
    let blockDepth = 0;

    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];

        if (tok.type === TOK.LPAREN) { parenDepth++; continue; }
        if (tok.type === TOK.RPAREN) { parenDepth--; continue; }
        if (tok.type === TOK.LBRACE) { blockDepth++; continue; }
        if (tok.type === TOK.RBRACE) { blockDepth--; continue; }

        // Только вне аргументов
        if (parenDepth !== 0) continue;

        // Пробуем распарсить тип
        const parsedType = parseType(tokens, i);
        if (!parsedType) continue;

        let j = parsedType.end;
        const nameTok = tokens[j];
        if (!nameTok || nameTok.type !== TOK.IDENT) continue;
        if (KEYWORDS.has(nameTok.value)) continue;

        // Пропускаем функции (после имени `(`)
        if (tokens[j + 1] && tokens[j + 1].type === TOK.LPAREN) continue;

        j++;

        // После имени должен быть `=`
        if (!tokens[j] || tokens[j].type !== TOK.EQUALS) continue;

        const key = `${nameTok.value}@${nameTok.line}:${nameTok.col}`;
        if (seen.has(key)) continue;
        seen.add(key);

        result.push({
            name: nameTok.value,
            type: parsedType,
            line: nameTok.line - 1,
            col: nameTok.col - 1,
            blockDepth,
        });

        i = j - 1;
    }

    return result;
}

/**
 * Собирает типы ошибок: `const Name{field: type, ...} = new Parent`
 */
function extractErrorTypes(tokens) {
    const result = [];
    const seen = new Set();

    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.type !== TOK.KEYWORD || tok.value !== 'const') continue;

        const nameTok = tokens[i + 1];
        if (!nameTok || nameTok.type !== TOK.IDENT) continue;
        if (!/^[A-Z]/.test(nameTok.value)) continue;

        let j = i + 2;
        if (!tokens[j] || tokens[j].type !== TOK.LBRACE) continue;

        // Собираем поля
        const fields = [];
        let depth = 1;
        j++;

        while (j < tokens.length && depth > 0) {
            // Поле: name: type
            const fieldName = tokens[j];
            if (fieldName && fieldName.type === TOK.IDENT) {
                const colon = tokens[j + 1];
                if (colon && colon.type === TOK.COLON) {
                    const fieldType = parseType(tokens, j + 2);
                    if (fieldType) {
                        fields.push({
                            name: fieldName.value,
                            type: fieldType,
                        });
                    }
                }
            }

            if (tokens[j].type === TOK.LBRACE) depth++;
            else if (tokens[j].type === TOK.RBRACE) depth--;
            j++;
        }

        // Ищем `= new Parent`
        let parent = 'Error';
        if (tokens[j] && tokens[j].type === TOK.EQUALS) {
            j++;
            if (tokens[j] && tokens[j].type === TOK.KEYWORD && tokens[j].value === 'new') {
                j++;
            }
            if (tokens[j] && (tokens[j].type === TOK.IDENT ||
                              (tokens[j].type === TOK.KEYWORD && tokens[j].value === 'Error'))) {
                parent = tokens[j].value;
            }
        }

        const key = `${nameTok.value}@${nameTok.line}:${nameTok.col}`;
        if (seen.has(key)) continue;
        seen.add(key);

        result.push({
            name: nameTok.value,
            fields,
            parent,
            line: nameTok.line - 1,
            col: nameTok.col - 1,
        });
    }

    return result;
}

/**
 * Собирает импорты: `use module`, `use #module`, `use module &alias`.
 */
function extractImports(tokens) {
    const result = [];
    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.type !== TOK.KEYWORD || tok.value !== 'use') continue;

        let j = i + 1;
        let all = false;
        if (tokens[j] && tokens[j].type === TOK.HASH) {
            all = true;
            j++;
        }

        // Путь: ident ( / ident )*
        let path = '';
        while (j < tokens.length) {
            const t = tokens[j];
            if (t.type === TOK.IDENT) {
                path += t.value;
                j++;
            } else if (t.type === TOK.SLASH) {
                path += '/';
                j++;
            } else {
                break;
            }
        }

        // Алиас: & name
        let alias = null;
        if (tokens[j] && tokens[j].type === TOK.AMPERSAND) {
            j++;
            if (tokens[j] && tokens[j].type === TOK.IDENT) {
                alias = tokens[j].value;
                j++;
            }
        }

        if (path) {
            result.push({ path, alias, all, line: tok.line - 1, col: tok.col - 1 });
        }
    }
    return result;
}

// ============================================================
// Публичный API
// ============================================================

/**
 * @param {string} text
 * @returns {{
 *   functions: Array,
 *   variables: Array,
 *   errorTypes: Array,
 *   imports: Array,
 * }}
 */
function analyze(text) {
    const tokens = lex(text);
    return {
        functions: extractFunctions(tokens),
        variables: extractVariables(tokens),
        errorTypes: extractErrorTypes(tokens),
        imports: extractImports(tokens),
    };
}

module.exports = { lex, analyze, formatType, TOK, KEYWORDS };