# 개발 진행 로그 (cbV2G Node.js 네이티브 애드온)

이 문서는 `cbV2G` C 라이브러리를 Node.js에서 사용하기 위한 네이티브 애드온 개발 과정을 기록합니다.

## 시작 (날짜: YYYY-MM-DD)

*   **목표:** `contractCertRequest/c`의 C 라이브러리를 Node.js에서 사용 가능한 모듈로 만들기.
*   **주요 과제:** 개발자는 C/C++ 경험이 없으며, AI의 코드 생성 및 분석 지원에 크게 의존.
*   **접근 방식:** 점진적 개발, 상세 계획 수립 (`README.md` 참조).

## 1단계: 개발 환경 준비 및 검증 (완료)

*   필수 도구 (Node.js, npm, C++ 컴파일러, Python, node-gyp, node-addon-api) 설치 확인.
*   버전 확인 완료:
    *   Node.js: v20.14.0
    *   npm: 10.7.0
    *   Python: 3.10.0
    *   node-gyp: v11.2.0
*   **결과:** 개발 환경 준비 완료.

## 2단계: 기본 프로젝트 구조 및 초기 빌드 설정 (완료)

*   `contractCertRequest/nodejs_interface` 폴더 생성.
*   프로젝트 루트에 초기 `binding.gyp` 파일 생성 (C++ 래퍼만 포함).
*   `contractCertRequest/nodejs_interface`에 초기 `wrapper.cpp` 파일 생성 (기본 N-API 골격).
*   `node-gyp configure` 실행 성공.
*   `node-gyp build` 실행 성공 (`build/Release/cbv2g_addon.node` 생성 확인).
*   **결과:** 기본 N-API 애드온 빌드 성공. 빌드 시스템 및 기본 설정 검증 완료.

## 3단계: 핵심 기능 점진적 구현 (진행 중)

*   **목표:** `cbV2G` 라이브러리의 핵심 인코딩/디코딩 기능을 점진적으로 Node.js 애드온 함수로 구현하고 테스트합니다.
*   **첫 번째 반복 목표 (3.1 수정):** ISO 15118-20 `CertificateInstallationReq` 메시지를 JavaScript 객체로부터 EXI 바이너리로 인코딩하는 `encodeCertificateInstallationReq` 함수 구현.
    *   **계획:** C 코드 분석 -> JS<->C 매핑 설계 -> 초기 래퍼 함수 생성 -> `binding.gyp` 업데이트 -> 빌드 시도 및 오류 해결 -> 데이터 변환 로직 구현 (반복) -> 빌드 시도 및 오류 해결 -> 최소 기능 테스트 -> 런타임 오류 해결 및 안정화.
    *   **논의:** 초기 제안된 `SessionSetupReq` 대신 사용자의 주요 목표인 인증서 설치와 직접 관련된 `CertificateInstallationReq`를 첫 구현 대상으로 변경함.
*   **(3.2) C 코드 분석 완료:** `CertificateInstallationReq` 관련 C 구조체(`iso20_exiDocument` 등) 및 인코딩 함수(`encode_iso20_exiDocument`) 확인.
*   **(3.3) JS <-> C 데이터 매핑 설계 완료:** JavaScript 입력 객체 구조 정의 완료.
    *   **논의:** ISO 15118-20 표준에서 인증서 데이터를 Base64로 인코딩하여 전달하는 것이 기본 방식임을 확인. 따라서 JS 인터페이스에서도 인증서 관련 필드(certificate, subCertificates)는 **Base64 인코딩된 문자열**을 사용하기로 확정함. C++ 래퍼 내부에서 Base64 디코딩 수행 예정.
