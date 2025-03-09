// utils.ts - Helper functions
import * as vscode from 'vscode';
import * as diff from 'diff';

export function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function generateDiffHtml(oldCode: string, newCode: string): string {
    const differences = diff.diffLines(oldCode, newCode);
    return differences.map(part => {
        const lines = part.value.split('\n');
        return lines.map(line => {
            if (part.added) {
                return `<div class="diff-line added">+ ${escapeHtml(line)}</div>`;
            }
            if (part.removed) {
                return `<div class="diff-line removed">- ${escapeHtml(line)}</div>`;
            }
            return `<div class="diff-line">${escapeHtml(line)}</div>`;
        }).join('');
    }).join('');
}

export function applyCodeChanges(code: string) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        editor.edit(editBuilder => {
            const range = editor.selection.isEmpty
                ? new vscode.Range(0, 0, editor.document.lineCount, 0)
                : editor.selection;
            editBuilder.replace(range, code);
        });
    }
}