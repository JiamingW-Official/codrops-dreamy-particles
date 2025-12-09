import requests
import re

url = "https://www.cnn.com/markets/fear-and-greed"
headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

try:
    print("Fetching...")
    r = requests.get(url, headers=headers)
    print(f"Status: {r.status_code}")
    
    # Look for the score
    # Simple search for "Fear & Greed Index" and surrounding context
    content = r.text
    
    # Try to find "Current Score" or the number
    # Often it's in a JSON object like {"score": 31}
    
    # Method 2: Look for the specific dial class often used
    # <span class="market-fng-gauge__dial-number-value">31</span>
    match_css = re.search(r'dial-number-value[^>]*>([\d\.]+)<', content)
    if match_css:
        print(f"Found via CSS: {match_css.group(1)}")

    # Method 3: Look for FearandGreed JSON
    # "fearAndGreed":{"score":31.0
    match_json = re.search(r'fearAndGreed"?:\{[^}]*"score":([\d\.]+)', content)
    if match_json:
        print(f"Found via JSON: {match_json.group(1)}")
        
    # Method 4: Dump any numbers near "Greed"
    print("\n--- Greed Context ---")
    iter = re.finditer(r"Greed", content)
    for m in iter:
        start = m.start()
        print(content[start:start+100])

except Exception as e:
    print(e)
