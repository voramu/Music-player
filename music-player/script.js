'use strict';

/* ==========================================================
   Константы
   ========================================================== */
const CATEGORIES = [
  { id: 'jazz',    name: 'Jazz',    color: '#7c3aed' },
  { id: 'classic', name: 'Classic', color: '#c2570c' },
  { id: 'blues',   name: 'Blues',   color: '#1d4fd8' },
];

const ICONS = {
  play:  '<svg class="icon icon--fill" viewBox="0 0 24 24"><path d="M7.5 4.9v14.2a1 1 0 0 0 1.53.85l11.3-7.1a1 1 0 0 0 0-1.7L9.03 4.05A1 1 0 0 0 7.5 4.9z"/></svg>',
  pause: '<svg class="icon icon--fill" viewBox="0 0 24 24"><rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/></svg>',
  music: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  speaker: '<svg class="icon cat__speaker" viewBox="0 0 24 24"><path fill="currentColor" d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
  volumeHigh: '<svg class="icon" viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
  volumeLow:  '<svg class="icon" viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
  volumeMute: '<svg class="icon" viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6"/><path d="m17 9 6 6"/></svg>',
};

const DEFAULT_VOLUME = 0.7;

/* ==========================================================
   Состояние
   ========================================================== */
let state = {
  category: 'jazz',        // активная (открытая) категория
  trackId: null,           // какой трек выбран
  isPlaying: false,        // играет или на паузе
  volume: DEFAULT_VOLUME,  // текущая громкость 0..1
  volumeBeforeMute: DEFAULT_VOLUME, // громкость, которую вернёт кнопка mute
  shuffle: false,
  repeatOne: false,
  liked: new Set(),
};

let tracks = [];
let history = [];          // история для «назад» в режиме shuffle
let isSeeking = false;

// ОДИН объект Audio на весь плеер
const audio = new Audio();
audio.preload = 'metadata';

/* ==========================================================
   DOM
   ========================================================== */
const $ = (id) => document.getElementById(id);

const els = {
  main: $('main'),
  categories: $('categories'),
  heroCover: $('heroCover'),
  heroTitle: $('heroTitle'),
  heroPlay: $('heroPlay'),
  heroShuffle: $('heroShuffle'),
  tracks: $('tracks'),
  player: document.querySelector('.player'),
  playerCover: $('playerCover'),
  playerTitle: $('playerTitle'),
  playerArtist: $('playerArtist'),
  likeBtn: $('likeBtn'),
  shuffleBtn: $('shuffleBtn'),
  prevBtn: $('prevBtn'),
  playBtn: $('playBtn'),
  nextBtn: $('nextBtn'),
  repeatBtn: $('repeatBtn'),
  currentTime: $('currentTime'),
  duration: $('duration'),
  progress: $('progress'),
  progressFill: $('progressFill'),
  muteBtn: $('muteBtn'),
  volume: $('volume'),
  themeToggle: $('themeToggle'),
};

/* ==========================================================
   Утилиты
   ========================================================== */
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return min + ':' + String(sec).padStart(2, '0');
}

function pluralTracks(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return n + ' трек';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return n + ' трека';
  return n + ' треков';
}

const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* хранилище недоступно */ }
  },
};

const getCategory = (id) => CATEGORIES.find((c) => c.id === id);
const getTrack = (id) => tracks.find((t) => t.id === id);
const getCategoryTracks = (categoryId) => tracks.filter((t) => t.category === categoryId);
const currentTrack = () => getTrack(state.trackId);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ==========================================================
   Воспроизведение
   ========================================================== */
function loadAndPlay(id, remember = true) {
  const track = getTrack(id);
  if (!track) return;

  const prev = currentTrack();
  if (remember && prev && prev.id !== id) {
    history.push(prev.id);
    if (history.length > 50) history.shift();
  }

  if (state.trackId !== id) {
    state.trackId = id;
    audio.src = track.file;   // меняем src у единственного Audio
  }
  audio.currentTime = 0;
  updateProgress(0, track.duration);
  play();
  updateMediaSession();
  render();
}

