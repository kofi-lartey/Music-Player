const picker = document.getElementById("picker");
const playlistEl = document.getElementById("playlist");
const miniPlayer = document.getElementById("miniPlayer");
const playerView = document.getElementById("playerView");

const cover = document.getElementById("cover");
const miniCover = document.getElementById("miniCover");

const titleEl = document.getElementById("title");
const miniTitle = document.getElementById("miniTitle");

const progress = document.getElementById("progress");
const miniProgress = document.getElementById("miniProgress");

let media = [];
let currentIndex = 0;

const audio = new Audio();
let video;

function openPicker() {
    picker.click();
}

// Scan device for audio/video files using File System Access API
async function scanDevice() {
    if (!("showDirectoryPicker" in window)) {
        alert("Your browser doesn't support scanning. Please use Chrome on Android or desktop.");
        return;
    }

    const scanIndicator = document.getElementById("scanIndicator");
    if (scanIndicator) scanIndicator.classList.remove("hidden");

    try {
        const dirHandle = await window.showDirectoryPicker();
        await scanDirectory(dirHandle);
    } catch (err) {
        console.log("Scan cancelled or failed:", err);
    } finally {
        if (scanIndicator) scanIndicator.classList.add("hidden");
        updateSongCount();
    }
}

async function scanDirectory(dirHandle, depth = 0) {
    if (depth > 5) return; // Limit recursion depth

    const mediaExtensions = [
        '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma',
        '.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v', '.3gp'
    ];

    let foundCount = 0;

    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            const name = entry.name.toLowerCase();
            const ext = name.substring(name.lastIndexOf('.'));

            if (mediaExtensions.includes(ext)) {
                const file = await entry.getFile();
                if (file) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        // Check if file already exists in playlist
                        const exists = media.some(m => m.name === file.name && m.size === file.size);
                        if (!exists) {
                            media.push({
                                name: file.name,
                                type: file.type || getMediaType(ext),
                                data: reader.result,
                                size: file.size
                            });
                            saveToStorage();
                            renderPlaylist();
                            updateSongCount();
                            foundCount++;
                        }
                    };
                    reader.readAsDataURL(file);
                }
            }
        } else if (entry.kind === 'directory') {
            // Skip system directories
            if (!entry.name.startsWith('.') && entry.name !== 'Android') {
                try {
                    await scanDirectory(entry, depth + 1);
                } catch (err) {
                    console.log("Cannot access directory:", entry.name);
                }
            }
        }
    }
}

function getMediaType(ext) {
    const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma'];
    const videoExts = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v', '.3gp'];

    if (audioExts.includes(ext)) return 'audio/' + ext.slice(1);
    if (videoExts.includes(ext)) return 'video/' + ext.slice(1);
    return 'audio/*';
}

picker.addEventListener("change", e => {
    const files = Array.from(e.target.files);

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
            media.push({
                name: file.name,
                type: file.type,
                data: reader.result
            });
            saveToStorage();
            renderPlaylist();
            updateSongCount();
        };
        reader.readAsDataURL(file);
    });
});

