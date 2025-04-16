# ISO 15118-2 Contract Certificate 요청 클라이언트 및 XML 생성 도구

이 폴더는 ISO 15118-2의 `CertificateInstallationReq` 메시지 XML을 생성하고, 해당 요청을 서버로 전송하는 클라이언트 코드를 포함합니다.

## 주요 기능

1.  **XML 생성 (`generateCertRequestXmlInstallVersion2.js`)**: 
    *   `cert/` 폴더의 OEM Provisioning 인증서와 `root/` 폴더의 루트 인증서 정보를 읽어 `CertificateInstallationReq` XML (`certRequest.xml`)을 동적으로 생성합니다.
    *   `key/` 폴더의 개인 키를 사용하여 **비표준 방식**(필수 EXI 변환 생략)으로 DigestValue와 SignatureValue를 계산하여 XML에 포함시킵니다.
    *   **경고**: 이 스크립트만으로 생성된 XML의 서명은 표준을 준수하지 않으므로, 실제 환경 사용 전 별도의 표준 서명 프로세스가 필요합니다. (상세 내용은 `signature_process_iso15118-2.md` 참조)
2.  **요청 전송 (`iso15118CertRequest.js`)**: 
    *   생성된 `certRequest.xml` 파일을 읽습니다.
    *   `V2Gdecoder.jar`를 사용하여 XML을 EXI로 인코딩합니다.
    *   인코딩된 EXI 데이터를 Base64로 변환하여 지정된 서버 엔드포인트로 전송합니다.
    *   서버 응답을 `out/response.json` 파일에 저장합니다.

## 설치

필요한 Node.js 패키지를 설치합니다:

```bash
npm install node-fetch xmlbuilder2
```

## 시스템 요구 사항

- **Node.js**: 스크립트 실행 환경
- **Java Runtime Environment (JRE)**: `V2Gdecoder.jar` 실행에 필요
- **OpenSSL**: `generateCertRequestXmlInstallVersion2.js`에서 루트 인증서 정보 추출에 필요 (시스템 PATH에 설정되어 있어야 함)

## 디렉토리 구조

- `cert/`: OEM Provisioning Certificate 파일(`oem_prov_cert.pem`)을 저장하는 폴더입니다.
- `key/`: 서명에 사용할 개인 키 파일(`private_key.pem`)을 저장하는 폴더입니다. (ECDSA, secp256r1/prime256v1)
- `root/`: 참조할 루트 인증서 파일들(`.pem`, `.crt`, `.cer`)을 저장하는 폴더입니다.
- `out/`: `iso15118CertRequest.js` 실행 시 생성되는 출력 파일을 저장하는 폴더입니다. (예: `response.json`)
- `xmlSchema/`: 참고용 ISO 15118-2 및 XMLDSig 관련 XSD 스키마 파일들이 저장된 폴더입니다. (스크립트에서 직접 사용되지는 않음)
- `V2Gdecoder.jar`: XML-EXI 변환에 사용되는 외부 Java 라이브러리입니다.
- `signature_process_iso15118-2.md`: 표준 ISO 15118-2 서명 생성 과정을 설명하는 문서입니다.

## 사용 방법

**1단계: 필요한 파일 준비**

- `cert/` 폴더에 `oem_prov_cert.pem` 파일을 위치시킵니다.
- `key/` 폴더에 `private_key.pem` 파일을 위치시킵니다.
- `root/` 폴더에 참조할 루트 인증서 파일들을 위치시킵니다.

**2단계: XML 생성 스크립트 실행**

```bash
node generateCertRequestXmlInstallVersion2.js
```

- 이 명령은 `certRequest.xml` 파일을 생성합니다. (비표준 서명 포함)
- **중요**: 실제 사용을 위해서는 이 단계에서 생성된 `certRequest.xml`의 `<DigestValue>`와 `<SignatureValue>`를 표준 방식(스키마 기반 EXI 변환 포함)으로 계산된 값으로 교체해야 합니다.

**3단계: 요청 전송 스크립트 실행**

```bash
# 기본 'install' 액션으로 요청 전송
node iso15118CertRequest.js

# 'update' 액션으로 요청 전송
node iso15118CertRequest.js update
```

- 이 명령은 2단계에서 생성된 `certRequest.xml`을 읽고, EXI 변환 후 서버로 요청을 보냅니다.
- 서버 응답은 `out/response.json` 파일에 저장됩니다.

## 스크립트 상세 설명

### `generateCertRequestXmlInstallVersion2.js`

- 입력: `cert/oem_prov_cert.pem`, `key/private_key.pem`, `root/` 폴더의 인증서들
- 처리:
    - 인증서 정보 읽기 및 추출 (OpenSSL 사용)
    - Session ID 생성
    - `CertificateInstallationReq` XML 구조 생성 (`xmlbuilder2` 사용)
    - (비표준) DigestValue 및 SignatureValue 계산 및 삽입
- 출력: `certRequest.xml`

### `iso15118CertRequest.js`

- 입력: `certRequest.xml`
- 처리:
    - `certRequest.xml` 읽기
    - XML -> EXI 변환 (`V2Gdecoder.jar` 사용)
    - Base64 인코딩
    - JSON 요청 데이터 생성
    - 서버로 POST 요청 (`node-fetch` 사용)
    - 응답 처리
- 출력: `out/response.json` 