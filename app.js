const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const DEFAULT_R2 = 'https://pub-27954f88972e4cb884b6ec66cbf3ad0a.r2.dev';
let toastTimer;
function notify(message) { const el = $('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 4000); }
function read(key, fallback) { try { const value = localStorage.getItem(key); if (value === null) return fallback; const parsed = JSON.parse(value); return Array.isArray(parsed) && parsed.every(x => typeof x === 'string') ? [...new Set(parsed)] : fallback; } catch { return fallback; } }
function rawRead(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, value); return true; } catch { notify('Yaddaşa yazmaq mümkün olmadı. Dəyişiklik yalnız bu sessiyada qalacaq.'); return false; } }
function validUrl(value) { try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; } }
let base = rawRead('kadr_r2_url', DEFAULT_R2); if (!validUrl(base)) base = DEFAULT_R2;
const state = { videos: [], order: [], tab: 'feed', sort: 'random', tag: null, library: 'favorites', favorites: read('kadr_favorites', []), watched: read('kadr_watched', []), muted: rawRead('kadr_muted', 'true') !== 'false', queue: [], index: 0, active: null, observer: null, resume: null };
const players = new Map();
function node(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; }
function button(label, cls, action, title) { const el = node('button', cls, label); el.type = 'button'; el.onclick = action; if (title) { el.setAttribute('aria-label', title); el.title = title; } return el; }
const svgNamespace = 'http://www.w3.org/2000/svg';
function icon(name) {
  const svg = document.createElementNS(svgNamespace, 'svg');
  const use = document.createElementNS(svgNamespace, 'use');
  svg.classList.add('icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', './icons.svg#' + name);
  svg.append(use);
  return svg;
}

function setButtonIcon(el, name, title) {
  const use = el.querySelector('use');
  if (use) use.setAttribute('href', './icons.svg#' + name);
  else el.prepend(icon(name));
  el.setAttribute('aria-label', title);
  el.title = title;
}

function iconButton(name, title, action) {
  const el = button('', 'icon-button', action);
  setButtonIcon(el, name, title);
  return el;
}

const monthNames = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
function formatVideoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return `${day} ${monthNames[month - 1]} ${year}`;
}
let modalOrigin = null;

