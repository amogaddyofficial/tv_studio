const canvas = document.getElementById('studio-canvas');
const ctx = canvas.getContext('2d');
const camVideo = document.getElementById('cam-video');
const screenVideo = document.getElementById('screen-video');
const mediaPreview = document.getElementById('media-preview');
const viewerCountEl = document.getElementById('viewer-count');

let camStream = null;
let screenStream = null;
let mixedStream = null;
let isBroadcasting = false;
let currentLayout = 'camera-only';

document.querySelectorAll('.mixer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mixer-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        if(e.target.id === 'layout-cam') currentLayout = 'camera-only';
        if(e.target.id === 'layout-screen') currentLayout = 'screen-only';
        if(e.target.id === 'layout-pip') currentLayout = 'pip';
        if(e.target.id === 'layout-split') currentLayout = 'split';
        if(e.target.id === 'layout-media') currentLayout = 'media';
    });
});

// Media Player Logic
let mediaPlaylist = [];
let currentMediaIndex = 0;

document.getElementById('media-upload').addEventListener('change', (e) => {
    mediaPlaylist = Array.from(e.target.files);
    currentMediaIndex = 0;
    
    if (mediaPlaylist.length > 0) {
        playMediaIndex(currentMediaIndex);
        mediaPreview.style.display = 'block';
        document.getElementById('layout-media').style.display = 'flex';
    }
});

function playMediaIndex(index) {
    if (index >= mediaPlaylist.length) {
        index = 0; // loop playlist
        currentMediaIndex = 0;
    }
    const file = mediaPlaylist[index];
    if (file) {
        const url = URL.createObjectURL(file);
        mediaPreview.src = url;
        mediaPreview.muted = true; // muted per il regista
        mediaPreview.loop = false; // non loopa il singolo file
        mediaPreview.play().catch(e => console.error(e));
        renderPlaylistUI();
    }
}

function renderPlaylistUI() {
    const ui = document.getElementById('media-playlist-ui');
    if (!ui) return;
    ui.innerHTML = '';
    mediaPlaylist.forEach((file, idx) => {
        const li = document.createElement('li');
        li.style.padding = '2px 0';
        li.innerText = `${idx + 1}. ${file.name}`;
        if (idx === currentMediaIndex) {
            li.style.color = 'var(--primary-color)';
            li.style.fontWeight = 'bold';
        }
        ui.appendChild(li);
    });
}

mediaPreview.addEventListener('ended', () => {
    if (mediaPlaylist.length > 1) {
        currentMediaIndex++;
        playMediaIndex(currentMediaIndex);
        
        // Se siamo in onda con il layout media, il cambio file potrebbe far perdere la traccia audio a PeerJS.
        // Tentiamo di ri-sostituire la traccia audio per gli spettatori se supportato (solo Chrome/Firefox recenti)
        if (isBroadcasting && currentLayout === 'media' && mediaPreview.captureStream) {
            setTimeout(() => {
                try {
                    mediaPreview.muted = false; // Riattiva l'audio per lo stream
                    const newMStream = mediaPreview.captureStream();
                    if(newMStream.getAudioTracks().length > 0) {
                        const newAudioTrack = newMStream.getAudioTracks()[0];
                        viewers.forEach(conn => {
                            // Se PeerJS espone la peerConnection, possiamo provare a sostituire la traccia
                            if (conn.peerConnection) {
                                const sender = conn.peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
                                if (sender) sender.replaceTrack(newAudioTrack);
                            }
                        });
                    }
                } catch(e) { console.log('Audio track swap non supportato', e); }
            }, 500); // piccolo ritardo per permettere al file di iniziare
        }
    } else {
        mediaPreview.play(); // loop singolo file
    }
});

// Palinsesto (Schedule) Logic
let schedule = [];

async function loadScheduleFromSupabase() {
    schedule = await fetchSchedule();
    renderSchedule();
}

function renderSchedule() {
    const list = document.getElementById('schedule-list');
    list.innerHTML = '';
    schedule.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    schedule.forEach((item, index) => {
        const displayTime = item.time || formatScheduleTime(item.scheduled_at);
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.padding = '4px 0';
        li.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        li.innerHTML = `<span><strong>${displayTime}</strong> - ${item.name}</span> <button class="danger" style="padding:2px 6px; font-size:0.6rem;" onclick="removeSchedule('${item.id}')">X</button>`;
        list.appendChild(li);
    });
}

window.removeSchedule = async function(id) {
    const removed = await deleteScheduleItem(id);
    if (removed) {
        schedule = schedule.filter(item => item.id !== id);
        renderSchedule();
    }
};

