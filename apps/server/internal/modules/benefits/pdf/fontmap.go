package pdf

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// Decoding what a page's text bytes actually say.
//
// A byte in a content stream is a code into whichever font is current, and only
// the font says what character that is. Government forms make this matter:
// California's SNAP application draws its labels in subset Type1 fonts whose
// codes start at 0x35, so reading the bytes as text turns "Application" into
// "5DD@=75H=CB". Other forms use Identity-H, where every code is two bytes and
// means nothing at all without the font's ToUnicode map.
//
// Three sources are consulted, best first: a ToUnicode CMap, an /Encoding
// dictionary's /Differences array, and finally the base encoding. Anything a
// font cannot explain is dropped rather than guessed — a wrong letter in a
// label is worse than a short one.

type fontDecoder struct {
	// twoByte is set for Identity-H and similar composite encodings.
	twoByte bool
	// toUnicode maps a character code to the text it stands for.
	toUnicode map[uint32]string
	// simple maps a single-byte code to a rune, from /Differences or the base
	// encoding.
	simple map[byte]rune
	// hasDifferences records that the font redefined its encoding. When it has,
	// a code the map does not cover is dropped rather than read as a raw byte:
	// in a subset font the raw byte is some unrelated letter, and a wrong
	// character in a label is worse than a missing one.
	hasDifferences bool
}

// decode turns a string's bytes into text.
func (d *fontDecoder) decode(raw string) string {
	if d == nil {
		return decodeWinAnsi([]byte(raw))
	}
	bytes := []byte(raw)
	var out strings.Builder

	if d.twoByte {
		for i := 0; i+1 < len(bytes); i += 2 {
			code := uint32(bytes[i])<<8 | uint32(bytes[i+1])
			if text, ok := d.toUnicode[code]; ok {
				out.WriteString(text)
			}
		}
		return out.String()
	}

	for _, b := range bytes {
		if text, ok := d.toUnicode[uint32(b)]; ok {
			out.WriteString(text)
			continue
		}
		if r, ok := d.simple[b]; ok {
			out.WriteRune(r)
			continue
		}
		if d.hasDifferences {
			// This font's codes mean nothing outside its own map.
			continue
		}
		if r, ok := winAnsiReverse[b]; ok {
			out.WriteRune(r)
			continue
		}
		out.WriteByte(b)
	}
	return out.String()
}

// pageFontDecoders builds a decoder per font resource name on a page.
func pageFontDecoders(ctx *model.Context, pageNr int) map[string]*fontDecoder {
	out := map[string]*fontDecoder{}
	xRefTable := ctx.XRefTable

	_, _, attrs, err := xRefTable.PageDict(pageNr, true)
	if err != nil || attrs == nil || attrs.Resources == nil {
		return out
	}
	fonts, err := xRefTable.DereferenceDict(attrs.Resources["Font"])
	if err != nil || fonts == nil {
		return out
	}

	for name, ref := range fonts {
		dict, err := xRefTable.DereferenceDict(ref)
		if err != nil || dict == nil {
			continue
		}
		out[name] = buildFontDecoder(xRefTable, dict)
	}
	return out
}

func buildFontDecoder(xRefTable *model.XRefTable, dict types.Dict) *fontDecoder {
	decoder := &fontDecoder{toUnicode: map[uint32]string{}, simple: map[byte]rune{}}

	if subtype := dict.NameEntry("Subtype"); subtype != nil && *subtype == "Type0" {
		decoder.twoByte = true
	}
	if encoding := dict.NameEntry("Encoding"); encoding != nil {
		switch *encoding {
		case "Identity-H", "Identity-V":
			decoder.twoByte = true
		}
	}

	// A composite font's descendant may carry the encoding instead.
	if array, err := xRefTable.DereferenceArray(dict["DescendantFonts"]); err == nil && len(array) > 0 {
		decoder.twoByte = true
	}

	if stream, _, err := xRefTable.DereferenceStreamDict(dict["ToUnicode"]); err == nil && stream != nil {
		if err := stream.Decode(); err == nil {
			parseToUnicode(string(stream.Content), decoder.toUnicode)
		}
	}

	if encodingDict, err := xRefTable.DereferenceDict(dict["Encoding"]); err == nil && encodingDict != nil {
		if differences, err := xRefTable.DereferenceArray(encodingDict["Differences"]); err == nil && len(differences) > 0 {
			applyDifferences(xRefTable, differences, decoder.simple)
			decoder.hasDifferences = len(decoder.simple) > 0
		}
	}
	return decoder
}

