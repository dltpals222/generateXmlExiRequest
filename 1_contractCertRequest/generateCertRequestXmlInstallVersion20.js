/**
 * ISO 15118-20 (-20) 표준에 따른 CertificateInstallationReq 메시지 XML 파일을 생성하는 스크립트입니다.
 * 이 스크립트는 지정된 OEM 프로비저닝 인증서와 개인 키를 사용하여 XML 서명(XMLDSig)을 계산하고,
 * 루트 인증서 정보를 포함하여 최종 XML 파일을 생성합니다.
 * 서명 계산 과정에서 Canonical EXI 변환과 EXI 인코딩을 사용합니다.
 *
 * [실행 방법]
 * node generateCertRequestXmlInstallVersion20.js [출력_파일명]
 *
 * [인수]
 * 출력_파일명 (선택 사항):
 *   설명: 생성될 XML 파일의 이름을 지정합니다. 확장자(.xml)를 포함하여 입력합니다.
 *   기본값: 스크립트 내 `DEFAULT_OUTPUT_FILENAME` 상수에 정의된 값 ('certificateInstallationReq_20.xml')
 *
 * [결과물]
 * - 지정된 이름 또는 기본 이름의 XML 파일 1개
 * - 파일 내용: ISO 15118-20 스키마에 따른 CertificateInstallationReq 메시지.
 *             요청 헤더, XML 서명, OEM 프로비저닝 인증서 체인, 루트 인증서 목록 등이 포함됩니다.
 *
 * [출력 디렉토리]
 * - 스크립트 내 `OUT_DIR_NAME` 상수에 정의된 이름의 폴더 ('out')
 * - 해당 폴더가 없으면 자동으로 생성됩니다.
 *
 * [실행 예시]
 * 1. 기본 파일명으로 생성:
 *    node generateCertRequestXmlInstallVersion20.js
 *
 * 2. 사용자 정의 파일명(my_cert_install_req.xml)으로 생성:
 *    node generateCertRequestXmlInstallVersion20.js my_cert_install_req.xml
 *
 * [사전 요구 사항]
 * 1. Node.js 및 npm 설치
 * 2. 필수 라이브러리 설치: `npm install xmlbuilder2`
 * 3. OpenSSL 설치 및 PATH 환경 변수에 등록
 * 4. Java Development Kit (JDK) 설치 및 PATH 환경 변수에 등록
 * 5. EXI 변환기 JAR 파일: 스크립트와 동일한 디렉토리에 `JAR_FILENAME` 상수에 정의된 이름('V2Gdecoder.jar')의 파일 필요
 * 6. 필요한 인증서, 키, 스키마 및 기타 파일 (스크립트 내 상수 정의 확인):
 *    - OEM 프로비저닝 인증서: `./${CERT_DIR_NAME}/${OEM_CERT_FILENAME}`
 *    - 개인 키: `./${KEY_DIR_NAME}/${PRIVATE_KEY_FILENAME}`
 *    - 루트 인증서: `./${ROOT_CERTS_DIR_NAME}/` 디렉토리 내 .pem, .crt, .cer 파일들
 *    - 공통 메시지 스키마: `./${SCHEMA_DIR_NAME}/${COMMON_MESSAGES_SCHEMA_FILENAME}`
 *    - XML 서명 스키마: `./${SCHEMA_DIR_NAME}/${XMLDSIG_SCHEMA_FILENAME}`
 *    - (선택) EMAID 리스트: `./${EMAID_DIR_NAME}/${EMAID_LIST_FILENAME}` (없으면 관련 요소 생략됨)
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { create } = require('xmlbuilder2');
const util = require('util');
const { exec: execCb, spawn } = require('child_process');

// ANSI 색상 코드 정의 (다른 상수 정의보다 먼저 와야 함)
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

// --- Constants --- Defines default names, directories, and identifiers used throughout the script.
// --- Directory Names ---
const CERT_DIR_NAME = 'cert';         // Directory containing the OEM provisioning certificate.
const KEY_DIR_NAME = 'key';          // Directory containing the private key.
const ROOT_CERTS_DIR_NAME = 'root';      // Directory containing trusted root certificates.
const OUT_DIR_NAME = 'out';         // Directory where the generated XML file will be saved.
const SCHEMA_DIR_NAME = 'xmlSchema';   // Directory containing XML schema files.
const EMAID_DIR_NAME = 'emaid';       // Directory containing the EMAID list file.

// --- File Names ---
const DEFAULT_OUTPUT_FILENAME = 'certificateInstallationReq_20.xml'; // Default name for the output XML file.
const OEM_CERT_FILENAME = 'target_oem_prov_cert_20.pem';           // Filename of the OEM provisioning certificate.
const PRIVATE_KEY_FILENAME = 'target_private_20.key.pem';         // Filename of the private key corresponding to the OEM certificate.
// 서브 인증서 파일 이름 정의 (비어있으면 사용하지 않음)
const OEM_SUB_CERT_FILENAMES = [
    'sub_cert1.pem', // 첫번째 서브 인증서 (예: 중간 CA 인증서)
    // 'sub_cert2.pem'  // 두번째 서브 인증서 (예: 상위 중간 CA 인증서)
];                     // 최대 3개까지 가능 (스키마 확인 필요)
const JAR_FILENAME = 'V2Gdecoder.jar';                             // Filename of the EXI converter JAR file.
const COMMON_MESSAGES_SCHEMA_FILENAME = 'V2G_CI_CommonMessages.xsd'; // Filename for the V2G CommonMessages schema.
const XMLDSIG_SCHEMA_FILENAME = 'xmldsig-core-schema.xsd';         // Filename for the XML Digital Signature schema.
const EMAID_LIST_FILENAME = 'prioritized_emaids.json';             // Filename for the list of prioritized EMAIDs.

// --- XML Identifiers and Values ---
const DEFAULT_ELEMENT_TO_DIGEST_ID = "CertChain001"; // Default XML ID for the OEMProvisioningCertificateChain element (target of the signature).
const DEFAULT_MAX_CHAINS = '3';                     // Default value for the MaximumContractCertificateChains element.

// --- Path Construction --- Build full paths based on the constants defined above.
const OUT_DIR = path.join(__dirname, OUT_DIR_NAME);
const OEM_PROV_CERT_PATH = path.join(__dirname, CERT_DIR_NAME, OEM_CERT_FILENAME);
const PRIVATE_KEY_PATH = path.join(__dirname, KEY_DIR_NAME, PRIVATE_KEY_FILENAME);
const ROOT_CERTS_DIR = path.join(__dirname, ROOT_CERTS_DIR_NAME);
const JAR_PATH = path.join(__dirname, JAR_FILENAME);
const SCHEMA_PATH = path.join(__dirname, SCHEMA_DIR_NAME, COMMON_MESSAGES_SCHEMA_FILENAME);
const XMLDSIG_SCHEMA_PATH = path.join(__dirname, SCHEMA_DIR_NAME, XMLDSIG_SCHEMA_FILENAME);
const EMAID_LIST_PATH = path.join(__dirname, EMAID_DIR_NAME, EMAID_LIST_FILENAME);

// --- Dynamic Output Path --- Determine the final output path based on command-line arguments or the default.
const outputFilenameArg = process.argv[2];
const targetFilename = outputFilenameArg || DEFAULT_OUTPUT_FILENAME;
const OUTPUT_XML_PATH = path.join(OUT_DIR, targetFilename);
console.log(`${colors.dim}  [Config] 최종 출력 파일 경로: ${OUTPUT_XML_PATH}${colors.reset}`);

// exec를 Promise 기반으로 변환
const exec = util.promisify(execCb);

// --- 네임스페이스 정의 (ISO 15118-20 CommonMessages 기준) ---
const NAMESPACES = {
    ns: 'urn:iso:std:iso:15118:-20:CommonMessages', // Default namespace
    ct: 'urn:iso:std:iso:15118:-20:CommonTypes',
    sig: 'http://www.w3.org/2000/09/xmldsig#', // XML Signature namespace (xmlsig -> sig로 변경)
    xsi: 'http://www.w3.org/2001/XMLSchema-instance'
    // sig 네임스페이스는 RootCertificateID 내부에서 사용되므로, 필요시 동적으로 추가하거나 확인 필요
};

// 새로운 EXI 프로세서 사용
const ExiProcessor = require('./exiProcessor');

// --- EXIConverter 클래스 정의 (새로운 EXI 프로세서 사용) ---
class EXIConverter {
    constructor() {
        this.initialized = false;
        this.exiProcessor = new ExiProcessor();
    }

    // 초기화
    async init() {
        try {
            this.exiProcessor.init();
            this.initialized = this.exiProcessor.initialized;
            if (this.initialized) {
                console.log(`${colors.fg.green}  [EXI Converter] 새로운 EXI 프로세서 초기화 성공${colors.reset}`);
            } else {
                console.error(`${colors.fg.red}  [EXI Converter] 새로운 EXI 프로세서 초기화 실패${colors.reset}`);
            }
        } catch (error) {
            console.error(`${colors.fg.red}  [EXI Converter] 초기화 오류:${colors.reset}`, error);
            this.initialized = false;
        }
    }

    // schemaPath 와 isFragment 옵션 추가
    async encodeToEXI(xmlString, schemaPath = null, isFragment = false, encodingType = 'default') {
        if (!this.initialized) {
            throw new Error('EXI 프로세서가 초기화되지 않았습니다.');
        }

        console.log(`${colors.fg.cyan}  [EXI Converter] 새로운 EXI 프로세서로 XML 인코딩 중... (${encodingType})${colors.reset}`);
        
        try {
            // 새로운 EXI 프로세서 사용
            const base64Result = await this.exiProcessor.encodeToEXI(xmlString, schemaPath, isFragment, encodingType);

            if (!base64Result || base64Result.trim() === '') {
                throw new Error('Empty EXI result after encoding');
            }
            
            console.log(`${colors.fg.green}  [EXI Converter] 인코딩 성공 (${encodingType}). Base64 길이: ${base64Result.length}${colors.reset}`);
            return base64Result;

        } catch (error) {
            console.error(`${colors.fg.red}  [EXI Converter] 인코딩 오류 (${encodingType}):${colors.reset}`, error);
            throw error;
        }
    }
}
const exiConverter = new EXIConverter(); // 인스턴스 생성

// EXI 프로세서 초기화
(async () => {
    try {
        await exiConverter.init();
        console.log('EXI 프로세서 초기화 완료');
    } catch (error) {
        console.error('EXI 프로세서 초기화 실패:', error);
    }
})();

// --- 인증서 분석 및 알고리즘 결정 함수 ---
async function getAlgorithmsFromCert(certPath) {
    let publicKeyAlgorithm = null;
    let curveName = null;
    let keySize = null;

    try {
        const { stdout } = await exec(`openssl x509 -in "${certPath}" -noout -text | cat`);
        console.log(`${colors.dim}  [Cert Analysis] 인증서 정보 분석 중...${colors.reset}`);

        // 공개 키 알고리즘 추출
        const pkAlgoMatch = stdout.match(/Public Key Algorithm:\s*([^\n]+)/);
        if (pkAlgoMatch && pkAlgoMatch[1]) {
            publicKeyAlgorithm = pkAlgoMatch[1].trim();
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
            // EdDSA 키인 경우 (Ed448)
            else if (publicKeyAlgorithm === 'ED448' || publicKeyAlgorithm.includes('Ed448')) {
                keySize = 448; // Ed448는 항상 448비트
                curveName = 'Ed448';
                console.log(`${colors.dim}  EdDSA Public-Key Size: ${keySize} bit${colors.reset}`);
                console.log(`${colors.dim}  Detected Ed448 key type.${colors.reset}`);
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
        else if (publicKeyAlgorithm === 'ED448' || publicKeyAlgorithm.includes('Ed448')) {
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
        console.error(`${colors.fg.red}  [!] 인증서 분석 중 오류 발생: ${certPath}${colors.reset}`, error);
        throw error;
    }
}

/**
 * PEM 형식 인증서 파일을 읽고 Base64 인코딩된 문자열로 변환합니다.
 * @param {string} certPath - 인증서 파일 경로
 * @returns {Promise<string>} Base64 인코딩된 인증서 내용
 */
