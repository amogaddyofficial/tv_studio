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

let scheduleData = JSON.parse(sessionStorage.getItem('tv_schedule')) || [];
let isLiveOffline = true;

function getYouTubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function renderSchedule() {
    if (scheduleData.length === 0) {
        scheduleListEl.innerHTML = '<li style="color:var(--text-muted); text-align:center; padding: 20px 0;">Nessun programma al momento...</li>';
        return;
    }
    scheduleListEl.innerHTML = '';
    
    // Check current time to highlight active program
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    scheduleData.sort((a, b) => a.time.localeCompare(b.time));
    
    let activeItem = null;
    
    scheduleData.forEach((item, index) => {
        const [h, m] = item.time.split(':').map(Number);
        const itemMins = h * 60 + m;
        
        // Very basic current program logic: it's the current if it's the last one that started before 'now'
        let isActive = false;
        if (itemMins <= currentMinutes) {
            if (index === scheduleData.length - 1 || (scheduleData[index+1] && currentMinutes < (scheduleData[index+1].time.split(':')[0]*60 + Number(scheduleData[index+1].time.split(':')[1])))) {
                isActive = true;
            }
        }
        
        const li = document.createElement('li');
        li.style.padding = '10px';
        li.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        li.style.display = 'flex';
        li.style.gap = '10px';
        
        if (isActive) {
            li.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            li.style.borderLeft = '3px solid var(--primary-color)';
        }
        
        li.innerHTML = `<strong style="color: ${isActive ? 'var(--primary-color)' : 'white'};">${item.time}</strong> <span>${item.name}</span>`;
        if (item.url) {
            li.innerHTML += ` <span style="font-size:0.7rem; color:var(--danger-color);">▶ YT</span>`;
        }
        scheduleListEl.appendChild(li);
        
        if (isActive) {
            activeItem = item;
        }
    });
    
    // Auto-TV logic
    if (isLiveOffline && activeItem && activeItem.url) {
        
        // Calculate diffSeconds for Fake Live
        const activeStart = new Date();
        const [ah, am] = activeItem.time.split(':').map(Number);
        activeStart.setHours(ah, am, 0, 0);
        let diffSeconds = Math.floor((now - activeStart) / 1000);
        if (diffSeconds < 0) diffSeconds = 0;
        
        // Determine End Time (next program or +1 hour)
        let totalSeconds = 3600; // default 1 hour
        let activeIdx = scheduleData.indexOf(activeItem);
        if (activeIdx < scheduleData.length - 1) {
            const nextItem = scheduleData[activeIdx + 1];
            const [nh, nm] = nextItem.time.split(':').map(Number);
            const nextStart = new Date();
            nextStart.setHours(nh, nm, 0, 0);
            if (nextStart < activeStart) nextStart.setDate(nextStart.getDate() + 1);
            totalSeconds = Math.floor((nextStart - activeStart) / 1000);
        }
        
        // Update timeline bar
        tvTimeline.style.display = 'block';
        let progressPct = (diffSeconds / totalSeconds) * 100;
        if (progressPct > 100) progressPct = 100;
        tvProgress.style.width = `${progressPct}%`;

        const ytId = getYouTubeId(activeItem.url);
        if (ytId) {
            // Check if iframe needs update or is missing start time
            if (!ytIframe.src.includes(ytId)) {
                ytIframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=0&start=${diffSeconds}`;
            }
            ytContainer.style.display = 'block';
            viewerVideo.style.display = 'none';
        } else {
            // Assume MP4
            ytContainer.style.display = 'none';
            viewerVideo.style.display = 'block';
            if (viewerVideo.src !== activeItem.url) {
                viewerVideo.srcObject = null;
                viewerVideo.src = activeItem.url;
                viewerVideo.currentTime = diffSeconds;
                viewerVideo.play().catch(e => console.log('Autoplay blocked', e));
            }
        }
        
        offlineTitle.innerText = activeItem.name;
        offlineDesc.style.display = 'none';
        reconnectBox.style.display = 'flex';
        
    } else if (isLiveOffline) {
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
        // Live stream active
        tvTimeline.style.display = 'none';
    }
}
renderSchedule();
setInterval(renderSchedule, 10000); // Check every 10 seconds for timeline

let peer = null;
let dataConn = null;
const STUDIO_FIXED_ID = 'canale100-live-broadcast';

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
