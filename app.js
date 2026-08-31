/*
   VERSIONING: bump APP_VERSION on every meaningful change from here on
*/
const APP_VERSION = '0.7.4';

// ---- --vh fix for embedded car browsers with unreliable 100vh ----
function setVh(){
  document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
}
setVh();
window.addEventListener('resize', setVh);
window.addEventListener('orientationchange', setVh);

// ---- Theme: system by default, optional override ----
function applyTheme(){
  const override = localStorage.getItem('autopod_theme'); // 'light' | 'dark' | null (=system)
  if(override){
    document.documentElement.setAttribute('data-theme', override);
  }else{
    document.documentElement.removeAttribute('data-theme'); // let the media query decide
  }
}
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{
  if(!localStorage.getItem('autopod_theme')) applyTheme();
});

// ---- Accent color ----
function applyAccent(){
  const accent = localStorage.getItem('autopod_accent') || 'orange';
  if(accent === 'blue') document.documentElement.removeAttribute('data-accent');
  else document.documentElement.setAttribute('data-accent', accent);
}
applyAccent();

// ---- Font size ----
function applyFontSize(){
  const size = localStorage.getItem('autopod_fontsize') || 'normal';
  if(size === 'normal') document.documentElement.removeAttribute('data-fontsize');
  else document.documentElement.setAttribute('data-fontsize', size);
}
applyFontSize();

// ---- State ----
const state = {
  subscriptions: JSON.parse(localStorage.getItem('autopod_subscriptions') || '[]'),
  queue: JSON.parse(localStorage.getItem('autopod_queue') || '[]'),
  currentEpisode: null,
  isPlaying: false,
  navStack: ['home']
};

function saveSubscriptions(){ localStorage.setItem('autopod_subscriptions', JSON.stringify(state.subscriptions)); }
function saveQueue(){ localStorage.setItem('autopod_queue', JSON.stringify(state.queue)); }

function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showLoading(){ document.getElementById('headerProgressTrack').style.display = 'block'; }
function hideLoading(){ document.getElementById('headerProgressTrack').style.display = 'none'; }
function spinnerHtml(){
  return `<div class="loading-spinner"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.6" fill="none" stroke-dasharray="42 14" stroke-linecap="round"/></svg></div>`;
}

// ---- Navigation ----
const screens = ['home','search','subscriptions','show','inbox','queue','nowplaying'];
function showScreen(name){
  screens.forEach(s => {
    document.getElementById('screen-' + s).style.display = (s === name) ? 'flex' : 'none';
  });
  document.getElementById('backBtn').classList.toggle('show', name !== 'home');
  document.getElementById('appTitle').classList.toggle('hide', name !== 'home');
}
function navigateTo(name){
  state.navStack.push(name);
  showScreen(name);
}
function navigateBack(){
  if(state.navStack.length > 1) state.navStack.pop();
  showScreen(state.navStack[state.navStack.length - 1] || 'home');
}
document.getElementById('backBtn').addEventListener('click', navigateBack);

// ---- Idle timeout: auto-return to Home if no interaction ----
let idleTimer = null;
function idleTimeoutSeconds(){ return parseInt(localStorage.getItem('autopod_idle_timeout') || '20', 10); }
function resetIdleTimer(){
  if(idleTimer) clearTimeout(idleTimer);
  const secs = idleTimeoutSeconds();
  if(!secs) return; // 0 = off
  idleTimer = setTimeout(()=>{
    if(state.navStack[state.navStack.length-1] !== 'home'){
      state.navStack = ['home'];
      showScreen('home');
    }
  }, secs * 1000);
}
['click','touchstart','keydown','input'].forEach(evt=>{
  document.addEventListener(evt, resetIdleTimer, { passive:true });
});
resetIdleTimer();

document.querySelectorAll('[data-nav]').forEach(tile=>{
  tile.addEventListener('click', ()=>{
    const target = tile.getAttribute('data-nav');
    navigateTo(target);
    if(target === 'subscriptions') renderSubscriptions();
    if(target === 'inbox') renderInbox();
    if(target === 'queue') renderQueue();
  });
});

// ---- Search ----
const podcastMetaCache = new Map(); // feedUrl -> {title, artworkUrl, author}, populated from search results
let searchTimer = null;
document.getElementById('searchInput').addEventListener('input', (e)=>{
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if(q.length < 2){ document.getElementById('searchResults').innerHTML=''; return; }
  searchTimer = setTimeout(()=>runSearch(q), 450);
});

const SEARCH_PAGE_SIZE = 10;
let searchAllResults = [];
let searchShownCount = 0;

async function runSearch(query){
  const list = document.getElementById('searchResults');
  list.innerHTML = spinnerHtml();
  showLoading();
  try{
    const results = await searchPodcasts(query);
    if(!results.length){ list.innerHTML = `<div class="empty-state">${t('emptySearch')}</div>`; return; }
    results.forEach(p => podcastMetaCache.set(p.feedUrl, { title:p.title, artworkUrl:p.artworkUrl, author:p.author }));
    searchAllResults = results;
    searchShownCount = 0;
    renderSearchResultsPage();
  }catch(e){
    list.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
  }finally{
    hideLoading();
  }
}

