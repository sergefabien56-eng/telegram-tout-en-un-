const rgb=(h)=>[0,2,4].map(i=>parseInt(h.replace("#","").slice(i,i+2),16));
const lum=([r,g,b])=>{const f=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
const R=(a,b)=>{const[x,y]=[lum(rgb(a)),lum(rgb(b))].sort((p,q)=>q-p);return (x+.05)/(y+.05)};
for (const c of ["#588CFA","#4A7EF0","#3B6FE0","#2F63D6"]) {
  console.log(c,"blanc/bouton",R("#FFFFFF",c).toFixed(2),"primary/surface(texte)",R(c,"#090E1C").toFixed(2),"link/surface2",R(c,"#11192C").toFixed(2));
}
console.log("--- primaire clair ---");
console.log("#1765F5 blanc",R("#FFFFFF","#1765F5").toFixed(2));
