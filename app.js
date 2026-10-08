(function () {
  'use strict';

  // Clickjacking guard. GitHub Pages cannot send a frame-ancestors header.
  try { if (window.top !== window.self) window.top.location = window.self.location.href; } catch (e) { /* cross-origin parent */ }

  var GRADES = {
    p95: { name: 'Petrol 95', type: 'p' },
    p93: { name: 'Petrol 93', type: 'p' },
    d50: { name: 'Diesel 50ppm', type: 'd' },
    d500: { name: 'Diesel 500ppm', type: 'd' }
  };
  var GRADE_ORDER = ['p95', 'p93', 'd50', 'd500'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var STORE_KEY = 'pumpcheck.v2';

  var state = { grade: 'p95', region: 'inland', vehicleKey: '', km: 1500, cons: 5.4, tank: 40, adj: 0, nxt: 1 };
  var vehicles = [];
  var set = null; // { cur, prev, upcoming, updated }
  var matches = [];
  var active = -1;

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { v = Number(v); if (!isFinite(v)) v = 0; return Math.min(hi, Math.max(lo, v)); }
  function numIn(id, lo, hi) { return clamp($(id).value, lo, hi); }

  // ---------- formatting ----------
  function fmt(n, d) {
    var p = Math.abs(n).toFixed(d).split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return p.join('.');
  }
  function isZero(n, d) { return Number(Math.abs(n).toFixed(d)) === 0; }
  function R(n, d) { d = d == null ? 2 : d; return (n < 0 && !isZero(n, d) ? '-' : '') + 'R' + fmt(n, d); }
  function signR(n, d) { d = d == null ? 2 : d; return (n < 0 && !isZero(n, d) ? '-' : '+') + 'R' + fmt(n, d); }

  // ---------- dates ----------
  function todaySA() { return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10); }
  function firstWednesday(y, m) {
    var dow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    var day = 1 + ((3 - dow + 7) % 7);
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }
  function lastAdjustmentOnOrBefore(iso) {
    var y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1;
    var d = firstWednesday(y, m);
    if (d <= iso) return d;
    return m === 0 ? firstWednesday(y - 1, 11) : firstWednesday(y, m - 1);
  }
  function parts(iso) { return iso.split('-').map(Number); }
  function longDate(iso) {
    var p = parts(iso);
    return DAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + ' ' + p[2] + ' ' + MONTHS[p[1] - 1] + ' ' + p[0];
  }
  function shortDate(iso) {
    var p = parts(iso);
    return DAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()].slice(0, 3) + ' ' + p[2] + ' ' + MONTHS[p[1] - 1].slice(0, 3) + ' ' + p[0];
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

  // ---------- price data ----------
  function validPrices(data) {
    if (!data || !Array.isArray(data.history) || !data.history.length) return false;
    return data.history.every(function (e) {
      if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.effective) || !e.prices) return false;
      return GRADE_ORDER.every(function (g) {
        var p = e.prices[g];
        if (!p) return false;
        return ['inland', 'coast'].every(function (r) { return p[r] === null || (typeof p[r] === 'number' && p[r] > 5 && p[r] < 100); });
      });
    });
  }
  function pickSet(data) {
    var h = data.history.slice().sort(function (a, b) { return b.effective < a.effective ? -1 : 1; });
    var t = todaySA(), i = -1;
    for (var k = 0; k < h.length; k++) { if (h[k].effective <= t) { i = k; break; } }
    if (i < 0) i = h.length - 1;
    return { cur: h[i], prev: h[i + 1] || null, upcoming: i > 0 ? h[i - 1] : null, updated: data.updated };
  }
  function priceOf(entry, grade, region) {
    if (!entry) return null;
    var p = entry.prices[grade];
    var v = p[region];
    if (v == null && region === 'coast') v = p.inland;
    return v;
  }
  function regionUsed(grade, region) {
    return region === 'coast' && set.cur.prices[grade].coast == null ? 'inland' : region;
  }

  // ---------- vehicles ----------
  function vKey(v) { return v.make + '|' + v.model + '|' + v.variant; }
  function vLabel(v) { return v.make + ' ' + v.model + ' ' + v.variant; }
  function findVehicle(key) { for (var i = 0; i < vehicles.length; i++) { if (vKey(vehicles[i]) === key) return vehicles[i]; } return null; }
  function uniq(arr) { return arr.filter(function (x, i) { return arr.indexOf(x) === i; }); }

  function fillSelect(sel, items, current) {
    sel.textContent = '';
    items.forEach(function (it) {
      var o = document.createElement('option');
      o.value = it; o.textContent = it;
      if (it === current) o.selected = true;
      sel.appendChild(o);
    });
  }
  function modelsOf(make) {
    var list = vehicles.filter(function (x) { return x.make === make; });
    return uniq(list.map(function (x) { return x.model; })).sort();
  }
  function variantsOf(make, model) {
    return vehicles.filter(function (x) { return x.make === make && x.model === model; })
      .sort(function (a, b) { return a.variant < b.variant ? -1 : 1; })
      .map(function (x) { return x.variant; });
  }
  function syncSelects(v) {
    fillSelect($('vmake'), uniq(vehicles.map(function (x) { return x.make; })).sort(), v.make);
    fillSelect($('vmodel'), modelsOf(v.make), v.model);
    fillSelect($('vvar'), variantsOf(v.make, v.model), v.variant);
  }
  function chooseVehicle(v, keepInputs) {
    state.vehicleKey = vKey(v);
    syncSelects(v);
    if (!keepInputs) {
      state.cons = v.cons; state.tank = v.tank;
      $('cons').value = v.cons; $('tank').value = v.tank;
      if (GRADES[state.grade].type !== v.fuel) state.grade = v.fuel === 'd' ? 'd50' : 'p95';
    }
    $('vq').value = '';
    closeList();
    save();
    render();
  }
  function search(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    var out = [];
    vehicles.forEach(function (v) {
      var hay = vLabel(v).toLowerCase();
      for (var i = 0; i < terms.length; i++) { if (hay.indexOf(terms[i]) < 0) return; }
      var score = hay.indexOf(terms[0]) === 0 ? 0 : (v.model.toLowerCase().indexOf(terms[0]) === 0 ? 1 : 2);
      out.push({ v: v, score: score });
    });
    out.sort(function (a, b) { return a.score - b.score || (vLabel(a.v) < vLabel(b.v) ? -1 : 1); });
    return out.slice(0, 10).map(function (x) { return x.v; });
  }
  function openList() { $('vlist').hidden = false; $('vq').setAttribute('aria-expanded', 'true'); }
  function closeList() { $('vlist').hidden = true; $('vq').setAttribute('aria-expanded', 'false'); $('vq').removeAttribute('aria-activedescendant'); active = -1; }
  function renderList() {
    var list = $('vlist');
    list.textContent = '';
    var q = $('vq').value.trim();
    if (!q) { closeList(); return; }
    matches = search(q);
    if (!matches.length) {
      var none = document.createElement('li');
      none.className = 'none'; none.setAttribute('role', 'option'); none.setAttribute('aria-disabled', 'true');
      none.textContent = 'No match. Pick from the lists or type your own fuel use and tank size.';
      list.appendChild(none);
    }
    matches.forEach(function (v, i) {
      var li = document.createElement('li');
      li.id = 'vopt' + i; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', 'false');
      var a = document.createElement('span'); a.textContent = vLabel(v);
      var b = document.createElement('span'); b.className = 'tagline';
      b.textContent = v.fuel === 'd' ? 'Diesel' : 'Petrol';
      li.appendChild(a); li.appendChild(b);
      li.addEventListener('mousedown', function (e) { e.preventDefault(); chooseVehicle(v); });
      list.appendChild(li);
    });
    active = -1;
    openList();
  }
  function moveActive(step) {
    if (!matches.length) return;
    active = (active + step + matches.length) % matches.length;
    var items = $('vlist').children;
    for (var i = 0; i < items.length; i++) items[i].setAttribute('aria-selected', String(i === active));
    $('vq').setAttribute('aria-activedescendant', 'vopt' + active);
    items[active].scrollIntoView({ block: 'nearest' });
  }

  // ---------- storage ----------
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: state.vehicleKey, g: state.grade, r: state.region, km: state.km, c: state.cons, t: state.tank, a: state.adj }));
    } catch (e) { /* storage unavailable */ }
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!s || typeof s !== 'object') return;
      if (typeof s.v === 'string' && findVehicle(s.v)) state.vehicleKey = s.v;
      if (GRADES[s.g]) state.grade = s.g;
      if (s.r === 'inland' || s.r === 'coast') state.region = s.r;
      if (typeof s.km === 'number') state.km = clamp(s.km, 0, 100000);
      if (typeof s.c === 'number') state.cons = clamp(s.c, 0, 40);
      if (typeof s.t === 'number') state.tank = clamp(s.t, 0, 300);
      if (typeof s.a === 'number') state.adj = clamp(s.a, -5, 20);
    } catch (e) { /* ignore bad data */ }
  }

  // ---------- render ----------
  function renderGradeButtons() {
    var seg = $('gradeSeg');
    if (!seg.children.length) {
      GRADE_ORDER.forEach(function (g) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = GRADES[g].name; b.dataset.g = g;
        seg.appendChild(b);
      });
    }
    Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.g === state.grade)); });
  }
  function setCell(id, now, before, d) {
    $('v' + id).textContent = R(now, d);
    var sub = $('d' + id);
    sub.textContent = '';
    if (before == null) return;
    sub.appendChild(document.createTextNode('was ' + R(before, d) + ' '));
    var up = document.createElement('b');
    up.textContent = signR(now - before, d);
    sub.appendChild(up);
  }

  function renderSource(v) {
    var el = $('vsrc');
    el.textContent = '';
    el.className = 'hint';
    if (!v) { el.hidden = true; return; }
    el.hidden = false;
    var text = v.status === 2 ? 'Fuel use and tank size come from a published South African source. '
      : v.status === 1 ? 'Fuel use comes from a published South African source. Tank size is approximate. '
      : 'Approximate figures, not yet checked against a published source. Change them below if you know yours. ';
    el.appendChild(document.createTextNode(text));
    if (v.note) el.appendChild(document.createTextNode(v.note + ' '));
    if (v.src && /^https:\/\//.test(v.src)) {
      var a = document.createElement('a');
      a.href = v.src; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'View source';
      el.appendChild(a);
    }
  }

  function render() {
    renderGradeButtons();
    var v = findVehicle(state.vehicleKey);
    var reg = set ? regionUsed(state.grade, state.region) : state.region;
    Array.prototype.forEach.call($('regSeg').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.r === reg)); });

    var line = v ? vLabel(v) + ' · ' + (v.fuel === 'd' ? 'diesel' : 'petrol') + ' · ' : '';
    $('vsum').textContent = line + fmt(state.cons, 1) + ' l/100 km · ' + fmt(state.tank, 0) + ' l tank';
    renderSource(v);

    var note = '';
    if (state.region === 'coast' && reg === 'inland') note = 'Petrol 93 is sold inland only, so inland prices are shown.';
    if (GRADES[state.grade].type === 'd') note = (note ? note + ' ' : '') + 'Diesel prices are wholesale. Add your garage\'s extra below.';
    $('note').hidden = !note; $('note').textContent = note;

    if (!set) return;
    var after = priceOf(set.cur, state.grade, reg) + state.adj;
    var prevBase = set.prev ? priceOf(set.prev, state.grade, reg) : null;
    var before = prevBase == null ? null : prevBase + state.adj;
    var monthL = state.km / 100 * state.cons;

    $('resTitle').textContent = GRADES[state.grade].name + ', ' + (reg === 'inland' ? 'inland' : 'coast');
    $('resMeta').textContent = 'from ' + shortDate(set.cur.effective);
    $('lbTank').textContent = 'Full tank (' + fmt(state.tank, 0) + ' l)';
    $('lbMonth').textContent = 'Per month (' + fmt(state.km, 0) + ' km)';
    var f = function (x) { return before == null ? null : before * x; };
    setCell('Litre', after, before, 2);
    setCell('Tank', after * state.tank, f(state.tank), 2);
    setCell('Month', after * monthL, f(monthL), 0);
    setCell('Year', after * monthL * 12, f(monthL * 12), 0);

    $('litres').textContent = fmt(monthL, 0) + ' litres a month · ' + R(after * state.cons, 2) + ' per 100 km · a full tank covers about ' +
      (state.cons > 0 ? fmt(state.tank / state.cons * 100, 0) : '0') + ' km';

    var n = state.nxt, diff = n * monthL;
    $('nxtOut').textContent = R((after + n) * monthL, 0) + ' a month';
    $('nxtNote').textContent = R(after + n) + ' per litre, ' + R(Math.abs(diff), 0) + (diff >= 0 ? ' more' : ' less') + ' than now.';

    var today = todaySA(), due = lastAdjustmentOnOrBefore(today), stale = $('stale');
    if (set.cur.effective < due && daysBetween(due, today) >= 3) {
      stale.hidden = false;
      stale.textContent = 'A new adjustment took effect on ' + longDate(due) + '. These prices are from ' + longDate(set.cur.effective) + ' and will update shortly.';
    } else { stale.hidden = true; }
    var up = $('upcoming');
    if (set.upcoming) {
      var uv = priceOf(set.upcoming, state.grade, reg);
      up.hidden = false;
      up.textContent = 'From ' + longDate(set.upcoming.effective) + ', ' + GRADES[state.grade].name + ' moves to ' + R(uv + state.adj) + ' per litre (' + signR(uv - priceOf(set.cur, state.grade, reg)) + ').';
    } else { up.hidden = true; }

    $('updated').textContent = 'Prices last checked ' + longDate(set.updated || set.cur.effective) + '.';
  }

  // ---------- events ----------
  function bind() {
    $('gradeSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !GRADES[b.dataset.g]) return;
      state.grade = b.dataset.g; save(); render();
    });
    $('regSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      state.region = b.dataset.r === 'coast' ? 'coast' : 'inland'; save(); render();
    });
    [['km', 'km', 0, 100000], ['cons', 'cons', 0, 40], ['tank', 'tank', 0, 300], ['adj', 'adj', -5, 20], ['nxt', 'nxt', -10, 10]].forEach(function (f) {
      $(f[0]).addEventListener('input', function () { state[f[1]] = numIn(f[0], f[2], f[3]); save(); render(); });
    });
    function pick(make, model, variant) {
      var l = vehicles.filter(function (x) { return x.make === make && (!model || x.model === model) && (!variant || x.variant === variant); });
      if (l[0]) chooseVehicle(l[0]);
    }
    $('vmake').addEventListener('change', function () { pick($('vmake').value); });
    $('vmodel').addEventListener('change', function () { pick($('vmake').value, $('vmodel').value); });
    $('vvar').addEventListener('change', function () { pick($('vmake').value, $('vmodel').value, $('vvar').value); });
    var q = $('vq');
    q.addEventListener('input', renderList);
    q.addEventListener('focus', renderList);
    q.addEventListener('blur', function () { setTimeout(closeList, 120); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if ($('vlist').hidden) renderList(); moveActive(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
      else if (e.key === 'Enter') { if (active >= 0 && matches[active]) { e.preventDefault(); chooseVehicle(matches[active]); } else if (matches.length === 1) { e.preventDefault(); chooseVehicle(matches[0]); } }
      else if (e.key === 'Escape') { closeList(); }
    });
  }

  function getJSON(url) {
    return fetch(url, { cache: 'no-cache', credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  function toVehicles(rows) {
    return (rows || []).filter(function (r) { return Array.isArray(r) && r.length >= 6 && isFinite(r[4]) && isFinite(r[5]); }).map(function (r) {
      return { make: String(r[0]), model: String(r[1]), variant: String(r[2]), fuel: r[3] === 'd' ? 'd' : 'p', cons: Number(r[4]), tank: Number(r[5]),
        status: Number(r[6]) || 0, src: typeof r[7] === 'string' ? r[7] : '', note: typeof r[8] === 'string' ? r[8] : '' };
    });
  }

  function init() {
    bind();
    Promise.all([getJSON('data/vehicles.json'), getJSON('data/prices.json')]).then(function (res) {
      vehicles = toVehicles(res[0].vehicles);
      if (!validPrices(res[1])) throw new Error('Price data failed validation');
      set = pickSet(res[1]);
      load();
      var linked = null;
      try { linked = findVehicle(new URLSearchParams(window.location.search).get('v') || ''); } catch (e) { /* no query support */ }
      var found = linked ? null : findVehicle(state.vehicleKey);
      if (linked) state.vehicleKey = vKey(linked);
      var v = linked || found || findVehicle('Volkswagen|Polo|1.0 TSI') || vehicles[0];
      if (v) { chooseVehicle(v, !!found); $('cons').value = state.cons; $('tank').value = state.tank; }
      $('km').value = state.km; $('adj').value = state.adj;
      render();
    }).catch(function () {
      $('resTitle').textContent = 'Prices unavailable';
      $('resMeta').textContent = 'The latest prices could not be loaded. The current prices are listed further down this page.';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
