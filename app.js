// SeCom Application Controller
import { db, auth } from './firebase-config.js';
import { signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp, 
    doc, 
    getDoc, 
    setDoc,
    updateDoc,
    deleteDoc 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { encrypt, decrypt } from './cipher.js';

// Application State
let currentUser = null;
let activeRoomId = null;
let unsubscribeMessages = null;
let unsubscribeParticipants = null;
let autoDecrypt = false;
let isConnected = false;

// P2P Cryptography State
let localKeyPair = null;
let derivedSharedKey = null;
let localParticipantId = null;

function getParticipantId() {
    if (!localParticipantId) {
        localParticipantId = sessionStorage.getItem('secom_participant_id');
        if (!localParticipantId) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < 16; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            localParticipantId = result;
            sessionStorage.setItem('secom_participant_id', localParticipantId);
        }
    }
    return localParticipantId;
}

// Hex-to-ArrayBuffer and ArrayBuffer-to-Hex helpers
function arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function hexToArrayBuffer(hexString) {
    const bytes = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
    }
    return bytes.buffer;
}

// Generate local ECDH P-256 Key Pair
async function generateECDHKey() {
    try {
        localKeyPair = await window.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey", "deriveBits"]
        );
    } catch (err) {
        console.error("ECDH generation error: ", err);
        showToast("Cryptographic setup failed", "error");
    }
}


// DOM Elements
const screenLogin = document.getElementById('screen-login');
const screenLobby = document.getElementById('screen-lobby');
const screenChat = document.getElementById('screen-chat');

const formLogin = document.getElementById('form-login');
const usernameInput = document.getElementById('username');
const lobbyUsername = document.getElementById('lobby-username');

const btnCreateRoom = document.getElementById('btn-create-room');
const formJoinRoom = document.getElementById('form-join-room');
const roomIdInput = document.getElementById('room-id-input');

const chatRoomId = document.getElementById('chat-room-id');
const shareIdVal = document.getElementById('share-id-val');
const btnCopyId = document.getElementById('btn-copy-id');
const btnLeaveRoom = document.getElementById('btn-leave-room');
const chatMessages = document.getElementById('chat-messages');

const btnToggleAutoDecrypt = document.getElementById('btn-toggle-auto-decrypt');
const messageInput = document.getElementById('message-input');
const charUsed = document.getElementById('char-used');
const btnSendPlain = document.getElementById('btn-send-plain');
const btnSendEncrypted = document.getElementById('btn-send-encrypted');

const visualizerContainer = document.getElementById('visualizer-container');
const connectionStatus = document.getElementById('connection-status');
const toastEl = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');

// Mobile Responsive UI Elements
const mobileTabChat = document.getElementById('mobile-tab-chat');
const mobileTabInfo = document.getElementById('mobile-tab-info');
const chatSidePanel = document.querySelector('.chat-side-panel');
const chatMainPanel = document.querySelector('.chat-main-panel');

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
    // Monitor auth state changes
    onAuthStateChanged(auth, (user) => {
        if (user) {
            updateConnectionStatus(true);
        } else {
            updateConnectionStatus(false);
            showScreen('login');
        }
    });

    // Monitor network connection
    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
    updateConnectionStatus(navigator.onLine);

    // Event Listeners
    formLogin.addEventListener('submit', handleLogin);
    btnCreateRoom.addEventListener('click', handleCreateRoom);
    formJoinRoom.addEventListener('submit', handleJoinRoom);
    btnCopyId.addEventListener('click', handleCopyRoomId);
    btnLeaveRoom.addEventListener('click', handleLeaveRoom);
    btnToggleAutoDecrypt.addEventListener('click', handleToggleAutoDecrypt);
    btnSendPlain.addEventListener('click', () => sendMessage(false));
    btnSendEncrypted.addEventListener('click', () => sendMessage(true));

    // Mobile Tab Event Listeners
    if (mobileTabChat && mobileTabInfo) {
        mobileTabChat.addEventListener('click', () => switchMobileTab('chat'));
        mobileTabInfo.addEventListener('click', () => switchMobileTab('info'));
    }

    // Message Input Helper (char count & enter to send)
    messageInput.addEventListener('input', () => {
        charUsed.textContent = messageInput.value.length;
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(true); // Default to encrypt and send on Enter
        }
    });
});