*   **(3.4) 초기 C++ 래퍼 함수 생성:** `wrapper.cpp`에 `encodeCertificateInstallationReq` 함수의 기본 골격 및 N-API 등록 코드 추가.
*   **(3.6) `binding.gyp` 업데이트:** `encode_iso20_exiDocument` 및 관련 C 소스 파일(`iso20_CommonMessages_Encoder.c`, `iso20_CommonMessages_Datatypes.c`, `exi_basetypes_encoder.c`, `exi_bitstream.c`, `exi_basetypes.c`) 경로를 `sources` 목록에 추가.
*   **(3.7) 빌드 시도 1:** `node-gyp build` 실행.
*   **(3.8) 빌드 오류 해결 1:** 컴파일러 오류 C1083 ('포함 파일을 열 수 없습니다.') 발생. 원인은 `wrapper.cpp`의 `#include` 경로가 `include_dirs` 기준으로 잘못 지정됨. `#include` 경로 수정 (`iso-20/file.h` -> `file.h`).
*   **(3.7) 빌드 시도 2:** 수정된 `wrapper.cpp`로 `node-gyp build` 재실행.
*   **(3.8) 빌드 오류 해결 2:** 링커 오류 LNK2001/LNK1120 ('확인할 수 없는 외부 기호') 발생 (`init_iso20_exiDocument`, `exi_bitstream_init`). 원인은 C/C++ 이름 규칙 차이(Name Mangling)로 추정됨. `wrapper.cpp`의 C 헤더 `#include` 문들을 `extern "C" { ... }` 블록으로 감싸도록 수정.
*   **(3.7) 빌드 시도 3:** `extern "C"` 수정 후 `node-gyp build` 재실행.
*   **(3.8) 빌드 오류 해결 3:** 동일한 링커 오류 LNK2001/LNK1120 발생. `binding.gyp`의 `sources` 목록에 필요한 C 소스 파일이 여전히 누락된 것으로 추정됨. Common 모듈의 나머지 파일(`exi_basetypes_decoder.c`, `exi_types_decoder.c`)을 `sources` 목록에 추가하도록 제안.
*   **(3.7) 빌드 시도 4:** Common 모듈 파일 추가 후 `node-gyp build` 재실행.
*   **(3.8) 빌드 오류 해결 4:** 이전과 동일한 링커 오류 LNK2001/LNK1120 발생 (`init_iso20_exiDocument`, `exi_bitstream_init`). Common 모듈 추가로 해결되지 않음. 원인 재분석 필요.
*   **(3.8) 문제 분리 시도:** 링크 오류의 원인을 명확히 하기 위해 ISO 15118-20 관련 코드를 임시로 제외하고 빌드 시도.
    *   `binding.gyp`의 `sources`에서 `iso20_CommonMessages_Encoder.c`, `iso20_CommonMessages_Datatypes.c` 임시 제거.
    *   `wrapper.cpp`에서 `init_iso20_exiDocument` 호출 및 관련 코드 임시 주석 처리.
*   **(3.7) 빌드 시도 5:** 문제 분리 설정 후 `node-gyp build` 재실행.
*   **(3.8) 빌드 오류 결과 5:** 여전히 링커 오류 LNK2001/LNK1120 발생. 이번에는 **`exi_bitstream_init`만** "확인할 수 없는 외부 기호"로 남음. `init_iso20_exiDocument` 오류는 사라짐.
    *   **결론:** 오류의 근본 원인은 `exi_bitstream.c` 파일의 `exi_bitstream_init` 함수가 제대로 링크되지 않는 문제에 있는 것으로 강하게 추정됨. ISO 15118-20 코드는 이차적인 문제였음.
