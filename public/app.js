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
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require"
};


function createPeerConnection() {

    peerConnection =
        new RTCPeerConnection(rtcConfig);

    /*
       LOW NETWORK OPTIMIZATION
       Audio gets priority over video.
    */

    peerConnection.onnegotiationneeded = () => {
        console.log("WebRTC negotiation needed");
    };


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

        console.log(
            "WebRTC connection state:",
            state
        );

        if (state === "connected") {

            callStatus.textContent =
                "Connected";

        }

        /*
           Do NOT immediately close the call
           on temporary network fluctuation.
        */

        if (state === "disconnected") {

            callStatus.textContent =
                "Network unstable... reconnecting";

            setTimeout(() => {

                if (
                    peerConnection &&
                    peerConnection.connectionState ===
                    "disconnected"
                ) {

                    try {

                        peerConnection.restartIce();

                        console.log(
                            "ICE restart requested"
                        );

                    } catch (error) {

                        console.error(
                            "ICE restart error:",
                            error
                        );

                    }

                }

            }, 2500);

        }

        if (state === "failed") {

            callStatus.textContent =
                "Trying to reconnect...";

            try {

                peerConnection.restartIce();

            } catch (error) {

                console.error(
                    "ICE restart failed:",
                    error
                );

            }

        }

        if (state === "closed") {

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

    const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
    };

    if (type === "video") {

        return navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: {
                width: { ideal: 640, max: 640 },
                height: { ideal: 360, max: 360 },
                frameRate: { ideal: 20, max: 24 }
            }
        });

    }

    return navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false
    });

}

/* =========================
   IMAGE SENDING
========================= */

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

    image.style.width = "auto";
image.style.height = "auto";
image.style.maxWidth = "300px";
image.style.maxHeight = "400px";
image.style.objectFit = "contain";
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


/* =========================
   CLOUDINARY IMAGE UPLOAD
========================= */

var imageInput =
    document.getElementById("imageInput");

if (imageInput) {

    imageInput.addEventListener(
        "change",
        async function () {

            const file =
                imageInput.files &&
                imageInput.files[0];

            if (!file) return;

            console.log(
                "Selected image:",
                file.name,
                file.size,
                file.type
            );

            if (!file.type.startsWith("image/")) {

                alert("Please select an image.");

                imageInput.value = "";

                return;
            }

            if (file.size > 20 * 1024 * 1024) {

                alert(
                    "Image must be smaller than 20 MB."
                );

                imageInput.value = "";

                return;
            }

            try {

                const formData =
                    new FormData();

                formData.append(
                    "image",
                    file
                );

                console.log(
                    "Uploading image..."
                );

                const response =
                    await fetch(
                        "/upload-image",
                        {
                            method: "POST",
                            body: formData
                        }
                    );

                const result =
                    await response.json();

                console.log(
                    "Upload response:",
                    result
                );

                if (
                    !response.ok ||
                    !result.success ||
                    !result.url
                ) {

                    throw new Error(
                        result.error ||
                        "Image upload failed."
                    );
                }

                console.log(
                    "Cloudinary URL:",
                    result.url
                );

                socket.emit(
                    "send-image-url",
                    {
                        url: result.url,
                        name:
                            result.fileName ||
                            file.name
                    }
                );

                console.log(
                    "Image sent to room."
                );

            } catch (error) {

                console.error(
                    "IMAGE UPLOAD ERROR:",
                    error
                );

                alert(
                    "Image upload failed: " +
                    error.message
                );

            } finally {

                imageInput.value = "";

            }

        }
    );
}


/* =========================
   RECEIVE CLOUDINARY IMAGE
========================= */

socket.on(
    "receive-image-url",
    function (data) {

        const messages =
            document.getElementById("messages");

        if (!messages) return;

        if (!data || !data.url) return;

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "message";

        const name =
            document.createElement("strong");

        name.textContent =
            data.name || "User";

        const image =
            document.createElement("img");

        image.src =
            data.url;

        image.alt =
            data.fileName ||
            "Shared image";

        image.loading =
            "lazy";

        image.style.width = "auto";
image.style.height = "auto";
image.style.maxWidth = "300px";
image.style.maxHeight = "400px";
image.style.objectFit = "contain";

        image.style.display =
            "block";

        image.style.marginTop =
            "6px";

        image.style.borderRadius =
            "10px";

        image.style.cursor =
            "pointer";

        image.onclick =
            function () {

                window.open(
                    data.url,
                    "_blank"
                );

            };

        const downloadButton =
            document.createElement(
                "button"
            );

        downloadButton.type =
            "button";

        downloadButton.textContent =
            "Download";

        downloadButton.style.marginTop =
            "8px";

        downloadButton.style.padding =
            "7px 12px";

        downloadButton.style.border =
            "none";

        downloadButton.style.borderRadius =
            "8px";

        downloadButton.style.cursor =
            "pointer";

        downloadButton.addEventListener(
            "click",
            async function () {

                try {

                    const response =
                        await fetch(
                            data.url
                        );

                    if (!response.ok) {
                        throw new Error(
                            "Download failed"
                        );
                    }

                    const blob =
                        await response.blob();

                    const blobUrl =
                        URL.createObjectURL(
                            blob
                        );

                    const link =
                        document.createElement(
                            "a"
                        );

                    link.href =
                        blobUrl;

                    link.download =
                        data.fileName ||
                        "image";

                    document.body.appendChild(
                        link
                    );

                    link.click();

                    link.remove();

                    setTimeout(
                        function () {

                            URL.revokeObjectURL(
                                blobUrl
                            );

                        },
                        1000
                    );

                } catch (error) {

                    console.error(
                        "Download error:",
                        error
                    );

                    window.open(
                        data.url,
                        "_blank"
                    );
                }

            }
        );

        wrapper.appendChild(
            name
        );

        wrapper.appendChild(
            image
        );

        wrapper.appendChild(
            downloadButton
        );

        messages.appendChild(
            wrapper
        );

        messages.scrollTop =
            messages.scrollHeight;

    }
);










