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

// PWA Install prompt
let deferredPrompt;
let installButton = null;

// Listen for the beforeinstallprompt event
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    console.log('Install prompt available');

    // Show install buttons
    showInstallButton();
    showInstallButtonInEmptyState();
});

// Listen for successful installation
window.addEventListener('appinstalled', (e) => {
    console.log('App installed successfully');
    deferredPrompt = null;
    hideInstallButton();
    hideInstallButtonInEmptyState();
});

// Function to manually prompt for installation (called from HTML button)
window.promptInstall = async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('Install prompt outcome:', outcome);
        deferredPrompt = null;
        hideInstallButton();
        hideInstallButtonInEmptyState();
    } else {
        // Fallback: show instructions
        alert('To install this app:\n\n• On Android: Tap the menu (⋮) and select "Add to Home Screen"\n• On iOS: Tap the share button and select "Add to Home Screen"');
    }
};

function showInstallButton() {
    // Check if button already exists
    if (installButton) return;

    // Create install button - positioned at top right
    installButton = document.createElement('button');
    installButton.id = 'installBtn';
    installButton.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
        </svg>
        <span class="text-sm">Install</span>
    `;
    installButton.className = 'fixed top-20 right-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-3 py-2 rounded-full shadow-lg flex items-center space-x-1.5 hover:from-violet-700 hover:to-indigo-700 transition-all transform hover:scale-105 z-50';

    installButton.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log('Install prompt outcome:', outcome);
            deferredPrompt = null;
            hideInstallButton();
        }
    });

    document.body.appendChild(installButton);
}

function hideInstallButton() {
    if (installButton) {
        installButton.remove();
        installButton = null;
    }
}

function showInstallButtonInEmptyState() {
    const btn = document.getElementById('installBtnEmpty');
    if (btn) {
        btn.classList.remove('hidden');
    }
}

function hideInstallButtonInEmptyState() {
    const btn = document.getElementById('installBtnEmpty');
    if (btn) {
        btn.classList.add('hidden');
    }
}

// Check if app is already installed
if (window.matchMedia('(display-mode: standalone)').matches) {
    console.log('App is running in standalone mode');
}

// IndexedDB for storing music files (much larger capacity than localStorage)
let db;
const DB_NAME = 'MusicPlayerDB';
const DB_VERSION = 1;
const STORE_NAME = 'songs';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('IndexedDB error:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('IndexedDB opened successfully');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('name', 'name', { unique: false });
                console.log('Object store created');
            }
        };
    });
}

function saveSongToDB(file) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        // Create a direct URL reference to the file (doesn't copy the data)
        // This streams the file directly from the source
        const fileUrl = URL.createObjectURL(file);

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // Store file reference (name, type, URL) - NOT the actual file data
        // This is much smaller and allows streaming directly from the source
        const song = {
            name: file.name,
            type: file.type || getMediaType(file.name),
            url: fileUrl,
            size: file.size,
            dateAdded: Date.now()
        };

        const request = store.add(song);
        request.onsuccess = () => {
            console.log('File reference saved to DB:', file.name);
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
}

function loadSongsFromDB() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            media = request.result || [];
            console.log('Loaded', media.length, 'songs from DB');
            resolve(media);
        };
        request.onerror = () => reject(request.error);
    });
}

function deleteSongFromDB(id) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => {
            console.log('Song deleted from DB');
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

function clearAllSongsFromDB() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
            console.log('All songs cleared from DB');
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

// Check storage quota
async function checkStorageQuota() {
    if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const used = (estimate.usage / 1024 / 1024).toFixed(2);
        const available = (estimate.quota / 1024 / 1024 / 1024).toFixed(2);
        console.log(`Storage: ${used} MB used, ${available} GB available`);
        return { used, available };
    }
    return null;
}

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
        // Check if file already exists by name and size
        const exists = media.some(m => m.name === file.name && m.size === file.size);
        if (exists) {
            console.log('File already exists:', file.name);
            resolve();
            return;
        }

        // Save the file URL reference to IndexedDB
        saveSongToDB(file)
            .then(async (id) => {
                console.log('Added:', file.name, 'with ID:', id);
                // Reload from DB to get the full list with IDs
                await loadSongsFromDB();
                renderPlaylist();
                updateSongCount();
                checkStorageQuota();
                resolve();
            })
            .catch((err) => {
                console.error('Error adding file:', err);
                alert('Error adding file: ' + file.name);
                resolve();
            });
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

    // Process files and save to IndexedDB
    for (const file of files) {
        await addFileToPlaylist(file);
    }

    // Reload from DB to get IDs
    await loadSongsFromDB();
    renderPlaylist();
    updateSongCount();
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
    checkStorageQuota();

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

    // Support both url (new) and data (old) for backwards compatibility
    const source = item.url || item.data;

    if (!item || !source) {
        console.error("Invalid item or no source");
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
        video.src = source;
        video.style.display = "block";
        video.play().catch(err => console.error("Video play error:", err));

        // Hide disc for video
        const coverContainer = document.getElementById("coverContainer");
        if (coverContainer) coverContainer.style.display = "none";
    } else {
        // Audio playback
        audio.src = source;
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

// Function to remove a song (can be called from UI)
function removeSong(index) {
    if (index < 0 || index >= media.length) return;

    const song = media[index];
    if (song && song.id) {
        deleteSongFromDB(song.id)
            .then(() => {
                media.splice(index, 1);
                if (currentIndex >= media.length) {
                    currentIndex = Math.max(0, media.length - 1);
                }
                renderPlaylist();
                updateSongCount();
                checkStorageQuota();
            })
            .catch(err => console.error('Error removing song:', err));
    }
}

// Function to clear all songs
function clearAllSongs() {
    if (confirm('Are you sure you want to remove all songs?')) {
        clearAllSongsFromDB()
            .then(() => {
                media = [];
                currentIndex = 0;
                audio.src = '';
                if (video) video.src = '';
                renderPlaylist();
                updateSongCount();
                playerView.classList.add('hidden');
                miniPlayer.classList.add('hidden');
                checkStorageQuota();
            })
            .catch(err => console.error('Error clearing songs:', err));
    }
}

// Initialize app
async function initApp() {
    try {
        // Clear old localStorage data if exists
        if (localStorage.getItem('playlist')) {
            localStorage.removeItem('playlist');
            console.log('Cleared old localStorage data');
        }

        await initDB();
        await loadSongsFromDB();
        renderPlaylist();
        updateSongCount();
        checkStorageQuota();
        console.log('App initialized with', media.length, 'songs');
    } catch (err) {
        console.error('Error initializing app:', err);
    }
}

initApp();

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


