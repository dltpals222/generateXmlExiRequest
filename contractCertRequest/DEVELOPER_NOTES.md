# Node.js 네이티브 애드온 개발 가이드 (`cbV2G` C 라이브러리 사용)

이 문서는 `contractCertRequest/c` 폴더에 있는 `cbV2G` C 라이브러리를 Node.js 환경에서 사용하기 위한 네이티브 애드온(Native Addon) 개발 방법을 안내합니다.

## 개요

C 라이브러리 코드는 직접 Node.js에서 사용할 수 없으므로, C++ 래퍼(Wrapper)를 작성하고 `node-gyp` 및 N-API를 사용하여 Node.js가 로드할 수 있는 네이티브 모듈(`.node` 파일)을 생성해야 합니다.

## 1. 사전 준비 (Prerequisites)

네이티브 애드온을 빌드하기 위해 다음 도구들이 필요합니다:

*   **Node.js 및 npm**: 최신 LTS 버전 권장.
*   **C++ 컴파일러**: 
    *   Windows: Visual Studio (Build Tools 포함) 설치 (C++ 데스크톱 개발 워크로드 선택).
    *   macOS: Xcode Command Line Tools (`xcode-select --install` 실행).
    *   Linux: `build-essential` 패키지 (`sudo apt-get install build-essential` 또는 배포판에 맞는 명령 사용).
*   **Python**: Node-gyp이 빌드 과정에서 사용 (버전 3.x 권장).
*   **`node-gyp`**: 전역으로 설치합니다.
    ```bash
    npm install -g node-gyp
    ```
*   **`node-addon-api`**: 프로젝트의 개발 의존성으로 추가합니다.
    ```bash
    # 프로젝트 루트에서 실행
    npm install --save-dev node-addon-api
    ```

## 2. 개발 단계

### 2.1. 프로젝트 구조

프로젝트 루트(`ocpp_certificate_test`)에 다음과 같은 구조를 고려할 수 있습니다:

```
. 
├── contractCertRequest/
│   ├── c/             # 원본 C 라이브러리 소스
│   └── DEVELOPER_NOTES.md # 이 파일 (contractCertRequest 내부)
├── native_src/          # C++ 래퍼 코드 폴더
│   └── wrapper.cpp
├── build/             # 빌드 결과물 폴더 (자동 생성)
├── node_modules/
├── package.json
├── binding.gyp        # 빌드 설정 파일
└── README.md          # 프로젝트 루트 README
```

### 2.2. `binding.gyp` 파일 작성

프로젝트 루트에 `binding.gyp` 파일을 생성하고 빌드 설정을 정의합니다. 이 설정은 컴파일할 소스 파일, 필요한 헤더 파일 경로, N-API 연동 등을 지정합니다.

```json
{
  "targets": [
    {
      "target_name": "cbv2g_addon",
      "sources": [
        "native_src/wrapper.cpp",
        # cbV2G 라이브러리 C 소스 파일들 (모두 나열)
        "contractCertRequest/c/common/exi_bitstream.c",
        "contractCertRequest/c/common/exi_header.c",
        # ... (이전 답변에서 제공된 전체 소스 파일 목록) ...
        "contractCertRequest/c/iso-20/iso20_ACDP_Decoder.c"
      ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")",
        "contractCertRequest/c/common",
        "contractCertRequest/c/v2gtp",
        "contractCertRequest/c/appHandshake",
        "contractCertRequest/c/din",
        "contractCertRequest/c/iso-2",
        "contractCertRequest/c/iso-20"
      ],
      "defines": [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
      'cflags!': [ '-fno-exceptions' ], 
      'cflags_cc!': [ '-fno-exceptions' ],
      'xcode_settings': {
        'GCC_ENABLE_CPP_EXCEPTIONS': 'NO',
        'CLANG_CXX_LIBRARY': 'libc++',
        'MACOSX_DEPLOYMENT_TARGET': '10.7',
      },
      'msvs_settings': {
        'VCCLCompilerTool': { 'ExceptionHandling': 1 },
      }
    }
  ]
}
```
*(주: `sources` 목록에 모든 C 소스 파일 경로를 정확히 기재해야 합니다.)*

