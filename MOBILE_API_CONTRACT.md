# 모바일 앱 ↔ PC 웹 연동 계약

이 버전의 모바일 앱은 분석을 하지 않습니다.

```txt
모바일 책임: 프로필/개인 이력 저장 + QR 연결 + 카메라 프레임 송출
PC 웹 책임: MediaPipe 키포인트 추출 + 자세 분석 + 세션 중 임시 결과 표시
```

## QR payload

웹 QR 코드에는 아래 JSON 문자열이 들어갑니다.

```json
{
  "type": "steply-web-session",
  "sessionId": "SESSION_ID",
  "serverUrl": "https://YOUR_PC_IP:3000",
  "serverUrls": ["https://YOUR_PC_IP:3000"],
  "expiresAt": "ISO_8601_UTC_EXPIRY",
  "expiresAtEpochMs": 1783420800000,
  "pairingToken": "BASE64URL_128_BIT_RANDOM_ONE_TIME_TOKEN",
  "tlsCertSha256": "LOWERCASE_HEX_SHA256_OF_DER_LEAF_CERT"
}
```

`serverUrl`은 HTTPS여야 하며 모바일은 cleartext HTTP QR을 거부합니다. LAN 개발용 자체 서명 인증서를 사용할 때는 QR의 `tlsCertSha256` pin으로 모바일이 PC 인증서를 검증합니다.

## 모바일 처리 순서

```text
QR 스캔
→ SteplyWebSessionLink.parse(rawQr)
→ 선택된 Profile 조회
→ SteplyWebClient.connectProfile(session, profile)
→ WebSocket 연결: wss://SERVER/ws?sessionId=SESSION_ID&role=mobile
→ CameraX 프레임을 JPEG binary로 송출
→ 송출 종료 시 stopped 메시지 전송
```

`/connect`는 QR의 `pairingToken`을 body와 `X-Steply-Pairing-Token` 헤더로 보냅니다. PC는 토큰을 1회만 소비하며, 연결이 완료된 세션만 모바일 WebSocket을 허용합니다.

## PC 처리 순서

```text
JPEG binary 수신
→ dashboardSocket에서 dashboard로 remote-camera-frame broadcast
→ React dashboard가 frame 표시
→ useRemotePoseAnalysis가 Pose Worker로 frame 전달
→ poseLandmarker.worker.js에서 MediaPipe PoseLandmarker 실행
→ chairStandAnalyzer.js에서 자세 분석
→ UI에 keypoint overlay/count/warning 표시
→ /api/analysis/final 호출 시 세션 메모리 캐시에만 임시 반영
→ final WebSocket 메시지를 모바일에 전송
→ 모바일이 로컬 이력으로 저장
→ 세션 종료/연결 해제 시 PC 임시 캐시 삭제
```

## 실시간성 기준

권장 FPS:

```text
Mobile Camera preview: 30fps
Mobile JPEG websocket send: 8~12fps
PC MediaPipe inference worker: 약 10fps 제한
PC UI state update: latest frame 중심
Final result sync to mobile: 검사 종료 시 1회
```

## 세션 종료와 PC 캐시 삭제

PC는 개인 이력의 영구 원본이 아닙니다. PC는 `data/history.json` 같은 영구 파일에 최종 결과를 저장하지 않고, 세션 중 화면 표시와 모바일 전송을 위한 메모리 캐시만 유지합니다.

모바일은 사용자가 스트리밍을 중지하거나 화면을 떠날 때 아래 요청으로 PC 임시 캐시 삭제를 요청합니다.

```http
POST /api/session/{sessionId}/cleanup
X-Steply-Pairing-Token: PAIRING_TOKEN
Content-Type: application/json
```

```json
{
  "sessionId": "SESSION_ID",
  "pairingToken": "BASE64URL_128_BIT_RANDOM_ONE_TIME_TOKEN",
  "reason": "mobile-session-ended"
}
```

PC는 같은 동작을 모바일 WebSocket 연결 종료 시에도 수행합니다. cleanup 이후 해당 세션의 `profile`, `latestResult`, `finalResult`, 임시 history cache는 비워져야 하며, `/api/history`는 세션 캐시 외 영구 이력을 반환하면 안 됩니다.

## 더 이상 모바일이 보내지 않는 것

```txt
MediaPipe landmark payload
Chair Stand realtime analysis payload
posture warning payload
final analysis result payload beyond the PC-generated final sync message
recommendation payload
```

분석 payload는 PC에서 생성합니다.

## 앱↔웹 합의 필요 항목

- cleanup endpoint 이름과 method를 `POST /api/session/{sessionId}/cleanup`으로 확정할지 여부
- cleanup 인증을 기존 `pairingToken` 재사용으로 할지, 별도 session cleanup token을 QR에 추가할지 여부
- 모바일 로컬 이력 저장용 final result JSON의 최소 스키마: `sessionId`, `userId`, `testType`, `testLabel`, `primaryValue`, `primaryLabel`, `score`, `recommendationLevel`, `recommendations`, `completedAt`
- cleanup 성공/실패 응답 스키마와, cleanup 실패 시 모바일 재시도 정책
- 공용 PC 합동 검증 기준: 세션 종료 후 PC의 `data/history.json` 미생성, `/api/history` 빈 응답, 대시보드 `session-cleared` 수신 확인
