#!/usr/bin/env python3
"""
Generate poetic, Greek mythology-themed words describing daily market mood.
Generates ~80 words based on market sentiment, greed, fear, and VIX.
"""

import json
import os
import random
import hashlib
from datetime import datetime

# Greek mythology and poetic word banks
GREEK_GODS = {
    'zeus': ['Thunder', 'Lightning', 'Olympus', 'Divine', 'Majestic', 'Sovereign', 'Power', 'Authority'],
    'athena': ['Wisdom', 'Strategy', 'Owl', 'Protection', 'Cunning', 'Intellect', 'Victory', 'Warrior'],
    'apollo': ['Sun', 'Light', 'Healing', 'Music', 'Prophecy', 'Archery', 'Harmony', 'Radiance'],
    'ares': ['War', 'Conflict', 'Chaos', 'Fury', 'Battle', 'Strife', 'Rage', 'Destruction'],
    'hades': ['Underworld', 'Shadow', 'Darkness', 'Death', 'Wealth', 'Hidden', 'Mystery', 'Depth'],
    'poseidon': ['Ocean', 'Wave', 'Storm', 'Depth', 'Current', 'Tide', 'Tempest', 'Abyss'],
    'dionysus': ['Ecstasy', 'Frenzy', 'Wine', 'Madness', 'Revelry', 'Passion', 'Excess', 'Intoxication'],
    'hermes': ['Messenger', 'Swift', 'Travel', 'Trade', 'Cunning', 'Boundary', 'Transition', 'Speed'],
    'aphrodite': ['Beauty', 'Love', 'Desire', 'Charm', 'Grace', 'Attraction', 'Passion', 'Allure'],
    'artemis': ['Hunt', 'Moon', 'Wild', 'Freedom', 'Nature', 'Arrow', 'Dawn', 'Protection']
}

POETIC_EMOTIONS = {
    'extreme_fear': ['Trembling', 'Despair', 'Abyss', 'Void', 'Echo', 'Shadow', 'Whisper', 'Fading', 'Silence', 'Dread', 'Chasm', 'Eclipse', 'Veil', 'Mist', 'Phantom'],
    'fear': ['Caution', 'Vigilance', 'Watchful', 'Hesitation', 'Doubt', 'Uncertainty', 'Mist', 'Cloud', 'Veil', 'Shade', 'Echo', 'Whisper', 'Distant', 'Fading'],
    'neutral': ['Balance', 'Stillness', 'Calm', 'Flow', 'Drift', 'Gentle', 'Soft', 'Quiet', 'Peace', 'Harmony', 'Tranquil', 'Serene', 'Steady', 'Even'],
    'greed': ['Desire', 'Hunger', 'Thirst', 'Craving', 'Yearning', 'Longing', 'Passion', 'Fire', 'Flame', 'Glow', 'Bright', 'Radiant', 'Shimmer', 'Gleam'],
    'extreme_greed': ['Frenzy', 'Ecstasy', 'Euphoria', 'Rapture', 'Blaze', 'Inferno', 'Glory', 'Triumph', 'Exaltation', 'Transcendence', 'Brilliance', 'Splendor', 'Magnificence', 'Grandeur']
}

MARKET_ACTIONS = {
    'rising': ['Ascend', 'Rise', 'Soar', 'Climb', 'Elevate', 'Surge', 'Mount', 'Tower', 'Reach', 'Peak', 'Summit', 'Crest', 'Pinnacle'],
    'falling': ['Descend', 'Fall', 'Plunge', 'Drop', 'Sink', 'Dive', 'Tumble', 'Cascade', 'Crash', 'Collapse', 'Fade', 'Diminish', 'Wane'],
    'volatile': ['Churn', 'Churn', 'Turbulent', 'Restless', 'Unstable', 'Shifting', 'Changing', 'Fluctuating', 'Oscillating', 'Swaying', 'Swinging', 'Wavering'],
    'stable': ['Steady', 'Firm', 'Solid', 'Constant', 'Enduring', 'Persistent', 'Unwavering', 'Stable', 'Fixed', 'Anchored', 'Rooted']
}

POETIC_CONNECTORS = ['And', 'Yet', 'But', 'While', 'As', 'Through', 'Beyond', 'Within', 'Amidst', 'Beneath', 'Above', 'Across', 'Along', 'Around']

