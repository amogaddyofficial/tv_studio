const viewerVideo = document.getElementById('viewer-video');
const offlineOverlay = document.getElementById('offline-overlay');
const btnReconnect = document.getElementById('btn-reconnect');
const viewerCountEl = document.getElementById('viewer-count');

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
        
        call.on('stream', (remoteStream) => {
            viewerVideo.srcObject = remoteStream;
            offlineOverlay.style.display = 'none';
        });

        call.on('close', () => {
            showOffline();
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
