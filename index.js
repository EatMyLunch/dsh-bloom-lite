/**
 * Host half of dsh-bloom-lite.
 *
 * The theme is a stylesheet, so the host side has nothing to do: no service, no
 * route, no config, no state. This file exists only so the loader can resolve the
 * package row. Not importing anything keeps the host boot graph at zero cost.
 */
export function apply() {}
