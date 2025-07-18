# contractCertRequest 폴더 개요

이 폴더는 ISO 15118 표준, 특히 계약 인증서(Contract Certificate) 설치 및 관리와 관련된 V2G(Vehicle-to-Grid) 통신 테스트 및 구현을 위한 파일들을 포함합니다. 주요 구성 요소는 `cbExiGen` 도구를 사용하여 생성된 C 코드 코덱 라이브러리와 관련 스키마, 인증서 파일 등입니다.

## 폴더 구조 및 내용 설명

*   **`c/`**: `cbExiGen` 도구로 생성된 V2GTP EXI(Efficient XML Interchange) 코덱 C 라이브러리 (`cbV2G`) 소스 코드가 들어 있습니다. 이 라이브러리는 V2G 통신 메시지를 C 구조체와 EXI 바이너리 형식 간에 변환하는 역할을 합니다.
    *   `appHandshake/`: Application Handshake 프로토콜 관련 코드 (인코더, 디코더, 데이터 타입)
    *   `common/`: EXI 처리의 기본 로직, 기본 데이터 타입, 비트스트림 처리, 헤더 처리 등 공통 기능 코드
    *   `din/`: DIN 70121 표준 메시지 관련 코드 (인코더, 디코더, 데이터 타입)
    *   `iso-2/`: ISO 15118-2 표준 메시지 관련 코드 (인코더, 디코더, 데이터 타입)
    *   `iso-20/`: ISO 15118-20 표준 메시지 관련 코드. AC, DC, WPT, ACDP, CommonMessages 등 기능별로 세분화됨 (인코더, 디코더, 데이터 타입)
    *   `v2gtp/`: V2GTP 헤더 처리 및 페이로드 타입 식별 관련 코드

*   **`xmlSchema/`**: `cbExiGen`이 C 코드를 생성하는 데 사용한 DIN 70121 및 ISO 15118-2 표준의 XML 스키마 파일(.xsd)이 위치할 것으로 예상됩니다.

*   **`xmlSchema20/`**: `cbExiGen`이 C 코드를 생성하는 데 사용한 ISO 15118-20 표준의 XML 스키마 파일(.xsd)이 위치할 것으로 예상됩니다.

*   **`cert/`**: V2G 통신(TLS 보안 연결, 메시지 서명/검증 등)에 필요한 X.509 인증서 파일(.pem, .der 등)이 저장되는 곳입니다. 예를 들어, 차량의 계약 인증서(Contract Certificate), 제조사(OEM) 인증서, V2G 루트 CA 인증서 등이 포함될 수 있습니다.

*   **`key/`**: `cert/` 폴더에 있는 인증서들의 개인 키 파일(.key, .pem 등)이 저장되는 곳입니다. 보안 상 민감한 정보이므로 접근 관리에 유의해야 합니다.

*   **`root/`**: 신뢰 체인 검증에 필요한 루트 CA(Certificate Authority) 인증서 또는 관련 파일들이 위치할 수 있습니다.

*   **`emaid/`**: EMAID(E-Mobility Account Identifier)와 관련된 파일이나 정보가 저장될 수 있습니다. EMAID는 전기차 계약을 식별하는 데 사용됩니다.

*   **`out/`**: 스크립트 실행 결과나 생성된 파일이 저장되는 출력 폴더입니다. 예를 들어, 생성된 인증서 서명 요청(CSR), 인코딩된 EXI 메시지, 테스트 로그 등이 여기에 저장될 수 있습니다.

*   **`temp/`**: 작업 중 발생하는 임시 파일을 저장하는 폴더입니다.

## 주요 기능 및 목적

이 폴더의 구성 요소들은 종합적으로 다음과 같은 기능을 수행하기 위해 사용될 수 있습니다:

1.  **V2G 통신 메시지 인코딩/디코딩**: `c/` 폴더의 코덱 라이브러리를 사용하여 DIN 70121, ISO 15118-2, ISO 15118-20 표준에 따른 메시지를 생성하고 해석합니다.
2.  **계약 인증서 관리**: `cert/`, `key/`, `emaid/` 폴더의 파일들을 활용하여 계약 인증서 설치 요청(CertificateInstallationReq) 메시지를 생성하거나, 수신된 인증서 응답을 처리하고 저장하는 등의 작업을 수행합니다.
3.  **보안 통신**: 저장된 인증서와 키를 사용하여 TLS 핸드셰이크 및 보안 V2G 통신 세션을 설정합니다.
4.  **표준 기반 테스트**: `xmlSchema/`, `xmlSchema20/`의 스키마를 참조하여 생성된 코덱의 정확성을 검증하고, 표준 기반의 V2G 통신 시나리오를 테스트합니다.

