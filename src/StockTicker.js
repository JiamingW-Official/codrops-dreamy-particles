export default class StockTicker {
    constructor(marketDataService) {
        this.marketDataService = marketDataService;
        const wrapper = document.getElementById('stock-ticker-wrapper');
        this.container = wrapper?.querySelector('#stock-ticker');
        this.content = this.container?.querySelector('.stock-ticker-content');
        this.currentDate = null;
        this.stocks = this.getTopTechStocks();
    }

    getTopTechStocks() {
        // Top 20 most traded tech stocks including MAG 7
        return [
            { symbol: 'AAPL', name: 'Apple Inc.' },
            { symbol: 'MSFT', name: 'Microsoft' },
            { symbol: 'GOOGL', name: 'Alphabet' },
            { symbol: 'AMZN', name: 'Amazon' },
            { symbol: 'NVDA', name: 'NVIDIA' },
            { symbol: 'META', name: 'Meta' },
            { symbol: 'TSLA', name: 'Tesla' },
            { symbol: 'AMD', name: 'AMD' },
            { symbol: 'INTC', name: 'Intel' },
            { symbol: 'ORCL', name: 'Oracle' },
            { symbol: 'CRM', name: 'Salesforce' },
            { symbol: 'ADBE', name: 'Adobe' },
            { symbol: 'NFLX', name: 'Netflix' },
            { symbol: 'AVGO', name: 'Broadcom' },
            { symbol: 'QCOM', name: 'Qualcomm' },
            { symbol: 'CSCO', name: 'Cisco' },
            { symbol: 'NOW', name: 'ServiceNow' },
            { symbol: 'PANW', name: 'Palo Alto' },
            { symbol: 'SNPS', name: 'Synopsys' },
            { symbol: 'CRWD', name: 'CrowdStrike' }
        ];
    }

    generateStockData(marketData) {
        if (!marketData) return null;

        // Use real stock prices from market data if available
        const stockPrices = marketData.stockPrices || {};
        
        return this.stocks.map((stock) => {
            const stockData = stockPrices[stock.symbol];
            
            if (stockData && stockData.price && stockData.price > 0) {
                // Use real historical data
                return {
                    ...stock,
                    price: stockData.price,
                    changePercent: stockData.changePercent || 0,
                    change: stockData.price * (stockData.changePercent || 0) / 100
                };
            } else {
                // Fallback: Generate synthetic data if real data not available
                const baseChange = marketData.marketChangePercent || 0;
                const volatility = marketData.vix ? marketData.vix / 20 : 1;
                
                // Base price ranges (realistic for these stocks)
                const basePrices = {
                    'AAPL': 180, 'MSFT': 380, 'GOOGL': 140, 'AMZN': 150,
                    'NVDA': 500, 'META': 350, 'TSLA': 250, 'AMD': 120,
                    'INTC': 45, 'ORCL': 120, 'CRM': 250, 'ADBE': 550,
                    'NFLX': 450, 'AVGO': 1200, 'QCOM': 150, 'CSCO': 55,
                    'NOW': 700, 'PANW': 300, 'SNPS': 500, 'CRWD': 300
                };

                const basePrice = basePrices[stock.symbol] || 100;
                const stockVariation = (Math.random() - 0.5) * 0.5;
                let changePercent = baseChange + stockVariation * volatility;
                const price = basePrice * (1 + changePercent / 100);

                return {
                    ...stock,
                    price: price,
                    changePercent: changePercent,
                    change: price - basePrice
                };
            }
        });
    }

    updateTicker(marketData) {
        if (!this.content) return;

        const stockData = this.generateStockData(marketData);
        if (!stockData) return;

        // Clear existing content and stop animation
        this.content.innerHTML = '';
        this.content.style.animation = 'none';

        // Force reflow to reset animation
        void this.content.offsetWidth;

        // Create duplicate set for seamless loop (need 2 copies for smooth infinite scroll)
        const stockItems = [...stockData, ...stockData].map(stock => {
            const item = document.createElement('div');
            item.className = 'stock-ticker-item';

            const isPositive = stock.changePercent >= 0;
            const changeClass = isPositive ? 'positive' : 'negative';
            const triangleClass = isPositive ? 'up' : 'down';
            const changeSign = isPositive ? '+' : '';

            item.innerHTML = `
                <span class="stock-ticker-symbol">${stock.symbol}</span>
                <span class="stock-ticker-price">$${stock.price.toFixed(2)}</span>
                <span class="stock-ticker-change ${changeClass}">
                    <span class="stock-ticker-triangle ${triangleClass}"></span>
                    ${changeSign}${stock.changePercent.toFixed(2)}%
                </span>
            `;

            return item;
        });

        stockItems.forEach(item => this.content.appendChild(item));

        // Restart animation with faster speed
        this.content.style.animation = 'ticker-scroll 30s linear infinite';
    }

    updateDate(date, marketData) {
        this.currentDate = date;
        this.updateTicker(marketData);
    }
}

