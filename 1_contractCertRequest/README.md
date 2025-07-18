# ISO 15118-2/20 Contract Certificate 요청 클라이언트 및 XML 생성 도구

이 폴더는 ISO 15118-2 및 ISO 15118-20의 `CertificateInstallationReq` 메시지 XML을 생성하고, 해당 요청을 서버로 전송하는 클라이언트 코드를 포함합니다.

## 주요 기능

### ISO 15118-2 (V2)
1.  **XML 생성 (`generateCertRequestXmlInstallVersion2.js`)**: 
    *   `cert/` 폴더의 OEM Provisioning 인증서와 `root/` 폴더의 루트 인증서 정보를 읽어 `CertificateInstallationReq` XML (`certRequest.xml`)을 동적으로 생성합니다.
    *   `key/` 폴더의 개인 키를 사용하여 **비표준 방식**(필수 EXI 변환 생략)으로 DigestValue와 SignatureValue를 계산하여 XML에 포함시킵니다.
    *   **경고**: 이 스크립트만으로 생성된 XML의 서명은 표준을 준수하지 않으므로, 실제 환경 사용 전 별도의 표준 서명 프로세스가 필요합니다. (상세 내용은 `signature_process_iso15118-2.md` 참조)
2.  **요청 전송 (`iso15118CertRequest.js`)**: 
    *   생성된 `certRequest.xml` 파일을 읽습니다.
    *   `V2Gdecoder.jar`를 사용하여 XML을 EXI로 인코딩합니다.
    *   인코딩된 EXI 데이터를 Base64로 변환하여 지정된 서버 엔드포인트로 전송합니다.
    *   서버 응답을 `out/response.json` 파일에 저장합니다.

### ISO 15118-20 (V20)
1.  **XML 생성 (`generateCertRequestXmlInstallVersion20.js`)**: 
    *   `cert/` 폴더의 OEM Provisioning 인증서(ISO 15118-20 호환)와 `root/` 폴더의 루트 인증서 정보를 읽어 `CertificateInstallationReq` XML을 동적으로 생성합니다.
    *   `key/` 폴더의 개인 키를 사용하여 ISO 15118-20 표준에 따라 DigestValue와 SignatureValue를 계산합니다.
    *   인증서 타입에 따라 적절한 서명 알고리즘(ECDSA-SHA512 또는 Ed448-SHAKE256)을 자동으로 선택합니다.
    *   XML 스키마를 사용하여 EXI 인코딩 과정을 표준에 맞게 처리합니다.
2.  **요청 전송 (`iso15118_20CertRequest.js`)**: 
    *   생성된 XML 파일을 서버로 직접 전송합니다(EXI 변환 없이).
    *   커맨드 라인 인자를 통해 요청 XML 파일명을 지정할 수 있습니다.
    *   서버 응답을 `out/` 디렉토리에 타임스탬프가 포함된 파일명으로 저장합니다.

## 설치

필요한 Node.js 패키지를 설치합니다:

```bash
npm install
```

또는 수동으로 필요한 패키지를 설치합니다:

```bash
npm install node-fetch xmlbuilder2 libxmljs2
```

## 시스템 요구 사항

- **Node.js**: 버전 14.0.0 이상
- **Java Runtime Environment (JRE)**: `V2Gdecoder.jar` 실행에 필요
- **OpenSSL**: 루트 인증서 정보 추출에 필요 (시스템 PATH에 설정되어 있어야 함)

## 디렉토리 구조

- `cert/`: OEM Provisioning Certificate 파일들을 저장하는 폴더입니다.
  - `oem_prov_cert.pem`: ISO 15118-2용 인증서
  - `target_oem_prov_cert_20.pem`: ISO 15118-20용 인증서
  - `sub_cert1.pem`: (선택) ISO 15118-20용 서브 인증서
- `key/`: 서명에 사용할 개인 키 파일을 저장하는 폴더입니다.
  - `private_key.pem`: ISO 15118-2용 개인 키 (ECDSA, secp256r1/prime256v1)
  - `target_private_20.key.pem`: ISO 15118-20용 개인 키 (ECDSA secp521r1 또는 Ed448)
- `root/`: 참조할 루트 인증서 파일들(`.pem`, `.crt`, `.cer`)을 저장하는 폴더입니다.
- `out/`: 스크립트 실행 시 생성되는 출력 파일을 저장하는 폴더입니다.
- `xmlSchema/`: ISO 15118-2 및 XMLDSig 관련 XSD 스키마 파일들이 저장된 폴더입니다.
- `xmlSchema20/`: ISO 15118-20 관련 XSD 스키마 파일들이 저장된 폴더입니다.
  - `V2G_CI_CommonMessages.xsd`: ISO 15118-20 공통 메시지 스키마
  - `V2G_CI_CommonTypes.xsd`: ISO 15118-20 공통 타입 스키마
  - `xmldsig-core-schema.xsd`: XML 디지털 서명 스키마
- `emaid/`: (선택) 우선순위 EMAID 리스트를 저장하는 폴더입니다.
  - `prioritized_emaids.json`: JSON 배열 형식의 EMAID 목록 (ISO 15118-20용)
- `temp/`: 임시 파일들이 저장되는 폴더입니다.
- `V2Gdecoder.jar`: XML-EXI 변환에 사용되는 외부 Java 라이브러리입니다.
- `signature_process_iso15118-2.md`: 표준 ISO 15118-2 서명 생성 과정을 설명하는 문서입니다.

## 사용 방법

