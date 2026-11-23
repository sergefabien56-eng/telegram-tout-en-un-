/**
 * Script inline exécuté avant le premier rendu : applique le thème choisi
 * (localStorage) ou la préférence système, pour éviter le « flash » clair.
 * Aucun accès réseau, aucune donnée personnelle.
 */
const SCRIPT = `(function(){try{var v=localStorage.getItem("teu-theme");var d=v?v==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d){document.documentElement.classList.add("dark")}else{document.documentElement.classList.remove("dark")}}catch(e){}})();`;

export function ThemeScript() {
  return <script id="teu-theme-script" dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