*   **(3.8) 해결 시도 (1-1): 모든 Common 모듈 C 파일 포함:** `binding.gyp`의 `sources` 목록에 `common` 폴더 내 모든 `.c` 파일(`exi_header.c` 포함)을 추가.
*   **(3.7) 빌드 시도 6:** 모든 Common 모듈 포함 후 `node-gyp build` 재실행.
*   **(3.8) 빌드 오류 결과 6:** 여전히 `exi_bitstream_init`에 대한 링커 오류 LNK2001/LNK1120 발생. 모든 common 파일을 포함해도 해결되지 않음. 다른 원인 탐색 필요.
*   **(3.8) 해결 시도 (1-3): 명시적 C 컴파일 옵션:** 링크 오류 원인이 C/C++ 혼용 처리 문제일 가능성을 고려하여, `binding.gyp`의 `msvs_settings`에 `'CompileAs': 1` 옵션을 추가하여 C 파일들을 명시적으로 C로 컴파일하도록 시도.
*   **(3.7) 빌드 시도 7:** `CompileAs: 1` 설정 추가 후 `node-gyp configure` 및 `node-gyp build` 재실행.
*   **(3.8) 빌드 오류 결과 7:** 새로운 컴파일 오류 발생 (C1189: Unexpected compiler, expected C++ compiler). `CompileAs: 1` 설정으로 인해 C++ 코드(N-API 헤더 및 STL)를 C로 컴파일하려고 시도하면서 발생한 오류로 추정됨. 이 설정은 적합하지 않음.

**전략 변경:** 네이티브 애드온 방식의 지속적인 링크 오류 및 C++ 경험 부족으로 인한 구현/디버깅의 높은 난이도를 고려하여, **방법 2-2 (별도 C 실행 파일 + Node.js 자식 프로세스 호출)** 로 전략을 변경함. 네이티브 애드온 개발은 잠정 중단.

--- 

## 새로운 계획: 별도 C 실행 파일 개발 및 Node.js 연동

*   **목표:** `cbV2G` C 라이브러리를 사용하는 간단한 C 명령줄 실행 파일을 만들고, Node.js에서 이 파일을 실행하여 EXI 인코딩/디코딩 기능을 사용합니다.
*   **접근 방식:**
    1.  C 실행 파일 설계 (입출력 방식 정의: JSON via stdin, Base64 EXI via stdout).
    2.  C 실행 파일 구현 (`main` 함수 작성, 입력 파싱, 라이브러리 호출, 출력 생성).
    3.  C 실행 파일 컴파일 (GCC 또는 MSVC 사용, `node-gyp` 사용 안 함).
    4.  Node.js 인터페이스 구현 (`child_process.spawn` 사용).
    5.  단계별 테스트 및 디버깅.

**(다음 단계: C 실행 파일 설계 및 초기 구현)**

*   **(새로운 계획 2.1) C 실행 파일 설계 완료:** 입출력 방식으로 stdin (JSON 입력) / stdout (Base64 EXI 출력) / stderr (오류 메시지) 사용 결정.
*   **(새로운 계획 2.2) 초기 C 소스 파일 생성:** `contractCertRequest/c_executable/encoder_main.c` 파일에 기본 구조 및 라이브러리 함수 호출 골격 작성 완료.
*   **(새로운 계획 3.1) C 실행 파일 컴파일 시도 1 (GCC):** 제공된 GCC 명령어로 `encoder_main.c` 및 관련 C 라이브러리 파일 컴파일 시도.
*   **(새로운 계획 3.2) 컴파일 오류 결과 1:** `bash: gcc: command not found` 오류 발생. 시스템에 GCC 컴파일러가 설치되지 않았거나 PATH 환경 변수에 설정되지 않음.
*   **(새로운 계획 3.1) C 실행 파일 컴파일 시도 2 (GCC):** GCC 설치/설정 후 재시도.
*   **(새로운 계획 3.2) 컴파일 오류 결과 2:** `encoder_main.c`에서 컴파일 오류 발생 (`error: 'exi_bitstream_t' has no member named 'pos'`).
    *   **원인:** `encoder_main.c` 코드에서 인코딩된 크기를 가져오기 위해 `stream.pos`를 사용했으나, 실제 `exi_bitstream_t` 구조체에는 `pos` 멤버가 없고 `byte_pos`와 `bit_count`가 있음. 올바른 방법은 `exi_bitstream_get_length()` 함수 사용.
