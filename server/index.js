const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const staticPath = path.join(__dirname, "../client/dist");
app.use(express.static(staticPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});

io.on("connection", (socket) => {
  socket.on("join-channel", (channel) => socket.join(channel));
  socket.on("offer", ({ offer, channel }) => socket.to(channel).emit("offer", { offer, channel }));
  socket.on("answer", ({ answer, channel }) => socket.to(channel).emit("answer", { answer, channel }));
  socket.on("candidate", ({ candidate, channel }) => socket.to(channel).emit("candidate", { candidate, channel }));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log("✅ Server running on port", PORT));
