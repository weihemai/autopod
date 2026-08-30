const I18N = {
  de: {
    back:'Zurück', menu:'Menü', search:'Suchen', subscriptions:'Meine Abos',
    inbox:'Inbox', queue:'Queue', results:'Ergebnisse', episodes:'Episoden',
    settings:'Einstellungen', theme:'Darstellung', themeSystem:'System',
    themeLight:'Hell', themeDark:'Dunkel', accentColor:'Akzentfarbe',
    accentBlue:'Blau', accentRed:'Rot', skipBack:'Zurück-Sprung',
    skipFwd:'Vor-Sprung', episodeLimit:'Episoden pro Podcast laden', all:'Alle',
    gpodderSync:'gpodder-Sync', serverUrl:'Server-URL', username:'Benutzername',
    password:'Passwort / Token', testConnection:'Verbindung testen', save:'Speichern',
    credentialsNote:'Zugangsdaten werden nur lokal auf diesem Gerät gespeichert, nie im App-Code.',
    about:'Über', close:'Schließen', noEpisode:'Keine Episode ausgewählt',
    searchPlaceholder:'Podcast suchen…', emptySearch:'Suche nach einem Podcast, um loszulegen.',
    emptySubscriptions:'Noch keine Abos. Suche und abonniere einen Podcast.',
    emptyInbox:'Keine neuen Episoden.', emptyQueue:'Die Warteschlange ist leer.',
    addToQueue:'Zur Queue', removeFromQueue:'Entfernen', playNow:'Abspielen', loadMore:'Mehr laden', forceSync:'Force Sync',
    fontSize:'Schriftgröße', fontSizeNormal:'Normal', fontSizeLarge:'Groß', fontSizeXLarge:'Sehr groß',
    idleTimeout:'Automatisch zum Home-Screen nach', off:'Aus', language:'Sprache',
    showEpisodes:'Episoden', showMore:'Mehr anzeigen',
    noEpisodesFound:'Keine Episoden gefunden.', feedLoadFailed:'Feed konnte nicht geladen werden',
    streamUnavailable:'Stream nicht erreichbar', savedLocally:'Gespeichert (nur lokal auf diesem Gerät).',
    testing:'Teste…', connectionOk:'Verbindung erfolgreich.', connectionUnexpected:'Server antwortete, aber nicht wie erwartet.',
    syncing:'Synchronisiere…', notConfiguredMsg:'Nicht konfiguriert — Server-URL/Nutzername/Passwort speichern und erneut versuchen.',
    syncOkMsg:'Sync erfolgreich', syncSubs:'Abos', syncSubsPull:'Abos abrufen', syncStatus:'Status', syncPosition:'Position', syncQueue:'Queue', syncPull:'Positionen abrufen'
  },
  en: {
    back:'Back', menu:'Menu', search:'Search', subscriptions:'My subscriptions',
    inbox:'Inbox', queue:'Queue', results:'Results', episodes:'Episodes',
    settings:'Settings', theme:'Appearance', themeSystem:'System',
    themeLight:'Light', themeDark:'Dark', accentColor:'Accent color',
    accentBlue:'Blue', accentRed:'Red', skipBack:'Skip back',
    skipFwd:'Skip forward', episodeLimit:'Episodes to load per show', all:'All',
    gpodderSync:'gpodder sync', serverUrl:'Server URL', username:'Username',
    password:'Password / token', testConnection:'Test connection', save:'Save',
    credentialsNote:'Credentials are only stored locally on this device, never in the app code.',
    about:'About', close:'Close', noEpisode:'No episode selected',
    searchPlaceholder:'Search for a podcast…', emptySearch:'Search for a podcast to get started.',
    emptySubscriptions:'No subscriptions yet. Search and subscribe to a podcast.',
    emptyInbox:'No new episodes.', emptyQueue:'The queue is empty.',
    addToQueue:'Add to queue', removeFromQueue:'Remove', playNow:'Play', loadMore:'Load more', forceSync:'Force Sync',
    fontSize:'Text size', fontSizeNormal:'Normal', fontSizeLarge:'Large', fontSizeXLarge:'Extra large',
    idleTimeout:'Auto-return to Home after', off:'Off', language:'Language',
    showEpisodes:'Episodes', showMore:'Show more',
    noEpisodesFound:'No episodes found.', feedLoadFailed:'Feed could not be loaded',
    streamUnavailable:'Stream unavailable', savedLocally:'Saved (only stored locally on this device).',
    testing:'Testing…', connectionOk:'Connection successful.', connectionUnexpected:'Server responded, but not as expected.',
    syncing:'Syncing…', notConfiguredMsg:'Not configured — save server URL/username/password and try again.',
    syncOkMsg:'Sync successful', syncSubs:'Subscriptions', syncSubsPull:'Pull subscriptions', syncStatus:'Status', syncPosition:'Position', syncQueue:'Queue', syncPull:'Pull positions'
  }
};

function currentLang(){
  return localStorage.getItem('autopod_lang') || 'en';
}

function t(key){
  const lang = currentLang();
  return (I18N[lang] && I18N[lang][key]) || I18N.de[key] || key;
}

function applyI18n(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
}