function url(file) { return new URL(file, base.replace(/\/+$/, '') + '/').href; }
function label(tag) { return tag.replaceAll('-', ' ').replace(/\b\w/g, x => x.toUpperCase()); }
function time(seconds) { if (!Number.isFinite(seconds)) return '0:00'; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function shuffled(videos) { const ids = videos.map(v => v.id); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; } return ids; }
export function validateVideos(data) { if (!Array.isArray(data)) throw Error('Video siyahısı massiv olmalıdır.'); const ids = new Set(); return data.map(v => { if (!v || typeof v.id !== 'string' || !v.id || ids.has(v.id) || typeof v.title !== 'string' || !v.title.trim() || typeof v.file !== 'string' || !v.file.trim() || !Array.isArray(v.tags) || !v.tags.every(t => typeof t === 'string' && t.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(v.uploadDate) || !Number.isFinite(Date.parse(v.uploadDate))) throw Error('Video məlumatları səhvdir və ya ID təkrarlanır.'); for (const field of ['file', 'poster']) { if (v[field] !== undefined) { if (typeof v[field] !== 'string' || !v[field].trim()) throw Error('Video ünvanı səhvdir.'); const parsed = new URL(v[field], 'https://example.test/'); if (!['http:', 'https:'].includes(parsed.protocol)) throw Error('Yalnız HTTP və HTTPS ünvanları qəbul olunur.'); } } ids.add(v.id); return {...v, tags: [...new Set(v.tags)]}; }); }
function filtered() { let list = state.videos.filter(v => !state.tag || v.tags.includes(state.tag)); if (state.sort === 'favorites') list = list.filter(v => state.favorites.includes(v.id)); if (state.sort === 'newest') list.sort((a,b) => b.uploadDate.localeCompare(a.uploadDate)); else list.sort((a,b) => state.order.indexOf(a.id) - state.order.indexOf(b.id)); return list; }
function pauseAll(except) { for (const p of players.values()) if (p !== except) p.video.pause(); }
function canPlay(p) { return !document.hidden && (p.modal ? $('#player').open : state.tab === 'feed' && !$('#player').open && !$('#settings').open && state.active === p); }
async function play(p) { if (!canPlay(p)) return; pauseAll(p); p.manualPause = false; p.video.muted = state.muted; p.syncMute(); try { await p.video.play(); } catch (error) { if (error.name === 'NotAllowedError' && !p.video.muted && canPlay(p)) { state.muted = true; p.video.muted = true; p.syncMute(); try { await p.video.play(); } catch { p.showTap(); } } else if (error.name !== 'AbortError') p.showTap(); } if (!canPlay(p)) p.video.pause(); }
function watched(id) { state.watched = [id, ...state.watched.filter(x => x !== id)]; save('kadr_watched', JSON.stringify(state.watched)); }
function syncFavorites() { for (const p of players.values()) { const yes = state.favorites.includes(p.item.id); p.favorite.classList.toggle('selected', yes); p.favorite.setAttribute('aria-pressed', String(yes)); } }
function favorite(id) { state.favorites = state.favorites.includes(id) ? state.favorites.filter(x => x !== id) : [...state.favorites, id]; save('kadr_favorites', JSON.stringify(state.favorites)); syncFavorites(); if (state.tab === 'library') renderLibrary(); if (state.sort === 'favorites') renderFeed(); }
async function share(id) { const link = new URL(location.href); link.search = ''; link.hash = ''; link.searchParams.set('video', id); try { if (navigator.share) await navigator.share({title:'K.A.D.R', url:link.href}); else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(link.href); notify('Video keçidi kopyalandı.'); } else { window.prompt('Video keçidini kopyala:', link.href); } } catch (e) { if (e.name !== 'AbortError') { window.prompt('Paylaşmaq alınmadı. Keçidi kopyala:', link.href); } } }
function createPlayer(item, modal = false) {
  const el = node('article', 'slide');
  const playerCard = node('div', 'player-card');
  const stage = node('div', 'video-stage');
  const video = node('video');
  video.playsInline = true;
  video.loop = true;
  video.preload = 'none';
  video.muted = state.muted;
  video.draggable = false;
  video.setAttribute('controlslist', 'nodownload');
  video.setAttribute('aria-label', item.title);
  stage.addEventListener('contextmenu', event => event.preventDefault());
  if (item.poster) video.poster = url(item.poster);
  const status = node('div', 'status');
  status.hidden = true;
  stage.append(video, status);

  const panel = node('div', 'player-panel');
  const details = node('div', 'player-details');
  const info = node('div', 'video-info');
  const chips = node('div', 'chips');
  for (const tag of item.tags) {
    chips.append(button('#' + label(tag), 'chip', () => {
      if (modal) closePlayer();
      state.tag = tag;
      switchTab('feed');
      renderFeed();
    }));
  }
  info.append(node('h2', '', item.title), chips);
  const date = node('time', '', formatVideoDate(item.uploadDate));
  date.dateTime = item.uploadDate;
  info.append(date);

  const actions = node('div', 'actions');
  const fav = iconButton('heart', 'Sevimlilərə əlavə et və ya çıxar', () => favorite(item.id));
  const mute = iconButton('volume-x', 'Səs', () => {
    state.muted = !state.muted;
    save('kadr_muted', String(state.muted));
    for (const player of players.values()) {
      player.video.muted = state.muted;
      player.syncMute();
    }
  });
  actions.append(fav, mute, iconButton('share-2', 'Videonu paylaş', () => share(item.id)));
  if (!modal) {
    actions.append(iconButton('expand', 'Böyük pleyerdə aç', () => openPlayer(item.id, filtered(), p)));
  } else {
    const fullscreen = iconButton('maximize', 'Tam ekran', async () => {
      setFocusMode(true);
      $('#player-close').focus();
      try {
        if (document.fullscreenEnabled && video.requestFullscreen) {
          await video.requestFullscreen();
        } else if (video.webkitSupportsFullscreen) {
          video.webkitEnterFullscreen();
        }
      } catch {
        // Keep the viewport-sized player if the browser declines native fullscreen.
      }
    });
    video.addEventListener('fullscreenchange', () => {
      const wasFullscreen = video.controls;
      video.controls = document.fullscreenElement === video;
      if (wasFullscreen && !video.controls) setFocusMode(false);
    });
    video.addEventListener('webkitendfullscreen', () => setFocusMode(false));
    actions.append(fullscreen);
  }
  details.append(info, actions);

  const transport = node('div', 'transport');
  const toggle = iconButton('play', 'Oynat', () => {
    if (video.paused) play(p);
    else {
      p.manualPause = true;
      video.pause();
    }
  });
  const seek = node('input');
  seek.type = 'range';
  seek.min = '0';
  seek.max = '100';
  seek.step = '.1';
  seek.value = '0';
  seek.disabled = true;
  seek.setAttribute('aria-label', 'Video vaxtı');
  const clock = node('span', 'time', '0:00 / 0:00');
  transport.append(toggle, seek, clock);
  panel.append(transport, details);
  playerCard.append(stage, panel);
  el.append(playerCard);

  const updateTime = () => {
    const hasDuration = Number.isFinite(video.duration) && video.duration > 0;
    seek.disabled = !hasDuration;
    seek.value = hasDuration ? String(video.currentTime / video.duration * 100) : '0';
    seek.style.setProperty('--progress', seek.value + '%');
    clock.textContent = `${time(video.currentTime)} / ${time(video.duration)}`;
    seek.setAttribute('aria-valuetext', clock.textContent);
  };
  const syncPlay = () => setButtonIcon(toggle, video.paused ? 'play' : 'pause', video.paused ? 'Oynat' : 'Dayandır');
  const key = (modal ? 'modal:' : 'feed:') + item.id;
  const p = {
    item, el, video, favorite: fav, modal, manualPause: false, loaded: false, marked: false, pendingTime: 0,
    syncMute() {
      setButtonIcon(mute, video.muted ? 'volume-x' : 'volume-2', 'Səs');
      mute.setAttribute('aria-pressed', String(!video.muted));
      mute.title = video.muted ? 'Səsi aç' : 'Səsi bağla';
    },
    seekTo(seconds) {
      if (video.readyState) video.currentTime = Math.min(seconds, video.duration || seconds);
      else p.pendingTime = seconds;
    },
    showTap() {
      if (video.error || !canPlay(p)) return;
      status.hidden = false;
      status.className = 'status';
      const retry = button('Videonu oynat', 'primary', () => play(p));
      retry.prepend(icon('play'));
      status.replaceChildren(retry);
    },
    load() {
      if (p.loaded) return;
      p.loaded = true;
      status.hidden = false;
      status.className = 'status loading';
      status.textContent = 'Video hazırlanır…';
      video.preload = 'metadata';
      video.src = url(item.file);
      video.load();
    },
    destroy() {
      video.onplay = video.onplaying = video.onpause = video.onwaiting = video.oncanplay =
        video.onerror = video.onloadedmetadata = video.ontimeupdate = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      players.delete(key);
    }
  };

  players.set(key, p);
  p.syncMute();
  video.onclick = () => { if (!video.controls) toggle.click(); };
  video.onloadedmetadata = () => {
    if (p.pendingTime) p.seekTo(p.pendingTime);
    p.pendingTime = 0;
    updateTime();
    if (p.manualPause) status.hidden = true;
  };
  video.ontimeupdate = () => {
    updateTime();
    if (!p.marked && video.currentTime >= Math.min(3, video.duration / 2)) {
      p.marked = true;
      watched(item.id);
    }
  };
  seek.oninput = () => {
    if (!seek.disabled) {
      p.seekTo(Number(seek.value) / 100 * video.duration);
      updateTime();
    }
  };
  video.onplay = () => {
    p.manualPause = false;
    syncPlay();
  };
  video.onpause = () => {
    if ((video.controls || video.webkitDisplayingFullscreen) && canPlay(p)) p.manualPause = true;
    syncPlay();
  };
  video.onplaying = () => {
    if (!canPlay(p)) video.pause();
    else status.hidden = true;
  };
  video.onwaiting = () => {
    if (!canPlay(p)) return;
    status.className = 'status loading';
    status.textContent = 'Yüklənir…';
    status.hidden = false;
  };
  video.oncanplay = () => { if (status.classList.contains('loading')) status.hidden = true; };
  video.onerror = () => {
    status.hidden = false;
    status.className = 'status';
    const retry = button('Yenidən cəhd et', 'secondary', () => {
      p.loaded = false;
      p.load();
      play(p);
    });
    retry.prepend(icon('rotate-ccw'));
    const next = button('Növbəti video', 'secondary', () => modal ? moveModal(1) : scrollFeed(1));
    next.append(icon('chevron-right'));
    status.replaceChildren(node('span', '', 'Bu video açıla bilmədi.'), retry, next);
  };
  return p;
}
function destroyFeed() {state.observer?.disconnect();for(const p of [...players.values()])if(!p.modal)p.destroy();state.active=null;}
function renderFeed() {destroyFeed();const feed=$('#feed');feed.replaceChildren();const list=filtered();$('#feed-empty').hidden=!!list.length;$('#feed-empty').textContent=state.sort==='favorites'?'Hələ sevimli video yoxdur. Bəyəndiyin kadrda ürəyə toxun.':'Bu seçimə uyğun video yoxdur.';feed.hidden=!list.length;const bar=$('#filter-bar');bar.hidden=!state.tag;if(state.tag)bar.replaceChildren(node('span','','#'+label(state.tag)),iconButton('x', 'Süzgəci sil', () => {state.tag=null;renderFeed();}));const ps=list.map(v=>createPlayer(v));ps.forEach(p=>feed.append(p.el));state.observer=new IntersectionObserver(entries=>{for(const entry of entries) {const p=ps.find(x=>x.el===entry.target);if(entry.isIntersecting&&entry.intersectionRatio>=.6){state.active=p;p.load();const next=ps[ps.indexOf(p)+1];next?.load();if(canPlay(p)&&!p.manualPause)play(p);}else {p.video.pause();if(state.active===p)state.active=null;}}},{root:feed,threshold:[0,.6]});ps.forEach(p=>state.observer.observe(p.el));feed.scrollTop=0;syncFavorites();}
function card(item, queue) {const c=button('','card',()=>openPlayer(item.id,queue));const thumb=node('div','thumbnail');thumb.append(icon('play'));if(item.poster){const img=node('img');img.src=url(item.poster);img.alt='';img.loading='lazy';img.onerror=()=>img.remove();thumb.append(img);}const body=node('div','card-body');body.append(node('h3','',item.title),node('p','',item.tags.map(label).join(' · ')));c.append(thumb,body);return c;}
function renderCards(container,list,message){container.replaceChildren();if(!list.length)container.append(node('p','empty',message));else list.forEach(v=>container.append(card(v,list)));}
function allTags(){return [...new Set(state.videos.flatMap(v=>v.tags))].sort((a,b)=>a.localeCompare(b,'az'));}
function renderSearch(){const q=$('#search').value.trim().toLocaleLowerCase('az');const list=state.videos.filter(v=>[v.title,...v.tags.map(label),...v.tags].some(t=>t.toLocaleLowerCase('az').includes(q)));$('#results-count').textContent=`${list.length} video`;renderCards($('#search-results'),list,'Axtarışa uyğun video tapılmadı. Başqa söz yoxla.');}
function renderLibrary(){const c=$('#library-results');if(state.library==='tags'){c.replaceChildren();allTags().forEach(tag=>{const n=state.videos.filter(v=>v.tags.includes(tag)).length;const b=button('','card tag-card',()=>{state.tag=tag;state.sort='random';updateSort();switchTab('feed');renderFeed();});b.append(icon('layout-grid'),node('strong','',label(tag)),node('small','',`${n} video`));c.append(b);});if(!c.children.length)c.append(node('p','empty','Hələ kateqoriya yoxdur.'));}else{const ids=state[state.library==='favorites'?'favorites':'watched'];const list=ids.map(id=>state.videos.find(v=>v.id===id)).filter(Boolean);renderCards(c,list,state.library==='favorites'?'Bəyəndiyin kadrları ürək düyməsi ilə burada saxla.':'İzlədiyin videolar burada görünəcək.');}}
function switchTab(tab){pauseAll();state.tab=tab;for(const t of ['feed','search','library']){ $(`#${t}-view`).hidden=t!==tab;$(`[data-tab="${t}"]`).classList.toggle('active',t===tab);$(`[data-tab="${t}"]`).setAttribute('aria-current',t===tab?'page':'false');}if(tab==='search')renderSearch();if(tab==='library')renderLibrary();if(tab==='feed'&&state.active&&!state.active.manualPause)play(state.active);}
function updateSort(){$$('[data-sort]').forEach(b=>{b.classList.toggle('active',b.dataset.sort===state.sort);b.setAttribute('aria-pressed',String(b.dataset.sort===state.sort));});}
function openPlayer(id, queue, origin = null) {
  const index = queue.findIndex(v => v.id === id);
  if (index < 0) return;
  modalOrigin = origin;
  pauseAll();
  state.queue = [...queue];
  state.index = index;
  if (!$('#player').open) $('#player').showModal();
  renderModal();
}

