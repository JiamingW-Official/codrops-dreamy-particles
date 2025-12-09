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
    # 10 Major Sectors + Indices + Macro
    tickers = [
        "QQQ", "^GSPC", "^IXIC", # Indices
        "^VIX", "^TNX", # Volatility & Rates
        "NB", # Bonds (fallback/proxy, actually TNX mainly used)
        "XLE", "XLF", "XLK", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", # Sectors
        "GC=F", "CL=F" # Commodities
    ]
    
    logging.info("Downloading Market Data (Last 2 Years)...")
    try:
        data = yf.download(tickers, period="2y", group_by='ticker', progress=False)
    except Exception as e:
        logging.error(f"Failed to download data: {e}")
        return

    # Extract DataFrames
    nasdaq = data['^IXIC'].copy()
    sp500 = data['^GSPC'].copy()
    vix = data['^VIX'].copy()
    tnx = data['^TNX'].copy()
    gold = data['GC=F'].copy()
    oil = data['CL=F'].copy()
    
    try:
         # Fill NaN in macro data to avoid gaps
         tnx.fillna(method='ffill', inplace=True)
         gold.fillna(method='ffill', inplace=True)
         oil.fillna(method='ffill', inplace=True)
    except: pass
    
    sectors = {
        "XLE": data['XLE'].copy(),
        "XLF": data['XLF'].copy(), 
        "XLK": data['XLK'].copy(),
        "XLV": data['XLV'].copy(),
        "XLI": data['XLI'].copy(), 
        "XLY": data['XLY'].copy(),
        "XLP": data['XLP'].copy(), 
        "XLU": data['XLU'].copy(),
        "XLB": data['XLB'].copy(), 
        "XLRE": data['XLRE'].copy()
    }

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
                if pd.isna(f) or np.isnan(f): return default
                return f
            except:
                return default

        market_data[date_str] = {
            "date": date_str,
            "indexValue": safe_float(close_price),
            "marketChangePercent": safe_float(change_percent),
            "sp500Value": safe_float(sp500_val),
            "sp500Change": safe_float(sp500_change),
            "sentiment": safe_float(sentiment),
            "vix": safe_float(vix_val),
            "fearGreedIndex": int(fear_greed_idx),
            "volumeRatio": safe_float(volume_ratio),
            "tenYearYield": safe_float(yield_val),
            "marketGap": safe_float(market_gap),
            "intradayRange": safe_float(intraday_range),
            "gold": safe_float(gold_val),
            "oil": safe_float(oil_val),
            
            # Expanded Data
            "volume": safe_float(volume),
            "dayHigh": safe_float(day_high),
            "dayLow": safe_float(day_low),
            "yearHigh": safe_float(year_high),
            "yearLow": safe_float(year_low),
            
            # Mood
            "sectorMap": sector_map,
            "sectorStat": round(sector_trend, 2), 
            "rsi": round(rsi_val, 2),
            "moodState": mood_state,
            "regime": regime,
            "headlines": headlines
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
    
    
    logging.info(f"Successfully generated PhD-Level Data for {len(market_data)} days.")

if __name__ == "__main__":
    fetch_market_data()
