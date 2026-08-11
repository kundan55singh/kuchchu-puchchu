const socket = io();

let myName = "";
let myRoom = "";

let peerConnection = null;
let localStream = null;
let currentCallType = null;
let pendingOffer = null;
let isMuted = false;
let isCameraOff = false;

const loginBox = document.getElementById("loginBox");
const chatBox = document.getElementById("chatBox");

const nameInput = document.getElementById("name");
const roomInput = document.getElementById("room");

const roomName = document.getElementById("roomName");
const status = document.getElementById("status");
const userCount = document.getElementById("userCount");

const messages = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("message");

const callBox = document.getElementById("callBox");
const callTitle = document.getElementById("callTitle");
const callStatus = document.getElementById("callStatus");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");


/* =========================
   JOIN
========================= */

function joinRoom() {

    myName = nameInput.value.trim();
    myRoom = roomInput.value.trim();

    if (!myName) {
        alert("Please enter your name.");
        return;
    }

    if (!myRoom) {
        alert("Please enter a Room ID.");
        return;
    }

    socket.emit("join-room", {
        roomId: myRoom,
        name: myName
    });
}


socket.on("joined", (data) => {

    loginBox.style.display = "none";
    chatBox.style.display = "flex";

    roomName.textContent = "?? Room: " + data.roomId;

    messageInput.focus();

});


socket.on("room-full", () => {

    alert("This room already has 2 people.");

});


socket.on("user-count", (count) => {

    userCount.textContent = count + "/2";

    status.textContent =
        count === 2
            ? "Connected"
            : "Waiting for other person...";

});


socket.on("user-joined", (data) => {

    addSystemMessage(data.name + " joined the chat.");

});


socket.on("user-left", (data) => {

    addSystemMessage(data.name + " left the chat.");

    closeCall();

});


/* =========================
   CHAT
========================= */

messageForm.addEventListener("submit", (event) => {

    event.preventDefault();

    const message = messageInput.value.trim();

    if (!message) return;

    socket.emit("send-message", message);

    messageInput.value = "";

    messageInput.focus();

});


socket.on("receive-message", (data) => {

    addMessage(
        data.name,
        data.message,
        data.time,
        data.name === myName
    );

});


function addMessage(name, message, time, isMe) {

    const messageDiv = document.createElement("div");

    messageDiv.className = "message";

    if (isMe) {
        messageDiv.classList.add("me");
    }

    const nameDiv = document.createElement("div");

    nameDiv.className = "message-name";
    nameDiv.textContent = name;

    const textDiv = document.createElement("div");

    textDiv.className = "message-text";
    textDiv.textContent = message;

    const timeDiv = document.createElement("div");

    timeDiv.className = "message-time";
    timeDiv.textContent = time;

    messageDiv.appendChild(nameDiv);
    messageDiv.appendChild(textDiv);
    messageDiv.appendChild(timeDiv);

    messages.appendChild(messageDiv);

    messages.scrollTop = messages.scrollHeight;
}


function addSystemMessage(text) {

    const div = document.createElement("div");

    div.style.textAlign = "center";
    div.style.color = "#777";
    div.style.fontSize = "12px";
    div.style.margin = "8px";

    div.textContent = text;

    messages.appendChild(div);
}


/* =========================
   WEBRTC
========================= */

const rtcConfig = {

    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun1.l.google.com:19302"
        }
    ]

};


function createPeerConnection() {

    peerConnection =
        new RTCPeerConnection(rtcConfig);


    peerConnection.onicecandidate = (event) => {

        if (event.candidate) {

            socket.emit("ice-candidate", {
                candidate: event.candidate
            });

        }

    };


    peerConnection.ontrack = (event) => {

        if (event.streams && event.streams[0]) {

            remoteVideo.srcObject =
                event.streams[0];

        }

    };


    peerConnection.onconnectionstatechange = () => {

        if (!peerConnection) return;

        const state =
            peerConnection.connectionState;

        if (state === "connected") {

            callStatus.textContent =
                "Connected";

        }

        if (
            state === "failed" ||
            state === "disconnected" ||
            state === "closed"
        ) {

            closeCall();

        }

    };


    if (localStream) {

        localStream
            .getTracks()
            .forEach((track) => {

                peerConnection.addTrack(
                    track,
                    localStream
                );

            });

    }

}


/* =========================
   GET MEDIA
========================= */

async function getMedia(type) {

    if (type === "video") {

        return navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true
        });

    }

    return navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
    });

}


