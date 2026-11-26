'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const CACHE = path.join(__dirname, 'ui', 'icon-cache');
const KINDS = {
    icons: 'image/png',
    slots: 'image/png',
    fonts: 'image/svg+xml'
};
const NAME = /^[a-z0-9_.-]+\.(png|svg)$/i;
const inflight = new Map();

function fetchRemote(kind, file) {
    const url = 'https://static.teragame.su/unicast-data/' + kind + '/' + file;
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'unicast' } }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(kind + '/' + file + ' ' + res.statusCode));
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy(new Error('timeout'));
        });
    });
}

function sendFile(res, type, buf) {
    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=86400');
    res.end(buf);
}

function sendIcon(kind, req, res) {
    const type = KINDS[kind];
    const file = String(req.params.file || '').toLowerCase();
    if (!type || !NAME.test(file)) {
        res.status(404).end();
        return;
    }
    const dest = path.join(CACHE, kind, file);
    if (fs.existsSync(dest)) {
        sendFile(res, type, fs.readFileSync(dest));
        return;
    }
    const key = kind + '/' + file;
    let job = inflight.get(key);
    if (!job) {
        job = fetchRemote(kind, file).then((buf) => {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, buf);
            return buf;
        }).finally(() => inflight.delete(key));
        inflight.set(key, job);
    }
    job.then((buf) => sendFile(res, type, buf)).catch(() => {
        if (!res.headersSent) res.status(404).end();
    });
}

function install() {
    const UI = require('../UI');
    if (UI.__unicastIcons) return;
    UI.__unicastIcons = true;
    const orig = UI.Router;
    function wrapped(mod, options) {
        const router = orig.call(this, mod, options);
        router.get('/icons/:file', (req, res) => sendIcon('icons', req, res));
        router.get('/slots/:file', (req, res) => sendIcon('slots', req, res));
        router.get('/fonts/:file', (req, res) => sendIcon('fonts', req, res));
        return router;
    }
    // Unicast sets the router prototype from UI.Router.prototype at call time.
    wrapped.prototype = orig.prototype;
    UI.Router = wrapped;
}

module.exports = { install };