// applyDifferences reads an /Encoding /Differences array: a run of numbers and
// glyph names where each number restarts the code counter.
func applyDifferences(xRefTable *model.XRefTable, differences types.Array, into map[byte]rune) {
	code := 0
	for _, entry := range differences {
		resolved, err := xRefTable.Dereference(entry)
		if err != nil {
			continue
		}
		switch typed := resolved.(type) {
		case types.Integer:
			code = typed.Value()
		case types.Float:
			code = int(typed.Value())
		case types.Name:
			if r, ok := glyphRune(typed.Value()); ok && code >= 0 && code < 256 {
				into[byte(code)] = r
			}
			code++
		}
	}
}

var (
	bfCharBlock  = regexp.MustCompile(`(?s)beginbfchar(.*?)endbfchar`)
	bfRangeBlock = regexp.MustCompile(`(?s)beginbfrange(.*?)endbfrange`)
	hexToken     = regexp.MustCompile(`<([0-9A-Fa-f]+)>`)
	rangeLine    = regexp.MustCompile(`<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>`)
)

// parseToUnicode reads the bfchar and bfrange sections of a ToUnicode CMap.
func parseToUnicode(cmap string, into map[uint32]string) {
	for _, block := range bfCharBlock.FindAllStringSubmatch(cmap, -1) {
		tokens := hexToken.FindAllStringSubmatch(block[1], -1)
		for i := 0; i+1 < len(tokens); i += 2 {
			code, err := strconv.ParseUint(tokens[i][1], 16, 32)
			if err != nil {
				continue
			}
			into[uint32(code)] = utf16BEToString(tokens[i+1][1])
		}
	}
	for _, block := range bfRangeBlock.FindAllStringSubmatch(cmap, -1) {
		for _, line := range rangeLine.FindAllStringSubmatch(block[1], -1) {
			low, err1 := strconv.ParseUint(line[1], 16, 32)
			high, err2 := strconv.ParseUint(line[2], 16, 32)
			start, err3 := strconv.ParseUint(line[3], 16, 32)
			if err1 != nil || err2 != nil || err3 != nil || high < low || high-low > 0xFFFF {
				continue
			}
			for code := low; code <= high; code++ {
				into[uint32(code)] = string(rune(start + (code - low)))
			}
		}
	}
}

func utf16BEToString(hex string) string {
	if len(hex)%4 != 0 {
		if value, err := strconv.ParseUint(hex, 16, 32); err == nil {
			return string(rune(value))
		}
		return ""
	}
	var out strings.Builder
	for i := 0; i+3 < len(hex); i += 4 {
		value, err := strconv.ParseUint(hex[i:i+4], 16, 32)
		if err != nil {
			continue
		}
		out.WriteRune(rune(value))
	}
	return out.String()
}

// glyphRune maps a PostScript glyph name to the character it draws. It covers
// the Latin letters, digits and punctuation a form label is made of, plus the
// uniXXXX form; a name outside that is reported as unknown and its character is
// dropped rather than guessed at.
func glyphRune(name string) (rune, bool) {
	if r, ok := glyphNames[name]; ok {
		return r, true
	}
	if strings.HasPrefix(name, "uni") && len(name) >= 7 {
		if value, err := strconv.ParseUint(name[3:7], 16, 32); err == nil {
			return rune(value), true
		}
	}
	if len(name) == 1 {
		return rune(name[0]), true
	}
	return 0, false
}

var glyphNames = buildGlyphNames()

func buildGlyphNames() map[string]rune {
	out := map[string]rune{
		"space": ' ', "exclam": '!', "quotedbl": '"', "numbersign": '#', "dollar": '$',
		"percent": '%', "ampersand": '&', "quotesingle": '\'', "parenleft": '(',
		"parenright": ')', "asterisk": '*', "plus": '+', "comma": ',', "hyphen": '-',
		"period": '.', "slash": '/', "colon": ':', "semicolon": ';', "less": '<',
		"equal": '=', "greater": '>', "question": '?', "at": '@', "bracketleft": '[',
		"backslash": '\\', "bracketright": ']', "asciicircum": '^', "underscore": '_',
		"grave": '`', "braceleft": '{', "bar": '|', "braceright": '}', "asciitilde": '~',
		"quoteright": '’', "quoteleft": '‘', "quotedblleft": '“',
		"quotedblright": '”', "endash": '–', "emdash": '—',
		"bullet": '•', "fi": 'f', "fl": 'f', "nbspace": ' ',
		"zero": '0', "one": '1', "two": '2', "three": '3', "four": '4',
		"five": '5', "six": '6', "seven": '7', "eight": '8', "nine": '9',
	}
	for c := 'a'; c <= 'z'; c++ {
		out[string(c)] = c
	}
	for c := 'A'; c <= 'Z'; c++ {
		out[string(c)] = c
	}
	return out
}
