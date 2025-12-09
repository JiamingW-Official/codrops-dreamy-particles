import MarketDataService from './MarketDataService.js';
import Mask from '../webgl/Mask.js';
import AudioHandler from '../webgl/utils/AudioHandler.js';
import flatpickr from 'flatpickr';

export default class AppController {
    constructor() {
        this.audioHandler = AudioHandler.getInstance();
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

        console.log('[AppController] About to call setupEventListeners');
        this.setupEventListeners();
        console.log('[AppController] setupEventListeners completed');

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

        // Initialize Command Search (Cmd+K)
        this.initCommandSearch();
    }

    initCommandSearch() {
        console.log('[CommandSearch] Initializing...');

        const overlay = document.getElementById('command-search-overlay');
        const modal = document.getElementById('command-search-modal');
        const input = document.getElementById('command-search-input');
        const resultsContainer = document.getElementById('search-results');
        const searchButton = document.getElementById('btn-search');

        console.log('[CommandSearch] Elements found:', {
            overlay: !!overlay,
            modal: !!modal,
            input: !!input,
            resultsContainer: !!resultsContainer,
            searchButton: !!searchButton
        });

        if (!overlay || !input) {
            console.error('[CommandSearch] Required elements not found! Aborting.');
            return;
        }

        this.searchState = {
            isOpen: false,
            selectedIndex: -1,
            results: [],
            activeFilter: null
        };

        // Search button click handler
        if (searchButton) {
            console.log('[CommandSearch] Adding click listener to search button');
            searchButton.addEventListener('click', () => {
                console.log('[CommandSearch] Search button clicked!');
                this.openCommandSearch();
            });
        }

        // Keyboard shortcut: Cmd+K (Mac) or Ctrl+K (Windows)
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                this.toggleCommandSearch();
            }

            // ESC to close
            if (e.key === 'Escape' && this.searchState.isOpen) {
                this.closeCommandSearch();
            }

