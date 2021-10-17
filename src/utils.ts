import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

function getWorkspaceFolders(): string[] {
  const folders: string[] = []

  const workspaces = vscode.workspace.workspaceFolders

  if (workspaces !== undefined) {
    for (const folder of workspaces) {
      folders.push(folder.uri.fsPath)
    }
  }

  return folders
}

export function getWorkspacePath(filePath: string): string {
  const folders = getWorkspaceFolders()

  for (const folder of folders) {
    if (filePath.startsWith(folder)) {
      return folder
    }
  }

  return ''
}

export function resolveLocal(packageName: string): string {
  // Get open workspaces
  const folders = getWorkspaceFolders()

  // Get path of current file
  let current =
    vscode.window.activeTextEditor !== undefined
      ? path.dirname(vscode.window.activeTextEditor.document.fileName)
      : ''

  if (current === '') {
    return ''
  }

  // Find the workspace to which the file belongs
  const root = folders.find(function find(folder) {
    return current.startsWith(folder)
  })

  // If not found
  if (root === undefined) {
    return ''
  }

  // If found, then search the module
  // starting from the current directory
  while (current !== root) {
    const dir = current + '/node_modules/' + packageName

    if (fs.existsSync(dir)) {
      return dir
    }

    current = path.resolve(current + '/..')
  }

  const dir = current + '/node_modules/' + packageName

  if (fs.existsSync(dir)) {
    return dir
  }

  return ''
}
