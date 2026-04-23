const viewerVideo = document.getElementById('viewer-video');
const offlineOverlay = document.getElementById('offline-overlay');
const btnReconnect = document.getElementById('btn-reconnect');
const scheduleListEl = document.getElementById('viewer-schedule');
const ytContainer = document.getElementById('yt-container');
const ytIframe = document.getElementById('yt-iframe');
const offlineTitle = document.getElementById('offline-title');
const offlineDesc = document.getElementById('offline-desc');
const tvTimeline = document.getElementById('tv-timeline');
const tvProgress = document.getElementById('tv-progress');
const reconnectBox = document.getElementById('reconnect-box');

let scheduleData = [];
let isLiveOffline = true;
let currentActiveScheduleId = null;

viewerVideo.addEventListener('ended', async () => {
    if (currentActiveScheduleId && !getYouTubeDetails(viewerVideo.src)) {
        await deleteScheduleItem(currentActiveScheduleId);
        currentActiveScheduleId = null;
        await loadViewerSchedule();
    }
});

async function loadViewerSchedule() {
    scheduleData = await fetchSchedule();
    renderSchedule();
}

async function cleanupOldViewerItems() {
    const now = new Date();
    const staleItems = scheduleData.filter(item => {
        const itemStart = new Date(item.scheduled_at);
        return !Number.isNaN(itemStart.getTime()) && now - itemStart > 1000 * 60 * 60;
    });
    for (const item of staleItems) {
        await deleteScheduleItem(item.id);
    }
    if (staleItems.length) {
        await loadViewerSchedule();
    }
}

