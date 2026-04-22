const canvas = document.getElementById('studio-canvas');
const ctx = canvas.getContext('2d');
const camVideo = document.getElementById('cam-video');
const screenVideo = document.getElementById('screen-video');
const layoutSelect = document.getElementById('layout-select');
const viewerCountEl = document.getElementById('viewer-count');
const studioIdInput = document.getElementById('studio-id');

let camStream = null;
let screenStream = null;
let mixedStream = null;
let isBroadcasting = false;

// WebRTC / PeerJS setup
let peer = null;
let viewers = new Map(); // viewerId -> dataConnection

function initPeer() {
    peer = new Peer({
        config: {'iceServers': [
            { url: 'stun:stun.l.google.com:19302' }
        ]}
    });

    peer.on('open', (id) => {
        studioIdInput.value = id;
        console.log('Studio ID:', id);
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
    // Broadcast count to all viewers
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
            document.getElementById('btn-camera').innerHTML = 'Enable Camera';
            document.getElementById('btn-camera').classList.remove('primary');
            document.getElementById('btn-camera').classList.add('secondary');
            return;
        }
        camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        camVideo.srcObject = camStream;
        document.getElementById('btn-camera').innerHTML = 'Disable Camera';
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
            document.getElementById('btn-screen').innerHTML = 'Share Screen';
            document.getElementById('btn-screen').classList.remove('primary');
            document.getElementById('btn-screen').classList.add('secondary');
            return;
        }
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenVideo.srcObject = screenStream;
        document.getElementById('btn-screen').innerHTML = 'Stop Screen';
        document.getElementById('btn-screen').classList.remove('secondary');
        document.getElementById('btn-screen').classList.add('primary');
        
        screenStream.getVideoTracks()[0].onended = () => {
            screenStream = null;
            document.getElementById('btn-screen').innerHTML = 'Share Screen';
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
    
    const layout = layoutSelect.value;
    
    if (layout === 'screen-only' && screenStream) {
        ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
    } else if (layout === 'camera-only' && camStream) {
        // center camera
        const aspect = camVideo.videoWidth / camVideo.videoHeight;
        const h = canvas.height;
        const w = h * aspect;
        ctx.drawImage(camVideo, (canvas.width - w) / 2, 0, w, h);
    } else if (layout === 'pip') {
        if (screenStream) {
            ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        }
        if (camStream) {
            const pipW = 320;
            const pipH = 180;
            ctx.drawImage(camVideo, canvas.width - pipW - 20, canvas.height - pipH - 20, pipW, pipH);
            // Border
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.strokeRect(canvas.width - pipW - 20, canvas.height - pipH - 20, pipW, pipH);
        }
    } else if (layout === 'split') {
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

// Start mixing loop
drawMixer();

// Broadcast Control
document.getElementById('btn-broadcast').addEventListener('click', () => {
    if (!peer) initPeer();
    
    // Create combined stream
    mixedStream = canvas.captureStream(30);
    
    // If we have audio from camera, add it to the mixed stream
    if (camStream && camStream.getAudioTracks().length > 0) {
        mixedStream.addTrack(camStream.getAudioTracks()[0]);
    } else if (screenStream && screenStream.getAudioTracks().length > 0) {
        mixedStream.addTrack(screenStream.getAudioTracks()[0]);
    }
    
    isBroadcasting = true;
    document.getElementById('btn-broadcast').classList.add('hidden');
    document.getElementById('btn-stop').classList.remove('hidden');
    
    // Send stream to all existing viewers
    viewers.forEach((conn, viewerId) => {
        peer.call(viewerId, mixedStream);
    });
});

document.getElementById('btn-stop').addEventListener('click', () => {
    isBroadcasting = false;
    document.getElementById('btn-stop').classList.add('hidden');
    document.getElementById('btn-broadcast').classList.remove('hidden');
    // Stop all media calls? PeerJS doesn't have an easy "close all calls", but we can disconnect and reconnect or just stop sending data.
    // For simplicity, let's destroy peer and re-init
    if (peer) {
        peer.destroy();
        viewers.clear();
        updateViewerCount();
        initPeer();
    }
});

// Copy ID
studioIdInput.addEventListener('click', () => {
    studioIdInput.select();
    document.execCommand('copy');
    alert('Studio ID copied to clipboard!');
});

// Init on load
initPeer();
