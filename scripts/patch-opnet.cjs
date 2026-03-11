#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const target = path.join(__dirname, '..', 'node_modules', 'opnet', 'browser', 'index.js');
if (!fs.existsSync(target)) { console.log('[patch-opnet] not found, skip'); process.exit(0); }
let code = fs.readFileSync(target, 'utf8');
const MARKER = '/*opnet-patched-http*/';
if (code.includes(MARKER)) { console.log('[patch-opnet] already patched'); process.exit(0); }
const patched = code.replace(
  /providerUrl\(e\)\{return e=e\.trim\(\), e\.endsWith\("\/"\)/,
  'providerUrl(e){' + MARKER + 'e=e||"https://testnet.opnet.org";return e=e.trim(), e.endsWith("/")'
);
if (patched === code) { console.log('[patch-opnet] WARNING: pattern not found'); process.exit(0); }
fs.writeFileSync(target, patched, 'utf8');
console.log('[patch-opnet] patched OK');