이 폴더는 전기차 충전 인프라(EVSE) 또는 차량 내 통신 장치에서 ISO 15118 기반의 통신, 특히 계약 인증서 관련 기능을 개발하고 테스트하는 데 필요한 자원을 모아놓은 환경으로 볼 수 있습니다. 

## C 라이브러리 (cbV2G) 사용법

`c/` 폴더에 있는 C 라이브러리는 V2G 메시지를 EXI 형식으로 인코딩하거나 디코딩하는 데 사용됩니다. 일반적인 사용 절차는 다음과 같습니다.

1.  **초기화 및 준비**:
    *   필요한 헤더 파일(`common/`, `v2gtp/`, 특정 표준 `iso-20/`, `din/` 등)을 C 코드에 포함합니다.
    *   EXI 데이터를 처리할 비트스트림(`exi_bitstream_t`)을 초기화하고 입/출력 버퍼와 연결합니다.

2.  **데이터 준비**:
    *   **인코딩 시**: 전송할 메시지에 해당하는 C 구조체(`*Datatypes.h`에 정의됨)를 선언하고 필드 값을 채웁니다. 예를 들어, `iso20_SessionSetupReqType` 구조체에 값을 설정합니다.
    *   **디코딩 시**: 수신된 EXI 데이터를 저장할 C 구조체를 선언하고 초기화 함수(`init_*`)를 호출하여 준비합니다.

3.  **인코딩/디코딩 실행**:
    *   **인코딩**: 준비된 C 구조체를 EXI 데이터로 변환하기 위해 해당 메시지의 `encode_*` 함수(예: `encode_iso20_exiDocument`)를 호출합니다. 결과는 초기화된 비트스트림의 출력 버퍼에 저장됩니다.
    *   **디코딩**: 비트스트림에 로드된 EXI 데이터를 C 구조체로 변환하기 위해 해당 메시지의 `decode_*` 함수(예: `decode_iso20_exiDocument`)를 호출합니다. 결과는 준비된 C 구조체에 채워집니다.
    *   V2GTP 헤더 처리 함수(`exi_v2gtp.h`) 및 EXI 헤더 처리 함수(`exi_header.h`)를 인코딩/디코딩 전후에 호출해야 할 수 있습니다.

4.  **결과 처리 및 정리**:
    *   **인코딩 결과**: 생성된 EXI 데이터를 네트워크를 통해 전송합니다.
    *   **디코딩 결과**: C 구조체에 채워진 데이터를 사용하여 애플리케이션 로직을 수행합니다.
    *   동적으로 할당된 메모리가 있다면 해제합니다.

**주의사항**:
*   모든 인코딩/디코딩 함수는 오류 코드를 반환하므로 반드시 확인하고 처리해야 합니다.
*   데이터 구조체 내 `isUsed` 플래그를 확인하여 optional 요소의 존재 여부를 파악해야 합니다.
*   정확한 함수명, 구조체 정의 등은 관련 헤더 파일을 직접 참조해야 합니다.
*   라이브러리를 사용하려면 `.c` 파일들을 컴파일하고 애플리케이션과 링크해야 합니다. 

### Node.js 환경에서 사용

이 C 라이브러리는 직접 실행 파일이 아니므로 단독으로 실행할 수 없습니다. 하지만 Node.js 환경에서 네이티브 애드온(Native Addon) 형태로 빌드하여 사용할 수 있습니다.

*   **권장 방법**: `node-gyp`과 N-API를 사용하여 C++ 래퍼를 작성하고 네이티브 모듈(`.node` 파일)로 빌드합니다. 이 방식은 성능과 호환성 면에서 유리합니다.
*   **상세 개발 가이드**: Node.js 네이티브 애드온을 개발하는 구체적인 단계와 기술적 고려 사항은 `DEVELOPER_NOTES.md` 파일을 참조하십시오. 

## Node.js 통합 작업 계획 (상세)

