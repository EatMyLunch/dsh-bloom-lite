/**
 * Build step: inline the generated stylesheet into the runtime template and emit
 * the shipped ./client.js.
 *
 * Why a build step at all: the theme must apply from ONE inline <style> node with
 * no network request, so the CSS has to live inside the module. Minifying it and
 * checking it mechanically is cheaper than trusting it by eye.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const css = readFileSync('src/client.css', 'utf8')
const template = readFileSync('src/runtime.js', 'utf8')

/* ---------- CSS: comments out, whitespace collapsed ---------- */
const min = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{};:,>])\s*/g, '$1')
  .trim()

/* ---------- performance guard: the build fails if the theme grows a cost ---------- */
const forbidden = {
  '!important': /!\s*important/i,
  '@-rule (keyframes/font-face/media/layer)': /@/,
  animation: /animation\s*:/i,
  transition: /transition\s*:/i,
  'filter/backdrop': /(?:^|[;{])(?:-webkit-)?(?:backdrop-)?filter\s*:/i,
  'box-shadow': /box-shadow\s*:/i,
  'text-shadow': /text-shadow\s*:/i,
  'will-change': /will-change\s*:/i,
  'gradient/image': /(?:linear|radial|conic)-gradient|url\(/i,
  'third-party element selector': /(?:^|[{}\s])[.#]/,
  'unscoped declaration': /^\s*[a-z-]+\s*:/i,
}
const violations = Object.entries(forbidden).filter(([, re]) => re.test(min)).map(([name]) => name)
if (violations.length > 0) {
  console.error('BUILD FAILED - stylesheet gained avoidable cost: ' + violations.join(', '))
  process.exit(1)
}

/* ---------- structural check ---------- */
const statics = (min.match(/--dsw-static-[a-z0-9-]+:/g) ?? []).length
const aliases = (min.match(/--dsw-alias-[a-z0-9-]+:/g) ?? []).length
const specifics = (min.match(/--dsw-specific-[a-z0-9-]+:/g) ?? []).length
const rules = (min.match(/\{/g) ?? []).length
if (statics !== 56 || aliases < 2 || rules !== 2) {
  console.error(`BUILD FAILED - expected 2 rules / 56 static / >=2 alias declarations, got ${rules} / ${statics} / ${aliases}`)
  process.exit(1)
}
for (const selector of ['html body{', 'html body[data-ds-dark-theme]{']) {
  if (!min.includes(selector)) {
    console.error('BUILD FAILED - missing selector ' + selector)
    process.exit(1)
  }
}

/* ---------- JS: comments out, one line, stylesheet inlined ---------- */
// Both comment forms are dropped: block comments inline, and whole lines that start with
// `//` (the template uses those for the long explanations). Trailing `//` comments are not
// stripped, so keep explanations on their own line.
const out = template
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('//'))
  .join(' ')
  .replace(/'__BLOOM_CSS__'/, JSON.stringify(min))
  .replace(/ {2,}/g, ' ')

try {
  new Function(out)
} catch (err) {
  console.error('BUILD FAILED - emitted client.js does not parse: ' + err.message)
  process.exit(1)
}
if (!out.includes('window.__ModuleLoader__.load')) {
  console.error('BUILD FAILED - client.js lost its module registration')
  process.exit(1)
}

writeFileSync('client.js', out + '\n')

const kb = (n) => (n / 1024).toFixed(2) + ' KiB'
console.log('stylesheet  ' + kb(Buffer.byteLength(css)) + ' -> ' + kb(Buffer.byteLength(min)) + `  (${rules} rules, ${statics} static + ${aliases} alias + ${specifics} specific declarations)`)
console.log('client.js   ' + kb(Buffer.byteLength(template)) + ' template -> ' + kb(Buffer.byteLength(out)) + ' shipped')
