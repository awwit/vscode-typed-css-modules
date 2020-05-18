# CSS Module Typed

![logo](./logo.png)

Creates .d.ts files from css-modules .css/.less/.scss/.styl files

## Install

Install deps first:

```shell
# require
npm install typed-css-modules

# if you need less
npm install less

# if you need scss
npm install node-sass

# if you need sylus
npm install stylus
```

Modules can be installed globally. `yarn` is supported.

To switch the package manager (`npm` or `yarn`), you need to change the settings `npm.packageManager` of the built-in module `vscode.npm`.

## Usage

put

```js
// @type
```

or

```css
/* @type */
```

ahead of your `.css/.less/.scss/.styl` file, and save, you will get a `d.ts` file in same directory.

## preview

![img](https://s2.ax1x.com/2019/01/31/k1yTT1.gif)