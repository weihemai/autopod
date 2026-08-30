/**
 * gpodder-API client for syncing with a self-hosted opodsync instance
 * (or any gpodder-API-compatible server), which AntennaPod also syncs
 * against. AntennaPod is treated as the source of truth for
 * subscriptions; this client mirrors from the server and pushes local
 * changes made in the car back to it.
 *
 * IMPORTANT: server URL / username / password are NEVER hardcoded
 * here. They only ever come from localStorage, set by the user via
 * the in-app Settings panel. This file (and the whole repo) is
 * public on GitHub Pages, so nothing secret may live in source.
 */

const GPODDER_DEVICE_ID = 'autopod-car';

function gpodderConfig(){
  return {
    serverUrl: (localStorage.getItem('autopod_gpodder_url') || '').replace(/\/$/, ''),
    username: localStorage.getItem('autopod_gpodder_user') || '',
    password: localStorage.getItem('autopod_gpodder_pass') || ''
  };
}

function gpodderConfigured(){
  const c = gpodderConfig();
  return !!(c.serverUrl && c.username && c.password);
}

function gpodderAuthHeader(){
  const c = gpodderConfig();
  return 'Basic ' + btoa(c.username + ':' + c.password);
}

async function gpodderRequest(path, options={}){
  const c = gpodderConfig();
  if(!gpodderConfigured()) throw new Error('gpodder not configured');
  const res = await fetch(c.serverUrl + path, {
    ...options,
    headers: {
      'Authorization': gpodderAuthHeader(),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if(!res.ok) throw new Error('gpodder request failed: HTTP ' + res.status + ' ' + path);
  return res;
}

async function gpodderTestConnection(){
  const c = gpodderConfig();
  const res = await gpodderRequest(`/api/2/subscriptions/${encodeURIComponent(c.username)}/${GPODDER_DEVICE_ID}.json`);
  return res.ok;
}

// Pull the current subscription list (feed URLs) from the server.
// AntennaPod is the source of truth, so this simply replaces the
// local list rather than attempting a merge.
async function gpodderPullSubscriptions(){
  const c = gpodderConfig();
  const res = await gpodderRequest(`/api/2/subscriptions/${encodeURIComponent(c.username)}/${GPODDER_DEVICE_ID}.json`);
  return await res.json(); // array of feed URLs
}

// Report a local subscribe/unsubscribe change so it reaches
// AntennaPod on its next sync. Per the gpodder API reference, the
// diff-style upload (add/remove) lives under /api/2/ — the plain
// /subscriptions/ path (no /api/2/) is the older v1 endpoint and only
// accepts GET/PUT, not POST, which is what caused the HTTP 405 here.
async function gpodderPushSubscriptionChange(add=[], remove=[]){
  const c = gpodderConfig();
  await gpodderRequest(`/api/2/subscriptions/${encodeURIComponent(c.username)}/${GPODDER_DEVICE_ID}.json`, {
    method: 'POST',
    body: JSON.stringify({ add, remove })
  });
}

// Report playback progress as a gpodder "episode action". AntennaPod
// picks this up on its next sync and vice versa.
async function gpodderReportPlayAction(episodeUrl, podcastFeedUrl, positionSeconds, totalSeconds){
  const c = gpodderConfig();
  const action = {
    podcast: podcastFeedUrl,
    episode: episodeUrl,
    device: GPODDER_DEVICE_ID,
    action: 'play',
    timestamp: new Date().toISOString(),
    started: 0,
    position: Math.round(positionSeconds),
    total: Math.round(totalSeconds || 0)
  };
  await gpodderRequest(`/api/2/episodes/${encodeURIComponent(c.username)}.json`, {
    method: 'POST',
    body: JSON.stringify([action])
  });
}

// Fetch the most recent episode actions since a given timestamp, used
// to resume playback position set from AntennaPod. Returns both the
// actions and the server's timestamp (to pass as `since` next time).
async function gpodderPullEpisodeActions(sinceIso){
  const c = gpodderConfig();
  const since = sinceIso ? '?since=' + encodeURIComponent(sinceIso) : '';
  const res = await gpodderRequest(`/api/2/episodes/${encodeURIComponent(c.username)}.json${since}`);
  const data = await res.json();
  return { actions: data.actions || [], timestamp: data.timestamp };
}

/**
 * Queue sync: the core gpodder-API has no native "queue" concept.
 * AntennaPod maintains its own queue and, depending on version, may
 * expose it through its own sync extension. This is a placeholder
 * that currently reads/writes queue order to a plain custom endpoint
 * on the same server (`/api/queue/<username>`), which is NOT part of
 * the standard gpodder API — you'd need to add this small route
 * yourself when deploying opodsync, or confirm AntennaPod's native
 * mechanism and switch to that instead. Marked clearly as TODO so
 * this isn't mistaken for a finished, verified feature.
 */
async function gpodderPullQueue(){
  // TODO: confirm AntennaPod's actual queue-sync mechanism and wire
  // this up for real; this is a placeholder shape only.
  console.warn('gpodderPullQueue: not yet implemented against a real endpoint');
  return [];
}

async function gpodderPushQueue(episodeGuids){
  console.warn('gpodderPushQueue: not yet implemented against a real endpoint', episodeGuids);
}