async function renderSearchResultsPage(){
  const list = document.getElementById('searchResults');
  searchShownCount = Math.min(searchShownCount + SEARCH_PAGE_SIZE, searchAllResults.length);
  const visible = searchAllResults.slice(0, searchShownCount);
  const remaining = searchAllResults.length - searchShownCount;

  list.innerHTML = visible.map(p => `
      <div class="result-row" data-feed="${escapeHtml(p.feedUrl)}" style="cursor:pointer;">
        <div class="result-art" style="background-image:url('${escapeHtml(p.artworkUrl||'')}')"></div>
        <div class="result-meta">
          <div class="t">${escapeHtml(p.title)}</div>
          <div class="a">${escapeHtml(p.author||'')}</div>
          <div class="desc" data-desc-for="${escapeHtml(p.feedUrl)}">${p.description !== undefined ? (p.description || '') : '…'}</div>
        </div>
        <div class="result-actions">
          <button class="icon-btn" data-sub="${escapeHtml(p.feedUrl)}" data-title="${escapeHtml(p.title)}" data-art="${escapeHtml(p.artworkUrl||'')}" data-author="${escapeHtml(p.author||'')}" aria-label="${t('addToQueue')}">+</button>
        </div>
      </div>`).join('')
    + (remaining > 0 ? `<button class="seg-btn" id="searchShowMoreBtn" style="padding:14px;">${t('showMore')} (+${Math.min(SEARCH_PAGE_SIZE, remaining)})</button>` : '');

  list.querySelectorAll('[data-sub]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      subscribe(btn.dataset.sub, btn.dataset.title, btn.dataset.art, btn.dataset.author);
      btn.textContent = '✓';
      btn.disabled = true;
    });
  });
  list.querySelectorAll('.result-row[data-feed]').forEach(row=>{
    row.addEventListener('click', ()=> openShow(row.dataset.feed));
  });
  const moreBtn = document.getElementById('searchShowMoreBtn');
  if(moreBtn) moreBtn.addEventListener('click', renderSearchResultsPage);

  // Resolve podcast descriptions for whichever results are newly
  // visible and not cached yet — cheap-ish parallel fetch via the proxy.
  const newlyVisible = visible.filter(p => p.description === undefined);
  if(newlyVisible.length){
    await Promise.all(newlyVisible.map(async p => {
      try{
        const info = await fetchFeedInfo(p.feedUrl);
        p.description = info.description || '';
      }catch{ p.description = ''; }
      const el = list.querySelector(`[data-desc-for="${CSS.escape(p.feedUrl)}"]`);
      if(el) el.innerHTML = p.description || '';
    }));
  }
}

function subscribe(feedUrl, title, artworkUrl, author){
  if(state.subscriptions.some(s => s.feedUrl === feedUrl)) return;
  state.subscriptions.push({ feedUrl, title, artworkUrl, author });
  saveSubscriptions();
  if(gpodderConfigured()) gpodderPushSubscriptionChange([feedUrl], []).catch(e=>console.warn('gpodder push failed', e));
}
function unsubscribe(feedUrl){
  state.subscriptions = state.subscriptions.filter(s => s.feedUrl !== feedUrl);
  saveSubscriptions();
  if(gpodderConfigured()) gpodderPushSubscriptionChange([], [feedUrl]).catch(e=>console.warn('gpodder push failed', e));
}

// ---- Subscriptions screen ----
function renderSubscriptions(){
  const list = document.getElementById('subscriptionsList');
  if(!state.subscriptions.length){
    list.innerHTML = `<div class="empty-state">${t('emptySubscriptions')}</div>`;
    return;
  }
  list.innerHTML = state.subscriptions.map(s => `
    <div class="subs-card" data-feed="${escapeHtml(s.feedUrl)}">
      <div class="subs-art" style="background-image:url('${escapeHtml(s.artworkUrl||'')}')"></div>
      <div class="subs-title">${escapeHtml(s.title)}</div>
    </div>`).join('');
  list.querySelectorAll('.subs-card').forEach(card=>{
    card.addEventListener('click', ()=> openShow(card.dataset.feed));
  });
}

function renderShowHeader(sub, expanded=false){
  const header = document.getElementById('showHeader');
  header.innerHTML = `
    <div class="show-art" style="background-image:url('${escapeHtml(sub.artworkUrl||'')}')"></div>
    <div>
      <div class="show-title">${escapeHtml(sub.title)}</div>
      <div class="show-sub">${escapeHtml(sub.author||'')}</div>
      <div class="show-description">${sub.description||''}</div>
    </div>`;
  header.classList.toggle('expanded', expanded);
  header.onclick = ()=> header.classList.toggle('expanded');
}

// ---- Played-episode tracking ----
const playedGuids = new Set(JSON.parse(localStorage.getItem('autopod_played') || '[]'));
const playedMeta = new Map(JSON.parse(localStorage.getItem('autopod_played_meta') || '[]'));
function markPlayed(ep){
  if(!ep || !ep.guid) return;
  playedGuids.add(ep.guid);
  localStorage.setItem('autopod_played', JSON.stringify([...playedGuids]));
  if(ep.feedUrl && ep.audioUrl){
    playedMeta.set(ep.guid, { feedUrl: ep.feedUrl, audioUrl: ep.audioUrl, duration: audioEl.duration || 0 });
    localStorage.setItem('autopod_played_meta', JSON.stringify([...playedMeta]));
  }
}

