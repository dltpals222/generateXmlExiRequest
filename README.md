# ISO 15118 인증서 생성 및 전송 도구

**ISO 15118-2 및 ISO 15118-20 표준**에 따른 인증서 요청/응답 XML을 생성하고 요청을 서버로 전송하는 완전한 Node.js 도구입니다.

## 주요 특징

- **완전 독립적 작동**: 최상위 폴더에서 모든 기능 제공
- **두 가지 표준 지원**: ISO 15118-2와 ISO 15118-20
- **요청/응답 XML 생성**: CertificateInstallationReq/Res 모두 지원
- **요청 파일 서버 전송**: ISO 15118-20 표준 EXI 인코딩으로 서버 전송
- **자동 서명 생성**: DigestValue 및 SignatureValue 자동 계산
- **알고리즘 자동 감지**: ECDSA, Ed448 알고리즘 자동 선택
- **암호화 키 생성**: 실제 ECDH 키 및 암호화된 개인 키 생성
- **버전별 파일 분리**: v2와 v20 폴더로 깔끔한 관리
- **충돌 방지 출력**: 버전별 다른 출력 파일명

## 시스템 요구사항

- **Node.js** >= 14.0.0
- **Java Runtime Environment** (exi_processor.jar 실행용)
- **OpenSSL** (시스템 PATH에 설정)

## 설치

```bash
npm install
```

## 사용법

### ISO 15118-2 XML 생성

```bash
# Install 메시지 생성
npm run gen-v2-install

# Update 메시지 생성  
npm run gen-v2-update

# 또는 직접 실행
node gen-v2.js install
node gen-v2.js update
```

**출력**: `out/certificateInstallationReq_v2.xml` 또는 `out/certificateUpdateReq_v2.xml`

### ISO 15118-20 XML 생성

#### 요청 (Request) 생성

```bash
# 알고리즘별 요청 생성
npm run gen-v20-ecdsa-req    # ECDSA 알고리즘 요청
npm run gen-v20-ed448-req    # Ed448 알고리즘 요청
npm run gen-v20-auto-req     # 자동 감지 요청

# 직접 실행
node gen-v20.js req ecdsa
node gen-v20.js req ed448
node gen-v20.js req auto
```

#### 응답 (Response) 생성 - 테스트용

```bash
# 알고리즘별 응답 생성 (서버 개발/테스트용)
npm run gen-v20-ecdsa-res    # ECDSA 알고리즘 응답
npm run gen-v20-ed448-res    # Ed448 알고리즘 응답
npm run gen-v20-auto-res     # 자동 감지 응답

# 직접 실행
node gen-v20.js res ecdsa
node gen-v20.js res ed448
node gen-v20.js res auto
```

**출력**: 
- 요청: `out/certificateInstallationReq_v20_ecdsa.xml`
- 응답: `out/certificateInstallationRes_v20_ecdsa.xml` (서버 개발/테스트용)

### 요청 파일 서버 전송

> **참고**: 응답(Response) 파일은 서버에서 생성하여 클라이언트에게 전송하는 것이므로, 클라이언트에서 서버로 응답을 전송하지 않습니다. 요청(Request) 파일만 서버로 전송합니다.

#### 기본 JSON 래핑 전송

```bash
# npm 스크립트 사용
npm run send-xml                    # 도움말
npm run send-ecdsa-req              # ECDSA 요청 전송
npm run send-ed448-req              # Ed448 요청 전송

# 직접 실행
node request/send-xml.js <요청XML파일명> [엔드포인트] [호스트] [포트]
```

#### EXI 인코딩 전송 (ISO 15118-20 표준)

```bash
# npm 스크립트 사용
npm run send-exi                    # 기본 EXI 전송
npm run send-exi-ecdsa              # ECDSA 요청을 EXI로 전송
npm run send-exi-ed448              # Ed448 요청을 EXI로 전송
npm run send-exi-help               # EXI 전송 도움말

# 직접 실행
node request/send-xml-exi.js --file <요청XML파일명> --action <install|update> --host <호스트> --port <포트>
```

## 프로젝트 구조

