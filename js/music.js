/* ============================================
   CorDex Music
   - Search: YouTube Data API v3
   - Playback: YouTube IFrame Player API
   - Favourites: Firebase RTDB (signed-in) or localStorage (guest)
   - Background/lock-screen controls: Media Session API
============================================ */

// -------- 1. FILL THIS IN --------
// Get a key at console.cloud.google.com -> APIs & Services -> Credentials
// Enable "YouTube Data API v3" on that project first.
// Restrict the key to your GitHub Pages domain (HTTP referrers) before going live.
const YOUTUBE_API_KEY = "AIzaSyBfVCcesBQkbxJRIPhKG9SNQqafKFJd6Bo";
// ----------------------------------

const db = firebase.database();
const auth = firebase.auth();

let currentUser = null;
auth.onAuthStateChanged((user) => {
  currentUser = user;
  if (document.getElementById("favourites-view").classList.contains("active")) {
    loadFavourites();
  }
  refreshFavIconsOnScreen();
});

/* ---------------- State ---------------- */
let queue = [];          // current list of track objects being browsed (search results or favourites)
let queueIndex = -1;     // index of currently loaded track within `queue`
let nextPageToken = "";
let lastQuery = "";
let searchSeq = 0;       // guards against out-of-order responses
let isSeeking = false;
let progressTimer = null;

/* ---------------- DOM ---------------- */
const searchInput   = document.getElementById("search-input");
const clearBtn      = document.getElementById("search-clear");
const statusLine    = document.getElementById("search-status");
const resultsList   = document.getElementById("results-list");
const resultsLoader = document.getElementById("results-loader");

const favList  = document.getElementById("favourites-list");
const favEmpty = document.getElementById("favourites-empty");

const playerTitle  = document.getElementById("player-title");
const playerArtist = document.getElementById("player-artist");
const playerArt    = document.getElementById("player-art");
const artRing      = document.getElementById("art-ring");
const playerFavBtn = document.getElementById("player-fav");

const btnPlay  = document.getElementById("btn-play");
const btnPrev  = document.getElementById("btn-prev");
const btnNext  = document.getElementById("btn-next");
const iconPlay  = document.getElementById("icon-play");
const iconPause = document.getElementById("icon-pause");

const seekBar    = document.getElementById("seek-bar");
const volumeBar  = document.getElementById("volume-bar");
const timeCurrent = document.getElementById("time-current");
const timeTotal   = document.getElementById("time-total");

/* ---------------- Nav switching ---------------- */
document.querySelectorAll(".nav-pill[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-pill[data-view]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById(btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "favourites-view") loadFavourites();
  });
});

/* ---------------- Search ---------------- */
let debounceTimer = null;
searchInput.addEventListener("input", () => {
  clearBtn.hidden = searchInput.value.trim().length === 0;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const q = searchInput.value.trim();
    if (q.length === 0) {
      resultsList.innerHTML = "";
      statusLine.hidden = true;
      return;
    }
    runSearch(q, false);
  }, 400);
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  clearBtn.hidden = true;
  resultsList.innerHTML = "";
  statusLine.hidden = true;
  searchInput.focus();
});

async function runSearch(query, isLoadMore) {
  if (YOUTUBE_API_KEY === "YOUR_YOUTUBE_DATA_API_KEY") {
    statusLine.hidden = false;
    statusLine.textContent = "Add your YouTube Data API key in js/music.js to enable search.";
    return;
  }

  const mySeq = ++searchSeq;
  lastQuery = query;

  if (!isLoadMore) {
    resultsList.innerHTML = "";
    nextPageToken = "";
    statusLine.hidden = false;
    statusLine.textContent = "Searching…";
  }
  resultsLoader.hidden = false;

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.search = new URLSearchParams({
      part: "snippet",
      type: "video",
      videoCategoryId: "10", // Music
      maxResults: "25",
      q: query,
      pageToken: isLoadMore ? nextPageToken : "",
      key: YOUTUBE_API_KEY,
    });

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    if (mySeq !== searchSeq) return; // a newer search superseded this one

    if (searchData.error) {
      statusLine.hidden = false;
      statusLine.textContent = "Search failed — check your API key / quota.";
      resultsLoader.hidden = true;
      return;
    }

    nextPageToken = searchData.nextPageToken || "";
    const ids = (searchData.items || []).map((it) => it.id.videoId).filter(Boolean);

    let durations = {};
    if (ids.length) {
      const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      detailsUrl.search = new URLSearchParams({
        part: "contentDetails",
        id: ids.join(","),
        key: YOUTUBE_API_KEY,
      });
      const detailsRes = await fetch(detailsUrl);
      const detailsData = await detailsRes.json();
      (detailsData.items || []).forEach((it) => {
        durations[it.id] = parseISODuration(it.contentDetails.duration);
      });
    }

    const tracks = (searchData.items || [])
      .filter((it) => it.id.videoId)
      .map((it) => ({
        id: it.id.videoId,
        title: decodeHtml(it.snippet.title),
        artist: decodeHtml(it.snippet.channelTitle),
        thumb: it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url || "",
        duration: durations[it.id.videoId] || 0,
      }));

    if (!isLoadMore) {
      queue = tracks;
      statusLine.hidden = true;
    } else {
      queue = queue.concat(tracks);
    }

    tracks.forEach((track) => {
      resultsList.appendChild(buildTrackRow(track, queue.length - tracks.length + tracks.indexOf(track), "search"));
    });

    if (!tracks.length && !isLoadMore) {
      statusLine.hidden = false;
      statusLine.textContent = `No results for "${query}".`;
    }
  } catch (err) {
    console.error(err);
    statusLine.hidden = false;
    statusLine.textContent = "Something went wrong reaching YouTube.";
  } finally {
    resultsLoader.hidden = true;
  }
}

