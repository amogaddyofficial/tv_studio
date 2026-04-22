const viewerVideo = document.getElementById('viewer-video');
const offlineOverlay = document.getElementById('offline-overlay');
const btnReconnect = document.getElementById('btn-reconnect');
const scheduleListEl = document.getElementById('viewer-schedule');
const ytContainer = document.getElementById('yt-container');
const ytIframe = document.getElementById('yt-iframe');
const offlineTitle = document.getElementById('offline-title');
const offlineDesc = document.getElementById('offline-desc');

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
        const ytId = getYouTubeId(activeItem.url);
        if (ytId) {
            if (ytIframe.src !== `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=0`) {
                ytIframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=0`;
            }
            ytContainer.style.display = 'block';
            offlineTitle.innerText = activeItem.name;
            offlineDesc.style.display = 'none';
        }
    } else if (isLiveOffline) {
        ytContainer.style.display = 'none';
        ytIframe.src = "";
        offlineTitle.innerText = 'Stream Offline';
        offlineDesc.style.display = 'block';
    }
}
renderSchedule();
setInterval(renderSchedule, 60000); // update highlighting every minute

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
                viewerVideo.srcObject = stream;
                offlineOverlay.style.display = 'none';
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
