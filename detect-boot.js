"use strict";

const fs = require("fs");
const { collectAndApply } = require("./detect-items");

module.exports = function (modModule) {
	const factory = modModule.exports;
	const origRead = fs.readFileSync;
	const origParse = JSON.parse;
	const pinned = new Map();
	const captured = { data: null, misc: null };

	function restore() {
		fs.readFileSync = origRead;
		JSON.parse = origParse;
		pinned.clear();
	}

	fs.readFileSync = function (file) {
		const out = origRead.apply(fs, arguments);
		const name = String(file).replace(/\\/g, "/");
		let kind = null;
		if (name.indexOf("/ui/json/") !== -1 && name.endsWith("/data.json")) kind = "data";
		else if (name.indexOf("/ui/json/") !== -1 && name.endsWith("/misc.json")) kind = "misc";
		if (!kind) return out;
		const text = Buffer.isBuffer(out) ? out.toString("utf8") : String(out);
		const obj = origParse(text);
		captured[kind] = obj;
		const pinnedText = JSON.stringify(obj);
		pinned.set(pinnedText, obj);
		return pinnedText;
	};

	JSON.parse = function (text, reviver) {
		if (typeof text === "string" && pinned.has(text)) return pinned.get(text);
		return origParse.call(JSON, text, reviver);
	};

	modModule.exports = function (mod) {
		try {
			factory.call(this, mod);
		} finally {
			restore();
		}
		collectAndApply(mod, captured);
	};
};
