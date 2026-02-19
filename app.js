const picker = document.getElementById("picker");
const playlistEl = document.getElementById("playlist");
const miniPlayer = document.getElementById("miniPlayer");
const playerView = document.getElementById("playerView");

const cover = document.getElementById("cover");

const titleEl = document.getElementById("title");
const miniTitle = document.getElementById("miniTitle");

const progress = document.getElementById("progress");
const miniProgress = document.getElementById("miniProgress");

let media = [];
let currentIndex = 0;

const audio = new Audio();
let video;

// Error handling for audio playback
audio.addEventListener('error', (e) => {
    console.error('Audio error:', audio.error);
    alert('Unable to play this audio file. The format may not be supported.');
});

audio.addEventListener('loadedmetadata', () => {
    console.log('Audio loaded, duration:', audio.duration);
});

function openPicker() {
    picker.value = ''; // Reset to allow selecting same file again
    picker.click();
}

// Scan device for audio/video files using File System Access API
async function scanDevice() {
    const scanIndicator = document.getElementById("scanIndicator");
    if (scanIndicator) {
        scanIndicator.classList.remove("hidden");
    }

    // Try File System Access API first (desktop Chrome)
    if ("showDirectoryPicker" in window) {
        try {
            const dirHandle = await window.showDirectoryPicker();
            await scanDirectory(dirHandle);
            finishScan();
            return;
        } catch (err) {
            console.log("Directory picker not available:", err);
        }
    }

    // Fallback: Use the file picker to select multiple files
    alert("Please use the Add button to select music files from your device.");
    finishScan();
}

async function scanDirectory(dirHandle, depth = 0) {
    if (depth > 3) return; // Limit recursion depth for performance

    const mediaExtensions = [
        '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma',
        '.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v', '.3gp'
    ];

    try {
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                const name = entry.name.toLowerCase();
                const ext = name.includes('.') ? name.substring(name.lastIndexOf('.')) : '';

                if (mediaExtensions.includes(ext)) {
                    try {
                        const file = await entry.getFile();
                        if (file) {
                            await addFileToPlaylist(file);
                        }
                    } catch (err) {
                        console.log("Cannot access file:", entry.name);
                    }
                }
            } else if (entry.kind === 'directory') {
                // Skip system directories
                if (!entry.name.startsWith('.') &&
                    !entry.name.startsWith('__') &&
                    entry.name !== 'Android' &&
                    entry.name !== 'iOS') {
                    try {
                        await scanDirectory(entry, depth + 1);
                    } catch (err) {
                        console.log("Cannot access directory:", entry.name);
                    }
                }
            }
        }
    } catch (err) {
        console.log("Error scanning directory:", err);
    }
}

function addFileToPlaylist(file) {
    return new Promise((resolve) => {
        // Check if file already exists
        const exists = media.some(m => m.name === file.name && m.size === file.size);
        if (exists) {
            resolve();
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            media.push({
                name: file.name,
                type: file.type || getMediaType(file.name),
                data: reader.result,
                size: file.size
            });
            saveToStorage();
            renderPlaylist();
            updateSongCount();
            console.log("Added:", file.name);
            resolve();
        };
        reader.onerror = () => {
            console.error("Error reading file:", file.name);
            resolve();
        };
        reader.readAsDataURL(file);
    });
}

function getMediaType(filename) {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.') + 1);
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'];
    const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'm4v', '3gp'];

    if (audioExts.includes(ext)) return 'audio/' + ext;
    if (videoExts.includes(ext)) return 'video/' + ext;
    return 'audio/mpeg';
}

// File picker handler - fixed to handle multiple files properly
picker.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);

    if (files.length === 0) return;

    const scanIndicator = document.getElementById("scanIndicator");
    if (scanIndicator) {
        scanIndicator.innerHTML = `
            <div class="flex items-center justify-center space-x-3 text-violet-300">
                <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span class="text-sm font-medium">Adding ${files.length} file(s)...</span>
            </div>
        `;
        scanIndicator.classList.remove("hidden");
    }

    // Process files sequentially to avoid memory issues
    for (const file of files) {
        await addFileToPlaylist(file);
    }

    finishScan();

    // Reset picker value to allow re-selecting same files
    picker.value = '';
});

