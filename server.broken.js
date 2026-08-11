const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");

require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// =========================
// CLOUDINARY
// =========================

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// =========================
// MULTER
// =========================

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 20 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

        if (!file.mimetype.startsWith("image/")) {

            return cb(
                new Error("Only image files are allowed.")
            );

        }

        cb(null, true);
    }
});

// =========================
// STATIC FILES
// =========================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// =========================
// IMAGE UPLOAD
// =========================

app.post(
    "/upload-image",
    upload.single("image"),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    error: "No image uploaded."
                });

            }

            const result =
                await new Promise((resolve, reject) => {

                    const stream =
                        cloudinary.uploader.upload_stream(
                            {
                                folder: "private-chat",
                                resource_type: "image"
                            },

                            (error, result) => {

                                if (error) {
                                    reject(error);
                                } else {
                                    resolve(result);
                                }

                            }
                        );

                    stream.end(req.file.buffer);

                });

            res.json({
                success: true,
                url: result.secure_url,
                publicId: result.public_id
            });

        } catch (error) {

            console.error(
                "Image upload error:",
                error
            );

            res.status(500).json({
                error: "Image upload failed."
            });

        }

    }
);

// =========================
// ROOM HISTORY
// =========================

const roomHistory = new Map();

// =========================
// SOCKET.IO
// =========================

