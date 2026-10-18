// Offline palette generator for dsh-bloom-lite.
// Reads the host's own static color ramps, re-hues every step to the Bloom Morandi
// blue (OKLCH H=240) while PRESERVING each step's perceptual lightness, then emits
// the single CSS rule the client half injects. Prints a WCAG contrast audit.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Locate the Harness install that ships the theme token definitions. Set
// DSH_THEME_CLIENT to override, e.g. when the Harness is installed elsewhere.
const THEME_REL = '@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js'
function findHost() {
  const candidates = [
    process.env.DSH_THEME_CLIENT,
    process.env.APPDATA && join(process.env.APPDATA, 'npm/node_modules', THEME_REL),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'npm/node_modules', THEME_REL),
    process.env.npm_config_prefix && join(process.env.npm_config_prefix, 'lib/node_modules', THEME_REL),
    '/usr/local/lib/node_modules/' + THEME_REL,
    '/usr/lib/node_modules/' + THEME_REL,
  ].filter(Boolean)
  const hit = candidates.find((p) => existsSync(p))
  if (!hit) {
    throw new Error(
      'Cannot find the Harness theme bundle. Set DSH_THEME_CLIENT to the full path of\n' +
      '<npm global root>/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js\n' +
      'Searched:\n  ' + candidates.join('\n  ')
    )
  }
  return hit
}

const HOST = findHost()
const HUE = 240          // Morandi cool / mist blue
const C_NEUTRAL = 0.028  // chroma ceiling for the bluish neutral ramp
const C_GRAY = 0.014     // chroma ceiling for the pure-gray ramp
const C_ACCENT = 0.115   // chroma ceiling for the blue / deepseek ramps

/* ---------- color math ---------- */
const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const linToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
function hex2rgb(h) {
  let s = h.slice(1)
  if (s.length === 3 || s.length === 4) s = s.split('').map((c) => c + c).join('')   // #fff -> #ffffff
  const n = parseInt(s.slice(0, 6), 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}
const rgb2hex = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('')

function rgb2oklab([r, g, b]) {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}
function oklab2rgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
  return [
    linToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ]
}
const inGamut = (rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005)
const maxChroma = (L, H) => {           // largest chroma at (L,H) that still fits sRGB
  let lo = 0, hi = 0.42
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(oklab2rgb([L, mid * Math.cos(H * Math.PI / 180), mid * Math.sin(H * Math.PI / 180)]))) lo = mid
    else hi = mid
  }
  return lo
}
const relLum = (h) => { const [r, g, b] = hex2rgb(h).map(srgbToLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a, b) => { const l1 = relLum(a), l2 = relLum(b); const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05) }

// Re-hue one hex to hue H with a chroma ceiling, keeping its OKLab lightness.
// The ceiling is tapered by a bell curve so near-white and near-black steps stay
// restrained while mid tones carry the Morandi tint.
function recolor(hex, cap) {
  const [L, a, b] = rgb2oklab(hex2rgb(hex))
  if (L >= 0.999) return '#ffffff'
  if (L <= 0.001) return '#000000'
  const taper = 0.70 + 0.30 * 4 * L * (1 - L)
  const C = Math.min(cap * taper, maxChroma(L, HUE) * 0.9)
  const rad = HUE * Math.PI / 180
  return rgb2hex(oklab2rgb([L, C * Math.cos(rad), C * Math.sin(rad)]))
}

// A plain OKLCH -> hex helper, used for the surface anchors below.
const oklch = (L, C, h = HUE) => rgb2hex(oklab2rgb([L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)]))