**주의:** 이 작업은 사용자(개발자)의 C/C++ 경험 부족으로 인해 AI 지원에 크게 의존하며, 상당한 어려움과 예상치 못한 문제가 발생할 수 있습니다. 성공적인 완료를 보장하기 어려우며, 많은 시간과 노력이 필요할 수 있습니다. AI는 코드 생성 및 분석을 지원하지만, 직접적인 디버깅이나 실행 환경 접근이 불가능하므로 사용자의 정확한 피드백과 테스트가 필수적입니다.

**목표:** `cbV2G` C 라이브러리를 Node.js 네이티브 애드온으로 만들어 JavaScript에서 호출 가능하게 합니다.

**핵심 접근 방식:** 점진적 개발, 빈번한 빌드 및 테스트, 명확한 역할 분담 및 상세 피드백.

--- 

**1단계: 개발 환경 준비 및 검증**

*   **1.1. 필수 도구 설치:** (`DEVELOPER_NOTES.md`의 '1. 사전 준비' 참조)
    *   Node.js, npm
    *   OS별 C++ 컴파일러 (Visual Studio Build Tools / Xcode Command Line Tools / `build-essential`)
    *   Python (3.x 권장)
    *   `node-gyp` (전역): `npm install -g node-gyp`
    *   `node-addon-api` (프로젝트): `npm install --save-dev node-addon-api`
*   **1.2. 설치 확인 (사용자 실행):** 터미널에서 `node -v`, `npm -v`, `python --version`, `node-gyp -v` 명령어를 실행하여 각 도구가 올바르게 설치되었는지 확인하고 결과를 알려주세요.
*   **이유:** 네이티브 애드온 빌드를 위한 기본적인 환경 구축 및 검증.
*   **AI 역할:** 설치 명령어 제공, 결과 확인 지원.
*   **사용자 역할:** 명령어 실행, 결과 제공.

**2단계: 기본 프로젝트 구조 및 초기 빌드 설정**

*   **2.1. 폴더 구조 확인:** `contractCertRequest/nodejs_interface` 폴더가 존재하는지 확인합니다.
*   **2.2. 초기 `binding.gyp` 파일 생성 (AI 제공, 사용자 생성):** 프로젝트 루트(`ocpp_certificate_test`)에 아래 내용으로 `binding.gyp` 파일을 생성합니다. **처음에는 C 라이브러리 소스 없이 C++ 래퍼 파일만 포함합니다.**
    ```json
    {
      "targets": [
        {
          "target_name": "cbv2g_addon",
          "sources": [
            "contractCertRequest/nodejs_interface/wrapper.cpp" # C++ 래퍼 파일
          ],
          "include_dirs": [
            "<!(node -p \"require('node-addon-api').include_dir\")",
            # C 라이브러리 헤더 경로는 나중에 추가
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
          'xcode_settings': { 'GCC_ENABLE_CPP_EXCEPTIONS': 'NO', 'CLANG_CXX_LIBRARY': 'libc++', 'MACOSX_DEPLOYMENT_TARGET': '10.7' },
          'msvs_settings': { 'VCCLCompilerTool': { 'ExceptionHandling': 1 } }
        }
      ]
    }
    ```
*   **2.3. 초기 `wrapper.cpp` 파일 생성 (AI 제공, 사용자 생성):** `contractCertRequest/nodejs_interface/wrapper.cpp` 파일에 N-API 모듈의 기본 골격만 포함하여 생성합니다.
    ```cpp
    #include <napi.h>

    Napi::Object Init(Napi::Env env, Napi::Object exports) {
      // 나중에 여기에 함수를 등록합니다.
      return exports;
    }

    NODE_API_MODULE(cbv2g_addon, Init)
    ```
*   **2.4. 초기 빌드 테스트 (사용자 실행):** 프로젝트 루트에서 `node-gyp configure` 및 `node-gyp build`를 실행합니다. **성공적으로 빌드되어 `build/Release/cbv2g_addon.node` 파일이 생성되는지 확인**하고 결과를 알려주세요. (오류 발생 시 전체 오류 메시지 제공)
*   **이유:** 빌드 환경과 기본 설정이 올바른지 확인하고, C++ 래퍼 코드 없이 N-API 모듈의 최소 골격이 컴파일되는지 검증합니다.
*   **AI 역할:** `binding.gyp`, `wrapper.cpp` 초기 내용 제공, 빌드 오류 분석 지원.
*   **사용자 역할:** 파일 생성, 빌드 명령어 실행, 결과 및 오류 메시지 제공.

**3단계: 핵심 기능 점진적 구현 (반복 수행)**

