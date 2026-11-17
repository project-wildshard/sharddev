#!/usr/bin/env node
import { installFormatHook } from '@wildshard/format/formatHook'

// The `wildshard` bin. Node will not strip types under node_modules (J53), so
// an installed CLI needs format's hook before its first .ts. The hook covers
// everything under node_modules/@wildshard/, this package too.
installFormatHook()
await import('./main.ts')
