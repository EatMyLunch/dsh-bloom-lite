# Bloom Lite

A Morandi mist-blue theme for the DeepSeek Harness Web UI, rebuilt from
[`dsh-bloom-theme`](https://github.com/webkubor/dsh-bloom-theme) with exactly one
goal: **maximum performance**. Same family of colours, none of the runtime.

The whole theme is **two CSS rules** that re-point the Harness's own colour tokens.
No component overrides, no `!important`, no observers, no animation, no filters,
no per-frame work of any kind.

| | dsh-bloom-theme 0.18.1 | Bloom Lite |
|---|---|---|
| Shipped client artifact | 206,024 B | **2,811 B** |
| Injected style tags | 3 | **1** |
| Colours / variants evaluated at runtime | 10 palettes | **1 palette, resolved at build time** |
| `backdrop-filter` (glass blur) | 33 | **0** |
| `@keyframes` | 12 | **0** |
| `transition:` | 20 | **0** |
| `will-change` | 4 | **0** |
| `addEventListener` | 18 | **0** |
| `MutationObserver` | 2 | **0** |
| `requestAnimationFrame` | 1 | **0** |
| `setInterval` / `setTimeout` | 1 / 12 | **0 / 0** |
| `localStorage` touches | 10 | **0** |
| Host HTTP route / service injection | `/api/bloom/dsh-version` + `inject: ['webServer']` | **none, `inject: []`** |
| DOM the plugin owns | 3 style tags + switcher chip + 3 watchers | **1 style tag** |
| `!important` declarations | yes | **0** |

Original figures are counted occurrences in the published `lib/client.js`
(206,024 bytes) of `dsh-bloom-theme@0.18.1`. Lite figures are this package's
build output.

## How it works, and why that is the fast way

The Harness already resolves every one of its ~2,400 `--dsw-alias-*` colour
decisions through a small set of raw `--dsw-static-*` ramps. Re-pointing those
ramps recolours the entire application — light and dark, every panel, every state —
without touching a single component rule.

* **Rule 1** rewrites the 56 raw ramp steps (`neutral-bluish-*`, `neutral-*`,
  `blue-*`, `deepseek-*`) to the Bloom Morandi palette, re-points the light accent
  pair, and sets the two surfaces the Host paints with pure white — the canvas and
  the sidebar column — to Bloom's own light anchors.
* **Rule 2** re-points the accent pair for dark mode.

Cascade facts, verified against the installed Harness stylesheet rather than assumed:

| Host rule | Specificity | Ours | Specificity |
|---|---|---|---|
| `body{--dsw-static-*}` (statics + light aliases) | 0,0,1 | `html body{...}` | 0,0,2 |
| `body[data-ds-dark-theme]{--dsw-alias-*}` | 0,1,1 | `html body[data-ds-dark-theme]{...}` | 0,1,2 |

Both of our rules win on plain specificity, so the stylesheet never needs
`!important` — and light/dark switching keeps working because rule 2 only moves
the accent, while every other dark-mode alias still resolves through the ramps we
already re-hued.

Cost per session: **1 element, 1 CSS parse (~2.21 KiB), 1 cascade pass.** The style
node is registered through `ctx.effect`, so disposing the plugin removes it.

The accent is worth one note: the Host defines
`--dsw-alias-button-primary-fill: var(--dsw-alias-brand-primary)`, so moving
`brand-primary` alone turns every primary button, checkbox, radio and the boot
spinner mist blue — still without a single component rule.

## Re-hueing

The palette is generated, not hand-written:

```
node _tools/gen.mjs     # re-reads the installed Host ramps, re-hues them -> src/client.css
node _tools/build.mjs   # inlines + minifies -> client.js, and runs the guards
```

`_tools/gen.mjs` converts every Host ramp step to OKLab, moves it to hue 240
(mist blue) with a chroma ceiling, and **preserves each step's lightness** — which is
why the contrast the Host designed survives the re-hue. The two largest surfaces are
the exception: the Host paints them with its pure white step, whose lightness this
generator keeps on purpose, so the canvas and the sidebar are set at the token level
to Bloom's own light anchors, `oklch(96.5% 0.01 240)` and `oklch(94.5% 0.012 240)`.

| Pair | Bloom Lite | Verdict |
|---|---|---|
| light body text on the mist canvas | 17.16:1 | AA |
| light secondary text on canvas | 5.24:1 | AA |
| light tertiary text on canvas | 3.37:1 | AA-large |
| light text on a white card | 18.90:1 | AA |
| light sidebar text | 4.92:1 | AA |
| light primary button label (white on `#2078ab`) | 4.84:1 | AA |
| dark body text on base | 17.45:1 | AA |
| dark secondary text on base | 12.10:1 | AA |
| dark tertiary text on base | 8.53:1 | AA |
| dark text on a raised panel | 15.02:1 | AA |
| dark primary button label (`#07121b` on `#5dabe0`) | 7.53:1 | AA |

Change `HUE` (or the three chroma ceilings `C_NEUTRAL` / `C_GRAY` / `C_ACCENT`) at
the top of `_tools/gen.mjs` and re-run both scripts to get another mood.

## The build refuses to regress

`_tools/build.mjs` fails the build if the stylesheet ever contains: `!important`,
any `@`-rule, `animation`, `transition`, `filter` / `backdrop-filter`, `box-shadow`,
`text-shadow`, `will-change`, a gradient or `url()` image, or a class/id selector.
It also asserts the exact rule/declaration counts and that the emitted `client.js`
parses. A theme that costs frames cannot be shipped from this repo by accident.

## Deliberately removed

Glass panels (`backdrop-filter` on large surfaces), micro-motion, the variant
switcher chip and its watchers, the other 9 palettes, the `appearance`/`think-tag`
watchers, the Host version route, the `webServer` injection, the
`@deepseek-ai/dsh-client-ui-conversation` activation dependency, the ZH/EN locale
strings (there is no plugin-owned text left to translate), and the update badge.
Every one of them is either continuous main-thread work or state that has to stay
in sync; a theme needs neither.

## Package layout

```
index.js            host half - export function apply() {}, nothing else
client.js           shipped client half (built: stylesheet inlined, minified)
cordis.patch.yml    bundle patch, inserts the row
src/runtime.js      hand-written client source template
src/client.css      generated stylesheet (readable, one declaration per line)
_tools/gen.mjs      palette generator + contrast audit
_tools/build.mjs    inliner, minifier, performance guards
```

Install / update:

```
git clone https://github.com/EatMyLunch/dsh-bloom-lite.git
```

Then add that checkout to the active profile as a bundle — the Harness's plugin
manager takes the absolute directory path:

```
plugin_manager { action: "install_bundle", target: "C:/path/to/dsh-bloom-lite" }
```

There is no build step and there are no dependencies: `client.js` is committed
already built, so the Harness serves exactly the bytes this repo reviews. Deleting
the checkout removes the theme.

## Verification status

Verified: JavaScript syntax of the shipped `client.js` (`new Function` parse gate),
manifest and patch validity, the static cascade arithmetic above, and the contrast
table (computed offline from the installed Host ramps with the CSS Color 4 OKLab
conversion).

Verified live: `plugin_manager` reported `application: applied` for this directory,
the profile now carries the bundle row `include:bloom-lite` -> `dsh-bloom-lite`, and
the running Harness serves the artifact at
`GET /plugins/??dsh-bloom-lite/client.js&rev=<artifact-rev>` with `200`,
`text/javascript; charset=utf-8`. The served body is byte-identical to this
package's `client.js` apart from the Host's own `;\n` separator and one-line
`sourceMappingURL` trailer, so the code the browser executes is exactly what the
build guards approved.

**Not verified: the rendered result.** This environment has no browser control, so
no screenshot or computed-style read-out was taken. Reload the page to see the
theme; light/dark follows the Harness's own toggle.

## Credits and license

MIT — see [LICENSE](LICENSE).

The palette is a re-hue of [dsh-bloom-theme](https://github.com/webkubor/dsh-bloom-theme)
by [webkubor](https://github.com/webkubor) (also MIT): this package keeps that theme's
Morandi mist-blue intent and its lightness relationships, and throws away everything
that costs runtime. The colour ramps it rewrites belong to the DeepSeek Harness.

Author: [EatMyLunch](https://github.com/EatMyLunch).
