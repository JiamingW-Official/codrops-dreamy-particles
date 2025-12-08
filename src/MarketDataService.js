export default class MarketDataService {
    constructor() {
        this.dataMap = null;
        this.init();
    }

    async init() {
        try {
            const response = await fetch('./data/market_data.json');
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

        const dateKey = date.toISOString().split('T')[0];

        let data = this.dataMap[dateKey];
        if (!data) {
            // If exact date missing (weekend/holiday), try to find closest previous date
            // Simple fallback: just return mock or "Data Unavailable"
            // Better: Let's search back 3 days
            for (let i = 1; i <= 3; i++) {
                const prevDate = new Date(date);
                prevDate.setDate(date.getDate() - i);
                const prevKey = prevDate.toISOString().split('T')[0];
                if (this.dataMap[prevKey]) {
                    data = this.dataMap[prevKey];
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
            volatility: 0.2
        };
    }
}
