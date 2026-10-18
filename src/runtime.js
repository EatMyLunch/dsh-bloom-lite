/*
 * dsh-bloom-lite - Client half (source template; _tools/build.mjs inlines the
 * stylesheet and emits the shipped ./client.js).
 *
 * Optimisation doctrine: the theme IS a stylesheet, so the runtime IS one style
 * insert. No React, no slot registration, no observer, no listener, no timer, no
 * animation, no filter, no storage, no !important, no second style tag.
 * Cost per session: one element, one CSS parse, one cascade pass, and it is owned
 * by this plugin's context, so disposing the plugin removes it.
 */
window.__ModuleLoader__.load({
  id: 'dsh-bloom-lite',
  factory() {
    const ID = 'dsh-bloom-lite';
    const CSS = '__BLOOM_CSS__';
    function install() {
      if (typeof document === 'undefined') return;
      let el = document.getElementById(ID);
      if (el === null) {
        el = document.createElement('style');
        el.id = ID;
        // Claim ownership explicitly. The module loader adopts every UNTAGGED style tag it
        // finds while materialising a client module (dsh-client-modules/lib/client.js:
        // `for (const el of document.querySelectorAll('style:not([data-plugin])'))
        // el.setAttribute('data-plugin', id)`) and later removes `style[data-plugin=<id>]`
        // when that other module unloads - which would delete this theme. Stamping our own
        // id also makes the loader's ownership sweep treat the tag as ours.
        el.dataset.plugin = ID;
        el.dataset.pluginCss = ID;
        el.textContent = CSS;
        (document.head || document.documentElement).appendChild(el);
      }
      return function dispose() {
        el.remove();
      };
    }
    return {
      inject: [],
      apply(ctx) {
        if (ctx.effect) ctx.effect(install, 'dsh-bloom-lite: theme stylesheet');
        else install();
      },
    };
  },
});
