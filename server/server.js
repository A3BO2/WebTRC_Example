// server/server.js
// ───────────────────────────────────────────────────────────────
// WebRTC "시그널링 서버"
//  - 실시간으로 Offer/Answer/ICE 같은 "신호"만 중계한다.
//  - 오디오/비디오 데이터는 여기로 오지 않는다 (P2P로 직접 이동).
// ───────────────────────────────────────────────────────────────

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const FRONT = "https://webtrc-client.onrender.com";
// [보안 팁] 배포 후에는 origin을 프론트 도메인으로 제한하세요.
// 예: cors({ origin: ["https://webrtc-client-xxxx.onrender.com"] })
app.use(
  cors({
    origin: FRONT,
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// 헬스체크/확인용
app.get("/", (_, res) => res.send("WebRTC signaling OK"));

const httpServer = http.createServer(app);

// Socket.IO 서버: 브라우저 ↔ 서버 간 신호(이벤트) 전달 전용
const io = new Server(httpServer, {
  // ★ 클라 설정과 동일하게 맞추기
  path: "/socket.io",
  cors: {
    origin: FRONT,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ── 핵심: 같은 room 사용자끼리만 신호를 주고받게 한다 ──
io.on("connection", (socket) => {
  // 1) 방 입장
  socket.on("join", (roomId) => {
    socket.join(roomId); // 방에 참가
    socket.to(roomId).emit("peer-joined"); // 나를 제외한 상대에게 "새 유저 들어옴"
    socket.emit("joined"); // 나 자신에게 "입장 완료"
  });

  // 2) Offer 중계 (A → 서버 → B)
  socket.on("offer", ({ roomId, sdp }) => {
    socket.to(roomId).emit("offer", sdp);
  });

  // 3) Answer 중계 (B → 서버 → A)
  socket.on("answer", ({ roomId, sdp }) => {
    socket.to(roomId).emit("answer", sdp);
  });

  // 4) ICE 후보 중계 (양쪽 모두 반복적으로 보냄)
  socket.on("ice", ({ roomId, candidate }) => {
    socket.to(roomId).emit("ice", candidate);
  });
});

// Render는 PORT 환경변수를 내려준다. 로컬에선 3001 사용.
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log("[signaling] listening on", PORT);
});