// ---- Playback positions pulled from gpodder/AntennaPod ----
// Keyed by episode audio URL (gpodder identifies episodes by media
// URL, not by our local RSS guid), so progress bars and resume-on-play
// work for episodes played on other devices, not just this one.
const positionsByUrl = new Map(JSON.parse(localStorage.getItem('autopod_positions') || '[]'));
function savePositions(){ localStorage.setItem('autopod_positions', JSON.stringify([...positionsByUrl])); }

async function pullPositionsFromGpodder(){
  if(!gpodderConfigured()) return { ok:false, reason:'not configured' };
  try{
    const since = localStorage.getItem('autopod_gpodder_actions_since') || '';
    const { actions, timestamp } = await gpodderPullEpisodeActions(since || undefined);
    for(const a of actions){
      if(a.action === 'play' && a.episode){
        const prev = positionsByUrl.get(a.episode);
        // A newer action always wins; if timestamps are missing/equal, prefer the higher position.
        if(!prev || !prev.timestamp || !a.timestamp || a.timestamp >= prev.timestamp || (a.position||0) > (prev.position||0)){
          positionsByUrl.set(a.episode, { position: a.position||0, total: a.total||0, feedUrl: a.podcast||'', timestamp: a.timestamp||'' });
        }
      }
    }
    savePositions();
    if(timestamp) localStorage.setItem('autopod_gpodder_actions_since', String(timestamp));
    return { ok:true, count: actions.length };
  }catch(e){
    console.warn('pullPositionsFromGpodder failed', e);
    return { ok:false, reason: e.message };
  }
}

// ---- Shared expandable episode card component ----
// Used by the show-detail episode list, the Inbox, and the Queue.
// Episodes are kept in an in-memory cache (not in DOM data-attributes)
// since shownotes can be long/contain characters awkward to shove
// into HTML attributes.
const episodeCache = new Map(); // cardId -> full episode object

function episodeCardHtml(ep, cardId, opts={}){
  episodeCache.set(cardId, ep);
  const pos = ep.audioUrl ? positionsByUrl.get(ep.audioUrl) : null;
  const played = (ep.guid && playedGuids.has(ep.guid)) || (pos && pos.total && pos.position >= pos.total * 0.95);
  const progressPct = (pos && pos.total) ? Math.min(100, Math.round(pos.position / pos.total * 100)) : 0;
  const showRemove = !!opts.showRemove;
  return `
    <div class="ep-card${played ? ' played' : ''}" data-card-id="${cardId}">
      <div class="ep-card-top">
        <div class="ep-art" data-goto-show="1" style="background-image:url('${escapeHtml(ep.artworkUrl||'')}')"></div>
        <button class="play-btn" data-play-card aria-label="${t('playNow')}">▶</button>
        <div class="ep-card-body">
          <div class="t">${escapeHtml(ep.title)}</div>
          ${ep.showTitle ? `<div class="show-name">${escapeHtml(ep.showTitle)}</div>` : ''}
          <div class="meta"><span>${escapeHtml(formatPubDate(ep.pubDate))}</span>${ep.duration ? `<span>${escapeHtml(ep.duration)}</span>` : ''}</div>
          <div class="prog"><div class="prog-fill" style="width:${progressPct}%"></div></div>
        </div>
        <div class="ep-card-actions">
          ${showRemove
            ? `<button class="action-btn remove-btn" data-remove-card aria-label="${t('removeFromQueue')}">✕</button>`
            : `<button class="action-btn" data-addqueue-card aria-label="${t('addToQueue')}">+</button>`}
        </div>
      </div>
      <div class="ep-card-shownotes">${ep.shownotes || ''}</div>
    </div>`;
}

function wireEpisodeCards(container, opts={}){
  container.querySelectorAll('.ep-card').forEach(card => {
    const ep = episodeCache.get(card.dataset.cardId);
    if(!ep) return;
    card.addEventListener('click', (ev)=>{
      if(ev.target.closest('[data-play-card]') || ev.target.closest('[data-addqueue-card]') || ev.target.closest('[data-remove-card]') || ev.target.closest('[data-goto-show]')) return;
      card.classList.toggle('expanded');
    });
    const playBtn = card.querySelector('[data-play-card]');
    playBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); playEpisode(ep); });
    const addBtn = card.querySelector('[data-addqueue-card]');
    if(addBtn){
      addBtn.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        addToQueue(ep);
        addBtn.textContent = '✓';
      });
    }
    const removeBtn = card.querySelector('[data-remove-card]');
    if(removeBtn){
      removeBtn.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        removeFromQueue(ep.guid);
        if(opts.onRemove) opts.onRemove();
      });
    }
    const gotoShow = card.querySelector('[data-goto-show]');
    if(gotoShow && ep.feedUrl){
      gotoShow.addEventListener('click', (ev)=>{ ev.stopPropagation(); openShow(ep.feedUrl); });
    }
  });
}

// ---- Show detail / episodes ----
let showAllEpisodes = [];
let showShownCount = 0;
let showCurrentSub = null;
let showRequestId = 0; // guards against out-of-order responses when switching podcasts quickly

