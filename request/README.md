# ISO 15118 요청 파일 전송 도구

이 폴더에는 생성된 ISO 15118 요청 XML 파일들을 서버로 전송하는 다양한 스크립트들이 포함되어 있습니다.

> **중요**: 이 도구는 요청(Request) 파일만 서버로 전송합니다. 응답(Response) 파일은 서버에서 생성하여 클라이언트에게 전송하는 것이므로, 클라이언트에서 서버로 응답을 전송하지 않습니다.

## 📁 폴더 구조

```
request/
├── send-xml.js           # 기본 요청 XML 전송 스크립트 (JSON 래핑)
├── send-xml-exi.js       # EXI 인코딩 요청 XML 전송 스크립트
├── ExiProcessor.js       # EXI 처리 클래스
├── output/               # 응답 및 디버깅 파일 저장 폴더
└── README.md             # 이 파일
```

## 🚀 기본 요청 XML 전송 (send-xml.js)

### 기본 사용법

```bash
# 기본 실행 (기본 요청 XML 파일 사용)
node request/send-xml.js

# 특정 요청 XML 파일 지정
node request/send-xml.js certificateInstallationReq_v20_ecdsa.xml

# 다른 서버 설정
node request/send-xml.js my_request.xml endpoint hostname port
```

### 매개변수

1. `xmlFileName` (선택): 요청 XML 파일명 (기본값: 마지막 생성된 파일)
2. `endpoint` (선택): API 엔드포인트 (기본값: 'certificateInstallation')
3. `hostname` (선택): 서버 호스트 (기본값: 'localhost')
4. `port` (선택): 서버 포트 (기본값: 7600)

### 요청/응답 형식

**요청 구조:**
```json
{
  "xmlContent": "<?xml version=\"1.0\"...>",
  "messageType": "request",
  "algorithm": "ecdsa|ed448|auto",
  "version": "20|2"
}
```

**응답 구조:**
```json
{
  "timestamp": "2025-01-20T...",
  "request": { "..." },
  "response": {
    "statusCode": 200,
    "headers": { "..." },
    "data": { "..." }
  }
}
```

---

## 🔄 EXI 인코딩 요청 XML 전송 (send-xml-exi.js)

**ISO 15118-20 표준에 맞는 EXI 인코딩 지원 스크립트입니다.**

### 기본 사용법

```bash
# 기본 실행 (ECDSA 요청 파일 사용)
node request/send-xml-exi.js

# 도움말 보기
node request/send-xml-exi.js --help

# 특정 파일과 액션 지정
node request/send-xml-exi.js --file certificateInstallationReq_v20_ed448.xml --action install

# 다른 서버로 전송
node request/send-xml-exi.js --host 192.168.1.100 --port 8080
```

### 옵션

- `-f, --file <파일명>`: 요청 XML 파일명 (기본값: certificateInstallationReq_v20_ecdsa.xml)
- `--action <액션>`: 액션 타입 (install|update, 기본값: install)
- `--host <호스트>`: 서버 호스트 (기본값: localhost)
- `--port <포트>`: 서버 포트 (기본값: 7600)
- `-h, --help`: 도움말 출력

### EXI 처리 과정

1. **요청 XML 파일 읽기**: `../out/` 폴더에서 지정된 요청 XML 파일을 읽습니다
2. **EXI 인코딩**: `exi_processor.jar`를 사용하여 XML을 EXI 바이너리로 인코딩
3. **Base64 변환**: EXI 바이너리 데이터를 Base64로 인코딩
4. **서버 전송**: ISO 15118-20 표준 형식으로 서버에 전송
5. **응답 저장**: 서버 응답을 JSON 파일로 저장

### 요청 구조 (EXI)

```json
{
  "iso15118SchemaVersion": "urn:iso:std:iso:15118:-20:CommonMessages",
  "action": "install|update",
  "exiRequest": "base64EncodedEXIData..."
}
```

### 생성되는 파일들

- `request/output/debug_request_*.xml`: 요청에 사용된 XML 파일 복사본
- `request/output/debug_exi_data_*.bin`: EXI 인코딩된 바이너리 데이터
- `request/output/request_data_*.json`: 서버로 전송한 요청 데이터
- `request/output/exi_response_*.json`: 서버 응답 데이터

---

## 📋 NPM 스크립트

### 기본 요청 XML 전송

```bash
# 기본 전송
npm run send-xml

# 특정 요청 파일 전송
npm run send-ecdsa-req    # ECDSA 요청
npm run send-ed448-req    # Ed448 요청
```