function finishScan() {
    const scanIndicator = document.getElementById("scanIndicator");
    if (scanIndicator) {
        scanIndicator.classList.add("hidden");
    }
    updateSongCount();

    // If this is the first song, auto-play it
    if (media.length > 0 && currentIndex === 0 && audio.src === '') {
        play(0);
    }
}

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
        const isVideo = item.type && item.type.startsWith("video");
        const icon = isVideo ? "🎬" : "🎵";

        div.className = `song-card p-4 rounded-xl cursor-pointer flex items-center space-x-4 ${i === currentIndex ? 'playing' : ''}`;
        div.style.animationDelay = `${i * 50}ms`; // Stagger animation
        div.innerHTML = `
            <div class="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-600/30 to-indigo-600/30 flex items-center justify-center flex-shrink-0">
                <span class="text-xl">${icon}</span>
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-medium truncate">${item.name}</p>
                <p class="text-xs text-gray-500">${isVideo ? 'Video' : 'Audio'}</p>
            </div>
            ${i === currentIndex ? `
                <div class="equalizer flex items-end space-x-1 h-6">
                    <div class="eq-bar w-1 bg-violet-400 rounded-full" style="height: 8px; animation-delay: 0s;"></div>
                    <div class="eq-bar w-1 bg-indigo-400 rounded-full" style="height: 16px; animation-delay: 0.2s;"></div>
                    <div class="eq-bar w-1 bg-violet-400 rounded-full" style="height: 12px; animation-delay: 0.4s;"></div>
                </div>
            ` : ''}
        `;
        div.onclick = () => play(i);
        playlistEl.appendChild(div);
    });
}

function play(i) {
    if (i < 0 || i >= media.length) return;

    currentIndex = i;
    const item = media[i];

    if (!item || !item.data) {
        console.error("Invalid item or no data");
        return;
    }

    console.log("Playing:", item.name, "Type:", item.type);

    if (item.type && item.type.startsWith("video")) {
        if (!video) {
            video = document.createElement("video");
            video.controls = true;
            video.className = "w-full";
            video.style.display = "none";
            playerView.appendChild(video);
        }
        video.src = item.data;
        video.style.display = "block";
        video.play().catch(err => console.error("Video play error:", err));

        // Hide disc for video
        const coverContainer = document.getElementById("coverContainer");
        if (coverContainer) coverContainer.style.display = "none";
    } else {
        // Audio playback
        audio.src = item.data;
        audio.play().catch(err => {
            console.error("Audio play error:", err);
            alert("Unable to play this audio file. Please try another file.");
        });

        // Show disc for audio
        const coverContainer = document.getElementById("coverContainer");
        if (coverContainer) coverContainer.style.display = "flex";
    }

    miniPlayer.classList.remove("hidden");
    playerView.classList.remove("hidden");

    titleEl.textContent = item.name;
    miniTitle.textContent = item.name;

    // Update mini player icon
    const isVideo = item.type && item.type.startsWith("video");
    const miniIcon = document.getElementById("miniIcon");
    if (miniIcon) miniIcon.textContent = isVideo ? "🎬" : "🎵";

    // Update disc animation
    const discContainer = document.getElementById("discContainer");
    if (discContainer) {
        discContainer.classList.add("playing");
    }

    // Update play button state
    updatePlayPauseButtons(true);

    renderPlaylist();
}

function toggle() {
    const item = media[currentIndex];
    if (!item) return;

    const isVideo = item.type && item.type.startsWith("video");

    if (isVideo && video) {
        if (video.paused) {
            video.play();
            updatePlayPauseButtons(true);
        } else {
            video.pause();
            updatePlayPauseButtons(false);
        }
    } else if (audio.src) {
        if (audio.paused) {
            audio.play();
            updatePlayPauseButtons(true);
            const discContainer = document.getElementById("discContainer");
            if (discContainer) discContainer.classList.add("playing");
        } else {
            audio.pause();
            updatePlayPauseButtons(false);
            const discContainer = document.getElementById("discContainer");
            if (discContainer) discContainer.classList.remove("playing");
        }
    }
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
    if (media.length === 0) return;
    currentIndex = (currentIndex + 1) % media.length;
    play(currentIndex);
}

function prev() {
    if (media.length === 0) return;
    currentIndex = (currentIndex - 1 + media.length) % media.length;
    play(currentIndex);
}

progress.addEventListener("input", () => {
    if (audio.duration && isFinite(audio.duration)) {
        audio.currentTime = (progress.value / 100) * audio.duration;
    }
});

audio.addEventListener("timeupdate", () => {
    if (audio.duration && isFinite(audio.duration)) {
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

// Handle audio ending - play next
audio.addEventListener("ended", () => {
    next();
});

function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function closePlayer() {
    // Pause audio when closing
    if (audio.src) {
        audio.pause();
    }
    if (video) {
        video.pause();
    }
    playerView.classList.add("hidden");
    updatePlayPauseButtons(false);
}

function saveToStorage() {
    try {
        localStorage.setItem("playlist", JSON.stringify(media));
    } catch (err) {
        console.error("Error saving to storage:", err);
        // Clear old data if storage is full
        if (err.name === 'QuotaExceededError') {
            localStorage.removeItem("playlist");
            alert("Storage full. Please remove some songs.");
        }
    }
}

function loadFromStorage() {
    try {
        const data = localStorage.getItem("playlist");
        if (data) {
            media = JSON.parse(data);
            renderPlaylist();
            updateSongCount();
        }
    } catch (err) {
        console.error("Error loading from storage:", err);
        localStorage.removeItem("playlist");
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
    setTimeout(() => scanDevice(), 500);
}
