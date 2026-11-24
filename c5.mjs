const rgb=(h)=>[0,2,4].map(i=>parseInt(h.replace("#","").slice(i,i+2),16));
const lum=([r,g,b])=>{const f=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
const R=(a,b)=>{const[x,y]=[lum(rgb(a)),lum(rgb(b))].sort((p,q)=>q-p);return (x+.05)/(y+.05)};
const mix=(f,b,a)=>`#${rgb(f).map((c,i)=>Math.round(c*a+rgb(b)[i]*(1-a)).toString(16).padStart(2,"0")).join("")}`;
console.log("hover clair:", R("#FFFFFF", mix("#1765F5","#FFFFFF",0.9)).toFixed(2));
console.log("hover sombre:", R("#FFFFFF", mix("#2F63D6","#090E1C",0.9)).toFixed(2));
console.log("danger10:", R("#B91C1C", mix("#B91C1C","#FFFFFF",0.1)).toFixed(2));
