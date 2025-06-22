import * as vscode from 'vscode'
import { SideBarProvider } from './SideBarProvider'

export function activate(context: vscode.ExtensionContext) {
	const provider = new SideBarProvider(context.extensionUri)

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(SideBarProvider.viewType, provider))
}
