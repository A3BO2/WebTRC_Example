# WebRTC 1:1 Video Chat (React + Vite + Socket.IO)

React(Vite)와 Socket.IO 기반으로 만든 **1:1 WebRTC 화상채팅
데모**입니다.\
브라우저 간 P2P 연결을 통해 영상/음성/메시지를 주고받습니다.

---

## 🚀 Features

- 1:1 실시간 영상 / 오디오 통화
- 채팅(DataChannel) 지원
- STUN 서버 기반 ICE 후보 수집
- Socket.IO 기반 시그널링 서버
- Vite + React 기본 구조 사용 (구조 변경 최소화)
- 로컬 환경에서 HTTPS 없이 동작 (localhost 예외)

---

## 📁 Project Structure

    WEBRTC-TEST/
     ├─ server/               # WebRTC signaling server
     │   ├─ server.js
     │   └─ package.json
     └─ client/               # React (Vite) frontend
         ├─ index.html
         ├─ vite.config.js
         └─ src/
             ├─ App.jsx
             ├─ App.css
             ├─ webrtc.js     # PeerConnection + Socket helper
             ├─ main.jsx
             └─ index.css

---

## 🧩 Installation & Run

### 1) Run signaling server

```bash
cd server
npm install
npm start
```

→ Server runs at **http://localhost:3001**

### 2) Run React client

```bash
cd ../client
npm install
npm run dev
```

→ Client runs at **http://localhost:5173**

---

## 🔌 How It Works (Flow)

1.  사용자가 방 이름(Room ID)을 입력하고 입장\
2.  두 브라우저는 Socket.IO 서버에서 같은 방으로 연결\
3.  한쪽이 WebRTC **Offer** 생성 → 서버를 통해 상대에게 전달\
4.  상대가 **Answer** 생성 → 서버를 통해 다시 전달\
5.  양쪽 브라우저가 ICE 후보(네트워크 경로)를 찾으면\
    Socket.IO의 **ice 이벤트**로 서로에게 전송\
6.  P2P 연결이 완료되면 영상 + 오디오 스트림 및 채팅 전달 가능

---

## 🛠️ Required Modules

### Server

```bash
npm install express socket.io cors
```

### Client

```bash
npm install socket.io-client
```

(WebRTC는 브라우저 기본 API이기 때문에 별도 설치 필요 없음)

---

## 📌 Notes

- 회사/학교 Wi-Fi에서는 P2P가 차단될 수 있음 → TURN 서버 필요\
- 실제 배포 시에는 **HTTPS** 환경이 필요 (Chrome 정책)\
- 디버깅: `chrome://webrtc-internals/` 에서 WebRTC 흐름 분석 가능

---

## License

MIT