/**
 * Switch Mobile Responsive Tabs
 */
function switchMobileTab(tab) {
    if (!mobileTabChat || !mobileTabInfo) return;
    
    if (tab === 'chat') {
        mobileTabChat.classList.add('active');
        mobileTabInfo.classList.remove('active');
        chatMainPanel.classList.add('mobile-active');
        chatSidePanel.classList.remove('mobile-active');
    } else {
        mobileTabInfo.classList.add('active');
        mobileTabChat.classList.remove('active');
        chatSidePanel.classList.add('mobile-active');
        chatMainPanel.classList.remove('mobile-active');
    }
}

/**
 * Handle Screen Navigation
 */
function showScreen(screen) {
    screenLogin.classList.remove('active');
    screenLobby.classList.remove('active');
    screenChat.classList.remove('active');

    // Add screen-specific class to body for scrollability and styling
    document.body.className = `screen-${screen}`;

    if (screen === 'login') {
        screenLogin.classList.add('active');
    } else if (screen === 'lobby') {
        screenLobby.classList.add('active');
    } else if (screen === 'chat') {
        screenChat.classList.add('active');
    }
}

/**
 * Show temporary toast message
 */
function showToast(message, type = 'info') {
    toastMsg.textContent = message;
    
    // Set colors based on type
    if (type === 'error') {
        toastEl.style.borderColor = 'var(--color-red)';
    } else {
        toastEl.style.borderColor = 'var(--color-green)';
    }
    
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(online) {
    isConnected = online;
    const dot = connectionStatus.querySelector('.status-dot');
    const text = connectionStatus.querySelector('.status-text');

    if (online) {
        dot.classList.remove('offline');
        dot.classList.add('online');
        text.textContent = 'ONLINE';
    } else {
        dot.classList.remove('online');
        dot.classList.add('offline');
        text.textContent = 'OFFLINE';
    }
}

/**
 * Handle User Login
 */
async function handleLogin(e) {
    e.preventDefault();
    const username = usernameInput.value.trim();
    if (!username) return;

    try {
        btnCreateRoom.disabled = true;
        // Sign in anonymously
        await signInAnonymously(auth);
        
        currentUser = username;
        lobbyUsername.textContent = currentUser;
        showScreen('lobby');
        showToast(`Authenticated as ${currentUser}`);
    } catch (err) {
        console.error("Auth error: ", err);
        showToast("Authentication failed", "error");
    } finally {
        btnCreateRoom.disabled = false;
    }
}

/**
 * Handle Room Creation
 */
async function handleCreateRoom() {
    if (!isConnected) {
        showToast("No internet connection", "error");
        return;
    }

    // Generate random 6 digit room ID
    const roomId = String(Math.floor(100000 + Math.random() * 900000));
    
    try {
        const roomDocRef = doc(db, 'rooms', roomId);
        
        // Save room metadata
        await setDoc(roomDocRef, {
            roomId: roomId,
            createdBy: currentUser,
            createdAt: serverTimestamp(),
            matrixKey: [3, 4, 2, 3] // standard key matrix info (flat array)
        });

        joinRoom(roomId);
        showToast(`Created channel #${roomId}`);
    } catch (err) {
        console.error("Error creating room: ", err);
        showToast("Failed to create channel", "error");
    }
}

/**
 * Handle Joining Room
 */
async function handleJoinRoom(e) {
    e.preventDefault();
    if (!isConnected) {
        showToast("No internet connection", "error");
        return;
    }

    const roomId = roomIdInput.value.trim();
    if (roomId.length !== 6 || isNaN(roomId)) {
        showToast("Invalid channel ID format", "error");
        return;
    }

    try {
        const roomDocRef = doc(db, 'rooms', roomId);
        const roomSnap = await getDoc(roomDocRef);

        if (roomSnap.exists()) {
            joinRoom(roomId);
            showToast(`Connected to channel #${roomId}`);
        } else {
            showToast("Channel does not exist", "error");
        }
    } catch (err) {
        console.error("Error joining room: ", err);
        showToast("Failed to search channel", "error");
    }
}

/**
 * Establish live connection to a room and execute ECDH P2P Key Exchange
 */
async function publishPublicKey(roomId) {
    if (!localKeyPair || !auth.currentUser) return;
    try {
        const exported = await window.crypto.subtle.exportKey("raw", localKeyPair.publicKey);
        const hexKey = arrayBufferToHex(exported);
        const pDocRef = doc(db, 'rooms', roomId, 'participants', getParticipantId());
        await setDoc(pDocRef, {
            participantId: getParticipantId(),
            uid: auth.currentUser.uid,
            username: currentUser,
            publicKey: hexKey,
            timestamp: Date.now()
        });
    } catch (err) {
        console.error("Error exporting/publishing ECDH key: ", err);
    }
}

function listenParticipants(roomId) {
    const pRef = collection(db, 'rooms', roomId, 'participants');
    unsubscribeParticipants = onSnapshot(pRef, async (snapshot) => {
        let members = [];
        snapshot.forEach(doc => {
            members.push(doc.data());
        });
        
        // Sort by timestamp descending so we pair with the most recently active participant sessions
        members.sort((a, b) => b.timestamp - a.timestamp);
        const activeMembers = members.slice(0, 2);
        const localId = getParticipantId();
        const hasLocal = activeMembers.some(m => m.participantId === localId);
        
        if (activeMembers.length >= 2 && hasLocal) {
            const peer = activeMembers.find(m => m.participantId !== localId);
            if (peer) {
                await deriveSharedAESKey(peer.publicKey);
                
                // Enable UI button
                btnSendEncrypted.disabled = false;
                btnSendEncrypted.querySelector('span').textContent = 'ENCRYPT & SEND';
                btnSendEncrypted.style.opacity = '1';
                btnSendEncrypted.style.cursor = 'pointer';
                
                // Update badge and status text
                const badge = document.getElementById('chat-room-id');
                if (badge) {
                    badge.className = 'channel-badge status-secure';
                    badge.textContent = `# ${roomId} (SECURE P2P)`;
                }
                
                const statusTextEl = document.querySelector('.meta-value.text-green');
                if (statusTextEl) {
                    statusTextEl.textContent = `SECURE P2P LINK ESTABLISHED`;
                    statusTextEl.style.background = 'var(--color-green)';
                }
            }
        } else {
            // Waiting for peer to join
            btnSendEncrypted.disabled = true;
            btnSendEncrypted.querySelector('span').textContent = 'WAITING FOR PEER...';
            btnSendEncrypted.style.opacity = '0.6';
            btnSendEncrypted.style.cursor = 'not-allowed';
            
            const badge = document.getElementById('chat-room-id');
            if (badge) {
                badge.className = 'channel-badge';
                badge.textContent = `# ${roomId}`;
            }

            const statusTextEl = document.querySelector('.meta-value.text-green');
            if (statusTextEl) {
                statusTextEl.textContent = `WAITING FOR PEER TO JOIN...`;
                statusTextEl.style.background = 'var(--color-orange)';
            }
        }
    });
}

async function deriveSharedAESKey(peerPubKeyHex) {
    try {
        const peerPubKey = await window.crypto.subtle.importKey(
            "raw",
            hexToArrayBuffer(peerPubKeyHex),
            { name: "ECDH", namedCurve: "P-256" },
            true,
            []
        );

        // Derive shared secret
        const sharedSecretBuffer = await window.crypto.subtle.deriveBits(
            { name: "ECDH", public: peerPubKey },
            localKeyPair.privateKey,
            256
        );

        // Hash the derived bits with SHA-256 to create a 256-bit AES-GCM key
        const keyHash = await window.crypto.subtle.digest("SHA-256", sharedSecretBuffer);

        derivedSharedKey = await window.crypto.subtle.importKey(
            "raw",
            keyHash,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
        
        showToast("Secure P2P Key derived successfully!");
    } catch (err) {
        console.error("ECDH key derivation error: ", err);
        showToast("Failed to derive shared key", "error");
    }
}

async function encryptAESGCM(plaintext) {
    if (!derivedSharedKey) throw new Error("No secure P2P key derived.");
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        derivedSharedKey,
        encoder.encode(plaintext)
    );
    
    const ciphertextHex = arrayBufferToHex(ciphertextBuffer);
    const ivHex = arrayBufferToHex(iv);
    
    const steps = [
        { label: 'Input Plaintext', value: plaintext },
        { label: 'ECDH Shared Key Used', value: 'AES-GCM-256 Derived in Memory' },
        { label: 'Generated 12-byte IV', value: ivHex },
        { label: 'AES-GCM Encryption Complete', value: ciphertextHex },
        { label: 'Network Output Payload (IV + Cipher)', value: ivHex + ciphertextHex }
    ];

    return {
        payload: ivHex + ciphertextHex,
        steps: steps
    };
}

async function decryptAESGCM(payload) {
    if (!derivedSharedKey) throw new Error("No secure P2P key derived.");
    const ivHex = payload.substring(0, 24);
    const ciphertextHex = payload.substring(24);
    
    const iv = hexToArrayBuffer(ivHex);
    const ciphertext = hexToArrayBuffer(ciphertextHex);
    
    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        derivedSharedKey,
        ciphertext
    );
    return new TextDecoder().decode(decryptedBuffer);
}

