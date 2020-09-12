import * as fs from 'fs'
import * as path from 'path'
import * as assert from 'assert'
// eslint-disable-next-line node/no-unpublished-import
import * as vscode from 'vscode'

function readFile(path: string): Promise<Buffer> {
  return new Promise<Buffer>(function executor(resolve, reject) {
    fs.readFile(path + '.d.ts', function callback(err, data) {
      err ? reject(err) : resolve(data)
    })
  })
}

function removeFile(path: string): Promise<void> {
  return new Promise(function executor(resolve, reject) {
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

  const root = path.resolve(__dirname, '../../../')

  vscode.workspace.updateWorkspaceFolders(0, null, {
    uri: vscode.Uri.file(root),
  })

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
        return readFile(generated)
      })
      .then((data) => {
        return assert.ok(data.equals(snapshot))
      })
  }

  test('css', () => {
    runTestOnFile('fixtures/style.css')
  })

  test('less', () => {
    runTestOnFile('fixtures/style.less')
  })

  // Skip due to error with node-sass binary in Electron
  test.skip('sass', () => {
    runTestOnFile('fixtures/style.scss')
  })

  test('stylus', () => {
    runTestOnFile('fixtures/style.styl')
  })
}).afterAll(() => {
  return Promise.all(files.map((file) => removeFile(file)))
})
