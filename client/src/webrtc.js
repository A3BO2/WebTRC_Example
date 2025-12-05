// 시그널링 서버와 통신하기 위한 Socket.IO 클라이언트
import { io } from "socket.io-client";

/**
 * 🔌 시그널링 서버에 연결해서 소켓 인스턴스를 반환
 * - WebRTC에서는 offer/answer/ice 같은 "문자 메시지"를
 *   P2P가 연결되기 전까지 이 소켓으로 주고받음
 */
export function createSocket() {
  return io("http://localhost:3001", {
    transports: ["websocket"], // 웹소켓만 사용(폴백 비활성화) → 디버깅 단순화
  });
}

/**
 * 🎥 WebRTC PeerConnection 생성
 * @param {Object} handlers
 * @param {Function} handlers.onTrack  - 상대 영상(원격 스트림)이 들어왔을 때 콜백
 * @param {Function} handlers.onIce    - ICE 후보가 발견됐을 때 콜백(보통 서버로 전달)
 * @param {Function} handlers.onState  - 연결 상태(new/connecting/connected/...) 바뀔 때 콜백
 */
export function createPeer({ onTrack, onIce, onState }) {
  // STUN 서버는 "내 공인 IP"를 알아내는 용도
  // 구글 공개 STUN 서버 사용 (무료)
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  // 상대방이 보낸 원격 스트림 수신 시
  pc.ontrack = (event) => {
    // 여러 트랙(video, audio)이 있을 수 있지만
    // 일반적으론 event.streams[0]이 전체 스트림
    onTrack?.(event.streams[0]);
  };

  // ICE 후보(가능한 네트워크 경로)를 찾았을 때
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      onIce?.(event.candidate);
    }
  };

  // 연결 상태 변경 시 (new → connecting → connected …)
  pc.onconnectionstatechange = () => {
    onState?.(pc.connectionState);
  };

  return pc;
}
