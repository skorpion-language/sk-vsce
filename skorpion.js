// skorpion.js
const vscode = require('vscode');
const { analyze, formatType } = require('./lexer');

const ITEMS = {
    // === Ключевые слова ===
    if:     { kind: vscode.CompletionItemKind.Keyword, detail: 'Conditional', doc: 'Conditional branch.', snippet: 'if (${1:condition}) {\n\t$0\n}' },
    elsif:  { kind: vscode.CompletionItemKind.Keyword, detail: 'Conditional', doc: 'Else-if branch.', snippet: 'elsif (${1:condition}) {\n\t$0\n}' },
    else:   { kind: vscode.CompletionItemKind.Keyword, detail: 'Conditional', doc: 'Final branch.', snippet: 'else {\n\t$0\n}' },
    while:  { kind: vscode.CompletionItemKind.Keyword, detail: 'Loop', doc: 'Loop while true.', snippet: 'while (${1:condition}) {\n\t$0\n}' },
    for:    { kind: vscode.CompletionItemKind.Keyword, detail: 'Loop', doc: 'Iterate over a collection.', snippet: 'for (${1:type} ${2:item} in ${3:collection}) {\n\t$0\n}' },
    case:   { kind: vscode.CompletionItemKind.Keyword, detail: 'Switch', doc: 'Multi-branch switch.', snippet: 'case (${1:value}) {\n\t${2:1} { $3 },\n\t_ { $0 },\n}' },
    try:    { kind: vscode.CompletionItemKind.Keyword, detail: 'Exception handling', doc: 'Try block.', snippet: 'try {\n\t$0\n}' },
    catch:  { kind: vscode.CompletionItemKind.Keyword, detail: 'Exception handling', doc: 'Catch block.', snippet: 'catch (${1:Error} as ${2:e}) {\n\t$0\n}' },
    throw:  { kind: vscode.CompletionItemKind.Keyword, detail: 'Exception handling', doc: 'Throw an error.', snippet: 'throw ${1:BaseError}{code: ${2:1}}' },
    return: { kind: vscode.CompletionItemKind.Keyword, detail: 'Return', doc: 'Return from a function.', snippet: 'return ${1:value}' },

    const:  { kind: vscode.CompletionItemKind.Keyword, detail: 'Declaration', doc: 'Immutable binding.', snippet: 'const ${1:type} ${2:name} = ${3:value}' },
    new:    { kind: vscode.CompletionItemKind.Keyword, detail: 'Constructor', doc: 'Creates an instance.', snippet: 'new ${1:Name}{${2:field: type}} inherit ${3:Error}' },
    as:     { kind: vscode.CompletionItemKind.Keyword, detail: 'Binding', doc: 'Binds a caught error.' },
    use:    { kind: vscode.CompletionItemKind.Keyword, detail: 'Import', doc: 'Imports a module.', snippet: 'use ${1:std/io}' },
    lib:    { kind: vscode.CompletionItemKind.Keyword, detail: 'Import library', doc: 'Imports a library.', snippet: 'use lib:${1:author}/${2:name}' },
    libver: { kind: vscode.CompletionItemKind.Keyword, detail: 'Import library', doc: 'Imports a library.', snippet: 'use lib:${1:author}/${2:name}@${3:1.0.0}' },
    includeC: { kind: vscode.CompletionItemKind.Keyword, detail: 'Inline C', doc: 'Embeds a block of C.', snippet: 'includeC ~~~\n\t$0\n~~~' },

    // === Литералы ===
    true:   { kind: vscode.CompletionItemKind.Constant, detail: 'Boolean', doc: 'Boolean `true`.' },
    false:  { kind: vscode.CompletionItemKind.Constant, detail: 'Boolean', doc: 'Boolean `false`.' },
    null:   { kind: vscode.CompletionItemKind.Constant, detail: 'Null', doc: 'Absence of value.' },

    // === Типы ===
    int:    { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: '64-bit signed integer.' },
    float:  { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Floating point number.' },
    double: { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Double-precision float.' },
    char:   { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Only text with length one byte.' },
    string: { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'UTF-8 text.' },
    bool:   { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Boolean.' },
    any:    { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Any value.' },
    void:   { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'No return value.' },
    arr:    { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Array: `arr[T]`.', snippet: 'arr[${1:int}]' },
    dict:   { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Dictionary: `dict`.', snippet: 'dict' },
    T:      { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Union type: `T<T1, T2, ...>`.', snippet: 'T<${1:int}, ${2:...}>' },

    // === Встроенные функции ===
    to_int:     { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `int`.', snippet: 'to_int(${1:value})' },
    to_float:   { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `float`.', snippet: 'to_float(${1:value})' },
    to_double:  { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `double`.', snippet: 'to_double(${1:value})' },
    to_bool:    { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `bool`.', snippet: 'to_bool(${1:value})' },
    to_string:  { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `string`.', snippet: 'to_string(${1:value})' },
    type:       { kind: vscode.CompletionItemKind.Function, detail: 'Built-in', doc: 'Returns the real type name.', snippet: 'type(${1:value})' },
    detruncate: { kind: vscode.CompletionItemKind.Function, detail: 'Built-in', doc: 'Returns the declared type name.', snippet: 'detruncate(${1:value})' },

    async:    { kind: vscode.CompletionItemKind.Keyword, detail: 'Async', doc: 'Async function modifier.', snippet: 'async ${1:int} ${2:name}(${3:args}) {\n\t$0\n}' },
    await:    { kind: vscode.CompletionItemKind.Keyword, detail: 'Await', doc: 'Await a Promise.', snippet: 'await ${1:expr}' },
    break:    { kind: vscode.CompletionItemKind.Keyword, detail: 'Break', doc: 'Break out of loop.' },
    continue: { kind: vscode.CompletionItemKind.Keyword, detail: 'Continue', doc: 'Continue loop.' },
    do:       { kind: vscode.CompletionItemKind.Keyword, detail: 'Do-While', doc: 'Do-while loop.', snippet: 'do {\n\t$0\n} while (${1:condition})' },
    in:       { kind: vscode.CompletionItemKind.Keyword, detail: 'In', doc: 'For-in loop keyword.' },
    Promise:  { kind: vscode.CompletionItemKind.Keyword, detail: 'Promise', doc: 'Promise[T] — async value.', snippet: 'Promise[${1:value}]' },
    IknowIdo: { kind: vscode.CompletionItemKind.Keyword, detail: 'IknowIdo', doc: 'IknowIdo block.', snippet: 'IknowIdo {\n\t$0\n}' },

    // === Встроенные типы ошибок ===
    Error:  { kind: vscode.CompletionItemKind.Class, detail: 'Built-in type', doc: 'Base error with `msg`.' },

    // === Шаблоны ===
    main:      { kind: vscode.CompletionItemKind.Snippet, detail: 'Entry point', doc: 'Main entry point.', snippet: 'void main(arr args) {\n\t$0\n}' },
    function:  { kind: vscode.CompletionItemKind.Snippet, detail: 'Function', doc: 'Function declaration.', snippet: '${1:type} ${2:name}(${3:args}) {\n\t$0\n}' },
    variable:  { kind: vscode.CompletionItemKind.Snippet, detail: 'Variable', doc: 'Variable declaration.', snippet: '${1:type} ${2:name} = ${3:value}' },
    default:   { kind: vscode.CompletionItemKind.Snippet, detail: 'Case default', doc: 'Case default branch declaration.', snippet: '_ {\n\t$0\n},' }
};

// ============================================================
// Helpers
// ============================================================

function formatParam(p) {
    if (p.isVariadic) {
        return `...${p.name} arr[any]`;
    }
    return `${formatType(p.type)} ${p.name}`;
}

/**
 * Форматирует сигнатуру функции.
 */
function formatFunctionSignature(fn) {
    const params = (fn.params || fn.args || [])
        .map(formatParam)
        .join(', ');
    const asyncPrefix = fn.isAsync ? 'async ' : '';
    return `${asyncPrefix}${formatType(fn.returnType)} ${fn.name}(${params})`;
}

/**
 * Находит функцию, внутри тела которой находится позиция.
 */
function findEnclosingFunction(functions, line, character) {
    for (const fn of functions) {
        const start = fn.bodyStart;
        const end = fn.bodyEnd;
        if (!start || !end) continue;

        const afterStart =
            line > start.line ||
            (line === start.line && character > start.col);

        const beforeEnd =
            line < end.line ||
            (line === end.line && character < end.col);

        if (afterStart && beforeEnd) {
            return fn;
        }
    }
    return null;
}

/**
 * Считает блочную глубину (количество { } вокруг) для позиции.
 */
function getBlockDepthAt(document, line, character) {
    const text = document.getText();
    const lines = text.split(/\r\n|\r|\n/);

    let depth = 0;
    for (let i = 0; i < line; i++) {
        for (const ch of lines[i]) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
        }
    }
    // Частичная строка до character
    for (let i = 0; i < character && i < lines[line].length; i++) {
        const ch = lines[line][i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
    }
    return depth;
}

/**
 * Находит символ (функцию, переменную, параметр, error-тип) по имени.
 * Возвращает { line, col, kind, data } или null.
 */
function findSymbol(document, position, word) {
    const text = document.getText();
    const { functions, variables, errorTypes } = analyze(text);

    // 1) Параметр ТЕКУЩЕЙ функции (только если курсор внутри тела)
    const enclosingFn = findEnclosingFunction(functions, position.line, position.character);
    if (enclosingFn) {
        const param = enclosingFn.params.find(p => p.name === word);
        if (param) {
            return {
                line: param.line,
                col: param.col,
                kind: 'parameter',
                data: param,
            };
        }
    }

    // 2) Локальная переменная — только в ТОМ ЖЕ блоке или во внешнем
    const currentBlockDepth = getBlockDepthAt(document, position.line, position.character);
    const localVar = variables.find(v =>
        v.name === word && v.blockDepth <= currentBlockDepth
    );
    if (localVar) {
        return {
            line: localVar.line,
            col: localVar.col,
            kind: 'variable',
            data: localVar,
        };
    }

    // 3) Функция
    const fn = functions.find(f => f.name === word);
    if (fn) {
        return {
            line: fn.line,
            col: fn.col,
            kind: 'function',
            data: fn,
        };
    }

    // 4) Error-тип
    const e = errorTypes.find(x => x.name === word);
    if (e) {
        return {
            line: e.line,
            col: e.col,
            kind: 'errorType',
            data: e,
        };
    }

    return null;
}

// ============================================================
// Activation
// ============================================================

function activateSkorpion(context) {
    console.log('[skorpion] activate');

    const provider = vscode.languages.registerCompletionItemProvider(
        'skorpion',
        {
            provideCompletionItems(document, position) {
                console.log('[skorpion] completion called at', position.line, position.character);
                const items = [];
                const seenNames = new Set();

                // 1) Статические ITEMS
                for (const [name, meta] of Object.entries(ITEMS)) {
                    const item = new vscode.CompletionItem(name, meta.kind);
                    item.detail = meta.detail;
                    if (meta.doc) {
                        const md = new vscode.MarkdownString(meta.doc);
                        md.isTrusted = true;
                        item.documentation = md;
                    }
                    if (meta.snippet) {
                        item.insertText = new vscode.SnippetString(meta.snippet);
                    }
                    items.push(item);
                    seenNames.add(name);
                }

                // 2) Локальные из документа
                const text = document.getText();
                const { functions, variables, errorTypes } = analyze(text);

                const enclosingFn = findEnclosingFunction(
                    functions,
                    position.line,
                    position.character
                );

                // 2a) Локальные функции
                for (const fn of functions) {
                    if (fn.line === position.line && fn.col <= position.character) continue;
                    if (seenNames.has(fn.name)) continue;

                    const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
                    item.detail = 'Local Function';
                    item.insertText = new vscode.SnippetString(`${fn.name}($0)`);
                    item.documentation = new vscode.MarkdownString(
                        '```skorpion\n' + formatFunctionSignature(fn) + '\n```'
                    );
                    items.push(item);
                    seenNames.add(fn.name);
                }

                // 2b) Параметры текущей функции
                if (enclosingFn) {
                    for (const p of enclosingFn.params) {
                        if (seenNames.has(p.name)) continue;

                        const item = new vscode.CompletionItem(
                            p.name,
                            vscode.CompletionItemKind.Variable
                        );
                        item.detail = p.isVariadic
                            ? `(parameter) ...${p.name}: arr[any]`
                            : `(parameter) ${formatType(p.type)}`;
                        item.sortText = '0_' + p.name;
                        item.documentation = new vscode.MarkdownString(
                            '```skorpion\n' +
                            (p.isVariadic
                                ? `(parameter) ...${p.name}: arr[any]`
                                : `(parameter) ${p.name}: ${formatType(p.type)}`) +
                            '\n```'
                        );
                        items.push(item);
                        seenNames.add(p.name);
                    }
                }

                const currentBlockDepth = getBlockDepthAt(document, position.line, position.character);

                // 2c) Локальные переменные
                for (const v of variables) {
                    if (v.line === position.line && v.col <= position.character) continue;
                    if (seenNames.has(v.name)) continue;
                    if (v.blockDepth > currentBlockDepth) continue;   // ← НЕ показывать переменные из других/вложенных блоков

                    const item = new vscode.CompletionItem(v.name, vscode.CompletionItemKind.Variable);
                    item.detail = 'Local Variable';
                    item.documentation = new vscode.MarkdownString(
                        '```skorpion\n' + `${formatType(v.type)} ${v.name}` + '\n```'
                    );
                    items.push(item);
                    seenNames.add(v.name);
                }

                // 2d) Типы ошибок
                for (const e of errorTypes) {
                    if (seenNames.has(e.name)) continue;

                    const item = new vscode.CompletionItem(e.name, vscode.CompletionItemKind.Class);
                    item.detail = 'Local Error Type';

                    const fields = (e.fields || [])
                        .map(f => `${f.name}: ${formatType(f.type)}`)
                        .join(', ');
                    const signature = `const ${e.name}{${fields}} = new ${e.parent || 'Error'}`;

                    item.documentation = new vscode.MarkdownString(
                        '```skorpion\n' + signature + '\n```'
                    );
                    items.push(item);
                    seenNames.add(e.name);
                }

                console.log('[skorpion] returning', items.length, 'items');
                return items;
            }
        },
        '.'
    );

    const hover = vscode.languages.registerHoverProvider('skorpion', {
        provideHover(document, position) {
            console.log('[skorpion] hover called');
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
            if (!range) return;

            const word = document.getText(range);

            // 1) Статические ITEMS
            const meta = ITEMS[word];
            if (meta) {
                const md = new vscode.MarkdownString();
                md.isTrusted = true;
                md.appendMarkdown(`**${word}** — ${meta.detail}\n\n`);
                if (meta.doc) md.appendMarkdown(meta.doc + '\n\n');
                if (meta.snippet) {
                    const plain = meta.snippet
                        .replace(/\$\{\d+:([^}]*)\}/g, '$1')
                        .replace(/\$\d+/g, '');
                    md.appendCodeblock(plain, 'skorpion');
                }
                return new vscode.Hover(md, range);
            }

            // 2) Локальные символы (параметр / переменная / функция / error-тип)
            const symbol = findSymbol(document, position, word);
            if (symbol) {
                const md = new vscode.MarkdownString();

                if (symbol.kind === 'parameter') {
                    const p = symbol.data;
                    md.appendMarkdown('**(parameter)**\n\n');
                    md.appendCodeblock(
                        p.isVariadic
                            ? `(parameter) ...${p.name}: arr[any]`
                            : `(parameter) ${p.name}: ${formatType(p.type)}`,
                        'skorpion'
                    );
                } else if (symbol.kind === 'variable') {
                    const v = symbol.data;
                    md.appendMarkdown('**Local Variable**\n\n');
                    md.appendCodeblock(`${formatType(v.type)} ${v.name}`, 'skorpion');
                } else if (symbol.kind === 'function') {
                    const fn = symbol.data;
                    md.appendMarkdown('**Local Function**\n\n');
                    md.appendCodeblock(formatFunctionSignature(fn), 'skorpion');
                } else if (symbol.kind === 'errorType') {
                    const e = symbol.data;
                    md.appendMarkdown('**Local Error Type**\n\n');
                    const fields = (e.fields || [])
                        .map(f => `${f.name}: ${formatType(f.type)}`)
                        .join(', ');
                    md.appendCodeblock(
                        `const ${e.name}{${fields}} = new ${e.parent || 'Error'}`,
                        'skorpion'
                    );
                }

                return new vscode.Hover(md, range);
            }
        }
    });

    // ============================================================
    // Definition provider — Ctrl+Click / F12 на функции, переменные,
    // параметры, error-типы
    // ============================================================
    const definition = vscode.languages.registerDefinitionProvider('skorpion', {
        provideDefinition(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
            if (!range) return;

            const word = document.getText(range);
            const symbol = findSymbol(document, position, word);
            if (!symbol) return;

            return new vscode.Location(
                document.uri,
                new vscode.Position(symbol.line, symbol.col)
            );
        }
    });

    // Optional: подсветка всех вхождений под курсором
    const documentHighlight = vscode.languages.registerDocumentHighlightProvider('skorpion', {
        provideDocumentHighlights(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
            if (!range) return;

            const word = document.getText(range);
            if (!word) return;

            const text = document.getText();
            const highlights = [];
            const re = new RegExp(`\\b${word}\\b`, 'g');
            const lines = text.split(/\r\n|\r|\n/);

            for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                let m;
                re.lastIndex = 0;
                while ((m = re.exec(lines[lineIdx])) !== null) {
                    highlights.push(
                        new vscode.DocumentHighlight(
                            new vscode.Range(
                                lineIdx, m.index,
                                lineIdx, m.index + word.length
                            ),
                            vscode.DocumentHighlightKind.Text
                        )
                    );
                }
            }
            return highlights;
        }
    });

    context.subscriptions.push(provider, hover, definition, documentHighlight);
}

module.exports = { activateSkorpion };