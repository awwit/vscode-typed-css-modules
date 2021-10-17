import * as fs from 'fs'
import * as path from 'path'
import * as assert from 'assert'
import * as vscode from 'vscode'

function removeFile(path: string): Promise<void> {
  return new Promise<void>(function executor(resolve, reject): void {
    fs.unlink(path, function callback(err) {
      if (err !== null && err.code !== 'ENOENT') {
        return reject(err)
      }

      resolve()
    })
  })
}

const files: string[] = []

suite('Typed CSS Modules', () => {
  vscode.window.showInformationMessage('Start all tests.')

  const snapshot = Buffer.from(`declare const styles: {
  readonly container: string
  readonly row1: string
  readonly row2: string
  readonly row3: string
}
export = styles
`)

  if (vscode.workspace.workspaceFolders === undefined) {
    throw new Error('VSCode Workspace not open')
  }

  const root = vscode.workspace.workspaceFolders[0].uri.fsPath

  function runTestOnFile(filePath: string): Thenable<unknown> {
    const target = path.resolve(root, filePath)
    const generated = target + '.d.ts'

    files.push(generated)

    return vscode.workspace
      .openTextDocument(target)
      .then((document) => {
        return vscode.window.showTextDocument(document)
      })
      .then(() => {
        return vscode.commands.executeCommand('workbench.action.files.save')
      })
      .then(() => {
        return new Promise((resolve) => {
          setTimeout(resolve, 1000)
        })
      })
      .then(() => {
        return fs.promises.readFile(generated)
      })
      .then((data) => {
        return assert.ok(data.equals(snapshot))
      })
  }

  test('css', () => {
    return runTestOnFile('fixtures/style.css')
  })

  test('less', async function () {
    return runTestOnFile('fixtures/style.less')
  })

  test('sass', () => {
    return runTestOnFile('fixtures/style.sass')
  })

  test('scss', () => {
    return runTestOnFile('fixtures/style.scss')
  })

  test('stylus', async () => {
    return runTestOnFile('fixtures/style.styl')
  })
}).afterAll(() => {
  return Promise.all(files.map((file) => removeFile(file)))
})
