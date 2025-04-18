const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { create } = require('xmlbuilder2');
const util = require('util');
const { exec: execCb, spawn } = require('child_process');

// ANSI 색상 코드 정의
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        gray: "\x1b[90m",
    },
    bg: {
        black: "\x1b[40m",
        red: "\x1b[41m",
        green: "\x1b[42m",
        yellow: "\x1b[43m",
        blue: "\x1b[44m",
        magenta: "\x1b[45m",
        cyan: "\x1b[46m",
        white: "\x1b[47m",
        gray: "\x1b[100m",
    }
};

// exec를 Promise 기반으로 변환
const exec = util.promisify(execCb);

// --- 설정 값 ---
const OUT_DIR = path.join(__dirname, 'out'); // 출력 폴더
const OUTPUT_XML_PATH = path.join(OUT_DIR, 'certificateInstallationReq_20.xml'); // 생성될 XML 파일 경로
const OEM_PROV_CERT_PATH = path.join(__dirname, 'cert', 'oem_prov_cert_20.pem'); // OEM 인증서 경로 (-20 버전)
const PRIVATE_KEY_PATH = path.join(__dirname, 'key', 'private_20.key.pem'); // 개인 키 경로 (-20 버전)
const ROOT_CERTS_DIR = path.join(__dirname, 'root'); // 루트 인증서 폴더 경로
const JAR_PATH = path.join(__dirname, 'V2Gdecoder.jar'); // JAR 경로 수정 (상대 경로)
const SCHEMA_PATH = path.join(__dirname, 'xmlSchema', 'V2G_CI_CommonMessages.xsd'); // 스키마 경로 추가
const XMLDSIG_SCHEMA_PATH = path.join(__dirname, 'xmlSchema', 'xmldsig-core-schema.xsd'); // XML Signature 스키마 경로 추가
const EMAID_LIST_PATH = path.join(__dirname, 'emaid', 'prioritized_emaids.json'); // EMAID 리스트 파일 경로 추가

// --- 네임스페이스 정의 (ISO 15118-20 CommonMessages 기준) ---
const NAMESPACES = {
    ns: 'urn:iso:std:iso:15118:-20:CommonMessages', // Default namespace
    ct: 'urn:iso:std:iso:15118:-20:CommonTypes',
    ds: 'http://www.w3.org/2000/09/xmldsig#',
    xsi: 'http://www.w3.org/2001/XMLSchema-instance'
    // xmlsig 네임스페이스는 RootCertificateID 내부에서 사용되므로, 필요시 동적으로 추가하거나 확인 필요
};

// --- EXIConverter 클래스 정의 (V2 버전 기반 + 스키마/프래그먼트 옵션 추가 시도) ---
class EXIConverter {
    // schemaPath 와 isFragment 옵션 추가
    async encodeToEXI(xmlString, schemaPath = null, isFragment = false, encodingType = 'default') {
        const tempXmlFile = path.join(__dirname, `temp_encode_${encodingType}_${Date.now()}.xml`);
        const tempExiFile = path.join(__dirname, `temp_encode_${encodingType}_${Date.now()}.xml.exi`);
        console.log(`${colors.fg.cyan}  [EXI Converter] Encoding XML (${encodingType}) to EXI... Fragment: ${isFragment}, Schema: ${schemaPath || 'None'}${colors.reset}`);
        try {
            if (!xmlString || xmlString.trim() === '') throw new Error('Empty XML input');

            console.log(`${colors.dim}  [EXI Converter] Writing XML to temp file: ${tempXmlFile}${colors.reset}`);
            await fs.writeFile(tempXmlFile, xmlString, 'utf8');

            let executeJavaCommandArgs = [
                '-jar', JAR_PATH,
                '-x', // XML to EXI
                '-f', tempXmlFile,
                '-o', tempExiFile
            ];

            // 스키마 및 프래그먼트 옵션 추가 (JAR가 지원한다고 가정)
            if (schemaPath) {
                console.log(`${colors.dim}  [EXI Converter] Using schema: ${schemaPath}${colors.reset}`);
                // 실제 JAR 옵션은 다를 수 있음 (예: -schema, --schema, -xsd 등)
                executeJavaCommandArgs.push('-schema', schemaPath);
            }
            if (isFragment) {
                console.log(`${colors.dim}  [EXI Converter] Encoding as fragment.${colors.reset}`);
                // 실제 JAR 옵션은 다를 수 있음 (예: -fragment, --fragment 등)
                executeJavaCommandArgs.push('-fragment');
            }

            console.log(`${colors.dim}  [EXI Converter] Executing Java command...${colors.reset}`);
            await this.executeJavaCommand(executeJavaCommandArgs);

            console.log(`${colors.dim}  [EXI Converter] Reading encoded EXI file: ${tempExiFile}${colors.reset}`);
            const exiDataBuffer = await fs.readFile(tempExiFile);
            console.log(`${colors.dim}  [EXI Converter] Successfully read EXI data (length: ${exiDataBuffer.length})${colors.reset}`);

            // EXI 헤더 수정은 원본 메시지 인코딩 시 필요할 수 있으나, 프래그먼트 서명에는 불필요할 수 있음 (일단 유지)
            // const modifiedExiData = Buffer.from(exiDataBuffer);
            // if (modifiedExiData.length > 2) {
            //    modifiedExiData[2] = modifiedExiData[2] & 0b11111011;
            //    console.log('  [EXI Converter] Applied EXI header modification.');
            // } else {
            //    console.warn('  [EXI Converter] Warn: EXI data too short for header modification.');
            // }
            // const base64Result = modifiedExiData.toString('base64');
            const base64Result = exiDataBuffer.toString('base64'); // 수정 없이 Base64 반환

            if (!base64Result || base64Result.trim() === '') throw new Error('Empty EXI result after encoding');
            console.log(`${colors.fg.green}  [EXI Converter] Encoding successful (${encodingType}). Base64 length: ${base64Result.length}${colors.reset}`);
            return base64Result;

        } catch (error) {
            console.error(`${colors.fg.red}  [EXI Converter] Error in encodeToEXI (${encodingType}):${colors.reset}`, error);
            // 오류 발생 시 임시 파일 삭제 시도
            await fs.unlink(tempXmlFile).catch(err => console.error(`${colors.fg.red}  Error deleting temp XML file:${colors.reset} ${err.message}`));
            await fs.unlink(tempExiFile).catch(err => console.error(`${colors.fg.red}  Error deleting temp EXI file:${colors.reset} ${err.message}`));
            throw error;
        } finally {
            // 성공 시 임시 파일 삭제
            await fs.unlink(tempXmlFile).catch(err => {});
            await fs.unlink(tempExiFile).catch(err => {});
        }
    }

