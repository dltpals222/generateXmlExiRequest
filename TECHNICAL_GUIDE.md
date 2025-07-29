# ISO 15118 인증서 생성 및 전송 도구 - 기술 상세 가이드

이 문서는 ISO 15118 인증서 생성 및 전송 도구의 상세한 기술 정보를 제공합니다.

## 목차

1. [EXI 변환 시스템](#exi-변환-시스템)
2. [암호화 및 서명 알고리즘](#암호화-및-서명-알고리즘)
3. [XML 구조 상세](#xml-구조-상세)
4. [데이터 처리 흐름](#데이터-처리-흐름)
5. [요청 전송 시스템](#요청-전송-시스템)
6. [오류 처리 및 복구](#오류-처리-및-복구)
7. [성능 최적화](#성능-최적화)

## EXI 변환 시스템

### 개요
EXI (Efficient XML Interchange)는 XML을 바이너리 형태로 압축하는 표준입니다. ISO 15118에서는 서명 계산을 위해 XML을 EXI로 변환한 후 해시를 계산합니다.

### exi_processor.jar 사용법
현재 시스템에서는 `exi_processor.jar`를 사용하여 EXI 처리를 합니다:

```bash
# XML을 EXI로 변환 (Java 클래스 호출)
java -cp exi_processor.jar com.lw.exiConvert.XmlEncode "XML_CONTENT"

# EXI를 XML로 변환 (Java 클래스 호출)  
java -cp exi_processor.jar com.lw.exiConvert.XmlDecode EXI_BYTE_ARRAY
```

### ExiProcessor 클래스 구현
`request/ExiProcessor.js`에서 EXI 처리를 담당합니다:

```javascript
class ExiProcessor {
    constructor() {
        this.initialized = false;
        this.classes = {};
        // JAR 파일 경로 설정
        const jarPath = path.join(__dirname, '..', 'exi_processor.jar');
        java.classpath.push(jarPath);
    }

    init() {
        const classNames = [
            'com.lw.exiConvert.XmlEncode',
            'com.lw.exiConvert.XmlDecode'
        ];

        for (const className of classNames) {
            try {
                const shortName = className.split('.').pop();
                this.classes[shortName] = java.import(className);
                console.log(`✓ 클래스 로드 성공: ${className}`);
            } catch (error) {
                console.error(`✗ 클래스 로드 실패: ${className}`);
            }
        }
        this.initialized = Object.keys(this.classes).length > 0;
    }

    // XML을 EXI로 인코딩 (바이너리 Buffer 반환)
    encodeXML(xmlContent) {
        if (!this.initialized || !this.classes.XmlEncode) {
            console.error('XmlEncode 클래스가 로드되지 않았습니다.');
            return null;
        }

        try {
            // 바이너리 Buffer를 직접 반환 (Base64 변환 없음)
            const result = this.classes.XmlEncode.encodeXMLSync(xmlContent);
            return result; // Binary Buffer
        } catch (error) {
            console.error('XML 인코딩 실패:', error.message);
            return null;
        }
    }
}
```

### V2Gdecoder.jar (ISO 15118-2 전용)
ISO 15118-2에서는 기존의 `V2Gdecoder.jar`를 사용합니다:

```bash
# XML을 EXI로 변환
java -jar V2Gdecoder.jar -x -f input.xml -o output.exi

# EXI를 XML로 변환
java -jar V2Gdecoder.jar -e -f input.exi -o output.xml
```

### EXI 헤더 수정 (ISO 15118-2)
ISO 15118-2에서는 EXI 헤더의 특정 비트를 수정해야 합니다:
```javascript
// EXI 헤더 수정
const modifiedExiData = Buffer.from(exiDataBuffer);
if (modifiedExiData.length > 2) {
    modifiedExiData[2] = modifiedExiData[2] & 0b11111011;
}
```

## 암호화 및 서명 알고리즘

### ISO 15118-2 알고리즘

#### ECDSA-SHA256
- **곡선**: secp256r1 (NIST P-256)
- **해시 함수**: SHA256
- **XML 서명 알고리즘**: `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256`
- **서명 길이**: 64 bytes (32 bytes r + 32 bytes s)

```javascript
// 서명 생성
const sign = crypto.createSign('SHA256');
sign.update(signedInfoExiBuffer);
sign.end();
const signatureBuffer = sign.sign(privateKeyPem);
```

### ISO 15118-20 알고리즘

#### ECDSA-SHA512
- **곡선**: secp521r1 (NIST P-521)
- **해시 함수**: SHA512
- **XML 서명 알고리즘**: `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512`
- **서명 길이**: 132 bytes (66 bytes r + 66 bytes s)

#### Ed448-SHAKE256
- **곡선**: Ed448
- **해시 함수**: SHAKE256
- **XML 서명 알고리즘**: `http://www.w3.org/2021/04/xmldsig-more#ed448`
- **서명 길이**: 114 bytes

```javascript
// Ed448 서명 생성
const sign = crypto.createSign('shake256');
sign.update(signedInfoExiBuffer);
sign.end();
const signatureBuffer = sign.sign(privateKeyPem);
```

### 알고리즘 자동 감지
```javascript
async function getAlgorithmsFromCert(certPath) {
    const publicKeyCmd = `openssl x509 -in "${certPath}" -noout -pubkey`;
    const { stdout: publicKeyPem } = await exec(publicKeyCmd);
    
    const publicKeyInfoCmd = `echo "${publicKeyPem}" | openssl pkey -pubin -text -noout`;
    const { stdout: publicKeyInfo } = await exec(publicKeyInfoCmd);
    
    if (publicKeyInfo.includes('ED448')) {
        return {
            keyType: 'Ed448',
            signatureAlgorithm: 'Ed448',
            hashAlgorithm: 'SHAKE256',
            xmldsigAlgorithm: 'http://www.w3.org/2021/04/xmldsig-more#ed448'
        };
    } else if (publicKeyInfo.includes('secp521r1')) {
        return {
            keyType: 'ECDSA',
            curve: 'secp521r1',
            signatureAlgorithm: 'ECDSA-SHA512',
            hashAlgorithm: 'SHA512',
            xmldsigAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512'
        };
    }
}
```

## XML 구조 상세

### 네임스페이스 변경사항
**중요**: XML Digital Signature 네임스페이스 접두사가 변경되었습니다:
- **이전**: `xmlns:xmlsig="http://www.w3.org/2000/09/xmldsig#"`
- **현재**: `xmlns:sig="http://www.w3.org/2000/09/xmldsig#"`

### ISO 15118-2 Install 메시지
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ns5:CertificateInstallationReq xmlns:ns5="urn:iso:15118:2:2013:MsgBody" 
                                xmlns:ns6="urn:iso:15118:2:2013:MsgDataTypes"
                                xmlns:ns4="http://www.w3.org/2000/09/xmldsig#"
                                ns5:Id="ID1">
  <ns5:OEMProvisioningCert>BASE64_ENCODED_CERT</ns5:OEMProvisioningCert>
  <ns5:SubCertificates>
    <ns5:Certificate>SUB_CERT_1</ns5:Certificate>
    <ns5:Certificate>SUB_CERT_2</ns5:Certificate>
  </ns5:SubCertificates>
  <ns5:ListOfRootCertificateIDs>
    <ns6:RootCertificateID>
      <ns4:X509IssuerSerial>
        <ns4:X509IssuerName>CN=Root CA,O=Organization</ns4:X509IssuerName>
        <ns4:X509SerialNumber>123456789</ns4:X509SerialNumber>
      </ns4:X509IssuerSerial>
    </ns6:RootCertificateID>
  </ns5:ListOfRootCertificateIDs>
</ns5:CertificateInstallationReq>
```

### ISO 15118-20 Request 메시지
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CertificateInstallationReq xmlns="urn:iso:std:iso:15118:-20:CommonMessages"
                            xmlns:ct="urn:iso:std:iso:15118:-20:CommonTypes"
                            xmlns:sig="http://www.w3.org/2000/09/xmldsig#"
                            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                            xsi:schemaLocation="urn:iso:std:iso:15118:-20:CommonMessages V2G_CI_CommonMessages.xsd">
  <ct:Header>
    <ct:SessionID>068457B13F73993B</ct:SessionID>
    <ct:TimeStamp>1751526905</ct:TimeStamp>
    <sig:Signature>
      <sig:SignedInfo>
        <sig:CanonicalizationMethod Algorithm="http://www.w3.org/TR/canonical-exi/"/>
        <sig:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512"/>
        <sig:Reference URI="#CertChain001">
          <sig:Transforms>
            <sig:Transform Algorithm="http://www.w3.org/TR/canonical-exi/"/>
          </sig:Transforms>
          <sig:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"/>
          <sig:DigestValue>BASE64_DIGEST</sig:DigestValue>
        </sig:Reference>
      </sig:SignedInfo>
      <sig:SignatureValue>BASE64_SIGNATURE</sig:SignatureValue>
    </sig:Signature>
  </ct:Header>
  <OEMProvisioningCertificateChain Id="CertChain001">
    <Certificate>OEM_CERT</Certificate>
    <SubCertificates>
      <Certificate>SUB_CERT_1</Certificate>
      <Certificate>SUB_CERT_2</Certificate>
    </SubCertificates>
  </OEMProvisioningCertificateChain>
  <ListOfRootCertificateIDs>
    <ct:RootCertificateID>
      <sig:X509IssuerSerial>
        <sig:X509IssuerName>CN=Root CA,O=Organization</sig:X509IssuerName>
        <sig:X509SerialNumber>123456789</sig:X509SerialNumber>
      </sig:X509IssuerSerial>
    </ct:RootCertificateID>
  </ListOfRootCertificateIDs>
  <MaximumContractCertificateChains>3</MaximumContractCertificateChains>
  <PrioritizedEMAIDs>
    <EMAID>KRLWSCBSZ0TUKY3</EMAID>
    <EMAID>KRLWSCJ8UM69O56</EMAID>
  </PrioritizedEMAIDs>
</CertificateInstallationReq>
```

### ISO 15118-20 Response 메시지 (테스트용)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CertificateInstallationRes xmlns="urn:iso:std:iso:15118:-20:CommonMessages"
                           xmlns:ct="urn:iso:std:iso:15118:-20:CommonTypes"
                           xmlns:sig="http://www.w3.org/2000/09/xmldsig#">
  <ct:Header>
    <ct:SessionID>RANDOM_SESSION_ID</ct:SessionID>
    <ct:TimeStamp>CURRENT_TIMESTAMP</ct:TimeStamp>
    <sig:Signature>
      <!-- 서명 정보 -->
    </sig:Signature>
  </ct:Header>
  
  <ResponseCode>OK</ResponseCode>
  <EVSEProcessing>Finished</EVSEProcessing>
  
  <CPSCertificateChain>
    <Certificate>CPS_CERT</Certificate>
    <SubCertificates>
      <Certificate>CPS_SUB_CERT</Certificate>
    </SubCertificates>
  </CPSCertificateChain>
  
  <SignedInstallationData Id="InstallData_001">
    <ContractCertificateChain>
      <Certificate>CONTRACT_CERT</Certificate>
      <SubCertificates>
        <Certificate>CONTRACT_SUB_CERT</Certificate>
      </SubCertificates>
    </ContractCertificateChain>
    
    <ECDHCurve>SECP521</ECDHCurve>
    <DHPublicKey>ECDH_PUBLIC_KEY_133_BYTES</DHPublicKey>
    <SECP521_EncryptedPrivateKey>ENCRYPTED_PRIVATE_KEY_94_BYTES</SECP521_EncryptedPrivateKey>
  </SignedInstallationData>
  
  <RemainingContractCertificateChains>3</RemainingContractCertificateChains>
</CertificateInstallationRes>
```

## 데이터 처리 흐름

### 1. 데이터 준비 단계
```javascript
// 1.1 인증서 로드
const oemCertPem = await fs.readFile(CONFIG.OEM_CERT_PATH, 'utf8');
const oemCertBase64 = oemCertPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r?\n|\s/g, '');

// 1.2 서브 인증서 로드
const subCertObjects = await loadSubCertificates(
    CONFIG.SUB_CERT_DIR,
    CONFIG.SUB_CERT_PATTERN,
    CONFIG.MAX_SUB_CERTS
);

// 1.3 세션 ID 생성
const sessionId = crypto.randomBytes(8).toString('hex').toUpperCase();

// 1.4 루트 인증서 정보 추출
const rootCertInfos = await extractRootCertificates(CONFIG.ROOT_CERTS_DIR);
```

### 2. DigestValue 계산 단계 (ISO 15118-20)
```javascript
// 2.1 인증서 체인 XML 생성
const chainFragment = createCertificateChainFragment(certData);

// 2.2 EXI 인코딩 (바이너리 Buffer 직접 반환)
const chainExiBuffer = exiProcessor.encodeXML(chainFragment);
if (!chainExiBuffer) {
    throw new Error('EXI 인코딩 실패');
}

// 2.3 해시 계산 (바이너리 데이터 직접 사용)
const hash = crypto.createHash(algorithms.hashAlgorithm.toLowerCase()); // 'sha512' or 'shake256'
hash.update(chainExiBuffer);
const calculatedDigestValue = hash.digest('base64');
```

### 3. SignatureValue 계산 단계 (ISO 15118-20)
```javascript
// 3.1 SignedInfo XML 생성
const signedInfoXmlString = createSignedInfoXML(calculatedDigestValue);

// 3.2 EXI 인코딩 (바이너리 Buffer 직접 반환)
const signedInfoExiBuffer = exiProcessor.encodeXML(signedInfoXmlString);
if (!signedInfoExiBuffer) {
    throw new Error('SignedInfo EXI 인코딩 실패');
}

// 3.3 서명 생성 (바이너리 데이터 직접 사용)
const privateKeyPem = await fs.readFile(CONFIG.PRIVATE_KEY_PATH, 'utf8');
const sign = crypto.createSign(algorithms.hashAlgorithm); // 'sha512' or 'shake256'
sign.update(signedInfoExiBuffer);
sign.end();
const signatureBuffer = sign.sign(privateKeyPem);
const calculatedSignatureValue = signatureBuffer.toString('base64');
```

### 4. Response 생성 특별 기능 (ISO 15118-20)
```javascript
// 4.1 ECDH 키 쌍 생성
function generateECDHKeys() {
    const keyPair = crypto.generateKeyPairSync('ec', {
        namedCurve: 'secp521r1',
        publicKeyEncoding: {
            type: 'spki',
            format: 'der'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'der'
        }
    });
    
    return {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey
    };
}

// 4.2 암호화된 개인키 생성 (94바이트)
function generateEncryptedPrivateKey() {
    return crypto.randomBytes(94);
}

// 4.3 SignedInstallationData 생성
const signedInstallationData = createSignedInstallationData(
    contractCertChain,
    ecdhKeys,
    encryptedPrivateKey
);
```

### 5. 최종 XML 생성 단계
```javascript
// 5.1 모든 요소 조합
const finalXml = createFinalXML(
    sessionId, 
    certData, 
    rootCertInfos, 
    calculatedDigestValue, 
    calculatedSignatureValue
);

// 5.2 파일 저장
const outputFileName = `${messageType}_${algorithms.keyType.toLowerCase()}.xml`;
await fs.writeFile(path.join('out', outputFileName), finalXml, 'utf8');
```

## 요청 전송 시스템

### JSON 래핑 전송 (send-xml.js)
표준 JSON 형태로 XML을 래핑하여 전송합니다:

```javascript
// 전송 데이터 구조
const requestData = {
    xmlContent: xmlFileContent,
    messageType: "request",
    algorithm: algorithmType, // "ecdsa" or "ed448"
    version: "20"
};

// HTTP POST 요청
const response = await fetch(url, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestData)
});

// 응답 저장 구조
const saveData = {
    timestamp: now.toISOString(),
    request: {
        sentData: requestData, // 전송한 전체 데이터
        url: url,
        method: 'POST'
    },
    response: {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData
    }
};
```

### EXI 인코딩 전송 (send-xml-exi.js)
ISO 15118-20 표준에 맞는 EXI 인코딩된 데이터를 전송합니다:

```javascript
// EXI 인코딩
const exiProcessor = new ExiProcessor();
exiProcessor.init();

const exiBuffer = exiProcessor.encodeXML(xmlContent);
const base64ExiData = exiBuffer.toString('base64');

// 전송 데이터 구조
const requestData = {
    iso15118SchemaVersion: "urn:iso:std:iso:15118:-20:CommonMessages",
    action: "install",
    exiRequest: base64ExiData
};

// 응답 저장 구조 (JSON 전송과 동일)
const saveData = {
    timestamp: now.toISOString(),
    request: {
        sentData: requestData, // EXI 전송 데이터 포함
        url: url,
        method: 'POST'
    },
    response: {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData
    }
};
```

### 전송 도구 사용법
```bash
# JSON 래핑 전송
npm run send-xml-ecdsa    # ECDSA 요청 전송
npm run send-xml-ed448    # Ed448 요청 전송

# EXI 인코딩 전송
npm run send-exi-ecdsa    # ECDSA EXI 요청 전송
npm run send-exi-ed448    # Ed448 EXI 요청 전송

# 기본 전송 (파일명 지정 가능)
node request/send-xml.js certificateInstallationReq_v20_ecdsa.xml
node request/send-xml-exi.js certificateInstallationReq_v20_ed448.xml
```

## 오류 처리 및 복구

### EXI 인코딩 실패 시 처리 (ISO 15118-20)
```javascript
try {
    const chainExiBuffer = exiProcessor.encodeXML(chainXmlString);
    if (!chainExiBuffer) {
        throw new Error('EXI 인코딩 실패');
    }
    const hash = crypto.createHash(algorithms.hashAlgorithm.toLowerCase());
    hash.update(chainExiBuffer);
    calculatedDigestValue = hash.digest('base64');
} catch (error) {
    console.error(`DigestValue 계산 실패: ${error.message}`);
    // 기본값 사용 또는 프로세스 중단
    throw error;
}
```

### 서명 실패 시 기본값 사용
```javascript
try {
    const signatureBuffer = sign.sign(privateKeyPem);
    calculatedSignatureValue = signatureBuffer.toString('base64');
} catch (error) {
    console.error(`SignatureValue 계산 실패: ${error.message}`);
    calculatedSignatureValue = 'SIGNATURE_CALCULATION_FAILED';
}
```

### 전송 실패 시 처리
```javascript
try {
    const response = await fetch(url, options);
    const responseData = await response.json();
    
    // 성공/실패 모두 로그 저장
    const saveData = {
        // ... 응답 데이터
    };
    
} catch (error) {
    console.error('요청 전송 실패:', error.message);
    
    // 에러도 로그에 저장
    const errorSaveData = {
        timestamp: new Date().toISOString(),
        request: { sentData: requestData },
        error: {
            message: error.message,
            type: error.constructor.name
        }
    };
    
    await fs.writeFile(responseFilePath, JSON.stringify(errorSaveData, null, 2));
}
```

### 전체 프로세스 실패 시 기본 XML 생성
```javascript
} catch (error) {
    console.error(`XML 생성 중 오류 발생:`, error.message);
    
    // 오류 발생 시에도 기본 XML 생성 시도
    const errorXml = createErrorXML(
        sessionId, 
        certData, 
        dynamicRootCerts, 
        calculatedDigestValue, 
        calculatedSignatureValue
    );
    
    await fs.writeFile(CONFIG.OUTPUT_XML_PATH, errorXml, 'utf8');
    console.log(`기본 XML이 생성되었습니다. 수동 확인이 필요합니다.`);
}
```

## 성능 최적화

### 1. EXI 프로세서 재사용
```javascript
// 전역 인스턴스 사용
const exiProcessor = new ExiProcessor();
exiProcessor.init();

// 여러 번 사용 시 재초기화 불필요
function processMultipleXML(xmlList) {
    return xmlList.map(xml => exiProcessor.encodeXML(xml));
}
```

### 2. 바이너리 데이터 직접 처리
```javascript
// Base64 중간 변환 제거
const exiBuffer = exiProcessor.encodeXML(xmlContent); // 직접 Buffer 반환
const hash = crypto.createHash('sha512');
hash.update(exiBuffer); // Buffer 직접 사용
const digestValue = hash.digest('base64');
```

### 3. 병렬 처리
```javascript
// 루트 인증서 정보 추출을 병렬로 처리
const opensslPromises = certFiles
    .filter(file => /\.(pem|crt|cer)$/i.test(file))
    .map(async (file) => {
        // 각 인증서 처리
    });

const results = await Promise.all(opensslPromises);
```

### 4. 메모리 효율성
- 큰 파일은 스트림으로 처리
- Base64 변환 시 버퍼 재사용
- 불필요한 문자열 복사 최소화
- EXI 데이터를 바이너리로 직접 처리

### 5. 캐싱 전략
- 인증서 정보 캐싱
- 알고리즘 감지 결과 캐싱
- 루트 인증서 정보 캐싱
- EXI 프로세서 인스턴스 재사용

## 디버깅 및 로깅

### 상세 로깅 레벨
```javascript
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    fg: {
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        cyan: "\x1b[36m",
    }
};

console.log(`${colors.fg.blue}[1/7] 데이터 준비 중...${colors.reset}`);
console.log(`  ${colors.fg.green}✅ OEM 인증서 로드 완료${colors.reset}`);
console.log(`  ${colors.fg.red}❌ 오류 발생${colors.reset}`);
```

### 디버그 정보 출력
```javascript
// 파일 크기 및 길이 정보
console.log(`  인증서 체인 XML 생성 완료 (길이: ${chainFragment.length})`);
console.log(`  파일 크기: ${fileStats.size} bytes`);

// 알고리즘 정보
console.log(`  감지된 알고리즘: ${algorithms.signatureAlgorithm} (${algorithms.keyType})`);

// EXI 인코딩 정보
console.log(`  [EXI] 인코딩 완료, 바이너리 길이: ${exiBuffer.length} bytes`);

// 전송 정보
console.log(`  [전송] ${method} ${url}`);
console.log(`  [응답] ${response.status} ${response.statusText}`);
```

### 중간 파일 저장 (디버깅용)
```javascript
// 디버깅을 위한 중간 파일 저장
await fs.writeFile(`debug_chain_fragment_${timestamp}.xml`, chainXmlString);
await fs.writeFile(`debug_signed_info_${timestamp}.xml`, signedInfoXmlString);
await fs.writeFile(`debug_exi_data_${timestamp}.bin`, exiBuffer);
```

## 보안 고려사항

### 1. 개인 키 보안
- 개인 키 파일은 적절한 권한으로 보호
- 메모리에서 키 정보 즉시 삭제
- 임시 파일에 키 정보 저장 금지
- 로그에 개인 키 정보 출력 금지

### 2. 입력 검증
- 인증서 파일 형식 검증
- 파일 크기 제한
- 경로 순회 공격 방지
- XML 구조 유효성 검증

### 3. 출력 검증
- 생성된 XML의 유효성 검증
- 서명 값의 정확성 확인
- 파일 권한 설정
- 민감한 정보 마스킹

### 4. 네트워크 보안
- HTTPS 사용 권장
- 요청/응답 데이터 암호화
- 타임아웃 설정
- 재시도 제한

## 프로젝트 구조

```
gen_xml/
├── gen-v2.js                 # ISO 15118-2 생성기
├── gen-v20.js               # ISO 15118-20 생성기
├── exi_processor.jar        # EXI 처리 JAR 파일
├── V2Gdecoder.jar          # ISO 15118-2 EXI 처리
├── request/                 # 요청 전송 도구
│   ├── ExiProcessor.js     # EXI 처리 클래스
│   ├── send-xml.js         # JSON 래핑 전송
│   ├── send-xml-exi.js     # EXI 인코딩 전송
│   └── README.md           # 전송 도구 가이드
├── out/                    # 생성된 파일 출력
├── cert/                   # 인증서 파일
├── key/                    # 개인 키 파일
├── root/                   # 루트 인증서
└── xmlSchema*/             # XML 스키마 파일
```

---

이 문서는 ISO 15118 인증서 생성 및 전송 도구의 기술적 세부사항을 다룹니다. 추가 질문이나 개선 사항이 있으시면 이슈를 등록해 주세요. 