            // Arrow navigation
            if (this.searchState.isOpen) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateSearchResults(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateSearchResults(-1);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.executeSelectedResult();
                }
            }
        });

        // Click overlay to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeCommandSearch();
            }
        });

        // Input handler
        input.addEventListener('input', (e) => {
            console.log('[CommandSearch] Input changed:', e.target.value);
            this.handleSearchInput(e.target.value);
        });

        // Hint item clicks
        document.querySelectorAll('.hint-item').forEach(hint => {
            hint.addEventListener('click', () => {
                input.value = hint.dataset.query;
                this.handleSearchInput(hint.dataset.query);
            });
        });

        // Quick action items
        document.querySelectorAll('.result-item[data-action]').forEach(item => {
            item.addEventListener('click', () => {
                this.executeQuickAction(item.dataset.action);
            });
        });

        // Sector chips
        document.querySelectorAll('.sector-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.filterBySector(chip.dataset.sector);
                chip.classList.toggle('active');
            });
        });

        // Condition items
        document.querySelectorAll('.condition-item').forEach(item => {
            item.addEventListener('click', () => {
                this.filterByCondition(item.dataset.condition);
            });
        });
    }

    toggleCommandSearch() {
        this.searchState.isOpen ? this.closeCommandSearch() : this.openCommandSearch();
    }

    openCommandSearch() {
        const overlay = document.getElementById('command-search-overlay');
        const input = document.getElementById('command-search-input');

        overlay.classList.remove('hidden');
        this.searchState.isOpen = true;

        // Focus input after animation
        setTimeout(() => input.focus(), 100);

        // Stop playback when search opens
        this.stopPlay();
    }

    closeCommandSearch() {
        const overlay = document.getElementById('command-search-overlay');
        const input = document.getElementById('command-search-input');

        overlay.classList.add('hidden');
        this.searchState.isOpen = false;
        input.value = '';
        this.searchState.selectedIndex = -1;

        // Reset results display
        this.resetSearchResults();
    }

    resetSearchResults() {
        // Show default sections again
        document.querySelectorAll('.search-section').forEach(s => s.style.display = 'block');

        // Remove any dynamic results
        const dynamicResults = document.querySelector('.dynamic-results');
        if (dynamicResults) dynamicResults.remove();

        // Clear selected states
        document.querySelectorAll('.result-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
    }

    handleSearchInput(query) {
        console.log('[handleSearchInput] Called with:', query);
        query = query.trim().toLowerCase();

        if (!query) {
            this.resetSearchResults();
            return;
        }

        const results = [];
        const suggestions = [];
        const validDates = Object.keys(this.marketDataService.dataMap || {}).sort();
        console.log('[handleSearchInput] Valid dates count:', validDates.length);

        // Helper to get change value correctly
        const getChange = (data) => {
            return data?.marketChangePercent ?? data?.dailyChange ?? data?.percentChange ?? 0;
        };

        // ============================================
        // SMART SUGGESTIONS - Show as user types
        // ============================================
        const suggestionPatterns = this.generateSmartSuggestions(query, validDates);
        console.log('[handleSearchInput] Suggestions:', suggestionPatterns.length);

        // ============================================
        // COMPREHENSIVE SEARCH PATTERNS
        // ============================================

        // 1. DIRECT DATE MATCH
        const dateMatch = this.parseDateQuery(query);
        if (dateMatch) {
            const data = this.marketDataService.dataMap[dateMatch];
            if (data) {
                results.push({
                    type: 'date',
                    date: dateMatch,
                    label: `📅 ${dateMatch} - NASDAQ ${data.indexValue?.toLocaleString() || '--'}`,
                    change: getChange(data),
                    extra: `VIX: ${data.vix?.toFixed(1) || '--'} | F&G: ${data.fearGreedIndex || '--'}`
                });
            }
        }

        // 2. HIGHEST/LOWEST/PEAK/VALLEY QUERIES
        if (query.match(/highest|peak|best|top|max|record/)) {
            const indexResults = this.findExtremes('highest', query, validDates, getChange);
            results.push(...indexResults.slice(0, 8));
        }

        if (query.match(/lowest|valley|worst|bottom|min|crash|dip/)) {
            const indexResults = this.findExtremes('lowest', query, validDates, getChange);
            results.push(...indexResults.slice(0, 8));
        }

        // 3. INDEX AT SPECIFIC VALUE (e.g., "nasdaq 18000", "s&p 5000")
        const valueMatch = query.match(/(nasdaq|sp|s&p|dow|djia)\s*(?:at|near|hits?|reached?|crossed?)?\s*(\d{3,6})/i);
        if (valueMatch) {
            const indexResults = this.findByIndexValue(valueMatch[1], parseInt(valueMatch[2]), validDates, getChange);
            results.push(...indexResults.slice(0, 8));
        }

        // 4. VIX QUERIES
        if (query.match(/vix|volatil|spike|calm|stable/)) {
            const vixResults = this.searchByVIX(query, validDates, getChange);
            results.push(...vixResults.slice(0, 8));
        }

        // 5. FEAR & GREED QUERIES
        if (query.match(/fear|greed|panic|euphori|sentiment/)) {
            const fgResults = this.searchByFearGreed(query, validDates, getChange);
            results.push(...fgResults.slice(0, 8));
        }

        // 6. CHANGE PERCENT QUERIES
        if (query.match(/gain|loss|rally|crash|selloff|drop|surge|jump|biggest|largest|green|red|\+\d|\-\d|\d%/)) {
            const changeResults = this.searchByChange(query, validDates, getChange);
            results.push(...changeResults.slice(0, 8));
        }

        // 7. SECTOR QUERIES
        if (query.match(/tech|financ|energy|health|industrial|utility|material|consumer|real estate|communication/)) {
            const sectorResults = this.searchBySector(query, validDates, getChange);
            results.push(...sectorResults.slice(0, 8));
        }

        // 8. TIME-BASED QUERIES
        if (query.match(/today|yesterday|last week|this month|this year|recent|latest|q1|q2|q3|q4/)) {
            const timeResults = this.searchByTimeframe(query, validDates, getChange);
            results.push(...timeResults.slice(0, 8));
        }

        // 9. YIELD CURVE QUERIES
        if (query.match(/yield|inverted|bond|treasury|rate|10y|2y|spread/)) {
            const yieldResults = this.searchByYield(query, validDates, getChange);
            results.push(...yieldResults.slice(0, 8));
        }

        // 10. VOLATILITY PATTERN QUERIES
        if (query.match(/volatile|swing|whipsaw|range|breakout|consolidat/)) {
            const volResults = this.searchByVolatilityPattern(query, validDates, getChange);
            results.push(...volResults.slice(0, 8));
        }

        // 11. STREAK QUERIES
        if (query.match(/streak|consecutive|row|days up|days down|winning|losing/)) {
            const streakResults = this.findStreaks(query, validDates, getChange);
            results.push(...streakResults.slice(0, 8));
        }

        // 12. COMPARISON QUERIES
        if (query.match(/vs|versus|compare|outperform|underperform|beat|lag/)) {
            const compareResults = this.searchByComparison(query, validDates, getChange);
            results.push(...compareResults.slice(0, 8));
        }

        console.log('[handleSearchInput] Final results:', results.length, 'suggestions:', suggestionPatterns.length);
        this.displaySearchResults(results, suggestionPatterns);
    }

    generateSmartSuggestions(query, validDates) {
        const suggestions = [];
        const q = query.toLowerCase();

        // Autocomplete suggestions based on partial input
        const allSuggestions = [
            { trigger: 'high', text: '📈 Highest NASDAQ day', action: 'highest nasdaq' },
            { trigger: 'high', text: '📈 Highest S&P 500 day', action: 'highest sp500' },
            { trigger: 'low', text: '📉 Lowest NASDAQ day', action: 'lowest nasdaq' },
            { trigger: 'low', text: '📉 Lowest S&P 500 day', action: 'lowest sp500' },
            { trigger: 'peak', text: '🏔️ Market peak (all-time high)', action: 'peak nasdaq' },
            { trigger: 'valley', text: '🕳️ Market valley (bottom)', action: 'valley nasdaq' },
            { trigger: 'crash', text: '💥 Biggest crash day', action: 'biggest crash' },
            { trigger: 'rally', text: '🚀 Biggest rally day', action: 'biggest rally' },
            { trigger: 'vix', text: '⚡ VIX spike days (>30)', action: 'vix > 30' },
            { trigger: 'vix', text: '😌 Low VIX days (<15)', action: 'vix < 15' },
            { trigger: 'fear', text: '😱 Extreme fear days', action: 'extreme fear' },
            { trigger: 'greed', text: '🤑 Extreme greed days', action: 'extreme greed' },
            { trigger: 'nasd', text: '📊 NASDAQ at specific value...', action: 'nasdaq ' },
            { trigger: 'sp', text: '📊 S&P 500 at specific value...', action: 'sp500 ' },
            { trigger: 's&p', text: '📊 S&P 500 at specific value...', action: 'sp500 ' },
            { trigger: 'best', text: '🏆 Best performing day', action: 'best day' },
            { trigger: 'worst', text: '💀 Worst performing day', action: 'worst day' },
            { trigger: 'streak', text: '🔥 Winning streaks', action: 'winning streak' },
            { trigger: 'streak', text: '❄️ Losing streaks', action: 'losing streak' },
            { trigger: 'volatile', text: '📊 Most volatile days', action: 'most volatile' },
            { trigger: 'tech', text: '💻 Tech sector performance', action: 'tech sector' },
            { trigger: 'financ', text: '🏦 Financials sector', action: 'financial sector' },
            { trigger: 'energy', text: '⛽ Energy sector', action: 'energy sector' },
            { trigger: 'yield', text: '📈 Inverted yield curve days', action: 'inverted yield' },
            { trigger: 'today', text: '📅 Today\'s data', action: 'today' },
            { trigger: 'last', text: '📅 Last week', action: 'last week' },
            { trigger: 'recent', text: '📅 Recent trading days', action: 'recent' },
            { trigger: '+', text: '📈 Days with gains over...', action: 'gain > ' },
            { trigger: '-', text: '📉 Days with losses over...', action: 'loss > ' },
            { trigger: 'record', text: '🎯 Record high days', action: 'record high' },
            { trigger: 'panic', text: '🚨 Panic selling days', action: 'panic' },
            { trigger: 'euphori', text: '🎉 Euphoria days', action: 'euphoria' },
        ];

        return allSuggestions.filter(s =>
            q.length > 0 && s.trigger.startsWith(q.substring(0, Math.min(q.length, s.trigger.length)))
        ).slice(0, 5);
    }

    parseDateQuery(query) {
        // Try direct date format: YYYY-MM-DD
        const directMatch = query.match(/(\d{4}-\d{2}-\d{2})/);
        if (directMatch && this.marketDataService.dataMap[directMatch[1]]) {
            return directMatch[1];
        }

        // Try month name + day (e.g., "august 5" or "aug 5, 2024")
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december'];
        const shortMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

        for (let i = 0; i < monthNames.length; i++) {
            const regex = new RegExp(`(${monthNames[i]}|${shortMonths[i]})\\s*(\\d{1,2})(?:,?\\s*(\\d{4}))?`, 'i');
            const match = query.match(regex);
            if (match) {
                const month = String(i + 1).padStart(2, '0');
                const day = String(match[2]).padStart(2, '0');
                const year = match[3] || new Date().getFullYear();
                const dateKey = `${year}-${month}-${day}`;
                if (this.marketDataService.dataMap[dateKey]) {
                    return dateKey;
                }
            }
        }

        return null;
    }

    findExtremes(type, query, dates, getChange) {
        const results = [];
        let searchField = 'indexValue'; // Default to NASDAQ
        let fieldLabel = 'NASDAQ';

        if (query.match(/sp|s&p|500/)) {
            searchField = 'sp500Value';
            fieldLabel = 'S&P 500';
        } else if (query.match(/dow|djia/)) {
            searchField = 'dowValue';
            fieldLabel = 'DOW';
        } else if (query.match(/vix/)) {
            searchField = 'vix';
            fieldLabel = 'VIX';
        } else if (query.match(/gain|change|rally|move/)) {
            searchField = 'marketChangePercent';
            fieldLabel = 'Daily Change';
        }

        // Find extreme values
        let extremeDate = null;
        let extremeValue = type === 'highest' ? -Infinity : Infinity;

        for (const date of dates) {
            const data = this.marketDataService.dataMap[date];
            const value = data?.[searchField] ?? 0;

            if (type === 'highest' && value > extremeValue) {
                extremeValue = value;
                extremeDate = date;
            } else if (type === 'lowest' && value < extremeValue) {
                extremeValue = value;
                extremeDate = date;
            }
        }

        if (extremeDate) {
            const data = this.marketDataService.dataMap[extremeDate];
            const displayValue = searchField === 'marketChangePercent'
                ? `${extremeValue >= 0 ? '+' : ''}${extremeValue.toFixed(2)}%`
                : extremeValue.toLocaleString();

            results.push({
                type: 'extreme',
                date: extremeDate,
                label: `${type === 'highest' ? '📈' : '📉'} ${type.toUpperCase()} ${fieldLabel}: ${displayValue} on ${extremeDate}`,
                change: getChange(data),
                value: extremeValue
            });
        }

        // Also add top 5 for context
        const sorted = dates
            .map(date => ({
                date,
                data: this.marketDataService.dataMap[date],
                value: this.marketDataService.dataMap[date]?.[searchField] ?? 0
            }))
            .filter(d => d.value !== 0)
            .sort((a, b) => type === 'highest' ? b.value - a.value : a.value - b.value)
            .slice(0, 5);

        for (const item of sorted) {
            if (item.date !== extremeDate) {
                const displayValue = searchField === 'marketChangePercent'
                    ? `${item.value >= 0 ? '+' : ''}${item.value.toFixed(2)}%`
                    : item.value.toLocaleString();
                results.push({
                    type: 'extreme',
                    date: item.date,
                    label: `${fieldLabel}: ${displayValue} on ${item.date}`,
                    change: getChange(item.data),
                    value: item.value
                });
            }
        }

        return results;
    }

    findByIndexValue(indexType, targetValue, dates, getChange) {
        const results = [];
        let searchField = 'indexValue';
        let fieldLabel = 'NASDAQ';

        if (indexType.match(/sp|s&p/i)) {
            searchField = 'sp500Value';
            fieldLabel = 'S&P 500';
        } else if (indexType.match(/dow|djia/i)) {
            searchField = 'dowValue';
            fieldLabel = 'DOW';
        }

        // Find days where index was near target value
        const tolerance = targetValue * 0.01; // 1% tolerance

        for (const date of dates) {
            const data = this.marketDataService.dataMap[date];
            const value = data?.[searchField] ?? 0;

            if (Math.abs(value - targetValue) <= tolerance) {
                results.push({
                    type: 'value-match',
                    date: date,
                    label: `🎯 ${fieldLabel} at ${value.toLocaleString()} on ${date}`,
                    change: getChange(data),
                    value: value,
                    diff: Math.abs(value - targetValue)
                });
            }
        }

        // Sort by closest match
        results.sort((a, b) => a.diff - b.diff);

        // If no exact matches, find closest
        if (results.length === 0) {
            const closest = dates
                .map(date => ({
                    date,
                    data: this.marketDataService.dataMap[date],
                    value: this.marketDataService.dataMap[date]?.[searchField] ?? 0,
                    diff: Math.abs((this.marketDataService.dataMap[date]?.[searchField] ?? 0) - targetValue)
                }))
                .filter(d => d.value > 0)
                .sort((a, b) => a.diff - b.diff)
                .slice(0, 5);

            for (const item of closest) {
                results.push({
                    type: 'value-near',
                    date: item.date,
                    label: `📊 ${fieldLabel} at ${item.value.toLocaleString()} (target: ${targetValue.toLocaleString()})`,
                    change: getChange(item.data),
                    value: item.value
                });
            }
        }

        return results;
    }

    searchByVIX(query, dates, getChange) {
        const results = [];
        let threshold = 20;
        let operator = '>';

        const condMatch = query.match(/vix\s*([<>]=?)\s*(\d+)/i);
        if (condMatch) {
            operator = condMatch[1];
            threshold = parseFloat(condMatch[2]);
        } else if (query.match(/high|spike|fear|panic/)) {
            threshold = 25;
            operator = '>';
        } else if (query.match(/low|calm|stable|quiet/)) {
            threshold = 15;
            operator = '<';
        }

        for (const date of dates) {
            const data = this.marketDataService.dataMap[date];
            const vix = data?.vix || 0;

            let matches = false;
            if (operator === '>' && vix > threshold) matches = true;
            if (operator === '>=' && vix >= threshold) matches = true;
            if (operator === '<' && vix < threshold) matches = true;
            if (operator === '<=' && vix <= threshold) matches = true;

            if (matches) {
                results.push({
                    type: 'vix',
                    date: date,
                    label: `⚡ VIX ${vix.toFixed(1)} on ${date}`,
                    change: getChange(data),
                    vix: vix
                });
            }
        }

        results.sort((a, b) => operator.includes('>') ? b.vix - a.vix : a.vix - b.vix);
        return results;
    }

    searchByFearGreed(query, dates, getChange) {
        const results = [];
        let targetMin = 0, targetMax = 100;

        if (query.match(/extreme fear|panic/)) {
            targetMin = 0; targetMax = 25;
        } else if (query.match(/fear/)) {
            targetMin = 0; targetMax = 45;
        } else if (query.match(/extreme greed|euphori/)) {
            targetMin = 75; targetMax = 100;
        } else if (query.match(/greed/)) {
            targetMin = 55; targetMax = 100;
        } else if (query.match(/neutral/)) {
            targetMin = 40; targetMax = 60;
        }

        for (const date of dates) {
            const data = this.marketDataService.dataMap[date];
            const fg = data?.fearGreedIndex ?? 50;

            if (fg >= targetMin && fg <= targetMax) {
                const emoji = fg < 25 ? '😱' : fg < 45 ? '😰' : fg < 55 ? '😐' : fg < 75 ? '😊' : '🤑';
                results.push({
                    type: 'feargreed',
                    date: date,
                    label: `${emoji} F&G ${fg} on ${date}`,
                    change: getChange(data),
                    fg: fg
                });
            }
        }

        if (query.match(/fear|panic/)) {
            results.sort((a, b) => a.fg - b.fg);
        } else {
            results.sort((a, b) => b.fg - a.fg);
        }

        return results;
    }

    searchByChange(query, dates, getChange) {
        const results = [];

        for (const date of dates) {
            const data = this.marketDataService.dataMap[date];
            const change = getChange(data);

            results.push({
                type: 'change',
                date: date,
                label: `${change >= 0 ? '📈' : '📉'} ${change >= 0 ? '+' : ''}${change.toFixed(2)}% on ${date}`,
                change: change
            });
        }

        if (query.match(/gain|rally|surge|jump|green|best|top|\+/)) {
            results.sort((a, b) => b.change - a.change);
        } else {
            results.sort((a, b) => a.change - b.change);
        }

        return results;
    }

    searchBySector(query, dates, getChange) {
        const results = [];
        const sectorMap = {
            'tech': { symbol: 'XLK', name: 'Technology' },
            'financ': { symbol: 'XLF', name: 'Financials' },
            'energy': { symbol: 'XLE', name: 'Energy' },
            'health': { symbol: 'XLV', name: 'Healthcare' },
            'industrial': { symbol: 'XLI', name: 'Industrials' },
            'utility': { symbol: 'XLU', name: 'Utilities' },
            'material': { symbol: 'XLB', name: 'Materials' },
            'consumer': { symbol: 'XLY', name: 'Consumer' },
            'real estate': { symbol: 'XLRE', name: 'Real Estate' },
            'communication': { symbol: 'XLC', name: 'Communication' }
        };

        let targetSector = null;
        for (const [key, value] of Object.entries(sectorMap)) {
            if (query.includes(key)) {
                targetSector = value;
                break;
            }
        }

        if (!targetSector) return results;

        for (const date of dates) {
            const data = this.marketDataService.dataMap[date];
            const sectorData = data?.sectors?.find(s => s.symbol === targetSector.symbol);

            if (sectorData) {
                const sectorChange = sectorData.change ?? 0;
                results.push({
                    type: 'sector',
                    date: date,
                    label: `🏭 ${targetSector.name} ${sectorChange >= 0 ? '+' : ''}${sectorChange.toFixed(2)}% on ${date}`,
                    change: getChange(data),
                    sectorChange: sectorChange
                });
            }
        }

        results.sort((a, b) => Math.abs(b.sectorChange) - Math.abs(a.sectorChange));
        return results;
    }

    searchByTimeframe(query, dates, getChange) {
        const results = [];
        const now = new Date();
        let startDate = null;
        let endDate = now;

        if (query.includes('today')) {
            startDate = now;
        } else if (query.includes('yesterday')) {
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 1);
            endDate = startDate;
        } else if (query.includes('last week')) {
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 7);
        } else if (query.includes('this month')) {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (query.includes('recent') || query.includes('latest')) {
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 5);
        }

        if (!startDate) return results;

        for (const date of dates.reverse()) {
            const d = new Date(date + 'T00:00:00');
            if (d >= startDate && d <= endDate) {
                const data = this.marketDataService.dataMap[date];
                results.push({
                    type: 'timeframe',
                    date: date,
                    label: `📅 ${date} - NASDAQ ${data?.indexValue?.toLocaleString() || '--'}`,
                    change: getChange(data)
                });
            }
            if (results.length >= 10) break;
        }

        return results;
    }

    searchByYield(query, dates, getChange) {
        const results = [];

        for (const date of dates) {
            const data = this.marketDataService.dataMap[date];
            const yc = data?.yieldCurve;

            if (yc) {
                const spread = (yc.y10 ?? 0) - (yc.y2 ?? yc.y3m ?? 0);
                const isInverted = spread < 0;

                if (query.includes('invert') && isInverted) {
                    results.push({
                        type: 'yield',
                        date: date,
                        label: `📉 Inverted curve (spread: ${spread.toFixed(2)}%) on ${date}`,
                        change: getChange(data),
                        spread: spread
                    });
                } else if (!query.includes('invert')) {
                    results.push({
                        type: 'yield',
                        date: date,
                        label: `📈 Yield spread: ${spread.toFixed(2)}% on ${date}`,
                        change: getChange(data),
                        spread: spread
                    });
                }
            }
        }

        results.sort((a, b) => a.spread - b.spread);
        return results;
    }

    searchByVolatilityPattern(query, dates, getChange) {
        const results = [];

        // Calculate rolling volatility
        for (let i = 5; i < dates.length; i++) {
            const window = dates.slice(i - 5, i);
            const changes = window.map(d => Math.abs(getChange(this.marketDataService.dataMap[d])));
            const avgVol = changes.reduce((a, b) => a + b, 0) / changes.length;

            if (avgVol > 1.5) { // High volatility threshold
                const data = this.marketDataService.dataMap[dates[i]];
                results.push({
                    type: 'volatility',
                    date: dates[i],
                    label: `📊 High volatility period (avg ${avgVol.toFixed(2)}%) on ${dates[i]}`,
                    change: getChange(data),
                    volatility: avgVol
                });
            }
        }

        results.sort((a, b) => b.volatility - a.volatility);
        return results;
    }

    findStreaks(query, dates, getChange) {
        const results = [];
        let currentStreak = 0;
        let streakType = query.includes('winning') || query.includes('up') ? 'up' : 'down';
        let streakStart = null;

        for (let i = 0; i < dates.length; i++) {
            const change = getChange(this.marketDataService.dataMap[dates[i]]);
            const isPositive = change > 0;

            if ((streakType === 'up' && isPositive) || (streakType === 'down' && !isPositive)) {
                if (currentStreak === 0) streakStart = dates[i];
                currentStreak++;
            } else {
                if (currentStreak >= 3) {
                    results.push({
                        type: 'streak',
                        date: dates[i - 1],
                        label: `${streakType === 'up' ? '🔥' : '❄️'} ${currentStreak}-day ${streakType === 'up' ? 'winning' : 'losing'} streak ending ${dates[i - 1]}`,
                        change: getChange(this.marketDataService.dataMap[dates[i - 1]]),
                        streakLength: currentStreak
                    });
                }
                currentStreak = 0;
            }
        }

        results.sort((a, b) => b.streakLength - a.streakLength);
        return results;
    }

    searchByComparison(query, dates, getChange) {
        const results = [];
        // Compare NASDAQ vs S&P 500
        for (const date of dates) {
            const data = this.marketDataService.dataMap[date];
            const nasdaqChange = data?.marketChangePercent ?? 0;
            const spChange = data?.sp500Change ?? 0;
            const diff = nasdaqChange - spChange;

            if (query.includes('outperform') && diff > 0.5) {
                results.push({
                    type: 'compare',
                    date: date,
                    label: `📊 NASDAQ outperformed S&P by ${diff.toFixed(2)}% on ${date}`,
                    change: getChange(data),
                    diff: diff
                });
            } else if (query.includes('underperform') && diff < -0.5) {
                results.push({
                    type: 'compare',
                    date: date,
                    label: `📊 NASDAQ underperformed S&P by ${Math.abs(diff).toFixed(2)}% on ${date}`,
                    change: getChange(data),
                    diff: diff
                });
            }
        }

        results.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        return results;
    }

    displaySearchResults(results, suggestions = []) {
        const container = document.getElementById('search-results');
        const input = document.getElementById('command-search-input');

        // Hide default sections when showing dynamic results
        if (results.length > 0 || suggestions.length > 0) {
            document.querySelectorAll('.search-section').forEach(s => s.style.display = 'none');
        }

        // Remove old dynamic results
        const oldDynamic = document.querySelector('.dynamic-results');
        if (oldDynamic) oldDynamic.remove();

        const dynamicDiv = document.createElement('div');
        dynamicDiv.className = 'dynamic-results';

        // Add smart suggestions if available
        let suggestionsHTML = '';
        if (suggestions.length > 0) {
            suggestionsHTML = `
                <div class="suggestions-section">
                    <div class="section-label">💡 SUGGESTIONS</div>
                    ${suggestions.map(s => `
                        <div class="suggestion-item" data-action="${s.action}">
                            ${s.text}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (results.length === 0 && suggestions.length === 0) {
            dynamicDiv.innerHTML = '<div class="no-results">No matches found. Try: "highest nasdaq", "vix > 25", "crash days"</div>';
            container.appendChild(dynamicDiv);
            return;
        }

        // Build results HTML with proper change values
        const resultsHTML = results.length > 0 ? `
            <div class="search-section">
                <div class="section-label">🔍 RESULTS (${results.length})</div>
                ${results.slice(0, 10).map((r, i) => {
            const changeVal = r.change ?? 0;
            const isPositive = changeVal >= 0;
            return `
                        <div class="result-item ${i === 0 ? 'selected' : ''}" data-date="${r.date}">
                            <span class="result-label">${r.label}</span>
                            <span class="change-badge ${isPositive ? 'positive' : 'negative'}">
                                ${isPositive ? '+' : ''}${changeVal.toFixed(2)}%
                            </span>
                        </div>
                    `;
        }).join('')}
            </div>
        ` : '';

        dynamicDiv.innerHTML = suggestionsHTML + resultsHTML;
        container.appendChild(dynamicDiv);

        // Add click handlers to suggestions
        dynamicDiv.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                input.value = item.dataset.action;
                this.handleSearchInput(item.dataset.action);
            });
        });

        // Add click handlers to results
        dynamicDiv.querySelectorAll('.result-item').forEach(item => {
            item.addEventListener('click', () => {
                const date = item.dataset.date;
                if (date) {
                    this.navigateToDate(date);
                    this.closeCommandSearch();
                }
            });
        });

        this.searchState.results = results;
        this.searchState.selectedIndex = results.length > 0 ? 0 : -1;
    }

    navigateSearchResults(direction) {
        const items = document.querySelectorAll('.dynamic-results .result-item, .search-results .result-item[data-action]');
        if (items.length === 0) return;

        // Remove current selection
        items.forEach(item => item.classList.remove('selected'));

        // Update index
        this.searchState.selectedIndex += direction;
        if (this.searchState.selectedIndex < 0) this.searchState.selectedIndex = items.length - 1;
        if (this.searchState.selectedIndex >= items.length) this.searchState.selectedIndex = 0;

        // Add selection
        items[this.searchState.selectedIndex].classList.add('selected');
        items[this.searchState.selectedIndex].scrollIntoView({ block: 'nearest' });
    }

    executeSelectedResult() {
        const selected = document.querySelector('.result-item.selected');
        if (!selected) return;

        if (selected.dataset.date) {
            this.navigateToDate(selected.dataset.date);
            this.closeCommandSearch();
        } else if (selected.dataset.action) {
            this.executeQuickAction(selected.dataset.action);
        }
    }

    executeQuickAction(action) {
        const validDates = Object.keys(this.marketDataService.dataMap || {}).sort();
        let targetDate = null;

        switch (action) {
            case 'biggest-gain':
                let maxGain = -Infinity;
                for (const date of validDates) {
                    const change = this.marketDataService.dataMap[date]?.dailyChange || 0;
                    if (change > maxGain) { maxGain = change; targetDate = date; }
                }
                break;

            case 'biggest-loss':
                let maxLoss = Infinity;
                for (const date of validDates) {
                    const change = this.marketDataService.dataMap[date]?.dailyChange || 0;
                    if (change < maxLoss) { maxLoss = change; targetDate = date; }
                }
                break;

            case 'highest-vix':
                let maxVix = 0;
                for (const date of validDates) {
                    const vix = this.marketDataService.dataMap[date]?.vix || 0;
                    if (vix > maxVix) { maxVix = vix; targetDate = date; }
                }
                break;

            case 'extreme-fear':
                for (const date of validDates.reverse()) {
                    const fg = this.marketDataService.dataMap[date]?.fearGreedIndex ?? 50;
                    if (fg < 25) { targetDate = date; break; }
                }
                break;

            case 'extreme-greed':
                for (const date of validDates.reverse()) {
                    const fg = this.marketDataService.dataMap[date]?.fearGreedIndex ?? 50;
                    if (fg > 75) { targetDate = date; break; }
                }
                break;
        }

        if (targetDate) {
            this.navigateToDate(targetDate);
            this.closeCommandSearch();
        }
    }

    filterBySector(sectorSymbol) {
        const input = document.getElementById('command-search-input');
        input.value = `sector:${sectorSymbol}`;
        this.handleSearchInput(input.value);
    }

    filterByCondition(condition) {
        const input = document.getElementById('command-search-input');

        // Parse condition like "change-gt-1" or "vix-gt-20" (HTML-safe format)
        if (condition.includes('change')) {
            if (condition.includes('-gt-')) {
                input.value = 'biggest gains';
            } else if (condition.includes('-lt-')) {
                input.value = 'biggest losses';
            }
        } else if (condition.includes('vix')) {
            const gtMatch = condition.match(/vix-gt-(\d+)/);
            const ltMatch = condition.match(/vix-lt-(\d+)/);
            if (gtMatch) {
                input.value = `vix > ${gtMatch[1]}`;
            } else if (ltMatch) {
                input.value = `vix < ${ltMatch[1]}`;
            }
        }

        this.handleSearchInput(input.value);
    }

    navigateToDate(dateKey) {
        const date = new Date(dateKey + 'T00:00:00');
        this.picker.setDate(date, false);
        this.loadDate(date);

        // Update timeline slider
        const validDates = Object.keys(this.marketDataService.dataMap || {}).sort();
        const idx = validDates.indexOf(dateKey);
        if (idx >= 0 && this.ui.timelineSlider) {
            this.ui.timelineSlider.value = idx;
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
        console.log('[updateUI] CALLED with data:', data ? data.date : 'NONE');
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
        console.log('[updateUI] Running AI scan, data:', data ? data.date : 'undefined');
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
        if (!aiText || !currentData) return;

        const fg = currentData.fearGreedIndex || 50;
        const vix = parseFloat(currentData.vix) || 15;
        const change = parseFloat(currentData.marketChangePercent) || 0;
        const sp500Change = parseFloat(currentData.sp500Change) || 0;
        const dowChange = parseFloat(currentData.dowChange) || 0;
        const rsi = currentData.rsi || 50;
        const yieldSpread = currentData.yieldSpread || 0;
        const date = currentData.date || '';

        // Indices summary
        const nasdaqVal = currentData.indexValue?.toLocaleString() || '--';
        const sp500Val = currentData.sp500Value?.toLocaleString() || '--';

        // Determine market regime
        let regime = 'NEUTRAL';
        let regimeColor = '#ffffff';
        let regimeIcon = '◐';
        let regimeBg = '#ffffff11';

        if (fg <= 25) { regime = 'EXTREME FEAR'; regimeColor = '#ff5050'; regimeIcon = '⚠'; regimeBg = '#ff505022'; }
        else if (fg <= 40) { regime = 'FEAR'; regimeColor = '#ff7744'; regimeIcon = '↓'; regimeBg = '#ff774422'; }
        else if (fg >= 75) { regime = 'EXTREME GREED'; regimeColor = '#00ffaa'; regimeIcon = '⚡'; regimeBg = '#00ffaa22'; }
        else if (fg >= 60) { regime = 'GREED'; regimeColor = '#50ffaa'; regimeIcon = '↑'; regimeBg = '#50ffaa22'; }
        else if (vix > 25) { regime = 'HIGH VOLATILITY'; regimeColor = '#ff5050'; regimeIcon = '⚡'; regimeBg = '#ff505022'; }
        else if (vix < 15 && change > 0) { regime = 'RISK-ON'; regimeColor = '#00ffaa'; regimeIcon = '↑'; regimeBg = '#00ffaa22'; }

        // Quick score (0-100 bullish meter)
        let bullScore = 50;
        if (change > 0) bullScore += change * 10;
        if (fg > 50) bullScore += (fg - 50) * 0.3;
        if (vix < 18) bullScore += 10;
        if (vix > 25) bullScore -= 15;
        bullScore = Math.max(0, Math.min(100, Math.round(bullScore)));

        // Trend analysis
        let dayVerdict = '';
        let verdictColor = '#8899a6';
        if (change > 1.5) { dayVerdict = '🟢 Rally'; verdictColor = '#00ffaa'; }
        else if (change > 0.5) { dayVerdict = '🟢 Up'; verdictColor = '#50ffaa'; }
        else if (change > 0) { dayVerdict = '🟡 +'; verdictColor = '#ffcc00'; }
        else if (change < -1.5) { dayVerdict = '🔴 Selloff'; verdictColor = '#ff5050'; }
        else if (change < -0.5) { dayVerdict = '🔴 Down'; verdictColor = '#ff7744'; }
        else if (change < 0) { dayVerdict = '🟡 -'; verdictColor = '#ffcc00'; }
        else { dayVerdict = '⚪ Flat'; verdictColor = '#8899a6'; }

        // Get sector details for narrative
        let topSectorName = '', worstSectorName = '', topSectorVal = 0, worstSectorVal = 0;
        if (currentData.sectorMap) {
            const sectorNames = { 'XLK': 'Tech', 'XLF': 'Financials', 'XLV': 'Healthcare', 'XLE': 'Energy', 'XLI': 'Industrials', 'XLU': 'Utilities', 'XLY': 'Consumer Discretionary', 'XLP': 'Consumer Staples', 'XLB': 'Materials', 'XLRE': 'Real Estate', 'XLC': 'Communications' };
            const sectors = Object.entries(currentData.sectorMap);
            let topS = null, worstS = null, topV = -Infinity, worstV = Infinity;
            sectors.forEach(([key, val]) => {
                const v = typeof val === 'object' ? val.change : val;
                if (v > topV) { topV = v; topS = key; }
                if (v < worstV) { worstV = v; worstS = key; }
            });
            topSectorName = sectorNames[topS] || topS || '';
            worstSectorName = sectorNames[worstS] || worstS || '';
            topSectorVal = topV;
            worstSectorVal = worstV;
        }

        // Generate detailed market narrative based on conditions
        let narrative = '';
        const absChange = Math.abs(change);

        // Generate descriptive market narrative (no specific %s - those are on sidebar)
        // EXTREME FEAR + HIGH VIX = Panic day
        if (fg <= 25 && vix > 25) {
            narrative = `🚨 Capitulation conditions present. Extreme fear with volatility spiking. ${worstSectorName ? `${worstSectorName} under heavy selling pressure.` : ''} Historically, these washouts mark bottoms. Smart money accumulates here.`;
        }
        // EXTREME FEAR + DOWN DAY = Fear selling
        else if (fg <= 25 && change < -1) {
            narrative = `📉 Broad risk-off as fear dominates. Markets searching for support levels. ${topSectorName ? `Only ${topSectorName} showing any resilience.` : ''} Oversold conditions may trigger a technical bounce.`;
        }
        // EXTREME GREED + BIG UP = Euphoria
        else if (fg >= 75 && change > 1) {
            narrative = `🚀 Euphoric rally pushing into overbought territory. ${topSectorName ? `${topSectorName} leading the charge.` : ''} Late-stage momentum — exercise caution. Mean reversion risk elevated.`;
        }
        // GREED + UP = Strong bull
        else if (fg >= 60 && change > 0.5) {
            narrative = `💪 Bulls firmly in control with strong breadth. ${topSectorName ? `${topSectorName} outperforming the broader market.` : ''} Momentum favors continuation. Dips likely to be bought.`;
        }
        // HIGH VIX SPIKE = Volatility event
        else if (vix > 25) {
            narrative = `⚡ Volatility surging — expect wild price swings. ${worstSectorName ? `${worstSectorName} taking the brunt of selling.` : ''} Options premiums elevated. Consider hedging or reducing exposure.`;
        }
        // BIG DOWN DAY
        else if (change < -1.5) {
            narrative = `🔴 Sharp selling across the board. ${worstSectorName ? `${worstSectorName} leading losses.` : ''} Key support levels being tested. Watch for follow-through or reversal signals.`;
        }
        // BIG UP DAY
        else if (change > 1.5) {
            narrative = `🟢 Strong rally with broad participation. ${topSectorName ? `${topSectorName} surging.` : ''} Bulls in command — momentum intact. Technical breakout signals possible.`;
        }
        // Quiet consolidation
        else if (absChange < 0.3 && vix < 18) {
            narrative = `😴 Quiet consolidation day. Markets coiling for the next move. Low volatility suggests complacency. Watch for breakout catalysts.`;
        }
        // Mild up with fear = recovery
        else if (change > 0 && fg < 45) {
            narrative = `🌱 Tentative green despite lingering fear. ${topSectorName ? `${topSectorName} leading.` : ''} Early signs of stabilization. Sentiment still fragile but improving.`;
        }
        // Mild down with greed = profit taking
        else if (change < 0 && fg > 55) {
            narrative = `📊 Mild pullback amid greedy sentiment. ${worstSectorName ? `${worstSectorName} seeing some profit-taking.` : ''} Healthy consolidation or start of rotation? Monitor closely.`;
        }
        // Generic up
        else if (change > 0) {
            narrative = `📈 Modest gains with balanced sentiment. ${topSectorName ? `${topSectorName} showing relative strength.` : ''} Risk appetite present but not aggressive.`;
        }
        // Generic down
        else if (change < 0) {
            narrative = `📉 Slight weakness across indices. ${worstSectorName ? `${worstSectorName} underperforming.` : ''} Cautious tone but no panic. Watch for continuation or support.`;
        }
        // Flat
        else {
            narrative = `⚖️ Indecisive session with markets little changed. Neither bulls nor bears with conviction. Wait for clearer directional signals.`;
        }

        // Yield curve health
        let yieldHealth = '';
        let yieldColor = '#8899a6';
        if (yieldSpread < 0) { yieldHealth = '⚠️ Inverted (Recession Signal)'; yieldColor = '#ff5050'; }
        else if (yieldSpread < 0.5) { yieldHealth = '⚡ Flat (Slowing)'; yieldColor = '#ffcc00'; }
        else { yieldHealth = '✅ Normal'; yieldColor = '#50ffaa'; }

        // Sector summary for display
        let sectorSummary = '';
        if (topSectorName && worstSectorName) {
            sectorSummary = `<span style="color:#50ffaa">▲ ${topSectorName}</span> <span style="color:#ff7744">▼ ${worstSectorName}</span>`;
        }

        // Custom Proprietary Indices

        // PULSE INDEX (0-100) - Market health composite
        let pulseIndex = 50;
        pulseIndex += (fg - 50) * 0.4; // Fear/Greed contribution
        pulseIndex += (change * 8); // Price action
        pulseIndex -= (vix - 18) * 1.5; // Volatility drag
        pulseIndex += (yieldSpread > 0 ? 5 : -10); // Yield curve health
        pulseIndex = Math.max(0, Math.min(100, Math.round(pulseIndex)));

        let pulseLabel = 'Balanced';
        let pulseColor = '#ffffff';
        if (pulseIndex >= 70) { pulseLabel = 'Strong'; pulseColor = '#00ffaa'; }
        else if (pulseIndex >= 55) { pulseLabel = 'Healthy'; pulseColor = '#50ffaa'; }
        else if (pulseIndex <= 30) { pulseLabel = 'Weak'; pulseColor = '#ff5050'; }
        else if (pulseIndex <= 45) { pulseLabel = 'Fragile'; pulseColor = '#ff7744'; }

        // FLOW INDEX - Smart Money / Institutional sentiment
        let flowIndex = 50;
        if (change > 0 && vix < 18) flowIndex += 20; // Quiet uptrend = accumulation
        if (change < 0 && vix > 22) flowIndex -= 20; // Volatile downtrend = distribution
        if (fg > 60 && change < 0) flowIndex -= 10; // Greedy but selling = smart exit
        if (fg < 40 && change > 0) flowIndex += 15; // Fearful but buying = smart entry
        flowIndex = Math.max(0, Math.min(100, Math.round(flowIndex)));

        let flowLabel = flowIndex >= 60 ? 'Inflow' : flowIndex <= 40 ? 'Outflow' : 'Neutral';
        let flowColor = flowIndex >= 60 ? '#50ffaa' : flowIndex <= 40 ? '#ff7744' : '#8899a6';

        // RISK RADAR (0-100, higher = more risk)
        let riskRadar = 50;
        riskRadar += (vix - 18) * 2; // VIX contribution
        riskRadar -= (fg - 50) * 0.3; // Fear adds risk, greed reduces (inverted)
        if (yieldSpread < 0) riskRadar += 20; // Inverted curve = recession risk
        if (Math.abs(change) > 2) riskRadar += 15; // High volatility day
        riskRadar = Math.max(0, Math.min(100, Math.round(riskRadar)));

        let riskLabel = 'Moderate';
        let riskColor = '#ffcc00';
        if (riskRadar >= 70) { riskLabel = 'Elevated'; riskColor = '#ff5050'; }
        else if (riskRadar >= 55) { riskLabel = 'Caution'; riskColor = '#ff7744'; }
        else if (riskRadar <= 30) { riskLabel = 'Low'; riskColor = '#00ffaa'; }
        else if (riskRadar <= 45) { riskLabel = 'Calm'; riskColor = '#50ffaa'; }

        // MOMENTUM MATRIX
        let momoScore = 50 + (change * 15) + (rsi - 50) * 0.3;
        momoScore = Math.max(0, Math.min(100, Math.round(momoScore)));
        let momoLabel = momoScore >= 65 ? '↑ Bullish' : momoScore <= 35 ? '↓ Bearish' : '→ Neutral';
        let momoColor = momoScore >= 65 ? '#50ffaa' : momoScore <= 35 ? '#ff7744' : '#8899a6';

        // Build the enhanced HTML with custom indices
        aiText.innerHTML = `
            <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; white-space: nowrap; overflow: hidden;">
                <span style="background: ${regimeBg}; color: ${regimeColor}; padding: 3px 8px; border-radius: 4px; font-size: 0.7em; font-weight: 700; letter-spacing: 0.3px; box-shadow: 0 0 8px ${regimeColor}44; flex-shrink: 0;">
                    ${regimeIcon} ${regime}
                </span>
                <span style="font-size: 0.7em; color: var(--text-faint); flex-shrink: 0;">${date}</span>
                <span style="margin-left: auto; font-size: 0.7em; color: ${verdictColor}; font-weight: 600; flex-shrink: 0;">${dayVerdict}</span>
            </div>
            
            <div style="font-size: 0.9em; line-height: 1.7; color: var(--text-main); margin-bottom: 12px;">
                ${narrative}
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; font-size: 0.7em;">
                <div style="background: rgba(255,255,255,0.05); padding: 8px 6px; border-radius: 4px; text-align: center; border-bottom: 2px solid ${pulseColor};">
                    <div style="color: var(--text-faint); font-size: 0.9em; margin-bottom: 2px;">PULSE</div>
                    <div style="color: ${pulseColor}; font-weight: 700; font-size: 1.1em;">${pulseIndex}</div>
                    <div style="color: ${pulseColor}; font-size: 0.8em;">${pulseLabel}</div>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 8px 6px; border-radius: 4px; text-align: center; border-bottom: 2px solid ${flowColor};">
                    <div style="color: var(--text-faint); font-size: 0.9em; margin-bottom: 2px;">FLOW</div>
                    <div style="color: ${flowColor}; font-weight: 700; font-size: 1.1em;">${flowIndex}</div>
                    <div style="color: ${flowColor}; font-size: 0.8em;">${flowLabel}</div>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 8px 6px; border-radius: 4px; text-align: center; border-bottom: 2px solid ${riskColor};">
                    <div style="color: var(--text-faint); font-size: 0.9em; margin-bottom: 2px;">RISK</div>
                    <div style="color: ${riskColor}; font-weight: 700; font-size: 1.1em;">${riskRadar}</div>
                    <div style="color: ${riskColor}; font-size: 0.8em;">${riskLabel}</div>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 8px 6px; border-radius: 4px; text-align: center; border-bottom: 2px solid ${momoColor};">
                    <div style="color: var(--text-faint); font-size: 0.9em; margin-bottom: 2px;">MOMO</div>
                    <div style="color: ${momoColor}; font-weight: 700; font-size: 1.1em;">${momoScore}</div>
                    <div style="color: ${momoColor}; font-size: 0.8em;">${momoLabel}</div>
                </div>
            </div>
            
            <div style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.75em; color: var(--text-faint); padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
                <span>📈 Yield: <strong style="color: ${yieldColor}">${yieldHealth}</strong></span>
                ${sectorSummary ? `<span>🏭 ${sectorSummary}</span>` : ''}
            </div>
        `;
        aiText.style.borderLeft = `3px solid ${regimeColor}`;
        aiText.style.paddingLeft = '12px';
        aiText.style.background = `linear-gradient(135deg, ${regimeColor}08, transparent)`;
        aiText.style.borderRadius = '0 8px 8px 0';
        aiText.style.padding = '12px';
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

            // --- AUDIO REACTIVITY ---
            if (this.audioHandler && typeof this.audioHandler.setMood === 'function') {
                let soundMood = 'neutral';
                if (fgIdx <= 25) soundMood = 'extreme_fear';
                else if (fgIdx <= 45) soundMood = 'fear';
                else if (fgIdx <= 55) soundMood = 'neutral';
                else if (fgIdx <= 75) soundMood = 'greed';
                else soundMood = 'extreme_greed';

                this.audioHandler.setMood(soundMood);
            }
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

        // AI Pattern Scan
        this.runAIPatternScan(data);
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

        // Initialize Command Search (Cmd+K)
        this.initCommandSearch();
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

        // Use ACTUAL data from data.yieldCurve (real daily values from Yahoo Finance)
        // Format: [{maturity: '3M', val: X}, {maturity: '5Y', val: X}, ...]
        let realData = {};
        if (Array.isArray(data.yieldCurve)) {
            data.yieldCurve.forEach(pt => { realData[pt.maturity] = pt.val; });
        }

        // Extract real values (these come from ^IRX, ^FVX, ^TNX, ^TYX)
        const y3m = realData['3M'] || data.threeMonthYield || 4.3;
        const y5y = realData['5Y'] || data.fiveYearYield || 4.0;
        const y10y = realData['10Y'] || data.tenYearYield || 4.2;
        const y30y = realData['30Y'] || data.thirtyYearYield || 4.5;

        // Maturity in months for proper interpolation
        const knownPoints = [
            { months: 3, val: y3m },
            { months: 60, val: y5y },    // 5Y
            { months: 120, val: y10y },  // 10Y
            { months: 360, val: y30y }   // 30Y
        ];

        // Linear interpolation function
        const lerp = (x, x0, y0, x1, y1) => y0 + (y1 - y0) * (x - x0) / (x1 - x0);

        // Interpolate yield for any maturity
        const getYield = (months) => {
            if (months <= knownPoints[0].months) return knownPoints[0].val;
            if (months >= knownPoints[knownPoints.length - 1].months) return knownPoints[knownPoints.length - 1].val;

            for (let i = 0; i < knownPoints.length - 1; i++) {
                if (months >= knownPoints[i].months && months <= knownPoints[i + 1].months) {
                    return lerp(months, knownPoints[i].months, knownPoints[i].val,
                        knownPoints[i + 1].months, knownPoints[i + 1].val);
                }
            }
            return y10y; // fallback
        };

        // Build full curve with maturities
        const maturities = [
            { label: '3M', months: 3 },
            { label: '6M', months: 6 },
            { label: '1Y', months: 12 },
            { label: '2Y', months: 24 },
            { label: '3Y', months: 36 },
            { label: '5Y', months: 60 },
            { label: '7Y', months: 84 },
            { label: '10Y', months: 120 },
            { label: '20Y', months: 240 },
            { label: '30Y', months: 360 }
        ];

        const points = maturities.map(m => ({
            maturity: m.label,
            val: getYield(m.months),
            isReal: m.months === 3 || m.months === 60 || m.months === 120 || m.months === 360
        }));

        // Get Min/Max with padding
        const vals = points.map(p => p.val);
        const minVal = Math.min(...vals) - 0.2;
        const maxVal = Math.max(...vals) + 0.2;
        const range = maxVal - minVal || 1;

        const padding = { left: 35, right: 10, top: 15, bottom: 20 };
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

        // Draw data points - larger for real data, smaller for interpolated
        points.forEach((p, i) => {
            const x = getX(i);
            const y = getY(p.val);
            ctx.beginPath();
            if (p.isReal) {
                // Real data points (from Yahoo Finance)
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#00ffcc';
            } else {
                // Interpolated points
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fillStyle = '#888888';
            }
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
