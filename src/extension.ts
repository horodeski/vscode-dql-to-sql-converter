import * as vscode from "vscode";
import { changeOrmToSql } from "./utils/OrmToSql";

async function getFullQueryBlock(document: vscode.TextDocument, startLine: number): Promise<string> {
	let codeBlock = "";
	let lineIndex = startLine;
	const totalLines = document.lineCount;
	let ended = false;

	while (lineIndex < totalLines && !ended) {
		const lineText = document.lineAt(lineIndex).text.trim();
		codeBlock += lineText + " ";
		if (lineText.endsWith(";")) {
			ended = true;
		}
		lineIndex++;
	}

	return codeBlock.trim();
}

class DoctrineOrmCodeLensProvider implements vscode.CodeLensProvider {
	onDidChangeCodeLenses?: vscode.Event<void> | undefined;

	async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken) {
		const codeLenses: vscode.CodeLens[] = [];

		for (let i = 0; i < document.lineCount; i++) {
			const lineText = document.lineAt(i).text;
			if (lineText.includes("->select(")) {
				const range = new vscode.Range(i, 0, i, 0);
				codeLenses.push(
					new vscode.CodeLens(range, {
						title: "Converter para SQL",
						tooltip: "Converter QueryBuilder Doctrine para SQL",
						command: "extension.verSQL",
						arguments: [document.uri, i]
					})
				);
			}
		}

		return codeLenses;
	}
}

export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel("Doctrine ORM SQL");

	context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: "file", language: "php" }, new DoctrineOrmCodeLensProvider()));

	const disposable = vscode.commands.registerCommand("extension.verSQL", async (uri: vscode.Uri, lineNumber: number) => {
		try {
			const document = await vscode.workspace.openTextDocument(uri);

			const codeBlock = await getFullQueryBlock(document, lineNumber);
			const sql = changeOrmToSql(codeBlock, "postgres");

			if (sql) {
				outputChannel.clear();
				outputChannel.appendLine("SQL gerado:");
				outputChannel.appendLine(sql);
				outputChannel.show(true);
			} else {
				vscode.window.showWarningMessage("Não foi possível converter este bloco para SQL.");
			}
		} catch (error) {
			vscode.window.showErrorMessage("Erro ao converter para SQL: " + error);
		}
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
