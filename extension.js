// extension.js
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const { activateSkorpion } = require('./skorpion');
const { activateSpc } = require('./spc');

// ============================================================
// Webview Provider
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
                case 'cleanLogs':
                    const terminal = vscode.window.createTerminal('Skorpion Clean');
                    terminal.sendText('skorpion clear-local');
                    terminal.show();
                    break;
                case 'run':
                    await vscode.commands.executeCommand('skorpion.run');
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

    unlink() {
        this.isInitialized = false;
        if (this._view) {
            this._updateHtml();
        }
    }

    // Обновление без сброса isInitialized
    updateManifestInfo() {
        if (this._view) {
            this._updateHtml();
        }
    }

    _parseManifest() {
        const root = getWorkspaceRoot();
        if (!root) return null;
        
        const manifestPath = path.join(root, 'manifest.spc');
        if (!fs.existsSync(manifestPath)) return null;

        const content = fs.readFileSync(manifestPath, 'utf8');
        const data = {};
        const regex = /^(\w+)\["(.*)"\]$/gm;
        let match;
        while ((match = regex.exec(content)) !== null) {
            data[match[1]] = match[2];
        }
        return data;
    }

    _updateHtml() {
        if (!this._view) return;

        const codiconsUri = this._view.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
        );

        const baseStyles = `
            <style>
                body {
                    padding: 0 20px;
                    font-family: var(--vscode-font-family);
                    font-size: 13px;
                    color: var(--vscode-foreground);
                    line-height: 1.5;
                }
                p { margin-top: 0; margin-bottom: 12px; }
                
                .btn {
                    width: 100%; padding: 4px 12px; margin-bottom: 8px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none; border-radius: 2px; cursor: pointer;
                    font-family: inherit; font-size: 13px;
                    text-align: center; box-sizing: border-box;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                }
                .btn:hover { background: var(--vscode-button-hoverBackground); }
                .btn-secondary {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
                
                .link { font-size: 13px; color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
                .link:hover { text-decoration: underline; }
                .container { padding-top: 10px; }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 15px;
                    font-size: 12px;
                }
                th {
                    text-align: left;
                    padding: 4px 8px;
                    border-bottom: 2px solid var(--vscode-widget-border, #444);
                    font-weight: bold;
                }
                td {
                    padding: 4px 8px;
                    border-bottom: 1px solid var(--vscode-widget-border, #333);
                    opacity: 0.9;
                }
                tr:last-child td { border-bottom: none; }
            </style>
        `;

        if (!this.isInitialized) {
            this._view.webview.html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    ${baseStyles}
                    <link rel="stylesheet" href="${codiconsUri}">
                </head>
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
            const manifest = this._parseManifest();
            let projectInfoHtml = '';
            
            if (manifest) {
                projectInfoHtml = `
                    <table>
                        <thead>
                            <tr><th>Property</th><th>Value</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>Name</td><td>${manifest.name || 'Unknown'}</td></tr>
                            <tr><td>Version</td><td>${manifest.version || 'Unknown'}</td></tr>
                            <tr><td>Main</td><td>${manifest.main || 'Unknown'}</td></tr>
                        </tbody>
                    </table>
                `;
            } else {
                projectInfoHtml = `<p style="font-size: 12px; opacity: 0.7;">No manifest.spc found.</p>`;
            }

            this._view.webview.html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    ${baseStyles}
                    <link rel="stylesheet" href="${codiconsUri}">
                </head>
                <body>
                    <div class="container">
                        ${projectInfoHtml}
                        
                        <button class="btn" onclick="send('run')" style="background: var(--vscode-testing-iconPassed); color: #fff; margin-bottom: 12px;">
                            <span class="codicon codicon-play"></span> Run Project
                        </button>
                        
                        <button class="btn" onclick="send('createTemplate')">
                            <span class="codicon codicon-references"></span> Create template
                        </button>
                        <button class="btn btn-secondary" onclick="send('updateGitignore')">
                            <span class="codicon codicon-file-symlink-file"></span> Add (update) .gitignore
                        </button>
                        <button class="btn btn-secondary" onclick="send('cleanLogs')">
                            <span class="codicon codicon-trash"></span> Clean Project Logs
                        </button>
                        
                        <p style="margin-top: 20px; font-size: 12px; text-align: center; vertical-align: middle;">
                            <a class="link" href="https://github.com/skorpion-language/snar"> Documentation</a> <span style="padding: 0 5%; vertical-align: text-bottom;"><span class="codicon codicon-circle-small"></span></span> 
                            <a class="link" href="https://github.com/skorpion-language/sk-vsce/issues"> Report an Issue</a>
                        </p>
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
// Активация
// ============================================================
function activate(context) {
    console.log('[sk-vsce] ACTIVATED');

    activateSkorpion(context);
    activateSpc(context);

    const isInitialized = context.workspaceState.get('skorpion.projectInitialized', false);
    vscode.commands.executeCommand('setContext', 'skorpion.projectInitialized', isInitialized);
    const provider = new SkorpionViewProvider(context, isInitialized);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('skorpion-main-view', provider)
    );

    // Слушаем изменения в документах
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            // Если изменился manifest.spc — обновляем панель
            if (e.document.fileName.endsWith('manifest.spc')) {
                provider.updateManifestInfo();
            }
        })
    );

    // Слушаем сохранение файлов (на случай внешних изменений)
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.fileName.endsWith('manifest.spc')) {
                provider.updateManifestInfo();
            }
        })
    );

    // Команды
    context.subscriptions.push(
        vscode.commands.registerCommand('skorpion.initProject', async () => {
            await context.workspaceState.update('skorpion.projectInitialized', true);
            await vscode.commands.executeCommand('setContext', 'skorpion.projectInitialized', true);
            provider.refresh();
            vscode.window.showInformationMessage('Skorpion project initialized.');
        }),
        vscode.commands.registerCommand('skorpion.unlinkInit', async () => {
            await context.workspaceState.update('skorpion.projectInitialized', false);
            await vscode.commands.executeCommand('setContext', 'skorpion.projectInitialized', false);
            provider.unlink();
            vscode.window.showInformationMessage('Skorpion project unlinked.');
        }),
        vscode.commands.registerCommand('skorpion.createTemplate', async () => {
            const root = getWorkspaceRoot();
            if (!root) return;

            const files = {
                'main.sk': `use #std/io\n\nvoid main(arr args) {\n    sendln("Hello, Skorpion!")\n}\n`,
                '.gitignore': `./logs\n./libs\n`,
                'README.md': `# Skorpion Project\n\nCreated with Skorpion extension.\n`,
                'manifest.spc': `name["MyProject"]\nversion["1.0.0"]\nmain["main.sk"]\n`
            };

            for (const [name, content] of Object.entries(files)) {
                const filePath = path.join(root, name);
                if (name === '.gitignore' && fs.existsSync(filePath)) continue;
                try {
                    fs.writeFileSync(filePath, content, 'utf8');
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to create ${name}: ${err.message}`);
                }
            }
            provider.updateManifestInfo(); // Обновляем панель после создания
            vscode.window.showInformationMessage('Skorpion template created.');
        }),
        vscode.commands.registerCommand('skorpion.updateGitignore', async () => {
            const root = getWorkspaceRoot();
            if (!root) return;

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

            if (content.length > 0 && !content.endsWith('\n')) content += '\n';
            content += missing.join('\n') + '\n';

            fs.writeFileSync(gitignorePath, content, 'utf8');
            vscode.window.showInformationMessage(`Added ${missing.length} entries to .gitignore.`);
        }),
        // НОВАЯ КОМАНДА: Запуск проекта
        vscode.commands.registerCommand('skorpion.run', async () => {
            const root = getWorkspaceRoot();
            if (!root) {
                vscode.window.showErrorMessage('No workspace folder open.');
                return;
            }

            // 1. Проверяем/создаем launch.json
            const vscodeDir = path.join(root, '.vscode');
            const launchPath = path.join(vscodeDir, 'launch.json');
            
            if (!fs.existsSync(vscodeDir)) {
                fs.mkdirSync(vscodeDir);
            }
            
            let launchConfig = { version: "0.2.0", configurations: [] };
            if (fs.existsSync(launchPath)) {
                try {
                    const existing = fs.readFileSync(launchPath, 'utf8');
                    launchConfig = JSON.parse(existing);
                } catch (e) {}
            }

            // Проверяем, есть ли уже наша конфигурация
            if (!launchConfig.configurations) launchConfig.configurations = [];
            const hasConfig = launchConfig.configurations.some(c => c.type === 'skorpion' && c.name === 'Skorpion: Debug current project');
            if (!hasConfig) {
                launchConfig.configurations.push({
                    type: "skorpion",
                    request: "launch",
                    name: "Skorpion: Debug current project",
                    cwd: "${workspaceFolder}"
                });
                fs.writeFileSync(launchPath, JSON.stringify(launchConfig, null, 4), 'utf8');
            }

            // 2. Запускаем отладчик
            try {
                await vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], 'Skorpion: Debug current project');
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to start debugger: ${err.message}`);
            }
        })
    );
}

function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
}

function deactivate() {
    console.log('[sk-vsce] DEACTIVATED');
}

module.exports = { activate, deactivate };