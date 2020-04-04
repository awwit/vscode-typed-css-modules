import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

export function isFileEqualBuffer(
  filePath: string,
  buffer: Buffer
): Promise<boolean> {
  return new Promise(function executor(resolve, reject) {
    const stream = fs.createReadStream(filePath)

    let offset = 0
    let isEqual = true

    stream.on('data', function read(data) {
      if (!Buffer.isBuffer(data)) {
        data = Buffer.from(data)
      }

      if (!data.equals(buffer.slice(offset, offset + data.length))) {
        isEqual = false
        stream.close()
      } else {
        offset += data.length
      }
    })

    stream.on('error', function error(err: NodeJS.ErrnoException) {
      if (err.code === 'ENOENT') {
        isEqual = false
        resolve(isEqual)
      } else {
        reject(err)
      }
    })

    stream.on('close', function close() {
      resolve(offset === 0 && buffer.length > 0 ? false : isEqual)
    })
  })
}

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
