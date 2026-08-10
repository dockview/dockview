// Premium panel widgets for the moneyshot stage (movie.html).
//
// Every widget fills its panel top-to-bottom: a slim uppercase header with a
// live status dot, then a body that fills. Data panels (chart, order book,
// positions, watchlist, time & sales, heatmap) carry muted-but-real content;
// anything that would otherwise read as empty (console, generic panels, the
// network view) gets an animated particle CONSTELLATION over a dotted grid —
// drifting nodes, distance-faded links and travelling data packets — so a panel
// never looks sparse, even when maximised.
//
// Each `mount(el, kind, title)` returns { stop } to cancel timers/rAF.
(function () {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const fmt = (n, d = 2) =>
        n.toLocaleString('en-US', {
            minimumFractionDigits: d,
            maximumFractionDigits: d,
        });

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
        .mw-hero{position:absolute;inset:0;display:flex;flex-direction:column;
            align-items:center;justify-content:center;gap:9px;text-align:center;pointer-events:none}
        .mw-hero .h1{font-size:15px;font-weight:600;color:var(--ink);letter-spacing:.01em}
        .mw-hero .h2{font-size:11px;color:var(--dim);display:flex;align-items:center;gap:7px;
            font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
        .mw-fill{position:absolute;inset:0;display:flex;flex-direction:column;padding:6px 0}
        .mw-fill .row{display:flex;align-items:center;justify-content:space-between;
            padding:0 13px;flex:1;min-height:0;position:relative}
        .mw-scroll{position:absolute;inset:0;display:flex;flex-direction:column;
            justify-content:flex-end;padding:6px 13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
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

    // DPR-aware canvas that fills its parent; returns { ctx, size() }.
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
    // Particle constellation — the reusable "alive, never empty" backdrop.
    // ======================================================================
    function constellation(body, { title, sub, density = 1 } = {}) {
        body.classList.add('mw-grid');
        const { ctx, size } = fillCanvas(body);
        if (title) {
            const hero = document.createElement('div');
            hero.className = 'mw-hero';
            hero.innerHTML =
                '<div class="h1">' +
                title +
                '</div><div class="h2"><span class="mw-live"></span>' +
                (sub || 'Connected · streaming') +
                '</div>';
            body.appendChild(hero);
        }

        const N = Math.round(26 * density);
        const nodes = Array.from({ length: N }, () => ({
            x: Math.random(),
            y: Math.random(),
            vx: rnd(-0.02, 0.02),
            vy: rnd(-0.02, 0.02),
            ph: rnd(0, 6.28),
        }));
        // Travelling data packets ride the links for a live, "particle" feel.
        const packets = [];
        let lastSpawn = 0;
        let raf;
        let t0 = 0;

        function step(t) {
            if (!t0) t0 = t;
            const el = (t - t0) / 1000;
            const { w, h, dpr } = size();
            ctx.clearRect(0, 0, w, h);

            // advance nodes (drift + gentle wrap)
            for (const n of nodes) {
                n.x += n.vx * 0.0016;
                n.y += n.vy * 0.0016;
                if (n.x < 0) n.x += 1;
                if (n.x > 1) n.x -= 1;
                if (n.y < 0) n.y += 1;
                if (n.y > 1) n.y -= 1;
            }
            const P = nodes.map((n) => ({ x: n.x * w, y: n.y * h, ph: n.ph }));
            const linkDist = w * 0.24;

            // links
            const pairs = [];
            for (let i = 0; i < N; i++)
                for (let j = i + 1; j < N; j++) {
                    const dx = P[i].x - P[j].x,
                        dy = P[i].y - P[j].y;
                    const d = Math.hypot(dx, dy);
                    if (d < linkDist) {
                        const a = (1 - d / linkDist) * 0.5;
                        ctx.strokeStyle = 'rgba(120,160,255,' + a * 0.5 + ')';
                        ctx.lineWidth = dpr;
                        ctx.beginPath();
                        ctx.moveTo(P[i].x, P[i].y);
                        ctx.lineTo(P[j].x, P[j].y);
                        ctx.stroke();
                        pairs.push([i, j]);
                    }
                }

            // spawn a packet along a random active link
            if (t - lastSpawn > 520 && pairs.length) {
                lastSpawn = t;
                const [i, j] = pairs[Math.floor(Math.random() * pairs.length)];
                packets.push({ i, j, u: 0, sp: rnd(0.6, 1.1) });
            }
            // draw / advance packets
            for (let k = packets.length - 1; k >= 0; k--) {
                const pk = packets[k];
                pk.u += pk.sp * 0.016;
                if (pk.u >= 1) {
                    packets.splice(k, 1);
                    continue;
                }
                const a = P[pk.i],
                    b = P[pk.j];
                const x = a.x + (b.x - a.x) * pk.u;
                const y = a.y + (b.y - a.y) * pk.u;
                ctx.beginPath();
                ctx.arc(x, y, 2 * dpr, 0, 7);
                ctx.fillStyle = 'rgba(174,194,255,0.95)';
                ctx.shadowColor = '#7aa2ff';
                ctx.shadowBlur = 9 * dpr;
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            // nodes
            for (const p of P) {
                const pulse = 1 + Math.sin(el * 1.6 + p.ph) * 0.4;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2 * dpr * pulse, 0, 7);
                ctx.fillStyle = 'rgba(150,185,255,0.9)';
                ctx.shadowColor = '#6f9bff';
                ctx.shadowBlur = 7 * dpr;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            raf = requestAnimationFrame(step);
        }
        raf = requestAnimationFrame(step);
        return { stop: () => cancelAnimationFrame(raf) };
    }

    // ======================================================================
    // Price chart — area + volume + right price axis + live header price.
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

        const base = 67432;
        let price = base;
        let pts = Array.from({ length: 90 }, (_, i) => {
            price += Math.sin(i / 7) * 12 + rnd(-10, 10);
            return price;
        });
        let vols = pts.map(() => rnd(0.2, 1));
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
            const padR = 52 * dpr; // room for the price axis
            const padT = 10 * dpr;
            const volH = h * 0.2;
            const plotH = h - volH - padT;
            const min = Math.min(...pts),
                max = Math.max(...pts);
            const span = max - min || 1;
            const X = (i) => (i / (pts.length - 1)) * (w - padR);
            const Y = (v) => padT + (1 - (v - min) / span) * plotH;

            // grid + axis labels
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

            // volume bars
            for (let i = 0; i < pts.length; i++) {
                const up = i === 0 || pts[i] >= pts[i - 1];
                const bh = vols[i] * volH;
                ctx.fillStyle = up
                    ? 'rgba(52,211,153,0.28)'
                    : 'rgba(248,113,113,0.28)';
                ctx.fillRect(X(i) - dpr, h - bh, 2.4 * dpr, bh);
            }

            // area
            const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
            grad.addColorStop(0, 'rgba(111,155,255,0.4)');
            grad.addColorStop(1, 'rgba(111,155,255,0)');
            ctx.beginPath();
            ctx.moveTo(0, padT + plotH);
            pts.forEach((p, i) => ctx.lineTo(X(i), Y(p)));
            ctx.lineTo(X(pts.length - 1), padT + plotH);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();

            // line
            ctx.beginPath();
            pts.forEach((p, i) =>
                i ? ctx.lineTo(X(i), Y(p)) : ctx.moveTo(X(i), Y(p))
            );
            ctx.strokeStyle = '#7aa2ff';
            ctx.lineWidth = 2 * dpr;
            ctx.stroke();

            // last dot + price tag
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

            // header price + change chip
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
            Array.from({ length: 8 }, (_, i) => ({
                price: b + (side === 'ask' ? (8 - i) * 0.5 : -i * 0.5 - 0.5),
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
                            '<span style="position:absolute;right:0;top:6%;bottom:6%;width:' +
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
                '<div class="row" style="flex:0.9;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08)">' +
                '<span class="muted">Spread</span><span class="muted">0.50 · 0.7bp</span></div>' +
                rowsHtml(bids, 'up');
        }
        render();
        const t = setInterval(() => {
            asks.forEach((r) => (r.size = Math.max(0.1, r.size + rnd(-0.6, 0.6))));
            bids.forEach((r) => (r.size = Math.max(0.1, r.size + rnd(-0.6, 0.6))));
            render();
        }, 650);
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
            for (let i = 0; i < 8; i++)
                cells[Math.floor(rnd(0, cells.length))] = rnd(-1, 1);
            paint();
        }, 700);
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
                '<div class="row" style="padding:2px 0"><span class="muted">' +
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
            if (rows.length > 26) rows.shift();
            box.innerHTML = rows.join('');
        };
        for (let i = 0; i < 26; i++) push();
        const t = setInterval(push, 480);
        return { stop: () => clearInterval(t) };
    }

    // ======================================================================
    // Positions — P/L table with a total row, fills.
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
        }, 850);
        return { stop: () => clearInterval(t) };
    }

    // ======================================================================
    // Watchlist — symbol · sparkline · price · change, fills.
    // ======================================================================
    function watch(el, title) {
        const { body } = frame(el, title || 'Watchlist', '6');
        const wrap = document.createElement('div');
        wrap.className = 'mw-fill';
        body.appendChild(wrap);
        const syms = [
            ['BTC/USD', 67432, 0.42],
            ['ETH/USD', 3521, -0.18],
            ['AAPL', 182.5, 0.31],
            ['NVDA', 875.4, -0.24],
            ['MSFT', 414.9, 0.12],
            ['TSLA', 248.3, 0.68],
        ];
        const spark = (seed) => {
            let p = 14,
                d = '';
            for (let i = 0; i < 26; i++) {
                p += Math.sin(i / 2 + seed) * 3 + rnd(-2, 2);
                d += (i ? 'L' : 'M') + i * 3.2 + ',' + (24 - (p % 20));
            }
            return (
                '<svg width="84" height="26" style="opacity:.85"><path d="' +
                d +
                '" fill="none" stroke="#7aa2ff" stroke-width="1.5"/></svg>'
            );
        };
        wrap.innerHTML = syms
            .map(
                (s, i) =>
                    '<div class="row"><span style="font-weight:600">' +
                    s[0] +
                    '</span>' +
                    spark(i * 1.7) +
                    '<span class="mono">' +
                    fmt(s[1], 2) +
                    '</span><span class="mw-chip ' +
                    (s[2] >= 0 ? 'up' : 'down') +
                    '">' +
                    (s[2] >= 0 ? '+' : '') +
                    s[2] +
                    '%</span></div>'
            )
            .join('');
        return { stop: () => {} };
    }

    // ======================================================================
    // Kind → widget. Sparse-by-nature panels use the constellation backdrop.
    // ======================================================================
    const REGISTRY = {
        chart: areaChart,
        depth: orderBook,
        heat: heatmap,
        tape: tape,
        positions: positions,
        watch: watch,
        nodes: (el, title) => {
            const { body } = frame(el, title || 'Global Network', '26 nodes');
            return constellation(body, { density: 1 });
        },
        terminal: (el, title) => {
            const { body } = frame(el, title || 'Console', 'streaming');
            return constellation(body, {
                title: title || 'Console',
                sub: 'Connected · streaming market data',
                density: 1.35,
            });
        },
        field: (el, title) => {
            const { body } = frame(el, title || 'Workspace', 'live');
            return constellation(body, {
                title: title || 'Workspace',
                sub: 'Connected · idle',
                density: 1.35,
            });
        },
    };

    window.MovieWidgets = {
        mount(el, kind, title) {
            injectStyles();
            const fn = REGISTRY[kind] || REGISTRY.field;
            return fn(el, title);
        },
    };
})();
