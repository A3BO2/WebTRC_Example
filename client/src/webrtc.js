// client/src/webrtc.js
// ───────────────────────────────────────────────────────────────
// 브라우저 쪽 헬퍼:
//  - Socket.IO 클라이언트 생성
//  - WebRTC PeerConnection 생성 (핵심 이벤트 핸들러 포함)
// ───────────────────────────────────────────────────────────────

import { io } from "socket.io-client";

/** 시그널링 서버에 연결 (Socket.IO)
 *  - P2P 연결 전에 Offer/Answer/ICE 같은 "문자 메시지"를 주고받는 용도
 */
export function createSocket() {
  // URL은 .env (VITE_SIGNAL_URL)에서 주입
  const url = import.meta.env.VITE_SIGNAL_URL;
  return io(url, {
    transports: ["websocket"], // 디버깅 단순화를 위해 websocket 고정
  });
}

/** WebRTC PeerConnection 생성
 *  - onTrack: 상대 영상 들어올 때
 *  - onIce:   ICE 후보를 찾을 때 (시그널링 서버로 전달)
 *  - onState: 연결 상태 바뀔 때
 */
export function createPeer({ onTrack, onIce, onState }) {
  const pc = new RTCPeerConnection({
    // STUN: 내 공인 IP 파악 (구글 공개 STUN 사용)
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  // 상대가 보낸 영상 스트림 수신
  pc.ontrack = (event) => {
    const [stream] = event.streams;
    onTrack?.(stream);
  };

  // 사용 가능한 네트워크 경로(ICE candidate)를 찾으면 호출됨
  pc.onicecandidate = (event) => {
    if (event.candidate) onIce?.(event.candidate);
  };

  // 연결 상태 변경(new → connecting → connected ...)
  pc.onconnectionstatechange = () => {
    onState?.(pc.connectionState);
  };

  return pc;
}