```
gen_xml/
├── cert/
│   ├── v2/                    # ISO 15118-2용 인증서
│   │   ├── oem_cert.pem       # OEM 프로비저닝 인증서 (Install용)
│   │   ├── target_contract_cert.pem  # 계약 인증서 (Update용)
│   │   ├── sub/               # Install용 서브 인증서들 (최대 4개)
│   │   └── contract_sub/      # Update용 서브 인증서들 (최대 4개)
│   └── v20/                   # ISO 15118-20용 인증서
│       ├── oem_cert.pem       # OEM 인증서 (auto)
│       ├── oem_cert_ecdsa.pem # OEM 인증서 (ecdsa)
│       ├── oem_cert_ed448.pem # OEM 인증서 (ed448)
│       ├── sub/               # 서브 인증서들 (auto, 최대 3개)
│       ├── sub_ecdsa/         # 서브 인증서들 (ecdsa, 최대 3개)
│       └── sub_ed448/         # 서브 인증서들 (ed448, 최대 3개)
├── key/
│   ├── v2/                    # ISO 15118-2용 키
│   │   ├── oem_private_key.pem      # OEM 개인 키 (Install용)
│   │   └── contract_private_key.pem # 계약 개인 키 (Update용)
│   └── v20/                   # ISO 15118-20용 키
│       ├── oem_private_key.pem      # OEM 개인 키 (auto)
│       ├── oem_private_key_ecdsa.pem # OEM 개인 키 (ecdsa)
│       └── oem_private_key_ed448.pem # OEM 개인 키 (ed448)
├── emaid/
│   ├── v2/                    # ISO 15118-2용 EMAID
│   │   └── contract_emaid.json
│   └── v20/                   # ISO 15118-20용 EMAID
│       └── prioritized_emaids.json
├── root/                      # 루트 인증서들
├── xmlSchema/                 # ISO 15118-2 XML 스키마
├── xmlSchema20/               # ISO 15118-20 XML 스키마
├── out/                       # 출력 폴더
├── request/                   # 요청 파일 전송 도구
│   ├── send-xml.js            # 기본 JSON 래핑 전송
│   ├── send-xml-exi.js        # EXI 인코딩 전송
│   ├── ExiProcessor.js        # EXI 처리 클래스
│   ├── output/                # 전송 결과 저장 폴더
│   └── README.md              # 전송 도구 상세 가이드
├── gen-v2.js                  # ISO 15118-2 생성기
├── gen-v20.js                 # ISO 15118-20 생성기
├── exi_processor.jar          # EXI 변환 도구 (ISO 15118-20용)
├── V2Gdecoder.jar             # EXI 변환 도구 (ISO 15118-2용)
└── package.json
```

## 지원되는 암호화 알고리즘

### ISO 15118-2
- **ECDSA-SHA256** (secp256r1/prime256v1)

### ISO 15118-20
- **ECDSA-SHA512** (secp521r1) - ECDSA 알고리즘
- **Ed448-SHAKE256** (Ed448) - Ed448 알고리즘

## 출력 파일

### ISO 15118-2
- `out/certificateInstallationReq_v2.xml` - Install 메시지
- `out/certificateUpdateReq_v2.xml` - Update 메시지

### ISO 15118-20
#### 요청 (Request) - 서버로 전송
- `out/certificateInstallationReq_v20_ecdsa.xml` - ECDSA 알고리즘 요청
- `out/certificateInstallationReq_v20_ed448.xml` - Ed448 알고리즘 요청
- `out/certificateInstallationReq_v20_auto.xml` - 자동 감지 모드 요청

#### 응답 (Response) - 서버 개발/테스트용
- `out/certificateInstallationRes_v20_ecdsa.xml` - ECDSA 알고리즘 응답
- `out/certificateInstallationRes_v20_ed448.xml` - Ed448 알고리즘 응답
- `out/certificateInstallationRes_v20_auto.xml` - 자동 감지 모드 응답

## CertificateInstallationRes 응답 생성 특징

> **참고**: 응답 파일은 주로 서버 개발이나 테스트 목적으로 생성됩니다. 실제 운영 환경에서는 서버가 응답을 생성하여 클라이언트에게 전송합니다.

### 자동 생성되는 요소들
- **SessionID**: 랜덤 16자리 16진수
- **TimeStamp**: 현재 유닉스 타임스탬프
- **CPSCertificateChain**: 기존 OEM 인증서 체인 사용
- **ECDH 키 쌍**: 알고리즘별 실제 암호화 키 생성
  - ECDSA: SECP521 곡선 (133바이트 공개키)
  - Ed448: X448 곡선 (68바이트 공개키)
- **암호화된 개인 키**: 랜덤 생성
  - SECP521: 94바이트
  - X448: 84바이트
- **디지털 서명**: EXI 정규화 방식으로 실제 서명 생성

### 사용자 입력 요소들
실행 시 대화형으로 입력:
- **ResponseCode**: OK, Failed, Failed_CertChainError 등
- **EVSEProcessing**: Ongoing, Finished
- **RemainingContractCertificateChains**: 숫자 (0-255)