document.getElementById('btn-add-prog').addEventListener('click', async () => {
    const t = document.getElementById('prog-time').value;
    const n = document.getElementById('prog-name').value;
    const u = document.getElementById('prog-url').value.trim();
    const fileInput = document.getElementById('prog-file-upload');
    const file = fileInput.files[0];

    if (!t || !n || (!file && !u)) {
        alert("Inserisci Orario, Nome e un file o un URL MP4/YouTube!");
        return;
    }

    try {
        let mediaUrl = u;
        if (file) {
            mediaUrl = await uploadMediaFile(file);
        }

        const newItem = await addScheduleItem({ time: t, name: n, url: mediaUrl });
        schedule.push(newItem);
        renderSchedule();

        document.getElementById('prog-time').value = '';
        document.getElementById('prog-name').value = '';
        document.getElementById('prog-url').value = '';
        fileInput.value = '';
    } catch (error) {
        console.error('Errore aggiunta palinsesto:', error);
        alert('Errore durante l\'aggiunta al palinsesto. Controlla la configurazione Supabase.');
    }
});

function syncScheduleToViewers() {
    viewers.forEach(conn => {
        if (conn.open) {
            conn.send({ type: 'schedule', data: schedule });
        }
    });
}

document.getElementById('btn-sync-schedule').addEventListener('click', () => {
    syncScheduleToViewers();
    alert('Palinsesto sincronizzato agli spettatori!');
});

loadScheduleFromSupabase();

// Stats Logic (Storico Settimanale)
let dailyStats = JSON.parse(localStorage.getItem('tv_stats')) || {};
let currentPeak = 0;

function updatePeakStats(count) {
    if (count > currentPeak) {
        currentPeak = count;
        const today = new Date().toISOString().split('T')[0];
        dailyStats[today] = Math.max(dailyStats[today] || 0, currentPeak);
        localStorage.setItem('tv_stats', JSON.stringify(dailyStats));
        renderStats();
    }
}

function renderStats() {
    const chart = document.getElementById('stats-chart');
    const labels = document.getElementById('stats-labels');
    chart.innerHTML = '';
    labels.innerHTML = '';
    
    // Get last 7 days
    const dates = [];
    for(let i=6; i>=0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }
    
    const maxVal = Math.max(...dates.map(d => dailyStats[d] || 0), 10); // at least 10 scale
    
    dates.forEach(d => {
        const val = dailyStats[d] || 0;
        const heightPct = (val / maxVal) * 100;
        
        const bar = document.createElement('div');
        bar.style.flex = '1';
        bar.style.backgroundColor = 'var(--primary-color)';
        bar.style.height = `${heightPct}%`;
        bar.style.borderRadius = '2px 2px 0 0';
        bar.title = `${d}: ${val} spettatori`;
        chart.appendChild(bar);
        
        const lbl = document.createElement('div');
        lbl.innerText = d.split('-')[2]; // just day number
        labels.appendChild(lbl);
    });
}
renderStats();

// WebRTC / PeerJS setup
let peer = null;
let viewers = new Map(); // viewerId -> dataConnection

const STUDIO_FIXED_ID = 'canale100-live-broadcast-prod-v2';

// Google Auth Callback
window.handleCredentialResponse = function(response) {
    try {
        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        
        const payload = JSON.parse(jsonPayload);
        const email = payload.email.toLowerCase();
        
        // Autorizzazioni
        const allowedEmails = ['amogaddyofficial@gmail.com'];
        
        if (allowedEmails.includes(email)) {
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('app-content').style.display = 'flex';
            initApp();
        } else {
            document.getElementById('login-error').innerText = "Accesso negato. L'email " + email + " non è autorizzata.";
        }
    } catch (e) {
        console.error(e);
        document.getElementById('login-error').innerText = "Errore durante il login.";
    }
};

function initApp() {
    // Start mixing loop
    drawMixer();
    initPeer();
}

function initPeer() {
    // We use a fixed ID so viewers can connect automatically
    peer = new Peer(STUDIO_FIXED_ID, {
        config: {'iceServers': [
            { url: 'stun:stun.l.google.com:19302' }
        ]}
    });

    peer.on('open', (id) => {
        console.log('Studio Ready on ID:', id);
    });

    peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            alert('Errore: C\'è già un Regista connesso a questo Canale!');
            isBroadcasting = false;
            document.getElementById('btn-stop').classList.add('hidden');
            document.getElementById('btn-broadcast').classList.remove('hidden');
        } else {
            console.error('Peer error:', err);
        }
    });

    peer.on('connection', (conn) => {
        console.log('Viewer connected via data:', conn.peer);
        viewers.set(conn.peer, conn);
        updateViewerCount();
        
        // Send schedule immediately when they connect
        conn.on('open', () => {
            conn.send({ type: 'schedule', data: schedule });
        });

        conn.on('close', () => {
            viewers.delete(conn.peer);
            updateViewerCount();
        });

        // If broadcasting, immediately send them the stream
        if (isBroadcasting && mixedStream) {
            peer.call(conn.peer, mixedStream);
        }
    });
}