// Infinite scroll: load next page when the loader comes into view
const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting && nextPageToken && lastQuery) {
      runSearch(lastQuery, true);
    }
  });
}, { rootMargin: "300px" });
io.observe(resultsLoader);

/* ---------------- Row building ---------------- */
function buildTrackRow(track, index, source) {
  const li = document.createElement("li");
  li.className = "track-row";
  li.dataset.videoId = track.id;

  const isFav = isFavourite(track.id);

  li.innerHTML = `
    <img class="track-thumb" src="${track.thumb}" alt="" loading="lazy" />
    <div class="track-info">
      <div class="track-title">${escapeHtml(track.title)}</div>
      <div class="track-artist">${escapeHtml(track.artist)}</div>
    </div>
    <div class="track-duration">${track.duration ? formatTime(track.duration) : ""}</div>
    <button class="track-fav ${isFav ? "active" : ""}" aria-label="Toggle favourite">
      <svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10-9.1C.5 8.4 2.4 5 6 5c2 0 3.5 1.1 4.3 2.3l1.7 2.4 1.7-2.4C14.5 6.1 16 5 18 5c3.6 0 5.5 3.4 4 6.9-2.5 4.5-10 9.1-10 9.1z"/></svg>
    </button>
  `;

  li.querySelector(".track-thumb").addEventListener("click", () => playFromSource(track, source));
  li.querySelector(".track-info").addEventListener("click", () => playFromSource(track, source));

  li.querySelector(".track-fav").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavourite(track, e.currentTarget);
  });

  if (currentTrack && currentTrack.id === track.id) li.classList.add("playing");

  return li;
}

function playFromSource(track, source) {
  const list = source === "favourites" ? favouritesCache : queue;
  const idx = list.findIndex((t) => t.id === track.id);
  queue = list;
  queueIndex = idx;
  loadAndPlay(track);
}

/* ---------------- Favourites ---------------- */
let favouritesCache = [];

function favKey() {
  return currentUser ? `CorDex/favourites/${currentUser.uid}` : null;
}

function isFavourite(id) {
  if (currentUser) return favouritesCache.some((t) => t.id === id);
  const local = JSON.parse(localStorage.getItem("cordex_favourites") || "{}");
  return !!local[id];
}

async function toggleFavourite(track, btn) {
  const nowFav = !isFavourite(track.id);
  btn.classList.toggle("active", nowFav);

  if (currentUser) {
    const ref = db.ref(`${favKey()}/${track.id}`);
    if (nowFav) await ref.set(track);
    else await ref.remove();
  } else {
    const local = JSON.parse(localStorage.getItem("cordex_favourites") || "{}");
    if (nowFav) local[track.id] = track;
    else delete local[track.id];
    localStorage.setItem("cordex_favourites", JSON.stringify(local));
  }

  refreshFavIconsOnScreen();
  if (currentTrack && currentTrack.id === track.id) {
    playerFavBtn.classList.toggle("active", nowFav);
  }
}

async function loadFavourites() {
  let items = [];
  if (currentUser) {
    const snap = await db.ref(favKey()).once("value");
    const val = snap.val() || {};
    items = Object.values(val);
  } else {
    const local = JSON.parse(localStorage.getItem("cordex_favourites") || "{}");
    items = Object.values(local);
  }
  favouritesCache = items;

  favList.innerHTML = "";
  favEmpty.hidden = items.length > 0;
  items.forEach((track, i) => favList.appendChild(buildTrackRow(track, i, "favourites")));
}

