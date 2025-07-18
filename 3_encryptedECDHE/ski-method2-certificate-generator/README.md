# RFC 5280 SKI Method 2 Certificate Generator

이 도구는 RFC 5280 표준의 Subject Key Identifier (SKI) Method 2를 사용하여 X.509 인증서를 생성합니다.

## SKI Method 2란?

RFC 5280 Section 4.2.1.2에 정의된 두 번째 방법:
- 4비트 타입 필드 값 `0100` (바이너리)
- SHA-1 해시의 최하위 60비트를 결합
- 총 64비트 (8바이트)의 Key Identifier 생성

## 기능

- SECP521R1 및 Ed448 키 타입 지원 (현재 RSA로 fallback)
- 지정된 CA로 인증서 서명
- 랜덤 파일명으로 인증서와 키 저장
- JSON 형식의 생성 보고서

## 사용법

### 1. 직접 실행
```bash
cd ski-method2-certificate-generator
node ski-method2-cert-generator.js
```

### 2. 모듈로 사용
```javascript
const certGenerator = require('./ski-method2-cert-generator');

// 단일 인증서 생성
const result = certGenerator.createCertificateWithSKIMethod2(
    '/path/to/ca.key',
    '/path/to/ca.pem',
    'EXAMPLE_CN',
    'secp521r1',
    './output'
);

// 전체 배치 실행
certGenerator.main();
```

## 설정

### CA 인증서 경로
- `../CA/eMSP_SubCA_2_Secp521r1.pem` 및 `.key`
- `../CA/eMSP_SubCA_2_Ed448.pem` 및 `.key`

### 생성될 인증서 정보
- **Subject DN**: `C=KR, O=testOrg, CN=[지정된값]`
- **유효기간**: 1년
- **CN 값**: `KRLWPC7CAX69WE0`, `KRLWSCF1G544XK2`

## 출력

### 파일 구조
```
generated-certificates/
├── cert_[랜덤].pem     # 인증서
├── cert_[랜덤].key     # 개인키
├── ...
└── certificate-report.json  # 생성 보고서
```

### 보고서 예시
```json
{
  "generated": "2024-01-15T10:30:00.000Z",
  "method": "RFC 5280 SKI Method 2 (4-bit type field 0100 + 60-bit SHA-1)",
  "certificates": [
    {
      "type": "secp521r1",
      "cn": "KRLWPC7CAX69WE0",
      "certPath": "./generated-certificates/cert_abc123.pem",
      "keyPath": "./generated-certificates/cert_abc123.key",
      "serialNumber": "...",
      "ski": "4ABCDEF012345678"
    }
  ]
}
```

## 기술적 구현

### SKI Method 2 계산 과정
1. 공개키를 DER 형식으로 변환
2. SubjectPublicKey BIT STRING 추출
3. SHA-1 해시 계산
4. 최하위 60비트 + 4비트 타입 필드 결합

### 확장 필드
- Basic Constraints (non-CA)
- Key Usage (디지털 서명, 키 암호화 등)
- Subject Key Identifier (Method 2)
- Authority Key Identifier
- Subject Alternative Name

## 제한사항

- node-forge 라이브러리 한계로 인해 SECP521R1/Ed448 대신 RSA 2048비트 사용
- 실제 타원곡선 암호화를 원한다면 다른 라이브러리(예: @peculiar/x509) 고려 필요

## 의존성

- node-forge: X.509 인증서 생성
- crypto (내장): 암호화 기능
- fs, path (내장): 파일 시스템 접근 