*   **3.1. 대상 기능 선정:** **가장 간단한 V2G 메시지 타입 하나**를 선정합니다. (예: `SessionSetupReq`/`SessionSetupRes` 또는 더 단순한 메시지). 어떤 메시지를 먼저 처리할지 알려주세요.
*   **3.2. 관련 C 구조체 및 함수 분석 (AI 수행):** 선정된 메시지에 대한 C 라이브러리의 관련 헤더 파일(`*Datatypes.h`, `*Encoder.h`, `*Decoder.h`)을 분석하여 다음 정보를 제공합니다:
    *   관련 C 구조체 정의 (필드명, 타입 등)
    *   인코딩/디코딩 함수의 정확한 시그니처 (인자, 반환값)
    *   구조체 초기화 함수 (`init_*`) 존재 여부 및 시그니처
    *   메모리 해제 관련 함수 존재 여부
*   **3.3. JavaScript <-> C 데이터 매핑 설계:** 분석된 C 구조체를 기반으로, JavaScript에서 사용할 입력 객체 형태와 반환될 출력 객체 형태를 함께 설계합니다. (예: C의 `uint8` 배열 -> JS의 `Buffer`, C 구조체 -> JS 객체)
*   **3.4. C++ 래퍼 함수 코드 생성 (AI 제공):** 선정된 메시지의 **인코딩 또는 디코딩 함수 하나**를 래핑하는 C++ 코드를 `wrapper.cpp`에 추가하여 제공합니다. 이 코드는 다음을 포함합니다:
    *   N-API 함수 정의 (`Napi::Value EncodeMyMessage(const Napi::CallbackInfo& info)`)
    *   JS 인자 유효성 검사
    *   JS 인자(객체/Buffer) -> C 구조체/데이터 변환 로직 (**핵심 및 오류 발생 가능성 높음**)
    *   해당 C 라이브러리 함수 호출 (예: `decode_...`)
    *   C 결과 -> JS 객체/Buffer 변환 로직 (**핵심 및 오류 발생 가능성 높음**)
    *   오류 처리 (C 함수 반환값 확인 및 JS 예외 발생)
    *   메모리 관리 로직 (필요시 `free` 등 호출)
    *   `Init` 함수에 새 함수 등록 (`exports.Set(...)`)
*   **3.5. 코드 검토:** 생성된 C++ 코드를 사용자님께 제공하며, 코드의 각 부분에 대한 설명을 덧붙입니다. 사용자님은 C++ 문법은 모르더라도, **데이터 변환 로직이 3.3단계에서 설계한 내용과 일치하는지 개념적으로 검토**합니다.
*   **3.6. C 소스 파일 `binding.gyp` 추가 (AI 제안, 사용자 수정):** 래핑된 C 함수가 정의된 C 소스 파일(및 해당 함수가 의존하는 다른 C 파일들)의 경로를 `binding.gyp`의 `sources` 목록에 추가하도록 제안합니다.
*   **3.7. 빌드 시도 (사용자 실행):** 수정된 `binding.gyp`와 `wrapper.cpp`를 사용하여 `node-gyp build`를 다시 실행합니다.
*   **3.8. 빌드 오류 해결 (사용자+AI 반복):** 빌드 실패 시, **전체 오류 메시지를 정확하게 복사하여 제공**해주세요. 저는 오류 메시지를 분석하여 `wrapper.cpp` 또는 `binding.gyp`의 수정안을 제안합니다. 이 과정은 여러 번 반복될 수 있습니다.
*   **3.9. 최소 기능 테스트 (사용자 작성 및 실행):** 빌드가 성공하면, 래핑된 함수를 호출하는 **아주 간단한 Node.js 테스트 코드**를 작성하여 실행합니다. (예: 고정된 JS 객체를 인코딩하거나, 미리 준비된 EXI 데이터를 디코딩). **테스트 코드 자체도 요청하시면 제가 작성 지원 가능합니다.**
*   **3.10. 런타임 오류/결과 분석 (사용자+AI 반복):** 테스트 실행 시 발생하는 오류(크래시, 예외 메시지 등) 또는 예상과 다른 결과가 나오면, **실행한 테스트 코드, 사용된 입력 데이터, 발생한 오류 메시지 전체, 스택 트레이스(가능하다면), 실제 결과, 예상 결과**를 상세히 알려주세요. 저는 이 정보를 바탕으로 `wrapper.cpp` 코드의 문제점을 추정하고 수정안을 제안합니다. 이 과정 역시 여러 번 반복될 수 있습니다.
*   **3.11. 다음 기능으로:** 하나의 함수(인코딩 또는 디코딩)가 안정적으로 동작하면, 관련 쌍(예: 디코딩 함수) 또는 다음으로 간단한 메시지로 넘어가 3.1부터 반복합니다.