async function openShow(feedUrl){
  const myRequestId = ++showRequestId;
  let sub = state.subscriptions.find(s => s.feedUrl === feedUrl)
    || podcastMetaCache.get(feedUrl)
    || { feedUrl, title: '…', artworkUrl:'', author:'' };
  sub = { feedUrl, ...sub };
  navigateTo('show');
  renderShowHeader(sub);
  // Clear the previous podcast's episode list immediately so it can't
  // stay on screen while the new one is still loading.
  const list = document.getElementById('episodesList');
  list.innerHTML = spinnerHtml();
  showAllEpisodes = [];
  showShownCount = 0;
  showLoading();

  try{
    const info = await fetchFeedInfo(feedUrl);
    if(myRequestId !== showRequestId) return; // a newer openShow() call has since taken over
    sub = { feedUrl, ...sub, ...info, title: sub.title === '…' ? info.title : sub.title };
    renderShowHeader(sub);
  }catch(e){ console.warn('Could not resolve show metadata', e); }

  showCurrentSub = sub;
  try{
    const episodes = await fetchEpisodes(feedUrl, null); // fetch full feed once, page client-side
    if(myRequestId !== showRequestId) return; // stale response, a newer podcast is now open
    showAllEpisodes = episodes.map(e => ({ ...e, feedUrl, showTitle: sub.title, artworkUrl: sub.artworkUrl }));
    showShownCount = 0;
    if(!showAllEpisodes.length){ list.innerHTML = `<div class="empty-state">${t('noEpisodesFound')}</div>`; return; }
    renderShowEpisodesPage();
  }catch(e){
    if(myRequestId !== showRequestId) return;
    list.innerHTML = `<div class="empty-state">${t('feedLoadFailed')}: ${escapeHtml(e.message)}</div>`;
  }finally{
    if(myRequestId === showRequestId) hideLoading();
  }
}

function renderShowEpisodesPage(){
  const list = document.getElementById('episodesList');
  const pageSize = parseInt(localStorage.getItem('autopod_episode_limit') || '10', 10) || showAllEpisodes.length;
  showShownCount = Math.min(showShownCount + pageSize, showAllEpisodes.length);
  const visible = showAllEpisodes.slice(0, showShownCount);
  const remaining = showAllEpisodes.length - showShownCount;

  list.innerHTML = visible.map((e,i) => episodeCardHtml(e, 'show-' + i)).join('')
    + (remaining > 0 ? `<button class="load-more-btn" id="showLoadMoreBtn">${t('loadMore')} (+${Math.min(pageSize, remaining)})</button>` : '');
  wireEpisodeCards(list);
  const moreBtn = document.getElementById('showLoadMoreBtn');
  if(moreBtn) moreBtn.addEventListener('click', renderShowEpisodesPage);
}

// ---- Inbox (aggregated new episodes across all subscriptions) ----
let inboxAllEpisodes = [];
let inboxShownCount = 0;

async function renderInbox(){
  const list = document.getElementById('inboxList');
  if(!state.subscriptions.length){ list.innerHTML = `<div class="empty-state">${t('emptySubscriptions')}</div>`; return; }
  list.innerHTML = spinnerHtml();
  showLoading();
  try{
    const perShow = await Promise.all(state.subscriptions.map(async s => {
      try{
        const eps = await fetchEpisodes(s.feedUrl, 10);
        return eps.map(e => ({ ...e, showTitle: s.title, feedUrl: s.feedUrl, artworkUrl: s.artworkUrl }));
      }catch{ return []; }
    }));
    inboxAllEpisodes = perShow.flat().sort((a,b)=> new Date(b.pubDate) - new Date(a.pubDate));
    inboxShownCount = 0;
    if(!inboxAllEpisodes.length){ list.innerHTML = `<div class="empty-state">${t('emptyInbox')}</div>`; return; }
    renderInboxPage();
  }catch(e){
    list.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
  }finally{
    hideLoading();
  }
}

const INBOX_PAGE_SIZE = 10;
function renderInboxPage(){
  const list = document.getElementById('inboxList');
  inboxShownCount = Math.min(inboxShownCount + INBOX_PAGE_SIZE, inboxAllEpisodes.length);
  const visible = inboxAllEpisodes.slice(0, inboxShownCount);
  const remaining = inboxAllEpisodes.length - inboxShownCount;

  list.innerHTML = visible.map((e,i) => episodeCardHtml(e, 'inbox-' + i)).join('')
    + (remaining > 0 ? `<button class="load-more-btn" id="inboxLoadMoreBtn">${t('showMore')} (+${Math.min(INBOX_PAGE_SIZE, remaining)})</button>` : '');
  wireEpisodeCards(list);
  const moreBtn = document.getElementById('inboxLoadMoreBtn');
  if(moreBtn) moreBtn.addEventListener('click', renderInboxPage);
}

// Resolve real title/artwork/author for any subscription that only
// has a bare feed URL (e.g. freshly pulled from gpodder, which only
// hands back URLs, not metadata). Runs in the background and
// re-renders the subscriptions screen if it's currently visible.
async function resolveUnknownSubscriptionMetadata(){
  const unresolved = state.subscriptions.filter(s => !s.title || s.title === s.feedUrl);
  if(!unresolved.length) return;
  await Promise.all(unresolved.map(async s => {
    try{
      const info = await fetchFeedInfo(s.feedUrl);
      Object.assign(s, info);
    }catch(e){ console.warn('Could not resolve metadata for', s.feedUrl, e); }
  }));
  saveSubscriptions();
  if(document.getElementById('screen-subscriptions').style.display !== 'none') renderSubscriptions();
}

