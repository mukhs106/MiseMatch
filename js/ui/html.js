// Tiny templating helper: interpolated values are escaped unless wrapped in raw().

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Raw(s);

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function stringify(v) {
  if (v == null) return "";
  if (typeof v === "boolean") return String(v); // for aria-pressed etc.; use ternaries for conditional output
  if (Array.isArray(v)) return v.map(stringify).join("");
  if (v instanceof Raw) return v.s;
  return escape(v);
}

export function html(strings, ...values) {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += stringify(values[i]);
  });
  return raw(out);
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