### 2.3. C++ 래퍼 코드 작성 (`native_src/wrapper.cpp`)

N-API를 사용하여 JavaScript와 C 라이브러리 간의 인터페이스 역할을 하는 C++ 코드를 작성합니다. 주요 책임은 다음과 같습니다:

*   **데이터 변환**: JavaScript 객체/버퍼와 C 구조체/기본 타입 간의 상호 변환.
*   **함수 호출**: 변환된 데이터로 C 라이브러리 함수(`encode_*`, `decode_*`) 호출.
*   **결과 반환**: C 함수의 결과를 다시 JavaScript 타입으로 변환하여 반환.
*   **메모리 관리**: C 레벨에서 동적으로 할당된 메모리 관리(해제).

**개념적 예시 (매우 간략화됨):**
```cpp
#include <napi.h>
// 필요한 C 라이브러리 헤더 포함
#include "iso-20/iso20_CommonMessages_Decoder.h"
#include "iso-20/iso20_CommonMessages_Datatypes.h"
#include "common/exi_bitstream.h"
#include "common/exi_error_codes.h"

// JS에서 호출될 디코딩 함수 래퍼
Napi::Value DecodeIso20Message(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  // 1. JS 인자 (Buffer) -> C 데이터 (uint8_t*, size_t)
  if (info.Length() < 1 || !info[0].IsBuffer()) { /* 오류 처리 */ }
  Napi::Buffer<uint8_t> exiBuffer = info[0].As<Napi::Buffer<uint8_t>>();

  // 2. C 라이브러리 준비 (비트스트림, 구조체 초기화)
  exi_bitstream_t stream;
  exi_bitstream_init(&stream, exiBuffer.Data(), exiBuffer.Length(), 0, nullptr);
  struct iso20_exiDocument decoded_doc;
  init_iso20_exiDocument(&decoded_doc);

  // 3. C 디코딩 함수 호출
  int result = decode_iso20_exiDocument(&stream, &decoded_doc);

  // 4. 결과 처리: 오류 검사 및 C 구조체 -> JS 객체 변환
  if (result != EXI_ERROR__NO_ERROR) { /* 오류 반환 */ }
  Napi::Object jsResult = Napi::Object::New(env);
  // ... decoded_doc 내용을 재귀적으로 jsResult 객체로 채우는 로직 ...
  // 예: jsResult.Set("sessionId", Napi::Buffer<uint8_t>::Copy(env, ...));
  
  // 5. C 레벨 메모리 해제 (필요시)
  
  return jsResult;
}

// 인코딩 함수 래퍼 (유사한 구조)
Napi::Value EncodeIso20Message(const Napi::CallbackInfo& info) { /* ... */ }

// 모듈 초기화: JS에 노출할 함수 등록
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("decodeIso20Message", Napi::Function::New(env, DecodeIso20Message));
  exports.Set("encodeIso20Message", Napi::Function::New(env, EncodeIso20Message));
  return exports;
}

NODE_API_MODULE(cbv2g_addon, Init) // 모듈 등록
```
**주의**: 실제 래퍼 코드는 데이터 타입 변환(특히 복잡한 중첩 구조체, 배열, 문자열)과 메모리 관리가 매우 복잡하며 신중한 구현이 필요합니다.

### 2.4. 네이티브 애드온 빌드

프로젝트 루트에서 다음 명령어를 실행하여 애드온을 빌드합니다:

```bash
node-gyp configure
node-gyp build
```

성공 시 `build/Release/cbv2g_addon.node` 파일이 생성됩니다.

### 2.5. Node.js에서 사용

JavaScript 코드에서 `require`를 사용하여 빌드된 `.node` 파일을 로드하고 래핑된 함수를 호출합니다:

```javascript
const path = require('path');
// .node 파일 경로는 실제 프로젝트 구조에 따라 조정 필요
const cbv2g = require(path.join(__dirname, '..', 'build/Release/cbv2g_addon.node')); // 예시: Node.js 파일이 contractCertRequest 폴더 밖에 있을 경우

// 디코딩 예시
const receivedExiData = Buffer.from('...'); // EXI 데이터
try {
  const messageObject = cbv2g.decodeIso20Message(receivedExiData);
  console.log('Decoded:', messageObject);
} catch (e) {
  console.error('Decode Error:', e);
}

// 인코딩 예시
const messageToSend = { /* JS 객체 (C 구조체에 매핑) */ };
try {
  const encodedExiBuffer = cbv2g.encodeIso20Message(messageToSend);
  console.log('Encoded:', encodedExiBuffer);
  // encodedExiBuffer 전송
} catch (e) {
  console.error('Encode Error:', e);
}
```

## 3. 주요 고려 사항

*   **데이터 타입 변환의 복잡성**: JavaScript와 C 간의 타입 시스템 차이로 인해, 특히 중첩 구조체, 배열, 포인터 등을 정확하게 변환하는 것은 까다로운 작업입니다.
*   **메모리 관리**: C 레벨에서 할당된 메모리는 JavaScript GC의 관리를 받지 않으므로, C++ 래퍼 코드 내에서 명시적으로 해제해야 메모리 누수를 방지할 수 있습니다.
*   **빌드 환경**: 다양한 OS 및 아키텍처에서 빌드가 성공하도록 환경을 구성하고 테스트하는 것이 중요합니다.
*   **오류 처리**: C 라이브러리 함수가 반환하는 오류 코드를 JavaScript 예외로 적절히 변환하여 전달해야 합니다. 

## 4. ISO 15118-20: Certificate Installation 관련 정보

이 섹션은 ISO 15118-20 표준의 "Certificate Installation" 메시지 타입과 관련된 C 라이브러리(`cbV2G`)의 주요 데이터 구조 및 함수 정보를 요약합니다.

### 4.1. 관련 메시지 타입

*   **요청**: `CertificateInstallationReq`
*   **응답**: `CertificateInstallationRes`

### 4.2. 주요 C 데이터 구조 및 헤더 파일

*모든 구조체 및 타입 정의는 `contractCertRequest/c/iso-20/iso20_CommonMessages_Datatypes.h` 헤더 파일에 있습니다.*

*   **`struct iso20_exiDocument`**: 모든 V2G 메시지를 담는 최상위 구조체 (Union). `CertificateInstallationReq_isUsed` 또는 `CertificateInstallationRes_isUsed` 플래그로 메시지 타입을 구분합니다.
*   **`struct iso20_CertificateInstallationReqType`**: `CertificateInstallationReq` 메시지의 내용을 정의합니다.
    *   `Header`: `iso20_MessageHeaderType` 참조.
    *   `OEMProvisioningCertificateChain`: `iso20_SignedCertificateChainType` 참조. OEM 프로비저닝 인증서 체인.
    *   `ListOfRootCertificateIDs`: `iso20_ListOfRootCertificateIDsType` 참조. EV가 신뢰하는 루트 인증서 ID 목록.
    *   `MaximumContractCertificateChains`: `uint8_t`. EV가 저장 가능한 최대 계약 인증서 체인 수.
    *   `PrioritizedEMAIDs` (선택적): `iso20_EMAIDListType` 참조. 우선 처리할 EMAID 목록.
*   **`struct iso20_CertificateInstallationResType`**: `CertificateInstallationRes` 메시지의 내용을 정의합니다.
    *   `Header`: `iso20_MessageHeaderType` 참조.
    *   `ResponseCode`: `iso20_responseCodeType` (enum). 응답 코드.
    *   `EVSEProcessing`: `iso20_processingType` (enum). EVSE 처리 상태.
    *   `CPSCertificateChain`: `iso20_CertificateChainType` 참조. 계약 및 프로비저닝 서비스(CPS)에서 발급한 인증서 체인.
    *   `SignedInstallationData`: `iso20_SignedInstallationDataType` 참조. 서명된 설치 데이터 (계약 인증서 포함).
    *   `RemainingContractCertificateChains`: `uint8_t`. EVSE가 추가로 제공할 수 있는 계약 인증서 체인 수.