// ---- Queue ----
function addToQueue(episode){
  if(state.queue.some(e => e.guid === episode.guid)) return;
  state.queue.push(episode);
  saveQueue();
  syncQueueToGpodder();
}
function removeFromQueue(guid){
  state.queue = state.queue.filter(e => e.guid !== guid);
  saveQueue();
  syncQueueToGpodder();
}
function syncQueueToGpodder(){
  if(!gpodderConfigured()) return;
  gpodderPushQueue(state.queue.map(e => e.guid)).catch(e=>console.warn('gpodder queue sync failed', e));
}
function renderQueue(){
  const list = document.getElementById('queueList');
  document.getElementById('queueLabel').textContent = `${t('queue')} · ${state.queue.length}`;
  if(!state.queue.length){ list.innerHTML = `<div class="empty-state">${t('emptyQueue')}</div>`; return; }
  list.innerHTML = state.queue.map((e,i) => episodeCardHtml(e, 'queue-' + i, { showRemove:true })).join('');
  wireEpisodeCards(list, { onRemove: renderQueue });
}

// ---- Player ----
const audioEl = new Audio();
let progressTimer = null;

function fmtTime(sec){
  if(!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec/60), s = Math.floor(sec%60);
  return m + ':' + String(s).padStart(2,'0');
}

function playEpisode(ep){
  // Report the previous episode's final position before switching, so
  // a partial listen isn't lost from gpodder's perspective.
  reportPlaybackPosition();
  state.currentEpisode = ep;
  audioEl.src = ep.audioUrl;
  audioEl.play().catch(e=>console.warn('play() failed', e));
  document.getElementById('playerEpisode').textContent = ep.title;
  document.getElementById('playerShow').textContent = ep.showTitle || '';
  document.getElementById('playerArt').style.backgroundImage = ep.artworkUrl ? `url('${ep.artworkUrl}')` : 'none';
  document.getElementById('playerStatus').textContent = '';
  setPlayIcon('spinner');
  updateMediaSessionMetadata(ep);

  // Resume from a position synced in from AntennaPod/gpodder, if any.
  const pos = ep.audioUrl ? positionsByUrl.get(ep.audioUrl) : null;
  if(pos && pos.position > 0 && (!pos.total || pos.position < pos.total * 0.95)){
    const resumeTo = pos.position;
    const onLoaded = ()=>{ audioEl.currentTime = resumeTo; audioEl.removeEventListener('loadedmetadata', onLoaded); };
    audioEl.addEventListener('loadedmetadata', onLoaded);
  }
}

// ---- MediaSession: show real title/cover in the car's native media
// widget, and let the steering wheel skip/play/pause buttons control
// playback (the car maps its physical controls to these standard
// browser media-session actions, not to on-page button clicks).
function guessImageMimeType(url){
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
  if(ext === 'png') return 'image/png';
  if(ext === 'webp') return 'image/webp';
  if(ext === 'gif') return 'image/gif';
  return 'image/jpeg'; // most podcast artwork is jpg — safe default over the previous hardcoded png
}

function updateMediaSessionMetadata(ep){
  if(!('mediaSession' in navigator) || !ep) return;
  try{
    const type = ep.artworkUrl ? guessImageMimeType(ep.artworkUrl) : '';
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ep.title || 'Autopod',
      artist: ep.showTitle || '',
      album: ep.showTitle || '',
      // We don't know the real pixel dimensions of podcast artwork
      // ahead of time, so declare the same image under several common
      // sizes — the OS picks whichever matches its widget best rather
      // than skipping the artwork entirely for a size mismatch.
      artwork: ep.artworkUrl ? [96,128,192,256,384,512].map(s => ({
        src: ep.artworkUrl, sizes: `${s}x${s}`, type
      })) : []
    });
  }catch(e){ /* MediaMetadata not supported in this browser: ignore */ }
}
function setMediaSessionPlaybackState(state){
  if('mediaSession' in navigator){
    try{ navigator.mediaSession.playbackState = state; }catch(e){}
  }
}
if('mediaSession' in navigator){
  try{
    navigator.mediaSession.setActionHandler('play', togglePlayPause);
    navigator.mediaSession.setActionHandler('pause', togglePlayPause);
    navigator.mediaSession.setActionHandler('seekbackward', ()=> skipSeconds(-skipBackAmount()));
    navigator.mediaSession.setActionHandler('seekforward', ()=> skipSeconds(skipFwdAmount()));
    // Some head units map their steering-wheel skip buttons to
    // previous/next-track rather than seek. Map both to the same
    // rewind/fast-forward behavior as the on-screen -10/+30 buttons —
    // jumping to a different queue episode from a physical skip button
    // would be surprising, so that stays reserved for the dedicated
    // ⏭ on-screen button only.
    navigator.mediaSession.setActionHandler('previoustrack', ()=> skipSeconds(-skipBackAmount()));
    navigator.mediaSession.setActionHandler('nexttrack', ()=> skipSeconds(skipFwdAmount()));
  }catch(e){ /* some browsers don't support all action handlers: ignore */ }
}

function setPlayIcon(mode){ // 'play' | 'pause' | 'spinner'
  const btn = document.getElementById('playPauseBtn');
  btn.querySelector('.icon-play').style.display = mode === 'play' ? '' : 'none';
  btn.querySelector('.icon-pause').style.display = mode === 'pause' ? '' : 'none';
  btn.querySelector('.icon-spinner').style.display = mode === 'spinner' ? '' : 'none';
}