async function joinRoom(roomId) {
    activeRoomId = roomId;
    chatRoomId.textContent = `# ${roomId}`;
    shareIdVal.textContent = roomId;
    roomIdInput.value = '';

    btnSendEncrypted.disabled = true;
    btnSendEncrypted.querySelector('span').textContent = 'WAITING FOR PEER...';
    btnSendEncrypted.style.opacity = '0.6';
    btnSendEncrypted.style.cursor = 'not-allowed';

    await generateECDHKey();
    await publishPublicKey(roomId);
    listenParticipants(roomId);

    visualizerContainer.innerHTML = `
        <div class="empty-visualizer-text">
            Send or receive an encrypted message to trace the algorithm steps in real-time.
        </div>
    `;
    chatMessages.innerHTML = `<div class="system-message">--- CONNECTED TO SECURE STREAM #${roomId} ---</div>`;

    showScreen('chat');
    switchMobileTab('chat');

    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            handleMessageSnapshot(change);
        });
    }, (err) => {
        console.error("Snapshot subscription error: ", err);
        showToast("Lost stream connection", "error");
    });
}

function handleCopyRoomId() {
    navigator.clipboard.writeText(activeRoomId).then(() => {
        showToast("Channel ID copied!");
    }).catch(err => {
        console.error("Copy failed: ", err);
    });
}