/* =========================
   CALLER
========================= */

async function startVoiceCall() {

    await startCall("voice");

}


async function startVideoCall() {

    await startCall("video");

}


async function startCall(type) {

    if (userCount.textContent !== "2/2") {

        alert(
            "Dusra person abhi room mein connected nahi hai."
        );

        return;

    }


    if (peerConnection) {

        return;

    }


    currentCallType = type;


    try {

        localStream =
            await getMedia(type);


        showCallScreen(
            type,
            "Calling..."
        );


        createPeerConnection();


        /*
           First tell receiver that
           a call is coming.
        */

        socket.emit("call-user", {
            type: type
        });


    } catch (error) {

        console.error(error);

        alert(
            "Camera/Microphone permission allow karein."
        );

        closeCall();

    }

}


/* =========================
   RECEIVER
========================= */

socket.on("incoming-call", (data) => {

    if (peerConnection || callBox.style.display === "flex") {

        return;

    }


    showIncomingCall(data);

});


function showIncomingCall(data) {

    callBox.style.display = "flex";

    callTitle.textContent =
        data.type === "video"
            ? "Incoming Video Call"
            : "Incoming Voice Call";

    callStatus.innerHTML = `
        <div style="
            margin-top:18px;
            color:#f8fafc;
            font-size:16px;
        ">
            ${escapeHtml(data.callerName)} is calling...
        </div>

        <div style="
            display:flex;
            justify-content:center;
            gap:12px;
            margin-top:25px;
        ">

            <button
                onclick="acceptCall('${data.type}')"
                style="
                    background:#16a34a;
                    padding:13px 25px;
                    border-radius:12px;
                "
            >
                Accept
            </button>

            <button
                onclick="declineCall()"
                style="
                    background:#dc2626;
                    padding:13px 25px;
                    border-radius:12px;
                "
            >
                Decline
            </button>

        </div>
    `;

    pendingOffer = null;

    currentCallType = data.type;

}


/* =========================
   ACCEPT
========================= */

async function acceptCall(type) {

    try {

        localStream =
            await getMedia(type);


        showCallScreen(
            type,
            "Connecting..."
        );


        createPeerConnection();


        /*
           Tell caller that receiver
           accepted the call.
        */

        socket.emit("call-accepted");

    } catch (error) {

        console.error(error);

        alert(
            "Camera/Microphone permission allow karein."
        );

        declineCall();

    }

}


/* =========================
   CALL ACCEPTED
========================= */

socket.on("call-accepted", async () => {

    if (!peerConnection) return;

    try {

        const offer =
            await peerConnection.createOffer();

        await peerConnection.setLocalDescription(
            offer
        );

        socket.emit("webrtc-offer", {
            offer
        });

        callStatus.textContent =
            "Connecting...";

    } catch (error) {

        console.error(
            "Offer error:",
            error
        );

    }

});


/* =========================
   OFFER
========================= */

socket.on("webrtc-offer", async (data) => {

    if (!peerConnection) return;

    try {

        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
                data.offer
            )
        );


        const answer =
            await peerConnection.createAnswer();


        await peerConnection.setLocalDescription(
            answer
        );


        socket.emit("webrtc-answer", {
            answer
        });


    } catch (error) {

        console.error(
            "Offer handling error:",
            error
        );

    }

});


/* =========================
   ANSWER
========================= */

socket.on("webrtc-answer", async (data) => {

    if (!peerConnection) return;

    try {

        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
                data.answer
            )
        );

    } catch (error) {

        console.error(
            "Answer handling error:",
            error
        );

    }

});


/* =========================
   ICE
========================= */

socket.on("ice-candidate", async (data) => {

    if (!peerConnection) return;

    try {

        await peerConnection.addIceCandidate(
            new RTCIceCandidate(
                data.candidate
            )
        );

    } catch (error) {

        console.error(
            "ICE error:",
            error
        );

    }

});


/* =========================
   DECLINE
========================= */

function declineCall() {

    socket.emit("call-declined");

    closeCall();

}


socket.on("call-declined", () => {

    callStatus.textContent =
        "Call declined";

    setTimeout(() => {

        closeCall();

    }, 1200);

});


/* =========================
   END CALL
========================= */

function endCall() {

    socket.emit("end-call");

    closeCall();

}


socket.on("call-ended", () => {

    closeCall();

});


/* =========================
   CALL UI
========================= */

