# ISO15118 인증서 요청 클라이언트

이 폴더는 ISO15118 인증서 요청을 보내는 클라이언트 코드를 포함하고 있습니다.

## 설치

필요한 패키지를 설치합니다:

```bash
npm install node-fetch
```

## 사용 방법

1. `certRequest.xml` 파일을 `contractCertRequest` 폴더에 생성합니다. 이 파일에는 인증서 요청에 필요한 XML 내용을 작성합니다.
   - 예제 파일 `certRequest.xml.example`을 참고해 작성할 수 있습니다.

2. 다음 명령어로 스크립트를 실행합니다:

```bash
node iso15118CertRequest.js
```

기본적으로 'install' 액션으로 요청을 보냅니다. 'update' 액션을 사용하려면 코드에서 다음과 같이 변경하세요:

```javascript
sendISO15118CertRequest('update')
```

## 디렉토리 구조

스크립트 실행 시 다음 디렉토리가 자동으로 생성됩니다:

- `temp/`: 임시 파일을 저장하는 디렉토리입니다.
- `out/`: 출력 파일을 저장하는 디렉토리입니다.
  - `temp_output.exi`: EXI로 인코딩된 파일
  - `response.json`: 서버 응답 데이터

## 설명

이 스크립트는 다음과 같은 작업을 수행합니다:

1. 지정된 XML 파일(`certRequest.xml`)을 읽습니다.
2. XML 내용을 EXI 형식으로 인코딩합니다 (V2Gdecoder.jar 사용).
3. 인코딩된 EXI 데이터를 base64로 변환하여 다음 형식의 JSON 데이터를 생성합니다:
   ```json
   {
     "iso15118SchemaVersion": "2.0",
     "action": "install",
     "exiRequest": "(base64로 인코딩된 EXI 데이터)"
   }
   ```
4. 생성된 JSON 데이터를 `localhost:7600/api/contract-cert/ISO15118CertReq` 엔드포인트로 POST 요청을 보냅니다.
5. 응답 데이터를 `out/response.json` 파일로 저장합니다.

## 요구 사항

- Node.js
- Java 런타임 환경 (V2Gdecoder.jar 실행에 필요) 