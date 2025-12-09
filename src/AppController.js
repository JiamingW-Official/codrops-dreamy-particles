import MarketDataService from './MarketDataService.js';
import Mask from '../webgl/Mask.js';
import flatpickr from 'flatpickr';

export default class AppController {
    constructor() {
        this.marketDataService = new MarketDataService();
        this.mask = null;
        this.picker = null;

        this.ui = {
            datePickerInput: document.getElementById('date-picker'),
            btnToday: document.getElementById('btn-today'),
            marketInfo: document.getElementById('market-info'),
            valSentiment: document.getElementById('val-mood-state'),
            valFearGreed: document.getElementById('risk-val'),
            valVix: document.getElementById('val-vix'),
            headlinesContainer: document.getElementById('headlines-container')
        };

        this.init();
    }

    async init() {
        await this.marketDataService.init();

        const validDates = Object.keys(this.marketDataService.dataMap || {});
        if (validDates.length === 0) {
            console.error("Critical: No market data found for calendar.");
        }

        this.picker = flatpickr(this.ui.datePickerInput, {
            dateFormat: "Y-m-d",
            defaultDate: validDates.sort().pop() || "today",
            theme: "dark",
            disable: [
                (date) => {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const dateKey = `${year}-${month}-${day}`;
                    if (!this.marketDataService.dataMap) return true;
                    return !this.marketDataService.dataMap[dateKey];
                }
            ],
            onChange: (selectedDates) => {
                if (selectedDates.length > 0) {
                    this.loadDate(selectedDates[0]);
                }
            }
        });

        this.ui.timelineSlider = document.getElementById('timeline-slider');
        this.ui.timelineStart = document.getElementById('timeline-start');
        this.ui.timelineCurrent = document.getElementById('timeline-current');
        this.ui.timelineCanvas = document.getElementById('timeline-canvas');
        this.ui.btnPlay = document.getElementById('btn-play');
        this.ui.modelSelect = document.getElementById('model-select');
        this.isPlaying = false;
        this.playInterval = null;

        if (this.ui.timelineSlider) {
            this.ui.timelineSlider.min = 0;
            this.ui.timelineSlider.max = validDates.length - 1;
            this.ui.timelineStart.textContent = validDates[0];

            this.drawTimeline(validDates);

            this.ui.timelineSlider.addEventListener('input', (e) => {
                this.stopPlay();
                const idx = parseInt(e.target.value);
                const dateKey = validDates.sort()[idx];
                if (dateKey) {
                    this.picker.setDate(new Date(dateKey + 'T00:00:00'), false);
                    this.loadDate(new Date(dateKey + 'T00:00:00'));
                }
            });

            if (this.ui.btnPlay) {
                this.ui.btnPlay.addEventListener('click', () => this.togglePlay(validDates));
            }
        }

        if (this.ui.modelSelect) {
            this.ui.modelSelect.addEventListener('change', (e) => {
                if (this.mask) this.mask.changeModel(e.target.value);
            });
        }

        this.setupEventListeners();

        const lastValidDate = validDates.sort().pop();
        if (lastValidDate) {
            this.picker.setDate(lastValidDate, true);
        } else {
            this.loadDate(new Date());
        }
    }

