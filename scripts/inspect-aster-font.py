import json
import sys
from fontTools.ttLib import TTFont

font = TTFont(sys.argv[1])
names = font['name'].names
def strings(ids):
    return sorted(set(n.toUnicode() for n in names if n.nameID in ids))
axes = {axis.axisTag: [axis.minValue, axis.maxValue] for axis in font['fvar'].axes} if 'fvar' in font else {}
weight = axes.get('wght', [font['OS/2'].usWeightClass] * 2)
print(json.dumps({'localNames': strings([4, 6]), 'families': strings([1, 16]), 'weight': weight, 'italic': bool(font['OS/2'].fsSelection & 1)}))
