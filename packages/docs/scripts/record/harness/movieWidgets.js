// Premium-but-muted trading widgets for the moneyshot stage (movie.html).
// Each `mount(el, kind, title)` returns { stop } to cancel timers/rAF. Kept
// deliberately low-key so dockview's docking motion stays the star.
(function () {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const fmt = (n, d = 2) =>
        n.toLocaleString('en-US', {
            minimumFractionDigits: d,
            maximumFractionDigits: d,
        });

    function areaChart(el) {
        const wrap = document.createElement('div');
        wrap.style.height = '100%';
        const canvas = document.createElement('canvas');
        wrap.appendChild(canvas);
        el.appendChild(wrap);
        const ctx = canvas.getContext('2d');
        let pts = Array.from({ length: 80 }, (_, i) => 50 + Math.sin(i / 6) * 8);
        let v = pts[pts.length - 1];
        let raf,
            last = 0;
        function step(t) {
            if (t - last > 90) {
                last = t;
                v += rnd(-2.4, 2.5);
                v = Math.max(20, Math.min(80, v));
                pts.push(v);
                pts.shift();
            }
            draw();
            raf = requestAnimationFrame(step);
        }
        function draw() {
            const dpr = window.devicePixelRatio || 1;
            const w = (canvas.width = wrap.clientWidth * dpr);
            const h = (canvas.height = wrap.clientHeight * dpr);
            ctx.clearRect(0, 0, w, h);
            const pad = 8 * dpr;
            const min = Math.min(...pts) - 4,
                max = Math.max(...pts) + 4;
            const X = (i) => (i / (pts.length - 1)) * w;
            const Y = (val) =>
                h - pad - ((val - min) / (max - min)) * (h - pad * 2);
            // grid
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            for (let g = 0; g <= 4; g++) {
                const y = (g / 4) * h;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }
            // area
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, 'rgba(111,155,255,0.35)');
            grad.addColorStop(1, 'rgba(111,155,255,0)');
            ctx.beginPath();
            ctx.moveTo(0, h);
            pts.forEach((p, i) => ctx.lineTo(X(i), Y(p)));
            ctx.lineTo(w, h);
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
            // last dot glow
            const lx = X(pts.length - 1),
                ly = Y(pts[pts.length - 1]);
            ctx.beginPath();
            ctx.arc(lx, ly, 3.5 * dpr, 0, 7);
            ctx.fillStyle = '#aec2ff';
            ctx.shadowColor = '#7aa2ff';
            ctx.shadowBlur = 10 * dpr;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        raf = requestAnimationFrame(step);
        return { stop: () => cancelAnimationFrame(raf) };
    }

    function orderBook(el) {
        const box = document.createElement('div');
        box.className = 'pad mono';
        el.appendChild(box);
        const mk = (base, side) =>
            Array.from({ length: 7 }, (_, i) => ({
                price: base + (side === 'ask' ? i * 0.5 : -i * 0.5),
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
                                ? 'rgba(52,211,153,0.12)'
                                : 'rgba(248,113,113,0.12)';
                        return (
                            '<div class="row" style="position:relative">' +
                            '<span style="position:absolute;right:0;top:0;bottom:0;width:' +
                            w +
                            '%;background:' +
                            bg +
                            '"></span>' +
                            '<span class="' +
                            cls +
                            '">' +
                            fmt(r.price, 1) +
                            '</span><span>' +
                            fmt(r.size, 4) +
                            '</span></div>'
                        );
                    })
                    .join('');
            box.innerHTML =
                rowsHtml(asks.slice().reverse(), 'down') +
                '<div class="row" style="border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08);padding:5px 0"><span class="muted">Spread</span><span class="muted">0.5</span></div>' +
                rowsHtml(bids, 'up');
        }
        render();
        const t = setInterval(() => {
            asks.forEach((r) => (r.size = Math.max(0.1, r.size + rnd(-0.6, 0.6))));
            bids.forEach((r) => (r.size = Math.max(0.1, r.size + rnd(-0.6, 0.6))));
            render();
        }, 700);
        return { stop: () => clearInterval(t) };
    }

    function heatmap(el) {
        const box = document.createElement('div');
        box.className = 'pad';
        box.style.display = 'grid';
        box.style.gridTemplateColumns = 'repeat(8,1fr)';
        box.style.gap = '3px';
        el.appendChild(box);
        const cells = Array.from({ length: 48 }, () => rnd(-1, 1));
        const paint = () => {
            box.innerHTML = cells
                .map((v) => {
                    const c =
                        v >= 0
                            ? 'rgba(52,211,153,' + (0.15 + v * 0.5) + ')'
                            : 'rgba(248,113,113,' + (0.15 - v * 0.5) + ')';
                    return (
                        '<div style="aspect-ratio:1.6;border-radius:3px;background:' +
                        c +
                        '"></div>'
                    );
                })
                .join('');
        };
        paint();
        const t = setInterval(() => {
            for (let i = 0; i < 6; i++)
                cells[Math.floor(rnd(0, cells.length))] = rnd(-1, 1);
            paint();
        }, 600);
        return { stop: () => clearInterval(t) };
    }

    function tape(el) {
        const box = document.createElement('div');
        box.className = 'pad mono';
        box.style.overflow = 'hidden';
        el.appendChild(box);
        const rows = [];
        const push = () => {
            const up = Math.random() > 0.5;
            const now = new Date();
            rows.unshift(
                '<div class="row"><span class="muted">' +
                    now.toLocaleTimeString('en-GB') +
                    '</span><span class="' +
                    (up ? 'up' : 'down') +
                    '">' +
                    fmt(67400 + rnd(-40, 40), 1) +
                    '</span><span>' +
                    fmt(rnd(0.1, 5), 4) +
                    '</span></div>'
            );
            if (rows.length > 16) rows.pop();
            box.innerHTML = rows.join('');
        };
        for (let i = 0; i < 12; i++) push();
        const t = setInterval(push, 650);
        return { stop: () => clearInterval(t) };
    }

    function positions(el) {
        const box = document.createElement('div');
        box.className = 'pad';
        el.appendChild(box);
        const data = [
            ['BTC/USD', 'Long', 1.24, 12840],
            ['AAPL', 'Short', 640, -3210],
            ['NVDA', 'Long', 335, 8720],
            ['MSFT', 'Long', 210, 1540],
            ['TSLA', 'Short', 1282, -6410],
            ['GOOGL', 'Long', 676, 4120],
        ];
        const render = () => {
            box.innerHTML =
                '<table class="grid"><thead><tr><th>Symbol</th><th>Side</th><th>Qty</th><th>P/L</th></tr></thead><tbody>' +
                data
                    .map(
                        (d) =>
                            '<tr><td>' +
                            d[0] +
                            '</td><td class="' +
                            (d[1] === 'Long' ? 'up' : 'down') +
                            '">' +
                            d[1] +
                            '</td><td>' +
                            fmt(d[2], 2) +
                            '</td><td class="' +
                            (d[3] >= 0 ? 'up' : 'down') +
                            '">' +
                            (d[3] >= 0 ? '+' : '') +
                            fmt(d[3], 0) +
                            '</td></tr>'
                    )
                    .join('') +
                '</tbody></table>';
        };
        render();
        const t = setInterval(() => {
            data.forEach((d) => (d[3] += rnd(-300, 320)));
            render();
        }, 800);
        return { stop: () => clearInterval(t) };
    }

    function watch(el) {
        const box = document.createElement('div');
        box.className = 'pad';
        el.appendChild(box);
        const syms = [
            ['BTC/USD', 67432, 0.42],
            ['ETH/USD', 3521, -0.18],
            ['AAPL', 182.5, 0.31],
            ['NVDA', 875.4, -0.24],
            ['MSFT', 414.9, 0.12],
            ['TSLA', 248.3, 0.68],
        ];
        const spark = (seed) => {
            let p = 20,
                d = '';
            for (let i = 0; i < 24; i++) {
                p += Math.sin(i + seed) * 3 + rnd(-2, 2);
                d += (i ? 'L' : 'M') + i * 3 + ',' + (28 - (p % 24));
            }
            return (
                '<svg width="72" height="24" style="opacity:.8"><path d="' +
                d +
                '" fill="none" stroke="#7aa2ff" stroke-width="1.4"/></svg>'
            );
        };
        box.innerHTML = syms
            .map(
                (s, i) =>
                    '<div class="row" style="align-items:center"><span>' +
                    s[0] +
                    '</span>' +
                    spark(i) +
                    '<span>' +
                    fmt(s[1], 2) +
                    '</span><span class="' +
                    (s[2] >= 0 ? 'up' : 'down') +
                    '">' +
                    (s[2] >= 0 ? '+' : '') +
                    s[2] +
                    '%</span></div>'
            )
            .join('');
        return { stop: () => {} };
    }

    function nodes(el) {
        // Abstract "global network" — premium, institution-flavoured, cheap.
        const box = document.createElement('div');
        box.className = 'panel';
        const canvas = document.createElement('canvas');
        box.appendChild(canvas);
        el.appendChild(box);
        const ctx = canvas.getContext('2d');
        const N = 26;
        const pts = Array.from({ length: N }, () => ({
            x: Math.random(),
            y: Math.random(),
            ph: rnd(0, 6),
        }));
        let raf;
        function draw(t) {
            const dpr = window.devicePixelRatio || 1;
            const w = (canvas.width = box.clientWidth * dpr);
            const h = (canvas.height = box.clientHeight * dpr);
            ctx.clearRect(0, 0, w, h);
            const P = pts.map((p) => ({ x: p.x * w, y: p.y * h, ph: p.ph }));
            ctx.strokeStyle = 'rgba(111,155,255,0.12)';
            ctx.lineWidth = 1;
            for (let i = 0; i < N; i++)
                for (let j = i + 1; j < N; j++) {
                    const dx = P[i].x - P[j].x,
                        dy = P[i].y - P[j].y;
                    if (Math.hypot(dx, dy) < w * 0.22) {
                        ctx.beginPath();
                        ctx.moveTo(P[i].x, P[i].y);
                        ctx.lineTo(P[j].x, P[j].y);
                        ctx.stroke();
                    }
                }
            P.forEach((p) => {
                const pulse = 1 + Math.sin(t / 600 + p.ph) * 0.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2.2 * dpr * pulse, 0, 7);
                ctx.fillStyle = 'rgba(150,185,255,0.9)';
                ctx.shadowColor = '#6f9bff';
                ctx.shadowBlur = 8 * dpr;
                ctx.fill();
                ctx.shadowBlur = 0;
            });
            raf = requestAnimationFrame(draw);
        }
        raf = requestAnimationFrame(draw);
        return { stop: () => cancelAnimationFrame(raf) };
    }

    function terminal(el) {
        const box = document.createElement('div');
        box.className = 'pad mono muted';
        el.appendChild(box);
        const lines = [
            '$ dockview build --release',
            '✔ layout engine ready',
            '✔ 5 groups · 14 panels',
            '› streaming market data…',
        ];
        box.innerHTML = lines
            .map((l) => '<div>' + l + '</div>')
            .join('');
        return { stop: () => {} };
    }

    const REGISTRY = {
        chart: areaChart,
        depth: orderBook,
        heat: heatmap,
        tape: tape,
        positions: positions,
        watch: watch,
        nodes: nodes,
        terminal: terminal,
    };

    window.MovieWidgets = {
        mount(el, kind, title) {
            const fn = REGISTRY[kind] || terminal;
            return fn(el, title);
        },
    };
})();
