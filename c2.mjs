const rgb=(h)=>[0,2,4].map(i=>parseInt(h.replace("#","").slice(i,i+2),16));
const lum=([r,g,b])=>{const f=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
const R=(a,b)=>{const[x,y]=[lum(rgb(a)),lum(rgb(b))].sort((p,q)=>q-p);return (x+.05)/(y+.05)};
const mix=(f,b,a)=>`#${rgb(f).map((c,i)=>Math.round(c*a+rgb(b)[i]*(1-a)).toString(16).padStart(2,"0")).join("")}`;
for (const c of ["#15803D","#166534","#16A34A"]) {
  console.log("success",c, "card",R(c,"#FFFFFF").toFixed(2), "surface",R(c,"#F5F7FB").toFixed(2), "s10%",R(c,mix(c,"#FFFFFF",.1)).toFixed(2));
}
for (const c of ["#DC2626","#B91C1C","#991B1B"]) {
  console.log("danger ",c, "card",R(c,"#FFFFFF").toFixed(2), "surface",R(c,"#F5F7FB").toFixed(2), "d10%",R(c,mix(c,"#FFFFFF",.1)).toFixed(2));
}
// muted plus foncé pour >=4.5 sur surface
for (const c of ["#64748B","#5B6B82","#55657D"]) {
  console.log("muted  ",c, "card",R(c,"#FFFFFF").toFixed(2), "surface",R(c,"#F5F7FB").toFixed(2));
}
// sombre : texte success/danger sur surfaces sombres
for (const c of ["#22C55E","#4ADE80"]) console.log("dark success",c,"card",R(c,"#11192C").toFixed(2),"surface",R(c,"#090E1C").toFixed(2));
for (const c of ["#F87171","#FCA5A5"]) console.log("dark danger ",c,"card",R(c,"#11192C").toFixed(2),"surface",R(c,"#090E1C").toFixed(2));
