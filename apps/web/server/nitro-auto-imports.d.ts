/**
 * Nitro auto-imports `defineNitroPlugin` into every file under `server/plugins`, and
 * generates the types for it during its own build. Typechecking the app on its own has no
 * such build, so the two plugins here would read as undefined names. Declared with only the
 * surface they use: enough for the compiler to hold them to something, without pretending to
 * restate Nitro's own types.
 */
declare interface NitroPluginApp {
  hooks: {
    hook: (name: string, handler: (...args: never[]) => unknown) => void;
  };
}

declare function defineNitroPlugin(
  plugin: (nitroApp: NitroPluginApp) => void
): (nitroApp: NitroPluginApp) => void;
