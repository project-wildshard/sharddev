#!/usr/bin/env node
import { runCli } from '../dist/cli.js';
// oxlint-disable-next-line import/no-nodejs-modules -- This executable is the Node author CLI.
import process from 'node:process';

try { await runCli(process.argv.slice(2)); }
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