function handleToggleAutoDecrypt() {
    autoDecrypt = !autoDecrypt;
    if (autoDecrypt) {
        btnToggleAutoDecrypt.classList.add('btn-active');
        btnToggleAutoDecrypt.querySelector('span').textContent = 'AUTO DECRYPT';
        btnToggleAutoDecrypt.querySelector('i').className = 'fa-solid fa-lock-open';
        document.querySelectorAll('.message.encrypted').forEach(msgEl => {
            const decryptBtn = msgEl.querySelector('.btn-decrypt');
            if (decryptBtn) decryptBtn.click();
        });
    } else {
        btnToggleAutoDecrypt.classList.remove('btn-active');
        btnToggleAutoDecrypt.querySelector('span').textContent = 'MANUAL MODE';
        btnToggleAutoDecrypt.querySelector('i').className = 'fa-solid fa-lock';
    }
}

async function handleLeaveRoom() {
    document.querySelectorAll('.msg-bubble').forEach(bubble => {
        if (bubble.dataset.intervalId) {
            clearInterval(parseInt(bubble.dataset.intervalId));
        }
    });

    // Delete participant registration from database on leave
    if (activeRoomId && auth.currentUser) {
        try {
            const pDocRef = doc(db, 'rooms', activeRoomId, 'participants', getParticipantId());
            await deleteDoc(pDocRef);
        } catch (err) {
            console.error("Error removing participant record on leave: ", err);
        }
    }

    if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
    }
    
    if (unsubscribeParticipants) {
        unsubscribeParticipants();
        unsubscribeParticipants = null;
    }
    
    localKeyPair = null;
    derivedSharedKey = null;
    activeRoomId = null;
    
    showScreen('lobby');
    showToast("Disconnected from channel");
}

// Clean up participant registration on window unload
window.addEventListener('beforeunload', () => {
    if (activeRoomId && auth.currentUser) {
        const pDocRef = doc(db, 'rooms', activeRoomId, 'participants', getParticipantId());
        deleteDoc(pDocRef);
    }
});