*   **`struct iso20_MessageHeaderType`**: 모든 V2G 메시지에 포함되는 공통 헤더 (`SessionID`, `TimeStamp` 등).
    *   `SessionID`: `sessionIDType` (16진수 바이트 배열). 세션 ID.
    *   `TimeStamp`: `uint64_t`. 메시지 타임스탬프.
    *   `Signature` (선택적): `iso20_SignatureType` 참조. 메시지 서명.
*   **`struct iso20_SignedCertificateChainType`**: 서명된 인증서 체인.
    *   `Id` (선택적): `idType` (문자열). 요소 식별자.
    *   `Certificate`: `certificateType` (base64Binary). 주 인증서 (DER 형식).
    *   `SubCertificates` (선택적): `iso20_SubCertificatesType` 참조. 하위 인증서 목록.
    *   `Signature`: `iso20_SignatureType` 참조. 인증서 체인 서명.
*   **`struct iso20_ListOfRootCertificateIDsType`**: 루트 인증서 ID 목록.
    *   `RootCertificateID`: `rootCertificateIDType` 배열 (문자열). X.509 인증서의 Subject Key Identifier (SKI) 해시값 등. 최대 5개.
*   **`struct iso20_EMAIDListType`**: EMAID 목록.
    *   `EMAID`: `emaIDType` 배열 (문자열). E-Mobility Account Identifier. 최대 8개.
*   **`struct iso20_CertificateChainType`**: 서명되지 않은 인증서 체인.
    *   `Id` (선택적): `idType` (문자열). 요소 식별자.
    *   `Certificate`: `certificateType` (base64Binary). 주 인증서 (DER 형식).
    *   `SubCertificates` (선택적): `iso20_SubCertificatesType` 참조. 하위 인증서 목록.
*   **`struct iso20_SignedInstallationDataType`**: 서명된 설치 데이터.
    *   `Id`: `idType` (문자열). 요소 식별자.
    *   `ContractCertificateChain`: `iso20_ContractCertificateChainType` 참조. 계약 인증서 체인.
    *   `ECIES_PrivateKey` (선택적): `privateKeyType` (base64Binary). ECIES 개인 키.
    *   `DHpublickey` (선택적): `dHpublicKeyType` (base64Binary). DH 공개 키.
    *   `SECP521_PrivateKey` (선택적): `privateKeyType` (base64Binary). SECP521r1 개인 키.
    *   `Signature`: `iso20_SignatureType` 참조. 설치 데이터 서명.
*   **`struct iso20_SubCertificatesType`**: 하위 인증서 목록.
    *   `Certificate`: `certificateType` 배열 (base64Binary). 하위 인증서 (DER 형식). 최대 3개.
*   **`struct iso20_ContractCertificateChainType`**: 계약 인증서 체인 정보.
    *   `Certificate`: `certificateType` (base64Binary). 계약 인증서 (리프 인증서).
    *   `SubCertificates`: `iso20_SubCertificatesType` 참조. 상위(중개) 인증서 목록.
*   **`struct iso20_SignatureType`**: XML 서명 구조체 (xmldsig).
    *   `Id` (선택적): `idType`.
    *   `SignedInfo`: `iso20_SignedInfoType` 참조. 서명 대상 정보.
    *   `SignatureValue`: `iso20_SignatureValueType` 참조. 서명 값.
    *   `KeyInfo` (선택적): `iso20_KeyInfoType` 참조. 서명 검증 키 정보.
    *   `Object` (선택적): `iso20_ObjectType` 참조. 추가 데이터.