    executeJavaCommand(args) {
         return new Promise((resolve, reject) => {
            const java = spawn('java', args);
            let output = '';
            let error = '';
            console.log(`${colors.dim}    Java command:${colors.reset}`, 'java', args.join(' '));
            java.stdout.on('data', (data) => { output += data.toString(); });
            java.stderr.on('data', (data) => { error += data.toString(); console.error(`${colors.fg.yellow}    Java stderr:${colors.reset}`, data.toString()); });
            java.on('error', (err) => { console.error(`${colors.fg.red}    Java spawn error:${colors.reset}`, err); reject(err); });
            java.on('close', (code) => {
                console.log(`${colors.dim}    Java process exit code: ${code}${colors.reset}`);
                if (code === 0) { resolve(output); }
                else { reject(new Error(`${colors.fg.red}Java execution failed (code: ${code}). Stderr: ${error || 'N/A'}${colors.reset}`)); }
            });
        });
    }
}
const exiConverter = new EXIConverter(); // 인스턴스 생성

// --- 인증서 분석 및 알고리즘 결정 함수 ---
async function getAlgorithmsFromCert(certPath) {
    console.log(`${colors.fg.magenta}[+] 인증서 분석 시작: ${certPath}${colors.reset}`);
    try {
        const command = `openssl x509 -in "${certPath}" -noout -text | cat`; // | cat 추가
        console.log(`${colors.dim}  Executing: ${command}${colors.reset}`);
        const { stdout } = await exec(command);

        let publicKeyAlgorithm = null;
        let curveName = null; // For EC keys
        let keySize = null; // For EdDSA keys

        // 공개 키 알고리즘 추출
        const pkAlgoMatch = stdout.match(/Public Key Algorithm:\s*(\S+)/);
        if (pkAlgoMatch && pkAlgoMatch[1]) {
            publicKeyAlgorithm = pkAlgoMatch[1];
            console.log(`${colors.dim}  Public Key Algorithm: ${publicKeyAlgorithm}${colors.reset}`);

            // EC 키인 경우 커브 이름 또는 비트 크기 추출 시도
            if (publicKeyAlgorithm === 'id-ecPublicKey') {
                const oidMatch = stdout.match(/ASN1 OID:\s*(\S+)/);
                if (oidMatch && oidMatch[1]) {
                    curveName = oidMatch[1];
                    console.log(`${colors.dim}  EC Curve OID: ${curveName}${colors.reset}`);
                } else {
                    // OID가 없으면 Public-Key 비트 수라도 확인
                    const pkSizeMatch = stdout.match(/Public-Key:\s*\((\d+)\s*bit\)/);
                    if (pkSizeMatch && pkSizeMatch[1]) {
                        keySize = parseInt(pkSizeMatch[1], 10);
                        console.log(`${colors.dim}  EC Public-Key Size: ${keySize} bit${colors.reset}`);
                    }
                }
            } 
            // EdDSA 키인 경우 비트 크기 추출 시도 (예: Ed448)
            // EdDSA 키의 openssl 출력 형식 확인 필요 (알고리즘 이름으로 판별 가능할 수 있음)
             else if (publicKeyAlgorithm.includes('Ed448') || publicKeyAlgorithm.toLowerCase().includes('edwards-curve')) {
                const pkSizeMatch = stdout.match(/Public-Key:\s*\((\d+)\s*bit\)/);
                if (pkSizeMatch && pkSizeMatch[1]) {
                    keySize = parseInt(pkSizeMatch[1], 10);
                     console.log(`${colors.dim}  EdDSA Public-Key Size: ${keySize} bit${colors.reset}`);
                     // Ed448인지 확인
                    if (keySize === 448 || publicKeyAlgorithm.includes('Ed448')) {
                         // 명시적으로 Ed448로 간주
                         console.log(`${colors.dim}  Detected Ed448 key type.${colors.reset}`);
                    } else {
                         console.warn(`${colors.fg.yellow}  Detected EdDSA key but not confirmed as Ed448.${colors.reset}`);
                    }
                }
            }
        }

        if (!publicKeyAlgorithm) {
            throw new Error("인증서에서 공개 키 알고리즘을 추출하지 못했습니다.");
        }

        // 알고리즘 결정 로직 ([V2G20-2473] ~ [V2G20-2476] 기반)
        // EC 키 (secp521r1 또는 521 bit 가정 - ISO 15118-20 [V2G20-2674] 해당) -> ECDSA-SHA512 사용
        if (publicKeyAlgorithm === 'id-ecPublicKey' && (curveName === 'secp521r1' || keySize === 521)) {
            console.log(`${colors.fg.green}  알고리즘 결정: ECDSA-SHA512 (EC secp521r1)${colors.reset}`);
            return {
                signatureMethod: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512', // [V2G20-2473]
                digestMethod: 'http://www.w3.org/2001/04/xmlenc#sha512',            // [V2G20-2475]
                hashAlgo: 'sha512' // DigestValue 계산용
            };
        }
        // Ed448 키 ([V2G20-2319] 해당) -> Ed448-SHAKE256 사용
        else if ((publicKeyAlgorithm.includes('Ed448') || keySize === 448) && (publicKeyAlgorithm.includes('EdDSA') || publicKeyAlgorithm.toLowerCase().includes('edwards-curve')) ) {
             console.log(`${colors.fg.green}  알고리즘 결정: Ed448-SHAKE256 (Ed448)${colors.reset}`);
             return {
                signatureMethod: 'urn:iso:std:iso:15118:-20:Security:xmldsig#Ed448',   // [V2G20-2474]
                digestMethod: 'urn:iso:std:iso:15118:-20:Security:xmlenc#SHAKE256', // [V2G20-2476]
                hashAlgo: 'shake256' // DigestValue 계산용
             };
        }
        // 기타 지원하지 않는 키
        else {
            throw new Error(`${colors.fg.red}지원하지 않는 공개 키 알고리즘입니다: ${publicKeyAlgorithm} (Curve: ${curveName}, Size: ${keySize})${colors.reset}`);
        }

    } catch (error) {
        console.error(`${colors.fg.red}[!] 인증서 분석 중 오류 발생: ${certPath}${colors.reset}`, error);
        throw error; // 분석 실패 시 상위로 오류 전파
    }
}

