## ISO 15118-2 XML 메시지 서명 생성 과정

XML 데이터를 서명하는 과정은 크게 **참조 생성(Reference Generation)**과 **서명 생성(Signature Generation)**의 두 단계로 나뉩니다. 예를 들어, `<CertificateInstallationReq>` 메시지를 서명한다고 가정하겠습니다. (설명 예시는 `<AuthorizationReq>`를 사용했지만, `<CertificateInstallationReq>`에도 동일하게 적용됨)

### 1.1 참조 생성 (Reference Generation)

- **목적**: 서명할 XML 데이터(예: `<CertificateInstallationReq>`)를 `<SignedInfo>` 요소에 포함시키기 위한 다이제스트(해시) 값을 생성합니다.
- **단계**:
    1.  **URI 설정**: 서명할 요소의 ID (`ns5:Id` 속성 값)를 `<Reference>` 요소의 `URI` 속성에 설정합니다. (예: `URI="#ID1"`)
    2.  **EXI 변환**: 서명할 XML 요소(이 경우 `<ns5:CertificateInstallationReq>`)를 EXI 형식으로 변환합니다. 이때 **V2G_CI_MsgDef 스키마**를 기반으로 한 **schema-informed fragment grammar**를 사용해야 합니다.
    3.  **해시 계산**: 변환된 EXI 데이터를 **SHA256** 알고리즘으로 해시합니다.
    4.  **DigestValue 추가**: 계산된 해시값을 Base64로 인코딩하여 `<Reference>` 요소의 `<DigestValue>`에 추가합니다.
- **참고**: 만약 여러 요소(예: Sales Tariffs)를 서명해야 한다면, 이 과정을 각 요소마다 반복하여 여러 `<Reference>` 요소를 생성합니다.

### 1.2 서명 생성 (Signature Generation)

- **목적**: `<SignedInfo>` 요소 전체를 서명하여 최종 서명값인 `<SignatureValue>`를 생성합니다.
- **단계**:
    1.  **EXI 변환 (Canonicalization)**: `<SignedInfo>` 요소 전체 (1.1 단계에서 생성된 `<DigestValue>` 포함)를 EXI 형식으로 변환합니다. 이때 **XMLdsig 스키마**를 기반으로 한 **schema-informed fragment grammar**를 사용해야 합니다. (이는 XML 표준의 Canonicalization(C14N)과는 다른 방식입니다.)
    2.  **해시 계산**: 변환된 EXI 데이터를 **SHA256** 알고리즘으로 해시합니다.
    3.  **서명값 생성**: 계산된 해시값을 제공된 **개인 키(secp256r1 곡선 사용)**를 이용하여 **ECDSA (Elliptic Curve Digital Signature Algorithm)** 방식으로 서명합니다. (구체적으로 `ecdsa-sha256`)
    4.  **Base64 인코딩**: 생성된 서명값을 Base64로 인코딩하여 `<SignatureValue>`에 추가합니다.
- **중요**: 이 단계에서의 서명은 `<SignedInfo>` 요소의 EXI 변환 결과만을 대상으로 하며, 원본 데이터(예: `<CertificateInstallationReq>`)는 이 서명 계산에 직접 사용되지 않습니다.

### 구현 시 주의사항

- **스키마 기반 EXI 변환**: 위 과정에서 가장 중요한 부분은 특정 XML 스키마(V2G_CI_MsgDef, XMLdsig)를 기반으로 XML의 특정 부분(fragment)을 EXI로 변환하는 것입니다. 이를 지원하는 도구나 라이브러리가 필요합니다.
- **개인 키**: 서명 생성에는 secp256r1 곡선을 사용하는 ECDSA 개인 키가 필요합니다. 