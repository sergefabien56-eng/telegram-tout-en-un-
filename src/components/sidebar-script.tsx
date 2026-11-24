/**
 * Script inline exécuté avant le premier rendu : rétablit l'état de la barre
 * latérale (`rail` ou `open`) stocké dans `localStorage`.
 * Aucun accès réseau, aucune donnée personnelle.
 */
const SCRIPT = `(function(){try{var v=localStorage.getItem("teu_sidebar");document.documentElement.dataset.sidebar=v==="rail"?"rail":"open"}catch(e){document.documentElement.dataset.sidebar="open"}})();`;

export function SidebarScript() {
  return <script id="teu-sidebar-script" dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
