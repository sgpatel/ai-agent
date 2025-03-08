import * as vscode from 'vscode';
import { LLMClient } from './llmClient';
import { OpenAIClient } from './clients/openAIClient';
import { OllamaClient } from './clients/ollamaClient';

interface ChatMessage {
  role: string;
  content: string;
}

function getLLMClient(): LLMClient | undefined {
  const config = vscode.workspace.getConfiguration('aiAssistant');
  const provider = config.get<string>('selectedProvider');
  if (!provider) {
    vscode.window.showErrorMessage('No LLM provider selected. Please set "aiAssistant.selectedProvider" in settings.');
    return undefined;
  }
  const apiKey = config.get<string>(`${provider.toLowerCase()}.apiKey`);
  if (!apiKey) {
    vscode.window.showErrorMessage(`API key for ${provider} is missing. Please set "aiAssistant.${provider.toLowerCase()}.apiKey" in settings.`);
    return undefined;
  }

  switch (provider) {
    case 'OpenAI':
      return new OpenAIClient(apiKey);
    case 'Ollama':
      return new OllamaClient(apiKey);
    default:
      vscode.window.showErrorMessage(`Unknown provider: ${provider}`);
      return undefined;
  }
}

/**
 * Webview provider for the Chat view.
 */
class ChatViewProvider implements vscode.WebviewViewProvider {
  private _context: vscode.ExtensionContext;
  private _client: LLMClient | undefined;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
    this._client = getLLMClient();
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };
    let messages: ChatMessage[] = this._context.globalState.get('chatContext', []);
    if (!Array.isArray(messages)) messages = [];

    const updateWebview = () => {
      const chatHtml = messages.map((msg, index) => {
        if (msg.role === 'user') {
          return `
            <div class="message">
              <span class="role" style="color: #007acc;">${msg.role}:</span>
              <div class="content"><p class="explanation">${escapeHtml(msg.content)}</p></div>
            </div>
          `;
        }

        const parts = msg.content.split(/(```[\s\S]*?```)/g);
        const formattedContent = parts.map((part, partIndex) => {
          if (part.match(/```[\s\S]*?```/)) {
            const code = part.slice(3, -3).trim();
            return `
              <div class="code-box" data-index="${index}-${partIndex}">
                <pre><code>${escapeHtml(code)}</code></pre>
                <div class="code-actions">
                  <button onclick="copyCode('${index}-${partIndex}')" class="action-btn">Copy</button>
                  <button onclick="insertCode('${index}-${partIndex}')" class="action-btn insert-btn">Insert</button>
                </div>
              </div>
            `;
          } else {
            return part.trim() ? `<p class="explanation">${escapeHtml(part.trim())}</p>` : '';
          }
        }).join('');

        return `
          <div class="message">
            <span class="role" style="color: #d73a49;">${msg.role}:</span>
            <div class="content">${formattedContent}</div>
          </div>
        `;
      }).join('');

      webviewView.webview.html = `
        <html>
        <head>
          <style>
            /* Existing styles unchanged */
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 15px; background: #ffffff; color: #333; }
            h1 { font-size: 20px; margin-bottom: 15px; color: #007acc; font-weight: 600; }
            #chat { max-height: 400px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; background: #f9f9f9; box-shadow: inset 0 1px 3px rgba(0,0,0,0.05); }
            .message { margin-bottom: 20px; }
            .role { font-weight: bold; font-size: 14px; }
            .content { margin-top: 5px; }
            .explanation { font-size: 14px; line-height: 1.5; color: #444; }
            .code-box { background: #2d2d2d; border-radius: 6px; padding: 10px; margin: 10px 0; }
            pre { margin: 0; }
            code { color: #f8f8f2; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; white-space: pre-wrap; }
            .code-actions { margin-top: 8px; text-align: right; }
            textarea { width: 100%; margin-top: 15px; padding: 10px; border: 1px solid #ccc; border-radius: 6px; resize: vertical; font-size: 14px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1); }
            .button-container { margin-top: 10px; text-align: right; }
            .action-btn { background: #007acc; color: white; border: none; padding: 6px 12px; margin-left: 8px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; transition: background 0.2s; }
            .action-btn:hover { background: #005f99; }
            .insert-btn { background: #28a745; }
            .insert-btn:hover { background: #218838; }
            .toggle-btn { background: #6c757d; margin-bottom: 10px; }
            .toggle-btn:hover { background: #5a6268; }
          </style>
        </head>
        <body>
          <button onclick="toggleView('codeGeneration')" class="action-btn toggle-btn">Switch to Code Editor</button>
          <h1>AI Assistant Chat</h1>
          <div id="chat">${chatHtml}</div>
          <textarea id="input" rows="3" placeholder="Ask me anything..."></textarea>
          <div class="button-container">
            <button onclick="sendMessage()" class="action-btn">Send</button>
            <button onclick="clearChat()" class="action-btn">Clear</button>
          </div>
          <script>
            const vscode = acquireVsCodeApi();
            const messages = ${JSON.stringify(messages)};
            function sendMessage() {
              const input = document.getElementById('input').value;
              if (input) {
                vscode.postMessage({ command: 'send', text: input });
                document.getElementById('input').value = '';
              }
            }
            function clearChat() {
              vscode.postMessage({ command: 'clear' });
            }
            function copyCode(id) {
              const codeBox = document.querySelector(\`.code-box[data-index="\${id}"] code\`);
              if (codeBox) {
                const code = codeBox.textContent;
                vscode.postMessage({ command: 'copy', code });
              }
            }
            function insertCode(id) {
              const codeBox = document.querySelector(\`.code-box[data-index="\${id}"] code\`);
              if (codeBox) {
                const code = codeBox.textContent;
                vscode.postMessage({ command: 'insert', code });
              }
            }
            function toggleView(viewId) {
              vscode.postMessage({ command: 'toggle', viewId });
            }
          </script>
        </body>
        </html>
      `;
    };
    updateWebview();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (!this._client) return;

      switch (message.command) {
        case 'send':
          const userMessage: ChatMessage = { role: 'user', content: message.text };
          messages.push(userMessage);
          updateWebview();
          try {
            const systemPrompt = [
              { role: 'system', content: 'You are a helpful code assistant. Provide responses with explanations as plain text and code in triple backticks (```language\ncode\n```). Do not use HTML tags like <pre> or <code> directly.' }
            ];
            const response = await this._client.generateChatResponse([...systemPrompt, ...messages]);
            const aiMessage: ChatMessage = { role: 'assistant', content: response };
            messages.push(aiMessage);
            if (messages.length > 10) messages = messages.slice(-10);
            this._context.globalState.update('chatContext', messages);
            updateWebview();
          } catch (error) {
            vscode.window.showErrorMessage(`Chat error: ${(error as any).message}`);
          }
          break;
        case 'clear':
          messages = [];
          this._context.globalState.update('chatContext', messages);
          updateWebview();
          break;
        case 'copy':
          vscode.env.clipboard.writeText(message.code);
          vscode.window.showInformationMessage('Code copied to clipboard.');
          break;
        case 'insert':
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            editor.edit((editBuilder) => editBuilder.insert(editor.selection.active, message.code));
            vscode.window.showInformationMessage('Code inserted at cursor.');
          } else {
            vscode.window.showErrorMessage('No active editor to insert code.');
          }
          break;
        case 'toggle':
          vscode.commands.executeCommand('workbench.view.extension.aiAssistantSidebar');
          vscode.commands.executeCommand(`aiAssistant.${message.viewId}.focus`);
          break;
      }
    });
  }
}

