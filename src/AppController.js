
import MarketDataService from './MarketDataService.js';
import Mask from '../webgl/Mask.js';
import flatpickr from 'flatpickr';

class AppController {
    constructor() {
        this.marketDataService = new MarketDataService();
        this.mask = null;
        this.picker = null;

        this.ui = {
            datePickerInput: document.getElementById('date-picker'),
            btnToday: document.getElementById('btn-today'),
            marketInfo: document.getElementById('market-info'),
            valSentiment: document.getElementById('val-sentiment'),
            valFearGreed: document.getElementById('val-fear-greed'),
            valVix: document.getElementById('val-vix'),
            headlinesContainer: document.getElementById('headlines-container')
        };

        this.init();
    }

    async init() {
        // Wait for service to load data first, so we know what dates are valid
        await this.marketDataService.init(); // note: ensure init returns promise or checks readiness

        // Get valid dates from service
        const validDates = Object.keys(this.marketDataService.dataMap || {});
        const todayStr = new Date().toISOString().split('T')[0];

        // Initialize Flatpickr
        this.picker = flatpickr(this.ui.datePickerInput, {
            dateFormat: "Y-m-d",
            maxDate: "today",
            defaultDate: "today",
            theme: "dark",
            disable: [
                (date) => {
                    // Disable if date is NOT in our dataMap (e.g. weekends/holidays)
                    // We formatted keys as YYYY-MM-DD
                    const dateKey = date.toISOString().split('T')[0];
                    return !this.marketDataService.dataMap[dateKey];
                }
            ],
            onChange: (selectedDates, dateStr, instance) => {
                this.loadDate(selectedDates[0]);
            }
        });

        this.setupEventListeners();

        // Initial load for today (or last valid day)
        // If today is Sunday, flatpickr defaultDate might pick it, but our disable rule flags it.
        // We should explicitly set to the last valid key in our map.
        const lastValidDate = validDates.sort().pop() || todayStr;
        this.picker.setDate(lastValidDate, true); // true = triggers onChange
    }

    setupEventListeners() {
        // Flatpickr handles change event nicely.
        // Btn Today needs to use picker API
        this.ui.btnToday.addEventListener('click', () => {
            this.picker.setDate(new Date(), true);
        });
    }


    loadDate(date) {
        // Attempt to get data. If missing (weekend/holiday), find nearest previous.
        const originalDateStr = date.toISOString().split('T')[0];
        let data = this.marketDataService.getDataForDate(date);

        let isClosed = false;
        let showedDateStr = data.date; // Always use the date from the data object

        if (data.date !== originalDateStr) {
            // Data returned is from a different date (weekend fallback)
            isClosed = true;
        }

        this.updateUI(data, isClosed, originalDateStr);
        this.updateVisuals(data);
    }

    updateUI(data, isClosed, requestedDateStr) {
        // Market Status
        const statusEl = document.getElementById('market-status');
        if (isClosed) {
            statusEl.classList.remove('hidden');
            statusEl.textContent = `Market Closed on ${requestedDateStr}. Data from ${data.date}`;
        } else {
            statusEl.classList.add('hidden');
        }

        // Nasdaq
        const valIndex = document.getElementById('val-index');
        valIndex.textContent = data.indexValue.toLocaleString();
        const valChange = document.getElementById('val-change');
        valChange.textContent = (data.marketChangePercent > 0 ? '+' : '') + data.marketChangePercent + '%';
        valChange.className = 'change-pill ' + (data.marketChangePercent >= 0 ? 'positive' : 'negative');

        // S&P 500
        const valSP500 = document.getElementById('val-sp500');
        valSP500.textContent = data.sp500Value ? data.sp500Value.toLocaleString() : '--';
        const valSPChange = document.getElementById('val-sp500-change');
        if (data.sp500Change) {
            valSPChange.textContent = (data.sp500Change > 0 ? '+' : '') + data.sp500Change + '%';
            valSPChange.className = 'change-pill ' + (data.sp500Change >= 0 ? 'positive' : 'negative');
        } else {
            valSPChange.textContent = '--%';
        }

        // Info Panel
        this.ui.marketInfo.classList.remove('hidden');

        // Sentiment
        let sentimentText = 'Neutral';
        let sentimentColor = '#cfd8dc'; // var(--text-muted)
        if (data.sentiment > 0.2) { sentimentText = 'Bullish'; sentimentColor = '#00ffaa'; }
        else if (data.sentiment < -0.2) { sentimentText = 'Bearish'; sentimentColor = '#ff5050'; }

        this.ui.valSentiment.textContent = sentimentText;
        this.ui.valSentiment.style.color = sentimentColor;

        // Fear & Greed
        this.ui.valFearGreed.textContent = data.fearGreedIndex;
        // Color scale
        let fgColor = '#fff';
        if (data.fearGreedIndex < 25) fgColor = '#ff5050';
        else if (data.fearGreedIndex < 45) fgColor = '#ffcc00';
        else if (data.fearGreedIndex > 75) fgColor = '#00ffaa';
        else if (data.fearGreedIndex > 55) fgColor = '#80cbc4';

        this.ui.valFearGreed.style.color = fgColor;

        // VIX
        this.ui.valVix.textContent = data.vix;
        this.ui.valVix.style.color = data.vix > 25 ? '#ff5050' : '#ffffff';

        // Headlines
        this.ui.headlinesContainer.innerHTML = '';
        data.headlines.forEach(headline => {
            // Check if it's an object with link or just string (backward compat)
            const isObj = typeof headline === 'object' && headline !== null;
            const text = isObj ? headline.title : headline;
            const link = isObj ? headline.link : '#';

            const p = document.createElement('p'); // Wrapper
            p.style.margin = '0';

            const a = document.createElement('a');
            a.textContent = text;
            if (link && link !== '#') {
                a.href = link;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
            } else {
                a.style.pointerEvents = 'none'; // Not clickable if no link
                a.style.textDecoration = 'none';
                a.style.color = 'rgba(255,255,255,0.7)';
            }

            p.appendChild(a);
            this.ui.headlinesContainer.appendChild(p);
        });

        // Sources
        const existingSource = this.ui.marketInfo.querySelector('.sources');
        if (existingSource) existingSource.remove();

        if (data.sources) {
            const sourceDiv = document.createElement('div');
            sourceDiv.className = 'sources';
            sourceDiv.style.fontSize = '0.7em';
            sourceDiv.style.opacity = '0.5';
            sourceDiv.style.marginTop = '1rem';
            sourceDiv.style.borderTop = '1px solid rgba(255,255,255,0.1)';
            sourceDiv.style.paddingTop = '0.5rem';
            sourceDiv.textContent = 'Data Sources: ' + data.sources[0] + ', ' + data.sources[1];
            this.ui.marketInfo.appendChild(sourceDiv);
        }
    }

    updateVisuals(data) {
        // We need to access the Mask instance. It might not be ready immediately on page load, 
        // but by the time user clicks, it should be.
        if (!this.mask) {
            try {
                this.mask = Mask.getInstance();
            } catch (e) {
                console.warn("Mask instance not ready yet");
            }
        }

        if (this.mask && this.mask.updateVisualization) {
            this.mask.updateVisualization(data);
        } else if (this.mask) {
            console.warn("Mask.updateVisualization method is missing!");
        }
    }
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for other things to settle? Not strictly necessary if modules load in order.
    // Creating instance immediately.
    window.appController = new AppController();
});
