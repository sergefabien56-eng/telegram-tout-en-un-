const hex = (h) => h.replace("#","");
const rgb = (h) => [0,2,4].map(i=>parseInt(hex(h).slice(i,i+2),16));
const lum = ([r,g,b]) => { const f=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
const ratio = (a,b) => { const L1=lum(rgb(a)), L2=lum(rgb(b)); const [hi,lo]=L1>L2?[L1,L2]:[L2,L1]; return (hi+0.05)/(lo+0.05); };
const pairs = [
  ["clair", "#0F172A", "#FFFFFF", "ink / card"],
  ["clair", "#0F172A", "#F5F7FB", "ink / surface"],
  ["clair", "#64748B", "#FFFFFF", "muted / card"],
  ["clair", "#64748B", "#F5F7FB", "muted / surface"],
  ["clair", "#1765F5", "#FFFFFF", "primary / card (lien)"],
  ["clair", "#FFFFFF", "#1765F5", "blanc / primary (bouton)"],
  ["clair", "#0E44AA", "#EEF3FE", "primary-700 / primary-50 (badge)"],
  ["clair", "#16A34A", "#FFFFFF", "success / card"],
  ["clair", "#16A34A", "#F5F7FB", "success / surface"],
  ["clair", "#DC2626", "#FFFFFF", "danger / card"],
  ["clair", "#F59E0B", "#FFFFFF", "warning / card"],
  ["sombre", "#E5EBF5", "#11192C", "ink / card"],
  ["sombre", "#E5EBF5", "#090E1C", "ink / surface"],
  ["sombre", "#8C98AC", "#11192C", "muted / card"],
  ["sombre", "#8C98AC", "#090E1C", "muted / surface"],
  ["sombre", "#588CFA", "#090E1C", "primary / surface (lien)"],
  ["sombre", "#FFFFFF", "#588CFA", "blanc / primary (bouton)"],
  ["sombre", "#8CB4FF", "#172340", "primary-700 / primary-50"],
  ["sombre", "#22C55E", "#090E1C", "success / surface"],
  ["sombre", "#F87171", "#090E1C", "danger / surface"],
  ["sombre", "#FBBF24", "#090E1C", "warning / surface"],
];
for (const [mode, fg, bg, label] of pairs) {
  const r = ratio(fg,bg);
  const ok = r >= 4.5 ? "AA" : r >= 3 ? "AA-large" : "ÉCHEC";
  console.log(`${mode.padEnd(6)} ${label.padEnd(28)} ${r.toFixed(2).padStart(5)}:1  ${ok}`);
}

console.log("\n--- surfaces teintées ---");
const mix = (fg, bg, alpha) => {
  const a = rgb(fg), b = rgb(bg);
  const m = a.map((c,i)=>Math.round(c*alpha + b[i]*(1-alpha)));
  return `#${m.map(c=>c.toString(16).padStart(2,"0")).join("")}`;
};
const cases = [
  ["clair", "#16A34A", mix("#16A34A","#FFFFFF",0.1), "success / success-10%"],
  ["clair", "#16A34A", mix("#16A34A","#F5F7FB",0.1), "success / success-10% (surface)"],
  ["clair", "#DC2626", mix("#DC2626","#FFFFFF",0.1), "danger / danger-10%"],
  ["clair", "#F59E0B", mix("#F59E0B","#FFFFFF",0.1), "warning / warning-10%"],
];
for (const [mode, fg, bg, label] of cases) console.log(`${mode} ${label.padEnd(34)} ${ratio(fg,bg).toFixed(2)}:1`);