def generate_poetic_words(fear_greed_index, vix, market_change, volume_ratio, mood_state, regime, date_str=None):
    """
    Generate ~80 poetic words based on market data.
    Uses date_str as seed to ensure different words each day.
    
    Args:
        fear_greed_index: 0-100 (0=extreme fear, 100=extreme greed)
        vix: Volatility index
        market_change: Market change percentage
        volume_ratio: Volume ratio
        mood_state: String mood state
        regime: String regime
        date_str: Date string to use as seed for randomization (ensures different words each day)
    
    Returns:
        List of ~80 words
    """
    # Use date as seed to ensure different words each day
    if date_str:
        seed_str = f"{date_str}_{fear_greed_index}_{vix}_{market_change}"
        seed = int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)
        random.seed(seed)
    else:
        random.seed()  # Use system time
    
    words = []
    
    # Determine primary emotion category
    if fear_greed_index <= 25:
        emotion_words = POETIC_EMOTIONS['extreme_fear']
        god_theme = 'hades'
    elif fear_greed_index <= 45:
        emotion_words = POETIC_EMOTIONS['fear']
        god_theme = 'ares' if vix > 25 else 'poseidon'
    elif fear_greed_index <= 55:
        emotion_words = POETIC_EMOTIONS['neutral']
        god_theme = 'athena'
    elif fear_greed_index <= 75:
        emotion_words = POETIC_EMOTIONS['greed']
        god_theme = 'apollo' if market_change > 0 else 'hermes'
    else:
        emotion_words = POETIC_EMOTIONS['extreme_greed']
        god_theme = 'dionysus' if volume_ratio > 1.2 else 'zeus'
    
    # Add god-themed words
    words.extend(random.sample(GREEK_GODS[god_theme], min(8, len(GREEK_GODS[god_theme]))))
    
    # Add emotion words
    words.extend(random.sample(emotion_words, min(10, len(emotion_words))))
    
    # Add market action words based on movement
    if abs(market_change) > 2:
        if market_change > 0:
            words.extend(random.sample(MARKET_ACTIONS['rising'], min(8, len(MARKET_ACTIONS['rising']))))
        else:
            words.extend(random.sample(MARKET_ACTIONS['falling'], min(8, len(MARKET_ACTIONS['falling']))))
    elif vix > 25:
        words.extend(random.sample(MARKET_ACTIONS['volatile'], min(6, len(MARKET_ACTIONS['volatile']))))
    else:
        words.extend(random.sample(MARKET_ACTIONS['stable'], min(6, len(MARKET_ACTIONS['stable']))))
    
    # Add poetic descriptors based on VIX
    if vix > 30:
        words.extend(['Storm', 'Tempest', 'Chaos', 'Fury', 'Rage', 'Thunder', 'Lightning', 'Gale', 'Whirlwind', 'Turbulence'])
    elif vix > 20:
        words.extend(['Wind', 'Breeze', 'Current', 'Flow', 'Drift', 'Shift', 'Change', 'Movement', 'Motion', 'Rhythm'])
    else:
        words.extend(['Calm', 'Still', 'Peace', 'Serenity', 'Tranquil', 'Quiet', 'Gentle', 'Soft', 'Smooth', 'Ease'])
    
    # Add volume-based words
    if volume_ratio > 1.5:
        words.extend(['Roar', 'Rush', 'Surge', 'Flood', 'Wave', 'Tide', 'Current', 'Flow', 'Stream', 'Torrent'])
    elif volume_ratio < 0.7:
        words.extend(['Whisper', 'Murmur', 'Hush', 'Silence', 'Still', 'Quiet', 'Faint', 'Subtle', 'Gentle', 'Soft'])
    
    # Add regime-specific words
    regime_lower = regime.lower() if regime else ''
    if 'bull' in regime_lower:
        words.extend(['Ascend', 'Rise', 'Soar', 'Triumph', 'Victory', 'Glory', 'Crown', 'Peak', 'Summit', 'Pinnacle'])
    elif 'bear' in regime_lower:
        words.extend(['Descend', 'Fall', 'Shadow', 'Depth', 'Abyss', 'Void', 'Echo', 'Fading', 'Dim', 'Fade'])
    elif 'volatile' in regime_lower or 'chaos' in regime_lower:
        words.extend(['Churn', 'Turbulent', 'Restless', 'Unstable', 'Shifting', 'Changing', 'Fluctuating', 'Swaying', 'Wavering'])
    
    # Add mood state words
    mood_lower = mood_state.lower() if mood_state else ''
    if 'panic' in mood_lower or 'fear' in mood_lower:
        words.extend(['Dread', 'Terror', 'Anxiety', 'Worry', 'Concern', 'Caution', 'Vigilance', 'Watchful', 'Alert'])
    elif 'greed' in mood_lower or 'euphoria' in mood_lower:
        words.extend(['Desire', 'Hunger', 'Thirst', 'Craving', 'Yearning', 'Longing', 'Passion', 'Fire', 'Flame'])
    elif 'neutral' in mood_lower or 'calm' in mood_lower:
        words.extend(['Balance', 'Equilibrium', 'Harmony', 'Peace', 'Tranquil', 'Serene', 'Steady', 'Even'])
    
    # Add poetic connectors and fillers to reach ~80 words
    while len(words) < 80:
        # Add more poetic variations
        additional_words = [
            'Eternal', 'Infinite', 'Boundless', 'Vast', 'Immense', 'Profound', 'Deep', 'Ancient', 'Timeless',
            'Mystical', 'Mysterious', 'Enigmatic', 'Cryptic', 'Arcane', 'Esoteric', 'Hidden', 'Veiled', 'Shrouded',
            'Luminous', 'Radiant', 'Brilliant', 'Glowing', 'Shimmering', 'Gleaming', 'Sparkling', 'Bright', 'Dazzling',
            'Ethereal', 'Celestial', 'Divine', 'Sacred', 'Holy', 'Transcendent', 'Sublime', 'Exalted', 'Elevated',
            'Whisper', 'Echo', 'Resonance', 'Vibration', 'Pulse', 'Rhythm', 'Beat', 'Cadence', 'Flow',
            'Shadow', 'Shade', 'Silhouette', 'Outline', 'Form', 'Shape', 'Figure', 'Presence', 'Essence',
            'Dawn', 'Dusk', 'Twilight', 'Sunset', 'Sunrise', 'Daybreak', 'Nightfall', 'Horizon', 'Edge',
            'Ocean', 'Sea', 'Wave', 'Tide', 'Current', 'Depth', 'Abyss', 'Void', 'Expanse'
        ]
        words.extend(random.sample(additional_words, min(160 - len(words), len(additional_words))))
        if len(words) >= 160:
            break
    
    # Shuffle and return exactly 160 words (2x the amount)
    random.shuffle(words)
    return words[:160]

