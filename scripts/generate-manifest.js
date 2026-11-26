'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'manifest.json');

const SKIP_DIR = new Set(['.git', 'scripts', 'saves', 'presets']);
const SKIP_FILE = new Set([
    'module.config.json',
    '.gitignore',
    '.gitattributes',
    'manifest.json',
    'bookmarks.json',
    'config.json',
    'ui/auto-items.json',
]);
const NO_OVERWRITE = new Set();

function sha256(filePath) {
    const raw = fs.readFileSync(filePath);
    if (raw.includes(0)) {
        return crypto.createHash('sha256').update(raw).digest('hex');
    }
    // GitHub raw serves LF. Hash those bytes so Toolbox auto-update matches.
    const normalized = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8');
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

function walk(dir, relBase = '') {
    const out = [];
    for (const name of fs.readdirSync(dir).sort()) {
        if (SKIP_DIR.has(name)) continue;
        const full = path.join(dir, name);
        const rel = relBase ? `${relBase}/${name}` : name;
        if (SKIP_FILE.has(rel) || SKIP_FILE.has(name)) continue;
        if (fs.statSync(full).isDirectory()) {
            out.push(...walk(full, rel));
        } else {
            out.push(rel);
        }
    }
    return out;
}

const files = {};
for (const rel of walk(ROOT)) {
    const hash = sha256(path.join(ROOT, rel.split('/').join(path.sep)));
    files[rel] = NO_OVERWRITE.has(rel) ? { overwrite: false, hash } : hash;
}

fs.writeFileSync(OUT, JSON.stringify({ files }, null, 4).replace(/\r\n/g, '\n') + '\n');
console.log('Wrote manifest.json (' + Object.keys(files).length + ' files)');
