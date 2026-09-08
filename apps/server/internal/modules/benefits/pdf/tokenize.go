package pdf

import (
	"strings"
)

// A minimal content-stream tokenizer: numbers, names, strings, arrays and
// operators. It exists to serve text.go and understands only what a page's
// text-showing operators need.

type tokenKind int

const (
	tokenNumber tokenKind = iota
	tokenName
	tokenString
	tokenArray
	tokenOperator
	tokenOther
)

type token struct {
	kind tokenKind
	text string
}

func tokenize(content []byte) []token {
	var tokens []token
	i, n := 0, len(content)

	for i < n {
		c := content[i]
		switch {
		case isPDFSpace(c):
			i++

		case c == '%':
			for i < n && content[i] != '\n' && content[i] != '\r' {
				i++
			}

		case c == '(':
			text, next := readLiteralString(content, i)
			tokens = append(tokens, token{tokenString, text})
			i = next

		case c == '<' && i+1 < n && content[i+1] == '<':
			// A dictionary. Skipped wholesale: nothing here reads one.
			depth, j := 0, i
			for j < n {
				if content[j] == '<' && j+1 < n && content[j+1] == '<' {
					depth++
					j += 2
					continue
				}
				if content[j] == '>' && j+1 < n && content[j+1] == '>' {
					depth--
					j += 2
					if depth == 0 {
						break
					}
					continue
				}
				j++
			}
			tokens = append(tokens, token{tokenOther, ""})
			i = j

		case c == '<':
			text, next := readHexString(content, i)
			tokens = append(tokens, token{tokenString, text})
			i = next

		case c == '[':
			// An array. For TJ this is text interleaved with kerning numbers;
			// the strings are concatenated and the numbers dropped, which is
			// what the run's text should read as.
			var out strings.Builder
			j := i + 1
			for j < n && content[j] != ']' {
				switch {
				case content[j] == '(':
					text, next := readLiteralString(content, j)
					out.WriteString(text)
					j = next
				case content[j] == '<':
					text, next := readHexString(content, j)
					out.WriteString(text)
					j = next
				default:
					j++
				}
			}
			tokens = append(tokens, token{tokenArray, out.String()})
			i = j + 1

		case c == '/':
			j := i + 1
			for j < n && !isPDFSpace(content[j]) && !isPDFDelimiter(content[j]) {
				j++
			}
			tokens = append(tokens, token{tokenName, string(content[i+1 : j])})
			i = j

		case c == '+' || c == '-' || c == '.' || (c >= '0' && c <= '9'):
			j := i
			for j < n && (content[j] == '+' || content[j] == '-' || content[j] == '.' ||
				(content[j] >= '0' && content[j] <= '9')) {
				j++
			}
			tokens = append(tokens, token{tokenNumber, string(content[i:j])})
			i = j

		case isPDFDelimiter(c):
			i++

		default:
			j := i
			for j < n && !isPDFSpace(content[j]) && !isPDFDelimiter(content[j]) {
				j++
			}
			tokens = append(tokens, token{tokenOperator, string(content[i:j])})
			i = j
		}
	}
	return tokens
}

// readLiteralString reads a (...) string, honouring nesting and escapes, and
// decodes it from WinAnsi so the text reads as it prints.
func readLiteralString(content []byte, start int) (string, int) {
	var out []byte
	depth := 0
	i, n := start, len(content)

	for i < n {
		c := content[i]
		switch c {
		case '(':
			depth++
			if depth > 1 {
				out = append(out, c)
			}
			i++
		case ')':
			depth--
			if depth == 0 {
				return decodeWinAnsi(out), i + 1
			}
			out = append(out, c)
			i++
		case '\\':
			if i+1 >= n {
				i++
				continue
			}
			e := content[i+1]
			switch e {
			case 'n':
				out = append(out, '\n')
				i += 2
			case 'r':
				out = append(out, '\r')
				i += 2
			case 't':
				out = append(out, '\t')
				i += 2
			case 'b', 'f':
				out = append(out, ' ')
				i += 2
			case '(', ')', '\\':
				out = append(out, e)
				i += 2
			case '\n':
				i += 2
			case '\r':
				i += 2
				if i < n && content[i] == '\n' {
					i++
				}
			default:
				if e >= '0' && e <= '7' {
					value, j := 0, i+1
					for j < n && j < i+4 && content[j] >= '0' && content[j] <= '7' {
						value = value*8 + int(content[j]-'0')
						j++
					}
					out = append(out, byte(value))
					i = j
					continue
				}
				out = append(out, e)
				i += 2
			}
		default:
			out = append(out, c)
			i++
		}
	}
	return decodeWinAnsi(out), i
}

func readHexString(content []byte, start int) (string, int) {
	var digits []byte
	i, n := start+1, len(content)
	for i < n && content[i] != '>' {
		c := content[i]
		if isHexDigit(c) {
			digits = append(digits, c)
		}
		i++
	}
	if len(digits)%2 == 1 {
		digits = append(digits, '0')
	}
	out := make([]byte, 0, len(digits)/2)
	for j := 0; j+1 < len(digits); j += 2 {
		out = append(out, hexValue(digits[j])<<4|hexValue(digits[j+1]))
	}
	// A hex string in a form's content is usually UTF-16BE with a byte-order
	// mark. Reading those bytes as Latin-1 gives a NUL between every letter.
	if len(out) >= 2 && out[0] == 0xFE && out[1] == 0xFF {
		var text strings.Builder
		for j := 2; j+1 < len(out); j += 2 {
			text.WriteRune(rune(int(out[j])<<8 | int(out[j+1])))
		}
		return text.String(), i + 1
	}
	return decodeWinAnsi(out), i + 1
}

// decodeWinAnsi turns the bytes of a simple font's string into text. Government
// forms are overwhelmingly WinAnsi, and reading them as anything else turns an
// accented name into mojibake.
func decodeWinAnsi(raw []byte) string {
	var out strings.Builder
	for _, b := range raw {
		if r, ok := winAnsiReverse[b]; ok {
			out.WriteRune(r)
			continue
		}
		out.WriteRune(rune(b))
	}
	return out.String()
}

var winAnsiReverse = func() map[byte]rune {
	out := make(map[byte]rune, len(winAnsiHighRange))
	for r, b := range winAnsiHighRange {
		out[b] = r
	}
	return out
}()

func isPDFSpace(c byte) bool {
	return c == 0 || c == '\t' || c == '\n' || c == '\f' || c == '\r' || c == ' '
}

func isPDFDelimiter(c byte) bool {
	switch c {
	case '(', ')', '<', '>', '[', ']', '{', '}', '/', '%':
		return true
	}
	return false
}

func isHexDigit(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

func hexValue(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	default:
		return c - 'A' + 10
	}
}