function getYouTubeDetails(url) {
    if (!url) return null;
    let videoId = null;
    let playlistId = null;
    
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
            if (urlObj.searchParams.has('v')) videoId = urlObj.searchParams.get('v');
            else if (urlObj.hostname === 'youtu.be') videoId = urlObj.pathname.slice(1);
            else if (urlObj.pathname.startsWith('/embed/')) videoId = urlObj.pathname.split('/')[2];
            else if (urlObj.pathname.startsWith('/live/')) videoId = urlObj.pathname.split('/')[2];
            else if (urlObj.pathname.startsWith('/shorts/')) videoId = urlObj.pathname.split('/')[2];
            
            if (urlObj.searchParams.has('list')) playlistId = urlObj.searchParams.get('list');
            
            if (videoId && videoId.length !== 11) videoId = null;
            if (videoId || playlistId) return { videoId, playlistId };
        }
    } catch (e) {} // Fallback to regex

    const videoRegExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|live|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const vMatch = url.match(videoRegExp);
    if (vMatch && vMatch[1]) videoId = vMatch[1];
    
    const listMatch = url.match(/[?&]list=([^#\&\?]+)/i);
    if (listMatch && listMatch[1]) playlistId = listMatch[1];
    
    if (videoId || playlistId) return { videoId, playlistId };
    return null;
}

function renderSchedule() {
    if (scheduleData.length === 0) {
        scheduleListEl.innerHTML = '<li style="color:var(--text-muted); text-align:center; padding: 20px 0;">Nessun programma al momento...</li>';
        return;
    }
    scheduleListEl.innerHTML = '';
    
    const now = new Date();
    scheduleData.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    
    let activeItem = null;
    
    scheduleData.forEach((item, index) => {
        const itemStart = new Date(item.scheduled_at);
        const itemMinutes = itemStart.getHours() * 60 + itemStart.getMinutes();
        const nextItem = scheduleData[index + 1] ? new Date(scheduleData[index + 1].scheduled_at) : null;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        
        let isActive = false;
        if (itemStart <= now && (!nextItem || now < nextItem)) {
            isActive = true;
        }
        
        const displayTime = item.time || itemStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const li = document.createElement('li');
        li.style.padding = '10px';
        li.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        li.style.display = 'flex';
        li.style.gap = '10px';
        
        if (isActive) {
            li.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            li.style.borderLeft = '3px solid var(--primary-color)';
        }
        
        li.innerHTML = `<strong style="color: ${isActive ? 'var(--primary-color)' : 'white'};">${displayTime}</strong> <span>${item.name}</span>`;
        if (item.url) {
            li.innerHTML += ` <span style="font-size:0.7rem; color:var(--danger-color);">▶ YT</span>`;
        }
        scheduleListEl.appendChild(li);
        
        if (isActive) {
            activeItem = item;
        }
    });
    
    if (isLiveOffline && activeItem && activeItem.url) {
        const activeStart = new Date(activeItem.scheduled_at);
        let diffSeconds = Math.floor((now - activeStart) / 1000);
        if (diffSeconds < 0) diffSeconds = 0;
        
        let totalSeconds = 3600;
        const activeIdx = scheduleData.indexOf(activeItem);
        if (activeIdx < scheduleData.length - 1) {
            const nextItem = scheduleData[activeIdx + 1];
            const nextStart = new Date(nextItem.scheduled_at);
            totalSeconds = Math.max(60, Math.floor((nextStart - activeStart) / 1000));
        }
        
        tvTimeline.style.display = 'block';
        let progressPct = (diffSeconds / totalSeconds) * 100;
        if (progressPct > 100) progressPct = 100;
        tvProgress.style.width = `${progressPct}%`;

        const ytDetails = getYouTubeDetails(activeItem.url);
        if (ytDetails) {
            let identifier = ytDetails.videoId || ytDetails.playlistId;
            if (!ytIframe.src.includes(identifier)) {
                let src = `https://www.youtube.com/embed/`;
                if (ytDetails.videoId) {
                    src += `${ytDetails.videoId}?autoplay=1&mute=0&start=${diffSeconds}`;
                    if (ytDetails.playlistId) src += `&list=${ytDetails.playlistId}`;
                } else {
                    src += `videoseries?list=${ytDetails.playlistId}&autoplay=1&mute=0`;
                }
                ytIframe.src = src;
            }
            ytContainer.style.display = 'block';
            viewerVideo.style.display = 'none';
            currentActiveScheduleId = activeItem.id;
        } else {
            ytContainer.style.display = 'none';
            viewerVideo.style.display = 'block';
            if (viewerVideo.src !== activeItem.url) {
                viewerVideo.srcObject = null;
                viewerVideo.src = activeItem.url;
                viewerVideo.currentTime = diffSeconds;
                viewerVideo.play().catch(e => console.log('Autoplay blocked', e));
            }
            currentActiveScheduleId = activeItem.id;
        }
        
        offlineTitle.innerText = activeItem.name;
        offlineDesc.style.display = 'none';
        reconnectBox.style.display = 'flex';
    } else if (isLiveOffline) {
        currentActiveScheduleId = null;
        tvTimeline.style.display = 'none';
        ytContainer.style.display = 'none';
        viewerVideo.style.display = 'block';
        viewerVideo.srcObject = null;
        viewerVideo.src = "";
        ytIframe.src = "";
        offlineTitle.innerText = 'Stream Offline';
        offlineDesc.style.display = 'block';
        reconnectBox.style.display = 'flex';
    } else {
        tvTimeline.style.display = 'none';
    }
}
loadViewerSchedule();
setInterval(loadViewerSchedule, 10000);
setInterval(cleanupOldViewerItems, 60000);

let peer = null;
let dataConn = null;
const STUDIO_FIXED_ID = 'canale100-live-broadcast-prod-v2';

function connectToStudio() {
    btnReconnect.disabled = true;
    btnReconnect.textContent = 'Connessione...';

    if (peer) {
        peer.destroy();
    }

    peer = new Peer({
        config: {'iceServers': [
            { url: 'stun:stun.l.google.com:19302' }
        ]}
    });

    peer.on('open', (id) => {
        console.log('My Viewer ID:', id);
        
        // Auto-connect to fixed studio ID
        dataConn = peer.connect(STUDIO_FIXED_ID);
        
        dataConn.on('open', () => {
            console.log('Connected to Studio data channel');
            btnReconnect.textContent = 'Riprova a Connetterti';
            offlineOverlay.querySelector('h2').textContent = 'In Attesa del Segnale...';
            offlineOverlay.querySelector('p').textContent = 'Il Regista è connesso, in attesa della diretta.';
        });

        dataConn.on('data', (data) => {
            if (data.type === 'viewers') {
                viewerCountEl.textContent = data.count;
            } else if (data.type === 'schedule') {
                scheduleData = data.data;
                sessionStorage.setItem('tv_schedule', JSON.stringify(scheduleData));
                renderSchedule();
            }
        });

        dataConn.on('close', () => {
            showOffline();
        });
        
        dataConn.on('error', () => {
            showOffline();
        });
    });

    peer.on('call', (call) => {
        console.log('Receiving broadcast...');
        call.answer(); 
        
        call.on('stream', (stream) => {
            if (stream) {
                viewerVideo.style.display = 'block';
                viewerVideo.src = "";
                viewerVideo.srcObject = stream;
                offlineOverlay.style.display = 'none';
                ytContainer.style.display = 'none';
                tvTimeline.style.display = 'none';
                isLiveOffline = false;
                renderSchedule(); // update layout since we are live
            }
        });

        call.on('close', () => {
            offlineOverlay.style.display = 'flex';
            isLiveOffline = true;
            renderSchedule();
        });

        call.on('error', () => {
            offlineOverlay.style.display = 'flex';
            isLiveOffline = true;
            renderSchedule();
        });
    });

    peer.on('error', (err) => {
        console.log('Peer error:', err);
        showOffline();
    });
}

function showOffline() {
    offlineOverlay.style.display = 'flex';
    offlineOverlay.querySelector('h2').textContent = 'Stream Offline';
    offlineOverlay.querySelector('p').textContent = 'La trasmissione non è ancora iniziata.';
    btnReconnect.disabled = false;
    btnReconnect.textContent = 'Riprova a Connetterti';
    viewerVideo.srcObject = null;
    viewerCountEl.textContent = "0";
}

btnReconnect.addEventListener('click', () => {
    connectToStudio();
});

// Auto-connect on load
connectToStudio();

const btnFullscreen = document.getElementById('btn-fullscreen');
const videoContainer = document.querySelector('.video-container');

btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen();
        } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen();
        } else if (videoContainer.msRequestFullscreen) {
            videoContainer.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
});