*   **(새로운 계획 3.1) C 실행 파일 컴파일 시도 3 (GCC):** `encoder_main.c`의 `stream.pos`를 `exi_bitstream_get_length(&stream)`로 수정한 후 재시도.
*   **(새로운 계획 3.2) 컴파일 결과 3:** **성공.** `contractCertRequest/c_executable/encoder.exe` 파일 생성 확인.
*   **(새로운 계획 3.3) C 실행 파일 기본 테스트 1:** `echo "{}" | ./contractCertRequest/c_executable/encoder.exe` 실행.
*   **(새로운 계획 3.4) 테스트 결과 1:** 표준 출력으로 "BASE64_PLACEHOLDER"가 나오지 않고, 표준 오류로 `Error: EXI encoding failed with code: -70` 메시지 출력 후 종료됨.
*   **(새로운 계획 3.5) EXI 인코딩 오류 원인 분석:** 인코딩 함수(`encode_iso20_exiDocument`)는 정상 호출되나, 입력 데이터(`doc` 구조체)가 JSON 파싱 로직 부재로 인해 비어있어 스키마 제약 조건 위반 오류 발생 확인.
*   **(새로운 계획 3.6) 핵심 로직 구현 방안 결정:**
    *   JSON 파싱: **cJSON 라이브러리** 사용하기로 결정.
    *   Base64 인코딩: 외부 라이브러리 대신 **간단한 구현을 직접 추가**하기로 결정.
*   **(새로운 계획 3.7) cJSON 라이브러리 준비:** 사용자가 `cJSON.c`, `cJSON.h` 파일을 다운로드하여 `contractCertRequest/c_executable/cjson/` 폴더에 위치시킴.
*   **(새로운 계획 3.8) `encoder_main.c` 업데이트:**
    *   `cJSON.h` include 추가.
    *   Base64 인코딩 함수 구현 추가.
    *   cJSON 파싱 기본 로직 추가 (`cJSON_Parse` 호출).
    *   Base64 인코딩 호출 및 결과 출력 로직 추가.
    *   메모리 관리 코드 추가 (`cJSON_Delete`, `free`).
    *   (주의: JSON 데이터 -> C 구조체 변환 로직은 아직 구현되지 않음)
*   **(새로운 계획 3.9) C 실행 파일 컴파일 시도 4 (GCC):** 업데이트된 `encoder_main.c`와 `cJSON.c`를 함께 컴파일.
*   **(새로운 계획 3.10) 컴파일 결과 4:** **성공.**
*   **(새로운 계획 3.11) C 실행 파일 기본 테스트 2:** 업데이트된 `encoder.exe`를 유효한 JSON 입력으로 테스트 (`echo '...' | ./encoder.exe`).
*   **(새로운 계획 3.12) 테스트 결과 2:** 예상대로 JSON 파싱 성공 후 EXI 인코딩에서 오류(-70) 발생. 프로그램 흐름 및 cJSON 연동 확인 완료.
*   **(새로운 계획 3.13) JSON -> C 구조체 변환 로직 구현 시작:** `encoder_main.c`에 Hex 디코딩 헬퍼 함수 추가 및 `messageHeader` 처리 로직 일부 구현.
*   **(새로운 계획 3.14) C 실행 파일 컴파일 시도 5 (GCC):** JSON 파싱 로직 일부 추가 후 컴파일.
*   **(새로운 계획 3.15) 컴파일 오류 결과 5:** 컴파일 오류 발생.
    *   `error: implicit declaration of function 'hex_decode'`
    *   `error: 'struct iso20_exiDocument' has no member named 'V2G_Message'` (다수 발생)
