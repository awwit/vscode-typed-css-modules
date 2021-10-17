import * as path from 'path'
// eslint-disable-next-line node/no-unpublished-import
import * as Mocha from 'mocha'
// eslint-disable-next-line node/no-extraneous-import
import * as glob from 'glob'

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: '30s',
  })

  const testsRoot = path.resolve(__dirname, '..')

  return new Promise<void>(function executor(resolve, reject): void {
    glob(
      '**/**.test.js',
      { cwd: testsRoot },
      function callback(
        err: NodeJS.ErrnoException | null,
        files: readonly string[]
      ) {
        if (err) {
          return reject(err)
        }

        // Add files to the test suite
        for (const file of files) {
          mocha.addFile(path.resolve(testsRoot, file))
        }

        try {
          // Run the mocha test
          mocha.run(function callback(failures): void {
            if (failures > 0) {
              reject(new Error(`${failures} tests failed.`))
            } else {
              resolve()
            }
          })
        } catch (err) {
          console.error(err)
          reject(err)
        }
      }
    )
  })
}
