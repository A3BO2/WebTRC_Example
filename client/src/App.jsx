import { useEffect, useRef, useState } from "react";
// 시그널링 연결/Peer 생성 함수 가져오기
import { createSocket, createPeer } from "./webrtc";
// 간단 스타일
import "./App.css";

export default function App() {
  // 사용자가 입력한 방 이름 (같은 방에 들어간 브라우저끼리 연결)
  const [room, setRoom] = useState("");
  // "joined" 이벤트를 받았는지(= 방 입장 완료)
  const [joined, setJoined] = useState(false);
  // WebRTC P2P 연결 상태(connected일 때 true)
  const [connected, setConnected] = useState(false);
  // 화면에 표시할 로그 문자열들
  const [log, setLog] = useState([]);

  // DOM 요소 참조: 내 영상/상대 영상/메시지 입력창
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const msgRef = useRef(null);

  // 객체 보관: 소켓/PeerConnection/DataChannel/내 로컬 스트림
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const localStream = useRef(null);

  // 로그 찍기 유틸
  const addLog = (t) => setLog((prev) => [...prev, t]);

  /**
   * 📷 카메라 켜기
   * - 브라우저 권한 팝업에서 허용해야 함
   * - 성공하면 내 <video>에 내 스트림을 붙임
   */
  const startCam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStream.current = stream; // 내 스트림 기억
      localVideo.current.srcObject = stream; // 내 비디오에 연결
      addLog("카메라 ON");
    } catch (e) {
      alert("카메라/마이크 권한을 허용하세요.");
      console.error(e);
    }
  };

  /**
   * 🧱 PeerConnection 보장(없으면 만들고, 있으면 재사용)
   * - onTrack: 상대 스트림 수신 시 내 remote <video>에 연결
   * - onIce: ICE 후보 발견 시 시그널링으로 상대에게 전달
   * - onState: 연결 상태 변화에 따라 UI/로그 갱신
   * - 그리고 내 스트림의 각 트랙을 Peer에 addTrack
   */
  const ensurePC = () => {
    if (pcRef.current) return; // 이미 있으면 그대로 사용

    pcRef.current = createPeer({
      onTrack: (remoteStream) => {
        remoteVideo.current.srcObject = remoteStream;
      },
      onIce: (candidate) => {
        // ICE 후보를 서버로 보내 상대에게 전달되게 함
        socketRef.current.emit("ice", { roomId: room, candidate });
      },
      onState: (state) => {
        // 연결 상태가 connected면 통화 버튼/채팅 버튼 활성화
        setConnected(state === "connected");
        addLog("WEBRTC 상태: " + state);
      },
    });

    // 내(로컬) 카메라/마이크 트랙을 PeerConnection에 등록해서 상대에게 보낼 준비
    localStream.current?.getTracks().forEach((track) => {
      pcRef.current.addTrack(track, localStream.current);
    });
  };

  /**
   * 📞 통화 시작(Offer 생성/전송)
   * - 발신자 역할
   * - 데이터채널(DataChannel)도 여기서 생성(채팅용)
   */
  const call = async () => {
    ensurePC();

    // 1) 채팅 채널 생성 (상대는 'ondatachannel'로 받게 됨)
    dcRef.current = pcRef.current.createDataChannel("chat");
    dcRef.current.onopen = () => addLog("DataChannel OPEN");
    dcRef.current.onmessage = (e) => addLog("상대: " + e.data);

    // 2) Offer SDP 생성 → 내 로컬 설명에 반영
    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    // 3) 시그널링 서버로 Offer 전송(상대에게 전달됨)
    socketRef.current.emit("offer", { roomId: room, sdp: offer });
    addLog("offer 보냄");
  };

  /**
   * ❌ 통화 종료
   * - PeerConnection 닫고 참조 제거
   */
  const hangup = () => {
    pcRef.current?.close(); // 연결 닫기
    pcRef.current = null; // 참조 제거
    dcRef.current = null; // 데이터채널 참조 제거
    setConnected(false); // UI 갱신
    addLog("통화 종료");
  };

  /**
   * 💬 메시지 전송 (DataChannel)
   * - 연결된 상태에서만 동작
   */
  const sendMsg = () => {
    const text = msgRef.current.value;
    if (!text || !dcRef.current) return;
    dcRef.current.send(text); // 상대에게 전송
    addLog("나: " + text); // 내 로그에도 표시
    msgRef.current.value = ""; // 입력창 비우기
  };

  /**
   * 🔌 시그널링 소켓 초기화 및 이벤트 바인딩
   * - room 값이 바뀔 때마다 새로 연결 (간단하게 처리하기 위함)
   * - 실서비스라면 room을 바꿔도 소켓은 재사용하도록 관리 가능
   */
  useEffect(() => {
    // 서버와 소켓 연결
    const socket = createSocket();
    socketRef.current = socket;

    // 1) 내가 방에 성공적으로 들어간 경우
    socket.on("joined", () => {
      setJoined(true);
      addLog("방 입장");
    });

    // 2) 상대가 방에 들어왔음을 알림
    socket.on("peer-joined", () => {
      addLog("상대 입장");
    });

    // 3) 상대가 보낸 Offer 수신 → 내가 Answer 생성해서 회신
    socket.on("offer", async (remoteOffer) => {
      ensurePC(); // Peer 준비(없으면 생성)

      // 상대가 먼저 만든 데이터채널을 받을 준비
      pcRef.current.ondatachannel = (event) => {
        dcRef.current = event.channel;
        dcRef.current.onopen = () => addLog("DataChannel OPEN");
        dcRef.current.onmessage = (e) => addLog("상대: " + e.data);
      };

      // (1) 내 원격 설명에 상대 Offer 적용
      await pcRef.current.setRemoteDescription(remoteOffer);

      // (2) 내 Answer 생성 후 내 로컬 설명에 적용
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);

      // (3) 서버로 Answer 전송 → 상대에게 전달됨
      socket.emit("answer", { roomId: room, sdp: answer });
      addLog("answer 보냄");
    });

    // 4) 상대가 보낸 Answer 수신 → 내 원격 설명에 적용
    socket.on("answer", async (remoteAnswer) => {
      await pcRef.current?.setRemoteDescription(remoteAnswer);
      addLog("answer 받음");
    });

    // 5) 상대의 ICE 후보 수신 → 내 Peer에 추가
    socket.on("ice", async (candidate) => {
      try {
        await pcRef.current?.addIceCandidate(candidate);
      } catch (e) {
        console.warn("addIceCandidate 실패(무시 가능):", e?.message);
      }
    });

    // 언마운트/room 변경 시 소켓 연결 정리
    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  return (
    <div className="wrap">
      <h1>WebRTC + React (Vite) — 전체 주석 버전</h1>

      {/* 방 이름 입력 + 입장 */}
      <div className="row">
        <input
          placeholder="room 이름(같은 값을 두 탭에 입력)"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
        />
        {/* 서버로 'join' 이벤트 전송 → 같은 room 참가자끼리만 신호 교환 */}
        <button onClick={() => socketRef.current.emit("join", room)}>
          입장
        </button>
      </div>

      {/* 기본 조작 버튼들 */}
      <div className="row">
        {/* 내 카메라/마이크 가져오기 */}
        <button onClick={startCam}>카메라 ON</button>

        {/* 상대에게 통화 제안(Offer) 보내기 — 방에 들어간 뒤 가능 */}
        <button onClick={call} disabled={!joined}>
          통화 시작
        </button>

        {/* 연결이 성립된 경우에만 끊기 버튼 활성화 */}
        <button onClick={hangup} disabled={!connected}>
          끊기
        </button>
      </div>

      {/* 내 영상 / 상대 영상 영역 */}
      <div className="videos">
        <video ref={localVideo} autoPlay playsInline muted />
        <video ref={remoteVideo} autoPlay playsInline />
      </div>

      {/* 채팅(DataChannel) UI */}
      <div className="row">
        <input ref={msgRef} placeholder="메시지 입력 후 보내기" />
        <button onClick={sendMsg} disabled={!connected}>
          보내기
        </button>
      </div>

      {/* 로그 출력 (흐름 확인용) */}
      <pre className="log">{log.join("\n")}</pre>
    </div>
  );
}
