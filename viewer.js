const viewerVideo = document.getElementById('viewer-video');
const offlineOverlay = document.getElementById('offline-overlay');
const joinIdInput = document.getElementById('join-id');
const btnJoin = document.getElementById('btn-join');
const viewerCountEl = document.getElementById('viewer-count');

let peer = null;
let dataConn = null;

function connectToStudio(studioId) {
    if (!studioId) return alert('Please enter a Studio ID');
    
    btnJoin.disabled = true;
    btnJoin.textContent = 'Connecting...';

    peer = new Peer({
        config: {'iceServers': [
            { url: 'stun:stun.l.google.com:19302' }
        ]}
    });

    peer.on('open', (id) => {
        console.log('My Viewer ID:', id);
        
        // Connect data channel to host
        dataConn = peer.connect(studioId);
        
        dataConn.on('open', () => {
            console.log('Connected to Studio data channel');
            btnJoin.textContent = 'Connected';
        });

        dataConn.on('data', (data) => {
            if (data.type === 'viewers') {
                viewerCountEl.textContent = data.count;
            }
        });

        dataConn.on('close', () => {
            offlineOverlay.style.display = 'flex';
            btnJoin.disabled = false;
            btnJoin.textContent = 'Connect';
            viewerVideo.srcObject = null;
        });
    });

    // Receive media stream from Host
    peer.on('call', (call) => {
        console.log('Receiving broadcast...');
        call.answer(); // Answer without sending any stream
        
        call.on('stream', (remoteStream) => {
            viewerVideo.srcObject = remoteStream;
            offlineOverlay.style.display = 'none';
        });

        call.on('close', () => {
            offlineOverlay.style.display = 'flex';
            viewerVideo.srcObject = null;
        });
    });

    peer.on('error', (err) => {
        console.error(err);
        alert('Connection error: ' + err.type);
        btnJoin.disabled = false;
        btnJoin.textContent = 'Connect';
    });
}

btnJoin.addEventListener('click', () => {
    connectToStudio(joinIdInput.value.trim());
});

// Allow enter key
joinIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        connectToStudio(joinIdInput.value.trim());
    }
});