// --- 메인 XML 생성 함수 ---
async function generateCertificateInstallationReqXmlV20() {
    let calculatedDigestValue = 'PLACEHOLDER_DIGEST_VALUE';
    let calculatedSignatureValue = 'PLACEHOLDER_SIGNATURE_VALUE';
    let sessionId = 'PLACEHOLDER_SESSION_ID';
    let oemCertBase64 = 'PLACEHOLDER_OEM_CERT';
    let rootCertInfos = [];
    let signingAlgorithms = null; // 서명 알고리즘 저장 변수
    let prioritizedEMAIDsList = []; // EMAID 리스트 저장 변수

    try {
        // --- 0. 출력 디렉토리 확인 및 생성 ---
        await fs.mkdir(OUT_DIR, { recursive: true });
        console.log(`${colors.fg.blue}[0/7] 출력 디렉토리 확인/생성 완료:${colors.reset} ${OUT_DIR}`);

        // --- 1. 데이터 준비 및 알고리즘 결정 ---
        console.log(`${colors.fg.blue}[1/7] 데이터 준비 및 알고리즘 결정...${colors.reset}`);

        // OEM 인증서 로드 (Base64)
        try {
            const oemCertPem = await fs.readFile(OEM_PROV_CERT_PATH, 'utf8');
            oemCertBase64 = oemCertPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r?\n|\s/g, '');
            if (!oemCertBase64) throw new Error('OEM 인증서 내용을 읽을 수 없습니다.');
            console.log(`${colors.dim}  OEM 인증서 로드 완료: ${OEM_PROV_CERT_PATH}${colors.reset}`);

            // 인증서 분석하여 알고리즘 결정
            signingAlgorithms = await getAlgorithmsFromCert(OEM_PROV_CERT_PATH);
            if (!signingAlgorithms) {
                // getAlgorithmsFromCert 내부에서 오류 throw 하므로 여기까지 오지 않음
                throw new Error("서명 알고리즘을 결정할 수 없습니다."); 
            }
             console.log(`${colors.fg.green}  사용될 알고리즘: Signature=${signingAlgorithms.signatureMethod}, Digest=${signingAlgorithms.digestMethod}, Hash=${signingAlgorithms.hashAlgo}${colors.reset}`);

        } catch (err) {
            console.error(`${colors.fg.red}  오류: OEM 인증서 (${OEM_PROV_CERT_PATH}) 로드 또는 분석 실패.${colors.reset}`, err);
            throw err;
        }

        // 세션 ID 생성
        sessionId = crypto.randomBytes(8).toString('hex').toUpperCase();
        console.log(`${colors.dim}  세션 ID 생성 완료: ${sessionId}${colors.reset}`);

        // 루트 인증서 정보 로드 (Issuer Name, Serial Number)
        try {
            const certFiles = await fs.readdir(ROOT_CERTS_DIR);
            const opensslPromises = certFiles
                .filter(file => /\.(pem|crt|cer)$/i.test(file))
                .map(async (file) => {
                    const certPath = path.join(ROOT_CERTS_DIR, file);
                    try {
                        // OpenSSL을 사용하여 IssuerName(RFC2253 형식)과 SerialNumber 추출
                        const subjectCmd = `openssl x509 -in "${certPath}" -noout -issuer -nameopt RFC2253`;
                        const serialCmd = `openssl x509 -in "${certPath}" -noout -serial`;
                        // 참고: example의 RootCertificateID/X509IssuerSerial/X509IssuerName 은 Issuer Name 임
                        const { stdout: subjectOut } = await exec(subjectCmd);
                        const { stdout: serialOut } = await exec(serialCmd);
                        const issuerName = subjectOut.replace(/^issuer=/, '').trim();
                        const serialHex = serialOut.replace(/^serial=/, '').trim();
                        // XML Schema Decimal 타입은 매우 큰 정수를 허용하므로 BigInt 사용 고려
                        const serialDecimal = serialHex ? BigInt('0x' + serialHex).toString() : null;

                        if (issuerName && serialDecimal) {
                            console.log(`${colors.dim}    - ${file}: Issuer=${issuerName}, Serial=${serialDecimal}${colors.reset}`);
                            return { issuerName, serialNumber: serialDecimal };
                        } else {
                            console.warn(`${colors.fg.yellow}    - ${file}: 정보 추출 실패 (Issuer: ${issuerName}, SerialHex: ${serialHex})${colors.reset}`);
                            return null;
                        }
                    } catch (e) {
                        console.error(`${colors.fg.red}  오류: 루트 인증서 처리 중 (${file})${colors.reset}`, e);
                        return null;
                    }
                });
            rootCertInfos = (await Promise.all(opensslPromises)).filter(c => c !== null);
            if (rootCertInfos.length === 0) {
                console.warn("${colors.fg.yellow}  경고: 루트 인증서 정보를 하나도 로드하지 못했습니다.${colors.reset}");
            }
            console.log(`${colors.dim}  루트 인증서 정보 ${rootCertInfos.length}개 로드 완료.${colors.reset}`);
        } catch (err) {
            console.error(`${colors.fg.red}  오류: 루트 인증서 폴더(${ROOT_CERTS_DIR})${colors.reset}`, err);
            throw err; // 루트 인증서 로드 실패 시 중단
        }

        // EMAID 리스트 로드 (추가)
        try {
            console.log(`${colors.dim}  Loading EMAID list from: ${EMAID_LIST_PATH}${colors.reset}`);
            const emaidFileContent = await fs.readFile(EMAID_LIST_PATH, 'utf8');
            prioritizedEMAIDsList = JSON.parse(emaidFileContent);
            if (!Array.isArray(prioritizedEMAIDsList)) {
                 console.warn(`${colors.fg.yellow}  경고: EMAID 파일(${EMAID_LIST_PATH}) 내용이 JSON 배열 형식이 아닙니다. 빈 리스트로 처리합니다.${colors.reset}`);
                 prioritizedEMAIDsList = [];
            }
             console.log(`${colors.dim}  EMAID list loaded: ${prioritizedEMAIDsList.join(', ')}${colors.reset}`);
        } catch (err) {
            if (err.code === 'ENOENT') { // 파일이 없을 경우
                console.warn(`${colors.fg.yellow}  경고: EMAID 파일(${EMAID_LIST_PATH})을 찾을 수 없습니다. <PrioritizedEMAIDs> 요소는 생략됩니다.${colors.reset}`);
            } else { // JSON 파싱 오류 등 기타 오류
                console.error(`${colors.fg.red}  오류: EMAID 파일(${EMAID_LIST_PATH}) 처리 중 오류 발생.${colors.reset}`, err);
            }
            prioritizedEMAIDsList = []; // 오류 시 빈 리스트로 초기화
        }

        // --- 임시 XML 구조 생성 (서명 대상 추출용) ---
        // 서명 계산을 위해 먼저 서명될 요소를 포함한 임시 XML 구조를 만듭니다.
        // 실제 최종 XML은 나중에 생성합니다.
        const tempRootForDigest = create({ version: '1.0', encoding: 'UTF-8' });
        const elementToDigestId = "CertChain001"; // 서명 대상 요소의 ID

        // OEMProvisioningCertificateChain 요소를 임시 구조에 추가 (ID 포함)
        const oemProvCertChainNode = tempRootForDigest.ele(NAMESPACES.ns, 'OEMProvisioningCertificateChain', { Id: elementToDigestId });
        oemProvCertChainNode.ele(NAMESPACES.ns, 'Certificate').txt(oemCertBase64);
        // 실제 사용 시 SubCertificates도 포함해야 할 수 있음

        // 서명 대상 요소의 XML 문자열 추출 (네임스페이스 포함, prettyPrint 없이)
        // xmlbuilder2는 부모의 네임스페이스를 자동으로 상속하지 않으므로,
        // 필요한 네임스페이스를 fragment 자체에 선언해야 할 수 있습니다.
        // 여기서는 간단히 toString()을 사용하지만, 실제로는 C14N과 유사한 처리가 필요할 수 있습니다.
        let oemProvCertChainXmlString = oemProvCertChainNode.toString({ prettyPrint: false });
        console.log(`${colors.dim}[Debug] XML Fragment for Digest:
${oemProvCertChainXmlString}${colors.reset}`);

        // --- 2. DigestValue 계산 (동적 해시 알고리즘 사용) ---
        console.log(`${colors.fg.blue}[2/7] DigestValue 계산 시작 (Hash: ${signingAlgorithms.hashAlgo})...${colors.reset}`);
        try {
            // 1. XML Fragment를 EXI로 인코딩
            console.log('  1. Encoding XML fragment to EXI...');
            const oemFragmentExiBase64 = await exiConverter.encodeToEXI(
                oemProvCertChainXmlString,
                SCHEMA_PATH,
                true,
                'oem_fragment'
            );
            const oemFragmentExiBuffer = Buffer.from(oemFragmentExiBase64, 'base64');
            console.log(`${colors.dim}  Encoded EXI Fragment Length: ${oemFragmentExiBuffer.length}${colors.reset}`);

            // 2. EXI 데이터의 해시 계산 (동적으로 결정된 알고리즘 사용)
            console.log(`  2. Calculating ${signingAlgorithms.hashAlgo.toUpperCase()} hash of EXI fragment...`);
            const hash = crypto.createHash(signingAlgorithms.hashAlgo); // 동적 알고리즘 사용
            hash.update(oemFragmentExiBuffer);
            const digest = hash.digest();

            // 3. 해시 결과를 Base64로 인코딩
            calculatedDigestValue = digest.toString('base64');
            console.log(`${colors.fg.green}[2/7] DigestValue 계산 완료:${colors.reset} ${calculatedDigestValue}`);

        } catch (error) {
            console.error(`${colors.fg.red}[2/7] DigestValue 계산 중 오류 발생:${colors.reset}`, error);
            calculatedDigestValue = 'ERROR_DIGEST_VALUE';
        }

        // --- 3. SignatureValue 계산 --- 
        console.log(`${colors.fg.blue}[3/7] SignatureValue 계산 시작 (Using ${signingAlgorithms.signatureMethod})...${colors.reset}`);
        try {
            // 1. <ds:SignedInfo> XML 문자열 생성
            console.log('  1. Generating <ds:SignedInfo> XML fragment...');
            const signedInfoBuilder = create({ version: '1.0', encoding: 'UTF-8' })
                // ds 네임스페이스를 명시적으로 선언해야 EXI 인코딩 시 인식 가능
                .ele(NAMESPACES.ds, 'SignedInfo', { 'xmlns:ds': NAMESPACES.ds }); 

            // CanonicalizationMethod 추가
            signedInfoBuilder.ele(NAMESPACES.ds, 'CanonicalizationMethod', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
            // SignatureMethod 추가 (동적 결정된 값)
            signedInfoBuilder.ele(NAMESPACES.ds, 'SignatureMethod', { Algorithm: signingAlgorithms.signatureMethod });
            // Reference 추가
            const referenceBuilder = signedInfoBuilder.ele(NAMESPACES.ds, 'Reference', { URI: `#${elementToDigestId}` });
            referenceBuilder.ele(NAMESPACES.ds, 'Transforms')
                .ele(NAMESPACES.ds, 'Transform', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
            referenceBuilder.ele(NAMESPACES.ds, 'DigestMethod', { Algorithm: signingAlgorithms.digestMethod });
            referenceBuilder.ele(NAMESPACES.ds, 'DigestValue').txt(calculatedDigestValue); // 계산된 DigestValue 사용

            // SignedInfo XML 문자열 추출 (prettyPrint 없이)
            // 루트 요소(SignedInfo) 자체의 문자열 얻기
            const signedInfoXmlString = signedInfoBuilder.root().first().toString({ prettyPrint: false }); 
            console.log(`${colors.dim}[Debug] XML Fragment for Signature:
${signedInfoXmlString}${colors.reset}`);

            // 2. <ds:SignedInfo> EXI 인코딩 (XML Signature 스키마 사용, [V2G20-1449])
            console.log(`  2. Encoding <ds:SignedInfo> fragment to EXI using ${path.basename(XMLDSIG_SCHEMA_PATH)}...`);
            const signedInfoExiBase64 = await exiConverter.encodeToEXI(
                signedInfoXmlString,
                XMLDSIG_SCHEMA_PATH, // XML Signature 스키마 사용
                true, // 프래그먼트 인코딩
                'signed_info'
            );
            const signedInfoExiBuffer = Buffer.from(signedInfoExiBase64, 'base64');
            console.log(`${colors.dim}  Encoded SignedInfo EXI Length: ${signedInfoExiBuffer.length}${colors.reset}`);

            // 3. EXI 데이터 해싱 (SignatureMethod에 맞는 해시 알고리즘 사용)
            console.log(`  3. Calculating ${signingAlgorithms.hashAlgo.toUpperCase()} hash of SignedInfo EXI...`);
            const signedInfoHash = crypto.createHash(signingAlgorithms.hashAlgo);
            signedInfoHash.update(signedInfoExiBuffer);
            const digestToSign = signedInfoHash.digest(); // 원시 바이너리 해시
            console.log(`${colors.dim}  Hash to sign (Base64): ${digestToSign.toString('base64')}${colors.reset}`);

            // 4. 개인 키 로드 및 해시 값 서명
            console.log(`${colors.dim}  4. Loading private key: ${PRIVATE_KEY_PATH}${colors.reset}`);
            const privateKeyPem = await fs.readFile(PRIVATE_KEY_PATH, 'utf8');
            
            console.log(`${colors.dim}  Signing hash using private key and algorithm ${signingAlgorithms.hashAlgo}...${colors.reset}`);
            const signer = crypto.createSign(signingAlgorithms.hashAlgo); // 해시 알고리즘 지정
            signer.update(digestToSign); // 원시 바이너리 해시 전달
            signer.end();
            
            // ECDSA 서명 시 DER 인코딩 적용 (ISO 15118-2 예제 및 일반적 관행 참고)
            // EdDSA의 경우 인코딩 옵션 불필요하거나 다를 수 있음 -> 현재 EdDSA 지원 안함 가정
            let signatureOptions = { key: privateKeyPem };
            if (signingAlgorithms.signatureMethod.includes('ecdsa')) {
                console.log(`${colors.dim}  Applying DER encoding for ECDSA signature.${colors.reset}`);
                signatureOptions.dsaEncoding = 'der'; 
            }
            const signature = signer.sign(signatureOptions); // 원시 바이너리 서명 값
            console.log(`${colors.dim}  Raw signature length: ${signature.length}${colors.reset}`);

            // 5. 서명 값 Base64 인코딩
            calculatedSignatureValue = signature.toString('base64');
            console.log(`${colors.fg.green}[3/7] SignatureValue 계산 완료 (Base64):${colors.reset} ${calculatedSignatureValue}`);

        } catch(error) {
            console.error(`${colors.fg.red}[3/7] SignatureValue 계산 중 오류 발생:${colors.reset}`, error);
            calculatedSignatureValue = 'ERROR_SIGNATURE_VALUE';
        }

        // --- 4. 최종 XML 조립 (계산된 SignatureValue 적용) ---
        console.log(`${colors.fg.blue}[4/7] 최종 XML 구조 조립...${colors.reset}`);
        const root = create({ version: '1.0', encoding: 'UTF-8' })
            .ele(NAMESPACES.ns, 'CertificateInstallationReq', { // Root element with default namespace
                'xmlns': NAMESPACES.ns, // Default namespace declaration
                'xmlns:ct': NAMESPACES.ct,
                'xmlns:ds': NAMESPACES.ds,
                'xmlns:xsi': NAMESPACES.xsi,
                'xsi:schemaLocation': 'urn:iso:std:iso:15118:-20:CommonMessages V2G_CI_CommonMessages.xsd' // 스키마 위치 명시 (실제 유효성 검증에 사용될 수 있음)
            });

        // Header (ISO 15118-20 CommonTypes 네임스페이스 사용)
        const header = root.ele(NAMESPACES.ct, 'Header');
        header.ele(NAMESPACES.ct, 'SessionID').txt(sessionId);
        header.ele(NAMESPACES.ct, 'TimeStamp').txt(Math.floor(Date.now() / 1000)); // 초 단위 타임스탬프 (xsd:unsignedLong)

        // Signature (XMLDSig 네임스페이스 사용)
        const signature = root.ele(NAMESPACES.ds, 'Signature'); // 예제와 달리 Header 바깥에 위치? -> 예제 확인 결과 루트 요소 바로 아래 자식으로 위치. 수정.
        // Signature 요소 위치 수정: 루트 요소의 자식으로 이동
        // const signature = root.ele(NAMESPACES.ds, 'Signature', { Id: "Signature1" }); // 예제처럼 Id 추가 가능
        // signature.att('Id', 'Signature1'); // Id 속성 추가 방식 변경

        const signedInfo = signature.ele(NAMESPACES.ds, 'SignedInfo');
        // [V2G20-765] CanonicalizationMethod Algorithm 수정
        signedInfo.ele(NAMESPACES.ds, 'CanonicalizationMethod', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
        // [V2G20-2473] SignatureMethod Algorithm 수정 (ecdsa-sha512)
        signedInfo.ele(NAMESPACES.ds, 'SignatureMethod', { Algorithm: signingAlgorithms.signatureMethod });

        const reference = signedInfo.ele(NAMESPACES.ds, 'Reference', { URI: `#${elementToDigestId}` }); // 위에서 정의한 ID 참조
        const transforms = reference.ele(NAMESPACES.ds, 'Transforms');
        // [V2G20-766] Transform Algorithm 수정, [V2G20-767] Transform은 하나만
        transforms.ele(NAMESPACES.ds, 'Transform', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
        // [V2G20-2475] DigestMethod Algorithm 수정 (sha512)
        reference.ele(NAMESPACES.ds, 'DigestMethod', { Algorithm: signingAlgorithms.digestMethod });
        reference.ele(NAMESPACES.ds, 'DigestValue').txt(calculatedDigestValue); // 계산된 DigestValue 사용

        signature.ele(NAMESPACES.ds, 'SignatureValue').txt(calculatedSignatureValue); // 계산된 값 사용 (현재 Placeholder)

        // OEMProvisioningCertificateChain (Id 추가하여 서명 대상 식별)
        const finalOemProvCertChain = root.ele(NAMESPACES.ns, 'OEMProvisioningCertificateChain', { Id: elementToDigestId });
        finalOemProvCertChain.ele(NAMESPACES.ns, 'Certificate').txt(oemCertBase64);
        // SubCertificates는 예제에 없으므로 생략. 필요시 PEM 파일 파싱하여 추가 필요.
        // const subCerts = oemProvCertChain.ele(NAMESPACES.ns, 'SubCertificates');
        // subCerts.ele(NAMESPACES.ns, 'Certificate').txt('SUB_CERT_1_BASE64');

        // ListOfRootCertificateIDs (CommonTypes 네임스페이스 사용)
        const listOfRoots = root.ele(NAMESPACES.ns, 'ListOfRootCertificateIDs');
        rootCertInfos.forEach(certInfo => {
            const rootCertId = listOfRoots.ele(NAMESPACES.ct, 'RootCertificateID'); // ct 네임스페이스 사용
            // 예제에는 xmlsig:X509IssuerSerial 이 있지만, ds 네임스페이스가 표준임. ds 사용.
            // 네임스페이스 접두사 'xmlsig'는 예제에서 정의되지 않았으므로 'ds'를 사용하는 것이 안전.
            // 실제 스키마(xmldsig-core-schema.xsd) 확인 필요. 여기서는 ds로 진행.
            const issuerSerial = rootCertId.ele(NAMESPACES.ds, 'X509IssuerSerial');
            issuerSerial.ele(NAMESPACES.ds, 'X509IssuerName').txt(certInfo.issuerName);
            issuerSerial.ele(NAMESPACES.ds, 'X509SerialNumber').txt(certInfo.serialNumber);
        });

        // MaximumContractCertificateChains
        root.ele(NAMESPACES.ns, 'MaximumContractCertificateChains').txt('2'); // 예제 값 사용

        // PrioritizedEMAIDs (동적 생성)
        if (prioritizedEMAIDsList.length > 0) {
            console.log(`${colors.dim}  Adding PrioritizedEMAIDs element with ${prioritizedEMAIDsList.length} items...${colors.reset}`);
            const prioritizedEMAIDsElement = root.ele(NAMESPACES.ns, 'PrioritizedEMAIDs');
            prioritizedEMAIDsList.forEach(emaid => {
                prioritizedEMAIDsElement.ele(NAMESPACES.ns, 'EMAID').txt(emaid);
            });
        } else {
            console.log(`${colors.dim}  Skipping PrioritizedEMAIDs element as the list is empty.${colors.reset}`);
        }

        // 최종 XML 문자열 생성 (prettyPrint: true 로 가독성 높임)
        const xmlString = root.end({ prettyPrint: true });
        console.log(`${colors.fg.blue}[5/7] 최종 XML 구조 생성 완료.${colors.reset}`);

        // --- 5. 생성된 XML 파일 저장 ---
        console.log(`${colors.fg.blue}[6/7] 최종 XML 파일 저장...${colors.reset}`);
        await fs.writeFile(OUTPUT_XML_PATH, xmlString, 'utf8');
        console.log(`${colors.fg.green}[7/7] 성공: XML 파일이 '${OUTPUT_XML_PATH}' 경로에 생성되었습니다.${colors.reset}`);
        if (calculatedDigestValue.startsWith('ERROR') || calculatedSignatureValue.startsWith('ERROR')) {
            console.error(`${colors.fg.red}  오류: DigestValue 또는 SignatureValue 계산에 실패했습니다. XML 파일 내용을 확인하세요.${colors.reset}`);
        } else {
             console.log(`${colors.fg.green}  DigestValue 및 SignatureValue 계산이 완료되었습니다.${colors.reset}`);
        }
        console.warn(`${colors.fg.yellow}  경고: 사용된 EXI 변환기(V2Gdecoder.jar)가 스키마 기반 프래그먼트 인코딩을 완벽히 지원하지 않을 수 있습니다.${colors.reset}`);
        console.warn(`${colors.fg.yellow}  사용된 알고리즘: Signature=${signingAlgorithms.signatureMethod}, Digest=${signingAlgorithms.digestMethod}, Hash=${signingAlgorithms.hashAlgo}${colors.reset}`);

        return xmlString;

    } catch (error) {
        console.error(`${colors.fg.red}최종 XML 생성 중 오류 발생:${colors.reset}`, error);
        // 오류 발생 시에도 기본 구조와 오류 값으로 파일 저장 시도 (디버깅 목적)
        try {
            console.warn(`${colors.fg.yellow}  오류 발생... 기본 오류 값으로 XML 파일 저장을 시도합니다.${colors.reset}`);
            // 오류 XML 생성 시에도 알고리즘 정보 필요 (만약 signingAlgorithms가 null이면 기본값 사용)
            const errorAlgorithms = signingAlgorithms || {
                 signatureMethod: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512', // 기본값
                 digestMethod: 'http://www.w3.org/2001/04/xmlenc#sha512', // 기본값
                 hashAlgo: 'sha512' // 기본값
             };
            const errorXmlString = createErrorXmlV20(sessionId, oemCertBase64, rootCertInfos, calculatedDigestValue, calculatedSignatureValue, errorAlgorithms);
            await fs.writeFile(OUTPUT_XML_PATH, errorXmlString, 'utf8');
            console.log(`${colors.fg.yellow}  경고: 오류가 발생하여 기본 오류 값을 포함한 XML 파일이 저장되었습니다: ${OUTPUT_XML_PATH}${colors.reset}`);
        } catch (writeError) {
            console.error(`${colors.fg.red}  오류 XML 파일 저장 실패:${colors.reset}`, writeError);
        }
        throw error; // 원래 오류 다시 throw
    }
}

// 오류 발생 시 기본 XML 생성 함수 (V20 버전) - 알고리즘 인자 추가
function createErrorXmlV20(sessionId, oemCertBase64, rootCertInfos, digestValue, signatureValue, algorithms) {
    const root = create({ version: '1.0', encoding: 'UTF-8' })
        .ele(NAMESPACES.ns, 'CertificateInstallationReq', {
            'xmlns': NAMESPACES.ns, 'xmlns:ct': NAMESPACES.ct, 'xmlns:ds': NAMESPACES.ds,
            'xmlns:xsi': NAMESPACES.xsi,
            'xsi:schemaLocation': 'urn:iso:std:iso:15118:-20:CommonMessages V2G_CI_CommonMessages.xsd'
        });
    // Header
    const header = root.ele(NAMESPACES.ct, 'Header');
    header.ele(NAMESPACES.ct, 'SessionID').txt(sessionId || 'ERROR_SESSION');
    header.ele(NAMESPACES.ct, 'TimeStamp').txt(Math.floor(Date.now() / 1000));
    // Signature (Error Placeholder)
    const signature = root.ele(NAMESPACES.ds, 'Signature');
    const signedInfo = signature.ele(NAMESPACES.ds, 'SignedInfo');
    // 알고리즘 적용
    signedInfo.ele(NAMESPACES.ds, 'CanonicalizationMethod', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
    signedInfo.ele(NAMESPACES.ds, 'SignatureMethod', { Algorithm: algorithms.signatureMethod });
    const reference = signedInfo.ele(NAMESPACES.ds, 'Reference', { URI: '#CertChain001' });
    reference.ele(NAMESPACES.ds, 'Transforms').ele(NAMESPACES.ds, 'Transform', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
    reference.ele(NAMESPACES.ds, 'DigestMethod', { Algorithm: algorithms.digestMethod });
    reference.ele(NAMESPACES.ds, 'DigestValue').txt(digestValue); // ERROR_DIGEST_VALUE
    signature.ele(NAMESPACES.ds, 'SignatureValue').txt(signatureValue); // ERROR_SIGNATURE_VALUE
    // KeyInfo 제거됨
    // Body (Error Placeholder)
    const oemProvCertChain = root.ele(NAMESPACES.ns, 'OEMProvisioningCertificateChain', { Id: 'CertChain001' });
    oemProvCertChain.ele(NAMESPACES.ns, 'Certificate').txt(oemCertBase64 || 'ERROR_OEM_CERT');
    const listOfRoots = root.ele(NAMESPACES.ns, 'ListOfRootCertificateIDs');
    if (rootCertInfos && rootCertInfos.length > 0) {
        rootCertInfos.forEach(certInfo => {
             const rootCertId = listOfRoots.ele(NAMESPACES.ct, 'RootCertificateID');
             const issuerSerial = rootCertId.ele(NAMESPACES.ds, 'X509IssuerSerial');
             issuerSerial.ele(NAMESPACES.ds, 'X509IssuerName').txt(certInfo.issuerName);
             issuerSerial.ele(NAMESPACES.ds, 'X509SerialNumber').txt(certInfo.serialNumber);
        });
    } else {
         listOfRoots.txt("<!-- 루트 인증서 정보 로드 실패 -->");
    }
    root.ele(NAMESPACES.ns, 'MaximumContractCertificateChains').txt('2');
    // 오류 시에는 PrioritizedEMAIDs 생략 또는 기본값 사용 결정 필요
    // 여기서는 생략하는 것으로 유지

    return root.end({ prettyPrint: true });
}


// --- 스크립트 실행 ---
(async () => {
    try {
        require.resolve('xmlbuilder2');
        console.log(`${colors.fg.green}필수 라이브러리(xmlbuilder2) 확인 완료.${colors.reset}`);
    } catch (e) {
        console.error(`${colors.fg.red}오류: 필수 라이브러리(xmlbuilder2)가 설치되지 않았습니다.${colors.reset}`);
        console.log("설치 명령어: npm install xmlbuilder2");
        process.exit(1);
    }

    // OpenSSL 명령어 실행 가능 여부 확인 (간단하게 버전 체크)
    try {
        await exec('openssl version');
        console.log(`${colors.fg.green}OpenSSL 명령어 실행 가능 확인 완료.${colors.reset}`);
    } catch (e) {
        console.error(`${colors.fg.red}오류: OpenSSL 명령어를 실행할 수 없습니다. OpenSSL이 설치되어 있고 PATH에 등록되어 있는지 확인하세요.${colors.reset}`);
        process.exit(1);
    }

    try {
        await generateCertificateInstallationReqXmlV20();
        console.log(`${colors.fg.green}스크립트 실행 완료.${colors.reset}`);
    } catch (error) {
        console.error(`${colors.fg.red}스크립트 실행 중 최종 오류 발생.${colors.reset}`);
        process.exitCode = 1;
    }
})(); 