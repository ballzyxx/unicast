"use strict";

const fs = require("fs");
const path = require("path");

const SLOT_BY_CATEGORY = {
	style_back: "styleBack",
	style_body: "styleBody",
	style_face: "styleFace",
	style_hair: "styleHead",
	style_foot_print: "styleFootprint",
	style_dual: "styleWeapon",
	style_lance: "styleWeapon",
	style_twohand: "styleWeapon",
	style_axe: "styleWeapon",
	style_circle: "styleWeapon",
	style_bow: "styleWeapon",
	style_staff: "styleWeapon",
	style_rod: "styleWeapon",
	style_blaster: "styleWeapon",
	style_glaive: "styleWeapon",
	style_chain: "styleWeapon",
	style_gauntlet: "styleWeapon",
	style_shuriken: "styleWeapon"
};

const WEAPON_CLASSES = {
	style_dual: [0],
	style_lance: [1],
	style_twohand: [2],
	style_axe: [3],
	style_circle: [4],
	style_bow: [5],
	style_staff: [6],
	style_rod: [7],
	style_chain: [8],
	style_blaster: [9],
	style_gauntlet: [10],
	style_shuriken: [11],
	style_glaive: [12]
};

function cleanName(value) {
	return String(value || "")
		.replace(/<[^>]*>/g, "")
		.replace(/\$BR\$/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function iconName(icon) {
	if (!icon) return "";
	return String(icon).split(".").pop().replace(/\.png$/i, "").toLowerCase();
}

function rank(item) {
	const period = Number(item.periodInMinute);
	const permanent = !Number.isFinite(period) || period <= 0 || period >= 4000000000;
	const tradeable = !/untradeable/i.test(item.name || "");
	return (permanent ? 2 : 0) + (tradeable ? 1 : 0);
}

function buildExtra(dcItems, names, misc) {
	const categories = (misc && misc.categories) || {};
	const byId = new Map();
	for (const item of dcItems) {
		const id = Number(item.id);
		if (!id) continue;
		byId.set(id, item);
	}

	const present = new Set();
	const known = new Set();
	for (const slot of Object.keys(categories)) {
		const ids = categories[slot] || [];
		for (const rawId of ids) {
			const id = Number(rawId);
			present.add(slot + ":" + id);
			const item = byId.get(id);
			if (!item) continue;
			const look = Number(item.linkLookInfoId) || 0;
			if (look > 0) known.add(slot + ":L" + look);
		}
	}

	const chosen = new Map();
	for (const item of dcItems) {
		const slot = SLOT_BY_CATEGORY[item.category];
		if (!slot || !categories[slot]) continue;
		const id = Number(item.id);
		if (!id || present.has(slot + ":" + id)) continue;
		const name = cleanName(names.get(id));
		const icon = iconName(item.icon);
		if (!name || !icon) continue;
		const look = Number(item.linkLookInfoId) || 0;
		const key = look > 0 ? slot + ":L" + look : slot + ":N" + name.toLowerCase();
		if (known.has(key)) continue;
		const candidate = {
			id: id,
			slot: slot,
			category: item.category,
			name: name,
			icon: icon,
			periodInMinute: item.periodInMinute,
			dyeable: item.changeColorEnable === true || item.changeColorEnable === 1 || item.changeColorEnable === "True"
		};
		const prev = chosen.get(key);
		if (!prev || rank(candidate) > rank(prev) || (rank(candidate) === rank(prev) && candidate.id < prev.id)) {
			chosen.set(key, candidate);
		}
	}

	const extra = { items: {}, categories: {} };
	for (const candidate of chosen.values()) {
		extra.items[String(candidate.id)] = {
			id: candidate.id,
			icon: candidate.icon,
			name: candidate.name,
			classes: WEAPON_CLASSES[candidate.category] || false,
			races: false,
			dyeable: candidate.dyeable,
			nameable: false
		};
		if (!extra.categories[candidate.slot]) extra.categories[candidate.slot] = [];
		extra.categories[candidate.slot].push(candidate.id);
	}
	return extra;
}

function mergeInto(captured, extra) {
	if (!captured.data || !captured.data.items || !captured.misc || !captured.misc.categories) return;
	const items = captured.data.items;
	Object.keys(extra.items).forEach(function (id) {
		if (!items[id]) items[id] = extra.items[id];
	});
	Object.keys(extra.categories).forEach(function (slot) {
		const list = captured.misc.categories[slot];
		if (!list) return;
		extra.categories[slot].forEach(function (id) {
			if (list.indexOf(id) === -1) list.push(id);
		});
	});
}

async function queryAll(mod, attributes) {
	return mod.queryData("/ItemData/Item/", [], true, false, attributes);
}

async function loadFromClient(mod) {
	let rows;
	try {
		rows = await queryAll(mod, ["id", "category", "icon", "linkLookInfoId", "periodInMinute", "changeColorEnable"]);
	} catch (err) {
		rows = await queryAll(mod, ["id", "category", "icon"]);
	}
	const strings = await mod.queryData("/StrSheet_Item/String/", [], true, false, ["id", "string"]);
	const items = [];
	for (const row of rows || []) {
		const attrs = row.attributes || row;
		if (attrs && attrs.id) items.push(attrs);
	}
	const names = new Map();
	for (const row of strings || []) {
		const attrs = row.attributes || row;
		const id = Number(attrs && attrs.id);
		const name = cleanName(attrs && attrs.string);
		if (id && name && !names.has(id)) names.set(id, name);
	}
	return { items: items, names: names };
}

let scanning = false;

async function collectAndApply(mod, captured) {
	const baseline = captured.misc ? JSON.parse(JSON.stringify({ categories: captured.misc.categories })) : null;
	const run = async function () {
		if (scanning) return;
		if (typeof mod.queryData !== "function") return;
		if (!captured.data || !baseline) return;
		scanning = true;
		try {
			const loaded = await loadFromClient(mod);
			const extra = buildExtra(loaded.items, loaded.names, baseline);
			const count = Object.keys(extra.items).length;
			fs.writeFileSync(path.join(__dirname, "ui", "auto-items.json"), JSON.stringify(extra));
			mergeInto(captured, extra);
			if (count > 0) console.log("[unicast] autodetect added " + count + " costumes");
		} catch (err) {
			console.error("[unicast] autodetect failed");
			console.error(err);
		} finally {
			scanning = false;
		}
	};

	if (mod.clientInterface && typeof mod.clientInterface.once === "function") {
		mod.clientInterface.once("ready", run);
	}
	if (mod.game && typeof mod.game.on === "function") {
		mod.game.on("enter_game", run);
	}
}

module.exports = {
	SLOT_BY_CATEGORY: SLOT_BY_CATEGORY,
	buildExtra: buildExtra,
	mergeInto: mergeInto,
	collectAndApply: collectAndApply
};