### ISO 15118-2 (V2)

**1단계: 필요한 파일 준비**

- `cert/` 폴더에 `oem_prov_cert.pem` 파일을 위치시킵니다.
- `key/` 폴더에 `private_key.pem` 파일을 위치시킵니다.
- `root/` 폴더에 참조할 루트 인증서 파일들을 위치시킵니다.

**2단계: XML 생성 스크립트 실행**

```bash
node generateCertRequestXmlInstallVersion2.js
# 또는
npm run gen-v2
```

- 이 명령은 `certRequest.xml` 파일을 생성합니다. (비표준 서명 포함)
- **중요**: 실제 사용을 위해서는 이 단계에서 생성된 `certRequest.xml`의 `<DigestValue>`와 `<SignatureValue>`를 표준 방식(스키마 기반 EXI 변환 포함)으로 계산된 값으로 교체해야 합니다.

**3단계: 요청 전송 스크립트 실행**

```bash
# 기본 'install' 액션으로 요청 전송
node iso15118CertRequest.js
# 또는
npm run request-v2

# 'update' 액션으로 요청 전송
node iso15118CertRequest.js update
# 또는
npm run request-v2-update
```

- 이 명령은 2단계에서 생성된 `certRequest.xml`을 읽고, EXI 변환 후 서버로 요청을 보냅니다.
- 서버 응답은 `out/response.json` 파일에 저장됩니다.

### ISO 15118-20 (V20)

**1단계: 필요한 파일 준비**

- `cert/` 폴더에 `target_oem_prov_cert_20.pem` 파일을 위치시킵니다. (선택적으로 서브 인증서도 추가)
- `key/` 폴더에 `target_private_20.key.pem` 파일을 위치시킵니다.
- `root/` 폴더에 참조할 루트 인증서 파일들을 위치시킵니다.
- `xmlSchema20/` 폴더에 필요한 XSD 스키마 파일들을 위치시킵니다.
- (선택) `emaid/` 폴더에 `prioritized_emaids.json` 파일을 위치시킵니다.

**2단계: XML 생성 스크립트 실행**

```bash
# 기본 출력 파일명 사용
node generateCertRequestXmlInstallVersion20.js
# 또는
npm run gen-v20

# 사용자 정의 출력 파일명 지정
node generateCertRequestXmlInstallVersion20.js my_cert_request.xml
```

- 이 명령은 지정된 이름 또는 기본값으로 `out/certificateInstallationReq_20.xml` 파일을 생성합니다.
- ISO 15118-20 표준에 따라 올바르게 서명된 XML이 생성됩니다.

**3단계: 요청 전송 스크립트 실행**

```bash
# 기본 설정으로 실행 (기본 XML 파일 사용)
node iso15118_20CertRequest.js
# 또는
npm run request-v20

# 특정 XML 파일 사용
node iso15118_20CertRequest.js --file my_cert_request.xml
```

- 이 명령은 생성된 XML 파일을 직접 서버로 전송합니다.
- 서버 응답은 `out/` 디렉토리에 타임스탬프가 포함된 파일명으로 저장됩니다.

## 스크립트 상세 설명

### `generateCertRequestXmlInstallVersion2.js` (ISO 15118-2)

- 입력: `cert/oem_prov_cert.pem`, `key/private_key.pem`, `root/` 폴더의 인증서들
- 처리:
    - 인증서 정보 읽기 및 추출 (OpenSSL 사용)
    - Session ID 생성
    - `CertificateInstallationReq` XML 구조 생성 (`xmlbuilder2` 사용)
    - (비표준) DigestValue 및 SignatureValue 계산 및 삽입
- 출력: `certRequest.xml`

### `iso15118CertRequest.js` (ISO 15118-2)

- 입력: `certRequest.xml`
- 처리:
    - `certRequest.xml` 읽기
    - XML -> EXI 변환 (`V2Gdecoder.jar` 사용)
    - Base64 인코딩
    - JSON 요청 데이터 생성
    - 서버로 POST 요청 (`node-fetch` 사용)
    - 응답 처리
- 출력: `out/response.json`

### `generateCertRequestXmlInstallVersion20.js` (ISO 15118-20)

- 입력: `cert/target_oem_prov_cert_20.pem`, `key/target_private_20.key.pem`, `root/` 폴더의 인증서들, `xmlSchema20/` 폴더의 스키마 파일들, (선택) `emaid/prioritized_emaids.json`
- 처리:
    - 인증서 분석 및 적합한 서명 알고리즘 자동 선택
    - OEM 인증서 및 서브 인증서 처리
    - 루트 인증서 정보 추출 (OpenSSL 사용)
    - Session ID 생성
    - XML 스키마 기반 EXI 인코딩을 통한 DigestValue 계산
    - SignedInfo 요소의 EXI 인코딩 및 개인 키 서명을 통한 SignatureValue 계산
    - 모든 요소가 포함된 최종 XML 구조 생성
- 출력: `out/certificateInstallationReq_20.xml` 또는 지정된 파일명

### `iso15118_20CertRequest.js` (ISO 15118-20)

- 입력: `out/` 폴더의 XML 파일 (기본: `certificateInstallationReq_20.xml`)
- 처리:
    - 커맨드 라인 인자 파싱 (파일명)
    - XML 파일 읽기
    - JSON 요청 데이터 생성 (XML을 직접 포함)
    - 서버로 POST 요청 (`node-fetch` 사용)
    - 응답 처리
- 출력: `out/response_20_[파일명]_[타임스탬프].json` 