# Response 디렉토리

이 디렉토리는 서버로부터 받은 응답을 처리하고 분석하는 도구들을 포함합니다.

## 구조

```
response/
├── decode/           # 디코딩된 XML 파일들이 저장되는 디렉토리
├── decode-exi.js     # EXI 응답을 디코딩하는 스크립트
└── README.md         # 이 파일
```

## 사용법

### EXI 응답 디코딩

서버로부터 받은 EXI 인코딩된 응답을 XML로 디코딩합니다.

#### 대화형 모드
```bash
node response/decode-exi.js
```

#### 명령줄 모드
```bash
node response/decode-exi.js exi_response_certificateInstallationReq_v20_ecdsa_install_2025-07-22T04-56-25-880Z.json
```

### 기능

- `request/output/` 디렉토리에서 EXI 응답 파일들을 자동으로 찾습니다
- 파일 크기와 수정 날짜를 표시합니다
- EXI 바이너리를 XML로 디코딩합니다
- 디코딩된 XML을 `decode/` 디렉토리에 저장합니다
- XML 내용 미리보기를 제공합니다

### 출력 파일

디코딩된 XML 파일은 `response/decode/` 디렉토리에 저장되며, 파일명은 원본 EXI 응답 파일명에서 확장자만 `.xml`로 변경됩니다.

## Response XML 검증

디코딩된 XML 파일의 SessionID, DigestValue, SignatureValue를 검증합니다.

### 사용법

#### 대화형 모드
```bash
node response/validate-response.js
```

#### 명령줄 모드
```bash
node response/validate-response.js exi_response_certificateInstallationReq_v20_ed448_install_2025-07-22T05-43-00-232Z.xml
```

### 검증 항목

1. **SessionID 검증**:
   - 16자리 16진수 문자열인지 확인
   - XSD 스키마에 따른 8바이트 hexBinary 형식 검증

2. **DigestValue 검증**:
   - SignedInstallationData를 EXI로 인코딩
   - 지정된 해시 알고리즘(SHA512/SHAKE256)으로 해시 계산
   - 응답의 DigestValue와 비교

3. **SignatureValue 검증**:
   - SignedInfo를 EXI로 인코딩
   - 서명 알고리즘(ECDSA/Ed448) 확인
   - (참고: 실제 서명 검증은 공개키가 필요하므로 EXI 인코딩만 확인)

### 지원하는 알고리즘

- **해시 알고리즘**: SHA512, SHAKE256
- **서명 알고리즘**: ECDSA, Ed448 