function refreshFavIconsOnScreen() {
  document.querySelectorAll(".track-row").forEach((row) => {
    const fav = isFavourite(row.dataset.videoId);
    row.querySelector(".track-fav")?.classList.toggle("active", fav);
  });
}

playerFavBtn.addEventListener("click", () => {
  if (!currentTrack) return;
  toggleFavourite(currentTrack, playerFavBtn);
});

/* ---------------- YouTube IFrame Player ---------------- */
let ytPlayer = null;
let ytReady = false;
let currentTrack = null;
let pendingTrack = null;

function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player("yt-player", {
    height: "1",
    width: "1",
    playerVars: { playsinline: 1, controls: 0 },
    events: {
      onReady: () => {
        ytReady = true;
        ytPlayer.setVolume(Number(volumeBar.value));
        if (pendingTrack) { loadAndPlay(pendingTrack); pendingTrack = null; }
      },
      onStateChange: onPlayerStateChange,
    },
  });
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

function loadAndPlay(track) {
  currentTrack = track;
  playerTitle.textContent = track.title;
  playerArtist.textContent = track.artist;
  playerArt.src = track.thumb;
  playerFavBtn.classList.toggle("active", isFavourite(track.id));
  document.querySelectorAll(".track-row").forEach((row) => {
    row.classList.toggle("playing", row.dataset.videoId === track.id);
  });

  if (!ytReady) { pendingTrack = track; return; }
  ytPlayer.loadVideoById(track.id);
  updateMediaSession(track);
}

function onPlayerStateChange(e) {
  const state = e.data;
  const playing = state === YT.PlayerState.PLAYING;
  iconPlay.hidden = playing;
  iconPause.hidden = !playing;

  if (playing) {
    startProgressTimer();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
  } else {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
  }

  if (state === YT.PlayerState.ENDED) playNext();
}

function startProgressTimer() {
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (!ytPlayer || isSeeking) return;
    const dur = ytPlayer.getDuration() || 0;
    const cur = ytPlayer.getCurrentTime() || 0;
    if (dur > 0) {
      seekBar.value = Math.floor((cur / dur) * 1000);
      artRing.style.setProperty("--progress", `${(cur / dur) * 100}%`);
    }
    timeCurrent.textContent = formatTime(cur);
    timeTotal.textContent = formatTime(dur);
  }, 500);
}

/* ---------------- Transport controls ---------------- */
btnPlay.addEventListener("click", () => {
  if (!ytPlayer || !currentTrack) return;
  const state = ytPlayer.getPlayerState();
  if (state === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
  else ytPlayer.playVideo();
});

btnPrev.addEventListener("click", playPrev);
btnNext.addEventListener("click", playNext);

function playNext() {
  if (!queue.length) return;
  queueIndex = (queueIndex + 1) % queue.length;
  loadAndPlay(queue[queueIndex]);
}
function playPrev() {
  if (!queue.length) return;
  queueIndex = (queueIndex - 1 + queue.length) % queue.length;
  loadAndPlay(queue[queueIndex]);
}

seekBar.addEventListener("mousedown", () => (isSeeking = true));
seekBar.addEventListener("touchstart", () => (isSeeking = true));
seekBar.addEventListener("change", () => {
  if (!ytPlayer) return;
  const dur = ytPlayer.getDuration() || 0;
  const target = (seekBar.value / 1000) * dur;
  ytPlayer.seekTo(target, true);
  isSeeking = false;
});

volumeBar.addEventListener("input", () => {
  if (ytPlayer) ytPlayer.setVolume(Number(volumeBar.value));
});

/* ---------------- Media Session (lock screen / OS controls) ---------------- */
function updateMediaSession(track) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: "CorDex",
    artwork: [{ src: track.thumb, sizes: "320x180", type: "image/jpeg" }],
  });
  navigator.mediaSession.setActionHandler("play", () => ytPlayer?.playVideo());
  navigator.mediaSession.setActionHandler("pause", () => ytPlayer?.pauseVideo());
  navigator.mediaSession.setActionHandler("previoustrack", playPrev);
  navigator.mediaSession.setActionHandler("nexttrack", playNext);
  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (ytPlayer && details.seekTime != null) ytPlayer.seekTo(details.seekTime, true);
  });
}

/* ---------------- Helpers ---------------- */
function formatTime(seconds) {
  seconds = Math.floor(seconds || 0);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseISODuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || 0, 10);
  const m = parseInt(match[2] || 0, 10);
  const s = parseInt(match[3] || 0, 10);
  return h * 3600 + m * 60 + s;
}

function decodeHtml(str) {
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.value;
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