// The Host paints its whole light UI with its PURE WHITE step - canvas, panels and cards
// are all neutral-bluish-00 - and this generator deliberately preserves each step's
// lightness, so a ramp re-hue can never move those surfaces. They are set at the token
// level instead, to Bloom's own light anchors from the original palette (bgL 96%, sfL 94%),
// with the panel layers kept lighter than the canvas so the mist reads as the page and the
// content still reads as paper.
// Dark mode needs no entry: its canvas and panels already come from the bluish-950/875/850/
// 800 steps, which the ramp re-hue does move.
const SURFACE = {
  light: {
    '--dsw-alias-bg-base': oklch(0.965, 0.010),          // canvas: the mist page
    '--dsw-alias-bg-layer-1': oklch(0.976, 0.008),       // panels, cards, the conversation
    '--dsw-alias-bg-layer-2': oklch(0.984, 0.006),       // raised panels (hover, sheets)
    '--dsw-alias-bg-layer-3': oklch(0.990, 0.004),       // popovers, menus, dialogs
    '--dsw-specific-sidebar-fill': oklch(0.945, 0.012),  // sidebar column: deepest tint
  },
  dark: {},
}

/* ---------- read the host ramps ---------- */
const src = readFileSync(HOST, 'utf8')
const rampRe = /--dsw-static-(neutral-bluish|neutral|blue|deepseek)-([0-9]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g
const ramps = new Map()
for (const m of src.matchAll(rampRe)) {
  const key = m[1], step = m[2], hex = m[3].toLowerCase()
  if (!ramps.has(key)) ramps.set(key, new Map())
  ramps.get(key).set(step, hex)
}
const capOf = { 'neutral-bluish': C_NEUTRAL, neutral: C_GRAY, blue: C_ACCENT, deepseek: C_ACCENT }

/* ---------- emit ---------- */
const decls = []
const audit = []
for (const [group, cap] of Object.entries(capOf)) {
  const steps = ramps.get(group)
  if (!steps) { console.error('MISSING RAMP', group); process.exit(1) }
  for (const [step, hex] of steps) {
    const out = recolor(hex, cap)
    decls.push(`--dsw-static-${group}-${step}:${out}`)
    if (hex !== out) audit.push([`${group}-${step}`, hex, out])
  }
}

// Host selectors, verified by walking its stylesheet: statics and the light alias block
// live on `body` (0,0,1); dark aliases on `body[data-ds-dark-theme]` (0,1,1).
// `html body` (0,0,2) therefore wins everywhere by plain cascade - no !important, ever.
const ACCENT = { light: 'blue-600', dark: 'blue-400' }
// brand-primary is what --dsw-alias-button-primary-fill points at on `body`, so the accent
// reaches primary buttons, checkboxes and the boot spinner without touching a component rule.
const brand = (step) => `--dsw-alias-brand-primary:var(--dsw-static-${step});--dsw-alias-brand-text:var(--dsw-static-${step})`
const surface = (mode) => Object.entries(SURFACE[mode]).map(([token, hex]) => `${token}:${hex}`).join(';')
const merge = (...parts) => parts.filter((p) => p.length > 0).join(';')
const BASE = `html body{${merge(decls.join(';'), brand(ACCENT.light), surface('light'))}}`
const DARK = `html body[data-ds-dark-theme]{${merge(brand(ACCENT.dark), surface('dark'))}}`
const css = `${BASE}\n${DARK}`

console.log(`steps: ${decls.length}  changed: ${audit.length}`)
console.log('\n--- ramp diff (step / host / bloom) ---')
for (const [k, a, b] of audit) {
  const [L1, a1, b1] = rgb2oklab(hex2rgb(a)), [L2] = rgb2oklab(hex2rgb(b))
  console.log(`${k.padEnd(22)} ${a} -> ${b}   L ${L1.toFixed(4)} -> ${L2.toFixed(4)}  C ${Math.hypot(a1, b1).toFixed(4)} -> ${Math.hypot(...rgb2oklab(hex2rgb(b)).slice(1)).toFixed(4)}`)
}

/* ---------- contrast audit on the host's own alias pairings ---------- */
const statics = new Map()
for (const m of src.matchAll(/--dsw-static-((?:neutral-bluish|neutral|blue|deepseek)-[0-9]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
  if (!statics.has(m[1])) statics.set(m[1], m[2].toLowerCase())
}
// walk every flat CSS rule and keep the alias -> static mappings per mode
const modes = { light: new Map(), dark: new Map() }
for (const rule of src.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
  const target = /data-ds-dark-theme/.test(rule[1]) ? modes.dark : modes.light
  for (const m of rule[2].matchAll(/--dsw-(?:alias|specific)-([a-z0-9-]+)\s*:\s*var\(--dsw-static-((?:neutral-bluish|neutral|blue|deepseek)-[0-9]+)\)/g)) {
    target.set(m[1], m[2])
  }
}
const bloom = new Map()
for (const d of decls) { const [k, v] = d.split(':'); bloom.set(k.replace('--dsw-static-', ''), v) }
const resolve = (step) => bloom.get(step) ?? statics.get(step)
const valueOf = (mode, alias) => SURFACE[mode]['--dsw-specific-' + alias] ?? SURFACE[mode]['--dsw-alias-' + alias]
  ?? (modes[mode].get(alias) === undefined ? undefined : resolve(modes[mode].get(alias)))

// the accent override: brand-primary / brand-text re-pointed at the blue ramp
const BRAND_OVERRIDE = true

console.log('\n--- surface anchors (light) ---')
for (const [token, hex] of Object.entries(SURFACE.light)) console.log(`${token.padEnd(30)} ${hex}`)

console.log('\n--- contrast audit (Bloom palette%s) ---', BRAND_OVERRIDE ? ', accent override ON' : '')
const pairs = [
  ['light', 'label-primary', 'bg-base', 'canvas body text'],
  ['light', 'label-secondary', 'bg-base', 'canvas secondary text'],
  ['light', 'label-tertiary', 'bg-base', 'canvas tertiary text'],
  ['light', 'label-primary', 'bg-layer-1', 'panel text'],
  ['light', 'label-secondary', 'bg-layer-1', 'panel secondary text'],
  ['light', 'label-tertiary', 'bg-layer-1', 'panel tertiary text'],
  ['light', 'label-primary', 'bg-layer-3', 'popover text'],
  ['light', 'label-secondary', 'sidebar-fill', 'sidebar text'],
  ['light', 'label-primary-foreground', 'button-primary-fill', 'primary button label'],
  ['dark', 'label-primary', 'bg-base', 'canvas body text'],
  ['dark', 'label-secondary', 'bg-base', 'canvas secondary text'],
  ['dark', 'label-tertiary', 'bg-base', 'canvas tertiary text'],
  ['dark', 'label-primary', 'bg-layer-1', 'text on raised panel'],
  ['dark', 'label-primary-foreground', 'button-primary-fill', 'primary button label'],
]
for (const [mode, fg, bg, what] of pairs) {
  let f = valueOf(mode, fg), b = valueOf(mode, bg)
  if (BRAND_OVERRIDE) {
    if (bg === 'brand-primary' || bg === 'button-primary-fill') b = resolve(ACCENT[mode])
    if (fg === 'brand-primary' || fg === 'brand-text') f = resolve(ACCENT[mode])
  }
  if (!f || !b) { console.log(`${mode.padEnd(5)} ${what.padEnd(24)} unresolved (fg=${f} bg=${b})`); continue }
  const c = contrast(f, b)
  console.log(`${mode.padEnd(5)} ${what.padEnd(24)} ${f} on ${b}  ${c.toFixed(2)}:1  ${c >= 4.5 ? 'AA' : c >= 3 ? 'AA-large' : 'FAIL'}`)
}
console.log('\naccent candidates: light %s = %s   dark %s = %s', ACCENT.light, resolve(ACCENT.light), ACCENT.dark, resolve(ACCENT.dark))
console.log('host brand was: light %s / dark %s - the Host points --dsw-alias-button-primary-fill at it, so the accent reaches every primary button',
  resolve(modes.light.get('brand-primary')), resolve(modes.dark.get('brand-primary')))

console.log('\n--- generated CSS (%d bytes) ---', Buffer.byteLength(css))
writeFileSync('src/client.css', `/* dsh-bloom-lite - generated by _tools/gen.mjs. Re-run the generator instead of hand-editing. */\n`
  + BASE.replace(/;/g, ';\n').replace('{', '{\n') + '\n'
  + DARK.replace(/;/g, ';\n').replace('{', '{\n') + '\n')
console.log('wrote src/client.css')
