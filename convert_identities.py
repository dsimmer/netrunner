#!/usr/bin/env python3
"""
Convert Clojure identity cards to TypeScript.
This reads the Clojure source and generates TypeScript equivalents.
"""
import re
import sys

# Read the source file
with open('/home/dos/dos/netrunner/src/clj/game/cards/identities.clj', 'r', encoding='utf-8') as f:
    content = f.read()

# Read the existing TS file to get what's already done
with open('/home/dos/dos/netrunner/src/ts/game/cards/identities.ts', 'r', encoding='utf-8') as f:
    ts_content = f.read()

# Find card names already converted
already_done = []
for m in re.finditer(r'export const card_([a-zA-Z0-9_]+):', ts_content):
    already_done.append(m.group(1))

# Find all card names in the Clojure source
card_pattern = r'defcard\s+"([^"]+)"'
all_cards = re.findall(card_pattern, content)

# Cards we need to add (skip empty/simple ones that are already done)
remaining_cards = []
for name in all_cards:
    ts_name = ''.join(w.capitalize() for w in name.split()[:2]) + '_' + ''.join(w.capitalize() for w in name.split()[2:] if w)
    if ts_name not in already_done:
        remaining_cards.append((name, ts_name))

print(f"Already done: {len(already_done)}")
print(f"Remaining: {len(remaining_cards)}")
for name, ts_name in remaining_cards[:20]:
    print(f"  {name} -> {ts_name}")
