// codeGenView.ts - Code Generation View implementation
import * as vscode from 'vscode';
import { escapeHtml, generateDiffHtml, applyCodeChanges } from './utils';
import { getLLMClient } from './llmClient';
import { AIConfig } from './aiAssistant';

export class CodeGenerationViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;
    private _generatedCode: string = '';

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

    private getConfig(): AIConfig {
        const config = vscode.workspace.getConfiguration('aiAssistant');
        return {
            selectedProvider: config.get('selectedProvider', 'OpenAI'),
            maxContextLines: config.get('maxContextLines', 10),
            enableInline: config.get('enableInline', true),
            preferredModels: config.get('preferredModels', {}),
            apiKeys: config.get('apiKeys', {})
        };
    }

    private setupMessageHandlers() {
        this._view!.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'generate':
                    await this.handleGenerateCode(message.prompt);
                    break;
                
                case 'insert':
                    this.insertCode(message.code);
                    break;
                
                case 'toggle':
                    vscode.commands.executeCommand(message.viewId);
                    break;
            }
        });
    }

    private async handleGenerateCode(prompt: string) {
        if (!prompt.trim()) {
            vscode.window.showWarningMessage('Please enter a code generation prompt');
            return;
        }

        const editor = vscode.window.activeTextEditor;
        const language = editor?.document.languageId || 'unknown';
        const fullPrompt = `Generate ${language} code that: ${prompt}. 
            Respond ONLY with the code in a single code block.`;

        try {
            const client = getLLMClient(this.getConfig());
            this._generatedCode = await client.generate(fullPrompt, 'code');
            this.updateWebview();
            this.showCodeReview();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Code generation failed: ${error.message}`);
        }
    }

    private showCodeReview() {
        const editor = vscode.window.activeTextEditor;
        const currentCode = editor?.document.getText() || '';
        
        const panel = vscode.window.createWebviewPanel(
            'codeReview',
            'Code Review',
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    ${this.getStyles()}
                </style>
            </head>
            <body>
                <h1>Generated Code Review</h1>
                <div class="diff-container">
                    ${generateDiffHtml(this._generatedCode, this._generatedCode)}
                </div>
                <div class="button-group">
                    <button onclick="accept()">Accept</button>
                    <button onclick="modify()">Modify</button>
                    <button onclick="discard()">Discard</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function accept() {
                        vscode.postMessage({ command: 'insert', code: ${JSON.stringify(this._generatedCode)} });
                        vscode.postMessage({ command: 'close' });
                    }
                    function modify() {
                        vscode.postMessage({ command: 'modify' });
                    }
                    function discard() {
                        vscode.postMessage({ command: 'close' });
                    }
                </script>
            </body>
            </html>
        `;

        panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'insert':
                    applyCodeChanges(message.code);
                    panel.dispose();
                    break;
                case 'close':
                    panel.dispose();
                    break;
            }
        });
    }

    private insertCode(code: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, code);
            });
        }
    }

    private updateWebview() {
        if (!this._view) return;

        this._view.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    ${this.getStyles()}
                </style>
                <link rel="stylesheet" 
                    href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css">
                <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
            </head>
            <body>
                <h1>Code Generator</h1>
                <div class="input-section">
                    <textarea 
                        id="prompt" 
                        placeholder="Describe the code you want to generate..."
                    ></textarea>
                    <div class="button-group">
                        <button id="generate">Generate</button>
                        <button id="clear">Clear</button>
                    </div>
                </div>
                ${this._generatedCode ? `
                <div class="output-section">
                    <h2>Generated Code</h2>
                    <pre><code>${escapeHtml(this._generatedCode)}</code></pre>
                </div>
                ` : ''}
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    document.getElementById('generate').addEventListener('click', () => {
                        const prompt = document.getElementById('prompt').value;
                        vscode.postMessage({ command: 'generate', prompt });
                    });

                    document.getElementById('clear').addEventListener('click', () => {
                        document.getElementById('prompt').value = '';
                        vscode.postMessage({ command: 'clear' });
                    });

                    // Auto-resize textarea
                    const textarea = document.getElementById('prompt');
                    textarea.addEventListener('input', () => {
                        textarea.style.height = 'auto';
                        textarea.style.height = textarea.scrollHeight + 'px';
                    });
                </script>
            </body>
            </html>
        `;
    }

    private getStyles(): string {
        return `
            :root {
                --vscode-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                --bg-color: var(--vscode-editor-background);
                --text-color: var(--vscode-editor-foreground);
                --border-color: var(--vscode-editorWidget-border);
            }

            body {
                font-family: var(--vscode-font);
                background: var(--bg-color);
                color: var(--text-color);
                padding: 20px;
                height: 100vh;
                display: flex;
                flex-direction: column;
            }

            h1 {
                font-size: 1.4em;
                margin-bottom: 1em;
                color: var(--vscode-editor-foreground);
            }

            .input-section {
                margin-bottom: 20px;
            }

            textarea {
                width: 100%;
                min-height: 100px;
                padding: 10px;
                border: 1px solid var(--border-color);
                border-radius: 4px;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                resize: none;
                margin-bottom: 10px;
            }

            .button-group {
                display: flex;
                gap: 8px;
            }

            button {
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                cursor: pointer;
            }

            button:hover {
                background: var(--vscode-button-hoverBackground);
            }

            .output-section {
                flex: 1;
                overflow-y: auto;
                border-top: 1px solid var(--border-color);
                padding-top: 20px;
            }

            pre {
                background: var(--vscode-editor-background) !important;
                padding: 10px;
                border-radius: 4px;
                white-space: pre-wrap;
            }

            code {
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
            }
        `;
    }
}