/**
 * Webview provider for the Code Generation view.
 */
class CodeGenerationViewProvider implements vscode.WebviewViewProvider {
  private _client: LLMClient | undefined;

  constructor() {
    this._client = getLLMClient();
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };
    const editor = vscode.window.activeTextEditor;
    const language = editor?.document.languageId || 'plaintext';

    webviewView.webview.html = `
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 15px; background: #ffffff; color: #333; }
          h1 { font-size: 20px; margin-bottom: 15px; color: #007acc; font-weight: 600; }
          textarea { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; resize: vertical; font-size: 14px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1); }
          .button-container { margin-top: 10px; text-align: right; }
          .action-btn { background: #007acc; color: white; border: none; padding: 6px 12px; margin-left: 8px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; transition: background 0.2s; }
          .action-btn:hover { background: #005f99; }
          .toggle-btn { background: #6c757d; margin-bottom: 10px; }
          .toggle-btn:hover { background: #5a6268; }
        </style>
      </head>
      <body>
        <button onclick="toggleView('chat')" class="action-btn toggle-btn">Switch to Chat</button>
        <h1>Code Generation</h1>
        <p>Language: ${language}</p>
        <textarea id="prompt" rows="3" placeholder="Enter your code generation prompt"></textarea>
        <div class="button-container">
          <button onclick="generateCode()" class="action-btn">Generate</button>
        </div>
        <div id="output" style="margin-top: 10px;"></div>
        <script>
          const vscode = acquireVsCodeApi();
          function generateCode() {
            const prompt = document.getElementById('prompt').value;
            if (prompt) {
              vscode.postMessage({ command: 'generate', text: prompt });
            }
          }
          function toggleView(viewId) {
            vscode.postMessage({ command: 'toggle', viewId });
          }
        </script>
      </body>
      </html>
    `;

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (!this._client) return;

