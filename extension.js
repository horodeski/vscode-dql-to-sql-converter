"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const OrmToSql_1 = require("./utils/OrmToSql");
function getFullQueryBlock(document, startLine) {
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
class DoctrineOrmCodeLensProvider {
    provideCodeLenses(document, token) {
        return __awaiter(this, void 0, void 0, function* () {
            const codeLenses = [];
            for (let i = 0; i < document.lineCount; i++) {
                const lineText = document.lineAt(i).text;
                if (lineText.includes("->select(")) {
                    const range = new vscode.Range(i, 0, i, 0);
                    codeLenses.push(new vscode.CodeLens(range, {
                        title: "Converter para SQL",
                        tooltip: "Converter QueryBuilder Doctrine para SQL",
                        command: "extension.verSQL",
                        arguments: [document.uri, i]
                    }));
                }
            }
            return codeLenses;
        });
    }
}
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel("Doctrine ORM SQL");
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: "file", language: "php" }, new DoctrineOrmCodeLensProvider()));
    const disposable = vscode.commands.registerCommand("extension.verSQL", (uri, lineNumber) => __awaiter(this, void 0, void 0, function* () {
        try {
            const document = yield vscode.workspace.openTextDocument(uri);
            const codeBlock = yield getFullQueryBlock(document, lineNumber);
            const sql = (0, OrmToSql_1.changeOrmToSql)(codeBlock, "postgres");
            if (sql) {
                outputChannel.clear();
                outputChannel.appendLine("SQL gerado:");
                outputChannel.appendLine(sql);
                outputChannel.show(true);
            }
            else {
                vscode.window.showWarningMessage("Não foi possível converter este bloco para SQL.");
            }
        }
        catch (error) {
            vscode.window.showErrorMessage("Erro ao converter para SQL: " + error);
        }
    }));
    context.subscriptions.push(disposable);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map