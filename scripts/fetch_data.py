import yfinance as yf
import json
import logging
from datetime import datetime, timedelta
import pandas as pd
import time
import dateutil.parser
import random
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import html
import ssl

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- PhD Level Rational Data Pipeline ---
import requests
import os
import json

# --- CONFIG ---
# REAL CNN API
CNN_API_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Referer": "https://www.cnn.com/"
}

def fetch_real_cnn_history():
    """Fetches historical Fear & Greed data from CNN API"""
    try:
        logging.info("Fetching REAL Fear & Greed from CNN...")
        r = requests.get(CNN_API_URL, headers=HEADERS, timeout=10)
        if r.status_code == 200:
            data = r.json()
            history_data = data.get('fear_and_greed_historical', {}).get('data', [])
            real_fg_map = {}
            for point in history_data:
                ts = point['x'] / 1000 # CNN uses ms
                dt_str = datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
                score = int(point['y'])
                real_fg_map[dt_str] = score
            logging.info(f"Successfully fetched {len(real_fg_map)} real F&G data points.")
            return real_fg_map
    except Exception as e:
        logging.warning(f"Failed to fetch real CNN data: {e}")
    return {}

def assess_market_mood(change_percent, vix_val):
    """
    Determines the rational search query based on market metrics.
    "The news should explain the market."
    """
    if vix_val > 28:
        return "Stock Market Panic Volatility VIX"
    elif change_percent >= 1.2:
        return "Stock Market Rally Record Highs"
    elif change_percent >= 0.5:
        return "Stock Market Gains"
    elif change_percent <= -1.2:
        return "Stock Market Plunge Crash Sell-off"
    elif change_percent <= -0.5:
        return "Stock Market Drop Losses"
    else:
        return "Stock Market Daily News"