*   **(새로운 계획 3.16) `encoder_main.c` 컴파일 오류 수정 및 경고 해결:**
    *   `hex_decode` 함수 프로토타입 선언을 `main` 함수 이전에 추가하여 `implicit declaration` 오류 해결.
    *   주석 처리되어 있던 `hex_char_to_int` 및 `hex_decode` 함수 구현 추가. 관련 `unused parameter`, `control reaches end of non-void function` 경고 해결.
    *   사용하지 않는 `cert_req_id_chars` 변수 선언 및 관련 `free` 호출을 주석 처리하여 `unused variable` 경고 해결.
*   **(새로운 계획 3.17) 컴파일 결과:** **성공 (오류 및 경고 없음).**

---

*   **(새로운 계획 3.18) `CertificateInstallationReq` 필드 처리 (1): `OEMProvisioningCertificateChain.Certificate`**
    *   `base64_decode` 함수 및 헬퍼 함수 추가.
    *   `main` 함수에서 JSON의 `OEMProvisioningCertificateChain.Certificate` (Base64 문자열) 필드 파싱.
    *   `base64_decode`를 사용하여 디코딩하고 결과를 동적으로 할당된 메모리(`oem_prov_cert_bytes`)에 저장.
    *   디코딩된 데이터를 `memcpy`를 사용하여 `doc.CertificateInstallationReq.OEMProvisioningCertificateChain.Certificate` 구조체 멤버에 복사.
    *   디코딩된 데이터 크기가 C 구조체의 고정 버퍼 크기(`iso20_certificateType_BYTES_SIZE`)를 초과하는 경우에 대한 경고 및 처리 로직 추가 (잠재적 데이터 손실 언급).
    *   `cleanup` 레이블에 `free(oem_prov_cert_bytes)` 추가하여 메모리 누수 방지.
    *   상세 주석 추가.
*   **(새로운 계획 3.19) `CertificateInstallationReq` 필드 처리 (2): `ListOfRootCertificateIDs`**
    *   `main` 함수에서 JSON의 `ListOfRootCertificateIDs` (문자열 배열) 필드 파싱.
    *   JSON 배열 크기와 C 구조체 배열(`iso20_ListOfRootCertificateIDsType_RootCertificateID_ARRAY_SIZE` - *수정 필요*) 크기 비교 및 처리 제한.
    *   JSON 배열 순회하며 각 문자열 요소를 C 구조체 배열(`doc.CertificateInstallationReq.ListOfRootCertificateIDs.RootCertificateID.array`)의 `characters` 멤버에 복사.
    *   문자열 길이와 C 구조체 문자열 버퍼 크기(`iso20_rootCertificateIDType_CHARACTER_SIZE` - *수정 필요*) 비교 및 길이 제한 (잘라내기) 처리.
    *   오류 처리 (배열 요소가 문자열이 아닐 경우).
    *   상세 주석 추가.
*   **(새로운 계획 3.20) 린터 오류 발생:** `ListOfRootCertificateIDs` 처리 코드에서 정의되지 않은 매크로 및 잘못된 구조체 멤버 접근 오류 확인.

---

*   **(새로운 계획 3.21) `ListOfRootCertificateIDs` 처리 코드 린터 오류 수정 시도 (1):**
    *   가정된 매크로(`iso20_rootCertificateIDType_ARRAY_SIZE`, `iso20_idType_CHARACTER_SIZE`) 및 구조체 멤버(`characters`, `charactersLen`)를 사용하여 코드 수정.
*   **(새로운 계획 3.22) 린터 오류 결과 (1):** 실패. 여전히 동일한 매크로 정의 및 구조체 멤버 관련 오류 발생. 린터가 배열 요소 타입을 `iso20_X509IssuerSerialType`으로 식별함.

---

