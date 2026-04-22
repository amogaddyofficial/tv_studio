import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0';

env.allowLocalModels = false;

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
document.getElementById('media-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        mediaPreview.src = url;
        mediaPreview.style.display = 'block';
        document.getElementById('layout-media').style.display = 'flex';
        // Auto play preview muted
        mediaPreview.muted = true;
        mediaPreview.loop = true;
        mediaPreview.play();
    }
});

let aiPipeline = null;

// AI News Anchor Logic
document.getElementById('btn-generate-news').addEventListener('click', async () => {
    const btn = document.getElementById('btn-generate-news');
    const teleprompter = document.getElementById('news-teleprompter');
    const status = document.getElementById('ai-status');
    const topic = document.getElementById('news-topic').value || 'Tecnologia';
    
    btn.disabled = true;
    
    try {
        status.innerText = "🔍 Ricerca sul web in corso (Wikipedia)...";
        // 1. Web Search
        const wikiUrl = `https://it.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&utf8=&format=json&origin=*`;
        const wikiRes = await fetch(wikiUrl);
        const wikiData = await wikiRes.json();
        let searchContext = "Nessuna informazione trovata.";
        
        if (wikiData.query.search.length > 0) {
            searchContext = wikiData.query.search[0].snippet.replace(/<\/?[^>]+(>|$)/g, ""); // Strip HTML
        }

        status.innerText = "🤖 Caricamento AI Locale (richiede qualche istante al primo avvio)...";
        
        // 2. Load Local AI (Transformers.js)
        if (!aiPipeline) {
            aiPipeline = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-78M', {
                progress_callback: x => {
                    if(x.status === 'downloading') {
                        status.innerText = `📥 Download AI: ${Math.round(x.progress || 0)}%`;
                    }
                }
            });
        }
        
        status.innerText = "🧠 Elaborazione del notiziario...";
        
        // 3. Generate text
        const prompt = `Traduci e riassumi in italiano questa notizia in tono giornalistico: ${searchContext}`;
        
        const out = await aiPipeline(prompt, {
            max_new_tokens: 60,
            temperature: 0.7
        });
        
        let text = out[0].generated_text || searchContext;
        teleprompter.value = `📰 NOTIZIA FLASH: ${topic.toUpperCase()}\n\n${text.trim()}`;
        status.innerText = "✅ Pronto!";
        
    } catch (err) {
        console.error(err);
        status.innerText = "❌ Errore durante la generazione.";
    } finally {
        btn.disabled = false;
    }
});

// WebRTC / PeerJS setup
let peer = null;
let viewers = new Map(); // viewerId -> dataConnection

const STUDIO_FIXED_ID = 'canale100-live-broadcast';

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
