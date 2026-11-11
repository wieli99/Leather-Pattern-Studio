function version(value: string) { return value.replace(/^v/, "").split(/[.-]/); }
export function newer(a: string, b: string) {
  const x = version(a), y = version(b);
  for (let i = 0; i < 3; i++) { const d = Number(x[i]) - Number(y[i]); if (d) return d > 0; }
  if (x.length === 3 || y.length === 3) return x.length === 3 && y.length > 3;
  for (let i = 3; i < Math.max(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    if (x[i] === undefined) return false; if (y[i] === undefined) return true;
    const nx = /^\d+$/.test(x[i]), ny = /^\d+$/.test(y[i]);
    return nx && ny ? Number(x[i]) > Number(y[i]) : nx !== ny ? !nx : x[i] > y[i];
  }
  return false;
}