function updateViewerCount() {
    const count = viewers.size;
    viewerCountEl.textContent = count;
    updatePeakStats(count); // update stats chart
    viewers.forEach(conn => {
        if (conn.open) {
            conn.send({ type: 'viewers', count: count });
        }
    });
}

// Media Capture
document.getElementById('btn-camera').addEventListener('click', async () => {
    try {
        if (camStream) {
            camStream.getTracks().forEach(t => t.stop());
            camStream = null;
            document.getElementById('btn-camera').innerHTML = 'Attiva Camera';
            document.getElementById('btn-camera').classList.remove('primary');
            document.getElementById('btn-camera').classList.add('secondary');
            return;
        }
        camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        camVideo.srcObject = camStream;
        camVideo.play().catch(e => console.error('Play error:', e));
        document.getElementById('btn-camera').innerHTML = 'Disattiva Camera';
        document.getElementById('btn-camera').classList.remove('secondary');
        document.getElementById('btn-camera').classList.add('primary');
    } catch (err) {
        console.error('Error accessing camera:', err);
        alert('Could not access camera.');
    }
});

document.getElementById('btn-screen').addEventListener('click', async () => {
    try {
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
            document.getElementById('btn-screen').innerHTML = 'Condividi Schermo';
            document.getElementById('btn-screen').classList.remove('primary');
            document.getElementById('btn-screen').classList.add('secondary');
            return;
        }
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenVideo.srcObject = screenStream;
        screenVideo.play().catch(e => console.error('Play error:', e));
        document.getElementById('btn-screen').innerHTML = 'Interrompi Schermo';
        document.getElementById('btn-screen').classList.remove('secondary');
        document.getElementById('btn-screen').classList.add('primary');
        
        screenStream.getVideoTracks()[0].onended = () => {
            screenStream = null;
            document.getElementById('btn-screen').innerHTML = 'Condividi Schermo';
            document.getElementById('btn-screen').classList.remove('primary');
            document.getElementById('btn-screen').classList.add('secondary');
        };
    } catch (err) {
        console.error('Error accessing screen:', err);
    }
});

// Canvas Mixer
function drawMixer() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (currentLayout === 'screen-only' && screenStream) {
        ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
    } else if (currentLayout === 'media' && !mediaPreview.paused) {
        ctx.drawImage(mediaPreview, 0, 0, canvas.width, canvas.height);
    } else if (currentLayout === 'camera-only' && camStream) {
        const aspect = camVideo.videoWidth / camVideo.videoHeight;
        const h = canvas.height;
        const w = h * aspect;
        ctx.drawImage(camVideo, (canvas.width - w) / 2, 0, w, h);
    } else if (currentLayout === 'pip') {
        if (screenStream) {
            ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        }
        if (camStream) {
            const pipW = 320;
            const pipH = 180;
            ctx.drawImage(camVideo, canvas.width - pipW - 20, canvas.height - pipH - 20, pipW, pipH);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.strokeRect(canvas.width - pipW - 20, canvas.height - pipH - 20, pipW, pipH);
        }
    } else if (currentLayout === 'split') {
        if (camStream && screenStream) {
            ctx.drawImage(camVideo, 0, canvas.height/4, canvas.width/2, canvas.height/2);
            ctx.drawImage(screenVideo, canvas.width/2, 0, canvas.width/2, canvas.height);
        } else if (screenStream) {
            ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        } else if (camStream) {
            ctx.drawImage(camVideo, 0, 0, canvas.width, canvas.height);
        }
    }

    requestAnimationFrame(drawMixer);
}

// Broadcast Control
document.getElementById('btn-broadcast').addEventListener('click', () => {
    if (!peer) initPeer();
    
    mixedStream = canvas.captureStream(30);
    
    if (camStream && camStream.getAudioTracks().length > 0) {
        mixedStream.addTrack(camStream.getAudioTracks()[0]);
    } else if (screenStream && screenStream.getAudioTracks().length > 0) {
        mixedStream.addTrack(screenStream.getAudioTracks()[0]);
    } else if (currentLayout === 'media' && mediaPreview.captureStream) {
        // Fallback for media audio if supported
        const mStream = mediaPreview.captureStream();
        if(mStream.getAudioTracks().length > 0) {
            mixedStream.addTrack(mStream.getAudioTracks()[0]);
            mediaPreview.muted = false; // unmute so viewers can hear
        }
    }
    
    isBroadcasting = true;
    document.getElementById('btn-broadcast').classList.add('hidden');
    document.getElementById('btn-stop').classList.remove('hidden');
    
    viewers.forEach((conn, viewerId) => {
        peer.call(viewerId, mixedStream);
    });
});

document.getElementById('btn-stop').addEventListener('click', () => {
    isBroadcasting = false;
    document.getElementById('btn-stop').classList.add('hidden');
    document.getElementById('btn-broadcast').classList.remove('hidden');
    if (peer) {
        peer.destroy();
        viewers.clear();
        updateViewerCount();
        peer = null;
    }
});