// Клик по треку в списке: новый — играть, текущий — пауза/продолжение
function selectTrack(id) {
  if (state.trackId === id) togglePlay();
  else loadAndPlay(id);
}

function play() {
  const track = currentTrack();
  if (!track) {
    startCategory(state.category);
    return;
  }
  state.isPlaying = true;
  const promise = audio.play();
  if (promise && typeof promise.catch === 'function') {
    promise.catch((err) => {
      // AbortError — нормальная ситуация при быстром переключении треков
      if (err && err.name === 'AbortError') return;
      state.isPlaying = false;
      renderPlayState();
    });
  }
  renderPlayState();
}

function pause() {
  audio.pause();
  state.isPlaying = false;
  renderPlayState();
}

function togglePlay() {
  if (state.isPlaying) pause();
  else play();
}

function startCategory(categoryId) {
  const list = getCategoryTracks(categoryId);
  if (!list.length) return;
  const first = state.shuffle ? list[Math.floor(Math.random() * list.length)] : list[0];
  loadAndPlay(first.id);
}

// Prev / Next — по кругу в рамках категории ИГРАЮЩЕГО трека
function switchTrack(direction) {
  const track = currentTrack();
  if (!track) {
    startCategory(state.category);
    return;
  }

  const list = getCategoryTracks(track.category);
  let next;
  let remember = true;

  if (state.shuffle && list.length > 1) {
    if (direction < 0) {
      // назад в shuffle — к предыдущему из истории той же категории
      while (history.length && !next) {
        const candidate = getTrack(history.pop());
        if (candidate && candidate.category === track.category && candidate.id !== track.id) next = candidate;
      }
      remember = false;
    }
    if (!next) {
      const others = list.filter((t) => t.id !== track.id);
      next = others[Math.floor(Math.random() * others.length)];
    }
  } else {
    const index = list.findIndex((t) => t.id === track.id);
    next = list[(index + direction + list.length) % list.length];
  }

  loadAndPlay(next.id, remember);
}

function playNextTrack() { switchTrack(1); }
function playPrevTrack() { switchTrack(-1); }

/* ==========================================================
   Прогресс
   ========================================================== */
function getDuration() {
  if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
  const track = currentTrack();
  return track ? track.duration : 0;
}

function updateProgress(current, duration) {
  const percent = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  els.progressFill.style.width = percent + '%';
  els.currentTime.textContent = formatTime(current);
  els.duration.textContent = formatTime(duration);
  els.progress.setAttribute('aria-valuemax', String(Math.round(duration)));
  els.progress.setAttribute('aria-valuenow', String(Math.round(current)));
  els.progress.setAttribute('aria-valuetext', formatTime(current) + ' из ' + formatTime(duration));
}

function ratioFromEvent(event) {
  const rect = els.progress.getBoundingClientRect();
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
}

function seekTo(seconds) {
  const duration = getDuration();
  if (!state.trackId || !duration) return;
  audio.currentTime = Math.min(Math.max(0, seconds), duration);
  updateProgress(audio.currentTime, duration);
}

function bindProgress() {
  const bar = els.progress;

  bar.addEventListener('pointerdown', (event) => {
    if (!state.trackId || event.button !== 0) return;
    isSeeking = true;
    bar.classList.add('is-dragging');
    bar.setPointerCapture(event.pointerId);
    updateProgress(ratioFromEvent(event) * getDuration(), getDuration());
  });

  bar.addEventListener('pointermove', (event) => {
    if (!isSeeking) return;
    updateProgress(ratioFromEvent(event) * getDuration(), getDuration());
  });

  const finish = (event) => {
    if (!isSeeking) return;
    isSeeking = false;
    bar.classList.remove('is-dragging');
    // клик по полосе: currentTime = доля клика × duration
    seekTo(ratioFromEvent(event) * getDuration());
  };

  bar.addEventListener('pointerup', finish);
  bar.addEventListener('pointercancel', () => {
    isSeeking = false;
    bar.classList.remove('is-dragging');
  });

  bar.addEventListener('keydown', (event) => {
    if (!state.trackId) return;
    if (event.key === 'ArrowRight') { seekTo(audio.currentTime + 5); event.preventDefault(); }
    if (event.key === 'ArrowLeft')  { seekTo(audio.currentTime - 5); event.preventDefault(); }
    if (event.key === 'Home')       { seekTo(0); event.preventDefault(); }
  });
}