// ---- gpodder: report playback position/status ----
// Reported on: periodic interval while playing, on pause, and on end
// (position == duration signals "finished" to gpodder/AntennaPod).
let positionReportTimer = null;
function reportPlaybackPosition(finished=false){
  if(!gpodderConfigured() || !state.currentEpisode || !audioEl.duration) return;
  const pos = finished ? audioEl.duration : audioEl.currentTime;
  gpodderReportPlayAction(state.currentEpisode.audioUrl, state.currentEpisode.feedUrl, pos, audioEl.duration)
    .catch(e=>console.warn('gpodder position sync failed', e));
}
function startPositionReportTimer(){
  stopPositionReportTimer();
  positionReportTimer = setInterval(()=> reportPlaybackPosition(), 20000);
}
function stopPositionReportTimer(){
  if(positionReportTimer){ clearInterval(positionReportTimer); positionReportTimer = null; }
}

audioEl.addEventListener('playing', ()=>{ state.isPlaying = true; setPlayIcon('pause'); startPositionReportTimer(); setMediaSessionPlaybackState('playing'); });
audioEl.addEventListener('pause', ()=>{ state.isPlaying = false; setPlayIcon('play'); stopPositionReportTimer(); reportPlaybackPosition(); setMediaSessionPlaybackState('paused'); });
audioEl.addEventListener('waiting', ()=> setPlayIcon('spinner'));
audioEl.addEventListener('error', ()=>{
  document.getElementById('playerStatus').textContent = t('streamUnavailable');
  setPlayIcon('play');
});
audioEl.addEventListener('timeupdate', ()=>{
  document.getElementById('playerPosLabel').textContent = fmtTime(audioEl.currentTime);
  document.getElementById('playerDurLabel').textContent = fmtTime(audioEl.duration);
  const pct = audioEl.duration ? (audioEl.currentTime/audioEl.duration*100) : 0;
  document.getElementById('playerBarFill').style.width = pct + '%';
  if('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && isFinite(audioEl.duration) && audioEl.duration > 0){
    try{
      navigator.mediaSession.setPositionState({
        duration: audioEl.duration,
        playbackRate: audioEl.playbackRate || 1,
        position: Math.min(audioEl.currentTime, audioEl.duration)
      });
    }catch(e){ /* ignore */ }
  }
});
audioEl.addEventListener('ended', ()=>{
  stopPositionReportTimer();
  reportPlaybackPosition(true); // mark as finished/listened in gpodder
  if(state.currentEpisode && state.currentEpisode.guid) markPlayed(state.currentEpisode);
  skipToNextInQueue();
});

function togglePlayPause(){
  if(!state.currentEpisode) return;
  if(audioEl.paused) audioEl.play(); else audioEl.pause();
}
document.getElementById('playPauseBtn').addEventListener('click', (ev)=>{ ev.stopPropagation(); togglePlayPause(); });
// Whole player tile acts as play/pause, like the radio app — other
// controls inside it (skip buttons) stop propagation individually.
document.getElementById('player').addEventListener('click', (ev)=>{
  if(ev.target.closest('.ctrl-btn')) return; // handled by the specific button already
  togglePlayPause();
});
document.getElementById('skipBackBtn').addEventListener('click', (ev)=> ev.stopPropagation());
document.getElementById('skipFwdBtn').addEventListener('click', (ev)=> ev.stopPropagation());
document.getElementById('skipNextBtn').addEventListener('click', (ev)=> ev.stopPropagation());
document.getElementById('playerBar').addEventListener('click', (ev)=> ev.stopPropagation());

// ---- Now playing screen (opened by tapping the player cover) ----
document.getElementById('playerArt').addEventListener('click', (ev)=>{
  ev.stopPropagation();
  if(!state.currentEpisode) return;
  navigateTo('nowplaying');
  renderNowPlaying();
});

async function renderNowPlaying(){
  const ep = state.currentEpisode;
  const container = document.getElementById('nowPlayingContent');
  container.innerHTML = `
    <div class="nowplaying-art" style="background-image:url('${escapeHtml(ep.artworkUrl||'')}')"></div>
    <div class="nowplaying-title">${escapeHtml(ep.title)}</div>
    <div class="nowplaying-podcast" id="nowPlayingPodcastTitle">${escapeHtml(ep.showTitle||'')} ›</div>
    <div class="nowplaying-description" id="nowPlayingDescription">…</div>
    <button class="nowplaying-gotoepisodes" id="nowPlayingGotoEpisodes">${t('showEpisodes')} →</button>
  `;
  const podcastTitleEl = document.getElementById('nowPlayingPodcastTitle');
  const descEl = document.getElementById('nowPlayingDescription');
  podcastTitleEl.addEventListener('click', async ()=>{
    const expanding = !descEl.classList.contains('expanded');
    descEl.classList.toggle('expanded');
    if(expanding && descEl.dataset.loaded !== '1' && ep.feedUrl){
      try{ const info = await fetchFeedInfo(ep.feedUrl); descEl.innerHTML = info.description || ''; descEl.dataset.loaded = '1'; }
      catch{ descEl.textContent = ''; }
    }
  });
  document.getElementById('nowPlayingGotoEpisodes').addEventListener('click', ()=>{
    if(ep.feedUrl) openShow(ep.feedUrl);
  });
}