function showCallScreen(type, text) {

    callBox.style.display = "flex";

    callTitle.textContent =
        type === "video"
            ? "?? Video Call"
            : "?? Voice Call";

    callStatus.textContent = text;


    localVideo.srcObject =
        localStream;


    if (type === "video") {

        localVideo.style.display = "block";

    } else {

        localVideo.style.display = "none";

    }

}


/* =========================
   MUTE
========================= */

function toggleMute() {

    if (!localStream) return;

    const audioTrack =
        localStream.getAudioTracks()[0];

    if (!audioTrack) return;

    audioTrack.enabled =
        !audioTrack.enabled;

    isMuted =
        !audioTrack.enabled;

    muteBtn.textContent =
        isMuted
            ? "??"
            : "??";

}


/* =========================
   CAMERA
========================= */

function toggleCamera() {

    if (!localStream) return;

    const videoTrack =
        localStream.getVideoTracks()[0];

    if (!videoTrack) return;

    videoTrack.enabled =
        !videoTrack.enabled;

    isCameraOff =
        !videoTrack.enabled;

    cameraBtn.textContent =
        isCameraOff
            ? "??"
            : "??";

}


/* =========================
   CLOSE
========================= */

function closeCall() {

    if (localStream) {

        localStream
            .getTracks()
            .forEach((track) => {

                track.stop();

            });

    }


    if (peerConnection) {

        peerConnection.close();

    }


    localStream = null;
    peerConnection = null;
    pendingOffer = null;

    remoteVideo.srcObject = null;
    localVideo.srcObject = null;

    callBox.style.display = "none";

    callStatus.textContent =
        "Connecting...";

    isMuted = false;
    isCameraOff = false;

}


/* =========================
   SECURITY
========================= */

function escapeHtml(text) {

    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}
function generateRoomId() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let id = "";

    for (let i = 0; i < 8; i++) {

        id += chars.charAt(
            Math.floor(
                Math.random() * chars.length
            )
        );

    }

    return id;
}


function createRoom() {

    const name =
        document.getElementById("name")
            .value
            .trim();

    if (!name) {

        alert("Please enter your name.");

        return;

    }


    const roomId =
        generateRoomId();


    document.getElementById("room").value =
        roomId;


    document.getElementById("newRoomId")
        .textContent = roomId;


    document.getElementById("generatedRoom")
        .style.display = "block";


    /*
       Automatically join the newly
       created private room.
    */

    myName = name;

    myRoom = roomId;


    socket.emit("join-room", {

        roomId: roomId,

        name: name

    });

}


async function copyRoomId() {

    const roomId =
        document.getElementById("newRoomId")
            .textContent;

    if (!roomId) return;


    try {

        await navigator.clipboard.writeText(
            roomId
        );

        const button =
            document.querySelector(".copy-btn");

        button.textContent = "Copied ?";


        setTimeout(() => {

            button.textContent = "Copy ID";

        }, 1500);


    } catch (error) {

        alert(
            "Room ID: " + roomId
        );

    }

}
const iconPhone = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.12 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8.02 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z"/>
</svg>`;

const iconVideo = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<rect x="2" y="5" width="14" height="14" rx="2"/>
<path d="m16 10 6-3v10l-6-3"/>
</svg>`;

const iconMic = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<rect x="9" y="2" width="6" height="13" rx="3"/>
<path d="M5 10a7 7 0 0 0 14 0"/>
<path d="M12 19v3"/>
<path d="M8 22h8"/>
</svg>`;

const iconMicOff = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<path d="M2 2l20 20"/>
<rect x="9" y="2" width="6" height="13" rx="3"/>
<path d="M5 10a7 7 0 0 0 11 5.6"/>
<path d="M12 19v3"/>
<path d="M8 22h8"/>
</svg>`;

const iconCamera = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<path d="M15 10l6-3v10l-6-3"/>
<rect x="2" y="5" width="13" height="14" rx="2"/>
</svg>`;

const iconCameraOff = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<path d="M2 2l20 20"/>
<path d="M15 10l6-3v10l-6-3"/>
<rect x="2" y="5" width="13" height="14" rx="2"/>
</svg>`;