*   **`struct iso20_SignedInfoType`**: 서명 대상 정보 (xmldsig).
    *   `Id` (선택적): `idType`.
    *   `CanonicalizationMethod`: `iso20_CanonicalizationMethodType` 참조. 정규화 방법.
    *   `SignatureMethod`: `iso20_SignatureMethodType` 참조. 서명 알고리즘.
    *   `Reference`: `iso20_ReferenceType` 배열. 서명할 리소스 참조. 최대 4개.

*기타 `xmldsig` 관련 하위 구조체 (`iso20_SignatureValueType`, `iso20_KeyInfoType`, `iso20_ObjectType`, `iso20_CanonicalizationMethodType`, `iso20_SignatureMethodType`, `iso20_ReferenceType`, `iso20_TransformsType`, `iso20_DigestMethodType` 등)는 `iso20_CommonMessages_Datatypes.h`에서 추가로 확인할 수 있습니다.*

### 4.3. 관련 C 함수 및 소스 파일

*   **초기화 함수:**
    *   `init_iso20_exiDocument()`
    *   `init_iso20_CertificateInstallationReqType()`
    *   `init_iso20_CertificateInstallationResType()`
    *   *(기타 하위 구조체 초기화 함수)*
    *   **소스 파일**: `contractCertRequest/c/iso-20/iso20_CommonMessages_Datatypes.c`
*   **인코딩 함수:**
    *   `encode_iso20_exiDocument()`: 메인 인코딩 함수. 내부적으로 다음 함수 호출:
    *   `encode_iso20_CertificateInstallationReqType()`
    *   *(기타 하위 구조체 인코딩 함수)*
    *   **소스 파일**: `contractCertRequest/c/iso-20/iso20_CommonMessages_Encoder.c`
*   **디코딩 함수:**
    *   `decode_iso20_exiDocument()`: 메인 디코딩 함수. 내부적으로 다음 함수 호출:
    *   `decode_iso20_CertificateInstallationResType()`
    *   *(기타 하위 구조체 디코딩 함수)*
    *   **소스 파일**: `contractCertRequest/c/iso-20/iso20_CommonMessages_Decoder.c`
*   **공통 비트스트림/기본타입 함수:**
    *   `exi_bitstream_init()`, `exi_bitstream_write_bits()`, `exi_bitstream_get_length()`, etc.
    *   `encode_exi_...()`, `decode_exi_...()`
    *   **소스 파일**: `contractCertRequest/c/common/*.c` (예: `exi_bitstream.c`, `exi_basetypes_encoder.c` 등) 

### 4.4. 관련 XML 스키마 정보 (`xmlSchema20/V2G_CI_CommonMessages.xsd`)

이 섹션은 Certificate Installation 메시지의 XML 스키마 구조를 설명합니다.

*   **`CertificateInstallationReq`** (`CertificateInstallationReqType`)
    *   **Base Type**: `v2gci_ct:V2GRequestType`
    *   **구조 (sequence):**
        *   `Header` (`v2gci_ct:MessageHeaderType`): 공통 메시지 헤더 (1번 필수)
        *   `OEMProvisioningCertificateChain` (`SignedCertificateChainType`): OEM 프로비저닝 인증서 체인 (1번 필수)
        *   `ListOfRootCertificateIDs` (`v2gci_ct:ListOfRootCertificateIDsType`): 신뢰하는 루트 인증서 ID 목록 (1번 필수)
        *   `MaximumContractCertificateChains` (`xs:unsignedByte`): 저장 가능한 최대 계약 인증서 체인 수 (1번 필수)
        *   `PrioritizedEMAIDs` (`EMAIDListType`): 우선 처리할 EMAID 목록 (0 또는 1번)

*   **`CertificateInstallationRes`** (`CertificateInstallationResType`)
    *   **Base Type**: `v2gci_ct:V2GResponseType`
    *   **구조 (sequence):**
        *   `Header` (`v2gci_ct:MessageHeaderType`): 공통 메시지 헤더 (1번 필수)
        *   `ResponseCode` (`v2gci_ct:responseCodeType`): 응답 코드 (1번 필수)
        *   `EVSEProcessing` (`v2gci_ct:processingType`): EVSE 처리 상태 (1번 필수)
        *   `CPSCertificateChain` (`CertificateChainType`): CPS 인증서 체인 (1번 필수)
        *   `SignedInstallationData` (`SignedInstallationDataType`): 서명된 설치 데이터 (1번 필수)
        *   `RemainingContractCertificateChains` (`xs:unsignedByte`): 추가 제공 가능한 계약 인증서 체인 수 (1번 필수)

