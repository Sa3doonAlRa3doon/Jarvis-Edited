/**
 * Adapted from the PluginStorage pattern in Sukeesh/Jarvis:
 * https://github.com/sukeesh/Jarvis/blob/master/jarviscli/plugin.py
 * Copyright (c) 2017 Sukeesh. Used under the MIT License; see
 * third_party/licenses/sukeesh-jarvis-MIT.txt.
 *
 * JARVIS changes: JavaScript port, validated names, copy-on-transfer, and
 * defensive enumeration. This stores explicitly registered in-process plugin
 * descriptors; it never imports or executes code from user-writable paths.
 */
export class PluginStorage {
  #plugins = new Map();

  addPlugin(name, pluginToAdd) {
    const key = String(name || '').trim();
    if (!key || key.length > 80 || !/^[a-z0-9][a-z0-9._-]*$/i.test(key)) {
      throw new TypeError('Plugin name must be a short identifier.');
    }
    if (!pluginToAdd || typeof pluginToAdd !== 'object' || Array.isArray(pluginToAdd)) {
      throw new TypeError('Plugin must be an object descriptor.');
    }
    if (this.#plugins.has(key)) throw new Error(`Plugin is already registered: ${key}`);
    const descriptor = Object.isFrozen(pluginToAdd) ? pluginToAdd : Object.freeze({ ...pluginToAdd });
    this.#plugins.set(key, descriptor);
    return descriptor;
  }

  getPlugins(name = undefined) {
    if (name !== undefined && name !== null) return this.#plugins.get(String(name)) ?? null;
    return Object.fromEntries(this.#plugins.entries());
  }

  removePlugin(name) {
    return this.#plugins.delete(String(name || ''));
  }

  changeWith(pluginNew) {
    if (!(pluginNew instanceof PluginStorage)) throw new TypeError('Target must be a PluginStorage.');
    pluginNew.#plugins = new Map(this.#plugins);
    return pluginNew;
  }
}
