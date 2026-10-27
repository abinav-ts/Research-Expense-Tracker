// Page shell and stylesheet for the documentation site. Colours and font stacks come only from brand/tokens.css, which the
// build copies in front of this CSS, so a palette change in brand/ changes these pages too. No logo and no slogan here:
// those live in the app (specs/07-branding.md).
import { escapeHtml } from './markdown.ts';

export const SITE_NAME = 'ExpRes · viva documents';

export type NavKey = 'home' | 'viva' | 'transcript';
const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: 'home', href: 'index.html', label: 'Home' },
  { key: 'viva', href: 'viva-sheet.html', label: 'Viva sheet' },
  { key: 'transcript', href: 'transcript.html', label: 'Transcripts' },
];

export const STYLES = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:72px}
body{margin:0;background:var(--ex-ground);color:var(--ex-ink);font:16px/1.65 var(--ex-font-ui)}
:focus-visible{outline:3px solid var(--ex-breeze);outline-offset:2px}
a{color:var(--ex-breeze-deep)}
.wrap{max-width:46rem;margin:0 auto;padding:0 16px 4rem}
.wrap.wide{max-width:62rem}

header.site{background:var(--ex-ink);color:var(--ex-on-dark)}
header.site .wrap{display:flex;flex-wrap:wrap;align-items:center;gap:4px 16px;padding-top:8px;padding-bottom:8px}
.site-name{font:700 1.1rem var(--ex-font-display);margin-right:auto}
header.site nav{display:flex;flex-wrap:wrap;gap:4px}
header.site nav a{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border-radius:10px;color:var(--ex-on-dark);text-decoration:none}
header.site nav a:hover{background:color-mix(in srgb,var(--ex-on-dark) 14%,transparent)}
header.site nav a[aria-current=page]{background:color-mix(in srgb,var(--ex-on-dark) 22%,transparent);font-weight:600}

h1,h2,h3,h4{font-family:var(--ex-font-display);line-height:1.2;color:var(--ex-ink)}
h1{font-size:clamp(1.9rem,6vw,2.7rem);margin:2rem 0 .5rem;font-weight:700}
h2{font-size:1.5rem;margin:2.75rem 0 .75rem;padding-top:1.25rem;border-top:2px solid var(--ex-line);font-weight:700}
h3{font-size:1.15rem;margin:1.9rem 0 .5rem;font-weight:600}
h4{font-size:1rem;margin:1.4rem 0 .4rem}
.anchor{margin-left:.4em;font-size:.8em;text-decoration:none;opacity:0}
h2:hover .anchor,h3:hover .anchor,.anchor:focus{opacity:.7}
p,li,td,th,blockquote{overflow-wrap:anywhere}
li{margin:.25rem 0}
li>p{margin:.3rem 0}
.lead{font-size:1.1rem;color:var(--ex-ink-soft)}
.meta-line{color:var(--ex-ink-soft);font-size:.9rem}

code,pre{font-family:ui-monospace,monospace}
:not(pre)>code{font-size:.88em;background:color-mix(in srgb,var(--ex-ink) 7%,var(--ex-surface));padding:.1em .35em;border-radius:5px}
pre{font-size:.84rem;line-height:1.5;background:color-mix(in srgb,var(--ex-ink) 5%,var(--ex-surface));border:1px solid var(--ex-line);border-radius:10px;padding:12px 14px;overflow-x:auto;margin:1rem 0}
.table-wrap{overflow-x:auto;margin:1.1rem 0;border:1px solid var(--ex-line);border-radius:10px;background:var(--ex-surface)}
table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{padding:9px 12px;border-bottom:1px solid var(--ex-line);text-align:left;vertical-align:top}
th{background:color-mix(in srgb,var(--ex-ink) 6%,var(--ex-surface));font-weight:600}
tr:last-child td{border-bottom:0}
blockquote{margin:1.1rem 0;padding:.3rem 1rem;border-left:4px solid var(--ex-breeze);background:color-mix(in srgb,var(--ex-breeze) 7%,var(--ex-surface));border-radius:0 10px 10px 0}
blockquote p{margin:.5rem 0}
hr{border:0;border-top:1px solid var(--ex-line);margin:2rem 0}

.toc{background:var(--ex-surface);border:1px solid var(--ex-line);border-radius:14px;padding:12px 18px;margin:1.5rem 0}
.toc strong{font:600 .8rem var(--ex-font-ui);letter-spacing:.06em;text-transform:uppercase;color:var(--ex-ink-soft)}
.toc ul{list-style:none;margin:.4rem 0 0;padding:0;columns:16rem;column-gap:24px}
.toc a{display:block;padding:8px 0;text-decoration:none;break-inside:avoid}
.toc a:hover{text-decoration:underline}

.cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));margin:2rem 0}
.card{display:block;background:var(--ex-surface);border:1px solid var(--ex-line);border-radius:16px;padding:20px;text-decoration:none;color:var(--ex-ink)}
.card:hover{border-color:var(--ex-breeze)}
.card h2{margin:0 0 .4rem;padding:0;border:0;font-size:1.3rem}
.card p{margin:.3rem 0;color:var(--ex-ink-soft)}
.card .go{margin-top:.8rem;font-weight:600;color:var(--ex-breeze-deep)}

.toolbar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 0;background:var(--ex-ground)}
.toolbar a{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;color:var(--ex-ink);background:var(--ex-surface);border:1px solid var(--ex-line);border-radius:10px;text-decoration:none}
.toolbar a:hover{border-color:var(--ex-breeze)}
button{min-height:44px;padding:0 16px;font:inherit;color:var(--ex-ink);background:var(--ex-surface);border:1px solid var(--ex-line);border-radius:10px;cursor:pointer}
button:hover{border-color:var(--ex-breeze)}
.part-head{margin-top:3rem}
.part-count{color:var(--ex-ink-soft);font-size:.9rem}
.turn{background:var(--ex-surface);border:1px solid var(--ex-line);border-radius:14px;margin:14px 0;padding:12px 16px}
.turn-head{font:600 .8rem var(--ex-font-ui);margin:0 0 6px;letter-spacing:.04em}
.turn-head a{color:var(--ex-ink-soft);text-decoration:none}
.who{font:700 .74rem var(--ex-font-ui);letter-spacing:.07em;text-transform:uppercase;color:var(--ex-breeze-deep)}
.prompt{border-left:4px solid var(--ex-breeze);padding:2px 0 2px 12px;margin:.25rem 0 .5rem}
.prompt p{margin:.4rem 0}
details.response>summary{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-height:44px;cursor:pointer;list-style:none}
details.response>summary::-webkit-details-marker{display:none}
details.response>summary::before{content:'▸';color:var(--ex-ink-soft)}
details.response[open]>summary::before{content:'▾'}
.preview{flex:1 1 14rem;color:var(--ex-ink-soft);font-size:.9rem;overflow-wrap:anywhere}
.meta{font-size:.78rem;color:var(--ex-ink-soft);border:1px solid var(--ex-line);border-radius:999px;padding:0 8px}
.response-body{border-top:1px solid var(--ex-line);margin-top:4px;padding-top:6px}
details.tool{margin:.35rem 0}
details.tool>summary{display:flex;align-items:center;min-height:44px;cursor:pointer;color:var(--ex-ink-soft);font-size:.88rem;overflow-wrap:anywhere}
details.tool pre{margin:.25rem 0 .6rem}
.note{color:var(--ex-ink-soft);font-size:.86rem}
.callout{background:var(--ex-surface);border:1px solid var(--ex-line);border-left:4px solid var(--ex-state-low);border-radius:10px;padding:10px 16px;margin:1.2rem 0}
.callout p{margin:.4rem 0}
footer{margin-top:4rem;color:var(--ex-ink-soft);font-size:.85rem}

@media print{
  header.site,.toolbar,.anchor{display:none}
  body{background:transparent;font-size:11pt}
  .wrap{max-width:none;padding:0}
  a{color:inherit}
  pre{white-space:pre-wrap}
  h2,h3{break-after:avoid}
  table,pre,blockquote,.turn{break-inside:avoid}
}
`;

const SCRIPT = `
(function(){
  function setAll(open){document.querySelectorAll('details.response').forEach(function(d){d.open=open})}
  document.querySelectorAll('[data-expand]').forEach(function(b){b.addEventListener('click',function(){setAll(b.getAttribute('data-expand')==='all')})});
  function reveal(){
    var id=decodeURIComponent(location.hash.slice(1));
    var el=id&&document.getElementById(id);
    for(var n=el;n;n=n.parentElement){if(n.tagName==='DETAILS')n.open=true}
    if(el)el.scrollIntoView();
  }
  addEventListener('hashchange',reveal);reveal();
})();
`;

export interface PageOptions {
  title: string;
  description: string;
  nav: NavKey;
  body: string;
  wide?: boolean;
  /** The full stylesheet, to put inside the page so the file works on its own (a copy opened anywhere keeps its look). */
  standaloneCss?: string;
}

export function page({ title, description, nav, body, wide, standaloneCss }: PageOptions): string {
  const style = standaloneCss ? `<style>${standaloneCss}</style>` : '<link rel="stylesheet" href="assets/site.css">';
  const links = NAV.map((n) => `<a href="${n.href}"${n.key === nav ? ' aria-current="page"' : ''}>${n.label}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="description" content="${escapeHtml(description)}">
<title>${escapeHtml(title)}</title>
${style}
</head>
<body>
<header class="site"><div class="wrap${wide ? ' wide' : ''}"><span class="site-name">${SITE_NAME}</span><nav aria-label="Pages">${links}</nav></div></header>
<main class="wrap${wide ? ' wide' : ''}">
${body}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