function skipSeconds(delta){
  if(!state.currentEpisode) return;
  audioEl.currentTime = Math.max(0, audioEl.currentTime + delta);
}
function skipBackAmount(){ return parseInt(localStorage.getItem('autopod_skip_back') || '10', 10); }
function skipFwdAmount(){ return parseInt(localStorage.getItem('autopod_skip_fwd') || '30', 10); }

document.getElementById('skipBackBtn').addEventListener('click', ()=> skipSeconds(-skipBackAmount()));
document.getElementById('skipFwdBtn').addEventListener('click', ()=> skipSeconds(skipFwdAmount()));

function skipToNextInQueue(){
  if(!state.currentEpisode) return;
  const idx = state.queue.findIndex(e => e.guid === state.currentEpisode.guid);
  const next = idx >= 0 ? state.queue[idx+1] : state.queue[0];
  if(next) playEpisode(next);
}
document.getElementById('skipNextBtn').addEventListener('click', skipToNextInQueue);

document.getElementById('playerBar').addEventListener('click', (ev)=>{
  if(!audioEl.duration) return;
  const rect = ev.currentTarget.getBoundingClientRect();
  const pct = (ev.clientX - rect.left) / rect.width;
  audioEl.currentTime = pct * audioEl.duration;
});

function updateSkipLabels(){
  document.getElementById('skipBackBtn').innerHTML = `<span style="font-size:16px;font-weight:800">-${skipBackAmount()}</span>`;
  document.getElementById('skipFwdBtn').innerHTML = `<span style="font-size:16px;font-weight:800">+${skipFwdAmount()}</span>`;
}

// ---- Settings ----
const settingsOverlay = document.getElementById('settingsOverlay');
document.getElementById('settingsBtn').addEventListener('click', ()=> settingsOverlay.classList.add('show'));
document.getElementById('closeSettingsBtn').addEventListener('click', ()=> settingsOverlay.classList.remove('show'));

function wireSegGroup(id, storageKey, defaultValue, onChange, btnSelector='.seg-btn'){
  const group = document.getElementById(id);
  const current = localStorage.getItem(storageKey) || defaultValue;
  group.querySelectorAll(btnSelector).forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.value === current);
    btn.addEventListener('click', ()=>{
      localStorage.setItem(storageKey, btn.dataset.value);
      group.querySelectorAll(btnSelector).forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      if(onChange) onChange(btn.dataset.value);
    });
  });
}

wireSegGroup('themeSeg', 'autopod_theme', 'system', (val)=>{
  if(val === 'system') localStorage.removeItem('autopod_theme');
  applyTheme();
});
// theme default needs special handling since 'system' means "no key stored"
(function initThemeSeg(){
  const stored = localStorage.getItem('autopod_theme');
  document.querySelectorAll('#themeSeg .seg-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.value === (stored || 'system'));
  });
})();

wireSegGroup('accentSeg', 'autopod_accent', 'orange', applyAccent, '.swatch');
wireSegGroup('skipBackSeg', 'autopod_skip_back', '10', updateSkipLabels);
wireSegGroup('skipFwdSeg', 'autopod_skip_fwd', '30', updateSkipLabels);
wireSegGroup('episodeLimitSeg', 'autopod_episode_limit', '10');
wireSegGroup('fontSizeSeg', 'autopod_fontsize', 'large', applyFontSize);
wireSegGroup('idleTimeoutSeg', 'autopod_idle_timeout', '40', resetIdleTimer);
wireSegGroup('langSeg', 'autopod_lang', currentLang(), (val)=>{
  localStorage.setItem('autopod_lang', val);
  location.reload(); // simplest way to guarantee every dynamic list re-renders in the new language
});

// gpodder settings
document.getElementById('gpodderServerUrl').value = localStorage.getItem('autopod_gpodder_url') || 'https://gopodder-latest.onrender.com/';
document.getElementById('gpodderUsername').value = localStorage.getItem('autopod_gpodder_user') || '';
document.getElementById('gpodderPassword').value = localStorage.getItem('autopod_gpodder_pass') || '';

document.getElementById('gpodderSaveBtn').addEventListener('click', ()=>{
  localStorage.setItem('autopod_gpodder_url', document.getElementById('gpodderServerUrl').value.trim());
  localStorage.setItem('autopod_gpodder_user', document.getElementById('gpodderUsername').value.trim());
  localStorage.setItem('autopod_gpodder_pass', document.getElementById('gpodderPassword').value);
  const status = document.getElementById('gpodderStatus');
  status.style.display = 'block';
  status.innerHTML = `<span class="diag-ok">${t('savedLocally')}</span>`;
});

document.getElementById('gpodderTestBtn').addEventListener('click', async ()=>{
  // Save first so the test uses whatever is currently typed in.
  localStorage.setItem('autopod_gpodder_url', document.getElementById('gpodderServerUrl').value.trim());
  localStorage.setItem('autopod_gpodder_user', document.getElementById('gpodderUsername').value.trim());
  localStorage.setItem('autopod_gpodder_pass', document.getElementById('gpodderPassword').value);
  const status = document.getElementById('gpodderStatus');
  status.style.display = 'block';
  status.textContent = 'Teste…';
  try{
    const ok = await gpodderTestConnection();
    status.innerHTML = ok ? '<span class="diag-ok">✓ Verbindung erfolgreich.</span>' : '<span class="diag-fail">✗ Server antwortete, aber nicht wie erwartet.</span>';
  }catch(e){
    status.innerHTML = `<span class="diag-fail">✗ ${escapeHtml(e.message)}</span>`;
  }
});