## 전송 도구 기능

### 기본 JSON 래핑 전송 (send-xml.js)
- 요청 XML을 JSON으로 래핑하여 전송
- 메시지 타입, 알고리즘, 버전 자동 감지
- 구조화된 응답 저장

### EXI 인코딩 전송 (send-xml-exi.js)
- ISO 15118-20 표준에 맞는 EXI 인코딩
- `exi_processor.jar`를 사용한 정확한 EXI 변환
- Base64 인코딩으로 서버 전송
- 디버깅용 파일 자동 저장

**전송 데이터 구조:**
```json
{
  "iso15118SchemaVersion": "urn:iso:std:iso:15118:-20:CommonMessages",
  "action": "install|update",
  "exiRequest": "base64EncodedEXIData..."
}
```

## 필요한 파일 준비

### ISO 15118-2용 파일들
```
cert/v2/
├── oem_cert.pem                  # OEM 프로비저닝 인증서 (Install용)
├── target_contract_cert.pem      # 계약 인증서 (Update용)
├── sub/                          # Install용 서브 인증서들 (최대 4개)
│   ├── sub_cert1.pem
│   ├── sub_cert2.pem
│   ├── sub_cert3.pem
│   └── sub_cert4.pem
└── contract_sub/                 # Update용 서브 인증서들 (최대 4개)
    ├── contract_sub_cert1.pem
    ├── contract_sub_cert2.pem
    ├── contract_sub_cert3.pem
    └── contract_sub_cert4.pem

key/v2/
├── oem_private_key.pem           # OEM 개인 키 (Install용)
└── contract_private_key.pem      # 계약 개인 키 (Update용)

emaid/v2/
└── contract_emaid.json           # EMAID 정보 (Update용)
```

### ISO 15118-20용 파일들
```
cert/v20/
├── oem_cert.pem                  # OEM 프로비저닝 인증서 (auto)
├── oem_cert_ecdsa.pem            # OEM 프로비저닝 인증서 (ecdsa)
├── oem_cert_ed448.pem            # OEM 프로비저닝 인증서 (ed448)
├── sub/                          # 서브 인증서들 (auto, 최대 3개)
│   ├── sub_cert1.pem
│   ├── sub_cert2.pem
│   └── sub_cert3.pem
├── sub_ecdsa/                    # 서브 인증서들 (ecdsa, 최대 3개)
│   ├── sub_cert1.pem
│   ├── sub_cert2.pem
│   └── sub_cert3.pem
└── sub_ed448/                    # 서브 인증서들 (ed448, 최대 3개)
    ├── sub_cert1.pem
    ├── sub_cert2.pem
    └── sub_cert3.pem

key/v20/
├── oem_private_key.pem           # OEM 개인 키 (auto)
├── oem_private_key_ecdsa.pem     # OEM 개인 키 (ecdsa)
└── oem_private_key_ed448.pem     # OEM 개인 키 (ed448)

emaid/v20/
└── prioritized_emaids.json       # EMAID 리스트 (선택사항)
```

### EMAID 리스트 형식 예시
```json
[
  "KRLWSCBSZ0TUKY3",
  "KRLWSCJ8UM69O56"
]
```

## 실행 예시

### ISO 15118-20 응답 생성 예시 (서버 개발/테스트용)
```bash
$ npm run gen-v20-ecdsa-res
🚀 ISO 15118-20 CertificateInstallationRes 생성 시작... [ECDSA]
  📂 출력 파일: out/certificateInstallationRes_v20_ecdsa.xml

[1/8] 사용자 입력 받기...
? ResponseCode를 선택하세요: OK
? EVSE 처리 상태를 선택하세요: Finished
? 남은 계약 인증서 체인 수를 입력하세요 (0-255): 3

[2/8] 데이터 준비 중...
  감지된 알고리즘: ECDSA-SHA512 (ECDSA)
  세션 ID: A1B2C3D4E5F6G7H8

[3/8] 암호화 키 생성 중...
  ECDH 키 쌍 생성 완료 (SECP521, 133바이트 공개키)
  암호화된 개인 키 생성 완료 (94바이트)

[4/8] SignedInstallationData 생성 중...
  OEM 인증서 체인 로드 완료
  계약 인증서 체인 생성 완료

[5/8] DigestValue 계산 중...
  [EXI] OEMProvisioningCertificateChain 인코딩 중...
  DigestValue 계산 완료: j74ToYTw6ryIpdwd...

[6/8] SignatureValue 계산 중...
  [EXI] SignedInfo 인코딩 중...
  SignatureValue 계산 완료: MIGIAkIBMUU+8SEO...

[7/8] 최종 XML 생성 및 저장 중...
  XML 파일 저장 완료

[8/8] 생성 완료!
🎉 ISO 15118-20 CertificateInstallationRes 생성이 완료되었습니다!
📄 출력 파일: out/certificateInstallationRes_v20_ecdsa.xml
```