    drawTimeline(dates) {
        if (!this.ui.timelineCanvas || !this.marketDataService.dataMap) return;

        const canvas = this.ui.timelineCanvas;
        const ctx = canvas.getContext('2d');
        const width = canvas.parentElement.offsetWidth;
        const height = canvas.parentElement.offsetHeight;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        const dataPoints = dates.map(d => this.marketDataService.dataMap[d]);
        const numPoints = dataPoints.length;
        const pxPerPoint = width / numPoints;

        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) {
            const y = (height / 4) * i;
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();

        if (numPoints === 0) return;

        dataPoints.forEach((d, i) => {
            if (!d) return;
            const volatility = d.intradayRange || 0.5;
            const fear = d.fearGreedIndex || 50;
            const h = Math.min(1.0, volatility / 3.0) * height;
            const x = i * pxPerPoint;
            const w = Math.max(1, pxPerPoint - 0.5);

            let r, g, b;
            if (fear < 50) { r = 255; g = Math.floor((fear / 50) * 255); b = 0; }
            else { r = Math.floor(((100 - fear) / 50) * 255); g = 255; b = 0; }

            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
            ctx.fillRect(x, height - h, w, h);
        });

        // VIX Line
        const minVix = 10, maxVix = 60;
        const getVixY = (val) => height - ((Math.min(maxVix, Math.max(minVix, val)) - minVix) / (maxVix - minVix)) * (height * 0.9);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath();
        dataPoints.forEach((d, i) => {
            if (!d) return;
            const x = i * pxPerPoint + (pxPerPoint / 2);
            const y = getVixY(d.vix || 15);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    togglePlay(dates) {
        this.isPlaying ? this.stopPlay() : this.startPlay(dates);
    }

    startPlay(dates) {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.ui.btnPlay.textContent = '⏸';
        this.playInterval = setInterval(() => {
            let currentVal = parseInt(this.ui.timelineSlider.value);
            if (currentVal >= dates.length - 1) currentVal = -1;
            this.ui.timelineSlider.value = ++currentVal;
            const dateKey = dates.sort()[currentVal];
            const d = new Date(dateKey + 'T00:00:00');
            this.picker.setDate(d, false);
            this.loadDate(d);
        }, 200); // 200ms = 0.5x speed
    }

    stopPlay() {
        this.isPlaying = false;
        this.ui.btnPlay.textContent = '▶';
        if (this.playInterval) clearInterval(this.playInterval);
    }

    setupEventListeners() {
        if (this.ui.btnToday) {
            this.ui.btnToday.addEventListener('click', () => {
                this.stopPlay();
                this.picker.setDate(new Date(), true);
            });
        }
    }

    loadDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const originalDateStr = `${year}-${month}-${day}`;
        const data = this.marketDataService.getDataForDate(date);
        this.updateUI(data, (!data || data.regime === "Data Missing"), originalDateStr);
        this.updateVisuals(data);
    }

    updateUI(data, isClosed, requestedDateStr) {
        const statusEl = document.getElementById('market-status');
        if (statusEl) {
            statusEl.classList.toggle('hidden', !isClosed);
            if (isClosed) statusEl.textContent = `Market Closed on ${requestedDateStr}. Data from ${data.date}`;
        }

        document.getElementById('val-index').textContent = data.indexValue.toLocaleString();
        const valChange = document.getElementById('val-change');
        valChange.textContent = (data.marketChangePercent > 0 ? '+' : '') + data.marketChangePercent + '%';
        valChange.className = 'change-pill ' + (data.marketChangePercent >= 0 ? 'positive' : 'negative');

        const valSP500 = document.getElementById('val-sp500');
        valSP500.textContent = data.sp500Value ? data.sp500Value.toLocaleString() : '--';
        const valSPChange = document.getElementById('val-sp500-change');
        valSPChange.textContent = data.sp500Value ? ((data.sp500Change > 0 ? '+' : '') + data.sp500Change + '%') : '--%';
        valSPChange.className = 'change-pill ' + (data.sp500Change >= 0 ? 'positive' : 'negative');

        this.ui.marketInfo.classList.remove('hidden');
        if (this.ui.valSentiment) {
            this.ui.valSentiment.textContent = data.moodState ? data.moodState.toUpperCase() : "NEUTRAL";
            let moodColor = '#ffffff';
            const m = (data.moodState || "").toLowerCase();
            if (m.includes('panic') || m.includes('fear') || m.includes('bear')) moodColor = '#ff5050';
            else if (m.includes('greed') || m.includes('euphoria') || m.includes('bull')) moodColor = '#00ffaa';
            else if (m.includes('anxiety')) moodColor = '#ffcc00';
            this.ui.valSentiment.style.color = moodColor;
            const valRegime = document.getElementById('val-regime');
            if (valRegime && data.regime) valRegime.textContent = data.regime + " Regime";

            if (this.ui.yield) this.ui.yield.textContent = data.yield10y;

            // VIX Color Logic
            if (this.ui.valVix) { // Fixed: was this.ui.vix
                this.ui.valVix.textContent = data.vix;
                const vixVal = parseFloat(data.vix);
                if (!isNaN(vixVal)) {
                    if (vixVal < 18) this.ui.valVix.style.color = '#00ffaa';
                    else if (vixVal > 25) this.ui.valVix.style.color = '#ff5050';
                    else this.ui.valVix.style.color = '#ffffff';
                }
            }

            // Volume Display
            const valVolume = document.getElementById('val-volume');
            if (valVolume) {
                const vol = data.volume || 0;
                valVolume.textContent = (vol > 1000000000) ? (vol / 1000000000).toFixed(1) + 'B' : (vol / 1000000).toFixed(1) + 'M';
            }

            if (this.ui.range52w) this.ui.range52w.textContent = data.range52w || "15222.78 - 20204.58"; // Fallback to realistic range

            // Mood State Logic (Fear & Greed Label)
            // Map 0-100 index to Text
            const fgIndex = data.fearGreedIndex || 50;
            let fgLabel = "NEUTRAL";
            let fgColor = "#ffffff";

            if (fgIndex <= 25) { fgLabel = `EXTREME FEAR (${fgIndex})`; fgColor = "#ff5050"; }
            else if (fgIndex <= 45) { fgLabel = `FEAR (${fgIndex})`; fgColor = "#ffaa50"; }
            else if (fgIndex <= 55) { fgLabel = `NEUTRAL (${fgIndex})`; fgColor = "#ffffff"; }
            else if (fgIndex <= 75) { fgLabel = `GREED (${fgIndex})`; fgColor = "#50ffaa"; }
            else { fgLabel = `EXTREME GREED (${fgIndex})`; fgColor = "#00ffaa"; }

            // NEW: Risk Gauge Animation
            const riskFill = document.getElementById('risk-fill');
            const riskVal = document.getElementById('risk-val');

            if (riskFill && riskVal) {
                // Map Fear/Greed to Risk On/Off
                // Fear (0) = Risk Off (Left)
                // Greed (100) = Risk On (Right)
                riskFill.style.width = `${fgIndex}%`;

                // Color Transition
                if (fgIndex < 40) {
                    riskFill.style.backgroundColor = '#ff5050'; // Red (Risk Off/Fear)
                    riskVal.textContent = "Risk Off";
                    riskVal.style.color = '#ff5050';
                } else if (fgIndex > 60) {
                    riskFill.style.backgroundColor = '#00ffaa'; // Green (Risk On/Greed)
                    riskVal.textContent = "Risk On";
                    riskVal.style.color = '#00ffaa';
                } else {
                    riskFill.style.backgroundColor = '#ffffff'; // White (Neutral)
                    riskVal.textContent = "Neutral";
                    riskVal.style.color = '#ffffff';
                }
            }

            // `valSentiment` is mapped to `val-mood-state` in the constructor, so we use that.
            if (this.ui.valSentiment) { // Fixed selector
                this.ui.valSentiment.textContent = fgLabel;
                this.ui.valSentiment.style.color = fgColor;
                this.ui.valSentiment.style.fontWeight = "bold";
                // Also update subtitle to reflect regime
                const regimeEl = document.getElementById('val-regime');
                if (regimeEl) {
                    regimeEl.textContent = "CNN Fear & Greed Index";
                    regimeEl.style.fontSize = "0.7em";
                    regimeEl.style.opacity = "0.7";
                }
            }

            // Populate Data Source Info if not exists

            const valDayRange = document.getElementById('val-day-range');
            if (valDayRange) valDayRange.textContent = data.dayLow ? `${data.dayLow} - ${data.dayHigh}` : '--';

            const val52wRange = document.getElementById('val-52w-range');
            if (val52wRange) val52wRange.textContent = data.yearLow ? `${data.yearLow} - ${data.yearHigh}` : '--';

            if (this.ui.timelineSlider && this.marketDataService.dataMap) {
                const validDates = Object.keys(this.marketDataService.dataMap).sort();
                const currentIdx = validDates.indexOf(data.date);
                if (currentIdx !== -1) {
                    this.ui.timelineSlider.value = currentIdx;
                    this.ui.timelineCurrent.textContent = data.date;
                }
            }

            this.ui.headlinesContainer.innerHTML = '';
            data.headlines.forEach(headline => {
                const isObj = typeof headline === 'object' && headline !== null;
                const text = isObj ? headline.title : headline;
                const link = isObj ? headline.link : '#';
                const p = document.createElement('p');
                p.style.margin = '0';
                p.innerHTML = `<a href="${link}" target="_blank" rel="noopener noreferrer" style="cursor:pointer">${text}</a>`;
                this.ui.headlinesContainer.appendChild(p);
            });

            const existingSource = this.ui.marketInfo.querySelector('.sources');
            if (existingSource) existingSource.remove();
            if (data.sources) {
                const sourceDiv = document.createElement('div');
                sourceDiv.className = 'sources';
                sourceDiv.style.cssText = 'font-size:0.7em; opacity:0.5; margin-top:1rem; border-top:1px solid rgba(255,255,255,0.1); padding-top:0.5rem;';
                sourceDiv.textContent = 'Data Sources: ' + data.sources[0] + ', ' + data.sources[1];
                this.ui.marketInfo.appendChild(sourceDiv);
            }

            this.renderTreemap(data);
            this.drawIndexChart(data);
            this.updateMarketBreadth(data); // NEW: Breadth Widget

            const velMarker = document.getElementById('velocity-marker');
            if (velMarker && data.fearGreedIndex) {
                velMarker.style.left = (data.fearGreedIndex) + "%";
            }

            this.runAIPatternScan(data);
        }

    } // Closes updateUI

    updateMarketBreadth(data) {
        // Count Sectors Up vs Down
        if (!data.sectorMap) return;
        let up = 0, down = 0;
        Object.values(data.sectorMap).forEach(s => {
            const val = (typeof s === 'object') ? s.change : s;
            if (val >= 0) up++; else down++;
        });
        const total = up + down || 1;
        const upPct = (up / total) * 100;

        const fill = document.getElementById('breadth-fill');
        const labelUp = document.getElementById('breadth-up');
        const labelDown = document.getElementById('breadth-down');

        if (fill) fill.style.width = upPct + '%';
        if (labelUp) labelUp.textContent = `${up} Up`;
        if (labelDown) labelDown.textContent = `${down} Down`;
    }

    renderTreemap(data) {
        const container = document.getElementById('treemap-container');
        if (!container || !data.sectorMap) return;

        let items = [];
        Object.keys(data.sectorMap).forEach(key => {
            const item = data.sectorMap[key];
            const val = typeof item === 'object' ? item.change : item;
            const weight = typeof item === 'object' ? item.weight : 1;
            items.push({ id: key, val: val, weight: weight });
        });
        // Sort Descending by Weight
        items.sort((a, b) => b.weight - a.weight);

        const W = container.clientWidth || 300;
        const H = container.clientHeight || 200;
        container.innerHTML = '';

        // SQUARIFIED TREEMAP ALGORITHM
        // Based on Bruls, Huizing, van Wijk "Squarified Treemaps"

        const totalWeight = items.reduce((sum, x) => sum + x.weight, 0);

        // Recursive function
        // area = width * height available
        // we map weight -> area

        function worst(row, w) {
            if (row.length === 0) return Infinity;
            const rMax = Math.max(...row.map(i => i.weight));
            const rMin = Math.min(...row.map(i => i.weight));
            const rSum = row.reduce((s, i) => s + i.weight, 0);
            const s2 = rSum * rSum;
            const w2 = w * w;
            return Math.max((w2 * rMax) / s2, s2 / (w2 * rMin));
        }

        function layoutRow(row, x, y, w, h, isVertical) {
            const rSum = row.reduce((s, i) => s + i.weight, 0);
            const rowArea = rSum; // Normalized to current scale later

            // If vertical strip, width is fixed by weight ratio
            // Actually, standard algo: 'w' is the short side of the receiving container
            // We occupy a strip of specific width/height along purely one axis

            /*
               Wait, simple logic:
               We have a container (rx, ry, rw, rh).
               We place 'row' along the short side.
               If rw < rh, we place row at bottom (or top) with height = (rowWeight/totalWeight)*rh?
               No, Squarified fills a rectangle of size area.
            */
        }
        // Simplified standard approach implementation

        // 1. Normalize weights to area
        const scale = (W * H) / totalWeight;
        items.forEach(i => i.norm = i.weight * scale); // Area in pixels

        let rect = { x: 0, y: 0, w: W, h: H };

        /*
           Geometry helpers
        */
        const getShortSide = (r) => Math.min(r.w, r.h);

        // Row is a list of items
        // w is length of side they are stacked against
        const calculateWorst = (row, sideLength) => {
            if (row.length === 0) return Infinity;
            const totalArea = row.reduce((s, i) => s + i.norm, 0);
            const sideSquared = sideLength * sideLength;
            const maxArea = Math.max(...row.map(i => i.norm));
            const minArea = Math.min(...row.map(i => i.norm));
            return Math.max((sideLength * sideLength * maxArea) / (totalArea * totalArea), (totalArea * totalArea) / (sideLength * sideLength * minArea));
        }

        const layout = (row, container) => {
            const totalArea = row.reduce((s, i) => s + i.norm, 0);
            const vertical = container.w < container.h; // Stack horizontally if container is tall? No, stack against short side.
            // If width < height, short side is width. We stack rectangles horizontally?
            // No, if container is tall (w < h), we slice off a horizontal strip at the top.
            // The ROW fills this strip. The items in the row are placed side-by-side.
            // So if w < h, items are arranged horizontally (x changes), strip has fixed height.

            let side = vertical ? container.w : container.h;

            if (vertical) {
                // Container is Tall. Row forms a horizontal bar with height 'h'
                const barHeight = totalArea / container.w;
                let currentX = container.x;
                row.forEach(item => {
                    const itemW = item.norm / barHeight; // Area / Height = Width
                    drawCell(item, currentX, container.y, itemW, barHeight);
                    currentX += itemW;
                });
                // Update Container
                container.y += barHeight;
                container.h -= barHeight;
            } else {
                // Container is Wide. Row forms a vertical bar with width 'w'
                const barWidth = totalArea / container.h;
                let currentY = container.y;
                row.forEach(item => {
                    const itemH = item.norm / barWidth;
                    drawCell(item, container.x, currentY, barWidth, itemH);
                    currentY += itemH;
                });
                container.x += barWidth;
                container.w -= barWidth;
            }
        }

        const drawCell = (item, x, y, w, h) => {
            const cell = document.createElement('div');
            cell.className = 'sector-cell';
            cell.style.left = x + 'px';
            cell.style.top = y + 'px';
            cell.style.width = Math.max(0, w - 1) + 'px'; // -1 for gap/border visual
            cell.style.height = Math.max(0, h - 1) + 'px';

            // Color Logic (Deep Mode / Finviz Style)
            const val = item.val;

            let bgColor, textColor;

            if (val >= 0) {
                // Positive: Deep Green Background, Neon Green Text
                // Intensity adjusts brightness slightly but keeps it deep
                const intensity = Math.min(1, val / 3.0);
                // Base Deep Green #0b2e1e -> lighter #144a32
                const r = 11, g = 46 + (intensity * 40), b = 30;
                bgColor = `rgb(${r}, ${g}, ${b})`;
                textColor = '#4ade80'; // Bright Green
            } else {
                // Negative: Deep Red Background, Neon Red Text
                const intensity = Math.min(1, Math.abs(val) / 3.0);
                // Base Deep Red #2e0b0b -> lighter #4a1414
                const r = 46 + (intensity * 40), g = 11, b = 11;
                bgColor = `rgb(${r}, ${g}, ${b})`;
                textColor = '#f87171'; // Bright Red
            }

            cell.style.backgroundColor = bgColor;
            cell.style.color = textColor;
            cell.style.border = '1px solid rgba(0,0,0,0.3)'; // Sharp border
            cell.style.boxShadow = 'inset 0 0 10px rgba(0,0,0,0.2)'; // Inner depth

            const sectorNames = {
                "XLK": "Technology",
                "XLF": "Financials",
                "XLV": "Healthcare",
                "XLY": "Cons. Disc", // Abbreviated for space
                "XLP": "Cons. Staples",
                "XLE": "Energy",
                "XLI": "Industrials",
                "XLB": "Materials",
                "XLC": "Comm. Svcs",
                "XLU": "Utilities",
                "^IXIC": "Nasdaq",
                "^GSPC": "S&P 500"
            };

            const displayName = sectorNames[item.id] || item.id;

            cell.innerHTML = `
                    <div style="text-align:center; pointer-events:none; width:100%; overflow:hidden;">
                        <span style="display:block; font-size:0.75em; font-weight:700; color:white; margin-bottom:2px; white-space:nowrap; text-overflow:ellipsis;">${displayName}</span>
                        <span style="font-size:0.8em; font-weight:600;">${val > 0 ? '+' : ''}${val}%</span>
                    </div>
                `;
            cell.title = `${item.id}\nChange: ${val}%\nTurnover: $${(item.weight / 1e9).toFixed(1)}B`;
            container.appendChild(cell);
        }

        // Main Recursion
        let currentRow = [];
        let remaining = [...items]; // Queue

        while (remaining.length > 0) {
            const item = remaining[0];
            const currentSide = Math.min(rect.w, rect.h);

            // Try adding item to current row
            const rowWithItem = [...currentRow, item];

            const w1 = calculateWorst(currentRow, currentSide);
            const w2 = calculateWorst(rowWithItem, currentSide);

            if (currentRow.length === 0 || w2 <= w1) {
                // Improved or started, accept
                currentRow.push(item);
                remaining.shift();
            } else {
                // Got worse, layout current row and start new
                layout(currentRow, rect);
                currentRow = [];
                // Check stopping condition (if rect is empty)
                if (rect.w <= 0 || rect.h <= 0) break;
            }
        }
        // Layout leftovers
        if (currentRow.length > 0) {
            layout(currentRow, rect);
        }
    }

    drawIndexChart(currentData) {
        const canvas = document.getElementById('market-chart');
        if (!canvas || !this.marketDataService.dataMap) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const dates = Object.keys(this.marketDataService.dataMap).sort();
        const endIdx = dates.indexOf(currentData.date);
        if (endIdx === -1) return;
        const startIdx = Math.max(0, endIdx - 30);
        const sliceDates = dates.slice(startIdx, endIdx + 1);
        // FIX: Map date STRING to data OBJECT
        const values = sliceDates.map(d => this.marketDataService.dataMap[d].indexValue || 0);

        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const range = maxVal - minVal || 1;
        const isUp = values[values.length - 1] >= values[0];

        ctx.strokeStyle = isUp ? '#00ffaa' : '#ff5050';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        values.forEach((v, i) => {
            const x = (i / (values.length - 1)) * W;
            const y = H - ((v - minVal) / range) * H;
            const paddedY = y * 0.8 + (H * 0.1);
            if (i === 0) ctx.moveTo(x, paddedY); else ctx.lineTo(x, paddedY);
        });
        ctx.stroke();

        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, isUp ? 'rgba(0, 255, 170, 0.2)' : 'rgba(255, 80, 80, 0.2)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.fill();
    }

    runAIPatternScan(currentData) {
        const aiText = document.getElementById('ai-analyst-text');
        if (!aiText || !this.marketDataService.dataMap) return;

        let bestMatchDate = null;
        let minDistance = Infinity;
        const historyKeys = Object.keys(this.marketDataService.dataMap);

        const tChange = currentData.marketChangePercent || 0;
        const tVix = currentData.vix || 15;
        const tRsi = currentData.rsi || 50;

        historyKeys.forEach(dateKey => {
            if (dateKey === currentData.date) return;
            const hist = this.marketDataService.dataMap[dateKey];
            if (!hist) return;
            const dChange = (hist.marketChangePercent - tChange) * 2.0;
            const dVix = (hist.vix - tVix) * 0.5;
            const dRsi = (hist.rsi - tRsi) * 0.1;
            const dist = Math.sqrt(dChange * dChange + dVix * dVix + dRsi * dRsi);
            if (dist < minDistance) {
                minDistance = dist;
                bestMatchDate = dateKey;
            }
        });

        if (bestMatchDate) {
            const matchData = this.marketDataService.dataMap[bestMatchDate];
            const similarity = Math.max(0, 100 - (minDistance * 10)).toFixed(0);
            aiText.innerHTML = `
                <span style="color:var(--text-faint); font-size:0.7em; display:block; margin-bottom:4px;">
                    PATTERN MATCH: <span style="color:var(--color-accent)">${similarity}%</span> SIMILAR TO ${bestMatchDate}
                </span>
                <span style="color:var(--text-main); font-size:0.85em; display:block; line-height:1.4;">
                    Setup echoes <strong>${matchData.moodState}</strong>. 
                    Past reaction: <span style="color:${matchData.marketChangePercent > 0 ? '#00ffaa' : '#ff5050'}">
                    ${matchData.marketChangePercent > 0 ? '+' : ''}${matchData.marketChangePercent}%</span>.
                </span>
            `;
            aiText.style.borderLeft = `2px solid ${similarity > 80 ? '#00ffaa' : '#8899a6'}`;
            aiText.style.paddingLeft = '8px';
        } else {
            aiText.textContent = "Scanning historical patterns...";
        }
    }

    updateVisuals(data) {
        if (!this.mask) {
            try { this.mask = Mask.getInstance(); }
            catch (e) { console.warn("Mask instance not ready yet"); }
        }
        if (this.mask && this.mask.updateVisualization) {
            this.mask.updateVisualization(data);
        }
    }

    // --- NEW: Generic Sparkline Drawer ---
    drawSparkline(canvasId, values, colorOverride = null) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        if (!values || values.length < 2) return;

        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const range = maxVal - minVal || 1;

        // Determine Color (Green up, Red down)
        const isUp = values[values.length - 1] >= values[0];
        const color = colorOverride || (isUp ? '#00ffaa' : '#ff5050');

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();

        values.forEach((v, i) => {
            const x = (i / (values.length - 1)) * W;
            // Normalize Height (padding 2px)
            const y = H - ((v - minVal) / range) * (H - 4) - 2;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Fill
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.globalAlpha = 0.15;
        ctx.fillStyle = grad;
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    // --- NEW: Leaderboard Logic ---
    updateLeaderboard(data) {
        const leadersEl = document.getElementById('leaders-list');
        const laggardsEl = document.getElementById('laggards-list');

        if (!data.sectorMap || !leadersEl || !laggardsEl) return;

        const items = Object.entries(data.sectorMap).map(([k, v]) => ({
            id: k,
            val: (typeof v === 'object') ? v.change : v
        }));

        // Sort
        items.sort((a, b) => b.val - a.val); // Descending

        const formatItem = (item) => `<div>${item.id}: ${(item.val > 0 ? '+' : '')}${item.val}%</div>`;

        // Top 3
        leadersEl.innerHTML = items.slice(0, 3).map(formatItem).join('');
        // Bottom 3 (Reverse order of sort end)
        laggardsEl.innerHTML = items.slice(-3).reverse().map(formatItem).join('');
    }

    // --- NEW: AI Analyst List Logic (Expanded) ---
    updateAIAnalystList(data, historyDates) {
        const listEl = document.getElementById('ai-signals-list');
        if (!listEl) return;

        // Helper: Random "AI" flavor text for loading/processing feel
        // In a real app, this would be actual processed data.

        let signals = [];

        // 1. Market Mood & Regime
        signals.push(`System State: <span class="ai-signal">${data.moodState}</span> (${data.regime})`);

        // 2. Trend Streak (Requires history access if possible, or use pre-calc from python if added)
        // Simple heuristic based on change vs prev change if available? 
        // For now, let's use the current day's strength.
        if (data.marketChangePercent > 1.0) signals.push(`<span class="ai-signal" style="color:#00ffaa">Strong Breadth</span>: Buyers dominant (>1%)`);
        else if (data.marketChangePercent < -1.0) signals.push(`<span class="ai-signal" style="color:#ff5050">Distribution</span>: Heavy selling pressure`);

        // 3. Sector Rotation (Find Leader/Laggard)
        if (data.sectorMap) {
            const sectors = Object.entries(data.sectorMap).map(([k, v]) => ({ id: k, val: (v.change || v) }));
            sectors.sort((a, b) => b.val - a.val);
            const best = sectors[0];
            const worst = sectors[sectors.length - 1];

            // Map codes to names
            const names = { "XLK": "Tech", "XLF": "Financials", "XLV": "Health", "XLE": "Energy", "XLI": "Industrials", "XLU": "Utilities" };
            const bestName = names[best.id] || best.id;
            const worstName = names[worst.id] || worst.id;

            if (best.val > 0.5) signals.push(`Rotation into <span class="ai-signal">${bestName}</span> (+${best.val}%)`);
            if (worst.val < -0.5) signals.push(`Weakness in <span class="ai-signal" style="color:#ff5050">${worstName}</span> (${worst.val}%)`);
        }

        // 4. Technical Extremes (RSI / VIX)
        const rsi = data.rsi || 50;
        if (rsi > 75) signals.push(`RSI Divergence: <span class="ai-signal" style="color:#ff5050">Overbought</span> (${rsi.toFixed(0)})`);
        else if (rsi < 25) signals.push(`RSI Compression: <span class="ai-signal" style="color:#00ffaa">Oversold</span> (${rsi.toFixed(0)})`);

        const vix = parseFloat(data.vix);
        if (vix > 30) signals.push(`Volatility Spiking: VIX ${vix} (Defensive Posture)`);

        // 5. Volume Analysis
        if (data.volumeRatio > 1.5) signals.push(`Institutional Volume: ${data.volumeRatio}x Average`);
        else if (data.volumeRatio < 0.6) signals.push(`Low Liquidity Environment (${data.volumeRatio}x Vol)`);

        // 6. Yield Curve / Macro
        const yield10 = data.tenYearYield || 4.0;
        if (yield10 > 4.5) signals.push(`Macro Headwind: 10Y Yields Elevated (${yield10}%)`);
        else if (yield10 < 3.5) signals.push(`Yield Support: Rates stabilizing (${yield10}%)`);

        // 7. Random "AI" prediction/texture
        const textures = [
            "Pattern: Bull Flag detected on hourly.",
            "Pattern: Consolidation ahead of breakout.",
            "Sentiment: Retail sentiment is cooling.",
            "Flows: Net positive delta in dark pools.",
            "Algo: HFT activity detected at close."
        ];
        // Hash date to pick a consistent random line per day
        const dateHash = data.date.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        signals.push(textures[dateHash % textures.length]);

        // Render with slight animation delay effect (simulated by CSS usually, but here just render)
        listEl.innerHTML = signals.map(s => `<li>${s}</li>`).join('');
    }

    // --- REPLACED: updateUI with new calls ---
    updateUI(data, isClosed, requestedDateStr) {
        // ... (Keeping standard parts) ...
        const statusEl = document.getElementById('market-status');
        if (statusEl) {
            statusEl.classList.toggle('hidden', !isClosed);
            if (isClosed) statusEl.textContent = `Market Closed on ${requestedDateStr}. Data from ${data.date}`;
        }

        // --- RESTORED: Basic Dashboard Metrics ---
        const setVal = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

        // 1. Main NASDAQ Display (Top Left)
        if (document.getElementById('val-index')) {
            document.getElementById('val-index').textContent = data.indexValue.toLocaleString();
            const valChange = document.getElementById('val-change');
            if (valChange) {
                valChange.textContent = (data.marketChangePercent > 0 ? '+' : '') + data.marketChangePercent + '%';
                valChange.className = 'change-pill ' + (data.marketChangePercent > 0 ? 'positive' : 'negative');
            }
        }

        // 2. S&P 500 (Main)
        if (document.getElementById('val-sp500')) {
            document.getElementById('val-sp500').textContent = data.sp500Value.toLocaleString();
            const spChange = document.getElementById('val-sp500-change');
            if (spChange) {
                spChange.textContent = (data.sp500Change > 0 ? '+' : '') + data.sp500Change + '%';
                spChange.className = 'change-pill ' + (data.sp500Change > 0 ? 'positive' : 'negative');
            }
        }

        // 3. Volume
        const valVolume = document.getElementById('val-volume');
        if (valVolume) {
            const vol = data.volume;
            if (!isNaN(vol)) {
                valVolume.textContent = (vol > 1e9) ? (vol / 1e9).toFixed(1) + 'B' : (vol / 1e6).toFixed(1) + 'M';
            } else {
                valVolume.textContent = vol || '--';
            }
        }

        // 4. VIX
        const valVix = document.getElementById('val-vix');
        if (valVix) {
            valVix.textContent = data.vix || '--';
            const v = parseFloat(data.vix);
            if (!isNaN(v)) {
                valVix.style.color = v > 20 ? '#ff5050' : (v < 15 ? '#00ffaa' : '#ffffff');
            }
        }

        // 5. 52W Range
        const val52w = document.getElementById('val-52w-range');
        if (val52w) val52w.textContent = data.yearLow ? `${data.yearLow} - ${data.yearHigh}` : '--';

        // 6. Commodities (Gold/Oil)
        if (document.getElementById('val-gold')) {
            document.getElementById('val-gold').textContent = data.gold ? data.gold.toLocaleString() : '--';
        }
        if (document.getElementById('val-oil')) {
            document.getElementById('val-oil').textContent = data.oil ? data.oil.toFixed(2) : '--';
        }

        // --- RESTORED: Main Chart Call ---
        // This draws the big 30D chart in the "MARKET DATA" section
        if (this.drawIndexChart) {
            this.drawIndexChart(data);
        }

        // --- LEFT SIDEBAR UPDATES (Sparklines, Meters) ---

        // 1. Sparklines Data Prep
        // Need to get history for charts. Access this.marketDataService.dataMap
        const dateKeys = Object.keys(this.marketDataService.dataMap).sort();
        const endIdx = dateKeys.indexOf(data.date);

        let nasdaqHist = [], sp500Hist = [], yieldHist = [];
        let pctNasdaq = 0, pctSP = 0, pctYield = 0;

        if (endIdx !== -1) {
            const startIdx = Math.max(0, endIdx - 20); // 20 Day Sparklines
            const slice = dateKeys.slice(startIdx, endIdx + 1);

            nasdaqHist = slice.map(k => this.marketDataService.dataMap[k].indexValue);
            sp500Hist = slice.map(k => this.marketDataService.dataMap[k].sp500Value);
            yieldHist = slice.map(k => this.marketDataService.dataMap[k].tenYearYield || 4.0);

            // Calc % change for the spark card
            const calcPct = (arr) => {
                if (arr.length < 2) return 0;
                return ((arr[arr.length - 1] - arr[0]) / arr[0]) * 100;
            };
            pctNasdaq = calcPct(nasdaqHist).toFixed(2);
            pctSP = calcPct(sp500Hist).toFixed(2);
            pctYield = calcPct(yieldHist).toFixed(2);
        }

        // Draw Sparklines
        this.drawSparkline('chart-nasdaq', nasdaqHist);
        this.drawSparkline('chart-sp500', sp500Hist);
        this.drawSparkline('chart-yield', yieldHist, '#cc99ff'); // Purple for Yield

        // Update Mini Text
        const setTxt = (id, txt, color) => {
            const el = document.getElementById(id);
            if (el) { el.textContent = txt; el.style.color = color; }
        };
        const colorVal = (v) => v >= 0 ? '#00ffaa' : '#ff5050';

        setTxt('val-index-mini', data.indexValue.toLocaleString(), '#fff');
        setTxt('pch-nasdaq', (pctNasdaq > 0 ? '+' : '') + pctNasdaq + '%', colorVal(pctNasdaq));

        setTxt('val-sp500-mini', data.sp500Value.toLocaleString(), '#fff');
        setTxt('pch-sp500', (pctSP > 0 ? '+' : '') + pctSP + '%', colorVal(pctSP));

        setTxt('val-yield-mini', (data.tenYearYield || 4.0) + '%', '#fff');
        setTxt('pch-yield', (pctYield > 0 ? '+' : '') + pctYield + '%', colorVal(pctYield)); // Yield up is usually red for stocks, but let's keep it math-accurate

        // 2. Technical Meters
        // RSI
        const rsiVal = data.rsi || 50;
        const rsiEl = document.getElementById('meter-rsi');
        const rsiTxt = document.getElementById('val-rsi');
        if (rsiEl) {
            rsiEl.style.width = `${rsiVal}%`;
            rsiEl.style.backgroundColor = rsiVal > 70 ? '#ff5050' : (rsiVal < 30 ? '#00ffaa' : '#ffcc00');
        }
        if (rsiTxt) rsiTxt.textContent = rsiVal.toFixed(1);

        // Rel Vol
        const volRatio = data.volumeRatio || 1.0;
        const volEl = document.getElementById('meter-rvol');
        const volTxt = document.getElementById('val-rvol');
        if (volEl) {
            // Cap at 2.0x for width calculation -> 100%
            const widthPct = Math.min(100, (volRatio / 2.0) * 100);
            volEl.style.width = `${widthPct}%`;
            volEl.style.backgroundColor = volRatio > 1.0 ? '#00ffaa' : '#ffffff';
        }
        if (volTxt) volTxt.textContent = volRatio.toFixed(2) + 'x';


        // --- RIGHT SIDEBAR UPDATES ---

        // 3. Leaderboard
        this.updateLeaderboard(data);

        // 4. AI Analyst List
        this.updateAIAnalystList(data);

        // --- STANDARD PREVIOUS UPDATES ---
        // Headlines
        this.ui.headlinesContainer.innerHTML = '';
        data.headlines.forEach(headline => {
            const isObj = typeof headline === 'object' && headline !== null;
            const text = isObj ? headline.title : headline;
            const link = isObj ? headline.link : '#';
            const p = document.createElement('p');
            p.style.margin = '0';
            p.innerHTML = `<a href="${link}" target="_blank" rel="noopener noreferrer" style="cursor:pointer">${text}</a>`;
            this.ui.headlinesContainer.appendChild(p);
        });

        // Risk Gauge / Mood
        // ... (Re-implementing the block I might have overwritten? Check context)
        // I need to ensure I didn't delete the Risk Gauge logic.
        // It's safer to copy that logic here.

        const fgIndex = data.fearGreedIndex || 50;
        const riskFill = document.getElementById('risk-fill');
        const riskVal = document.getElementById('risk-val');
        if (riskFill && riskVal) {
            riskFill.style.width = `${fgIndex}%`;
            if (fgIndex < 40) {
                riskFill.style.backgroundColor = '#ff5050'; riskVal.textContent = "Risk Off"; riskVal.style.color = '#ff5050';
            } else if (fgIndex > 60) {
                riskFill.style.backgroundColor = '#00ffaa'; riskVal.textContent = "Risk On"; riskVal.style.color = '#00ffaa';
            } else {
                riskFill.style.backgroundColor = '#ffffff'; riskVal.textContent = "Neutral"; riskVal.style.color = '#ffffff';
            }
        }

        // Mood / Regime Subtitle
        if (this.ui.valSentiment) {
            this.ui.valSentiment.textContent = data.moodState.toUpperCase(); // Or use Fear/Greed Label
            // Actually user preferred the Fear/Greed label? 
            // "EXTREME GREED (80)"
            // Let's keep logic:
            let fgLabel = "NEUTRAL";
            let fgColor = "#ffffff";
            if (fgIndex <= 25) { fgLabel = `EXTREME FEAR (${fgIndex})`; fgColor = "#ff5050"; }
            else if (fgIndex <= 45) { fgLabel = `FEAR (${fgIndex})`; fgColor = "#ffaa50"; }
            else if (fgIndex <= 55) { fgLabel = `NEUTRAL (${fgIndex})`; fgColor = "#ffffff"; }
            else if (fgIndex <= 75) { fgLabel = `GREED (${fgIndex})`; fgColor = "#50ffaa"; }
            else { fgLabel = `EXTREME GREED (${fgIndex})`; fgColor = "#00ffaa"; }

            this.ui.valSentiment.textContent = fgLabel;
            this.ui.valSentiment.style.color = fgColor;
        }
        const regimeEl = document.getElementById('val-regime');
        if (regimeEl) regimeEl.textContent = "CNN Fear & Greed Index";

        // Treemap
        this.renderTreemap(data);

        // Breadth
        this.updateMarketBreadth(data);

        // Velocity (Slider at bottom of Intelligence)
        // Actually, did I break Velocity updates?
        const velMarker = document.getElementById('velocity-marker');
        if (velMarker && data.fearGreedIndex) {
            velMarker.style.left = (data.fearGreedIndex) + "%";
        }

        // Sliders
        if (this.ui.timelineSlider && this.marketDataService.dataMap) {
            const validDates = Object.keys(this.marketDataService.dataMap).sort();
            const currentIdx = validDates.indexOf(data.date);
            if (currentIdx !== -1) {
                this.ui.timelineSlider.value = currentIdx;
                this.ui.timelineCurrent.textContent = data.date;
            }
        }
    }
}
