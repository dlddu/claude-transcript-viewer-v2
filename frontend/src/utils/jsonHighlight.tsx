import React from 'react';

/** Renders JSON as syntax-highlighted span elements. */
export function highlightJson(data: unknown): React.ReactNode {
  const json = JSON.stringify(data, null, 2);
  if (!json) return null;

  const tokens: React.ReactNode[] = [];
  const tokenRegex = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\]:,])|(\s+)/g;

  let match;
  let lastIndex = 0;

  while ((match = tokenRegex.exec(json)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(json.slice(lastIndex, match.index));
    }
    lastIndex = tokenRegex.lastIndex;

    const key = match.index;

    if (match[1]) {
      tokens.push(
        <span key={key} className="json-key">{match[1]}</span>
      );
    } else if (match[2]) {
      tokens.push(
        <span key={key} className="json-string">{match[2]}</span>
      );
    } else if (match[3]) {
      tokens.push(
        <span key={key} className="json-number">{match[3]}</span>
      );
    } else if (match[4]) {
      tokens.push(
        <span key={key} className="json-boolean">{match[4]}</span>
      );
    } else if (match[5]) {
      tokens.push(
        <span key={key} className="json-null">{match[5]}</span>
      );
    } else if (match[6]) {
      tokens.push(
        <span key={key} className="json-punctuation">{match[6]}</span>
      );
    } else if (match[7]) {
      tokens.push(match[7]);
    }
  }

  if (lastIndex < json.length) {
    tokens.push(json.slice(lastIndex));
  }

  return <>{tokens}</>;
}