      if (message.command === 'generate') {
        try {
          const fullPrompt = `In ${language}, ${message.text}`;
          const code = await this._client.generateCode(fullPrompt);
          showCodeReviewWebview(code);
        } catch (error) {
          vscode.window.showErrorMessage(`Code generation error: ${(error as any).message}`);
        }
      } else if (message.command === 'toggle') {
        vscode.commands.executeCommand('workbench.view.extension.aiAssistantSidebar');
        vscode.commands.executeCommand(`aiAssistant.${message.viewId}.focus`);
      }
    });
  }
}

/**
 * Enhanced code review webview with diff and creative options.
 */
function showCodeReviewWebview(generatedCode: string) {
  const panel = vscode.window.createWebviewPanel(
    'codeReview',
    'AI Code Review',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  const editor = vscode.window.activeTextEditor;
  const currentContent = editor ? (editor.selection.isEmpty ? editor.document.getText() : editor.document.getText(editor.selection)) : '';
  
  // Simple diff simulation (highlighting added/changed lines)
  const diffHtml = generateDiffHtml(currentContent, generatedCode);

  panel.webview.html = `
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 15px;
          background: #ffffff;
          color: #333;
        }
        h1 {
          font-size: 20px;
          margin-bottom: 15px;
          color: #007acc;
        }
        .diff-container {
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          padding: 10px;
          background: #f9f9f9;
          max-height: 400px;
          overflow-y: auto;
        }
        pre {
          margin: 0;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 13px;
          white-space: pre-wrap;
        }
        .added { background: #e6ffe6; color: #28a745; }
        .removed { background: #ffe6e6; color: #d73a49; text-decoration: line-through; }
        .unchanged { color: #666; }
        .button-container {
          margin-top: 15px;
          text-align: right;
        }
        button {
          background: #007acc;
          color: white;
          border: none;
          padding: 8px 16px;
          margin-left: 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: background 0.2s;
        }
        button:hover { background: #005f99; }
        .accept-btn { background: #28a745; }
        .accept-btn:hover { background: #218838; }
        .discard-btn { background: #d73a49; }
        .discard-btn:hover { background: #b02a37; }
      </style>
    </head>
    <body>
      <h1>AI Code Review</h1>
      <div class="diff-container">${diffHtml}</div>
      <div class="button-container">
        <button onclick="accept()" class="accept-btn">Accept Changes</button>
        <button onclick="discard()" class="discard-btn">Discard</button>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        const generatedCode = ${JSON.stringify(generatedCode)};
        function accept() { vscode.postMessage({ command: 'accept' }); }
        function discard() { vscode.postMessage({ command: 'discard' }); }
      </script>
    </body>
    </html>
  `;

  panel.webview.onDidReceiveMessage((message) => {
    switch (message.command) {
      case 'accept':
        applyCodeChanges(generatedCode);
        panel.dispose();
        break;
      case 'discard':
        panel.dispose();
        break;
    }
  });
}

/**
 * Simple diff generator (line-by-line comparison).
 */
function generateDiffHtml(currentContent: string, generatedCode: string): string {
  const currentLines = currentContent.split('\n');
  const generatedLines = generatedCode.split('\n');
  const maxLines = Math.max(currentLines.length, generatedLines.length);
  let diffHtml = '';

  for (let i = 0; i < maxLines; i++) {
    const currentLine = currentLines[i] || '';
    const generatedLine = generatedLines[i] || '';
    if (currentLine === generatedLine) {
      diffHtml += `<pre class="unchanged">${escapeHtml(currentLine)}</pre>`;
    } else if (!currentLine) {
      diffHtml += `<pre class="added">+ ${escapeHtml(generatedLine)}</pre>`;
    } else if (!generatedLine) {
      diffHtml += `<pre class="removed">- ${escapeHtml(currentLine)}</pre>`;
    } else {
      diffHtml += `<pre class="removed">- ${escapeHtml(currentLine)}</pre>`;
      diffHtml += `<pre class="added">+ ${escapeHtml(generatedLine)}</pre>`;
    }
  }
  return diffHtml;
}

/**
 * Apply the generated code to the editor.
 */
function applyCodeChanges(code: string) {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const range = editor.selection.isEmpty
      ? new vscode.Range(0, 0, editor.document.lineCount, 0)
      : editor.selection;
    editor.edit((editBuilder) => editBuilder.replace(range, code));
    vscode.window.showInformationMessage('Code changes applied.');
  } else {
    vscode.window.showErrorMessage('No active editor to apply changes.');
  }
}

/**
 * Utility functions.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Activate the extension.
 */
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aiAssistant.chat', new ChatViewProvider(context)),
    vscode.window.registerWebviewViewProvider('aiAssistant.codeGeneration', new CodeGenerationViewProvider())
  );
}

export function deactivate() {}