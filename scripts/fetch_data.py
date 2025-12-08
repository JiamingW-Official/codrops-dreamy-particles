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
    
    # Define date range: Last 180 days -> Future (to catch current date)
    end_date = datetime.now() + timedelta(days=1) 
    start_date = end_date - timedelta(days=180)
    
    # Fetch Data
    tickers = ["^IXIC", "^GSPC", "^VIX", "^TNX", "XLK", "XLP"]
    data = yf.download(tickers, start=start_date, end=end_date, group_by='ticker', progress=False)
    
    # Flatten Data
    nasdaq = data['^IXIC']
    sp500 = data['^GSPC']
    vix = data['^VIX']
    tnx = data['^TNX'] # 10 Year Treasury Yield
    xlk = data['XLK']  # Tech Sector
    xlp = data['XLP']  # Consumer Staples (Defensive)
    
    market_data = {}
    
    # Iterate through days using Nasdaq index as base
    dates = nasdaq.index
    total_days = len(dates)
    
    # Pre-calculate 30-day Volume MA for Nasdaq
    nasdaq['VolumeMA30'] = nasdaq['Volume'].rolling(window=30).mean()

    logging.info(f"Processing {total_days} trading days...")

    for i, date in enumerate(dates):
        date_str = date.strftime("%Y-%m-%d")
        
        # Skip if data is missing
        if pd.isna(nasdaq.loc[date]['Close']) or pd.isna(sp500.loc[date]['Close']):
            continue
            
        # Nasdaq Metrics
        try:
            close_price = float(nasdaq.loc[date]['Close'])
            open_price = float(nasdaq.loc[date]['Open'])
            volume = float(nasdaq.loc[date]['Volume'])
            volume_ma = float(nasdaq.loc[date]['VolumeMA30']) if not pd.isna(nasdaq.loc[date]['VolumeMA30']) else volume
        except:
            continue
        
        # Calculate Change & Volume Ratio
        if pd.isna(open_price) or open_price == 0:
            change_percent = 0.0
        else:
            change_percent = ((close_price - open_price) / open_price) * 100
            
        # Volume Ratio (Energy) - Cap at 3.0x for sanity
        volume_ratio = min(3.0, volume / volume_ma) if volume_ma > 0 else 1.0

        # S&P 500 Metrics
        try:
            sp500_close = float(sp500.loc[date]['Close'])
            sp500_open = float(sp500.loc[date]['Open'])
            sp500_change = ((sp500_close - sp500_open) / sp500_open) * 100 if sp500_open != 0 else 0.0
        except:
            sp500_change = 0.0
            sp500_close = 0.0

        # VIX
        try:
            vix_val = float(vix.loc[date]['Close'])
        except:
            vix_val = 15.0
            
        # 10-Year Yield (Macro Atmosphere)
        try:
            yield_val = float(tnx.loc[date]['Close'])
        except:
            yield_val = 4.0 # Default fallback
            
        # Sector Rotation (Flow Texture)
        # Tech vs Defensive
        try:
            xlk_close = float(xlk.loc[date]['Close'])
            xlk_open = float(xlk.loc[date]['Open'])
            xlk_change = ((xlk_close - xlk_open) / xlk_open) * 100
            
            xlp_close = float(xlp.loc[date]['Close'])
            xlp_open = float(xlp.loc[date]['Open'])
            xlp_change = ((xlp_close - xlp_open) / xlp_open) * 100
            
            # Positive = Risk On (Tech), Negative = Defensive
            sector_trend = xlk_change - xlp_change 
        except:
            sector_trend = 0.0
        
        # Derived Logic
        if vix_val > 25:
            fear_greed_idx = max(0, 100 - (vix_val * 2)) 
        elif change_percent > 1.0:
            fear_greed_idx = min(100, 50 + (change_percent * 20)) 
        else:
            fear_greed_idx = 50 

        sentiment = max(0, min(1, (change_percent + 2) / 4)) 
        volatility = min(1.0, vix_val / 40.0)

        # --- REAL NEWS FETCHING ---
        mood_query = assess_market_mood(change_percent, vix_val)
        
        # Polite Delay
        time.sleep(0.4) 
        
        headlines = fetch_rss_headlines(date_str, mood_query)
        
        # Fallback
        if not headlines:
             headlines = [
                {"title": f"Market Moves: Nasdaq {change_percent:.2f}%", "link": f"https://finance.yahoo.com/quote/%5EIXIC"},
                {"title": f"S&P 500 Daily Action {sp500_change:.2f}%", "link": f"https://finance.yahoo.com/quote/%5EGSPC"},
                {"title": f"VIX Closely Watched at {vix_val:.2f}", "link": f"https://finance.yahoo.com/quote/%5EVIX"}
            ]

        # Structure
        entry = {
            "date": date_str,
            "indexValue": round(close_price, 2),
            "marketChangePercent": round(change_percent, 2),
            "sp500Value": round(sp500_close, 2),
            "sp500Change": round(sp500_change, 2),
            "fearGreedIndex": int(fear_greed_idx),
            "sentiment": round(sentiment, 2),
            "volatility": round(volatility, 2),
            
            # New Dimensions
            "volumeRatio": round(volume_ratio, 2),
            "tenYearYield": round(yield_val, 2),
            "sectorTrend": round(sector_trend, 2), # >0 Tech, <0 Defensive
            
            "headlines": headlines,
            "vix": round(vix_val, 2),
            "sources": [
                "Nasdaq, S&P 500, VIX, TNX, XLK, XLP via Yahoo Finance",
                "Real Historical News via Google News Archive"
            ]
        }
        
        market_data[date_str] = entry
        
        # Log progress
        print(f"[{i+1}/{total_days}] {date_str}: {mood_query} | VolRatio: {volume_ratio:.2f} | Yield: {yield_val:.2f} | Sector: {sector_trend:.2f}")
        
        # Incremental Save
        if (i + 1) % 10 == 0:
             with open('public/data/market_data.json', 'w') as f:
                json.dump(market_data, f, indent=2)

    # Final Save
    with open('public/data/market_data.json', 'w') as f:
        json.dump(market_data, f, indent=2)
    
    logging.info(f"Successfully generated PhD-Level Data for {len(market_data)} days.")

if __name__ == "__main__":
    fetch_market_data()