def generate_words_for_date(date_str, market_data):
    """
    Generate poetic words for a specific date.
    
    Args:
        date_str: Date string in YYYY-MM-DD format
        market_data: Dictionary containing market data for the date
    
    Returns:
        List of ~80 words
    """
    fear_greed = market_data.get('fearGreedIndex', 50)
    vix = market_data.get('vix', 20)
    market_change = market_data.get('marketChangePercent', 0)
    volume_ratio = market_data.get('volumeRatio', 1.0)
    mood_state = market_data.get('moodState', 'Neutral')
    regime = market_data.get('regime', 'Neutral')
    
    # Pass date_str to ensure different words each day
    return generate_poetic_words(fear_greed, vix, market_change, volume_ratio, mood_state, regime, date_str)

def update_market_data_with_words():
    """Update market_data.json with poetic words for all dates."""
    data_path = os.path.join(os.path.dirname(__file__), '../public/data/market_data.json')
    if not os.path.exists(data_path):
        print(f"Error: {data_path} not found")
        return
    
    with open(data_path, 'r') as f:
        market_data_all = json.load(f)
    
    print(f"Generating poetic words for {len(market_data_all)} dates...")
    updated = 0
    
    for date_str, data in market_data_all.items():
        # Always regenerate words to ensure they're fresh
        words = generate_words_for_date(date_str, data)
        data['poeticWords'] = words
        updated += 1
        if updated % 10 == 0:
            print(f"  Updated {updated} dates...")
    
    # Save updated data
    with open(data_path, 'w') as f:
        json.dump(market_data_all, f, indent=2)
    
    print(f"Done! Updated {updated} dates with poetic words.")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == '--update-all':
            # Update all dates in market_data.json
            update_market_data_with_words()
        else:
            # If date provided, generate for that date
            date_str = sys.argv[1]
            # Load market data
            data_path = os.path.join(os.path.dirname(__file__), '../public/data/market_data.json')
            if os.path.exists(data_path):
                with open(data_path, 'r') as f:
                    market_data_all = json.load(f)
                    if date_str in market_data_all:
                        words = generate_words_for_date(date_str, market_data_all[date_str])
                        print(json.dumps(words))
                    else:
                        print(json.dumps([]))
            else:
                print(json.dumps([]))
    else:
        # Generate example words
        words = generate_poetic_words(70, 15, 1.5, 1.2, 'Greed', 'Bull')
        print(json.dumps(words))

