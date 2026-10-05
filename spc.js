// spc.js
const vscode = require('vscode');

const TOKEN_TYPES = [
    'string',     // 0 — "..." '...'
    'number',     // 1 — числа
    'comment',    // 2 — #! ...
    'variable',   // 3 — имена параметров
    'operator'    // 4 — запятые
];
const TOKEN_MODIFIERS = [];

const LEGEND = new vscode.SemanticTokensLegend(TOKEN_TYPES, TOKEN_MODIFIERS);

function tokenize(text) {
    const tokens = [];
    const lines = text.split(/\r\n|\r|\n/);

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        let i = 0;

        while (i < line.length) {
            const ch = line[i];

            // Комментарий #! до конца строки
            if (ch === '#' && line[i + 1] === '!') {
                tokens.push({ line: lineIdx, start: i, length: line.length - i, type: 'comment' });
                break;
            }

            if (ch === ' ' || ch === '\t') { i++; continue; }

            // Имя параметра: только A-Za-z
            if (/[A-Za-z]/.test(ch)) {
                const start = i;
                while (i < line.length && /[A-Za-z]/.test(line[i])) i++;
                tokens.push({ line: lineIdx, start, length: i - start, type: 'variable' });
                continue;
            }

            // Запятая
            if (ch === ',') {
                tokens.push({ line: lineIdx, start: i, length: 1, type: 'operator' });
                i++;
                continue;
            }

            // Строка
            if (ch === '"' || ch === "'") {
                const quote = ch;
                const start = i;
                i++;
                while (i < line.length) {
                    if (line[i] === '\\') { i += 2; continue; }
                    if (line[i] === quote) { i++; break; }
                    i++;
                }
                tokens.push({ line: lineIdx, start, length: i - start, type: 'string' });
                continue;
            }

            // Число
            if (/[-0-9]/.test(ch)) {
                const start = i;
                if (ch === '-') i++;
                while (i < line.length && /\d/.test(line[i])) i++;
                if (i < line.length && line[i] === '.') {
                    i++;
                    while (i < line.length && /\d/.test(line[i])) i++;
                }
                tokens.push({ line: lineIdx, start, length: i - start, type: 'number' });
                continue;
            }

            // Скобки [ ] ( ) — НЕ размечаем, VS Code красит сам
            i++;
        }
    }
    return tokens;
}

function activateSpc(context) {
    const provider = vscode.languages.registerDocumentSemanticTokensProvider(
        'spc',
        {
            provideDocumentSemanticTokens(document) {
                const tokens = tokenize(document.getText());
                const builder = new vscode.SemanticTokensBuilder(LEGEND);
                for (const t of tokens) {
                    const typeIdx = TOKEN_TYPES.indexOf(t.type);
                    if (typeIdx < 0) continue;
                    builder.push(t.line, t.start, t.length, typeIdx, 0);
                }
                return builder.build();
            }
        },
        LEGEND
    );
    context.subscriptions.push(provider);
}

module.exports = { activateSpc };