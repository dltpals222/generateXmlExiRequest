# V2G 개인키 암호화 구현

V2G (Vehicle-to-Grid) 통신 표준에 따른 **TPM 2.0이 없는 EVCC를 위한 계약 인증서 개인키 암호화/복호화** 구현입니다.

## 📋 지원하는 표준

- **V2G20-2497**: SECP521R1 (521비트) 개인키 암호화
- **V2G20-2500**: X448 (448비트) 개인키 암호화
- **V2G20-2492**: AAD (Additional Authenticated Data) 계산
- **NIST SP 800-38D**: AES-GCM-256 인증 암호화

## 🏗️ 구조

```
├── package.json              # 프로젝트 설정
├── common.js                 # 공통 암호화 함수들
├── secp521r1-encryption.js   # SECP521R1 암호화 구현
├── x448-encryption.js        # X448 암호화 구현
├── test.js                   # 테스트 코드
└── README.md                 # 이 파일
```

## 🚀 설치 및 실행

```bash
# 의존성 설치
npm install

# 테스트 실행
npm test
```

## 📊 주요 기능

### SECP521R1 (521비트) 암호화
- ✅ 521비트 → 528비트 패딩 (7비트 zero padding)
- ✅ AES-GCM-256 인증 암호화
- ✅ ECDHE 키 교환
- ✅ 개인키 유효성 검증
- ✅ 보안 메모리 정리

### X448 (448비트) 암호화
- ✅ 바이트 정렬된 448비트 키 (패딩 불필요)
- ✅ AES-GCM-256 인증 암호화
- ✅ ECDHE 키 교환
- ✅ DHPublicKey 포맷 (패딩 없음)
- ✅ 개인키 유효성 검증

### 공통 기능
- ✅ AAD 계산 (PCID + SKI)
- ✅ HKDF 세션 키 유도
- ✅ 96비트 랜덤 IV 생성
- ✅ 128비트 인증 태그

## 💻 사용 예시

### SECP521R1 암호화

```javascript
const SECP521R1PrivateKeyEncryption = require('./secp521r1-encryption');

const encryption = new SECP521R1PrivateKeyEncryption();

// 송신자 (SA/eMSP) 측
const result = encryption.senderEncrypt(
    contractPrivateKey,    // 521비트 계약 개인키
    receiverPublicKey,     // 수신자 ECDHE 공개키
    'ABCD1234567890EFGH',  // PCID (18바이트)
    'A1B2C3D4E5F67081...'  // SKI (32 hex 문자)
);

// 수신자 (EVCC) 측
const decryptedKey = encryption.receiverDecrypt(
    result.encryptedPrivateKey,  // 암호화된 개인키
    result.senderPublicKey,      // 송신자 ECDHE 공개키
    receiverPrivateKey,          // 수신자 ECDHE 개인키
    'ABCD1234567890EFGH',        // PCID
    'A1B2C3D4E5F67081...',       // SKI
    contractPublicKey            // 검증용 계약 공개키
);
```

### X448 암호화

```javascript
const X448PrivateKeyEncryption = require('./x448-encryption');

const encryption = new X448PrivateKeyEncryption();

// 사용법은 SECP521R1과 동일
const result = encryption.senderEncrypt(
    contractPrivateKey,    // 448비트 계약 개인키
    receiverPublicKey,     // 수신자 ECDHE 공개키
    pcid, ski
);
```

## 🔒 보안 특징

1. **Forward Secrecy**: ECDHE로 세션별 고유 암호화
2. **Authenticated Encryption**: AES-GCM으로 기밀성+무결성 보장
3. **Key Validation**: 수학적 유효성 검증
4. **Secure Cleanup**: 사용 후 민감 정보 완전 삭제
5. **Padding Attack Prevention**: 521비트 키의 패딩 검증

## 📏 데이터 구조

### SECP521_EncryptedPrivateKey (94바이트)
```
[12바이트 IV][66바이트 암호문][16바이트 인증태그]
```

### X448_EncryptedPrivateKey (84바이트)
```
[12바이트 IV][56바이트 암호문][16바이트 인증태그]
```

### AAD (34바이트)
```
[18바이트 PCID][16바이트 SKI]
```

## 🧪 테스트

테스트는 다음을 검증합니다:

- ✅ AAD 계산 정확성
- ✅ 521비트/448비트 키 암호화/복호화
- ✅ ECDHE 키 교환
- ✅ 패딩 메커니즘
- ✅ 키 유효성 검증
- ✅ 에러 케이스 처리

```bash
npm test
```

## 📚 참조 표준

- ISO 15118-20 (V2G Communication Protocol)
- NIST Special Publication 800-38D (AES-GCM)
- RFC 5869 (HKDF)
- RFC 7748 (Elliptic Curves X25519 and X448)

## ⚠️ 주의사항

- 이 구현은 교육/테스트 목적입니다
- 프로덕션 환경에서는 추가 보안 검토가 필요합니다
- 키 저장과 인증서 관리는 별도 구현이 필요합니다
- 실제 V2G 통신에는 전체 프로토콜 스택이 필요합니다 