**4단계: 전체 기능 테스트 및 안정화**

*   **4.1. 통합 테스트:** 필요한 모든 핵심 기능(주요 메시지 인/디코딩)이 개별적으로 래핑되고 테스트되면, 실제 사용 시나리오에 가까운 복합적인 테스트 케이스를 작성하고 실행합니다.
*   **4.2. 성능 및 메모리 누수 점검 (고급):** (선택 사항 및 매우 어려움) 대량의 데이터를 처리하거나 장시간 실행 시 성능 저하 또는 메모리 사용량 증가가 있는지 관찰합니다. 문제 발생 시 원인 파악 및 해결은 매우 어렵습니다.

**5단계: 문서화 및 정리**

*   **5.1. 사용법 문서화:** 최종적으로 만들어진 Node.js 모듈의 사용법(설치 방법, API 함수 설명, 예제 코드)을 `README.md` 또는 별도 문서에 정리합니다.
*   **5.2. 코드 정리:** `wrapper.cpp` 코드의 가독성을 높이고 주석을 보강합니다.

--- 

**사용자님의 필수 역할 요약:**

*   모든 설치 및 빌드 명령어 **정확히 실행**.
*   빌드/런타임 시 발생하는 **오류 메시지 전체를 정확하게 복사하여 제공**.
*   간단한 **JavaScript 테스트 코드 작성 및 실행** (AI 지원 가능).
*   테스트 시 **입력 데이터, 실제 결과, 예상 결과 명확히 제시**.
*   AI가 제안하는 코드 수정안 적용 및 재시도.
*   **인내심:** 디버깅 과정은 매우 반복적이고 시간이 오래 걸릴 수 있습니다. 

## C 실행 파일 (encoder.exe) 사용법 (개발 중)

`contractCertRequest/c_executable` 폴더에는 JSON 입력을 받아 EXI로 인코딩하는 간단한 C 실행 파일(`encoder_main.c`)이 있습니다. 이 파일은 Node.js 와의 연동을 위한 중간 단계로 개발되었습니다.

### 빌드 방법 (GCC 사용)

프로젝트 루트 디렉토리에서 다음 명령어를 실행하여 `encoder.exe` 파일을 빌드할 수 있습니다:

```bash
gcc -o contractCertRequest/c_executable/encoder.exe \
 contractCertRequest/c_executable/encoder_main.c \
 contractCertRequest/c/common/exi_bitstream.c \
 contractCertRequest/c/common/exi_basetypes_encoder.c \
 contractCertRequest/c/common/exi_basetypes_decoder.c \
 contractCertRequest/c/common/exi_basetypes.c \
 contractCertRequest/c/common/exi_header.c \
 contractCertRequest/c/common/exi_types_decoder.c \
 contractCertRequest/c/v2gtp/exi_v2gtp.c \
 contractCertRequest/c/iso-20/iso20_CommonMessages_Encoder.c \
 contractCertRequest/c/iso-20/iso20_CommonMessages_Datatypes.c \
 -IcontractCertRequest/c/common \
 -IcontractCertRequest/c/v2gtp \
 -IcontractCertRequest/c/iso-20 \
 -I/c/msys64/mingw64/include/libxml2 \
 -L/mingw64/lib \
 -lxml2 \
 -lm
```

### 실행 방법

빌드된 `encoder.exe` 파일은 표준 입력(stdin)으로 **XML 데이터**를 받아, EXI 인코딩 결과를 Base64 문자열로 표준 출력(stdout)에 출력합니다. 오류 및 정보 메시지는 표준 오류(stderr)로 출력됩니다.

```bash
# 예시: XML 파일을 입력으로 사용
cat contractCertRequest/c_executable/sample_cert_install_req.xml | ./contractCertRequest/c_executable/encoder.exe

# 예시: XML 문자열을 직접 입력 (Windows cmd에서는 복잡할 수 있음)
echo '<V2G_Message>...</V2G_Message>' | ./contractCertRequest/c_executable/encoder.exe 
``` 