### EXI 인코딩 전송

```bash
# 기본 EXI 전송
npm run send-exi

# 특정 알고리즘으로 EXI 전송
npm run send-exi-ecdsa    # ECDSA 요청을 EXI로 전송
npm run send-exi-ed448    # Ed448 요청을 EXI로 전송

# 도움말
npm run send-exi-help
```

---

## 🔧 설정 및 요구사항

### 필수 요구사항

1. **Java Runtime Environment (JRE)**
   - `exi_processor.jar` 실행을 위해 필요
   - Java 8 이상 권장

2. **Node.js 모듈**
   ```bash
   npm install java node-fetch
   ```

3. **서버 실행**
   - 기본 설정: `http://localhost:7600`
   - API 엔드포인트: `/api/contract-cert/ISO15118CertReq` (EXI)
   - API 엔드포인트: `/api/contract-cert/certificateInstallation` (기본)

### 환경 설정

- `exi_processor.jar`는 프로젝트 루트에 위치해야 함
- 전송할 요청 XML 파일들은 `../out/` 폴더에 위치해야 함
- 응답 파일들은 `request/output/` 폴더에 자동 저장됨

---

## 🚨 문제 해결

### 일반적인 오류

1. **Java 클래스 로드 실패**
   ```
   ✗ 클래스 로드 실패: com.lw.exiConvert.XmlEncode
   ```
   - `exi_processor.jar` 파일 경로 확인
   - Java 버전 확인 (Java 8+ 필요)

2. **요청 XML 파일을 찾을 수 없음**
   ```
   ❌ XML 파일이 존재하지 않습니다
   ```
   - `../out/` 폴더에 요청 XML 파일이 있는지 확인
   - 파일명 정확성 확인 (Req 파일만 전송 가능)

3. **서버 연결 실패**
   ```
   ❌ 서버 응답 오류 (ECONNREFUSED)
   ```
   - 서버가 실행 중인지 확인
   - 호스트/포트 설정 확인

4. **node-fetch 모듈 없음**
   ```
   ❌ node-fetch 라이브러리가 설치되지 않았습니다
   ```
   - `npm install node-fetch` 실행

### 디버깅

- EXI 전송 시 `request/output/` 폴더의 디버깅 파일들을 확인
- 요청/응답 데이터가 JSON 파일로 저장되므로 문제 분석 가능
- 콘솔 출력에서 각 단계별 상태 확인

---

## 📈 예시 실행 결과

### 성공적인 EXI 전송

```bash
$ npm run send-exi-ecdsa

🚀 EXI 인코딩 XML 요청 전송 시작...
  📄 XML 파일: certificateInstallationReq_v20_ecdsa.xml
  🎯 액션: install
  🌐 서버: localhost:7600

✅ XML 내용 읽기 완료 (4823 bytes)
🔧 EXI 프로세서 초기화 중...
✓ 클래스 로드 성공: com.lw.exiConvert.XmlEncode
✓ 클래스 로드 성공: com.lw.exiConvert.XmlDecode

총 2개 클래스 로드 완료
로드된 클래스들: XmlEncode, XmlDecode
✅ EXI 프로세서 초기화 완료

🔄 XML을 EXI로 인코딩 중...
✅ EXI 인코딩 완료, Base64 크기: 2156

📤 서버에 요청 전송 중: http://localhost:7600/api/contract-cert/ISO15118CertReq
📊 서버 응답 상태 코드: 200

=== 응답 결과 ===
✅ 요청 처리 성공
🎉 요청 처리 성공적으로 완료!
```

## 🎯 사용 가능한 요청 파일들

현재 전송 가능한 요청 파일 목록:

- `certificateInstallationReq_v2.xml` (ISO 15118-2)
- `certificateUpdateReq_v2.xml` (ISO 15118-2)
- `certificateInstallationReq_v20_ecdsa.xml` (ISO 15118-20 ECDSA)
- `certificateInstallationReq_v20_ed448.xml` (ISO 15118-20 Ed448)
- `certificateInstallationReq_v20_auto.xml` (ISO 15118-20 자동감지)

> **참고**: 응답(Response) 파일들(`*Res*.xml`)은 서버로 전송하지 않습니다. 이들은 서버 개발/테스트 목적으로만 생성됩니다.

---

이제 완성된 요청 파일 전송 시스템을 사용하여 ISO 15118 표준에 맞는 정확한 형식으로 서버와 통신할 수 있습니다! 🚀 