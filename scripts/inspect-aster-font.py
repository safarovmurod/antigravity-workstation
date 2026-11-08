import json
import sys
from fontTools.ttLib import TTFont
import uharfbuzz as hb

# Coding sequences checked for ligatures with the features editor.fontLigatures: true enables.
SEQUENCES = ['===', '!==', '=>', '<=', '>=', '->', '!=', '&&', '||']

font = TTFont(sys.argv[1])
names = font['name'].names
def strings(ids):
    return sorted(set(n.toUnicode() for n in names if n.nameID in ids))
axes = {axis.axisTag: [axis.minValue, axis.maxValue] for axis in font['fvar'].axes} if 'fvar' in font else {}
weight = axes.get('wght', [font['OS/2'].usWeightClass] * 2)
face = hb.Face(hb.Blob(open(sys.argv[1], 'rb').read()))
def glyphs(text, enabled):
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    hb.shape(hb.Font(face), buffer, {'liga': enabled, 'calt': enabled})
    return [(info.codepoint, position.x_advance, position.x_offset) for info, position in zip(buffer.glyph_infos, buffer.glyph_positions)]
ligatures = [text for text in SEQUENCES if glyphs(text, True) != glyphs(text, False)]
print(json.dumps({'localNames': strings([4, 6]), 'families': strings([1, 16]), 'weight': weight, 'italic': bool(font['OS/2'].fsSelection & 1), 'ligatures': ligatures}))