function renderModal() {
  for (const p of players.values()) if (p.modal) p.destroy();
  const p = createPlayer(state.queue[state.index], true);
  $('#modal-stage').replaceChildren(p.el);
  $('#position').textContent = `${state.index + 1} / ${state.queue.length}`;
  $('#previous').disabled = state.queue.length < 2;
  $('#next').disabled = state.queue.length < 2;
  if (modalOrigin?.item.id === p.item.id) {
    p.seekTo(modalOrigin.video.currentTime);
    p.manualPause = modalOrigin.manualPause;
  }
  p.load();
  syncFavorites();
  if (!p.manualPause) play(p);
}

function moveModal(direction) {
  if (state.queue.length < 2) return;
  state.index = (state.index + direction + state.queue.length) % state.queue.length;
  renderModal();
}

function cleanModal() {
  for (const p of players.values()) {
    if (!p.modal) continue;
    if (modalOrigin === state.active && modalOrigin?.item.id === p.item.id) {
      modalOrigin.seekTo(p.video.currentTime || p.pendingTime);
      modalOrigin.manualPause = p.manualPause;
    }
    p.destroy();
  }
  modalOrigin = null;
  setFocusMode(false);
  $('#modal-stage').replaceChildren();
  if (state.active && !state.active.manualPause) play(state.active);
}