/* ==========================================================
   Громкость
   ========================================================== */
function setVolume(value) {
  const v = Math.min(1, Math.max(0, value));
  state.volume = v;
  audio.volume = v;
  if (v > 0) state.volumeBeforeMute = v;
  els.volume.value = String(Math.round(v * 100));
  storage.set('player-volume', { volume: v, before: state.volumeBeforeMute });
  renderVolume();
}

function toggleMute() {
  if (state.volume > 0) {
    state.volumeBeforeMute = state.volume;
    setVolume(0);
  } else {
    // возвращаем ПРЕЖНЮЮ громкость
    setVolume(state.volumeBeforeMute > 0 ? state.volumeBeforeMute : DEFAULT_VOLUME);
  }
}

function renderVolume() {
  const v = state.volume;
  els.volume.style.setProperty('--val', Math.round(v * 100) + '%');
  const muted = v === 0;
  els.muteBtn.innerHTML = muted ? ICONS.volumeMute : v < 0.5 ? ICONS.volumeLow : ICONS.volumeHigh;
  els.muteBtn.setAttribute('aria-pressed', String(muted));
  els.muteBtn.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
}

/* ==========================================================
   Отрисовка
   ========================================================== */
function renderCategories() {
  const playing = currentTrack();
  els.categories.replaceChildren(...CATEGORIES.map((cat) => {
    const btn = el('button', 'cat');
    btn.type = 'button';
    btn.dataset.category = cat.id;
    btn.style.setProperty('--cat-color', cat.color);
    btn.classList.toggle('is-active', cat.id === state.category);
    btn.classList.toggle('is-playing', Boolean(playing && state.isPlaying && playing.category === cat.id));
    btn.setAttribute('aria-current', cat.id === state.category ? 'true' : 'false');

    const cover = el('span', 'cat__cover');
    cover.innerHTML = ICONS.music;

    const text = el('span', 'cat__text');
    text.append(
      el('span', 'cat__name', cat.name),
      el('span', 'cat__meta', 'Плейлист · ' + pluralTracks(getCategoryTracks(cat.id).length))
    );

    btn.append(cover, text);
    btn.insertAdjacentHTML('beforeend', ICONS.speaker);
    return btn;
  }));
}

function renderHero() {
  const cat = getCategory(state.category);
  els.main.style.setProperty('--cat-color', cat.color);
  els.heroTitle.textContent = cat.name;
  document.title = state.trackId && currentTrack()
    ? currentTrack().title + ' · ' + currentTrack().artist
    : cat.name + ' — Плеер';
}

function renderTracks() {
  const list = getCategoryTracks(state.category);

  if (!list.length) {
    els.tracks.replaceChildren(el('li', 'tracks__empty', 'В этой категории пока нет треков'));
    return;
  }

  els.tracks.replaceChildren(...list.map((track, index) => {
    const isActive = track.id === state.trackId;
    const li = el('li', 'track');
    li.dataset.id = String(track.id);
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', track.title + ', ' + track.artist);
    li.classList.toggle('is-active', isActive);
    li.classList.toggle('is-playing', isActive && state.isPlaying);
    if (isActive) li.setAttribute('aria-current', 'true');

    const num = el('span', 'track__num');
    const hover = el('span', 'track__hover');
    hover.innerHTML = isActive && state.isPlaying ? ICONS.pause : ICONS.play;
    const eq = el('span', 'track__eq');
    eq.innerHTML = '<i></i><i></i><i></i><i></i>';
    num.append(el('span', 'track__index', String(index + 1)), hover, eq);

    const meta = el('span', 'track__meta');
    meta.append(el('span', 'track__title', track.title), el('span', 'track__artist', track.artist));

    li.append(num, el('span', 'track__thumb'), meta, el('span', 'track__time', formatTime(track.duration)));
    return li;
  }));
}