io.on("connection", (socket) => {

    console.log(
        "User connected:",
        socket.id
    );

    // =========================
    // JOIN ROOM
    // =========================

    socket.on(
        "join-room",
        ({ roomId, name }) => {

            roomId =
                String(roomId || "").trim();

            name =
                String(name || "").trim();

            if (!roomId || !name) {
                return;
            }

            const room =
                io.sockets.adapter.rooms.get(
                    roomId
                );

            if (
                room &&
                room.size >= 2
            ) {

                socket.emit(
                    "room-full"
                );

                return;
            }

            socket.join(roomId);

            socket.roomId =
                roomId;

            socket.userName =
                name;

            if (
                !roomHistory.has(roomId)
            ) {

                roomHistory.set(
                    roomId,
                    []
                );

            }

            socket.emit(
                "joined",
                {
                    roomId,
                    name
                }
            );

            // Previous messages/images

            roomHistory
                .get(roomId)
                .forEach((message) => {

                    if (
                        message.type ===
                        "image"
                    ) {

                        socket.emit(
                            "receive-image-url",
                            message
                        );

                    } else {

                        socket.emit(
                            "receive-message",
                            message
                        );

                    }

                });

            socket.to(roomId).emit(
                "user-joined",
                {
                    name
                }
            );

            updateUserCount(
                roomId
            );

        }
    );

    // =========================
    // TEXT MESSAGE
    // =========================

    socket.on(
        "send-message",
        (message) => {

            if (!socket.roomId) {
                return;
            }

            const cleanMessage =
                String(
                    message || ""
                ).trim();

            if (!cleanMessage) {
                return;
            }

            const data = {

                name:
                    socket.userName,

                message:
                    cleanMessage,

                time:
                    new Date()
                        .toLocaleTimeString(
                            [],
                            {
                                hour: "2-digit",
                                minute: "2-digit"
                            }
                        )

            };

            if (
                !roomHistory.has(
                    socket.roomId
                )
            ) {

                roomHistory.set(
                    socket.roomId,
                    []
                );

            }

            const history =
                roomHistory.get(
                    socket.roomId
                );

            history.push(data);

            if (
                history.length > 200
            ) {

                history.shift();

            }

            io.to(
                socket.roomId
            ).emit(
                "receive-message",
                data
            );

        }
    );

    // =========================
    // CLOUDINARY IMAGE
    // =========================

    socket.on(
        "send-image-url",
        ({ url, name }) => {

            if (!socket.roomId) {
                return;
            }

            if (
                !url ||
                !String(url).startsWith(
                    "http"
                )
            ) {

                return;
            }

            const data = {

                name:
                    socket.userName,

                url:
                    String(url),

                fileName:
                    String(
                        name || "image"
                    ),

                type:
                    "image",

                time:
                    new Date()
                        .toLocaleTimeString(
                            [],
                            {
                                hour: "2-digit",
                                minute: "2-digit"
                            }
                        )

            };

            if (
                !roomHistory.has(
                    socket.roomId
                )
            ) {

                roomHistory.set(
                    socket.roomId,
                    []
                );

            }

            const history =
                roomHistory.get(
                    socket.roomId
                );

            history.push(data);

            if (
                history.length > 200
            ) {

                history.shift();

            }

            io.to(
                socket.roomId
            ).emit(
                "receive-image-url",
                data
            );

        }
    );

    // =========================
    // START CALL
    // =========================

    socket.on(
        "call-user",
        ({ type }) => {

            if (!socket.roomId) {
                return;
            }

            console.log(
                socket.userName,
                "started",
                type,
                "call"
            );

            socket
                .to(socket.roomId)
                .emit(
                    "incoming-call",
                    {
                        callerId:
                            socket.id,

                        callerName:
                            socket.userName,

                        type:
                            type
                    }
                );

        }
    );

    // =========================
    // CALL ACCEPTED
    // =========================

    socket.on(
        "call-accepted",
        () => {

            if (!socket.roomId) {
                return;
            }

            socket
                .to(socket.roomId)
                .emit(
                    "call-accepted"
                );

        }
    );

    // =========================
    // CALL DECLINED
    // =========================

    socket.on(
        "call-declined",
        () => {

            if (!socket.roomId) {
                return;
            }

            socket
                .to(socket.roomId)
                .emit(
                    "call-declined"
                );

        }
    );

    // =========================
    // WEBRTC OFFER
    // =========================

    socket.on(
        "webrtc-offer",
        ({ offer }) => {

            if (!socket.roomId) {
                return;
            }

            socket
                .to(socket.roomId)
                .emit(
                    "webrtc-offer",
                    {
                        offer,
                        from:
                            socket.id
                    }
                );

        }
    );

    // =========================
    // WEBRTC ANSWER
    // =========================

    socket.on(
        "webrtc-answer",
        ({ answer }) => {

            if (!socket.roomId) {
                return;
            }

            socket
                .to(socket.roomId)
                .emit(
                    "webrtc-answer",
                    {
                        answer,
                        from:
                            socket.id
                    }
                );

        }
    );

    // =========================
    // ICE CANDIDATE
    // =========================

    socket.on(
        "ice-candidate",
        ({ candidate }) => {

            if (!socket.roomId) {
                return;
            }

            socket
                .to(socket.roomId)
                .emit(
                    "ice-candidate",
                    {
                        candidate,
                        from:
                            socket.id
                    }
                );

        }
    );

    // =========================
    // END CALL
    // =========================

    socket.on(
        "end-call",
        () => {

            if (!socket.roomId) {
                return;
            }

            socket
                .to(socket.roomId)
                .emit(
                    "call-ended"
                );

        }
    );

    // =========================
    // DISCONNECT
    // =========================

    socket.on(
        "disconnect",
        () => {

            console.log(
                "User disconnected:",
                socket.id
            );

            if (!socket.roomId) {
                return;
            }

            socket
                .to(socket.roomId)
                .emit(
                    "user-left",
                    {
                        name:
                            socket.userName
                    }
                );

            socket
                .to(socket.roomId)
                .emit(
                    "call-ended"
                );

            updateUserCount(
                socket.roomId
            );

        }
    );

});

// =========================
// USER COUNT
// =========================

function updateUserCount(roomId) {

    const room =
        io.sockets.adapter.rooms.get(
            roomId
        );

    const count =
        room ? room.size : 0;

    io.to(roomId).emit(
        "user-count",
        count
    );

}

// =========================
// SERVER
// =========================

const PORT =
    process.env.PORT || 3000;

server.listen(
    PORT,
    () => {

        console.log(
            `Chat server running at http://localhost:${PORT}`
        );

    }
);
