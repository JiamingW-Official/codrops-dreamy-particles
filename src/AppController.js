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

            // Risk gauge is now handled by #risk-marker below

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
        }

        // Always run AI Pattern Scan (moved outside conditional block)
        this.runAIPatternScan(data);

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

        container.innerHTML = '';
        const rect = { x: 0, y: 0, w: container.clientWidth, h: container.clientHeight };

        if (rect.w === 0 || rect.h === 0) return;

        // Helpers defined in scope
        const calculateWorst = (row, sideLength) => {
            if (row.length === 0) return 0;
            const totalArea = row.reduce((sum, item) => sum + item.area, 0);
            const s2 = sideLength * sideLength;
            const w2 = totalArea * totalArea;
            let maxWorst = 0;
            for (let item of row) {
                const r = item.area;
                const worst = Math.max((s2 * r) / w2, w2 / (s2 * r));
                if (worst > maxWorst) maxWorst = worst;
            }
            return maxWorst;
        };

        const drawCell = (item, x, y, w, h) => {
            const cell = document.createElement('div');
            cell.className = 'sector-cell';
            cell.style.left = x + 'px';
            cell.style.top = y + 'px';
            cell.style.width = Math.max(0, w - 1) + 'px';
            cell.style.height = Math.max(0, h - 1) + 'px';

            const val = item.val;
            let bgColor, textColor;

            if (val >= 0) {
                const intensity = Math.min(1, val / 3.0);
                const r = 11, g = 46 + (intensity * 40), b = 30;
                bgColor = `rgb(${r}, ${g}, ${b})`;
                textColor = '#4ade80';
            } else {
                const intensity = Math.min(1, Math.abs(val) / 3.0);
                const r = 46 + (intensity * 40), g = 11, b = 11;
                bgColor = `rgb(${r}, ${g}, ${b})`;
                textColor = '#f87171';
            }

            cell.style.backgroundColor = bgColor;
            cell.style.color = textColor;
            cell.style.border = '1px solid rgba(0,0,0,0.3)';
            cell.style.boxShadow = 'inset 0 0 10px rgba(0,0,0,0.2)';

            // Mapping Tickers to Names
            const sectorNames = {
                'XLK': 'Technology', 'XLF': 'Financials', 'XLV': 'Healthcare',
                'XLY': 'Discretionary', 'XLP': 'Staples', 'XLE': 'Energy',
                'XLI': 'Industrials', 'XLB': 'Materials', 'XLU': 'Utilities',
                'XLRE': 'Real Estate', 'XLC': 'Comm. Svcs'
            };
            const displayName = sectorNames[item.id] || item.id;

            // Just display ID + Val
            cell.innerHTML = `
                <div style="text-align:center; pointer-events:none; width:100%; overflow:hidden; display:flex; flex-direction:column; justify-content:center; height:100%;">
                    <span style="display:block; font-size:0.8em; font-weight:700; color:white; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:0 2px;">${displayName}</span>
                    <span style="font-size:0.85em; font-weight:600;">${val > 0 ? '+' : ''}${val}%</span>
                </div>
            `;
            cell.title = `${displayName}: ${val}%`;
            container.appendChild(cell);
        };

        const layout = (row, containerRect) => {
            const totalArea = row.reduce((s, i) => s + i.area, 0);
            const vertical = containerRect.w < containerRect.h;
            if (vertical) {
                const barHeight = totalArea / containerRect.w;
                let currentX = containerRect.x;
                row.forEach(item => {
                    const itemW = item.area / barHeight;
                    drawCell(item, currentX, containerRect.y, itemW, barHeight);
                    currentX += itemW;
                });
                containerRect.y += barHeight;
                containerRect.h -= barHeight;
            } else {
                const barWidth = totalArea / containerRect.h;
                let currentY = containerRect.y;
                row.forEach(item => {
                    const itemH = item.area / barWidth;
                    drawCell(item, containerRect.x, currentY, barWidth, itemH);
                    currentY += itemH;
                });
                containerRect.x += barWidth;
                containerRect.w -= barWidth;
            }
        };

        // Main Algorithm Execution
        const totalWeight = items.reduce((sum, x) => sum + x.weight, 0);
        const scale = (rect.w * rect.h) / totalWeight;
        items.forEach(i => i.area = i.weight * scale);

        let currentRow = [];
        let remaining = [...items];

        while (remaining.length > 0) {
            const item = remaining[0];
            const currentSide = Math.min(rect.w, rect.h);
            const rowWithItem = [...currentRow, item];

            // Only use calculateWorst if row has items
            const w1 = calculateWorst(currentRow, currentSide);
            const w2 = calculateWorst(rowWithItem, currentSide);

            if (currentRow.length === 0 || w2 <= w1) {
                currentRow.push(item);
                remaining.shift();
            } else {
                layout(currentRow, rect);
                currentRow = [];
                if (rect.w <= 0 || rect.h <= 0) break;
            }
        }
        if (currentRow.length > 0) layout(currentRow, rect);
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
        if (!aiText) {
            console.warn('[AI] ai-analyst-text element not found');
            return;
        }

        // If no current data, show loading
        if (!currentData) {
            aiText.innerHTML = `<span style="color:#ffcc00;">Loading market data...</span>`;
            return;
        }

        const mood = currentData.moodState || 'Neutral';
        const vix = currentData.vix || '--';
        const fg = currentData.fearGreedIndex || 50;
        const change = currentData.marketChangePercent || 0;

        // If dataMap not ready or too few entries, show current conditions
        if (!this.marketDataService.dataMap || Object.keys(this.marketDataService.dataMap).length < 3) {
            aiText.innerHTML = `
                <span style="color:var(--text-faint); font-size:0.75em; display:block; margin-bottom:4px;">
                    MARKET PULSE
                </span>
                <span style="color:var(--text-main); font-size:0.9em; display:block; line-height:1.5;">
                    Mood: <strong style="color:${fg < 40 ? '#ff5050' : fg > 60 ? '#00ffaa' : '#ffcc00'}">${mood}</strong><br/>
                    VIX: ${vix} | F&G: ${fg} | Chg: ${change > 0 ? '+' : ''}${change}%
                </span>
            `;
            aiText.style.borderLeft = '2px solid #8899a6';
            aiText.style.paddingLeft = '8px';
            return;
        }

        // Find best pattern match
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
                <span style="color:var(--text-faint); font-size:0.75em; display:block; margin-bottom:4px;">
                    PATTERN MATCH: <span style="color:var(--color-accent)">${similarity}%</span> SIMILAR TO ${bestMatchDate}
                </span>
                <span style="color:var(--text-main); font-size:0.9em; display:block; line-height:1.5;">
                    Setup echoes <strong>${matchData.moodState}</strong>. 
                    Past reaction: <span style="color:${matchData.marketChangePercent > 0 ? '#00ffaa' : '#ff5050'}">
                    ${matchData.marketChangePercent > 0 ? '+' : ''}${matchData.marketChangePercent}%</span>.
                </span>
            `;
            aiText.style.borderLeft = `2px solid ${similarity > 80 ? '#00ffaa' : '#8899a6'}`;
            aiText.style.paddingLeft = '8px';
        } else {
            // Fallback: show current conditions
            aiText.innerHTML = `
                <span style="color:var(--text-faint); font-size:0.75em; display:block; margin-bottom:4px;">
                    CURRENT STATE
                </span>
                <span style="color:var(--text-main); font-size:0.9em; display:block; line-height:1.5;">
                    <strong style="color:${fg < 40 ? '#ff5050' : fg > 60 ? '#00ffaa' : '#ffcc00'}">${mood}</strong> regime. 
                    Change: <span style="color:${change > 0 ? '#00ffaa' : '#ff5050'}">${change > 0 ? '+' : ''}${change}%</span>
                </span>
            `;
            aiText.style.borderLeft = '2px solid #8899a6';
            aiText.style.paddingLeft = '8px';
        }
    }

    updateVisuals(data) {
        if (!this.mask) {
            try { this.mask = Mask.getInstance(); }
            catch (e) { console.warn("Mask instance not ready yet", e); }
        }
        if (this.mask && this.mask.updateVisualization) {
            console.log('[AppController] Updating mask visualization with data:', data.date);
            this.mask.updateVisualization(data);
        } else {
            console.warn('[AppController] Mask not available for visualization update');
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
            const val = data.indexValue !== undefined ? data.indexValue : 0;
            document.getElementById('val-index').textContent = val.toLocaleString(undefined, { maximumFractionDigits: 2 });
            const valChange = document.getElementById('val-change');
            if (valChange) {
                // Rounding to 2 decimal places
                const change = parseFloat(data.marketChangePercent || 0).toFixed(2);
                valChange.textContent = (data.marketChangePercent > 0 ? '+' : '') + change + '%';
                valChange.className = 'change-pill ' + (data.marketChangePercent > 0 ? 'positive' : 'negative');
            }
        }

        // 2. S&P 500 (Main)
        if (document.getElementById('val-sp500')) {
            const val = data.sp500Value !== undefined ? data.sp500Value : 0;
            document.getElementById('val-sp500').textContent = val.toLocaleString(undefined, { maximumFractionDigits: 2 });
            const spChange = document.getElementById('val-sp500-change');
            if (spChange) {
                const change = parseFloat(data.sp500Change || 0).toFixed(2);
                spChange.textContent = (data.sp500Change > 0 ? '+' : '') + change + '%';
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
            // Round VIX to 2 decimals
            const v = parseFloat(data.vix);
            valVix.textContent = !isNaN(v) ? v.toFixed(2) : '--';

            if (!isNaN(v)) {
                valVix.style.color = v > 20 ? '#ff5050' : (v < 15 ? '#00ffaa' : '#ffffff');
            }
        }

        // 5. 52W Range
        const val52w = document.getElementById('val-52w-range');
        if (val52w) {
            // Round range values
            const low = data.yearLow ? parseFloat(data.yearLow).toFixed(2) : '--';
            const high = data.yearHigh ? parseFloat(data.yearHigh).toFixed(2) : '--';
            val52w.textContent = (data.yearLow && data.yearHigh) ? `${low} - ${high}` : '--';
        }

        // 6. Commodities (Gold/Oil)
        if (document.getElementById('val-gold')) {
            // Gold often doesn't need decimals if > 1000, but consistency is nice. Let's do 1 decimal for gold? 
            // User asked for 2 decimals everywhere potentially? "Round up to 0.01"
            // Let's safe float it.
            const g = parseFloat(data.gold);
            document.getElementById('val-gold').textContent = !isNaN(g) ? g.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '--';
        }
        if (document.getElementById('val-oil')) {
            const o = parseFloat(data.oil);
            document.getElementById('val-oil').textContent = !isNaN(o) ? o.toFixed(2) : '--';
        }

        // --- RESTORED: Main Chart Call ---
        // This draws the big 30D chart in the "MARKET DATA" section
        if (this.drawIndexChart) {
            this.drawIndexChart(data);
        }

        // --- LEFT SIDEBAR UPDATES (Sparklines, Meters) ---

        // 1. Sparklines Data Prep
        // Need to get history for charts. Access this.marketDataService.dataMap
        if (!this.marketDataService.dataMap) return;
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

        // Risk/Reward is now handled by the new #risk-marker code below

        // Mood / Regime Subtitle
        if (this.ui.valSentiment) {
            this.ui.valSentiment.textContent = data.moodState.toUpperCase();

            // Fear/Greed Logic
            const fgIndex = data.fearGreedIndex;
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

        // Fear & Greed Index Display (Left Sidebar) - Show number AND label
        const fgDisplay = document.getElementById('val-fear-greed');
        if (fgDisplay && data.fearGreedIndex !== undefined) {
            const fgIdx = data.fearGreedIndex;
            let fgText = fgIdx;
            let fgClr = "#ffffff";
            if (fgIdx <= 25) { fgText = `${fgIdx} · Extreme Fear`; fgClr = "#ff5050"; }
            else if (fgIdx <= 45) { fgText = `${fgIdx} · Fear`; fgClr = "#ffaa50"; }
            else if (fgIdx <= 55) { fgText = `${fgIdx} · Neutral`; fgClr = "#ffffff"; }
            else if (fgIdx <= 75) { fgText = `${fgIdx} · Greed`; fgClr = "#50ffaa"; }
            else { fgText = `${fgIdx} · Extreme Greed`; fgClr = "#00ffaa"; }
            fgDisplay.textContent = fgText;
            fgDisplay.style.color = fgClr;
        }

        // Macro Intelligence Render
        // Yield Curve
        if (document.getElementById('val-yield-curve')) {
            const yc = parseFloat(data.yieldCurve);
            document.getElementById('val-yield-curve').textContent = !isNaN(yc) ? yc.toFixed(2) + '%' : '--';
        }
        // Dollar Index
        if (document.getElementById('val-dxy')) {
            const dxy = parseFloat(data.dollarIndex);
            document.getElementById('val-dxy').textContent = !isNaN(dxy) ? dxy.toFixed(2) : '--';
        }
        // Dow Jones Row
        if (document.getElementById('val-dow')) {
            const dv = parseFloat(data.dowValue);
            document.getElementById('val-dow').textContent = !isNaN(dv) ? dv.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--';

            const dcEl = document.getElementById('val-dow-change');
            if (dcEl) {
                const dc = parseFloat(data.dowChange);
                if (!isNaN(dc)) {
                    dcEl.textContent = (dc > 0 ? '+' : '') + dc.toFixed(2) + '%';
                    dcEl.className = 'change-pill ' + (dc > 0 ? 'positive' : 'negative');
                } else {
                    dcEl.textContent = '--';
                }
            }
        }


        // Treemap
        this.renderTreemap(data);

        // Breadth
        this.updateMarketBreadth(data);

        // Velocity (Slider at bottom of Intelligence)
        const velMarker = document.getElementById('velocity-marker');
        if (velMarker && data.fearGreedIndex) {
            velMarker.style.left = (data.fearGreedIndex) + "%";
        }

        // Risk/Reward Marker (Sliding bar like Velocity)
        const riskMarker = document.getElementById('risk-marker');
        const riskVal = document.getElementById('risk-val');
        if (riskMarker && data.fearGreedIndex !== undefined) {
            riskMarker.style.left = data.fearGreedIndex + "%";
            // Update label
            if (riskVal) {
                const fg = data.fearGreedIndex;
                if (fg < 40) { riskVal.textContent = "Risk Off"; riskVal.style.color = "#ff5050"; }
                else if (fg > 60) { riskVal.textContent = "Risk On"; riskVal.style.color = "#00ffaa"; }
                else { riskVal.textContent = "Neutral"; riskVal.style.color = "#ffffff"; }
            }
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

        const valDow = document.getElementById('val-dow');
        if (valDow) valDow.textContent = data.dowValue ? parseFloat(data.dowValue).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--';

        const valDowChange = document.getElementById('val-dow-change');
        if (valDowChange) {
            const dc = data.dowChange || 0;
            valDowChange.textContent = (dc > 0 ? '+' : '') + dc + '%';
            valDowChange.className = 'change-pill ' + (dc >= 0 ? 'positive' : 'negative');
        }

        // Draw Charts
        this.ui.currentDataCache = data; // Cache for switching
        this.drawIndexChart(data);
        this.drawYieldCurve(data); // New Function

        // Headline Logic (moved to Right)
        const newsContainer = document.getElementById('headlines-container');
        if (newsContainer && data.headlines) {
            newsContainer.innerHTML = '';
            data.headlines.slice(0, 10).forEach(headline => { // User requested 10
                const isObj = typeof headline === 'object' && headline !== null;
                const text = isObj ? headline.title : headline;
                const link = isObj ? headline.link : '#';
                const p = document.createElement('p');
                p.style.margin = '0';
                p.style.marginBottom = '6px';
                p.innerHTML = `<a href="${link}" target="_blank" rel="noopener noreferrer">${text}</a>`;
                newsContainer.appendChild(p);
            });
        }
    }

    // --- CHART SWAPPING LOGIC ---
    setupEventListeners() {
        if (this.ui.btnToday) {
            this.ui.btnToday.addEventListener('click', () => {
                this.stopPlay();
                this.picker.setDate(new Date(), true);
            });
        }

        // --- NEW: Chart Switching ---
        const charts = ['nasdaq', 'sp500', 'dow'];

        const setChart = (type) => {
            this.activeChart = type;
            // Update Title
            const titleMap = { 'nasdaq': 'NASDAQ', 'sp500': 'S&P 500', 'dow': 'DOW JONES' };
            const titleEl = document.getElementById('chart-title');
            if (titleEl) titleEl.textContent = titleMap[type];

            // Highlight Row
            ['row-nasdaq', 'row-sp500', 'row-dow'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('active-row');
            });
            const activeId = 'row-' + type;
            const activeEl = document.getElementById(activeId);
            if (activeEl) activeEl.classList.add('active-row');

            // Draw
            if (this.ui.currentDataCache) this.drawIndexChart(this.ui.currentDataCache);
        }

        // List Clicks
        document.getElementById('row-nasdaq')?.addEventListener('click', () => setChart('nasdaq'));
        document.getElementById('row-sp500')?.addEventListener('click', () => setChart('sp500'));
        document.getElementById('row-dow')?.addEventListener('click', () => setChart('dow'));

        // Arrows
        document.getElementById('btn-chart-prev')?.addEventListener('click', () => {
            let idx = charts.indexOf(this.activeChart);
            idx = (idx - 1 + charts.length) % charts.length;
            setChart(charts[idx]);
        });
        document.getElementById('btn-chart-next')?.addEventListener('click', () => {
            let idx = charts.indexOf(this.activeChart);
            idx = (idx + 1) % charts.length;
            setChart(charts[idx]);
        });
    }

    drawYieldCurve(data) {
        const canvas = document.getElementById('yield-curve-chart');
        if (!canvas) return;

        // High-DPI fix: scale canvas for retina displays
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const W = rect.width;
        const H = rect.height;
        ctx.clearRect(0, 0, W, H);

        // All maturities from reference: RRP, 1M, 2M, 3M, 4M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y
        const maturities = ['RRP', '1M', '2M', '3M', '4M', '6M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'];

        // Map available data to maturities (interpolate missing)
        const baseRate = data.fiveYearYield || 4.0; // Use 5Y as baseline
        const tenY = data.tenYearYield || baseRate + 0.3;
        const fiveY = data.fiveYearYield || baseRate;
        const thirtyY = data.thirtyYearYield || tenY + 0.3;

        // Estimate rates (typical yield curve shape)
        const shortEnd = baseRate - 0.5; // Short term tends to be lower or inverted
        const longEnd = thirtyY;

        // Create interpolated yield curve
        const rateMap = {
            'RRP': shortEnd - 0.1,
            '1M': shortEnd,
            '2M': shortEnd + 0.05,
            '3M': shortEnd + 0.1,
            '4M': shortEnd + 0.15,
            '6M': shortEnd + 0.25,
            '1Y': fiveY - 0.5,
            '2Y': fiveY - 0.3,
            '3Y': fiveY - 0.15,
            '5Y': fiveY,
            '7Y': (fiveY + tenY) / 2,
            '10Y': tenY,
            '20Y': (tenY + thirtyY) / 2,
            '30Y': thirtyY
        };

        const points = maturities.map(m => ({ maturity: m, val: rateMap[m] }));

        // Get Min/Max with padding
        const vals = points.map(p => p.val);
        const minVal = Math.min(...vals) - 0.2;
        const maxVal = Math.max(...vals) + 0.2;
        const range = maxVal - minVal || 1;

        const padding = { left: 25, right: 10, top: 15, bottom: 20 };
        const chartW = W - padding.left - padding.right;
        const chartH = H - padding.top - padding.bottom;

        // Helper: Get point coordinates
        const getX = (i) => padding.left + (i / (points.length - 1)) * chartW;
        const getY = (val) => padding.top + chartH - ((val - minVal) / range) * chartH;

        // Draw Y-axis grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(W - padding.right, y);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Draw smooth bezier curve
        ctx.beginPath();
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Cardinal spline for smooth curve
        for (let i = 0; i < points.length; i++) {
            const x = getX(i);
            const y = getY(points[i].val);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                // Quadratic bezier for smoothness
                const prevX = getX(i - 1);
                const prevY = getY(points[i - 1].val);
                const cpX = (prevX + x) / 2;
                ctx.quadraticCurveTo(prevX + (x - prevX) * 0.5, prevY, cpX, (prevY + y) / 2);
                ctx.quadraticCurveTo(cpX, y, x, y);
            }
        }
        ctx.stroke();

        // Draw gradient fill under curve
        const gradient = ctx.createLinearGradient(0, padding.top, 0, H);
        gradient.addColorStop(0, 'rgba(0, 255, 204, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 255, 204, 0)');

        ctx.lineTo(getX(points.length - 1), H);
        ctx.lineTo(getX(0), H);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw data points
        ctx.fillStyle = '#00ffcc';
        points.forEach((p, i) => {
            const x = getX(i);
            const y = getY(p.val);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw maturity labels (every other for space)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '10px "Space Mono", monospace';
        ctx.textAlign = 'center';
        points.forEach((p, i) => {
            if (i % 2 === 0 || i === points.length - 1) { // Show every other + last
                const x = getX(i);
                ctx.fillText(p.maturity, x, H - 3);
            }
        });

        // Y-axis labels
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '10px "Space Mono", monospace';
        ctx.fillText(maxVal.toFixed(1) + '%', padding.left - 3, padding.top + 4);
        ctx.fillText(minVal.toFixed(1) + '%', padding.left - 3, H - padding.bottom);

        // Inverted curve indicator
        if (points[0].val > points[points.length - 1].val) {
            ctx.fillStyle = '#ff5050';
            ctx.font = 'bold 10px "Space Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillText('⚠ INVERTED', W - padding.right, padding.top);
        }
    }

    drawIndexChart(currentData) {
        if (!currentData) return;
        this.currentData = currentData; // Save for redraws

        const canvas = document.getElementById('market-chart');
        if (!canvas || !this.marketDataService.dataMap) return;

        // Select Data based on activeChart
        let valueKey = 'indexValue';
        if (this.activeChart === 'sp500') valueKey = 'sp500Value';
        if (this.activeChart === 'dow') valueKey = 'dowValue';

        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // ... (Existing Draw Logic adapted for valueKey) ...
        const dates = Object.keys(this.marketDataService.dataMap).sort();
        const endIdx = dates.indexOf(currentData.date);
        if (endIdx === -1) return;

        // Pick Data Source based on Active Chart
        const startIdx = Math.max(0, endIdx - 30); // 30 Day view
        const slice = dates.slice(startIdx, endIdx + 1);

        let values = [];
        if (this.activeChart === 'sp500') {
            values = slice.map(k => this.marketDataService.dataMap[k].sp500Value);
        } else if (this.activeChart === 'dow') {
            values = slice.map(k => this.marketDataService.dataMap[k].dowValue || 0);
        } else {
            values = slice.map(k => this.marketDataService.dataMap[k].indexValue);
        }

        if (values.length < 2) return;

        // Normalize for sparkline
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;

        ctx.beginPath();
        const color = values[values.length - 1] >= values[0] ? '#00ffaa' : '#ff5050';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        // Gradient fill
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;

        // Draw Fill
        ctx.moveTo(0, H);
        values.forEach((v, i) => {
            const x = (i / (values.length - 1)) * W;
            const y = H - ((v - min) / range) * H * 0.8 - (H * 0.1); // 10% padding
            ctx.lineTo(x, y);
        });
        ctx.lineTo(W, H);
        ctx.globalAlpha = 0.2;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Draw Line
        ctx.beginPath();
        values.forEach((v, i) => {
            const x = (i / (values.length - 1)) * W;
            const y = H - ((v - min) / range) * H * 0.8 - (H * 0.1);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }
}
