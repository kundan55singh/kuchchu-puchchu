```js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const dotenv = require("dotenv");
const multer = require("multer");
const ImageKit = require("@imagekit/nodejs");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// =========================
// IMAGEKIT
// =========================

const imagekit = new ImageKit({
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY
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

        if (
            !file.mimetype ||
            !file.mimetype.startsWith("image/")
        ) {
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
// IMAGE UPLOAD - IMAGEKIT
// =========================

app.post(
    "/upload-image",
    upload.single("image"),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error: "No image uploaded."
                });

            }

            if (!process.env.IMAGEKIT_PRIVATE_KEY) {

                console.error(
                    "IMAGEKIT_PRIVATE_KEY is missing."
                );

                return res.status(500).json({
                    success: false,
                    error: "ImageKit is not configured."
                });

            }

            /*
             * Multer gives us the image as a Buffer.
             *
             * ImageKit accepts binary data/base64.
             */

            const result =
                await imagekit.files.upload({

                    file: req.file.buffer,

                    fileName:
                        req.file.originalname,

                    folder: "/private-chat",

                    useUniqueFileName: true,

                    tags: [
                        "private-chat"
                    ]
                });

            console.log(
                "Image uploaded to ImageKit:",
                result.url
            );

            return res.json({

                success: true,

                url: result.url,

                fileId:
                    result.fileId || null,

                fileName:
                    req.file.originalname

            });

        } catch (error) {

            console.error(
                "ImageKit upload error:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Image upload failed."

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

            if (room && room.size >= 2) {

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

            if (!roomHistory.has(roomId)) {

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

            // =========================
            // SEND HISTORY
            // =========================

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

                type:
                    "text",

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

            if (history.length > 200) {

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
    // IMAGE MESSAGE
    // =========================

    socket.on(
        "send-image-url",
        ({ url, name }) => {

            if (!socket.roomId) {
                return;
            }

            if (
                !url ||
                !String(url).startsWith("http")
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

            if (history.length > 200) {

                history.shift();

            }

            io.to(
                socket.roomId
            ).emit(
                "receive-image-url",
                data
            );

            console.log(
                "Image shared:",
                socket.userName,
                data.fileName
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

            socket.to(
                socket.roomId
            ).emit(
                "incoming-call",
                {
                    callerId:
                        socket.id,

                    callerName:
                        socket.userName,

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

            socket.to(
                socket.roomId
            ).emit(
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

            socket.to(
                socket.roomId
            ).emit(
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

            socket.to(
                socket.roomId
            ).emit(
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

            socket.to(
                socket.roomId
            ).emit(
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
    // ICE
    // =========================

    socket.on(
        "ice-candidate",
        ({ candidate }) => {

            if (!socket.roomId) {
                return;
            }

            socket.to(
                socket.roomId
            ).emit(
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

            socket.to(
                socket.roomId
            ).emit(
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

            socket.to(
                socket.roomId
            ).emit(
                "user-left",
                {
                    name:
                        socket.userName
                }
            );

            socket.to(
                socket.roomId
            ).emit(
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

    io.to(
        roomId
    ).emit(
        "user-count",
        count
    );

}

// =========================
// ERROR HANDLER
// =========================

app.use(
    (error, req, res, next) => {

        console.error(
            "Server error:",
            error
        );

        if (
            error instanceof
            multer.MulterError &&
            error.code ===
            "LIMIT_FILE_SIZE"
        ) {

            return res.status(413).json({

                success: false,

                error:
                    "Image must be smaller than 20 MB."

            });

        }

        if (
            error.message ===
            "Only image files are allowed."
        ) {

            return res.status(400).json({

                success: false,

                error:
                    error.message

            });

        }

        res.status(500).json({

            success: false,

            error:
                error.message ||
                "Server error."

        });

    }
);

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
```
