(function () {
	if (!window.jQuery) return;
	var $ = window.jQuery;
	var orig = $.ajax;
	var dataRes = null;
	var miscRes = null;
	var started = false;

	function merge(extra) {
		if (!extra || !extra.items || !dataRes || !miscRes) return;
		var items = dataRes.items;
		Object.keys(extra.items).forEach(function (id) {
			if (!items[id]) Vue.set(items, id, extra.items[id]);
		});
		var cats = miscRes.categories || {};
		Object.keys(extra.categories || {}).forEach(function (slot) {
			var list = cats[slot];
			if (!list) return;
			extra.categories[slot].forEach(function (id) {
				var num = Number(id);
				if (list.indexOf(num) === -1 && list.indexOf(id) === -1) list.push(num);
			});
		});
	}

	function pull() {
		if (started || !dataRes || !miscRes) return;
		started = true;
		orig({
			url: "auto-items.json?t=" + Date.now(),
			dataType: "json",
			cache: false,
			success: merge,
			error: function () {}
		});
	}

	$.ajax = function (opt) {
		if (opt && typeof opt.url === "string" && (opt.url.indexOf("data.json") !== -1 || opt.url.indexOf("misc.json") !== -1)) {
			var prev = opt.success;
			opt.success = function (res) {
				if (prev) prev.apply(this, arguments);
				if (opt.url.indexOf("data.json") !== -1 && res && res.items) dataRes = res;
				if (opt.url.indexOf("misc.json") !== -1 && res && res.categories) miscRes = res;
				pull();
			};
		}
		return orig.apply(this, arguments);
	};
})();
