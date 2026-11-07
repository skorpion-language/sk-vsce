// extension.js
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

// Твои существующие модули
const { activateSkorpion } = require('./skorpion');
const { activateSpc } = require('./spc');

// ============================================================
// Webview Provider для панели Skorpion Tools
// ============================================================
class SkorpionViewProvider {
    constructor(context, isInitialized) {
        this.context = context;
        this.isInitialized = isInitialized;
        this._view = null;
    }

    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'init':
                    await vscode.commands.executeCommand('skorpion.initProject');
                    break;
                case 'createTemplate':
                    await vscode.commands.executeCommand('skorpion.createTemplate');
                    break;
                case 'updateGitignore':
                    await vscode.commands.executeCommand('skorpion.updateGitignore');
                    break;
            }
        });

        this._updateHtml();
    }

    refresh() {
        this.isInitialized = true;
        if (this._view) {
            this._updateHtml();
        }
    }

    _updateHtml() {
        if (!this._view) return;

        // Общие стили для всех состояний (шрифт, цвета, кнопки)
        const baseStyles = `
            <style>
                body {
                    padding: 0 20px; /* Отступы по бокам как в нативных панелях */
                    font-family: var(--vscode-font-family);
                    font-size: 13px; /* Стандартный размер шрифта VS Code */
                    color: var(--vscode-foreground);
                    line-height: 1.5;
                }
                p {
                    margin-top: 0;
                    margin-bottom: 12px;
                }
                .btn {
                    width: 100%;
                    padding: 4px 12px; /* Тонкие кнопки как в VS Code */
                    margin-bottom: 8px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 13px;
                    text-align: center;
                    box-sizing: border-box;
                }
                .btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .btn-secondary {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .btn-secondary:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                }
                .link {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                    cursor: pointer;
                }
                .link:hover {
                    text-decoration: underline;
                }
                .container {
                    padding-top: 10px;
                }
            </style>
        `;

        if (!this.isInitialized) {
            // Экран до инициализации (как "Initialize Repository")
            this._view.webview.html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>${baseStyles}</head>
                <body>
                    <div class="container">
                        <p>The folder currently open doesn't have a Skorpion project.</p>
                        <button class="btn" onclick="send('init')">Initialize Project</button>
                        <p>To learn more about Skorpion, <a class="link" href="https://github.com/skorpion-language">read our docs</a>.</p>
                    </div>
                    <script>
                        const vscode = acquireVsCodeApi();
                        function send(cmd) { vscode.postMessage({ command: cmd }); }
                    </script>
                </body>
                </html>
            `;
        } else {
            // Экран после инициализации
            this._view.webview.html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>${baseStyles}</head>
                <body>
                    <div class="container">
                        <button class="btn" onclick="send('createTemplate')">Create template</button>
                        <button class="btn btn-secondary" onclick="send('updateGitignore')">Add (update) .gitignore</button>
                    </div>
                    <script>
                        const vscode = acquireVsCodeApi();
                        function send(cmd) { vscode.postMessage({ command: cmd }); }
                    </script>
                </body>
                </html>
            `;
        }
    }
}

// ============================================================
// Активация расширения
// ============================================================
function activate(context) {
    console.log('[sk-vsce] ACTIVATED');

    activateSkorpion(context);
    activateSpc(context);

    // Читаем состояние из workspaceState (оно переживает перезагрузку)
    const isInitialized = context.workspaceState.get('skorpion.projectInitialized', false);
    const provider = new SkorpionViewProvider(context, isInitialized);

    // Регистрируем Webview Provider для нашей панели
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('skorpion-main-view', provider)
    );

    // ============================================================
    // Команда: Init project
    // ============================================================
    const initProject = vscode.commands.registerCommand('skorpion.initProject', async () => {
        await context.workspaceState.update('skorpion.projectInitialized', true);
        provider.refresh();
        vscode.window.showInformationMessage('Skorpion project initialized.');
    });

    // ============================================================
    // Команда: Create template
    // ============================================================
    const createTemplate = vscode.commands.registerCommand('skorpion.createTemplate', async () => {
        const root = getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }

        const files = {
            'main.sk': `use #std/io\n\nvoid main(arr args) {\n    sendln("Hello, Skorpion!")\n}\n`,
            '.gitignore': `./logs\n./libs\n`,
            'README.md': `# Skorpion Project\n\nCreated with Skorpion extension.\n`,
            'manifest.spc': `name["MyProject"]\nversion["1.0.0"]\nmain["main.sk"]\n`
        };

        for (const [name, content] of Object.entries(files)) {
            const filePath = path.join(root, name);
            if (name === '.gitignore' && fs.existsSync(filePath)) {
                continue;
            }
            try {
                fs.writeFileSync(filePath, content, 'utf8');
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to create ${name}: ${err.message}`);
            }
        }
        vscode.window.showInformationMessage('Skorpion template created.');
    });

    // ============================================================
    // Команда: Add (update) .gitignore
    // ============================================================
    const updateGitignore = vscode.commands.registerCommand('skorpion.updateGitignore', async () => {
        const root = getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }

        const gitignorePath = path.join(root, '.gitignore');
        const linesToAdd = ['./logs', './libs'];
        let content = '';

        if (fs.existsSync(gitignorePath)) {
            content = fs.readFileSync(gitignorePath, 'utf8');
        }

        const existingLines = new Set(content.split(/\r?\n/).map(l => l.trim()));
        const missing = linesToAdd.filter(l => !existingLines.has(l));

        if (missing.length === 0) {
            vscode.window.showInformationMessage('.gitignore already contains all required entries.');
            return;
        }

        if (content.length > 0 && !content.endsWith('\n')) {
            content += '\n';
        }
        content += missing.join('\n') + '\n';

        fs.writeFileSync(gitignorePath, content, 'utf8');
        vscode.window.showInformationMessage(`Added ${missing.length} entries to .gitignore.`);
    });

    context.subscriptions.push(initProject, createTemplate, updateGitignore);
}

// ============================================================
// Хелперы
// ============================================================
function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
}

function deactivate() {
    console.log('[sk-vsce] DEACTIVATED');
}

module.exports = { activate, deactivate };