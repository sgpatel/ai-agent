// settingsView.ts
import * as vscode from 'vscode';
import { escapeHtml } from './utils';

interface SettingsFormData {
    provider: string;
    openaiKey: string;
    ollamaKey: string;
}

export class SettingsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aiAssistant.settings';
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };

        this.updateWebview();
        this.setupMessageHandlers();
    }

    private getCurrentConfig(): SettingsFormData {
        const config = vscode.workspace.getConfiguration('aiAssistant');
        return {
            provider: config.get('selectedProvider', 'OpenAI'),
            openaiKey: config.get('apiKeys.openai', ''),
            ollamaKey: config.get('apiKeys.ollama', '')
        };
    }

    private async saveConfig(data: SettingsFormData) {
        await vscode.workspace.getConfiguration('aiAssistant').update(
            'selectedProvider',
            data.provider,
            vscode.ConfigurationTarget.Global
        );
        
        await vscode.workspace.getConfiguration('aiAssistant').update(
            'apiKeys.openai',
            data.openaiKey,
            vscode.ConfigurationTarget.Global
        );
        
        await vscode.workspace.getConfiguration('aiAssistant').update(
            'apiKeys.ollama',
            data.ollamaKey,
            vscode.ConfigurationTarget.Global
        );
    }

    private setupMessageHandlers() {
        this._view!.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'save':
                    if (this.validateForm(message.data)) {
                        await this.saveConfig(message.data);
                        vscode.window.showInformationMessage('Settings saved successfully!');
                        this.updateWebview();
                    }
                    break;
                
                case 'getConfig':
                    this.sendConfigToWebview();
                    break;
            }
        });
    }

    private sendConfigToWebview() {
        if (!this._view) return;
        
        const config = this.getCurrentConfig();
        this._view.webview.postMessage({
            command: 'config',
            data: config
        });
    }

    private validateForm(data: SettingsFormData): boolean {
        if (data.provider === 'OpenAI' && !data.openaiKey) {
            vscode.window.showErrorMessage('OpenAI API key is required');
            return false;
        }
        
        if (data.provider === 'Ollama' && !data.ollamaKey) {
            vscode.window.showErrorMessage('Ollama API key is required');
            return false;
        }
        
        return true;
    }

    private updateWebview() {
        if (!this._view) return;

        const config = this.getCurrentConfig();
        
        this._view.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    ${this.getStyles()}
                </style>
            </head>
            <body>
                <h1>AI Assistant Settings</h1>
                <div class="error-message" id="errorMessage"></div>
                
                <form id="settingsForm">
                    <div class="form-group">
                        <label for="provider">AI Provider:</label>
                        <select id="provider" name="provider">
                            <option value="OpenAI" ${config.provider === 'OpenAI' ? 'selected' : ''}>OpenAI</option>
                            <option value="Ollama" ${config.provider === 'Ollama' ? 'selected' : ''}>Ollama</option>
                        </select>
                    </div>

                    <div class="form-group ${config.provider === 'OpenAI' ? 'active' : ''}" id="openaiGroup">
                        <label for="openaiKey">OpenAI API Key:</label>
                        <input type="password" 
                               id="openaiKey" 
                               name="openaiKey" 
                               value="${escapeHtml(config.openaiKey)}"
                               placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                    </div>

                    <div class="form-group ${config.provider === 'Ollama' ? 'active' : ''}" id="ollamaGroup">
                        <label for="ollamaKey">Ollama API Key:</label>
                        <input type="password" 
                               id="ollamaKey" 
                               name="ollamaKey" 
                               value="${escapeHtml(config.ollamaKey)}"
                               placeholder="your-ollama-api-key" />
                    </div>

                    <div class="button-group">
                        <button type="submit">Save Settings</button>
                    </div>
                </form>

                <script>
                    const vscode = acquireVsCodeApi();
                    
                    // Initial setup
                    document.addEventListener('DOMContentLoaded', () => {
                        vscode.postMessage({ command: 'getConfig' });
                        updateVisibility(document.getElementById('provider').value);
                    });

                    // Handle config updates
                    window.addEventListener('message', event => {
                        if (event.data.command === 'config') {
                            const config = event.data.data;
                            document.getElementById('provider').value = config.provider;
                            document.getElementById('openaiKey').value = config.openaiKey;
                            document.getElementById('ollamaKey').value = config.ollamaKey;
                            updateVisibility(config.provider);
                        }
                    });

                    // Form submission
                    document.getElementById('settingsForm').addEventListener('submit', (e) => {
                        e.preventDefault();
                        const provider = document.getElementById('provider').value;
                        const openaiKey = document.getElementById('openaiKey').value;
                        const ollamaKey = document.getElementById('ollamaKey').value;
                        
                        if (provider === 'OpenAI' && !openaiKey) {
                            showError('OpenAI API key is required');
                            return;
                        }
                        
                        if (provider === 'Ollama' && !ollamaKey) {
                            showError('Ollama API key is required');
                            return;
                        }
                        
                        vscode.postMessage({ 
                            command: 'save', 
                            data: { provider, openaiKey, ollamaKey }
                        });
                    });

                    // Provider change handler
                    document.getElementById('provider').addEventListener('change', (e) => {
                        updateVisibility(e.target.value);
                    });

                    function updateVisibility(provider) {
                        document.getElementById('openaiGroup').style.display = 
                            provider === 'OpenAI' ? 'block' : 'none';
                        document.getElementById('ollamaGroup').style.display = 
                            provider === 'Ollama' ? 'block' : 'none';
                    }
                    
                    function showError(message) {
                        const errorEl = document.getElementById('errorMessage');
                        errorEl.textContent = message;
                        errorEl.style.display = 'block';
                        setTimeout(() => errorEl.style.display = 'none', 5000);
                    }
                </script>
            </body>
            </html>
        `;
    }

    private getStyles(): string {
        return `
            :root {
                --vscode-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                --background: var(--vscode-editor-background);
                --foreground: var(--vscode-editor-foreground);
                --input-background: var(--vscode-input-background);
                --input-foreground: var(--vscode-input-foreground);
                --border-color: var(--vscode-editorWidget-border);
                --error-color: var(--vscode-errorForeground);
            }

            body {
                font-family: var(--vscode-font);
                background: var(--background);
                color: var(--foreground);
                padding: 20px;
                margin: 0;
            }

            h1 {
                font-size: 1.4em;
                margin-bottom: 1.5em;
                color: var(--foreground);
            }

            .form-group {
                margin-bottom: 1.2em;
                display: none;
            }

            .form-group.active {
                display: block;
            }

            .error-message {
                color: var(--error-color);
                margin-bottom: 1em;
                padding: 8px;
                border: 1px solid var(--error-color);
                border-radius: 4px;
                display: none;
            }

            label {
                display: block;
                margin-bottom: 0.5em;
                font-weight: 600;
            }

            select, input {
                width: 100%;
                padding: 8px;
                background: var(--input-background);
                color: var(--input-foreground);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                font-family: var(--vscode-font);
            }

            input[type="password"] {
                font-family: monospace;
            }

            button {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-family: var(--vscode-font);
            }

            button:hover {
                background: var(--vscode-button-hoverBackground);
            }
        `;
    }
}