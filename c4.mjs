const rgb=(h)=>[0,2,4].map(i=>parseInt(h.replace("#","").slice(i,i+2),16));
const lum=([r,g,b])=>{const f=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
const R=(a,b)=>{const[x,y]=[lum(rgb(a)),lum(rgb(b))].sort((p,q)=>q-p);return (x+.05)/(y+.05)};
console.log("clair badge:", R("#0E44AA","#EEF3FE").toFixed(2));
console.log("sombre badge:", R("#8CB4FF","#172340").toFixed(2));
console.log("sombre lien primary-ink/surface:", R("#588CFA","#090E1C").toFixed(2));
console.log("sombre primary(bouton)/blanc:", R("#2F63D6","#FFFFFF").toFixed(2));
console.log("clair muted/surface:", R("#5B6B82","#F5F7FB").toFixed(2));
console.log("clair success/success10:", R("#166534","#E7F1EA").toFixed(2));
