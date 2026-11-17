// SDK-SPLIT SP10's test hook: any module of @wildshard/engine resolved in this process fails it (node --import).
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    const result = next(specifier, context);
    if (specifier === '@wildshard/engine' || specifier.startsWith('@wildshard/engine/') || /\/@wildshard\/engine\//u.test(result.url))
      throw new Error(`engine loaded: ${specifier}`);
    return result;
  },
});
