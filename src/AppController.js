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
            valSentiment: document.getElementById('val-sentiment'),
            valFearGreed: document.getElementById('val-fear-greed'),
            valVix: document.getElementById('val-vix'),
            headlinesContainer: document.getElementById('headlines-container')
        };

        this.init();
    }

    async init() {
        // Wait for service to load data first, so we know what dates are valid
        await this.marketDataService.init();

        // Get valid dates from service
        const validDates = Object.keys(this.marketDataService.dataMap || {});

        // If no data loaded, we can't really proceed with correct dating, but we should verify.
        if (validDates.length === 0) {
            console.error("Critical: No market data found for calendar.");
        }

        const todayStr = new Date().toISOString().split('T')[0];

        // Initialize Flatpickr
        this.picker = flatpickr(this.ui.datePickerInput, {
            dateFormat: "Y-m-d",
            // maxDate: "today", // Allow future just in case our data is ahead (timezone) or testing
            defaultDate: validDates.sort().pop() || "today", // Default to last available data
            theme: "dark",
            disable: [
                (date) => {
                    // Disable if date is NOT in our dataMap (e.g. weekends/holidays)
                    // We formatted keys as YYYY-MM-DD
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const dateKey = `${year}-${month}-${day}`;

                    if (!this.marketDataService.dataMap) return true;
                    return !this.marketDataService.dataMap[dateKey];
                }
            ],
            onChange: (selectedDates, dateStr, instance) => {
                if (selectedDates.length > 0) {
                    this.loadDate(selectedDates[0]);
                }
            }
        });

        this.setupEventListeners();

        // Initial load for today (or last valid day)
        // If today is Sunday, flatpickr defaultDate might pick it, but our disable rule flags it.
        // We should explicitly set to the last valid key in our map.
        const lastValidDate = validDates.sort().pop();
        if (lastValidDate) {
            this.picker.setDate(lastValidDate, true); // true = triggers onChange
            console.log(`[Controller] Initializing to last valid date: ${lastValidDate}`);
        } else {
            console.warn("[Controller] No valid dates found. Initializing to today.");
            this.loadDate(new Date());
        }
    }

    setupEventListeners() {
        // Flatpickr handles change event nicely.
        // Btn Today needs to use picker API
        this.ui.btnToday.addEventListener('click', () => {
            this.picker.setDate(new Date(), true);
        });
    }


    loadDate(date) {
        // Fix: Use local date string instead of UTC to avoid timezone shifts
        // date is a JS Date object from Flatpickr (which is 00:00 local time usually)
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const originalDateStr = `${year}-${month}-${day}`;

        console.log(`[Debug] Requested Date: ${originalDateStr}`);

        let data = this.marketDataService.getDataForDate(date);
        console.log(`[Debug] Data Found For: ${data.date}`);

        let isClosed = false;

        // Data service might return data for a different date if the requested one is empty
        // We compare the date strings
        if (data.date !== originalDateStr) {
            console.warn(`[Debug] Mismatch! Requested ${originalDateStr} but got ${data.date}. Flagging as Closed.`);
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
                a.style.cursor = 'pointer';
            } else {
                a.href = "https://news.google.com/search?q=" + encodeURIComponent(text + " stock market");
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                a.style.cursor = 'pointer';
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