function renderPlayer() {
  const track = currentTrack();
  els.player.classList.toggle('has-track', Boolean(track));

  if (track) {
    els.player.style.setProperty('--cat-color', getCategory(track.category).color);
    els.playerTitle.textContent = track.title;
    els.playerArtist.textContent = track.artist;
    els.likeBtn.disabled = false;
    const liked = state.liked.has(track.id);
    els.likeBtn.setAttribute('aria-pressed', String(liked));
    els.likeBtn.setAttribute('aria-label', liked ? 'Убрать из понравившихся' : 'Нравится');
  } else {
    els.player.style.removeProperty('--cat-color');
    els.playerTitle.textContent = 'Выберите трек';
    els.playerArtist.textContent = '—';
    els.likeBtn.disabled = true;
    els.likeBtn.setAttribute('aria-pressed', 'false');
    updateProgress(0, 0);
  }

  [els.shuffleBtn, els.heroShuffle].forEach((btn) => btn.setAttribute('aria-pressed', String(state.shuffle)));
  els.repeatBtn.setAttribute('aria-pressed', String(state.repeatOne));
}

// Иконки play/pause зависят от state.isPlaying
function renderPlayState() {
  const playing = state.isPlaying;
  els.playBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
  els.playBtn.setAttribute('aria-label', playing ? 'Пауза' : 'Воспроизвести');

  const track = currentTrack();
  const heroPlaying = playing && track && track.category === state.category;
  els.heroPlay.innerHTML = heroPlaying ? ICONS.pause : ICONS.play;
  els.heroPlay.setAttribute('aria-label', heroPlaying ? 'Пауза' : 'Воспроизвести плейлист');

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = track ? (playing ? 'playing' : 'paused') : 'none';
  }

  // подсветка в списке и значок в категориях
  els.tracks.querySelectorAll('.track').forEach((row) => {
    const isActive = Number(row.dataset.id) === state.trackId;
    row.classList.toggle('is-playing', isActive && playing);
    const hover = row.querySelector('.track__hover');
    if (hover) hover.innerHTML = isActive && playing ? ICONS.pause : ICONS.play;
  });
  els.categories.querySelectorAll('.cat').forEach((btn) => {
    btn.classList.toggle('is-playing', Boolean(track && playing && track.category === btn.dataset.category));
  });
}

function render() {
  renderCategories();
  renderHero();
  renderTracks();
  renderPlayer();
  renderPlayState();
  renderVolume();
}

/* ==========================================================
   Media Session (кнопки на клавиатуре / в ОС)
   ========================================================== */
function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const track = currentTrack();
  if (!track) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: getCategory(track.category).name,
    });
  } catch (e) { /* не поддерживается */ }
}

function bindMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const handlers = {
    play: () => play(),
    pause: () => pause(),
    previoustrack: () => playPrevTrack(),
    nexttrack: () => playNextTrack(),
    seekto: (details) => seekTo(details.seekTime),
  };
  Object.entries(handlers).forEach(([action, handler]) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch (e) { /* действие не поддерживается */ }
  });
}

/* ==========================================================
   События
   ========================================================== */