function setFocusMode(on) {
  $('#player').classList.toggle('is-focused', on);
  const close = $('#player-close');
  const title = on ? 'Tam ekrandan çıx' : 'Pleyeri bağla';
  close.setAttribute('aria-label', title);
  close.title = title;
}

function closePlayer() {
  if ($('#player').classList.contains('is-focused')) {
    setFocusMode(false);
    $('#modal-stage [aria-label="Tam ekran"]')?.focus();
    return;
  }
  $('#player').close();
  cleanModal();
}
function scrollFeed(direction){const feed=$('#feed');const index=state.active?[...feed.children].indexOf(state.active.el):Math.round(feed.scrollTop/feed.clientHeight);feed.scrollTo({top:Math.max(0,Math.min(feed.children.length-1,index+direction))*feed.clientHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
async function load(){const loading=$('#load-state');loading.hidden=false;loading.textContent='Kadrların hazırlanır…';try{const res=await fetch('data/videos.json');if(!res.ok)throw Error('Video siyahısı yüklənmədi.');state.videos=validateVideos(await res.json());state.order=shuffled(state.videos);$('#count').textContent=state.videos.length;loading.hidden=true;renderFeed();$('#suggestions').replaceChildren(...allTags().map(tag=>button('#'+label(tag),'chip',()=>{$('#search').value=label(tag);renderSearch();})));renderSearch();const id=new URL(location.href).searchParams.get('video');if(id){if(state.videos.some(v=>v.id===id))openPlayer(id,state.videos);else notify('Bu keçiddəki video tapılmadı.');}}catch(e){loading.replaceChildren(node('p','',e instanceof SyntaxError?'Video siyahısının JSON formatı səhvdir.':e.message),button('Yenidən cəhd et','primary',load));}}
$$('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$$('[data-sort]').forEach(b=>b.onclick=()=>{state.sort=b.dataset.sort;updateSort();renderFeed();});$('#shuffle').onclick=()=>{state.order=shuffled(state.videos);state.sort='random';updateSort();renderFeed();notify('Yeni kadr sırası hazırdır.');};$('#search').oninput=renderSearch;$$('[data-library]').forEach(b=>b.onclick=()=>{state.library=b.dataset.library;$$('[data-library]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderLibrary();});
$('#player-close').onclick = closePlayer;
$('#player').addEventListener('cancel', e => {
  if (!$('#player').classList.contains('is-focused')) return;
  e.preventDefault();
  closePlayer();
});
$('#player').addEventListener('close', () => {
  if (!$('#player').open && $('#modal-stage').hasChildNodes()) cleanModal();
});
$('#previous').onclick = () => moveModal(-1);
$('#next').onclick = () => moveModal(1);
$('#settings-open').onclick=()=>{pauseAll();$('#r2-url').value=base;$('#settings').showModal();};$('#settings-close').onclick=()=>$('#settings').close();$('#settings').addEventListener('close',()=>{if(state.active&&!state.active.manualPause)play(state.active);});$('#settings-form').onsubmit=e=>{e.preventDefault();const value=$('#r2-url').value.trim();if(!validUrl(value)){notify('Düzgün HTTP və ya HTTPS ünvanı daxil et.');return;}base=value;save('kadr_r2_url',value);$('#settings').close();renderFeed();renderSearch();if(state.tab==='library')renderLibrary();notify('Video mənbəyi yeniləndi.');};
// Mobile access to source settings through the video count.
$('#count').parentElement.setAttribute('role','button');$('#count').parentElement.tabIndex=0;$('#count').parentElement.setAttribute('aria-label','Video sayı və mənbə ayarları');$('#count').parentElement.onclick=()=>$('#settings-open').click();$('#count').parentElement.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#settings-open').click();}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){state.resume=[...players.values()].find(p=>!p.video.paused)||null;pauseAll();}else{const p=state.resume;state.resume=null;if(p&&players.has((p.modal?'modal:':'feed:')+p.item.id)&&!p.manualPause)play(p);}});
document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, [contenteditable]') || document.fullscreenElement || $('#settings').open) return;
  const modal = $('#player').open;
  if (modal && !$('#player').classList.contains('is-focused') && ['ArrowRight', 'ArrowLeft'].includes(e.code)) {
    e.preventDefault();
    moveModal(e.code === 'ArrowRight' ? 1 : -1);
  } else if (!modal && state.tab === 'feed' && ['ArrowDown', 'ArrowUp'].includes(e.code)) {
    e.preventDefault();
    scrollFeed(e.code === 'ArrowDown' ? 1 : -1);
  } else if (e.code === 'Space' && !e.target.closest('button, a, [role="button"]')) {
    const p = modal ? players.get('modal:' + state.queue[state.index]?.id) : state.active;
    if (!p) return;
    e.preventDefault();
    if (p.video.paused) play(p);
    else {
      p.manualPause = true;
      p.video.pause();
    }
  }
});

for (const el of $$('[data-icon]')) {
  const svg = icon(el.dataset.icon);
  if (el.hasAttribute('data-icon-end')) el.append(svg);
  else el.prepend(svg);
}
$('#feed-previous').onclick = () => scrollFeed(-1);
$('#feed-next').onclick = () => scrollFeed(1);
load();
