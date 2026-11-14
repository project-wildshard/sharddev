// SA8: the first import of bin/wildshard.mjs. It refuses a run whose `three` is not the sdk's pin (threePin.mjs), except help.
import { threeRefusal } from './threePin.mjs';

const HELP = new Set(['help', '--help', '-h']);
if (!process.argv.slice(2).some(arg => HELP.has(arg))) {
  const refusal = threeRefusal(new URL('../../package.json', import.meta.url));
  if (refusal !== undefined) {
    process.stderr.write(`wildshard: ${refusal}\n`);
    // oxlint-disable-next-line unicorn/no-process-exit -- Stop before any other module loads; a throw would print a stack to authors.
    process.exit(1);
  }
}