async function sendMessage(isEncrypted) {
    const rawText = messageInput.value.trim();
    if (!rawText || !activeRoomId) return;

    let textToSend = rawText;
    let visualizerData = null;

    if (isEncrypted) {
        try {
            const encryptedRes = await encryptAESGCM(rawText);
            textToSend = encryptedRes.payload;
            visualizerData = encryptedRes.steps;
        } catch (err) {
            console.error("Encryption error: ", err);
            showToast("Failed to encrypt message", "error");
            return;
        }
    }

    messageInput.value = '';
    charUsed.textContent = '0';

    try {
        const messagesRef = collection(db, 'rooms', activeRoomId, 'messages');
        await addDoc(messagesRef, {
            sender: currentUser,
            text: textToSend,
            encrypted: isEncrypted,
            timestamp: serverTimestamp()
        });

        if (visualizerData) {
            updateVisualizer('ENCRYPTION STEPS (OUTGOING)', visualizerData);
        }
    } catch (err) {
        console.error("Error sending message: ", err);
        showToast("Failed to transmit data", "error");
    }
}

/**
 * Format timestamp to HH:MM
 */
function formatTime(timestamp) {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate();
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

/**
 * Create Message HTML Element
 */
function createMessageElement(docId, messageData) {
    const { sender, text, encrypted, timestamp, decryptedAt } = messageData;
    const isOutgoing = sender === currentUser;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    if (encrypted) {
        messageDiv.classList.add('encrypted');
    }
    messageDiv.dataset.docid = docId;

    // Header info
    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-meta';
    
    const senderSpan = document.createElement('span');
    senderSpan.className = 'msg-sender';
    senderSpan.textContent = sender;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-time';
    timeSpan.textContent = formatTime(timestamp);

    metaDiv.appendChild(senderSpan);
    metaDiv.appendChild(timeSpan);

    // Bubble
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'msg-bubble';

    if (encrypted) {
        // Create header inside bubble
        const headerDiv = document.createElement('div');
        headerDiv.className = 'bubble-header';
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'bubble-header-title';
        titleSpan.innerHTML = `<i class="fa-solid fa-lock"></i> ENCRYPTED PAYLOAD`;
        
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'bubble-badge status-locked';
        badgeSpan.textContent = 'LOCKED';
        
        headerDiv.appendChild(titleSpan);
        headerDiv.appendChild(badgeSpan);
        bubbleDiv.appendChild(headerDiv);

        const binarySpan = document.createElement('span');
        binarySpan.className = 'encrypted-text';
        binarySpan.textContent = text;
        bubbleDiv.appendChild(binarySpan);

        if (isOutgoing) {
            const transmittedSpan = document.createElement('div');
            transmittedSpan.className = 'transmitted-note';
            
            if (decryptedAt) {
                const elapsed = (Date.now() - decryptedAt) / 1000;
                if (elapsed >= 15) {
                    transmittedSpan.innerHTML = `<i class="fa-solid fa-circle-xmark" style="color: var(--color-orange);"></i> DECRYPTED & PERMANENTLY LOCKED`;
                    badgeSpan.className = 'bubble-badge status-locked';
                    badgeSpan.textContent = 'EXPIRED';
                } else {
                    transmittedSpan.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> BEING DECRYPTED...`;
                    badgeSpan.className = 'bubble-badge status-secure';
                    badgeSpan.textContent = 'DECRYPTING';
                }
            } else {
                transmittedSpan.innerHTML = `<i class="fa-solid fa-circle-check"></i> TRANSMITTED SECURELY`;
            }
            bubbleDiv.appendChild(transmittedSpan);
        } else {
            if (decryptedAt) {
                const elapsed = (Date.now() - decryptedAt) / 1000;
                if (elapsed >= 15) {
                    // Permanently locked
                    badgeSpan.className = 'bubble-badge status-locked';
                    badgeSpan.textContent = 'EXPIRED';
                    
                    const expiredSpan = document.createElement('div');
                    expiredSpan.className = 'expired-note';
                    expiredSpan.innerHTML = `<i class="fa-solid fa-circle-xmark" style="color: var(--color-orange);"></i> PERMANENTLY LOCKED (EXPIRED)`;
                    bubbleDiv.appendChild(expiredSpan);

                    // Delete the expired message document from database
                    try {
                        const messageDocRef = doc(db, 'rooms', activeRoomId, 'messages', docId);
                        deleteDoc(messageDocRef);
                    } catch (err) {
                        console.error("Clean up error: ", err);
                    }
                } else {
                    // Currently decrypted, show plaintext and countdown timer
                    badgeSpan.className = 'bubble-badge status-secure';
                    badgeSpan.textContent = 'SECURE';
                    
                    const decDiv = document.createElement('div');
                    decDiv.className = 'decrypted-text';
                    decDiv.textContent = 'Decrypting...';
                    bubbleDiv.appendChild(decDiv);

                    decryptAESGCM(text).then(decryptedText => {
                        decDiv.textContent = decryptedText;
                    }).catch(err => {
                        console.error("Decryption error: ", err);
                        decDiv.textContent = "[Error: Decryption failed]";
                    });

                    const timerSpan = document.createElement('div');
                    timerSpan.className = 'countdown-timer';
                    const remaining = Math.ceil(15 - elapsed);
                    timerSpan.innerHTML = `<i class="fa-solid fa-clock"></i> Locks in ${remaining}s`;
                    bubbleDiv.appendChild(timerSpan);

                    // Add Manual Lock Button
                    const lockBtn = document.createElement('button');
                    lockBtn.className = 'btn-lock-manual';
                    lockBtn.innerHTML = `<i class="fa-solid fa-lock"></i> LOCK NOW`;
                    lockBtn.onclick = async () => {
                        if (bubbleDiv.dataset.intervalId) {
                            clearInterval(parseInt(bubbleDiv.dataset.intervalId));
                        }
                        try {
                            const messageDocRef = doc(db, 'rooms', activeRoomId, 'messages', docId);
                            await deleteDoc(messageDocRef);
                            showToast("Locked securely!");
                        } catch (err) {
                            console.error("Error manual locking: ", err);
                        }
                    };
                    bubbleDiv.appendChild(lockBtn);

                    // Set interval to update countdown
                    const intervalId = setInterval(async () => {
                        const currentElapsed = (Date.now() - decryptedAt) / 1000;
                        if (currentElapsed >= 15) {
                            clearInterval(intervalId);
                            // Delete from Firestore to trigger P2P removal sync
                            try {
                                const messageDocRef = doc(db, 'rooms', activeRoomId, 'messages', docId);
                                await deleteDoc(messageDocRef);
                            } catch (err) {
                                console.error("Error deleting expired: ", err);
                            }
                        } else {
                            const newRemaining = Math.ceil(15 - currentElapsed);
                            timerSpan.innerHTML = `<i class="fa-solid fa-clock"></i> Locks in ${newRemaining}s`;
                        }
                    }, 500);

                    bubbleDiv.dataset.intervalId = String(intervalId);
                }
            } else {
                // Not yet decrypted
                if (autoDecrypt) {
                    triggerDecryption(docId);
                } else {
                    const decryptBtn = document.createElement('button');
                    decryptBtn.className = 'btn-decrypt';
                    decryptBtn.innerHTML = `<i class="fa-solid fa-key"></i> DECRYPT`;
                    decryptBtn.onclick = () => {
                        triggerDecryption(docId);
                        decryptBtn.remove();
                    };
                    bubbleDiv.appendChild(decryptBtn);
                }
            }
        }
    } else {
        const textNode = document.createTextNode(text);
        bubbleDiv.appendChild(textNode);
    }

    messageDiv.appendChild(metaDiv);
    messageDiv.appendChild(bubbleDiv);
    return messageDiv;
}

/**
 * Handle new or modified message snapshots
 */
function handleMessageSnapshot(change) {
    const docId = change.doc.id;
    const messageData = change.doc.data();
    const isOutgoing = messageData.sender === currentUser;
    
    const existingMsgEl = document.querySelector(`[data-docid="${docId}"]`);
    
    if (change.type === 'added') {
        if (!existingMsgEl) {
            const messageEl = createMessageElement(docId, messageData);
            chatMessages.appendChild(messageEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    } else if (change.type === 'modified') {
        if (existingMsgEl) {
            // Clean up any running intervals on the old bubble
            const oldBubble = existingMsgEl.querySelector('.msg-bubble');
            if (oldBubble && oldBubble.dataset.intervalId) {
                clearInterval(parseInt(oldBubble.dataset.intervalId));
            }
            
            // If it was just decrypted by the incoming side, update the visualizer
            if (!isOutgoing && messageData.decryptedAt) {
                decryptAESGCM(messageData.text).then(decryptedText => {
                    const ivHex = messageData.text.substring(0, 24);
                    const ciphertextHex = messageData.text.substring(24);
                    const steps = [
                        { label: 'Received Ciphertext Payload', value: messageData.text },
                        { label: 'Extracted 12-byte IV', value: ivHex },
                        { label: 'Extracted Ciphertext', value: ciphertextHex },
                        { label: 'AES-GCM Authenticated Decryption', value: 'Authentication Tag Validated' },
                        { label: 'UTF-8 Plaintext Output', value: decryptedText }
                    ];
                    updateVisualizer('DECRYPTION STEPS (INCOMING)', steps);
                }).catch(err => {
                    console.error("Visualizer decryption error: ", err);
                });
            }
            
            const updatedEl = createMessageElement(docId, messageData);
            existingMsgEl.replaceWith(updatedEl);
        }
    } else if (change.type === 'removed') {
        if (existingMsgEl) {
            const oldBubble = existingMsgEl.querySelector('.msg-bubble');
            if (oldBubble && oldBubble.dataset.intervalId) {
                clearInterval(parseInt(oldBubble.dataset.intervalId));
            }
            existingMsgEl.remove();
        }
    }
}

/**
 * Update message decryptedAt in Firestore
 */
async function triggerDecryption(docId) {
    if (!activeRoomId) return;
    try {
        const messageDocRef = doc(db, 'rooms', activeRoomId, 'messages', docId);
        await updateDoc(messageDocRef, {
            decryptedAt: Date.now()
        });
    } catch (err) {
        console.error("Error triggering decryption: ", err);
    }
}

/**
 * Update the side panel visualizer
 */
function updateVisualizer(title, steps) {
    visualizerContainer.innerHTML = `
        <h4 style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--color-green); margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">
            ${title}
        </h4>
    `;

    steps.forEach((step, index) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'visualizer-step';
        stepDiv.innerHTML = `
            <span class="step-label">STEP ${index + 1}: ${step.label}</span>
            <span class="step-value">${step.value}</span>
        `;
        visualizerContainer.appendChild(stepDiv);
    });
}

// Helpers for rebuilding decryption visualizer steps
function decodeBinaryToMorse(binaryString) {
    const REVERSE_BINARY_MAP = { '00': '.', '01': '-', '10': ' ', '11': '/' };
    let morse = '';
    for (let i = 0; i < binaryString.length; i += 2) {
        morse += REVERSE_BINARY_MAP[binaryString.substring(i, i + 2)] || '';
    }
    return morse;
}

function decodeMorseToChars(morseString) {
    const CHAR_TO_MORSE = {
        ' ': '/', 'a': '.-', 'b': '-...', 'c': '-.-.', 'd': '-..', 'e': '.',
        'f': '..-.', 'g': '--.', 'h': '....', 'i': '..', 'j': '.---',
        'k': '-.-', 'l': '.-..', 'm': '--', 'n': '-.', 'o': '---',
        'p': '.--.', 'q': '--.-', 'r': '.-.', 's': '...', 't': '-',
        'u': '..-', 'v': '...-', 'w': '.--', 'x': '-..-', 'y': '-.--', 'z': '--..'
    };
    const MORSE_TO_CHAR = Object.fromEntries(Object.entries(CHAR_TO_MORSE).map(([char, morse]) => [morse, char]));
    return morseString.split(' ').map(symbol => MORSE_TO_CHAR[symbol] || '').join('');
}

function getDecryptedNumbers(binaryString) {
    const alphabet = ' abcdefghijklmnopqrstuvwxyz';
    const cipherChars = decodeMorseToChars(decodeBinaryToMorse(binaryString)).split('');
    const encryptedNumbers = cipherChars.map(c => alphabet.indexOf(c));
    const DEFAULT_KEY_INV = [[3, 23], [25, 3]];
    
    const decryptedNumbers = [];
    for (let i = 0; i < encryptedNumbers.length; i += 2) {
        const block = [encryptedNumbers[i], encryptedNumbers[i + 1] || 0];
        const y0 = DEFAULT_KEY_INV[0][0] * block[0] + DEFAULT_KEY_INV[0][1] * block[1];
        const y1 = DEFAULT_KEY_INV[1][0] * block[0] + DEFAULT_KEY_INV[1][1] * block[1];
        decryptedNumbers.push(
            ((y0 % 27) + 27) % 27,
            ((y1 % 27) + 27) % 27
        );
    }
    return decryptedNumbers;
}