*   **(새로운 계획 3.23) 헤더 파일 분석 (`exi_basetypes.h`, `iso20_CommonMessages_Datatypes.h`):**
    *   `exi_signed_t` 구조체 및 변환 함수(`exi_basetypes_convert_to_signed`) 확인.
    *   `iso20_X509IssuerSerialType` 구조체 정의 확인 (`X509IssuerName` 멤버 및 `iso20_X509IssuerName_CHARACTER_SIZE` 매크로, `X509SerialNumber` 멤버 (`exi_signed_t` 타입)).
    *   `iso20_ListOfRootCertificateIDsType` 구조체 정의 확인 (`RootCertificateID` 멤버는 `iso20_X509IssuerSerialType` 타입 배열).
    *   `RootCertificateID` 배열 크기 매크로: `iso20_X509IssuerSerialType_20_ARRAY_SIZE` 확인.

---

*   **(새로운 계획 3.24) `ListOfRootCertificateIDs` 처리 코드 린터 오류 최종 수정:**
    *   확인된 매크로(`iso20_X509IssuerSerialType_20_ARRAY_SIZE`, `iso20_X509IssuerName_CHARACTER_SIZE`) 사용.
    *   `X509IssuerName` 멤버 접근 수정.
    *   `X509SerialNumber` 필드에 `exi_basetypes_convert_to_signed` 함수를 사용하여 0 할당.
*   **(새로운 계획 3.25) 컴파일 결과:** **성공 (경고 발생).** `base64_decode` 함수 내 삼항 연산자 관련 `[-Wsign-compare]` 경고 확인.

---

*   **(새로운 계획 3.26) `base64_decode` 함수 경고 수정:**
    *   경고를 유발하는 삼항 연산자를 `if/else` 문으로 변경하여 타입 불일치 문제 해결.
*   **(새로운 계획 3.27) 컴파일 결과:** **성공 (오류 및 경고 없음).**

---

*   **(새로운 계획 3.28) `CertificateInstallationReq` 필드 처리 (3): `MaximumContractCertificateChains`**
    *   `main` 함수에서 JSON의 `MaximumContractCertificateChains` (숫자) 필드 파싱.
    *   JSON 숫자 값의 유효 범위 (0-255) 및 정수 여부 확인.
    *   유효한 값을 `uint8_t`로 변환하여 C 구조체에 할당.
*   **(새로운 계획 3.29) 컴파일 오류 발생:** `MaximumContractCertificateChains` 처리 코드에서 `floor` 함수 사용으로 인한 컴파일 오류 (`implicit declaration`) 발생.

---

*   **(새로운 계획 3.30) `floor` 함수 관련 컴파일 오류 수정:**
    *   `encoder_main.c` 상단에 `#include <math.h>` 추가.
*   **(새로운 계획 3.31) 컴파일 결과:** **성공 (오류 및 경고 없음).**

---

*   **(새로운 계획 3.32) `CertificateInstallationReq` 필드 처리 (4): `PrioritizedEMAIDs` (선택적)**
    *   `main` 함수에서 JSON의 `PrioritizedEMAIDs` (문자열 배열) 필드를 선택적으로 파싱.
    *   필드가 존재하고 유효한 배열인 경우 `isUsed` 플래그 설정.
    *   JSON 배열 크기와 C 구조체 배열(`iso20_identifierType_8_ARRAY_SIZE`) 크기 비교 및 처리 제한.
    *   JSON 배열 순회하며 각 문자열 요소를 C 구조체 배열의 `characters` 멤버에 복사.
    *   문자열 길이와 C 구조체 문자열 버퍼 크기(`iso20_EMAID_CHARACTER_SIZE` - *오류 발생*) 비교 및 길이 제한 처리.
*   **(새로운 계획 3.33) 컴파일 오류 발생:** `PrioritizedEMAIDs` 처리 코드에서 `iso20_EMAID_CHARACTER_SIZE` 매크로 관련 컴파일 오류 발생 (오류 메시지 확인 필요).

---

