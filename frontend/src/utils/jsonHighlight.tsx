import React from 'react';

/**
 * Renders JSON with syntax highlighting using span elements with CSS classes.
 * Classes used: json-key, json-string, json-number, json-boolean, json-null, json-punctuation
 */
export function highlightJson(data: unknown): React.ReactNode {
  const json = JSON.stringify(data, null, 2);
  if (!json) return null;

  // Tokenize JSON string into highlighted spans
  const tokens: React.ReactNode[] = [];
  // Regex matches JSON tokens: strings, numbers, booleans, null, and punctuation
  const tokenRegex = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\]:,])|(\s+)/g;

  let match;
  let lastIndex = 0;

  while ((match = tokenRegex.exec(json)) !== null) {
    // Add any unmatched text before this token
    if (match.index > lastIndex) {
      tokens.push(json.slice(lastIndex, match.index));
    }
    lastIndex = tokenRegex.lastIndex;

    const key = match.index;

    if (match[1]) {
      // Key (string followed by colon)
      tokens.push(
        <span key={key} className="json-key">{match[1]}</span>
      );
    } else if (match[2]) {
      // String value
      tokens.push(
        <span key={key} className="json-string">{match[2]}</span>
      );
    } else if (match[3]) {
      // Number
      tokens.push(
        <span key={key} className="json-number">{match[3]}</span>
      );
    } else if (match[4]) {
      // Boolean
      tokens.push(
        <span key={key} className="json-boolean">{match[4]}</span>
      );
    } else if (match[5]) {
      // Null
      tokens.push(
        <span key={key} className="json-null">{match[5]}</span>
      );
    } else if (match[6]) {
      // Punctuation
      tokens.push(
        <span key={key} className="json-punctuation">{match[6]}</span>
      );
    } else if (match[7]) {
      // Whitespace - preserve as-is
      tokens.push(match[7]);
    }
  }

  // Add any remaining text
  if (lastIndex < json.length) {
    tokens.push(json.slice(lastIndex));
  }

  return <>{tokens}</>;
}