*(참고: `v2gci_ct:` 접두사는 `V2G_CI_CommonTypes.xsd`에 정의된 타입을 나타내며, 접두사가 없는 타입은 `V2G_CI_CommonMessages.xsd` 내에 정의되어 있습니다.)*

**하위 타입 상세:**

*   **`SignedCertificateChainType`** (`V2G_CI_CommonMessages.xsd`)
    *   **Attribute**: `Id` (`xs:ID`, 필수)
    *   **구조 (sequence):**
        *   `Certificate` (`certificateType`): 주 인증서 (1번 필수)
        *   `SubCertificates` (`SubCertificatesType`): 하위 인증서 목록 (0 또는 1번)

*   **`v2gci_ct:ListOfRootCertificateIDsType`** (`V2G_CI_CommonTypes.xsd`)
    *   **구조 (sequence):**
        *   `RootCertificateID` (`xmlsig:X509IssuerSerialType`): 루트 인증서 식별자 (최대 20번)

*   **`EMAIDListType`** (`V2G_CI_CommonMessages.xsd`)
    *   **구조 (sequence):**
        *   `EMAID` (`v2gci_ct:identifierType`): E-Mobility Account Identifier (최대 8번)

*   **`CertificateChainType`** (`V2G_CI_CommonMessages.xsd`)
    *   **구조 (sequence):**
        *   `Certificate` (`certificateType`): 주 인증서 (1번 필수)
        *   `SubCertificates` (`SubCertificatesType`): 하위 인증서 목록 (0 또는 1번)

*   **`SignedInstallationDataType`** (`V2G_CI_CommonMessages.xsd`)
    *   **Attribute**: `Id` (`xs:ID`, 필수)
    *   **구조 (sequence):**
        *   `ContractCertificateChain` (`ContractCertificateChainType`): 계약 인증서 체인 (1번 필수)
        *   `ECDHCurve` (`ecdhCurveType`): ECDH 곡선 타입 (1번 필수)
        *   `DHPublicKey` (`dhPublicKeyType`): DH 공개 키 (1번 필수)
        *   **Choice (1번 필수):**
            *   `SECP521_EncryptedPrivateKey` (`secp521_EncryptedPrivateKeyType`): 암호화된 개인 키 (SECP521)
            *   `X448_EncryptedPrivateKey` (`x448_EncryptedPrivateKeyType`): 암호화된 개인 키 (X448)
            *   `TPM_EncryptedPrivateKey` (`tpm_EncryptedPrivateKeyType`): 암호화된 개인 키 (TPM)

*   **`SubCertificatesType`** (`V2G_CI_CommonMessages.xsd`)
    *   **구조 (sequence):**
        *   `Certificate` (`certificateType`): 하위 인증서 (최대 3번)

*   **`ContractCertificateChainType`** (`V2G_CI_CommonMessages.xsd`)
    *   **구조 (sequence):**
        *   `Certificate` (`certificateType`): 계약 인증서 (리프) (1번 필수)
        *   `SubCertificates` (`SubCertificatesType`): 상위(중개) 인증서 목록 (1번 필수)

*   **`v2gci_ct:MessageHeaderType`** (`V2G_CI_CommonTypes.xsd`)
    *   **구조 (sequence):**
        *   `SessionID` (`v2gci_ct:sessionIDType`): 세션 ID (1번 필수)
        *   `TimeStamp` (`xs:unsignedLong`): 타임스탬프 (1번 필수)
        *   `Signature` (`xmlsig:SignatureType`): 서명 (0 또는 1번)

