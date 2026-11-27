/**
 * Script inline exécuté avant le premier rendu : applique le thème choisi
 * (localStorage) ou la préférence système, pour éviter le « flash » clair.
 * Aucun accès réseau, aucune donnée personnelle.
 *
 * Trois choix sont possibles : `light`, `dark` et `system` (« comme le
 * système »). Le cas `system` doit **suivre la préférence du système** :
 * le traiter comme « pas sombre » forcerait l'interface en clair à chaque
 * rechargement de page — c'est-à-dire à chaque clic sur « Filtrer », qui
 * recharge la page entière.
 */
const SCRIPT = `(function(){try{
var K="teu-theme";
function lire(){try{return localStorage.getItem(K);}catch(e){return null;}}
function sombreSysteme(){try{return window.matchMedia("(prefers-color-scheme: dark)").matches;}catch(e){return false;}}
function appliquer(){var v=lire();var sombre=v==="dark"?true:(v==="light"?false:sombreSysteme());document.documentElement.classList.toggle("dark",sombre);}
appliquer();
var m=window.matchMedia("(prefers-color-scheme: dark)");
if(m&&m.addEventListener){m.addEventListener("change",function(e){var v=lire();if(!v||v==="system"){document.documentElement.classList.toggle("dark",e.matches);}});}
}catch(e){}})();`;

export function ThemeScript() {
  return <script id="teu-theme-script" dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