*   **(새로운 계획 3.34) `PrioritizedEMAIDs` 처리 코드 컴파일 오류 수정:**
    *   헤더 파일 재확인을 통해 올바른 매크로 `iso20_EMAID_CHARACTER_SIZE` 확인 및 코드 수정.
*   **(새로운 계획 3.35) 컴파일 결과:** **성공 (오류 및 경고 없음).** -1
*   **(새로운 계획 3.36) `CertificateInstallationReq` 필드 처리 완료:** 주요 필수/선택 필드(`OEMProvisioningCertificateChain.Certificate`, `ListOfRootCertificateIDs`, `MaximumContractCertificateChains`, `PrioritizedEMAIDs`) 처리 로직 구현 완료. (일부 하위 필드 처리는 TODO 상태) -1

---

*   **(새로운 계획 3.37) C 실행 파일 (`encoder.exe`) 테스트 시도 (1):** 이전 실행 시 프로그램 멈춤 현상 발생.
*   **(새로운 계획 3.38) C 실행 파일 (`encoder.exe`) 테스트 시도 (2):**
    *   동일한 `test_cert_install_req.json` 파일을 사용하여 재실행.
    *   **결과:** JSON 파싱 성공 후, "Error: Failed to decode Base64 for OEMProvisioningCertificateChain.Certificate." 오류 발생하며 종료.
    *   **원인 분석:** `test_cert_install_req.json` 파일 내 `Certificate` 필드 값이 실제 Base64 데이터가 아닌 Placeholder 문자열("BASE64_ENCODED_OEM_PROV_CERT==") 이므로 디코딩 실패.

**(다음 단계: `test_cert_install_req.json` 파일의 인증서 데이터를 유효한 Base64 문자열로 수정 후 테스트 재시도)**

---

*   **(새로운 계획 3.39) C 실행 파일 (`encoder.exe`) 테스트 시도 (3):**
    *   `test_cert_install_req.json` 파일의 `Certificate` 필드를 실제 Base64 데이터로 수정한 후 재실행.
    *   **결과:** Base64 디코딩 성공 후, "Error: 'ListOfRootCertificateIDs' array not found or not an array in CertificateInstallationReq." 오류 발생하며 종료.
    *   **원인 재분석:** 이전에 제안된 코드 수정(`ListOfRootCertificateIDs`를 객체로 처리)이 적용되지 않은 것으로 보임. 실행 코드가 여전히 해당 필드를 배열로 잘못 예상하고 있음.

**(다음 단계: `ListOfRootCertificateIDs` 접근 로직 재수정 및 확인)**

---

*   **(새로운 계획 3.40) C 실행 파일 (`encoder.exe`) 테스트 시도 (4):**
    *   코드 변경 없음 확인 후 재컴파일 및 재실행.
    *   **결과:** 이전과 동일하게 "Error: 'ListOfRootCertificateIDs' array not found or not an array..." 오류 발생.
    *   **원인 분석:** 코드 수정이 실제 실행 파일에 반영되지 않았거나(컴파일 문제?), 코드 확인 과정에 오류가 있었을 가능성 높음.

**(다음 단계: `ListOfRootCertificateIDs` 처리 로직 코드 재확인)**

--- 

*   **(새로운 계획 3.41) `CertificateInstallationReq` 전체 필드 구현 (JSON 기반):**
    *   이전 단계에서 누락되었던 `OEMProvisioningCertificateChain`의 `Id` 속성 및 `SubCertificates` 필드 처리 로직 추가.
    *   `messageHeader`의 `Signature` 필드 존재 여부 확인 로직 추가 (상세 처리는 TODO).
    *   `ListOfRootCertificateIDs` 처리 로직을 JSON 객체 배열 입력에 맞게 수정 (`X509IssuerName`, `X509SerialNumber`).
*   **(새로운 계획 3.42) 컴파일 및 린터 오류 수정:**
    *   `Id_isUsed` 플래그 접근 오류 수정 (해당 플래그 없음 확인).
    *   Null 종료 문자 오류 (`\0` -> `\0`) 수정.