function bindEvents() {
  // Категории
  els.categories.addEventListener('click', (event) => {
    const btn = event.target.closest('.cat');
    if (!btn || btn.dataset.category === state.category) return;
    state.category = btn.dataset.category;
    storage.set('player-category', state.category);
    render();                    // играющий трек НЕ прерывается
    els.main.scrollTo({ top: 0 });
  });

  // Треки
  els.tracks.addEventListener('click', (event) => {
    const row = event.target.closest('.track');
    if (row) selectTrack(Number(row.dataset.id));
  });

  els.tracks.addEventListener('keydown', (event) => {
    const row = event.target.closest('.track');
    if (!row || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    selectTrack(Number(row.dataset.id));
  });

  // Большая кнопка в шапке
  els.heroPlay.addEventListener('click', () => {
    const track = currentTrack();
    if (track && track.category === state.category) togglePlay();
    else startCategory(state.category);
  });

  // Панель
  els.playBtn.addEventListener('click', togglePlay);
  els.nextBtn.addEventListener('click', playNextTrack);
  els.prevBtn.addEventListener('click', playPrevTrack);

  const toggleShuffle = () => {
    state.shuffle = !state.shuffle;
    storage.set('player-shuffle', state.shuffle);
    renderPlayer();
  };
  els.shuffleBtn.addEventListener('click', toggleShuffle);
  els.heroShuffle.addEventListener('click', toggleShuffle);

  els.repeatBtn.addEventListener('click', () => {
    state.repeatOne = !state.repeatOne;
    renderPlayer();
  });

  els.likeBtn.addEventListener('click', () => {
    const track = currentTrack();
    if (!track) return;
    if (state.liked.has(track.id)) state.liked.delete(track.id);
    else state.liked.add(track.id);
    storage.set('player-liked', [...state.liked]);
    renderPlayer();
  });

  // Громкость: audio.volume = ползунок / 100
  els.volume.addEventListener('input', () => setVolume(Number(els.volume.value) / 100));
  els.muteBtn.addEventListener('click', toggleMute);

  // Тема
  els.themeToggle.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('player-theme', next); } catch (e) { /* хранилище недоступно */ }
  });

  // Пробел — play/pause
  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space') return;
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA' || event.target.closest('.track')) return;
    event.preventDefault();
    togglePlay();
  });

  // События audio
  audio.addEventListener('timeupdate', () => {
    if (!isSeeking) updateProgress(audio.currentTime, getDuration());
  });

  audio.addEventListener('loadedmetadata', () => {
    els.duration.textContent = formatTime(audio.duration);
    updateProgress(audio.currentTime, audio.duration);
  });

  audio.addEventListener('ended', () => {
    if (state.repeatOne) {
      audio.currentTime = 0;
      play();
    } else {
      playNextTrack();   // трек закончился — включаем следующий
    }
  });

  // синхронизация, если воспроизведение изменилось извне (медиа-клавиши и т.п.)
  audio.addEventListener('play', () => {
    if (!state.isPlaying) { state.isPlaying = true; renderPlayState(); }
  });
  audio.addEventListener('pause', () => {
    if (state.isPlaying && !audio.ended) { state.isPlaying = false; renderPlayState(); }
  });

  audio.addEventListener('error', () => {
    if (!audio.src) return;
    state.isPlaying = false;
    renderPlayState();
    els.playerArtist.textContent = 'Не удалось загрузить файл';
  });

  bindProgress();
  bindMediaSession();
}

/* ==========================================================
   Старт
   ========================================================== */
async function init() {
  // восстановить настройки
  const savedVolume = storage.get('player-volume', null);
  if (savedVolume && typeof savedVolume.volume === 'number') {
    state.volume = savedVolume.volume;
    state.volumeBeforeMute = savedVolume.before > 0 ? savedVolume.before : DEFAULT_VOLUME;
  }
  const savedCategory = storage.get('player-category', null);
  if (getCategory(savedCategory)) state.category = savedCategory;
  state.shuffle = storage.get('player-shuffle', false) === true;
  const savedLiked = storage.get('player-liked', []);
  if (Array.isArray(savedLiked)) state.liked = new Set(savedLiked);

  audio.volume = state.volume;
  els.volume.value = String(Math.round(state.volume * 100));

  bindEvents();

  // данные загружаются через fetch при старте
  try {
    const response = await fetch('tracks.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    tracks = await response.json();
  } catch (err) {
    tracks = [];
    render();
    els.tracks.replaceChildren(el('li', 'tracks__empty',
      'Не удалось загрузить tracks.json. Откройте проект через локальный сервер (например, Live Server в VS Code).'));
    return;
  }

  render();
}

init();