async function readCertificateAsBase64(certPath) {
    try {
        console.log(`${colors.dim}  인증서 파일 읽기: ${certPath}${colors.reset}`);
        const certPem = await fs.readFile(certPath, 'utf8');
        // PEM 헤더/푸터 제거 및 공백/줄바꿈 제거
        const base64Cert = certPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r?\n|\s/g, '');
        if (!base64Cert) {
            throw new Error(`인증서 내용을 추출할 수 없습니다: ${certPath}`);
        }
        return base64Cert;
    } catch (err) {
        console.error(`${colors.fg.red}  인증서 파일 읽기 실패: ${certPath}${colors.reset}`, err);
        throw err;
    }
}

// --- 메인 XML 생성 함수 ---
async function generateCertificateInstallationReqXmlV20() {
    let calculatedDigestValue = 'PLACEHOLDER_DIGEST_VALUE';
    let calculatedSignatureValue = 'PLACEHOLDER_SIGNATURE_VALUE';
    let sessionId = 'PLACEHOLDER_SESSION_ID';
    let oemCertBase64 = 'PLACEHOLDER_OEM_CERT';
    let oemSubCertsBase64 = []; // 서브 인증서 Base64 데이터 저장 배열
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
            // readCertificateAsBase64 함수 사용으로 변경
            oemCertBase64 = await readCertificateAsBase64(OEM_PROV_CERT_PATH);
            console.log(`${colors.dim}  OEM 인증서 로드 완료: ${OEM_PROV_CERT_PATH}${colors.reset}`);

            // 서브 인증서 로드 (있는 경우)
            if (OEM_SUB_CERT_FILENAMES.length > 0) {
                console.log(`${colors.dim}  서브 인증서 로드 시작 (${OEM_SUB_CERT_FILENAMES.length}개)${colors.reset}`);
                
                for (const subCertFilename of OEM_SUB_CERT_FILENAMES) {
                    const subCertPath = path.join(__dirname, CERT_DIR_NAME, subCertFilename);
                    try {
                        const subCertBase64 = await readCertificateAsBase64(subCertPath);
                        oemSubCertsBase64.push(subCertBase64);
                        console.log(`${colors.dim}  서브 인증서 로드 완료: ${subCertPath}${colors.reset}`);
                    } catch (subCertErr) {
                        console.warn(`${colors.fg.yellow}  경고: 서브 인증서 로드 실패 (${subCertFilename}), 계속 진행합니다.${colors.reset}`);
                        // 서브 인증서 실패는 치명적이지 않으므로 계속 진행
                    }
                }
                
                console.log(`${colors.dim}  총 ${oemSubCertsBase64.length}개의 서브 인증서가 로드됨${colors.reset}`);
            } else {
                console.log(`${colors.dim}  서브 인증서 파일이 지정되지 않아 SubCertificates 요소는 생성되지 않습니다.${colors.reset}`);
            }

            // 인증서 분석하여 알고리즘 결정 (메인 인증서 기준)
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
        const elementToDigestId = DEFAULT_ELEMENT_TO_DIGEST_ID; // Use constant ID

        // OEMProvisioningCertificateChain 요소를 임시 구조에 추가 (ID 포함)
        const oemProvCertChainNode = tempRootForDigest.ele(NAMESPACES.ns, 'OEMProvisioningCertificateChain', { Id: elementToDigestId });
        oemProvCertChainNode.ele(NAMESPACES.ns, 'Certificate').txt(oemCertBase64);
        
        // 서브 인증서가 있으면 SubCertificates 요소 추가 (서명 대상에 포함)
        if (oemSubCertsBase64.length > 0) {
            const subCertsNode = oemProvCertChainNode.ele(NAMESPACES.ns, 'SubCertificates');
            oemSubCertsBase64.forEach(subCertBase64 => {
                subCertsNode.ele(NAMESPACES.ns, 'Certificate').txt(subCertBase64);
            });
        }
        
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
            // 1. <sig:SignedInfo> XML 프래그먼트 생성
            console.log('  1. Generating <sig:SignedInfo> XML fragment...');
            const signedInfoXml = create({ version: '1.0', encoding: 'UTF-8' })
                .ele(NAMESPACES.sig, 'SignedInfo')
                .ele(NAMESPACES.sig, 'CanonicalizationMethod', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' })
                .up()
                .ele(NAMESPACES.sig, 'SignatureMethod', { Algorithm: signingAlgorithms.signatureMethod })
                .up()
                .ele(NAMESPACES.sig, 'Reference', { URI: `#${elementToDigestId}` })
                .ele(NAMESPACES.sig, 'DigestMethod', { Algorithm: signingAlgorithms.digestMethod })
                .up()
                .ele(NAMESPACES.sig, 'DigestValue')
                .txt(calculatedDigestValue);

            const signedInfoXmlString = signedInfoXml.toString({ prettyPrint: false });
            console.log(`[Debug] XML Fragment for Signature:\n${signedInfoXmlString}`);

            // 2. <sig:SignedInfo> 프래그먼트를 EXI로 인코딩
            console.log('  2. Encoding <sig:SignedInfo> fragment to EXI using xmldsig-core-schema.xsd...');
            const signedInfoExiBase64 = await exiConverter.encodeToEXI(
                signedInfoXmlString,
                XMLDSIG_SCHEMA_PATH,
                true,
                'signed_info'
            );
            console.log(`  Encoded SignedInfo EXI Length: ${Buffer.from(signedInfoExiBase64, 'base64').length}`);

            // 3. EXI 데이터의 해시 계산
            console.log('  3. Calculating SHAKE256 hash of SignedInfo EXI...');
            const hashToSign = crypto.createHash(signingAlgorithms.hashAlgo)
                .update(Buffer.from(signedInfoExiBase64, 'base64'))
                .digest('base64');
            console.log(`  Hash to sign (Base64): ${hashToSign}`);

            // 4. 개인 키로 해시 서명
            console.log(`  4. Loading private key: ${PRIVATE_KEY_PATH}`);
            console.log(`  Signing hash using private key and algorithm ${signingAlgorithms.hashAlgo}...`);

            let signatureValue;
            if (signingAlgorithms.signatureMethod.includes('Ed448')) {
                // Ed448 서명을 위해 OpenSSL 사용
                const tempHashFile = path.join(__dirname, 'temp_hash.bin');
                const tempSigFile = path.join(__dirname, 'temp_sig.bin');
                
                try {
                    // 해시를 바이너리 파일로 저장
                    await fs.writeFile(tempHashFile, Buffer.from(hashToSign, 'base64'));
                    
                    // OpenSSL로 Ed448 서명 수행
                    const signCmd = `openssl pkeyutl -sign -inkey "${PRIVATE_KEY_PATH}" -in "${tempHashFile}" -out "${tempSigFile}" -rawin -keyform PEM`;
                    await exec(signCmd);
                    
                    // 서명 결과를 Base64로 읽기
                    const signatureBuffer = await fs.readFile(tempSigFile);
                    signatureValue = signatureBuffer.toString('base64');
                } finally {
                    // 임시 파일 정리
                    await fs.unlink(tempHashFile).catch(() => {});
                    await fs.unlink(tempSigFile).catch(() => {});
                }
            } else {
                // 기존 ECDSA 서명 로직
                const privateKey = await fs.readFile(PRIVATE_KEY_PATH, 'utf8');
                const sign = crypto.createSign(signingAlgorithms.hashAlgo);
                sign.update(Buffer.from(signedInfoExiBase64, 'base64'));
                signatureValue = sign.sign(privateKey, 'base64');
            }

            calculatedSignatureValue = signatureValue;
            console.log(`${colors.fg.green}[3/7] SignatureValue 계산 완료: ${calculatedSignatureValue}${colors.reset}`);

        } catch (error) {
            console.error(`${colors.fg.red}[3/7] SignatureValue 계산 중 오류 발생:${colors.reset}`, error);
            throw error;
        }

        // --- 4. 최종 XML 조립 (계산된 SignatureValue 적용) ---
        console.log(`${colors.fg.blue}[4/7] 최종 XML 구조 조립...${colors.reset}`);
        const root = create({ version: '1.0', encoding: 'UTF-8' })
                    .ele(NAMESPACES.ns, 'CertificateInstallationReq', { // Root element with default namespace
            'xmlns': NAMESPACES.ns, // Default namespace declaration
            'xmlns:ct': NAMESPACES.ct,
            'xmlns:sig': NAMESPACES.sig,
            'xmlns:xsi': NAMESPACES.xsi,
            'xsi:schemaLocation': 'urn:iso:std:iso:15118:-20:CommonMessages V2G_CI_CommonMessages.xsd' // 스키마 위치 명시 (실제 유효성 검증에 사용될 수 있음)
        });

        // Header (ISO 15118-20 CommonTypes 네임스페이스 사용)
        const header = root.ele(NAMESPACES.ct, 'Header');
        header.ele(NAMESPACES.ct, 'SessionID').txt(sessionId);
        header.ele(NAMESPACES.ct, 'TimeStamp').txt(Math.floor(Date.now() / 1000)); // 초 단위 타임스탬프 (xsd:unsignedLong)

        // Signature (XMLDSig 네임스페이스 사용) - Header 안으로 이동
        const signature = header.ele(NAMESPACES.sig, 'Signature'); // 수정된 위치 (Header 아래)

        const signedInfo = signature.ele(NAMESPACES.sig, 'SignedInfo');
        // [V2G20-765] CanonicalizationMethod Algorithm 수정
        signedInfo.ele(NAMESPACES.sig, 'CanonicalizationMethod', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
        // [V2G20-2473] SignatureMethod Algorithm 수정 (ecdsa-sha512)
        signedInfo.ele(NAMESPACES.sig, 'SignatureMethod', { Algorithm: signingAlgorithms.signatureMethod });

        const reference = signedInfo.ele(NAMESPACES.sig, 'Reference', { URI: `#${elementToDigestId}` }); // Use constant ID
        const transforms = reference.ele(NAMESPACES.sig, 'Transforms');
        // [V2G20-766] Transform Algorithm 수정, [V2G20-767] Transform은 하나만
        transforms.ele(NAMESPACES.sig, 'Transform', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
        // [V2G20-2475] DigestMethod Algorithm 수정 (sha512)
        reference.ele(NAMESPACES.sig, 'DigestMethod', { Algorithm: signingAlgorithms.digestMethod });
        reference.ele(NAMESPACES.sig, 'DigestValue').txt(calculatedDigestValue); // 계산된 DigestValue 사용

        signature.ele(NAMESPACES.sig, 'SignatureValue').txt(calculatedSignatureValue); // 계산된 값 사용 (현재 Placeholder)

        // OEMProvisioningCertificateChain (Id 추가하여 서명 대상 식별)
        const finalOemProvCertChain = root.ele(NAMESPACES.ns, 'OEMProvisioningCertificateChain', { Id: elementToDigestId }); // Use constant ID
        finalOemProvCertChain.ele(NAMESPACES.ns, 'Certificate').txt(oemCertBase64);
        
        // 서브 인증서가 있으면 SubCertificates 요소 추가 (최종 XML에도 포함)
        if (oemSubCertsBase64.length > 0) {
            const subCertsNode = finalOemProvCertChain.ele(NAMESPACES.ns, 'SubCertificates');
            oemSubCertsBase64.forEach(subCertBase64 => {
                subCertsNode.ele(NAMESPACES.ns, 'Certificate').txt(subCertBase64);
            });
        }
        
        // ListOfRootCertificateIDs (CommonTypes 네임스페이스 사용)
        const listOfRoots = root.ele(NAMESPACES.ns, 'ListOfRootCertificateIDs');
        rootCertInfos.forEach(certInfo => {
            const rootCertId = listOfRoots.ele(NAMESPACES.ct, 'RootCertificateID'); // ct 네임스페이스 사용
            // 예제에는 sig:X509IssuerSerial 이 있지만, ds 네임스페이스가 표준임. ds 사용. -> sig 사용으로 통일
            // 네임스페이스 접두사 'sig'는 예제에서 정의되지 않았으므로 'ds'를 사용하는 것이 안전. -> sig 사용
            // 실제 스키마(xmldsig-core-schema.xsd) 확인 필요. 여기서는 ds로 진행. -> sig 사용
            const issuerSerial = rootCertId.ele(NAMESPACES.sig, 'X509IssuerSerial');
            issuerSerial.ele(NAMESPACES.sig, 'X509IssuerName').txt(certInfo.issuerName);
            issuerSerial.ele(NAMESPACES.sig, 'X509SerialNumber').txt(certInfo.serialNumber);
        });

        // MaximumContractCertificateChains
        root.ele(NAMESPACES.ns, 'MaximumContractCertificateChains').txt(DEFAULT_MAX_CHAINS); // Use constant value

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
            'xmlns': NAMESPACES.ns, 'xmlns:ct': NAMESPACES.ct, /* 'xmlns:ds': NAMESPACES.ds, */ 'xmlns:sig': NAMESPACES.sig,
            'xmlns:xsi': NAMESPACES.xsi,
            'xsi:schemaLocation': 'urn:iso:std:iso:15118:-20:CommonMessages V2G_CI_CommonMessages.xsd'
        });
    // Header
    const header = root.ele(NAMESPACES.ct, 'Header');
    header.ele(NAMESPACES.ct, 'SessionID').txt(sessionId || 'ERROR_SESSION');
    header.ele(NAMESPACES.ct, 'TimeStamp').txt(Math.floor(Date.now() / 1000));

    // Signature (Error Placeholder) - Header 안으로 이동
    const signature = header.ele(NAMESPACES.sig, 'Signature'); // 수정된 위치

    const signedInfo = signature.ele(NAMESPACES.sig, 'SignedInfo');
    // 알고리즘 적용
    signedInfo.ele(NAMESPACES.sig, 'CanonicalizationMethod', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
    signedInfo.ele(NAMESPACES.sig, 'SignatureMethod', { Algorithm: algorithms.signatureMethod });
    const reference = signedInfo.ele(NAMESPACES.sig, 'Reference', { URI: `#${DEFAULT_ELEMENT_TO_DIGEST_ID}` });
    reference.ele(NAMESPACES.sig, 'Transforms').ele(NAMESPACES.sig, 'Transform', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
    reference.ele(NAMESPACES.sig, 'DigestMethod', { Algorithm: algorithms.digestMethod });
    reference.ele(NAMESPACES.sig, 'DigestValue').txt(digestValue); // ERROR_DIGEST_VALUE
    signature.ele(NAMESPACES.sig, 'SignatureValue').txt(signatureValue); // ERROR_SIGNATURE_VALUE
    // KeyInfo 제거됨
    // Body (Error Placeholder)
    const oemProvCertChain = root.ele(NAMESPACES.ns, 'OEMProvisioningCertificateChain', { Id: DEFAULT_ELEMENT_TO_DIGEST_ID }); // Use constant ID
    oemProvCertChain.ele(NAMESPACES.ns, 'Certificate').txt(oemCertBase64 || 'ERROR_OEM_CERT');
    
    // 오류 발생 시 SubCertificates 요소는 생략 (단순화)
    // 필요시 아래 주석 해제 후 값 전달 필요
    /*
    if (oemSubCertsBase64 && oemSubCertsBase64.length > 0) {
        const subCertsNode = oemProvCertChain.ele(NAMESPACES.ns, 'SubCertificates');
        oemSubCertsBase64.forEach(subCertBase64 => {
            subCertsNode.ele(NAMESPACES.ns, 'Certificate').txt(subCertBase64);
        });
    }
    */
    
    const listOfRoots = root.ele(NAMESPACES.ns, 'ListOfRootCertificateIDs');
    if (rootCertInfos && rootCertInfos.length > 0) {
        rootCertInfos.forEach(certInfo => {
             const rootCertId = listOfRoots.ele(NAMESPACES.ct, 'RootCertificateID');
                         const issuerSerial = rootCertId.ele(NAMESPACES.sig, 'X509IssuerSerial');
            issuerSerial.ele(NAMESPACES.sig, 'X509IssuerName').txt(certInfo.issuerName);
            issuerSerial.ele(NAMESPACES.sig, 'X509SerialNumber').txt(certInfo.serialNumber);
        });
    } else {
         listOfRoots.txt("<!-- 루트 인증서 정보 로드 실패 -->");
    }
    root.ele(NAMESPACES.ns, 'MaximumContractCertificateChains').txt(DEFAULT_MAX_CHAINS); // Use constant value
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