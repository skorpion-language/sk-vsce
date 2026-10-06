// skorpion.js
const vscode = require('vscode');
const { analyze, formatType } = require('./lexer');

const ITEMS = {
    // === Ключевые слова ===
    if:     { kind: vscode.CompletionItemKind.Keyword, detail: 'Conditional', doc: 'Conditional branch.', snippet: 'if (${1:condition}) {\n\t$0\n}' },
    elsif:  { kind: vscode.CompletionItemKind.Keyword, detail: 'Conditional', doc: 'Else-if branch.', snippet: 'elsif (${1:condition}) {\n\t$0\n}' },
    else:   { kind: vscode.CompletionItemKind.Keyword, detail: 'Conditional', doc: 'Final branch.', snippet: 'else {\n\t$0\n}' },
    while:  { kind: vscode.CompletionItemKind.Keyword, detail: 'Loop', doc: 'Loop while true.', snippet: 'while (${1:condition}) {\n\t$0\n}' },
    for:    { kind: vscode.CompletionItemKind.Keyword, detail: 'Loop', doc: 'Iterate over a collection.', snippet: 'for (${1:item} in ${2:collection}) {\n\t$0\n}' },
    case:   { kind: vscode.CompletionItemKind.Keyword, detail: 'Switch', doc: 'Multi-branch switch.', snippet: 'case (${1:value}) {\n\t${2:1} { $3 },\n\t_ { $0 },\n}' },
    try:    { kind: vscode.CompletionItemKind.Keyword, detail: 'Exception handling', doc: 'Try block.', snippet: 'try {\n\t$0\n}' },
    catch:  { kind: vscode.CompletionItemKind.Keyword, detail: 'Exception handling', doc: 'Catch block.', snippet: 'catch (${1:Error} as ${2:e}) {\n\t$0\n}' },
    throw:  { kind: vscode.CompletionItemKind.Keyword, detail: 'Exception handling', doc: 'Throw an error.', snippet: 'throw ${1:BaseError}{code: ${2:1}}' },
    return: { kind: vscode.CompletionItemKind.Keyword, detail: 'Return', doc: 'Return from a function.', snippet: 'return ${1:value}' },

    const:  { kind: vscode.CompletionItemKind.Keyword, detail: 'Declaration', doc: 'Immutable binding.', snippet: 'const ${1:Name}{${2:field: type}} = new ${3:Error}' },
    new:    { kind: vscode.CompletionItemKind.Keyword, detail: 'Constructor', doc: 'Creates an instance.', snippet: 'new ${1:Error}' },
    as:     { kind: vscode.CompletionItemKind.Keyword, detail: 'Binding', doc: 'Binds a caught error.' },
    use:    { kind: vscode.CompletionItemKind.Keyword, detail: 'Import', doc: 'Imports a module.', snippet: 'use #${1:std/io}' },
    includeC: { kind: vscode.CompletionItemKind.Keyword, detail: 'Inline C', doc: 'Embeds a block of C.', snippet: 'includeC ~~~\n\t$0\n~~~' },

    // === Литералы ===
    true:   { kind: vscode.CompletionItemKind.Constant, detail: 'Boolean', doc: 'Boolean `true`.' },
    false:  { kind: vscode.CompletionItemKind.Constant, detail: 'Boolean', doc: 'Boolean `false`.' },
    null:   { kind: vscode.CompletionItemKind.Constant, detail: 'Null', doc: 'Absence of value.' },

    // === Типы ===
    int:    { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: '64-bit signed integer.' },
    float:  { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Floating point number.' },
    double: { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Double-precision float.' },
    string: { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'UTF-8 text.' },
    bool:   { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Boolean.' },
    any:    { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Any value.' },
    void:   { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'No return value.' },
    arr:    { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Array: `arr[T]`.', snippet: 'arr[${1:int}]' },
    T:  { kind: vscode.CompletionItemKind.TypeParameter, detail: 'Type', doc: 'Union type: `T<T1, T2, ...>`.', snippet: 'T<${1:int}, ${2:...}>' },

    // === Встроенные функции ===
    to_int:     { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `int`.', snippet: 'to_int(${1:value})' },
    to_float:   { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `float`.', snippet: 'to_float(${1:value})' },
    to_double:  { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `double`.', snippet: 'to_double(${1:value})' },
    to_bool:    { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `bool`.', snippet: 'to_bool(${1:value})' },
    to_string:  { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `string`.', snippet: 'to_string(${1:value})' },
    type:       { kind: vscode.CompletionItemKind.Function, detail: 'Built-in', doc: 'Returns the real type name.', snippet: 'type(${1:value})' },
    detruncate: { kind: vscode.CompletionItemKind.Function, detail: 'Built-in', doc: 'Returns the declared type name.', snippet: 'detruncate(${1:value})' },

    // === Встроенные типы ошибок ===
    Error:  { kind: vscode.CompletionItemKind.Class, detail: 'Built-in type', doc: 'Base error with `msg`.' },

    // === Шаблоны ===
    main:     { kind: vscode.CompletionItemKind.Snippet, detail: 'Entry point', doc: 'Main entry point.', snippet: 'void main(arr args) {\n\t$0\n}' },
    function: { kind: vscode.CompletionItemKind.Snippet, detail: 'Function', doc: 'Function declaration.', snippet: '${1:type} ${2:name}(${3:args}) {\n\t$0\n}' },
    variable: { kind: vscode.CompletionItemKind.Snippet, detail: 'Variable', doc: 'Variable declaration.', snippet: '${1:type} ${2:name} = ${3:value}' }
};

// ============================================================
// Helpers
// ============================================================

/**
 * Форматирует сигнатуру функции.
 * Обратите внимание: у нас params, а не args — как в новом lexer.js.
 */
function formatFunctionSignature(fn) {
    const params = (fn.params || fn.args || [])
        .map(p => `${formatType(p.type)} ${p.name}`)
        .join(', ');
    return `${formatType(fn.returnType)} ${fn.name}(${params})`;
}

/**
 * Находит функцию, внутри тела которой находится позиция.
 * @param {Array} functions — из analyze()
 * @param {number} line — 0-based
 * @param {number} character — 0-based
 * @returns {object|null}
 */
function findEnclosingFunction(functions, line, character) {
    for (const fn of functions) {
        const start = fn.bodyStart;
        const end = fn.bodyEnd;
        if (!start || !end) continue;

        // Позиция после {
        const afterStart =
            line > start.line ||
            (line === start.line && character > start.col);

        // Позиция до }
        const beforeEnd =
            line < end.line ||
            (line === end.line && character < end.col);

        if (afterStart && beforeEnd) {
            return fn;
        }
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

                // Найти функцию, в теле которой стоит курсор
                const enclosingFn = findEnclosingFunction(
                    functions,
                    position.line,
                    position.character
                );

                // 2a) Локальные функции
                for (const fn of functions) {
                    // Не предлагать функцию в её собственном объявлении
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
                        item.detail = `(parameter) ${formatType(p.type)}`;
                        item.sortText = '0_' + p.name; // параметры выше обычных переменных
                        item.documentation = new vscode.MarkdownString(
                            '```skorpion\n' +
                            `(parameter) ${p.name}: ${formatType(p.type)}\n` +
                            '```'
                        );
                        items.push(item);
                        seenNames.add(p.name);
                    }
                }

                // 2c) Локальные переменные
                for (const v of variables) {
                    if (v.line === position.line && v.col <= position.character) continue;
                    if (seenNames.has(v.name)) continue;

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

            // 2) Локальные из документа
            const text = document.getText();
            const { functions, variables, errorTypes } = analyze(text);

            // Параметры текущей функции — приоритетнее одноимённых переменных
            const enclosingFn = findEnclosingFunction(
                functions,
                position.line,
                position.character
            );
            if (enclosingFn) {
                const param = enclosingFn.params.find(p => p.name === word);
                if (param) {
                    const md = new vscode.MarkdownString();
                    md.appendMarkdown('**(parameter)**\n\n');
                    md.appendCodeblock(
                        `(parameter) ${param.name}: ${formatType(param.type)}`,
                        'skorpion'
                    );
                    return new vscode.Hover(md, range);
                }
            }

            const fn = functions.find(f => f.name === word);
            if (fn) {
                const md = new vscode.MarkdownString();
                md.appendMarkdown('**Local Function**\n\n');
                md.appendCodeblock(formatFunctionSignature(fn), 'skorpion');
                return new vscode.Hover(md, range);
            }

            const v = variables.find(x => x.name === word);
            if (v) {
                const md = new vscode.MarkdownString();
                md.appendMarkdown('**Local Variable**\n\n');
                md.appendCodeblock(`${formatType(v.type)} ${v.name}`, 'skorpion');
                return new vscode.Hover(md, range);
            }

            const e = errorTypes.find(x => x.name === word);
            if (e) {
                const md = new vscode.MarkdownString();
                md.appendMarkdown('**Local Error Type**\n\n');
                const fields = (e.fields || [])
                    .map(f => `${f.name}: ${formatType(f.type)}`)
                    .join(', ');
                md.appendCodeblock(
                    `const ${e.name}{${fields}} = new ${e.parent || 'Error'}`,
                    'skorpion'
                );
                return new vscode.Hover(md, range);
            }
        }
    });

    const definition = vscode.languages.registerDefinitionProvider('skorpion', {
        provideDefinition(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
            if (!range) return;

            const word = document.getText(range);
            const text = document.getText();
            const { functions, variables, errorTypes } = analyze(text);

            const target =
                functions.find(f => f.name === word) ||
                variables.find(v => v.name === word) ||
                errorTypes.find(e => e.name === word);

            if (!target) return;

            return new vscode.Location(
                document.uri,
                new vscode.Position(target.line, target.col)
            );
        }
    });

    context.subscriptions.push(provider, hover, definition);
}

module.exports = { activateSkorpion };