document.getElementById('gpodderForceSyncBtn').addEventListener('click', async ()=>{
  const resultIcon = document.getElementById('forceSyncResult');
  const status = document.getElementById('gpodderStatus');
  resultIcon.style.display = 'flex';
  resultIcon.className = 'sync-result-icon';
  resultIcon.textContent = '…';
  status.style.display = 'block';
  status.textContent = t('syncing');

  if(!gpodderConfigured()){
    resultIcon.className = 'sync-result-icon fail';
    resultIcon.textContent = '✗';
    status.innerHTML = `<span class="diag-fail">${t('notConfiguredMsg')}</span>`;
    return;
  }

  const results = [];

  // 0) Pull playback positions/status from AntennaPod first, so a
  // sync doesn't accidentally overwrite newer progress made there.
  results.push(await pullPositionsFromGpodder()
    .then(r => r.ok ? { ok:true, what:t('syncPull') } : { ok:false, what:t('syncPull'), error:r.reason }));

  // 0b) Pull the subscription list from AntennaPod (source of truth)
  // before pushing anything back, so a fresh device actually receives
  // subscriptions instead of just echoing its (empty) local list.
  results.push(await syncSubscriptionsFromGpodder()
    .then(()=>({ ok:true, what:t('syncSubsPull') })).catch(e=>({ ok:false, what:t('syncSubsPull'), error:e.message })));

  // 1) Push the full current subscription list.
  results.push(await gpodderPushSubscriptionChange(state.subscriptions.map(s=>s.feedUrl), [])
    .then(()=>({ ok:true, what:t('syncSubs') })).catch(e=>({ ok:false, what:t('syncSubs'), error:e.message })));

  // 2) Push a play action for every episode marked as finished/listened.
  for(const [guid, meta] of playedMeta){
    results.push(await gpodderReportPlayAction(meta.audioUrl, meta.feedUrl, meta.duration || 0, meta.duration || 0)
      .then(()=>({ ok:true, what:t('syncStatus') + ': ' + guid })).catch(e=>({ ok:false, what:t('syncStatus') + ': ' + guid, error:e.message })));
  }

  // 3) Push the current playback position, if something is actively loaded.
  if(state.currentEpisode && audioEl.duration){
    results.push(await gpodderReportPlayAction(state.currentEpisode.audioUrl, state.currentEpisode.feedUrl, audioEl.currentTime, audioEl.duration)
      .then(()=>({ ok:true, what:t('syncPosition') })).catch(e=>({ ok:false, what:t('syncPosition'), error:e.message })));
  }

  // 4) Push the queue (best-effort placeholder — see gpodder.js).
  results.push(await gpodderPushQueue(state.queue.map(e=>e.guid))
    .then(()=>({ ok:true, what:t('syncQueue') })).catch(e=>({ ok:false, what:t('syncQueue'), error:e.message })));

  const failed = results.filter(r=>!r.ok);
  if(failed.length === 0){
    resultIcon.className = 'sync-result-icon ok';
    resultIcon.textContent = '✓';
    status.innerHTML = `<span class="diag-ok">✓ ${t('syncOkMsg')} (${results.length}).</span>`;
  }else{
    resultIcon.className = 'sync-result-icon fail';
    resultIcon.textContent = '✗';
    status.innerHTML = failed.map(f => `<span class="diag-fail">✗ ${escapeHtml(f.what)}: ${escapeHtml(f.error)}</span>`).join('<br>');
  }
});

// ---- Clock ----
function tickClock(){
  const now = new Date();
  document.getElementById('clockTime').textContent =
    String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
}
tickClock();
setInterval(tickClock, 15000);

// ---- Init ----
applyI18n();
document.getElementById('appVersionLabel').textContent = 'v' + APP_VERSION;
document.getElementById('appVersionLabelBack').textContent = 'v' + APP_VERSION;
document.getElementById('aboutVersion').textContent = 'v' + APP_VERSION;
updateSkipLabels();
showScreen('home');

// Pull the subscription list from gpodder and merge it into local
// state, keeping known metadata (title/art) and adding bare entries
// for anything new from the server. Used both at startup and on
// every Force Sync, since AntennaPod is the source of truth.
async function syncSubscriptionsFromGpodder(){
  const feedUrls = await gpodderPullSubscriptions();
  const known = new Map(state.subscriptions.map(s=>[s.feedUrl, s]));
  state.subscriptions = feedUrls.map(url => known.get(url) || { feedUrl:url, title:url, artworkUrl:'', author:'' });
  saveSubscriptions();
  if(document.getElementById('screen-subscriptions').style.display !== 'none') renderSubscriptions();
  await resolveUnknownSubscriptionMetadata();
}

// Best-effort initial subscription sync from gpodder if configured.
if(gpodderConfigured()){
  syncSubscriptionsFromGpodder().catch(e=>console.warn('Initial gpodder subscription sync failed', e));
  pullPositionsFromGpodder().catch(e=>console.warn('Initial position sync failed', e));
}else{
  // Even without gpodder configured, fix up any subscriptions saved by
  // an earlier buggy version of this app that stored the URL as title.
  resolveUnknownSubscriptionMetadata();
}