const iconEnd = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
<path d="M4 14.5c4.5-3 11.5-3 16 0"/>
<path d="M7 14.5l-1 3"/>
<path d="M17 14.5l1 3"/>
</svg>`;


/* Header call buttons */

const callButtons =
    document.querySelectorAll(".call-btn");

if (callButtons.length >= 2) {

    callButtons[0].innerHTML = iconPhone;
    callButtons[0].title = "Voice Call";

    callButtons[1].innerHTML = iconVideo;
    callButtons[1].title = "Video Call";

}


/* Call controls */

const muteButton =
    document.getElementById("muteBtn");

const cameraButton =
    document.getElementById("cameraBtn");

const endButton =
    document.querySelector(".end-call");


if (muteButton) {

    muteButton.innerHTML = iconMic;
    muteButton.title = "Mute microphone";

}


if (cameraButton) {

    cameraButton.innerHTML = iconCamera;
    cameraButton.title = "Turn camera off";

}


if (endButton) {

    endButton.innerHTML = iconEnd;
    endButton.title = "End call";

}


/* Replace emoji after mute */

const originalToggleMute =
    window.toggleMute;

window.toggleMute = function () {

    originalToggleMute();

    if (!localStream) return;

    const track =
        localStream.getAudioTracks()[0];

    if (!track) return;

    muteButton.innerHTML =
        track.enabled ? iconMic : iconMicOff;

    muteButton.title =
        track.enabled
            ? "Mute microphone"
            : "Unmute microphone";

};


/* Replace emoji after camera toggle */

const originalToggleCamera =
    window.toggleCamera;

window.toggleCamera = function () {

    originalToggleCamera();

    if (!localStream) return;

    const track =
        localStream.getVideoTracks()[0];

    if (!track) return;

    cameraButton.innerHTML =
        track.enabled
            ? iconCamera
            : iconCameraOff;

    cameraButton.title =
        track.enabled
            ? "Turn camera off"
            : "Turn camera on";

};

async function showAudioOutputs() {

    if (!navigator.mediaDevices) {
        alert("Audio device selection is not supported.");
        return;
    }

    if (!navigator.mediaDevices.enumerateDevices) {
        alert("Your browser does not support audio device selection.");
        return;
    }

    const devices =
        await navigator.mediaDevices.enumerateDevices();

    const outputs =
        devices.filter(
            device => device.kind === "audiooutput"
        );

    if (!outputs.length) {
        alert(
            "No audio output devices found."
        );
        return;
    }

    const names = outputs.map(
        (device, index) =>
            `${index + 1}. ${
                device.label ||
                "Audio Output " + (index + 1)
            }`
    ).join("\n");

    const choice = prompt(
        "Select Speaker / Audio Output:\n\n" +
        names +
        "\n\nEnter number:"
    );

    if (!choice) return;

    const index =
        parseInt(choice, 10) - 1;

    if (
        Number.isNaN(index) ||
        !outputs[index]
    ) {
        alert("Invalid selection.");
        return;
    }

    const device =
        outputs[index];

    const videos = [
        document.getElementById("remoteVideo"),
        document.getElementById("localVideo")
    ];

    for (const video of videos) {

        if (
            video &&
            typeof video.setSinkId === "function"
        ) {

            try {

                await video.setSinkId(
                    device.deviceId
                );

            } catch (error) {

                console.error(
                    "Audio output error:",
                    error
                );

            }

        }

    }

    alert(
        "Audio output changed to:\n" +
        (device.label || "Selected device")
    );
}

/* =========================
   IMAGE SENDING
========================= */

const imageInput = document.getElementById("imageInput");

if (imageInput) {

    imageInput.addEventListener("change", () => {

        const file = imageInput.files[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Please select an image.");
            imageInput.value = "";
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert("Image must be smaller than 5 MB.");
            imageInput.value = "";
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {

            socket.emit("send-image", {
                image: reader.result,
                name: file.name
            });

        };

        reader.readAsDataURL(file);

        imageInput.value = "";

    });

}


/* =========================
   RECEIVE IMAGE
========================= */

socket.on("receive-image", (data) => {

    const messages =
        document.getElementById("messages");

    if (!messages) return;

    const wrapper =
        document.createElement("div");

    wrapper.className = "message";

    const name =
        document.createElement("strong");

    name.textContent =
        data.name || "User";

    const image =
        document.createElement("img");

    image.src = data.image;

    image.alt = "Shared image";

    image.style.maxWidth = "280px";
    image.style.maxHeight = "280px";
    image.style.display = "block";
    image.style.marginTop = "6px";
    image.style.borderRadius = "10px";
    image.style.cursor = "pointer";

    image.onclick = () => {
        window.open(data.image, "_blank");
    };

    wrapper.appendChild(name);
    wrapper.appendChild(image);

    messages.appendChild(wrapper);

    messages.scrollTop =
        messages.scrollHeight;

});

