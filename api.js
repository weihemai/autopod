/**
 * Podcast directory search & feed parsing.
 * ---------------------------------------------------------------
 * Both the iTunes Search API and most independent podcast RSS feeds
 * do not send CORS headers, so a static app cannot call them directly
 * from the browser (this was wrong in an earlier version of this
 * file — iTunes does NOT send permissive CORS headers). All calls
 * are routed through a small proxy service (see autopod-proxy/) that
 * fetches server-side and relays the result with CORS enabled.
 *
 * Set AUTOPOD_PROXY_URL below after deploying autopod-proxy.
 */

const AUTOPOD_PROXY_URL = 'https://autopod-proxy.onrender.com';

// PodcastIndex.org as a secondary directory source. Requires a signed
// request (API key + secret) that can't safely live in this public
// client code, so it's only used if you additionally deploy a proxy
// route for it and set this URL. Leave blank to skip — iTunes via
// the proxy above already covers the large majority of podcasts.
const PODCASTINDEX_PROXY_URL = '';

async function searchITunes(query){
  const url = AUTOPOD_PROXY_URL + '/search?limit=50&q=' + encodeURIComponent(query);
  const res = await fetch(url);
  if(!res.ok) throw new Error('Suche fehlgeschlagen: HTTP ' + res.status);
  const data = await res.json();
  return (data.results || []).map(r => ({
    id: 'itunes-' + r.collectionId,
    title: r.collectionName,
    author: r.artistName,
    artworkUrl: r.artworkUrl600 || r.artworkUrl100,
    feedUrl: r.feedUrl,
    source: 'itunes'
  })).filter(p => !!p.feedUrl);
}

async function searchPodcastIndex(query){
  if(!PODCASTINDEX_PROXY_URL) return [];
  try{
    const res = await fetch(PODCASTINDEX_PROXY_URL + '?q=' + encodeURIComponent(query));
    if(!res.ok) return [];
    const data = await res.json();
    return (data.feeds || []).map(f => ({
      id: 'pi-' + f.id,
      title: f.title,
      author: f.author,
      artworkUrl: f.artwork || f.image,
      feedUrl: f.url,
      source: 'podcastindex'
    })).filter(p => !!p.feedUrl);
  }catch(e){
    console.warn('PodcastIndex search unavailable', e);
    return [];
  }
}

// Combined search: both sources in parallel, deduplicated by feed URL.
async function searchPodcasts(query){
  const [itunesResults, piResults] = await Promise.all([
    searchITunes(query),
    searchPodcastIndex(query)
  ]);
  const seen = new Set();
  const combined = [];
  for(const p of [...itunesResults, ...piResults]){
    const key = p.feedUrl.replace(/^https?:\/\//,'').replace(/\/$/,'');
    if(seen.has(key)) continue;
    seen.add(key);
    combined.push(p);
  }
  return combined;
}

async function fetchFeedXml(feedUrl){
  const res = await fetch(AUTOPOD_PROXY_URL + '/feed?url=' + encodeURIComponent(feedUrl));
  if(!res.ok) throw new Error('Feed konnte nicht geladen werden: HTTP ' + res.status);
  const xmlText = await res.text();
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if(doc.querySelector('parsererror')) throw new Error('Feed-Format konnte nicht gelesen werden');
  return doc;
}

function textOf(el, selector){
  const node = el.querySelector(selector);
  return node ? node.textContent.trim() : '';
}

// Lightweight HTML sanitizer: keeps a small safe subset of tags for
// readable podcast/episode descriptions (paragraphs, links, lists,
// basic emphasis), unwraps everything else (keeping the text inside),
// strips all attributes except a validated http(s) href on <a>, and
// drops comments. Runs on a detached node, so embedded <script> tags
// never execute regardless of the input.
const SANITIZE_ALLOWED_TAGS = new Set(['P','BR','B','STRONG','I','EM','UL','OL','LI','A','BLOCKQUOTE','H3','H4','SPAN']);
function sanitizeHtml(html){
  if(!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  (function clean(node){
    [...node.childNodes].forEach(child=>{
      if(child.nodeType === 8){ node.removeChild(child); return; } // comment
      if(child.nodeType !== 1) return; // text node, keep as-is
      if(!SANITIZE_ALLOWED_TAGS.has(child.tagName)){
        while(child.firstChild) node.insertBefore(child.firstChild, child);
        node.removeChild(child);
        return;
      }
      [...child.attributes].forEach(attr=>{
        if(!(child.tagName === 'A' && attr.name === 'href')) child.removeAttribute(attr.name);
      });
      if(child.tagName === 'A'){
        const href = child.getAttribute('href') || '';
        if(/^https?:\/\//i.test(href)){
          child.setAttribute('target','_blank');
          child.setAttribute('rel','noopener noreferrer');
        }else{
          child.removeAttribute('href');
        }
      }
      clean(child);
    });
  })(tmp);
  return tmp.innerHTML.trim();
}

// Channel-level metadata (podcast title, artwork, author) — used to
// fill in subscriptions that only arrived as a bare feed URL from a
// gpodder pull, without a local search-result cache to draw from.
async function fetchFeedInfo(feedUrl){
  const doc = await fetchFeedXml(feedUrl);
  const channel = doc.querySelector('channel') || doc.documentElement;
  const itunesImage = channel.getElementsByTagName('itunes:image')[0];
  const descRaw = channel.getElementsByTagName('itunes:summary')[0]?.textContent || textOf(channel, 'description') || '';
  return {
    title: textOf(channel, 'title') || feedUrl,
    author: textOf(channel, 'itunes\\:author') || textOf(channel, 'author') || '',
    artworkUrl: (itunesImage && itunesImage.getAttribute('href')) || textOf(channel, 'image > url') || '',
    description: sanitizeHtml(descRaw)
  };
}

async function fetchEpisodes(feedUrl, limit){
  const doc = await fetchFeedXml(feedUrl);
  const items = Array.from(doc.querySelectorAll('item'));
  const sliced = limit ? items.slice(0, limit) : items;
  return sliced.map(item => {
    const enclosure = item.querySelector('enclosure');
    const guid = textOf(item, 'guid') || textOf(item, 'link') || (enclosure ? enclosure.getAttribute('url') : '');
    const durationRaw = item.getElementsByTagName('itunes:duration')[0]?.textContent || '';
    const descRaw = item.getElementsByTagName('content:encoded')[0]?.textContent
      || textOf(item, 'description')
      || item.getElementsByTagName('itunes:summary')[0]?.textContent || '';
    return {
      guid,
      title: textOf(item, 'title') || '(ohne Titel)',
      pubDate: textOf(item, 'pubDate'),
      audioUrl: enclosure ? enclosure.getAttribute('url') : null,
      duration: formatDuration(durationRaw),
      shownotes: sanitizeHtml(descRaw)
    };
  }).filter(e => !!e.audioUrl);
}

function formatDuration(raw){
  if(!raw) return '';
  if(raw.includes(':')) return raw; // already "H:MM:SS" or "MM:SS"
  const totalSec = parseInt(raw, 10);
  if(!isFinite(totalSec)) return '';
  const m = Math.floor(totalSec / 60);
  return m + ' Min';
}

function formatPubDate(raw){
  if(!raw) return '';
  const d = new Date(raw);
  if(isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(currentLang() === 'en' ? 'en-US' : 'de-DE', { day:'2-digit', month:'short', year:'numeric' });
}
