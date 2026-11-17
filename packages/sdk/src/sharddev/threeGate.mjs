// SA8: the first import of bin/wildshard.mjs. It refuses a run whose `three` is not the sdk's pin (threePin.mjs), except help and --version.
import { threeRefusal } from './threePin.mjs';

// Help and --version print without it: the refusal sends authors to --version for the pinned chain.
const args = process.argv.slice(2);
const passes = args[0] === 'help' || args[0] === '--version' || args.some(arg => arg === '--help' || arg === '-h');
if (!passes) {
  const refusal = threeRefusal(new URL('../../package.json', import.meta.url));
  if (refusal !== undefined) {
    process.stderr.write(`wildshard: ${refusal}\n`);
    // oxlint-disable-next-line unicorn/no-process-exit -- Stop before any other module loads; a throw would print a stack to authors.
    process.exit(1);
  }
}