def fetch_rss_headlines(date_str, mood_query):
    """
    Fetches REAL historical news using Google News RSS Archive.
    Bypasses scraper blocks and provides direct article links.
    """
    try:
        # Date logic: Search for news published ON this trading day.
        # RSS 'after' is inclusive start, 'before' is exclusive end.
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        after_date = dt.strftime("%Y-%m-%d")
        before_date = (dt + timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Construct Query
        query = f"{mood_query} after:{after_date} before:{before_date}"
        encoded_query = urllib.parse.quote(query)
        rss_url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"
        
        # Request with rotation-friendly user agent
        req = urllib.request.Request(rss_url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        
        # SSL Context to avoid cert errors
        context = ssl._create_unverified_context()
        
        with urllib.request.urlopen(req, context=context, timeout=10) as response:
            xml_data = response.read()
            
        root = ET.fromstring(xml_data)
        
        headlines = []
        seen_titles = set()
        
        for item in root.findall('.//item'):
            title = item.find('title').text
            link = item.find('link').text
            
            # Cleaning & Deduplication
            if not title or not link:
                continue
                
            clean_title = html.unescape(title).split(" - ")[0] # Remove source suffix for cleaner check
            
            if clean_title in seen_titles:
                continue
            seen_titles.add(clean_title)
            
            # Publisher Check (Boost credibility)
            source_node = item.find('source')
            source_name = source_node.text if source_node is not None else "News"
            
            # Create Entry
            headlines.append({
                "title": f"{clean_title} - {source_name}",
                "link": link
            })
            
            if len(headlines) >= 10:
                break
                
        if not headlines:
            logging.warning(f"No RSS results for {date_str}")
            return None
            
        return headlines

    except Exception as e:
        # logging.error(f"RSS Fetch Error for {date_str}: {e}")
        return None

def fetch_market_data():
    logging.info("Starting PhD-Level Data Pipeline...")
    
    # Use relative period to avoid environment time mismatch (e.g. system thinks it's 2025)
    # Fetching 2 years ensures we have enough buffer for 200-day MA
    # We will then iterate over the ACTUALLY RETURNED dates.
    
    # Fetch Data
    # 10 Major Sectors + Indices + Macro + Top Tech Stocks
    # 10 Major Sectors + Indices + Macro + Top Tech Stocks
    tickers = [
        "^IXIC", "^GSPC", "^DJI", # Indices
        "^VIX", "^IRX", "^FVX", "^TNX", "^TYX", "DX-Y.NYB", # Volatility, 3M, 5Y, 10Y, 30Y, Dollar Index
        "NB", # Bonds (fallback)
        "XLE", "XLF", "XLK", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", # Sectors
        "GC=F", "CL=F", # Commodities
        # Top 20 Tech Stocks (MAG 7 + others)
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", # MAG 7
        "AMD", "INTC", "ORCL", "CRM", "ADBE", "NFLX", "AVGO", "QCOM", "CSCO", # Additional tech
        "NOW", "PANW", "SNPS", "CRWD" # More tech stocks
    ]
    
    logging.info("Downloading Market Data (Last 2 Years)...")
    try:
        # Use interval='1d' for daily data and ensure we get accurate close prices
        data = yf.download(tickers, period="2y", interval='1d', group_by='ticker', progress=False, auto_adjust=False, prepost=False)
    except Exception as e:
        logging.error(f"Failed to download data: {e}")
        return

    # Extract DataFrames
    nasdaq = data['^IXIC'].copy()
    sp500 = data['^GSPC'].copy()
    dow = data['^DJI'].copy() # NEW
    
    vix = data['^VIX'].copy()
    y3m = data['^IRX'].copy() # 13 Week
    fvx = data['^FVX'].copy() # 5Y
    tnx = data['^TNX'].copy() # 10Y
    tyx = data['^TYX'].copy() # 30Y
    dxy = data['DX-Y.NYB'].copy() # Dollar
    gold = data['GC=F'].copy()
    oil = data['CL=F'].copy()
    
    # Align all DataFrames to Nasdaq Index (Master Timeframe)
    # This prevents "None" values when indices mismatch slightly
    
    # Indices
    sp500 = sp500.reindex(nasdaq.index, method='ffill')
    dow = dow.reindex(nasdaq.index, method='ffill')
    vix = vix.reindex(nasdaq.index, method='ffill')
    
    # Macro
    y3m = y3m.reindex(nasdaq.index, method='ffill')
    fvx = fvx.reindex(nasdaq.index, method='ffill')
    tnx = tnx.reindex(nasdaq.index, method='ffill')
    tyx = tyx.reindex(nasdaq.index, method='ffill')
    dxy = dxy.reindex(nasdaq.index, method='ffill')
    
    # Commodities
    gold = gold.reindex(nasdaq.index, method='ffill')
    oil = oil.reindex(nasdaq.index, method='ffill')
    
    sectors = {}
    sector_list = ["XLE", "XLF", "XLK", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE"]
    for s in sector_list:
        df = data[s].copy()
        # Align sector to master index
        df = df.reindex(nasdaq.index, method='ffill')
        df = df.bfill() # Backward fill start if needed
        sectors[s] = df
    
    # Extract stock data with better handling
    stock_symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", 
                     "AMD", "INTC", "ORCL", "CRM", "ADBE", "NFLX", "AVGO", "QCOM", "CSCO",
                     "NOW", "PANW", "SNPS", "CRWD"]
    stocks = {}
    for symbol in stock_symbols:
        if symbol in data:
            try:
                df = data[symbol].copy()
                # Ensure we have Close column
                if 'Close' not in df.columns:
                    logging.warning(f"Stock {symbol} missing Close column")
                    continue
                # Align stock to master index but don't forward fill prices (use actual trading days only)
                # Only forward fill for missing dates within the same trading session
                df = df.reindex(nasdaq.index)
                # Don't use forward fill for prices - only use actual trading day data
                stocks[symbol] = df
                logging.debug(f"Loaded {symbol}: {len(df)} days, price range: {df['Close'].min():.2f} - {df['Close'].max():.2f}")
            except Exception as e:
                logging.warning(f"Failed to process stock {symbol}: {e}")
                continue

    market_data = {}
    
    # Pre-calculate Indicators
    # 1. Market Momentum (SP500 vs 125-day MA). Allow 100 days min.
    sp500_close = sp500['Close']
    sp500_ma125 = sp500_close.rolling(window=125, min_periods=100).mean()
    sp500_ma200 = sp500_close.rolling(window=200, min_periods=100).mean() # For Regime
    
    # 2. Volatility Regime (VIX vs 50-day MA). Allow 40 days min.
    vix_close = vix['Close']
    vix_ma50 = vix_close.rolling(window=50, min_periods=40).mean()

    # 3. 52-Week Range (Rolling 252 days or max available)
    nasdaq_high_52 = nasdaq['High'].rolling(window=252, min_periods=100).max()
    nasdaq_low_52 = nasdaq['Low'].rolling(window=252, min_periods=100).min()
    
    # 4. Volume MA
    nasdaq['VolumeMA30'] = nasdaq['Volume'].rolling(window=30, min_periods=20).mean()
    
    # 5. RSI (Relative Strength Index) - 14 Day
    delta = nasdaq['Close'].diff()
    gain = (delta.where(delta > 0, 0)).fillna(0)
    loss = (-delta.where(delta < 0, 0)).fillna(0)
    avg_gain = gain.rolling(window=14, min_periods=14).mean()
    avg_loss = loss.rolling(window=14, min_periods=14).mean()
    rs = avg_gain / avg_loss
    rsi_series = 100 - (100 / (1 + rs))

    # Iterate through days using THE ACTUAL DOWNLOADED INDEX
    # This fixes the "Future 2025" bug
    dates = nasdaq.index
    total_days = len(dates)
    
    # Output roughly last 300 days of valid data
    start_idx = max(0, total_days - 300)
    
    logging.info(f"Processing {total_days} valid trading days. Outputting last {total_days - start_idx} days.")

    # We need full history for MAs, but loop can start later? 
    # Actually, loop iterates all for ease, we just skip saving early ones?
    # No, iteration logic below depends on i, so let's iterate all but only save last 300.


    for i, date in enumerate(dates):
        date_str = date.strftime("%Y-%m-%d")
        
        # Skip buffer days (only output requested range)
        if i < start_idx:
            continue
        
        # Skip if data is missing
        try:
             # Basic Data Existence Check
             if pd.isna(nasdaq.loc[date]['Close']) or pd.isna(sp500.loc[date]['Close']):
                 continue
        except KeyError:
             continue

        # --- REAL CNN FEAR & GREED FETCH ---
        cnn_score = None
        try:
            # We only need to fetch this ONCE, not per day. 
            # But inside the loop, we are generating history. 
            # CNN API returns historical graph data!
            # Let's fetch it OUTSIDE the loop first.
            pass 
        except: pass

        # --- FEAR & GREED PROXY (Fallback) ---
        # Keep the 4-Factor model as a robust "Quantitative" measure.
        # But we will try to overwrite 'fearGreedIndex' with real data if available and date matches.
        
        # ... (Existing Proxy Logic) ...
        try:
            # 1. Momentum (20%)
            curr_sp500 = float(sp500_close.loc[date])
            ma_125_val = float(sp500_ma125.loc[date])
            if pd.isna(ma_125_val): mom_s = 50
            else:
                diff = (curr_sp500 - ma_125_val) / ma_125_val
                mom_s = 50 + (diff * 1000)
            mom_s = max(0, min(100, mom_s))

            # 2. Volatility (40%)
            curr_vix = float(vix_close.loc[date])
            if curr_vix <= 12: vol_s = 100
            elif curr_vix >= 35: vol_s = 0
            else:
                vol_s = 100 - ((curr_vix - 12) / 23.0 * 100)
            vol_s = max(0, min(100, vol_s))
            
            # 3. RSI (20%)
            curr_rsi = float(rsi_series.loc[date]) if not pd.isna(rsi_series.loc[date]) else 50.0
            
            # 4. Yield Stress (20%)
            try: curr_yield = float(tnx.loc[date]['Close'])
            except: curr_yield = 4.0
            
            if curr_yield <= 3.0: yield_s = 100
            elif curr_yield >= 5.0: yield_s = 0
            else: yield_s = 100 - ((curr_yield - 3.0) / 2.0 * 100)
            yield_s = max(0, min(100, yield_s))

            raw_score = (mom_s * 0.2) + (vol_s * 0.4) + (curr_rsi * 0.2) + (yield_s * 0.2)
            fear_greed_idx = int(raw_score - 5)
            fear_greed_idx = max(5, min(95, fear_greed_idx))
            
        except Exception as e:
            fear_greed_idx = 50

        # --- MACRO DATA ---
        try:
            gold_val = float(gold.loc[date]['Close']) if 'gold' in locals() and date in gold.index else 0
            oil_val = float(oil.loc[date]['Close']) if 'oil' in locals() and date in oil.index else 0
        except: 
            gold_val = 0
            oil_val = 0

        # Store Data


        try:
             rsi_val = float(rsi_series.loc[date])
             if pd.isna(rsi_val): rsi_val = 50.0
        except:
             rsi_val = 50.0

        # Nasdaq Metrics
        try:
            # Handle MultiIndex tuples if necessary, or just straight access
            close_price = float(nasdaq.loc[date]['Close'])
            open_price = float(nasdaq.loc[date]['Open'])
            high_price = float(nasdaq.loc[date]['High'])
            low_price = float(nasdaq.loc[date]['Low'])
            volume = float(nasdaq.loc[date]['Volume'])
            volume_ma = float(nasdaq.loc[date]['VolumeMA30']) if 'VolumeMA30' in nasdaq and not pd.isna(nasdaq.loc[date]['VolumeMA30']) else volume
            
            # STRICT VALIDATION: Skip days with 0 price, 0 volume, or NaN (Ghost Future Dates)
            # comparisons with NaN are always False, so we must check isna explicitly
            if pd.isna(close_price) or close_price <= 1.0 or pd.isna(volume) or volume <= 0:
                continue

            # Previous Close for Gap Calculation
            if i > 0:
                prev_date = dates[i-1]
                prev_close = float(nasdaq.loc[prev_date]['Close'])
            else:
                prev_close = open_price # Fallback
                
        except:
            continue
        
        # Calculate Change
        if pd.isna(open_price) or open_price == 0:
            change_percent = 0.0
        else:
            # Use prev close for change if possible, else open
            if prev_close > 0:
                 change_percent = ((close_price - prev_close) / prev_close) * 100
            else:
                 change_percent = ((close_price - open_price) / open_price) * 100
        
        # S&P 500 Metrics (For Dashboard)
        try:
            sp500_val = float(sp500.loc[date]['Close'])
            # Calc change
            sp500_prev = float(sp500.loc[dates[i-1]]['Close']) if i > 0 else sp500_val
            sp500_change = 0.0
            if sp500_prev > 0:
                sp500_change = ((sp500_val - sp500_prev) / sp500_prev) * 100
        except:
            sp500_val = 0.0
            sp500_change = 0.0

        # --- NEW TEXTURE ATTRIBUTES ---
        
        # 1. Intraday Range (Volatility Texture)
        if open_price > 0:
             intraday_range = ((high_price - low_price) / open_price) * 100
        else:
             intraday_range = 0.0
             
        # 2. Market Gap (Shock)
        if prev_close > 0:
            market_gap = ((open_price - prev_close) / prev_close) * 100
        else:
            market_gap = 0.0
             
        # Volume Ratio (Energy)
        volume_ratio = min(3.0, volume / volume_ma) if volume_ma > 0 else 1.0

        # VIX
        try:
            vix_val = float(vix.loc[date]['Close'])
        except:
            vix_val = 15.0
            
        # 10-Year Yield (Macro Atmosphere)
        try:
            yield_val = float(tnx.loc[date]['Close'])
        except:
            yield_val = 4.0 
            
        # Sector Map (Full 10 Sectors with Weights)
        sector_map = {}
        sector_trend = 0.0 
        
        try:
            # Calculate change and weight (Volume * Price) for each sector
            changes = []
            for sym, df in sectors.items():
                # Price Data
                curr = float(df.loc[date]['Close'])
                prev = float(df.loc[dates[i-1]]['Close']) if i > 0 else curr
                change = ((curr - prev)/prev)*100 if prev > 0 else 0.0
                
                # Weight Data (Turnover = Close * Volume)
                # Use Volume if available, else default to equal weight
                vol = float(df.loc[date]['Volume']) if 'Volume' in df.columns else 1000000
                weight = curr * vol
                
                # Store object: { val: change, weight: weight }
                sector_map[sym] = {
                    "change": round(change, 2),
                    "weight": weight
                }
                changes.append(change)
            
            # Simple bias: Average of Tech vs Defensive
            scale_xlk = sector_map.get("XLK", {}).get("change", 0)
            scale_xlp = sector_map.get("XLP", {}).get("change", 0)
            sector_trend = scale_xlk - scale_xlp
            
        except Exception as e:
            # print(f"Sector Error: {e}")
            pass
            
        # --- 8-STATE MOOD CLASSIFICATION ---
        mood_state = "Neutral"
        
        if rsi_val < 25 and vix_val > 28:     mood_state = "Capitulation"
        elif vix_val > 28:                    mood_state = "Panic"
        elif rsi_val > 75 and vix_val < 15:   mood_state = "Euphoria"
        elif fear_greed_idx > 75:             mood_state = "Greed"
        elif fear_greed_idx < 25:             mood_state = "Fear"
        elif vix_val > 20:                    mood_state = "Anxiety"
        elif change_percent > 0.5:            mood_state = "Optimism"
        else:                                 mood_state = "Neutral"
             
        # --- REGIME CLASSIFICATION ---
        regime = "Goldilocks"
        try:
             # Need current SP500 vs MA200
             curr_sp = float(sp500.loc[date]['Close'])
             ma200 = float(sp500_ma200.loc[date]) if not pd.isna(sp500_ma200.loc[date]) else curr_sp
             
             if curr_sp < ma200 and vix_val > 20:   regime = "Bear Volatile"
             elif curr_sp < ma200:                  regime = "Bear Calm"
             elif vix_val > 20:                     regime = "Bull Volatile"
             elif vix_val < 15 and rsi_val > 60:    regime = "Bull Euphoric"
             else:                                  regime = "Goldilocks"
        except:
             regime = "Goldilocks"
        
        # Derived Visuals
        sentiment = max(0, min(1, (change_percent + 2) / 4)) 

        # --- REAL NEWS FETCHING ---
        mood_query = assess_market_mood(change_percent, vix_val)
        
        # Polite Delay for scraping (removed here as we don't scrape inside loop heavily if using RSS)
        # headlines = fetch_rss_headlines(date_str, mood_query)
        # But keeping calling code:
        headlines = fetch_rss_headlines(date_str, mood_query)
        
        if not headlines:
             headlines = [
                {"title": f"Market Moves: Nasdaq {change_percent:.2f}%", "link": f"https://finance.yahoo.com/quote/%5EIXIC"},
                {"title": f"S&P 500 Daily Action", "link": f"https://finance.yahoo.com/quote/%5EGSPC"},
                {"title": f"VIX at {vix_val:.2f}", "link": f"https://finance.yahoo.com/quote/%5EVIX"}
            ]

        # Metadata for UI
        vol_val = volume
        day_high = high_price
        day_low = low_price
        
        try:
             year_high = float(nasdaq_high_52.loc[date])
             year_low = float(nasdaq_low_52.loc[date])
        except:
             year_high = day_high
             year_low = day_low
        
        # Helper for NaN safety
        def safe_float(val, default=0.0):
            try:
                f = float(val)
                # Use pd.isna which handles both None and NaN
                if pd.isna(f): return default
                return f
            except:
                return default

        # Get Dow, SP500, Dollar, Yields
        dow_close = float(dow.loc[date]['Close']) if not pd.isna(dow.loc[date]['Close']) else 0.0
        sp500_val = float(sp500.loc[date]['Close']) if not pd.isna(sp500.loc[date]['Close']) else 0.0
        dxy_val = float(dxy.loc[date]['Close']) if date in dxy.index and not pd.isna(dxy.loc[date]['Close']) else 0.0
        
        # Yields
        y3m_val = float(y3m.loc[date]['Close']) if date in y3m.index and not pd.isna(y3m.loc[date]['Close']) else 0.0
        y5y_val = float(fvx.loc[date]['Close']) if date in fvx.index and not pd.isna(fvx.loc[date]['Close']) else 0.0
        y10y_val = float(tnx.loc[date]['Close']) if date in tnx.index and not pd.isna(tnx.loc[date]['Close']) else 0.0
        y30y_val = float(tyx.loc[date]['Close']) if date in tyx.index and not pd.isna(tyx.loc[date]['Close']) else 0.0

        # Construct Curve Object for UI
        yield_curve = [
            {"maturity": "3M", "val": round(y3m_val, 2)},
            {"maturity": "5Y", "val": round(y5y_val, 2)},
            {"maturity": "10Y", "val": round(y10y_val, 2)},
            {"maturity": "30Y", "val": round(y30y_val, 2)}
        ]

        # Checks
        if dow_close <= 1.0: dow_close = 0.0 
        if sp500_val <= 1.0: sp500_val = 0.0

        # Calculate Changes
        dow_change = 0.0
        sp500_change = 0.0
        
        if i > 0:
            try:
                prev_dow = float(dow.loc[dates[i-1]]['Close'])
                if prev_dow > 0:
                    dow_change = ((dow_close - prev_dow) / prev_dow) * 100
                
                prev_sp = float(sp500.loc[dates[i-1]]['Close'])
                if prev_sp > 0:
                    sp500_change = ((sp500_val - prev_sp) / prev_sp) * 100
            except: pass

        # Extract stock prices and changes with better accuracy
        stock_prices = {}
        for symbol in stock_symbols:
            if symbol in stocks:
                try:
                    stock_df = stocks[symbol]
                    
                    # Check if date exists in the dataframe
                    if date not in stock_df.index:
                        continue
                    
                    stock_row = stock_df.loc[date]
                    stock_close = float(stock_row['Close'])
                    
                    # Validate the price is reasonable (not NaN, not zero)
                    if pd.isna(stock_close) or stock_close <= 0:
                        continue
                    
                    stock_change_pct = 0.0
                    stock_change_abs = 0.0
                    
                    # Calculate change from previous trading day
                    if i > 0:
                        try:
                            prev_date = dates[i-1]
                            if prev_date in stock_df.index:
                                prev_row = stock_df.loc[prev_date]
                                prev_close = float(prev_row['Close'])
                                
                                if not pd.isna(prev_close) and prev_close > 0:
                                    stock_change_pct = ((stock_close - prev_close) / prev_close) * 100
                                    stock_change_abs = stock_close - prev_close
                        except (KeyError, ValueError, TypeError, IndexError) as e:
                            pass
                    
                    stock_prices[symbol] = {
                        'price': round(stock_close, 2),
                        'changePercent': round(stock_change_pct, 2),
                        'change': round(stock_change_abs, 2)
                    }
                except (KeyError, ValueError, TypeError, IndexError) as e:
                    # Stock data not available for this date
                    pass

        market_data[date_str] = {
            'date': date_str,
            'indexValue': round(close_price, 2),
            'marketChangePercent': round(change_percent, 2),
            'sp500Value': round(sp500_val, 2),
            'sp500Change': round(sp500_change, 2),
            'dowValue': round(dow_close, 2),
            'dowChange': round(dow_change, 2),
            'sentiment': 0.0, # Placeholder
            'vix': round(vix_val, 2),
            'fearGreedIndex': fear_greed_idx, 
            'volumeRatio': round(volume_ratio, 2),
            'tenYearYield': round(y10y_val, 2),
            'fiveYearYield': round(y5y_val, 2),
            'yieldCurve': yield_curve, # New Array Format
            'yieldSpread': round(y10y_val - y3m_val, 2), # 10Y-3M Spread (Recession Indicator)
            'dollarIndex': round(dxy_val, 2),
            'marketGap': round(market_gap, 2),
            'intradayRange': round(intraday_range, 2),
            'gold': round(gold_val, 2),
            'oil': round(oil_val, 2),
            'volume': int(volume),
            'dayHigh': round(high_price, 2),
            'dayLow': round(low_price, 2),
            'yearHigh': round(year_high, 2),
            'yearLow': round(year_low, 2),
            'sectorMap': sector_map,
            'sectorStat': round(sector_trend, 2),
            'rsi': round(rsi_val, 2),
            'moodState': mood_state,
            'regime': regime,
            'headlines': headlines,
            'poeticWords': [],  # Will be generated by generate_poetic_words.py
            'stockPrices': stock_prices  # Real stock prices and changes
        }
        
        print(f"[{i+1}/{total_days}] {date_str}: {mood_state} ({regime}) | FG:{fear_greed_idx}")
        
    # Final Atomic Save
    # temp_file = 'public/data/market_data.tmp.json'
    # final_file = 'public/data/market_data.json'
    
    # with open(temp_file, 'w') as f:
    #     json.dump(market_data, f, indent=2)
        
    # import os
    # os.replace(temp_file, final_file)
    
    today = datetime.now().date()
    
    # Function to recursively clean NaN/Infinity for JSON compliance
    def recursive_clean(obj):
        if isinstance(obj, dict):
            return {k: recursive_clean(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [recursive_clean(v) for v in obj]
        elif isinstance(obj, float):
            import math
            if pd.isna(obj) or math.isnan(obj) or math.isinf(obj):
                return 0.0
            return obj
        return obj

    # OUTPUT JSON
    print(f"Exporting {len(market_data)} days to JSON...")
    
    # --- REAL DATA OVERWRITE ---
    c_map = fetch_real_cnn_history()
    if c_map:
        hits = 0
        for date_key in market_data:
            if date_key in c_map:
                real_score = c_map[date_key]
                market_data[date_key]['fearGreedIndex'] = real_score
                hits += 1
        print(f"Overwrote {hits} days with REAL CNN data.")

    # Save
    market_data_clean = recursive_clean(market_data)
    
    import json
    out_path = os.path.join(os.path.dirname(__file__), '../public/data/market_data.json')
    with open(out_path, 'w') as f:
        json.dump(market_data_clean, f)
    print("Done!")
    
    # Generate poetic words for all dates
    print("\nGenerating poetic words for all dates...")
    try:
        from generate_poetic_words import update_market_data_with_words
        update_market_data_with_words()
    except Exception as e:
        logging.warning(f"Could not generate poetic words: {e}")
        print("Note: Run 'python scripts/generate_poetic_words.py --update-all' to generate words later")
    
    logging.info(f"Successfully generated PhD-Level Data for {len(market_data)} days.")

if __name__ == "__main__":
    fetch_market_data()
