// skorpion.js
const vscode = require('vscode');

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

    // === Встроенные функции ===
    to_int:     { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `int`.', snippet: 'to_int(${1:value})' },
    to_float:   { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `float`.', snippet: 'to_float(${1:value})' },
    to_double:  { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `double`.', snippet: 'to_double(${1:value})' },
    to_bool:    { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `bool`.', snippet: 'to_bool(${1:value})' },
    to_string:  { kind: vscode.CompletionItemKind.Function, detail: 'Conversion', doc: 'Converts to `string`.', snippet: 'to_string(${1:value})' },
    type:       { kind: vscode.CompletionItemKind.Function, detail: 'Built-in', doc: 'Returns the real type name.', snippet: 'type(${1:value})' },
    detruncate: { kind: vscode.CompletionItemKind.Function, detail: 'Built-in', doc: 'Returns the declared type name.', snippet: 'detruncate(${1:value})' },

    // === Встроенные типы ошибок ===
    Error:        { kind: vscode.CompletionItemKind.Class, detail: 'Built-in type', doc: 'Base error with `msg`.' },

    // === Шаблоны ===
    main:     { kind: vscode.CompletionItemKind.Snippet, detail: 'Entry point', doc: 'Main entry point.', snippet: 'void main(arr args) {\n\t$0\n}' },
    function: { kind: vscode.CompletionItemKind.Snippet, detail: 'Function', doc: 'Function declaration.', snippet: '${1:type} ${2:name}(${3:args}) {\n\t$0\n}' },
    variable: { kind: vscode.CompletionItemKind.Snippet, detail: 'Variable', doc: 'Variable declaration.', snippet: '${1:type} ${2:name} = ${3:value}' }
};

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isKeyword(w) {
    return /^(if|elsif|else|while|for|case|try|catch|throw|return|break|continue|new|as|in|use|const|void|includeC|true|false|null)$/.test(w);
}

function findFunctionDeclaration(document, name, skipLine) {
    const lines = document.getText().split(/\r\n|\r|\n/);

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        if (lineIdx === skipLine) continue;

        const line = lines[lineIdx];

        // Ищем `name(` БЕЗ пробела между name и скобкой.
        // Пробел между именем и `(` означает конструкцию (if, while, for, catch),
        // а не вызов/объявление функции.
        // Опциональный `*` перед именем — для non-exportable.
        const declRegex = new RegExp(`(^|[\\s*])(${escapeRegex(name)})\\(`, 'g');

        let m;
        while ((m = declRegex.exec(line)) !== null) {
            const nameStart = m.index + m[1].length;
            const nameEnd = nameStart + name.length;

            // openParen — сразу после имени, без пробелов
            const openParen = nameEnd;

            // Ищем закрывающую `)` с учётом вложенности
            let depth = 0;
            let closeParen = -1;
            for (let i = openParen; i < line.length; i++) {
                if (line[i] === '(') depth++;
                else if (line[i] === ')') {
                    depth--;
                    if (depth === 0) { closeParen = i; break; }
                }
            }
            if (closeParen < 0) continue;

            const rest = line.slice(closeParen + 1).trimStart();

            // После `)` — либо `{` на той же строке, либо `{` на следующей непустой
            let hasBody = rest.startsWith('{');
            if (!hasBody && rest.length === 0) {
                for (let j = lineIdx + 1; j < lines.length; j++) {
                    const next = lines[j].trimStart();
                    if (next.length === 0) continue;
                    hasBody = next.startsWith('{');
                    break;
                }
            }
            if (!hasBody) continue;

            // ПРОВЕРКА: перед именем должен быть тип (непустой beforeName)
            const beforeName = line.slice(0, nameStart).trimEnd();
            if (beforeName.length === 0) continue;

            // ПРОВЕРКА: beforeName — не keyword (дополнительная страховка)
            const kw = beforeName.match(/([A-Za-z_]\w*)\s*$/);
            if (kw && isKeyword(kw[1])) continue;

            return { line: lineIdx, col: nameStart };
        }
    }

    return null;
}

function activateSkorpion(context) {
    console.log('[skorpion] activate');

    const provider = vscode.languages.registerCompletionItemProvider(
        'skorpion',
        {
            provideCompletionItems() {
                const items = [];
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
                }
                return items;
            }
        },
        '.'
    );

    const hover = vscode.languages.registerHoverProvider('skorpion', {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
            if (!range) return;

            const word = document.getText(range);
            const meta = ITEMS[word];
            if (!meta) return;

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
    });

    const definition = vscode.languages.registerDefinitionProvider('skorpion', {
        provideDefinition(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
            if (!range) return;

            const word = document.getText(range);
            const loc = findFunctionDeclaration(document, word, position.line);
            if (!loc) return;

            return new vscode.Location(
                document.uri,
                new vscode.Position(loc.line, loc.col)
            );
        }
    });

    context.subscriptions.push(provider, hover, definition);
}

module.exports = { activateSkorpion };