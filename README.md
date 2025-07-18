# ISO15118-20 인증서 설치 요청 도구

이 도구는 ISO15118-20 표준에 따른 인증서 설치 요청(CertificateInstallationReq)을 생성하고 서버로 전송하는 기능을 제공합니다.

## 기능

- ISO15118-20 표준 준수 CertificateInstallationReq XML 생성
- XML에서 EXI 인코딩 데이터 생성 (예시 데이터 사용)
- 서버로 인증서 요청 전송 및 응답 처리

## 설치 방법

1. 필요한 패키지 설치:

```bash
npm install
```

2. OpenSSL이 설치되어 있어야 합니다.

## 사용 방법

1. 'cert' 폴더에 OEM 인증서 파일 (oem_prov_cert_20.pem)이 있는지 확인하세요.
2. 'key' 폴더에 개인 키 파일 (private_20.key.pem)이 있는지 확인하세요.
3. 'emaid' 폴더의 prioritized_emaids.json 파일에 EMAID 목록이 있는지 확인하세요.
4. sendCertificateRequest.js 파일에서 SERVER_URL 값을 실제 서버 URL로 업데이트하세요.
5. 다음 명령으로 실행하세요:

```bash
npm start
```

## 파일 구조

- `sendCertificateRequest.js`: 메인 실행 파일
- `cert/`: 인증서 파일 디렉토리
- `key/`: 개인 키 파일 디렉토리
- `root/`: 루트 인증서 파일 디렉토리
- `emaid/`: EMAID 관련 파일 디렉토리
- `out/`: 출력 파일 디렉토리

## 출력 파일

- `out/certificateInstallationReq_20.xml`: 생성된 XML 요청 파일
- `out/request_data_20.json`: 서버로 전송될 요청 데이터 (JSON 형식)
- `out/response.json`: 서버로부터 받은 응답 데이터

## 참고사항

- EXI 인코딩 부분은 실제 구현이 아닌 예시 데이터를 사용합니다.
- 실제 서버 통신을 위해서는 SERVER_URL과 axios 요청 부분을 주석 해제하고 구성해야 합니다. 