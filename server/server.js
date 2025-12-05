// Express: 기본 HTTP 서버 프레임워크
import express from "express";
// http 모듈: Express 앱을 실제 HTTP 서버로 감싸기 위해 사용
import http from "http";
// Socket.IO 서버: 실시간 이벤트 전송(시그널링에 사용)
import { Server } from "socket.io";
// CORS 허용 (개발 중 다른 포트에서의 접근 허용)
import cors from "cors";

// Express 인스턴스 생성
const app = express();
// 모든 요청에 CORS 허용(개발 편의)
app.use(cors());

// 간단한 헬스 체크 엔드포인트
app.get("/", (_, res) => res.send("WebRTC signaling OK"));

// HTTP 서버 생성 (Express 앱을 감쌈)
const httpServer = http.createServer(app);

// Socket.IO 서버 생성
// - cors.origin: "*" → 개발 중 어디서든 접속 허용(프로덕션에선 제한 권장)
const io = new Server(httpServer, { cors: { origin: "*" } });

// 방 인원에게 브로드캐스트하는 기본 시그널링 이벤트들 등록
io.on("connection", (socket) => {
  // 클라이언트가 특정 방에 입장할 때
  socket.on("join", (roomId) => {
    socket.join(roomId); // 방에 참가
    socket.to(roomId).emit("peer-joined"); // 같은 방의 다른 사람에게 "누군가 들어옴"
    socket.emit("joined"); // 본인에게는 "입장 성공" 알림
  });

  // offer 중계: A가 보낸 offer를 같은 방의 다른 클라이언트에게 전달
  socket.on("offer", ({ roomId, sdp }) => {
    socket.to(roomId).emit("offer", sdp);
  });

  // answer 중계: B가 보낸 answer를 같은 방의 다른 클라이언트에게 전달
  socket.on("answer", ({ roomId, sdp }) => {
    socket.to(roomId).emit("answer", sdp);
  });

  // ICE 후보 중계: 양쪽이 찾은 네트워크 경로 후보를 서로에게 전달
  socket.on("ice", ({ roomId, candidate }) => {
    socket.to(roomId).emit("ice", candidate);
  });
});

// 서버 포트 지정 및 실행
const PORT = 3001;
httpServer.listen(PORT, () =>
  console.log("Signaling on http://localhost:" + PORT)
);
