# 🔒 V2G Private Key Encryption 테스트 가이드

## 📊 테스트 결과 해석 방법

### 1. AAD 계산 테스트
```
=== AAD Calculation Test ===
Input PCID: "ABCD1234567890EFGH" (18 bytes)
Input SKI: "A1B2C3D4E5F6708192A3B4C5D6E7F801" (32 hex chars = 16 bytes)
AAD Length: 34 bytes
AAD Hex: 414243443132333435363738393045464748A1B2C3D4E5F6708192A3B4C5D6E7F801
✅ PASS AAD calculation
```

**해석:**
- **PCID**: 18바이트 문자열 (CertificateInstallationReq에서 받은 값)
- **SKI**: 16바이트 hex 문자열 (계약 인증서의 Subject Key Identifier)
- **AAD**: PCID + SKI = 34바이트 (추가 인증 데이터)
- **✅ PASS**: AAD 계산이 V2G20 표준에 맞게 정확히 수행됨

### 2. SECP521R1 (521-bit) 테스트
```
=== SECP521R1 (521-bit) Private Key Encryption Test ===

1. Generating contract certificate key pair...
   Contract Private Key: 66 bytes    # 521비트 = 66바이트 (7비트 패딩 포함)
   Contract Public Key: 133 bytes    # SECP521r1 공개키 크기

3. Sender encrypting private key...
   Encrypted Private Key: 94 bytes   # [12 IV][66 ciphertext][16 tag]
   Structure: [12 IV][66 ciphertext][16 tag] = 94 total

5. Verification...
✅ PASS Private key encryption/decryption  # 암호화/복호화 성공
```

**중요한 구조:**
- **94바이트 = 12(IV) + 66(암호문) + 16(인증태그)**
- **V2G20 표준 준수**: SECP521_EncryptedPrivateKey 형식

### 3. X448 (448-bit) 테스트
```
=== X448 (448-bit) Private Key Encryption Test ===

3. Sender encrypting private key...
   Encrypted Private Key: 84 bytes   # [12 IV][56 ciphertext][16 tag]
   Structure: [12 IV][56 ciphertext][16 tag] = 84 total
```

**중요한 구조:**
- **84바이트 = 12(IV) + 56(암호문) + 16(인증태그)**
- **V2G20 표준 준수**: X448_EncryptedPrivateKey 형식

## 🛠️ 실제 사용법 및 커스터마이징

### 1. 테스트 데이터 변경하기

`test.js` 파일의 `generateTestData()` 함수를 수정:

```javascript
function generateTestData() {
    return {
        // 여기서 원하는 값으로 변경하세요!
        pcid: 'YOUR_PCID_18_CHARS',  // 18자 정확히
        ski: 'YOUR_32_HEX_CHARS_SKI' // 32 hex 문자 (16바이트)
    };
}
```

### 2. 실제 키 사용하기

#### SECP521R1 사용 예제:
```javascript
const SECP521R1PrivateKeyEncryption = require('./secp521r1-encryption');

async function useRealKeys() {
    const encryption = new SECP521R1PrivateKeyEncryption();
    
    // 실제 값들을 여기에 입력
    const realContractPrivateKey = Buffer.from('YOUR_66_BYTE_PRIVATE_KEY_HEX', 'hex');
    const realReceiverPublicKey = Buffer.from('YOUR_133_BYTE_PUBLIC_KEY_HEX', 'hex');
    const realPCID = 'YOUR_REAL_PCID_VALUE';  // 18자
    const realSKI = 'YOUR_REAL_SKI_VALUE';    // 32 hex 문자
    
    // 암호화
    const result = encryption.senderEncrypt(
        realContractPrivateKey,
        realReceiverPublicKey,
        realPCID,
        realSKI
    );
    
    console.log('Encrypted Private Key:', result.encryptedPrivateKey.toString('hex'));
    console.log('Sender Public Key:', result.senderPublicKey.toString('hex'));
}
```

### 3. 개별 테스트 실행하기

특정 부분만 테스트하려면 `test.js`에서 해당 함수만 호출:

```javascript
// AAD만 테스트
testAADCalculation();

// SECP521R1만 테스트  
testSECP521R1Encryption();

// X448만 테스트
testX448Encryption();
```

## 🔍 디버그 정보 이해하기

### 암호화 과정 디버그:
```
Debug: Original key first byte: 0x0
Debug: Keystream first 16 bytes: 487c25e2...
Debug: Plaintext first 16 bytes: 001ade61...
Debug: Ciphertext first 16 bytes: 4866fb83...
```

**의미:**
- **Original key first byte**: 원본 키의 첫 바이트 (패딩 확인용)
- **Keystream**: AES-GCM 키스트림 (암호화용)
- **Plaintext**: 암호화할 원본 데이터
- **Ciphertext**: 암호화된 결과

### 복호화 검증:
```
Debug: Decrypt keystream first 16 bytes: 487c25e2...
Debug: Decrypt ciphertext first 16 bytes: 4866fb83...
Debug: Decrypt plaintext first 16 bytes: 001ade61...
```

**키포인트**: **암호화와 복호화의 키스트림이 동일**하면 정상!

## ⚙️ 설정 변경 가능한 값들

### 1. `common.js`에서 변경 가능:
```javascript
// 세션 키 유도 정보 변경
function deriveSessionKey(sharedSecret, info = 'V2G-SessionKey') {
    // 'V2G-SessionKey'를 원하는 문자열로 변경 가능
}

// IV 길이 변경 (표준은 12바이트)
function generateRandomIV() {
    return crypto.randomBytes(12); // 12를 다른 값으로 변경 가능 (비추천)
}
```

### 2. 키 길이 검증 변경:
```javascript
// secp521r1-encryption.js에서
if (privateKey.length !== 66) {
    // 66을 다른 값으로 변경하면 다른 길이 키 지원
    throw new Error(`Private key must be 66 bytes (got ${privateKey.length} bytes)`);
}
```

## 🚨 주의사항

### ❌ 변경하면 안 되는 값들:
- **암호화된 키 구조**: [12 IV][암호문][16 tag]
- **AAD 계산 방식**: PCID + SKI
- **AES-GCM-256 알고리즘**
- **ECDHE 키 교환 방식**

### ✅ 변경 가능한 값들:
- **테스트 PCID/SKI 값**
- **실제 계약 인증서 키**
- **디버그 출력 레벨**
- **에러 메시지 문구**

## 🔧 문제 해결

### 테스트 실패 시:
1. **키 길이 확인**: SECP521R1(66바이트), X448(56바이트)
2. **PCID 길이**: 정확히 18자
3. **SKI 형식**: 32개 hex 문자 (대문자)
4. **Node.js 버전**: v12 이상 권장

### 실제 운영 시:
1. **실제 키 데이터로 교체**
2. **디버그 로그 제거** (보안상)
3. **에러 처리 강화**
4. **키 검증 로직 활성화** 