### 요청 파일 EXI 전송 예시
```bash
$ npm run send-exi-ecdsa
🚀 EXI 인코딩 XML 요청 전송 시작...
  📄 XML 파일: certificateInstallationReq_v20_ecdsa.xml
  🎯 액션: install
  🌐 서버: localhost:7600

✅ XML 내용 읽기 완료 (5584 bytes)
🔧 EXI 프로세서 초기화 중...
✓ 클래스 로드 성공: com.lw.exiConvert.XmlEncode
✓ 클래스 로드 성공: com.lw.exiConvert.XmlDecode
✅ EXI 프로세서 초기화 완료

🔄 XML을 EXI로 인코딩 중...
✅ EXI 인코딩 완료, Base64 크기: 3732

📤 서버에 요청 전송 중: http://localhost:7600/api/contract-cert/ISO15118CertReq
📊 서버 응답 상태 코드: 200
✅ 요청 처리 성공
🎉 요청 처리 성공적으로 완료!
```

## 의존성 모듈

```json
{
  "dependencies": {
    "java": "^0.16.1",           // Java 연동 (EXI 처리용)
    "libxmljs2": "^0.31.0",      // XML 파싱
    "xmlbuilder2": "^3.1.1",     // XML 생성
    "node-fetch": "^3.3.2"       // HTTP 요청 (전송용)
  }
}
```

## 주의사항

1. **인증서 파일 준비**: 실행 전 필요한 인증서와 키 파일들을 해당 버전 폴더에 위치시켜야 합니다.
2. **Java 환경**: exi_processor.jar 실행을 위해 Java 8 이상이 설치되어 있어야 합니다.
3. **OpenSSL**: 인증서 정보 추출을 위해 OpenSSL이 PATH에 설정되어 있어야 합니다.
4. **표준 준수**: 생성된 XML의 서명은 각 표준의 요구사항에 따라 계산됩니다.
5. **서브 인증서**: 
   - ISO 15118-2: 최대 4개까지 지원 (XSD 제한)
   - ISO 15118-20: 최대 3개까지 지원 (XSD 제한)
   - 서브 인증서가 없으면 XML에 포함하지 않습니다.
6. **네임스페이스**: ISO 15118-20에서 디지털 서명 네임스페이스는 `sig`를 사용합니다.
7. **요청만 전송**: 응답(Response) 파일은 서버가 생성하므로 클라이언트에서 전송하지 않습니다.

## 문제 해결

### 일반적인 오류들

**"Java 실행 실패"**
- Java Runtime Environment가 설치되어 있는지 확인
- `java -version` 명령으로 Java 설치 확인

**"EXI 클래스 로드 실패"**
- `exi_processor.jar` 파일이 프로젝트 루트에 있는지 확인
- Java 버전이 호환되는지 확인 (Java 8 이상 권장)

**"OpenSSL 명령을 찾을 수 없음"**
- OpenSSL이 설치되어 있는지 확인
- 시스템 PATH에 OpenSSL이 포함되어 있는지 확인

**"인증서 파일을 찾을 수 없음"**
- 해당 버전 폴더에 올바른 파일명으로 인증서가 있는지 확인
- 파일 권한 확인

**"서버 연결 실패"**
- 서버가 실행 중인지 확인
- 호스트/포트 설정이 올바른지 확인
- 방화벽 설정 확인

**"node-fetch 모듈 없음"**
- `npm install node-fetch` 실행
- package.json의 dependencies 확인

## 기술 문서

더 자세한 기술 정보는 다음 문서들을 참조하세요:

📖 **[기술 상세 가이드](TECHNICAL_GUIDE.md)** - EXI 변환, 서명 알고리즘, XML 구조 등 상세 기술 정보

📖 **[전송 도구 가이드](request/README.md)** - 요청 파일 전송 도구 상세 사용법 및 API 문서

---

**팁**: 생성된 요청 XML 파일은 각 표준에 따라 적절히 서명되어 있으며, 즉시 서버로 전송 가능합니다. 응답 파일은 서버 개발이나 테스트 목적으로만 사용하세요. EXI 전송 기능을 통해 ISO 15118-20 표준에 맞는 정확한 형식으로 서버와 통신할 수 있습니다.