*   **`v2gci_ct:responseCodeType`** (`V2G_CI_CommonTypes.xsd`): 응답 코드 (Enum: `OK`, `WARNING_...`, `FAILED_...` 등)

*   **`v2gci_ct:processingType`** (`V2G_CI_CommonTypes.xsd`): 처리 상태 (Enum: `Finished`, `Ongoing`, `Ongoing_WaitingForCustomerInteraction`)

*   **`certificateType`** (`V2G_CI_CommonMessages.xsd`): 인증서 데이터 (`xs:base64Binary`, DER 형식)

*   **`dhPublicKeyType`** (`V2G_CI_CommonMessages.xsd`): DH 공개 키 (`xs:base64Binary`, 길이 133)

*   **`ecdhCurveType`** (`V2G_CI_CommonMessages.xsd`): ECDH 곡선 (Enum: `SECP521`, `X448`)

*   **`secp521_EncryptedPrivateKeyType`** (`V2G_CI_CommonMessages.xsd`): 암호화된 개인 키 (`xs:base64Binary`, 길이 118)

*   **`x448_EncryptedPrivateKeyType`** (`V2G_CI_CommonMessages.xsd`): 암호화된 개인 키 (`xs:base64Binary`, 길이 84)

*   **`tpm_EncryptedPrivateKeyType`** (`V2G_CI_CommonMessages.xsd`): 암호화된 개인 키 (`xs:base64Binary`, 길이 206)

*   **`xmlsig:SignatureType`**: XML 디지털 서명 타입 (`xmldsig-core-schema.xsd` 참조). 주요 포함 요소:
    *   `SignedInfo` (`xmlsig:SignedInfoType`)
    *   `SignatureValue` (`xmlsig:SignatureValueType`)
    *   `KeyInfo` (`xmlsig:KeyInfoType`, 선택적)
    *   `Object` (`xmlsig:ObjectType`, 선택적)

*   **`v2gci_ct:identifierType`**: 식별자 문자열 (`xs:string`, 최대 255자)

*   **`xmlsig:X509IssuerSerialType`**: X.509 인증서 발급자 및 시리얼 번호 (`xmldsig-core-schema.xsd` 참조)

*(더 상세한 내용은 각 XSD 파일을 참조하십시오.)* 

**전략 변경:** 네이티브 애드온 방식의 지속적인 링크 오류 및 C++ 경험 부족으로 인한 구현/디버깅의 높은 난이도를 고려하여, **방법 2-2 (별도 C 실행 파일 + Node.js 자식 프로세스 호출)** 로 전략을 변경함. 네이티브 애드온 개발은 잠정 중단.

--- 

## 새로운 계획: 별도 C 실행 파일 개발 및 Node.js 연동

*   **목표:** `cbV2G` C 라이브러리를 사용하는 간단한 C 명령줄 실행 파일을 만들고, Node.js에서 이 파일을 실행하여 EXI 인코딩/디코딩 기능을 사용합니다.
*   **접근 방식:**
    1.  C 실행 파일 설계 (입출력 방식 정의: **XML via stdin**, Base64 EXI via stdout).
    2.  C 실행 파일 구현 (`main` 함수 작성, **XML 입력 파싱**, 라이브러리 호출, 출력 생성).
    3.  C 실행 파일 컴파일 (GCC 또는 MSVC 사용, **XML 파서 라이브러리 링크 필요**).
    4.  Node.js 인터페이스 구현 (`child_process.spawn` 사용).
    5.  단계별 테스트 및 디버깅.

**(다음 단계: C 실행 파일 설계 및 초기 구현)**

