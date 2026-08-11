// Premium panel widgets for the moneyshot stage (movie.html).
//
// Every widget fills its panel edge-to-edge with dense, muted-but-real content
// and a slim header carrying a live status. Nothing is a placeholder: the
// console is a live-scrolling ops log, the network is a labelled node graph,
// the chart carries a price axis + moving average + volume, and the tables pack
// enough rows to fill. The goal is a workspace that reads as a serious app even
// when a single panel is maximised full-screen.
//
// Each `mount(el, kind, title)` returns { stop } to cancel timers/rAF.
(function () {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const fmt = (n, d = 2) =>
        n.toLocaleString('en-US', {
            minimumFractionDigits: d,
            maximumFractionDigits: d,
        });

    // Vibrant categorical palette for the analytics charts (the colourful,
    // varied panels — a nod to what a good docking demo shows off).
    const PAL = [
        '#6f9bff', '#5ed3a9', '#f5b871', '#c4b5fd',
        '#f472b6', '#38bdf8', '#a3e635', '#fb923c',
    ];
    const roundRect = (ctx, x, y, w, h, r) => {
        if (w <= 0 || h <= 0) return;
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    };

    // ---- one-time widget chrome ------------------------------------------
    function injectStyles() {
        if (document.getElementById('mw-styles')) return;
        const s = document.createElement('style');
        s.id = 'mw-styles';
        s.textContent = `
        .mw{display:flex;flex-direction:column;height:100%;box-sizing:border-box;color:var(--ink);font-size:12px}
        .mw-head{display:flex;align-items:center;justify-content:space-between;gap:10px;
            padding:8px 13px;flex:none;border-bottom:1px solid rgba(255,255,255,.05)}
        .mw-title{display:flex;align-items:center;gap:8px;font-size:10.5px;font-weight:600;
            letter-spacing:.09em;text-transform:uppercase;color:var(--dim)}
        .mw-live{width:6px;height:6px;border-radius:50%;background:var(--up);
            box-shadow:0 0 8px var(--up);animation:mwpulse 1.8s ease-in-out infinite}
        @keyframes mwpulse{0%,100%{opacity:.35}50%{opacity:1}}
        .mw-right{display:flex;align-items:baseline;gap:9px;font-variant-numeric:tabular-nums}
        .mw-body{flex:1;min-height:0;position:relative;overflow:hidden}
        .mw-grid{background-image:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px);
            background-size:22px 22px;background-position:-1px -1px}
        .mw-price{font-size:15px;font-weight:600;color:var(--ink);
            font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:-.01em}
        .mw-tf{font-size:9.5px;font-weight:600;letter-spacing:.06em;color:var(--dim);
            border:1px solid rgba(255,255,255,.12);border-radius:5px;padding:1px 6px}
        .mw-chip{font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px}
        .mw-chip.up{color:var(--up);background:rgba(52,211,153,.13)}
        .mw-chip.down{color:var(--down);background:rgba(248,113,113,.13)}
        .mw-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
        .mw-fill{position:absolute;inset:0;display:flex;flex-direction:column;padding:5px 0}
        .mw-fill .row{display:flex;align-items:center;justify-content:space-between;
            padding:0 13px;flex:1;min-height:0;position:relative}
        .mw-scroll{position:absolute;inset:0;display:flex;flex-direction:column;
            justify-content:flex-end;padding:7px 13px;overflow:hidden;
            font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
        /* live ops log */
        .lg{display:flex;gap:9px;align-items:baseline;line-height:1.66;white-space:nowrap;font-size:11px}
        .lg .t{color:var(--dim);opacity:.65}
        .lg .lv{font-weight:700;font-size:9px;letter-spacing:.03em;min-width:36px;text-align:center;
            border-radius:3px;padding:0 3px}
        .lg .lv.info{color:#8ea2c4;background:rgba(142,162,196,.12)}
        .lg .lv.data{color:#8ab4ff;background:rgba(111,155,255,.15)}
        .lg .lv.ok{color:#34d399;background:rgba(52,211,153,.13)}
        .lg .lv.warn{color:#f5b871;background:rgba(245,184,113,.15)}
        .lg .lv.send{color:#c4b5fd;background:rgba(196,181,253,.15)}
        .lg .lv.risk{color:#f87171;background:rgba(248,113,113,.14)}
        .lg .src{color:var(--accent);opacity:.85;min-width:66px}
        .lg .msg{color:var(--ink);opacity:.88;overflow:hidden;text-overflow:ellipsis}
        .lg .msg .n{color:#cfe0ff}
        .lg-caret{display:inline-block;width:7px;height:13px;background:var(--accent);
            opacity:.85;animation:mwblink 1.1s steps(1) infinite;transform:translateY(2px)}
        @keyframes mwblink{0%,50%{opacity:.85}51%,100%{opacity:0}}
        `;
        document.head.appendChild(s);
    }

    // Build the standard header + body shell. Returns { body, right }.
    function frame(el, title, rightHtml, { grid } = {}) {
        el.innerHTML =
            '<div class="mw">' +
            '<div class="mw-head"><div class="mw-title"><span class="mw-live"></span>' +
            (title || '') +
            '</div><div class="mw-right">' +
            (rightHtml || '') +
            '</div></div>' +
            '<div class="mw-body' +
            (grid ? ' mw-grid' : '') +
            '"></div></div>';
        return {
            body: el.querySelector('.mw-body'),
            right: el.querySelector('.mw-right'),
        };
    }

    // DPR-aware canvas that fills its parent; returns { ctx, size }.
    function fillCanvas(parent) {
        const canvas = document.createElement('canvas');
        canvas.className = 'mw-canvas';
        parent.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        const size = () => {
            const dpr = window.devicePixelRatio || 1;
            const w = Math.max(1, parent.clientWidth);
            const h = Math.max(1, parent.clientHeight);
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            return { w: canvas.width, h: canvas.height, dpr };
        };
        return { canvas, ctx, size };
    }

    // ======================================================================
    // Live ops log — dense, streaming, fills wall-to-wall.
    // ======================================================================
    function consoleLog(el, title) {
        const { body } = frame(
            el,
            title || 'Console',
            '<span class="mw-chip up">live</span>'
        );
        const box = document.createElement('div');
        box.className = 'mw-scroll';
        body.appendChild(box);

        const SRC = [
            'gateway', 'md.stream', 'oms', 'risk', 'fix', 'ledger',
            'cache', 'feed', 'exec', 'auth', 'seq', 'router',
        ];
        const VENUE = ['NASDAQ', 'ARCA', 'LSE', 'XETRA', 'CME', 'CBOE'];
        const DC = ['NY4', 'LD4', 'TY3', 'FR2', 'SG1', 'CH1'];
        const SYM = ['BTC/USD', 'ETH/USD', 'NVDA', 'AAPL', 'TSLA', 'MSFT'];
        const n = (v) => '<span class="n">' + v + '</span>';
        const templates = [
            () => ['DATA', 'md.stream', pick(SYM) + '  ' + n(fmt(67000 + rnd(-300, 700), 1)) + (Math.random() > 0.5 ? '  ▲' : '  ▼') + '   qty ' + n(fmt(rnd(0.01, 4), 3))],
            () => ['OK', 'oms', 'order ' + n('#' + (80000 + Math.floor(rnd(0, 9999)))) + ' filled ' + n(fmt(rnd(0.05, 3), 2)) + ' @ ' + n(fmt(67000 + rnd(0, 700), 1))],
            () => ['SEND', 'fix', 'NewOrderSingle ' + n(9000 + Math.floor(rnd(0, 900))) + ' → ' + pick(VENUE)],
            () => ['INFO', 'gateway', 'session ' + pick(DC) + ' · rtt ' + n(Math.floor(rnd(3, 42)) + 'ms') + ' · ' + Math.floor(rnd(1, 6)) + ' venues'],
            () => ['WARN', 'risk', 'exposure ' + n(Math.floor(rnd(62, 96)) + '%') + ' of limit · ' + pick(SYM)],
            () => ['DATA', 'feed', 'book snapshot ' + pick(['L2', 'L3']) + ' seq ' + n(Math.floor(rnd(1e6, 9e6)))],
            () => ['OK', 'ledger', 'settled ' + n(fmt(rnd(1, 80), 2)) + ' ' + pick(['BTC', 'ETH', 'USD']) + ' · fee ' + fmt(rnd(0.1, 2), 1) + 'bp'],
            () => ['INFO', 'cache', 'warm ' + n(Math.floor(rnd(40, 99)) + '%') + ' · ' + Math.floor(rnd(120, 900)) + 'k keys'],
            () => ['OK', 'exec', 'TWAP slice ' + n(Math.floor(rnd(1, 19)) + '/' + Math.floor(rnd(20, 40))) + ' done'],
            () => ['SEND', 'router', 'route ' + pick(SYM) + ' → ' + pick(VENUE) + ' · ' + Math.floor(rnd(1, 9)) + ' child'],
            () => ['INFO', 'seq', 'heartbeat ok · gap ' + n('0') + ' · lag ' + Math.floor(rnd(0, 4)) + 'ms'],
            () => ['DATA', 'md.stream', 'throughput ' + n(fmt(rnd(18, 42), 1)) + 'k msg/s'],
        ];
        const lines = [];
        const render = () => {
            box.innerHTML =
                lines.join('') +
                '<div class="lg"><span class="t"> </span><span class="lg-caret"></span></div>';
        };
        const push = () => {
            const [lv, src, msg] = pick(templates)();
            const now = new Date();
            const ts =
                now.toLocaleTimeString('en-GB') +
                '.' +
                String(now.getMilliseconds()).padStart(3, '0');
            lines.push(
                '<div class="lg"><span class="t">' +
                    ts +
                    '</span><span class="lv ' +
                    lv.toLowerCase() +
                    '">' +
                    lv +
                    '</span><span class="src">' +
                    src +
                    '</span><span class="msg">' +
                    msg +
                    '</span></div>'
            );
            if (lines.length > 90) lines.shift();
            render();
        };
        for (let i = 0; i < 90; i++) push();
        const t = setInterval(push, 230);
        return { stop: () => clearInterval(t) };
    }

    // ======================================================================
    // Network graph — dense nodes + links + travelling packets + hubs.
    // ======================================================================
    function network(body, { density = 2.4 } = {}) {
        body.classList.add('mw-grid');
        const { ctx, size } = fillCanvas(body);
        const N = Math.round(24 * density);
        const HUBS = ['NY4', 'LD4', 'TY3', 'FR2'];
        const nodes = Array.from({ length: N }, (_, i) => ({
            x: Math.random(),
            y: Math.random(),
            vx: rnd(-0.02, 0.02),
            vy: rnd(-0.02, 0.02),
            ph: rnd(0, 6.28),
            hub: i < HUBS.length,
        }));
        const packets = [];
        let lastSpawn = 0;
        let raf;
        let t0 = 0;

        function step(t) {
            if (!t0) t0 = t;
            const el = (t - t0) / 1000;
            const { w, h, dpr } = size();
            ctx.clearRect(0, 0, w, h);
            for (const nd of nodes) {
                nd.x += nd.vx * 0.0015;
                nd.y += nd.vy * 0.0015;
                if (nd.x < 0) nd.x += 1;
                if (nd.x > 1) nd.x -= 1;
                if (nd.y < 0) nd.y += 1;
                if (nd.y > 1) nd.y -= 1;
            }
            const P = nodes.map((nd) => ({
                x: nd.x * w,
                y: nd.y * h,
                ph: nd.ph,
                hub: nd.hub,
            }));
            const linkDist = w * 0.17;
            const pairs = [];
            for (let i = 0; i < N; i++)
                for (let j = i + 1; j < N; j++) {
                    const dx = P[i].x - P[j].x,
                        dy = P[i].y - P[j].y;
                    const d = Math.hypot(dx, dy);
                    const reach = P[i].hub || P[j].hub ? linkDist * 2.1 : linkDist;
                    if (d < reach) {
                        const a = (1 - d / reach) * 0.55;
                        ctx.strokeStyle = 'rgba(120,160,255,' + a + ')';
                        ctx.lineWidth = dpr;
                        ctx.beginPath();
                        ctx.moveTo(P[i].x, P[i].y);
                        ctx.lineTo(P[j].x, P[j].y);
                        ctx.stroke();
                        pairs.push([i, j]);
                    }
                }
            if (t - lastSpawn > 180 && pairs.length) {
                lastSpawn = t;
                const [i, j] = pick(pairs);
                packets.push({ i, j, u: 0, sp: rnd(0.7, 1.3) });
            }
            for (let k = packets.length - 1; k >= 0; k--) {
                const pk = packets[k];
                pk.u += pk.sp * 0.016;
                if (pk.u >= 1) {
                    packets.splice(k, 1);
                    continue;
                }
                const a = P[pk.i],
                    b = P[pk.j];
                const x = a.x + (b.x - a.x) * pk.u,
                    y = a.y + (b.y - a.y) * pk.u;
                ctx.beginPath();
                ctx.arc(x, y, 1.8 * dpr, 0, 7);
                ctx.fillStyle = 'rgba(174,194,255,0.95)';
                ctx.shadowColor = '#7aa2ff';
                ctx.shadowBlur = 8 * dpr;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            let hubIdx = 0;
            for (const p of P) {
                const pulse = 1 + Math.sin(el * 1.6 + p.ph) * 0.4;
                if (p.hub) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 9 * dpr, 0, 7);
                    ctx.strokeStyle = 'rgba(122,162,255,0.5)';
                    ctx.lineWidth = 1.2 * dpr;
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 3.4 * dpr, 0, 7);
                    ctx.fillStyle = '#aec2ff';
                    ctx.shadowColor = '#7aa2ff';
                    ctx.shadowBlur = 12 * dpr;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = 'rgba(196,214,255,0.85)';
                    ctx.font = '600 ' + 10 * dpr + 'px ui-monospace, Menlo, monospace';
                    ctx.fillText(HUBS[hubIdx++], p.x + 12 * dpr, p.y + 3.5 * dpr);
                } else {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 1.9 * dpr * pulse, 0, 7);
                    ctx.fillStyle = 'rgba(150,185,255,0.85)';
                    ctx.shadowColor = '#6f9bff';
                    ctx.shadowBlur = 6 * dpr;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }
            raf = requestAnimationFrame(step);
        }
        raf = requestAnimationFrame(step);
        return { stop: () => cancelAnimationFrame(raf) };
    }

    // ======================================================================
    // Price chart — area + moving average + volume + right price axis.
    // ======================================================================
    function areaChart(el, title) {
        const { body, right } = frame(
            el,
            (title || 'BTC/USD') + '&nbsp;<span class="mw-tf">1m</span>',
            '<span class="mw-price">—</span><span class="mw-chip up">+0.00%</span>',
            { grid: false }
        );
        const { ctx, size } = fillCanvas(body);
        const priceEl = right.querySelector('.mw-price');
        const chipEl = right.querySelector('.mw-chip');

        let price = 67432;
        let pts = Array.from({ length: 96 }, (_, i) => {
            price += Math.sin(i / 7) * 12 + rnd(-10, 10);
            return price;
        });
        let vols = pts.map(() => rnd(0.2, 1));
        const ma = (arr, i, win) => {
            let s = 0,
                c = 0;
            for (let k = Math.max(0, i - win); k <= i; k++) {
                s += arr[k];
                c++;
            }
            return s / c;
        };
        let raf,
            last = 0;

        function tick() {
            price = pts[pts.length - 1] + rnd(-26, 27);
            pts.push(price);
            pts.shift();
            vols.push(rnd(0.15, 1));
            vols.shift();
        }
        function draw() {
            const { w, h, dpr } = size();
            ctx.clearRect(0, 0, w, h);
            const padR = 54 * dpr;
            const padT = 10 * dpr;
            const volH = h * 0.2;
            const plotH = h - volH - padT;
            const min = Math.min(...pts),
                max = Math.max(...pts);
            const span = max - min || 1;
            const X = (i) => (i / (pts.length - 1)) * (w - padR);
            const Y = (v) => padT + (1 - (v - min) / span) * plotH;

            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.fillStyle = 'rgba(142,162,196,0.65)';
            ctx.font = 11 * dpr + 'px ui-monospace, Menlo, monospace';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = dpr;
            for (let g = 0; g <= 4; g++) {
                const v = min + (span * g) / 4;
                const y = Y(v);
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w - padR, y);
                ctx.stroke();
                ctx.fillText(fmt(v, 0), w - padR + 7 * dpr, y);
            }
            for (let i = 0; i < pts.length; i++) {
                const up = i === 0 || pts[i] >= pts[i - 1];
                const bh = vols[i] * volH;
                ctx.fillStyle = up
                    ? 'rgba(52,211,153,0.3)'
                    : 'rgba(248,113,113,0.3)';
                ctx.fillRect(X(i) - dpr, h - bh, 2.4 * dpr, bh);
            }
            const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
            grad.addColorStop(0, 'rgba(111,155,255,0.42)');
            grad.addColorStop(1, 'rgba(111,155,255,0)');
            ctx.beginPath();
            ctx.moveTo(0, padT + plotH);
            pts.forEach((p, i) => ctx.lineTo(X(i), Y(p)));
            ctx.lineTo(X(pts.length - 1), padT + plotH);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
            // moving average
            ctx.beginPath();
            pts.forEach((p, i) => {
                const y = Y(ma(pts, i, 14));
                i ? ctx.lineTo(X(i), y) : ctx.moveTo(X(i), y);
            });
            ctx.strokeStyle = 'rgba(245,184,113,0.55)';
            ctx.lineWidth = 1.3 * dpr;
            ctx.stroke();
            // price line
            ctx.beginPath();
            pts.forEach((p, i) =>
                i ? ctx.lineTo(X(i), Y(p)) : ctx.moveTo(X(i), Y(p))
            );
            ctx.strokeStyle = '#7aa2ff';
            ctx.lineWidth = 2 * dpr;
            ctx.stroke();

            const lx = X(pts.length - 1),
                ly = Y(pts[pts.length - 1]);
            ctx.strokeStyle = 'rgba(122,162,255,0.4)';
            ctx.setLineDash([4 * dpr, 4 * dpr]);
            ctx.beginPath();
            ctx.moveTo(0, ly);
            ctx.lineTo(w - padR, ly);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(lx, ly, 3.5 * dpr, 0, 7);
            ctx.fillStyle = '#aec2ff';
            ctx.shadowColor = '#7aa2ff';
            ctx.shadowBlur = 10 * dpr;
            ctx.fill();
            ctx.shadowBlur = 0;

            const cur = pts[pts.length - 1];
            const chg = ((cur - pts[0]) / pts[0]) * 100;
            priceEl.textContent = fmt(cur, 1);
            chipEl.textContent = (chg >= 0 ? '+' : '') + fmt(chg, 2) + '%';
            chipEl.className = 'mw-chip ' + (chg >= 0 ? 'up' : 'down');
        }
        function loop(t) {
            if (t - last > 110) {
                last = t;
                tick();
            }
            draw();
            raf = requestAnimationFrame(loop);
        }
        raf = requestAnimationFrame(loop);
        return { stop: () => cancelAnimationFrame(raf) };
    }

    // ======================================================================
    // Order book — asks / spread / bids, cumulative depth shading, fills.
    // ======================================================================
    function orderBook(el, title) {
        const { body } = frame(el, title || 'Order Book', 'BTC/USD');
        const wrap = document.createElement('div');
        wrap.className = 'mw-fill';
        wrap.style.font = '11.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        body.appendChild(wrap);
        const mk = (b, side) =>
            Array.from({ length: 9 }, (_, i) => ({
                price: b + (side === 'ask' ? (9 - i) * 0.5 : -i * 0.5 - 0.5),
                size: rnd(0.2, 6),
            }));
        let asks = mk(67432.5, 'ask'),
            bids = mk(67432, 'bid');
        function render() {
            const rowsHtml = (rows, cls) =>
                rows
                    .map((r) => {
                        const w = Math.min(100, (r.size / 6) * 100);
                        const bg =
                            cls === 'up'
                                ? 'rgba(52,211,153,0.14)'
                                : 'rgba(248,113,113,0.14)';
                        return (
                            '<div class="row">' +
                            '<span style="position:absolute;right:0;top:8%;bottom:8%;width:' +
                            w +
                            '%;background:' +
                            bg +
                            ';border-radius:2px"></span>' +
                            '<span class="' +
                            cls +
                            '" style="position:relative">' +
                            fmt(r.price, 1) +
                            '</span><span style="position:relative">' +
                            fmt(r.size, 4) +
                            '</span></div>'
                        );
                    })
                    .join('');
            wrap.innerHTML =
                rowsHtml(asks, 'down') +
                '<div class="row" style="flex:0.85;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08)">' +
                '<span class="muted">Spread</span><span class="muted">0.50 · 0.7bp</span></div>' +
                rowsHtml(bids, 'up');
        }
        render();
        const t = setInterval(() => {
            asks.forEach((r) => (r.size = Math.max(0.1, r.size + rnd(-0.6, 0.6))));
            bids.forEach((r) => (r.size = Math.max(0.1, r.size + rnd(-0.6, 0.6))));
            render();
        }, 620);
        return { stop: () => clearInterval(t) };
    }

    // ======================================================================
    // Sector heatmap — labelled tiles, fills the body.
    // ======================================================================
    function heatmap(el, title) {
        const { body } = frame(el, title || 'Sector Heatmap', 'Δ 1d');
        const box = document.createElement('div');
        box.style.cssText =
            'position:absolute;inset:8px;display:grid;grid-template-columns:repeat(6,1fr);gap:4px';
        body.appendChild(box);
        const labels = [
            'BTC', 'ETH', 'SOL', 'AAPL', 'NVDA', 'MSFT',
            'TSLA', 'AMD', 'META', 'AMZN', 'GOOG', 'NFLX',
            'JPM', 'BAC', 'XOM', 'CVX', 'GLD', 'SLV',
            'SPY', 'QQQ', 'IWM', 'DIA', 'VIX', 'TLT',
            'EUR', 'GBP', 'JPY', 'AUD', 'OIL', 'GAS',
        ];
        const cells = labels.map(() => rnd(-1, 1));
        const paint = () => {
            box.innerHTML = cells
                .map((v, i) => {
                    const c =
                        v >= 0
                            ? 'rgba(52,211,153,' + (0.12 + v * 0.5) + ')'
                            : 'rgba(248,113,113,' + (0.12 - v * 0.5) + ')';
                    return (
                        '<div style="border-radius:4px;background:' +
                        c +
                        ';display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">' +
                        '<span style="font-size:10px;font-weight:600;color:rgba(255,255,255,.82)">' +
                        labels[i] +
                        '</span><span style="font-size:9px;font-family:ui-monospace,Menlo,monospace;color:rgba(255,255,255,.62)">' +
                        (v >= 0 ? '+' : '') +
                        fmt(v * 4, 1) +
                        '%</span></div>'
                    );
                })
                .join('');
        };
        paint();
        const t = setInterval(() => {
            for (let i = 0; i < 9; i++)
                cells[Math.floor(rnd(0, cells.length))] = rnd(-1, 1);
            paint();
        }, 680);
        return { stop: () => clearInterval(t) };
    }

    // ======================================================================
    // Time & sales — streaming prints, fills bottom-up.
    // ======================================================================
    function tape(el, title) {
        const { body } = frame(el, title || 'Time & Sales', 'LIVE');
        const box = document.createElement('div');
        box.className = 'mw-scroll';
        box.style.fontSize = '11.5px';
        body.appendChild(box);
        const rows = [];
        const push = () => {
            const up = Math.random() > 0.48;
            const now = new Date();
            rows.push(
                '<div class="lg" style="justify-content:space-between"><span class="t">' +
                    now.toLocaleTimeString('en-GB') +
                    '.' +
                    String(now.getMilliseconds()).padStart(3, '0') +
                    '</span><span class="' +
                    (up ? 'up' : 'down') +
                    '">' +
                    fmt(67432 + rnd(-45, 45), 1) +
                    '</span><span>' +
                    fmt(rnd(0.05, 4.5), 4) +
                    '</span></div>'
            );
            if (rows.length > 40) rows.shift();
            box.innerHTML = rows.join('');
        };
        for (let i = 0; i < 40; i++) push();
        const t = setInterval(push, 430);
        return { stop: () => clearInterval(t) };
    }

    // ======================================================================
    // Positions — P/L table with a total, packed rows.
    // ======================================================================
    function positions(el, title) {
        const { body, right } = frame(
            el,
            title || 'Positions',
            '<span class="mw-price" style="font-size:13px">+$21,540</span>'
        );
        const totalEl = right.querySelector('.mw-price');
        const wrap = document.createElement('div');
        wrap.className = 'mw-fill';
        wrap.style.padding = '0';
        body.appendChild(wrap);
        const data = [
            ['BTC/USD', 'Long', 1.24, 12840],
            ['ETH/USD', 'Long', 8.5, 3210],
            ['NVDA', 'Long', 335, 8720],
            ['AAPL', 'Short', 640, -3210],
            ['MSFT', 'Long', 210, 1540],
            ['TSLA', 'Short', 1282, -6410],
            ['GOOGL', 'Long', 676, 4120],
            ['AMD', 'Long', 512, 2280],
            ['META', 'Short', 190, -1870],
            ['SOL/USD', 'Long', 240, 3660],
        ];
        const render = () => {
            const total = data.reduce((s, d) => s + d[3], 0);
            totalEl.textContent = (total >= 0 ? '+$' : '-$') + fmt(Math.abs(total), 0);
            totalEl.style.color = total >= 0 ? 'var(--up)' : 'var(--down)';
            wrap.innerHTML =
                '<div class="row muted" style="flex:0.7;font-size:10px;text-transform:uppercase;letter-spacing:.05em"><span>Symbol</span><span>Qty</span><span>P/L</span></div>' +
                data
                    .map(
                        (d) =>
                            '<div class="row"><span style="flex:1"><span class="' +
                            (d[1] === 'Long' ? 'up' : 'down') +
                            '" style="font-size:9px;border:1px solid currentColor;border-radius:3px;padding:0 4px;margin-right:7px">' +
                            d[1] +
                            '</span>' +
                            d[0] +
                            '</span><span class="mono">' +
                            fmt(d[2], 2) +
                            '</span><span class="' +
                            (d[3] >= 0 ? 'up' : 'down') +
                            ' mono" style="min-width:64px;text-align:right">' +
                            (d[3] >= 0 ? '+' : '') +
                            fmt(d[3], 0) +
                            '</span></div>'
                    )
                    .join('');
        };
        render();
        const t = setInterval(() => {
            data.forEach((d) => (d[3] += rnd(-300, 320)));
            render();
        }, 820);
        return { stop: () => clearInterval(t) };
    }

    // ======================================================================
    // Watchlist — symbol · sparkline · price · change, packed rows.
    // ======================================================================
    function watch(el, title) {
        const syms = [
            ['BTC/USD', 67432, 0.42],
            ['ETH/USD', 3521, -0.18],
            ['SOL/USD', 168.4, 1.12],
            ['AAPL', 182.5, 0.31],
            ['NVDA', 875.4, -0.24],
            ['MSFT', 414.9, 0.12],
            ['TSLA', 248.3, 0.68],
            ['AMD', 168.2, -0.42],
            ['META', 502.1, 0.27],
            ['GOOGL', 165.7, 0.09],
        ];
        const { body } = frame(el, title || 'Watchlist', String(syms.length));
        const wrap = document.createElement('div');
        wrap.className = 'mw-fill';
        body.appendChild(wrap);
        const spark = (seed) => {
            let p = 14,
                d = '';
            for (let i = 0; i < 26; i++) {
                p += Math.sin(i / 2 + seed) * 3 + rnd(-2, 2);
                d += (i ? 'L' : 'M') + i * 3.2 + ',' + (24 - (p % 20));
            }
            return (
                '<svg width="78" height="24" style="opacity:.85"><path d="' +
                d +
                '" fill="none" stroke="#7aa2ff" stroke-width="1.5"/></svg>'
            );
        };
        wrap.innerHTML = syms
            .map(
                (s, i) =>
                    '<div class="row"><span style="font-weight:600;flex:1">' +
                    s[0] +
                    '</span>' +
                    spark(i * 1.7) +
                    '<span class="mono" style="min-width:62px;text-align:right">' +
                    fmt(s[1], 2) +
                    '</span><span class="mw-chip ' +
                    (s[2] >= 0 ? 'up' : 'down') +
                    '" style="min-width:52px;text-align:center">' +
                    (s[2] >= 0 ? '+' : '') +
                    s[2] +
                    '%</span></div>'
            )
            .join('');
        return { stop: () => {} };
    }

    // ======================================================================
    // Multi-series line chart — colourful strategy performance.
    // ======================================================================
    function lineChart(el, title) {
        const names = ['Momentum', 'Macro', 'Arbitrage'];
        const { body } = frame(el, title || 'Performance', '1D');
        body.insertAdjacentHTML(
            'afterbegin',
            '<div style="position:absolute;top:0;left:0;right:0;display:flex;flex-wrap:wrap;gap:5px 14px;padding:7px 13px 0">' +
                names
                    .map(
                        (nm, i) =>
                            '<span style="display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--dim)"><span style="width:9px;height:9px;border-radius:2px;background:' +
                            PAL[i] +
                            '"></span>' +
                            nm +
                            '</span>'
                    )
                    .join('') +
                '</div>'
        );
        const cwrap = document.createElement('div');
        cwrap.style.cssText = 'position:absolute;inset:28px 0 0 0';
        body.appendChild(cwrap);
        const { ctx, size } = fillCanvas(cwrap);
        const series = names.map((nm, i) => {
            let v = rnd(35, 65);
            return {
                c: PAL[i],
                pts: Array.from({ length: 64 }, (_, k) => {
                    v += Math.sin(k / 6 + i) * 3 + rnd(-3, 3);
                    return Math.max(8, Math.min(92, v));
                }),
            };
        });
        let raf,
            last = 0;
        function tick() {
            series.forEach((s) => {
                let v = s.pts[s.pts.length - 1] + rnd(-5, 5);
                s.pts.push(Math.max(8, Math.min(92, v)));
                s.pts.shift();
            });
        }
        function draw() {
            const { w, h, dpr } = size();
            ctx.clearRect(0, 0, w, h);
            const pad = 8 * dpr;
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = dpr;
            for (let g = 0; g <= 4; g++) {
                const y = (g / 4) * (h - pad * 2) + pad;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }
            const X = (i) => (i / 63) * w;
            const Y = (v) => h - pad - (v / 100) * (h - pad * 2);
            series.forEach((s) => {
                ctx.beginPath();
                s.pts.forEach((p, i) =>
                    i ? ctx.lineTo(X(i), Y(p)) : ctx.moveTo(X(i), Y(p))
                );
                ctx.strokeStyle = s.c;
                ctx.lineWidth = 2 * dpr;
                ctx.stroke();
                const lx = X(63),
                    ly = Y(s.pts[63]);
                ctx.beginPath();
                ctx.arc(lx, ly, 2.6 * dpr, 0, 7);
                ctx.fillStyle = s.c;
                ctx.shadowColor = s.c;
                ctx.shadowBlur = 8 * dpr;
                ctx.fill();
                ctx.shadowBlur = 0;
            });
        }
        function loop(t) {
            if (t - last > 150) {
                last = t;
                tick();
            }
            draw();
            raf = requestAnimationFrame(loop);
        }
        raf = requestAnimationFrame(loop);
        return { stop: () => cancelAnimationFrame(raf) };
    }

    // ======================================================================
    // Column chart — order flow by venue, animated bars.
    // ======================================================================
    function barChart(el, title) {
        const cats = ['NYSE', 'NASDAQ', 'ARCA', 'CME', 'LSE', 'XETRA', 'CBOE', 'BATS'];
        const { body } = frame(el, title || 'Order Flow', 'by venue');
        const cwrap = document.createElement('div');
        cwrap.style.cssText = 'position:absolute;inset:0';
        body.appendChild(cwrap);
        const { ctx, size } = fillCanvas(cwrap);
        let vals = cats.map(() => rnd(0.3, 1));
        let tgt = vals.slice();
        let raf,
            last = 0;
        function draw() {
            const { w, h, dpr } = size();
            ctx.clearRect(0, 0, w, h);
            const padB = 22 * dpr,
                padT = 12 * dpr;
            vals = vals.map((v, i) => v + (tgt[i] - v) * 0.09);
            const n = cats.length,
                gap = 9 * dpr,
                bw = (w - gap * (n + 1)) / n;
            for (let i = 0; i < n; i++) {
                const bh = vals[i] * (h - padB - padT);
                const x = gap + i * (bw + gap);
                const y = h - padB - bh;
                const c = PAL[i % PAL.length];
                const g = ctx.createLinearGradient(0, y, 0, h - padB);
                g.addColorStop(0, c);
                g.addColorStop(1, c + '22');
                ctx.fillStyle = g;
                roundRect(ctx, x, y, bw, bh, 3 * dpr);
                ctx.fill();
                ctx.fillStyle = 'rgba(142,162,196,0.75)';
                ctx.font = 9 * dpr + 'px ui-monospace, Menlo, monospace';
                ctx.textAlign = 'center';
                ctx.fillText(cats[i], x + bw / 2, h - 8 * dpr);
            }
        }
        function loop(t) {
            if (t - last > 950) {
                last = t;
                tgt = cats.map(() => rnd(0.22, 1));
            }
            draw();
            raf = requestAnimationFrame(loop);
        }
        raf = requestAnimationFrame(loop);
        return { stop: () => cancelAnimationFrame(raf) };
    }

    // ======================================================================
    // Donut — portfolio allocation, animated sweep + legend.
    // ======================================================================
    function donutChart(el, title) {
        const segs = [
            { label: 'Equities', v: 38, c: PAL[0] },
            { label: 'Crypto', v: 24, c: PAL[1] },
            { label: 'FX', v: 18, c: PAL[2] },
            { label: 'Bonds', v: 12, c: PAL[3] },
            { label: 'Cash', v: 8, c: PAL[4] },
        ];
        const { body } = frame(el, title || 'Allocation', 'AUM');
        body.innerHTML +=
            '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:22px;padding:12px 18px">' +
            '<canvas class="don" style="height:min(84%,240px);aspect-ratio:1"></canvas>' +
            '<div class="leg" style="display:flex;flex-direction:column;gap:9px">' +
            segs
                .map(
                    (s) =>
                        '<div style="display:flex;align-items:center;gap:9px;font-size:11.5px"><span style="width:10px;height:10px;border-radius:2px;background:' +
                        s.c +
                        '"></span><span style="flex:1;color:var(--ink)">' +
                        s.label +
                        '</span><span class="mono" style="color:var(--dim)">' +
                        s.v +
                        '%</span></div>'
                )
                .join('') +
            '</div></div>';
        const canvas = body.querySelector('.don');
        const ctx = canvas.getContext('2d');
        let raf,
            prog = 0;
        function draw() {
            const dpr = window.devicePixelRatio || 1;
            const sz = Math.max(1, Math.min(canvas.clientWidth, canvas.clientHeight));
            canvas.width = sz * dpr;
            canvas.height = sz * dpr;
            const cx = (sz * dpr) / 2,
                cy = (sz * dpr) / 2,
                R = sz * dpr * 0.46,
                r = sz * dpr * 0.29;
            ctx.clearRect(0, 0, sz * dpr, sz * dpr);
            prog = Math.min(1, prog + 0.035);
            let a = -Math.PI / 2;
            const total = segs.reduce((s, x) => s + x.v, 0);
            segs.forEach((s) => {
                const ang = (s.v / total) * Math.PI * 2 * prog;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, R, a, a + ang);
                ctx.closePath();
                ctx.fillStyle = s.c;
                ctx.fill();
                a += ang;
            });
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 7);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#dfe7f5';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '700 ' + 17 * dpr + 'px -apple-system, sans-serif';
            ctx.fillText('$4.2B', cx, cy - 6 * dpr);
            ctx.fillStyle = '#8ea2c4';
            ctx.font = 10 * dpr + 'px -apple-system, sans-serif';
            ctx.fillText('AUM', cx, cy + 13 * dpr);
            // Keep redrawing (cheap) so the donut survives a resize/maximise.
            raf = requestAnimationFrame(draw);
        }
        raf = requestAnimationFrame(draw);
        return { stop: () => cancelAnimationFrame(raf) };
    }

    // ======================================================================
    // Kind → widget.
    // ======================================================================
    const REGISTRY = {
        chart: areaChart,
        depth: orderBook,
        heat: heatmap,
        tape: tape,
        positions: positions,
        watch: watch,
        nodes: (el, title) => {
            const { body } = frame(el, title || 'Global Network', 'live');
            return network(body, { density: 2.4 });
        },
        terminal: consoleLog,
        field: consoleLog,
        lines: lineChart,
        bars: barChart,
        donut: donutChart,
    };

    window.MovieWidgets = {
        mount(el, kind, title) {
            injectStyles();
            const fn = REGISTRY[kind] || REGISTRY.field;
            return fn(el, title);
        },
    };
})();