function renderPlaylist() {
    const emptyState = document.getElementById("emptyState");

    if (media.length === 0) {
        emptyState.classList.remove("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    playlistEl.innerHTML = "";

    media.forEach((item, i) => {
        const div = document.createElement("div");
        const isVideo = item.type.startsWith("video");
        const icon = isVideo ? "🎬" : "🎵";

        div.className = `song-card p-4 rounded-xl cursor-pointer flex items-center space-x-4 ${i === currentIndex ? 'playing' : ''}`;
        div.innerHTML = `
            <div class="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center flex-shrink-0">
                <span class="text-xl">${icon}</span>
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-medium truncate">${item.name}</p>
                <p class="text-xs text-gray-400">${isVideo ? 'Video' : 'Audio'}</p>
            </div>
            ${i === currentIndex ? `
                <div class="equalizer flex items-end space-x-1 h-6">
                    <div class="eq-bar w-1 bg-indigo-400 rounded-full" style="height: 8px; animation-delay: 0s;"></div>
                    <div class="eq-bar w-1 bg-purple-400 rounded-full" style="height: 16px; animation-delay: 0.2s;"></div>
                    <div class="eq-bar w-1 bg-indigo-400 rounded-full" style="height: 12px; animation-delay: 0.4s;"></div>
                </div>
            ` : ''}
        `;
        div.onclick = () => play(i);
        playlistEl.appendChild(div);
    });
}

function play(i) {
    currentIndex = i;
    const item = media[i];

    if (item.type.startsWith("video")) {
        if (!video) {
            video = document.createElement("video");
            video.controls = true;
            video.className = "w-full";
            playerView.appendChild(video);
        }
        video.src = item.data;
        video.play();
    } else {
        audio.src = item.data;
        audio.play();
    }

    miniPlayer.classList.remove("hidden");
    playerView.classList.remove("hidden");

    titleEl.textContent = item.name;
    miniTitle.textContent = item.name;

    // Update mini player icon
    const isVideo = item.type.startsWith("video");
    document.getElementById("miniIcon").textContent = isVideo ? "🎬" : "🎵";

    // Update disc animation
    const discContainer = document.getElementById("discContainer");
    if (discContainer) {
        if (!audio.paused) {
            discContainer.classList.add("playing");
        } else {
            discContainer.classList.remove("playing");
        }
    }

    renderPlaylist();
}

function toggle() {
    const isPlaying = audio.paused && (!video || video.paused);

    if (video && video.src === audio.src) {
        // Video is showing, toggle video
        if (video.paused) video.play();
        else video.pause();
    } else if (audio.src) {
        if (audio.paused) audio.play();
        else audio.pause();
    }

    // Update disc animation
    const discContainer = document.getElementById("discContainer");
    if (discContainer) {
        if (!audio.paused) {
            discContainer.classList.add("playing");
        } else {
            discContainer.classList.remove("playing");
        }
    }

    updatePlayPauseButtons(!audio.paused);
}

function updatePlayPauseButtons(isPlaying) {
    const playIcons = [document.getElementById("playIcon"), document.getElementById("fullPlayIcon")];
    const pauseIcons = [document.getElementById("pauseIcon"), document.getElementById("fullPauseIcon")];

    playIcons.forEach(icon => {
        if (icon) icon.classList.toggle("hidden", isPlaying);
    });

    pauseIcons.forEach(icon => {
        if (icon) icon.classList.toggle("hidden", !isPlaying);
    });
}

function next() {
    currentIndex = (currentIndex + 1) % media.length;
    play(currentIndex);
}

function prev() {
    currentIndex = (currentIndex - 1 + media.length) % media.length;
    play(currentIndex);
}

progress.addEventListener("input", () => {
    if (audio.duration) {
        audio.currentTime = (progress.value / 100) * audio.duration;
    }
});

audio.addEventListener("timeupdate", () => {
    if (audio.duration) {
        const percent = (audio.currentTime / audio.duration) * 100;
        progress.value = percent;
        miniProgress.style.width = percent + "%";

        // Update time display
        const current = formatTime(audio.currentTime);
        const total = formatTime(audio.duration);
        const currentTimeEl = document.getElementById("currentTime");
        const totalTimeEl = document.getElementById("totalTime");
        if (currentTimeEl) currentTimeEl.textContent = current;
        if (totalTimeEl) totalTimeEl.textContent = total;
    }
});

function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function closePlayer() {
    playerView.classList.add("hidden");
}

function saveToStorage() {
    localStorage.setItem("playlist", JSON.stringify(media));
}

function loadFromStorage() {
    const data = localStorage.getItem("playlist");
    if (data) {
        media = JSON.parse(data);
        renderPlaylist();
        updateSongCount();
    }
}

function updateSongCount() {
    const countEl = document.getElementById("songCount");
    if (countEl) {
        const count = media.length;
        if (count === 0) {
            countEl.textContent = "No songs yet";
        } else if (count === 1) {
            countEl.textContent = "1 song";
        } else {
            countEl.textContent = `${count} songs`;
        }
    }
}

// Auto-scan on app load
let autoScanAttempts = 0;
const MAX_AUTO_SCAN_ATTEMPTS = 3;

async function autoScan() {
    // Check if already has songs, skip auto-scan
    if (media.length > 0) return;

    // Check if File System Access API is supported
    if (!("showDirectoryPicker" in window)) {
        console.log("File System Access API not supported, skipping auto-scan");
        return;
    }

    autoScanAttempts++;
    console.log(`Auto-scan attempt ${autoScanAttempts}/${MAX_AUTO_SCAN_ATTEMPTS}`);

    const scanIndicator = document.getElementById("scanIndicator");
    if (scanIndicator) {
        scanIndicator.innerHTML = `
            <div class="flex items-center justify-center space-x-3 text-violet-300">
                <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span class="text-sm font-medium">Looking for music...</span>
            </div>
        `;
        scanIndicator.classList.remove("hidden");
    }

    try {
        const dirHandle = await window.showDirectoryPicker();
        await scanDirectory(dirHandle);
    } catch (err) {
        console.log("Auto-scan cancelled or failed:", err.message);
        // Try again if we haven't exceeded max attempts
        if (autoScanAttempts < MAX_AUTO_SCAN_ATTEMPTS && err.name !== 'AbortError') {
            setTimeout(autoScan, 1000); // Retry after 1 second
        }
    } finally {
        if (scanIndicator) {
            scanIndicator.classList.add("hidden");
        }
        updateSongCount();
    }
}

// Initialize app
loadFromStorage();

// Service Worker Registration
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js")
        .then(reg => console.log("Service Worker registered:", reg.scope))
        .catch(err => console.log("Service Worker registration failed:", err));
}

// Check URL params for actions
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('action') === 'scan') {
    // If opened via shortcut, trigger scan
    setTimeout(() => scanDevice(), 500);
}