*   **(새로운 계획 3.43) Base64 디코딩 함수 개선:** 디코딩 실패 문제를 해결하기 위해 `base64_decode` 함수 로직 강화 (입력 유효성 검사, 패딩 처리, 오류 메시지 상세화).
*   **(새로운 계획 3.44) JSON 기반 통합 테스트 및 디버깅:**
    *   업데이트된 JSON 테스트 파일(`test_cert_install_req.json`) 사용.
    *   초기 테스트 시 하위 인증서 Base64 디코딩 실패 확인 -> 입력 데이터 유효성 문제로 판단.
    *   EXI 인코딩 단계에서 프로그램 크래시 발생.
    *   디버깅을 위해 오류 코드 출력 강화 (`fflush` 추가) 시도했으나 효과 없음.
    *   EXI 버퍼 크기 증가 시도했으나 효과 없음.
    *   **최소 JSON 데이터 테스트:** 필수 필드만 포함된 데이터로 테스트 시 성공 확인 -> 문제 원인이 복잡한 입력 데이터 내용(특히 인증서)에 있음을 시사.
    *   **단계적 데이터 추가 테스트:** 최소 데이터에 실제 주 인증서 추가 시 성공. 실제 하위 인증서 추가 시 Base64 디코딩 실패 재확인.
    *   **최종 테스트:** 유효한 하위 인증서 데이터로 교체 후 테스트 시 **모든 과정 성공 확인**. (`CertificateInstallationReq` JSON -> C Struct -> EXI 인코딩 완료)
*   **(새로운 계획 4.1) 입력 방식 변경 결정:** JSON 기반 `encoder.exe` 테스트 성공 후, 사용자의 요청에 따라 프로그램의 입력 방식을 **XML로 변경**하기로 결정.
*   **(새로운 계획 4.2) `DEVELOPER_NOTES.md` 업데이트:** XML 기반 처리 계획 상세화 및 기존 JSON 계획 제거.
*   **(새로운 계획 5.1) XML 구현 시작 - 코드 정리:** `encoder_main.c`에서 `cJSON` 관련 헤더, 변수, 함수 호출 제거.
*   **(새로운 계획 5.2) XML 구현 시작 - libxml2 연동:** `encoder_main.c`에 `libxml2` 헤더 추가, XML 파싱/XPath 관련 변수 선언, stdin XML 읽기 로직 추가, `libxml2` 초기화/파싱/컨텍스트 생성/정리 기본 코드 추가. (린터 헤더 경로 오류 발생)
*   **(새로운 계획 5.3) XML 구현 시작 - XPath 헬퍼 함수 추가:** `encoder_main.c`에 XPath 평가 및 결과(콘텐츠, 속성, 개수, 노드셋) 추출을 위한 정적 헬퍼 함수 4개 구현.
*   **(새로운 계획 5.4) XML 구현 시작 - Header 파싱:** XPath 및 헬퍼 함수를 사용하여 XML 입력으로부터 `messageHeader`의 `sessionId`, `timestamp`를 추출하고 C 구조체에 채우는 로직 구현. `Signature` 요소 존재 여부 확인 로직 추가. 메모리 관리 및 오류 처리 포함.
*   **(새로운 계획 5.5) XML 구현 완료 - Body 파싱:** XPath 및 헬퍼 함수, 루프 등을 사용하여 XML 입력으로부터 `messageBody`의 모든 필수/선택 필드(`OEMProvisioningCertificateChain` (Id, Certificate, SubCertificates), `ListOfRootCertificateIDs` (RootCertificateID 배열), `MaximumContractCertificateChains`, `PrioritizedEMAIDs`)를 추출하고 C 구조체에 채우는 로직 구현 완료. 데이터 변환, 배열 처리, 오류 처리, 메모리 관리 포함.

--- 