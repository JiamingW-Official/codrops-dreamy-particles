export default class MarketDataService {
    constructor() {
        this.dataMap = null;
        // Don't auto-init. Let the controller await it.
    }

    async init() {
        try {
            // Use absolute path with cache-busting to prevent 404s on new data
            const response = await fetch('/data/market_data.json?v=' + new Date().getTime());
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.dataMap = await response.json();
            console.log("Market Data Loaded:", Object.keys(this.dataMap).length, "days");
        } catch (e) {
            console.error("Failed to load market data:", e);
        }
    }

    /**
     * Retrieves real market data for a specific date.
     * @param {Date} date 
     * @returns {Object} Market data object or null if not ready/found
     */
    getDataForDate(date) {
        if (!this.dataMap) {
            console.warn("Market data not loaded yet.");
            return this.getMockFallback(date); // Fallback while loading
        }

        // Fix: Use local date generation (same as AppController) to match keys
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;

        // Debug
        // console.log(`[Service] Lookup Key: ${dateKey}`);

        let data = this.dataMap[dateKey];
        if (!data) {
            // If exact date missing (weekend/holiday), try to find closest previous date
            // Simple fallback: just return mock or "Data Unavailable"
            // Better: Let's search back 5 days (cover long weekends + holidays)
            for (let i = 1; i <= 5; i++) {
                const prevDate = new Date(date);
                prevDate.setDate(date.getDate() - i);

                const pYear = prevDate.getFullYear();
                const pMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
                const pDay = String(prevDate.getDate()).padStart(2, '0');
                const prevKey = `${pYear}-${pMonth}-${pDay}`;

                if (this.dataMap[prevKey]) {
                    data = this.dataMap[prevKey];
                    // console.log(`[Service] Fallback found: ${prevKey}`);
                    break;
                }
            }
        }

        if (data) return data;
        return this.getMockFallback(date);
    }

    getMockFallback(date) {
        // Simple fallback if JSON fails or date is way out of range
        return {
            date: date.toISOString().split('T')[0],
            fearGreedIndex: 50,
            sentiment: 0,
            marketChangePercent: 0,
            headlines: ["Data unavailable for this date", "Please check fetch_data.py"],
            volatility: 0.2,
            vix: 20,
            indexValue: 0,
            sp500Value: 0,
            volume: 0,
            dayHigh: 0,
            dayLow: 0,
            yearHigh: 0,
            yearLow: 0,
            sectorStat: 0,
            rsi: 50,
            tenYearYield: 4.0,
            moodState: "Neutral",
            regime: "Data Missing"
        };
    }
}
