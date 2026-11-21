const COMMA = 'comma';
const LINE_BREAK = 'line break';
const END = 'end';

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  function readUnquoted(prefix) {
    let start = pos;
    let parts = prefix ? [prefix] : null;
    let added = 0;

    while (pos < len) {
      const code = text.charCodeAt(pos);
      if (code === 44) { // ','
        const chunk = text.slice(start, pos);
        pos += 1;
        added += chunk.length;
        const value = parts ? parts.join('') + chunk : chunk;
        return { value, ended: COMMA, added };
      }
      if (code === 10) { // '\n'
        const chunk = text.slice(start, pos);
        pos += 1;
        line += 1;
        added += chunk.length;
        const value = parts ? parts.join('') + chunk : chunk;
        return { value, ended: LINE_BREAK, added };
      }
      if (code === 13) { // '\r'
        if (pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
          const chunk = text.slice(start, pos);
          pos += 2;
          line += 1;
          added += chunk.length;
          const value = parts ? parts.join('') + chunk : chunk;
          return { value, ended: LINE_BREAK, added };
        }
        // stray_cr
        const chunk = text.slice(start, pos);
        if (!parts) parts = [];
        if (chunk.length > 0) {
          parts.push(chunk);
          added += chunk.length;
        }
        error('stray_cr');
        pos += 1;
        start = pos;
        continue;
      }
      pos += 1;
    }

    const chunk = text.slice(start, pos);
    added += chunk.length;
    const value = parts ? parts.join('') + chunk : chunk;
    return { value, ended: END, added };
  }

  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1; // skip opening quote
    let start = pos;
    let parts = null;
    let closed = false;

    while (pos < len) {
      const code = text.charCodeAt(pos);
      if (code === 34) { // '"'
        if (pos + 1 < len && text.charCodeAt(pos + 1) === 34) {
          const chunk = text.slice(start, pos);
          if (!parts) parts = [];
          parts.push(chunk, '"');
          pos += 2;
          start = pos;
          continue;
        }
        const chunk = text.slice(start, pos);
        if (parts) parts.push(chunk);
        else parts = [chunk];
        pos += 1;
        closed = true;
        break;
      }
      if (code === 13) { // '\r'
        const chunk = text.slice(start, pos);
        if (!parts) parts = [];
        parts.push(chunk, '\n');
        line += 1;
        pos += (pos + 1 < len && text.charCodeAt(pos + 1) === 10) ? 2 : 1;
        start = pos;
        continue;
      }
      if (code === 10) { // '\n'
        line += 1;
      }
      pos += 1;
    }

    if (!closed) {
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }

    const value = parts ? parts.join('') : '';

    if (pos >= len) return { value, ended: END };

    const c = text.charCodeAt(pos);
    if (c === 44) { // ','
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) { // '\n'
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }

    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  while (true) {
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted;

    do {
      quoted = text.charCodeAt(pos) === 34; // '"'
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);

    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }

    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