*   **(새로운 계획 2.1) C 실행 파일 설계 완료:** 입출력 방식으로 stdin (**XML 입력**) / stdout (Base64 EXI 출력) / stderr (오류 메시지) 사용 결정.
*   **(새로운 계획 2.2) 초기 C 소스 파일 생성 완료:** `contractCertRequest/c_executable/encoder_main.c` 파일에 기본 구조 및 라이브러리 함수 호출 골격 작성 완료. (현재는 JSON 기반 코드가 포함된 상태)
*   **(새로운 계획 2.3) 핵심 로직 구현 방안 변경:**
    *   **XML 파싱:** 기존 `cJSON` 라이브러리 대신 **`libxml2` 라이브러리** 사용 결정. (시스템에 `libxml2` 개발 라이브러리 설치 필요)
    *   Base64/Hex 디코딩: 기존 `encoder_main.c`에 구현된 함수 재사용.
    *   **XML -> C 구조체 변환 로직 구현:** 이것이 가장 핵심적인 작업이 될 것입니다.
        *   `libxml2`를 사용하여 XML 입력을 파싱하고 메모리에 XML 트리를 생성합니다.
        *   XPath 또는 DOM 순회 API를 사용하여 XML 트리에서 필요한 요소(element)와 속성(attribute) 값을 추출합니다.
        *   추출한 값을 `iso20_exiDocument` C 구조체 및 하위 구조체에 채워 넣습니다. 이 과정에서 문자열을 숫자, 바이트 배열(Base64/Hex 디코딩 포함) 등으로 변환해야 합니다.
        *   스키마 제약 조건(필수 요소/속성, 데이터 형식, 길이 등)을 검증하고 오류를 처리합니다.
*   **(새로운 계획 3.1) C 실행 파일 컴파일 (GCC):** `encoder_main.c` 및 관련 `cbV2G` C 라이브러리 파일, 그리고 **`libxml2` 라이브러리**를 함께 컴파일하고 링크합니다. GCC 명령어에 `-lxml2` 및 `-I/path/to/libxml2/include` 옵션 추가가 필요합니다.
*   **(새로운 계획 3.2 ~) 컴파일 오류 해결 및 테스트:** XML 파싱 로직 구현 후 컴파일 오류 해결, 실행 파일 테스트 및 디버깅 과정을 반복합니다. (기존 JSON 기반으로 진행했던 로그는 XML 기반으로 재수행 필요)

---

*   **(기존 로그 요약 - XML로 변경 시 재수행 필요):**
    *   (초기 GCC 컴파일 시도 및 오류 해결)
    *   (기본 실행 테스트 및 EXI 인코딩 오류(-70) 확인)
    *   (Base64 인코딩 함수 추가)
    *   (Hex 디코딩 함수 추가 및 컴파일 오류 수정)
    *   (`CertificateInstallationReq` 필드별 처리 로직 구현 및 린터/컴파일 오류 수정):
        *   `messageHeader` (sessionId, timestamp)
        *   `OEMProvisioningCertificateChain` (Id, Certificate, SubCertificates)
        *   `ListOfRootCertificateIDs` (RootCertificateID 배열)
        *   `MaximumContractCertificateChains`
        *   `PrioritizedEMAIDs`
        *   `Signature` (존재 여부만 확인)
    *   (실행 테스트 및 디버깅):
        *   Base64 디코딩 오류 해결 (잘못된 입력 데이터, `base64_decode` 함수 개선).
        *   EXI 인코딩 크래시 문제 진단 (원인은 초기에 잘못된 하위 인증서 데이터로 추정되었으나, 단계적 테스트를 통해 유효 데이터로 최종 성공).
        *   최소 데이터 -> 실제 데이터 단계적 테스트 완료.
        *   **최종적으로 유효한 인증서 데이터를 포함한 JSON 입력을 사용하여 `CertificateInstallationReq` 메시지의 EXI 인코딩 성공 확인.**

*   **(XML 전환 결정):** JSON 기반의 `CertificateInstallationReq` 인코딩 기능 구현 및 테스트가 성공적으로 완료되었습니다. 이제 사용자의 요구에 따라 프로그램의 입력 방식을 **XML로 변경**하기로 결정했습니다.

**(다음 단계: `encoder_main.c`에서 `cJSON` 관련 코드를 제거하고 `libxml2`를 사용한 XML 파싱 및 C 구조체 변환 로직 구현)**

--- 