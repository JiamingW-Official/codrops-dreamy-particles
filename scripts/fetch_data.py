import yfinance as yf
import json
import datetime
import random
from pathlib import Path

from GoogleNews import GoogleNews
import time

# Config
OUTPUT_FILE = Path('public/data/market_data.json')
DAYS_BACK = 180

def fetch_market_data():
    print("Fetching market data...")
    end_date = datetime.datetime.now()
    start_date = end_date - datetime.timedelta(days=DAYS_BACK + 5) # Buffer

    # 1. Fetch Nasdaq Composite (^IXIC)
    # Use end_date as tomorrow to ensure we get today's data if market is open/closed
    query_end_date = end_date + datetime.timedelta(days=1)
    
    print(f"Fetching Nasdaq (^IXIC) from {start_date.date()} to {query_end_date.date()}...")
    nasdaq = yf.Ticker("^IXIC")
    nasdaq_hist = nasdaq.history(start=start_date, end=query_end_date, interval="1d")
    
    # 2. Fetch VIX (^VIX) as Fear Proxy
    print(f"Fetching VIX (^VIX) from {start_date.date()} to {query_end_date.date()}...")
    vix = yf.Ticker("^VIX")
    vix_hist = vix.history(start=start_date, end=query_end_date, interval="1d")

    # 3. Fetch S&P 500 (^GSPC) for broader context
    print(f"Fetching S&P 500 (^GSPC) from {start_date.date()} to {query_end_date.date()}...")
    sp500 = yf.Ticker("^GSPC")
    sp500_hist = sp500.history(start=start_date, end=query_end_date, interval="1d")

    data_map = {}
    
    # Sources metadata
    sources = [
        "Nasdaq Composite (^IXIC) & S&P 500 (^GSPC) via Yahoo Finance",
        "CBOE Volatility Index (^VIX) via Yahoo Finance",
        "News Headlines via Google News Search" 
    ]

    # Process Data
    # Ensure indices are timezone-naive for comparison
    nasdaq_hist.index = nasdaq_hist.index.tz_localize(None)
    vix_hist.index = vix_hist.index.tz_localize(None)
    sp500_hist.index = sp500_hist.index.tz_localize(None)

    total_days = len(nasdaq_hist)
    current_day = 0

    # Initialize GoogleNews
    googlenews = GoogleNews(lang='en', region='US')

    for date_idx, row in nasdaq_hist.iterrows():
        current_day += 1
        # yfinance returns trading days only (excludes weekends/holidays automatically)
        date_str = date_idx.strftime('%Y-%m-%d')
        close_price = row['Close']
        
        print(f"[{current_day}/{total_days}] Processing {date_str}...", end='\r')

        # Calculate daily change % for Nasdaq
        open_price = row['Open']
        if open_price == 0: change_percent = 0 # Avoid div by zero
        else: change_percent = ((close_price - open_price) / open_price) * 100

        # S&P 500 Data
        sp500_val = 0
        sp500_change = 0
        if date_idx in sp500_hist.index:
            sp_row = sp500_hist.loc[date_idx]
            sp500_val = sp_row['Close']
            if sp_row['Open'] != 0:
                sp500_change = ((sp500_val - sp_row['Open']) / sp_row['Open']) * 100
        
        # VIX Data (Fear metric)
        vix_val = 20 # Default neutral
        
        # Try to find VIX for this date
        # We look for the exact date, or if missing, the nearest previous date
        if date_idx in vix_hist.index:
            vix_val = vix_hist.loc[date_idx]['Close']
        else:
            # Fallback: check closest date in VIX (sometimes indices differ slightly)
            # This is a simple robust check
            try:
                closest_idx = vix_hist.index.get_indexer([date_idx], method='nearest')[0]
                if closest_idx != -1:
                    vix_val = vix_hist.iloc[closest_idx]['Close']
            except:
                pass
        
        # Map VIX to Fear & Greed (Rough Proxy)
        # VIX < 15: Greed (high score)
        # VIX > 30: Fear (low score)
        # Formula: Inverse mapping
        # 15 -> 80 (Greed)
        # 20 -> 50 (Neutral)
        # 30 -> 20 (Fear)
        fear_greed_val = max(5, min(95, int(100 - (vix_val - 12) * 2.8)))

        # Sentiment (-1 to 1) based on Change % and Fear/Greed
        # Market UP + Low Fear = High Sentiment (Greed)
        # Market DOWN + High Fear = Low Sentiment (Fear)
        sentiment = (change_percent / 2.0) + ((fear_greed_val - 50) / 100.0)
        sentiment = max(-1.0, min(1.0, sentiment))

        # Generate Volatility (based on VIX)
        volatility = vix_val / 40.0 # Normalized roughly 0.3 to 0.8

        # Real Headlines Crawling
        headlines = fetch_real_headlines(googlenews, date_str)

        data_map[date_str] = {
            "date": date_str,
            "indexValue": round(close_price, 2),
            "marketChangePercent": round(change_percent, 2),
            "sp500Value": round(sp500_val, 2),
            "sp500Change": round(sp500_change, 2),
            "fearGreedIndex": fear_greed_val,
            "sentiment": round(sentiment, 2),
            "volatility": round(volatility, 2),
            "headlines": headlines,
            "vix": round(vix_val, 2),
            "sources": sources
        }

    # Ensure output directory exists
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(data_map, f, indent=2)
    
    print(f"\n[{datetime.datetime.now().time()}] Successfully wrote data for {len(data_map)} trading days to {OUTPUT_FILE}")
    print(f"Last date fetched: {sorted(data_map.keys())[-1]}")


def fetch_real_headlines(googlenews, date_str):
    # Format: MM/DD/YYYY for GoogleNews
    date_obj = datetime.datetime.strptime(date_str, '%Y-%m-%d')
    formatted_date = date_obj.strftime('%m/%d/%Y')
    
    try:
        googlenews.clear()
        # Search for generic market news for that specific day
        # We assume 'stock market' is broad enough. 
        # Note: GoogleNews set_time_range is often better but let's try direct search with date first if lib supports it
        # Actually the lib uses set_time_range internally if we use get_news? 
        # Let's use the explicit date range method from the library documentation approach
        googlenews = GoogleNews(start=formatted_date, end=formatted_date)
        googlenews.search('Stock Market Nasdaq')
        
        results = googlenews.results()
        
        # Filter and formatted
        headlines = []
        for res in results[:5]: # Top 5
            headlines.append({
                "title": res['title'],
                "link": res['link']
            })
            
        if not headlines:
             # Fallback if empty (sometimes crawler fails)
             return [{"title": "Market Data Available - No specific news found", "link": "#"}]
             
        return headlines

    except Exception as e:
        # print(f"Error fetching news for {date_str}: {e}")
        return [{"title": "News data unavailable", "link": "#"}]


if __name__ == "__main__":
    fetch_market_data()
