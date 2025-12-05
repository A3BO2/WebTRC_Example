// client/src/App.jsx
// ───────────────────────────────────────────────────────────────
// 최소 UI + WebRTC 흐름 전체:
//  1) 방 입장 → 2) 카메라 ON → 3) Offer/Answer → 4) ICE 교환 → 연결
//  중요 지점마다 주석으로 설명.
// ───────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { createSocket, createPeer } from "./webrtc";
import "./App.css";

export default function App() {
  // 방 이름 (같은 값으로 입장한 사용자끼리 연결)
  const [room, setRoom] = useState("");

  // 현재 상태 표시용
  const [joined, setJoined] = useState(false); // 방 입장 완료
  const [connected, setConnected] = useState(false); // P2P 연결 완료
  const [log, setLog] = useState([]);

  // DOM ref
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const msgRef = useRef(null);

  // 객체/상태 ref
  const socketRef = useRef(null); // Socket.IO 연결
  const pcRef = useRef(null); // RTCPeerConnection
  const dcRef = useRef(null); // DataChannel (채팅)
  const localStream = useRef(null); // 내 카메라 스트림

  const addLog = (t) => setLog((p) => [...p, t]);

  // 1) 카메라/마이크 사용 권한 요청 + 로컬 비디오 표시
  const startCam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStream.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;
      addLog("카메라 ON");
    } catch (e) {
      alert("카메라/마이크 권한을 허용해주세요.");
    }
  };

  // 2) PeerConnection 준비 (없으면 생성)
  const ensurePC = () => {
    if (pcRef.current) return;

    pcRef.current = createPeer({
      onTrack: (remoteStream) => {
        if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream;
      },
      onIce: (candidate) => {
        // 찾은 ICE 후보를 시그널링 서버로 전달 → 서버가 상대에게 중계
        socketRef.current?.emit("ice", { roomId: room, candidate });
      },
      onState: (state) => {
        addLog("WEBRTC 상태: " + state);
        setConnected(state === "connected");
      },
    });

    // 내 카메라 트랙을 PeerConnection에 등록
    localStream.current?.getTracks().forEach((track) => {
      pcRef.current.addTrack(track, localStream.current);
    });
  };

  // 3) 통화 시작 (발신자: Offer 생성/전송 + DataChannel 생성)
  const call = async () => {
    ensurePC();

    // 채팅용 데이터채널 생성 (수신자는 ondatachannel에서 받아감)
    dcRef.current = pcRef.current.createDataChannel("chat");
    dcRef.current.onopen = () => addLog("DataChannel OPEN");
    dcRef.current.onmessage = (e) => addLog("상대: " + e.data);

    // Offer 생성 → 내 로컬 설명에 반영
    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    // 시그널링 서버로 Offer 전송 → 상대에게 전달됨
    socketRef.current?.emit("offer", { roomId: room, sdp: offer });
    addLog("offer 보냄");
  };

  // 4) 끊기
  const hangup = () => {
    pcRef.current?.close();
    pcRef.current = null;
    dcRef.current = null;
    setConnected(false);
    addLog("통화 종료");
  };

  // 5) 채팅 보내기 (P2P DataChannel)
  const sendMsg = () => {
    const m = msgRef.current?.value;
    if (!m || !dcRef.current) return;
    dcRef.current.send(m);
    addLog("나: " + m);
    msgRef.current.value = "";
  };

  // 6) 시그널링(소켓) 이벤트 바인딩: join/offer/answer/ice
  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    // 방 입장 완료
    socket.on("joined", () => {
      setJoined(true);
      addLog("방 입장");
    });

    // 상대가 방에 들어옴 (정보용)
    socket.on("peer-joined", () => addLog("상대 입장"));

    // (수신자) 상대 Offer 수신 → Answer 생성/전송
    socket.on("offer", async (remoteOffer) => {
      ensurePC();

      // 상대가 만든 DataChannel을 수신
      pcRef.current.ondatachannel = (e) => {
        dcRef.current = e.channel;
        dcRef.current.onopen = () => addLog("DataChannel OPEN");
        dcRef.current.onmessage = (ev) => addLog("상대: " + ev.data);
      };

      // 상대 Offer를 원격 설명으로 적용
      await pcRef.current.setRemoteDescription(remoteOffer);

      // 내 Answer 생성/적용 후 서버로 전송
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      socket.emit("answer", { roomId: room, sdp: answer });
      addLog("answer 보냄");
    });

    // (발신자) Answer 수신 → 원격 설명으로 적용
    socket.on("answer", async (remoteAnswer) => {
      await pcRef.current?.setRemoteDescription(remoteAnswer);
      addLog("answer 받음");
    });

    // 상대 ICE 후보 수신 → 내 PeerConnection에 반영
    socket.on("ice", async (candidate) => {
      try {
        await pcRef.current?.addIceCandidate(candidate);
      } catch {
        /* 무시 가능 */
      }
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  return (
    <div className="wrap">
      <h1>WebRTC (React + Vite + Socket.IO)</h1>

      <div className="row">
        <input
          placeholder="room 이름"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
        />
        <button onClick={() => socketRef.current?.emit("join", room)}>
          입장
        </button>
      </div>

      <div className="row">
        <button onClick={startCam}>카메라 ON</button>
        <button onClick={call} disabled={!joined}>
          통화 시작
        </button>
        <button onClick={hangup} disabled={!connected}>
          끊기
        </button>
      </div>

      <div className="videos">
        <video ref={localVideo} autoPlay playsInline muted />
        <video ref={remoteVideo} autoPlay playsInline />
      </div>

      <div className="row">
        <input ref={msgRef} placeholder="메시지 입력" />
        <button onClick={sendMsg} disabled={!connected}>
          보내기
        </button>
      </div>

      <pre className="log">{log.join("\n")}</pre>
    </div>
  );
}
