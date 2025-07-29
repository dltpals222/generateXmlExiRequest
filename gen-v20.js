#!/usr/bin/env node

/**
 * ISO 15118-20 CertificateInstallationReq/Res XML 생성기
 * 알고리즘별(ecdsa, ed448, auto)로 인증서/키/출력 파일 자동 선택
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { create } = require('xmlbuilder2');
const util = require('util');
const { spawn } = require('child_process');
const readline = require('readline');

// exec를 Promise 기반으로 변환
const exec = util.promisify(require('child_process').exec);

// --- 사용자 입력 처리 함수들 ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

// 색상 정의
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    fg: {
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        cyan: "\x1b[36m",
        magenta: "\x1b[35m",
        gray: "\x1b[90m",
    }
};

// --- 명령행 인수 처리 ---
let messageType, algorithmType, emaidOption, maxChains;

// 메인 실행 함수
async function main() {
    // 인수가 없으면 대화형 모드
    if (process.argv.length === 2) {
        console.log(`${colors.fg.blue}🚀 ISO 15118-20 XML 생성기 (대화형 모드)${colors.reset}`);
        await runInteractiveMode();
    } else {
        // 기존 명령행 인수 방식
        messageType = (process.argv[2] || 'req').toLowerCase();
        algorithmType = (process.argv[3] || 'auto').toLowerCase();
        emaidOption = (process.argv[4] || 'include').toLowerCase();
        
        // EMAID 옵션에 따른 기본값 계산
        let defaultMaxChains = 1;
        if (process.argv[5] === undefined && emaidOption === 'include') {
            try {
                const emaidData = await fs.readFile(path.join(__dirname, 'emaid', 'v20', 'prioritized_emaids.json'), 'utf8');
                const prioritizedEmaids = JSON.parse(emaidData);
                if (Array.isArray(prioritizedEmaids)) {
                    defaultMaxChains = prioritizedEmaids.length;
                }
            } catch (error) {
                defaultMaxChains = 1; // EMAID 파일 읽기 실패 시 기본값
            }
        }
        
        maxChains = process.argv[5] ? parseInt(process.argv[5]) : defaultMaxChains;

if (!['req', 'res'].includes(messageType)) {
            console.error('❌ 사용법: node gen-v20.js [req|res] [auto|ecdsa|ed448] [include|ignore] [maxChains]');
            console.error('또는 인수 없이 실행하면 대화형 모드로 진입합니다: node gen-v20.js');
    process.exit(1);
}

if (!['auto', 'ecdsa', 'ed448'].includes(algorithmType)) {
            console.error('❌ 사용법: node gen-v20.js [req|res] [auto|ecdsa|ed448] [include|ignore] [maxChains]');
            console.error('또는 인수 없이 실행하면 대화형 모드로 진입합니다: node gen-v20.js');
    process.exit(1);
        }

        if (!['include', 'ignore'].includes(emaidOption)) {
            console.error('❌ 사용법: node gen-v20.js [req|res] [auto|ecdsa|ed448] [include|ignore] [maxChains]');
            console.error('   - include: PrioritizedEMAIDs를 목록에서 추가');
            console.error('   - ignore: PrioritizedEMAIDs를 무시');
            console.error('   - maxChains: MaximumContractCertificateChains 값 (1-255)');
            console.error('또는 인수 없이 실행하면 대화형 모드로 진입합니다: node gen-v20.js');
            process.exit(1);
        }

        // maxChains 유효성 검증
        if (maxChains < 1 || maxChains > 255) {
            console.error('❌ MaximumContractCertificateChains는 1-255 사이의 값이어야 합니다.');
            process.exit(1);
        }

        await runCommandLineMode();
    }
}

// 대화형 모드 함수
async function runInteractiveMode() {
    console.log(`${colors.fg.cyan}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.fg.cyan}     ISO 15118-20 XML 생성기 🚀${colors.reset}`);
    console.log(`${colors.fg.cyan}═══════════════════════════════════════${colors.reset}\n`);

    // 1. 메시지 타입 선택
    console.log(`${colors.fg.yellow}1. 메시지 타입을 선택하세요:${colors.reset}`);
    console.log('   1) Request');
    console.log('   2) Response\n');
    
    while (true) {
        const typeInput = await question(`${colors.fg.green}메시지 타입을 선택하세요 (1-2): ${colors.reset}`);
        if (typeInput === '1') {
            messageType = 'req';
            break;
        } else if (typeInput === '2') {
            messageType = 'res';
            break;
        } else {
            console.log(`${colors.fg.red}잘못된 입력입니다. 1 또는 2를 입력해주세요.${colors.reset}`);
        }
    }

    // 2. 알고리즘 선택
    console.log(`\n${colors.fg.yellow}2. 알고리즘을 선택하세요:${colors.reset}`);
    console.log('   1) Auto (자동 감지)');
    console.log('   2) ECDSA');
    console.log('   3) Ed448\n');
    
    while (true) {
        const algoInput = await question(`${colors.fg.green}알고리즘을 선택하세요 (1-3): ${colors.reset}`);
        if (algoInput === '1') {
            algorithmType = 'auto';
            break;
        } else if (algoInput === '2') {
            algorithmType = 'ecdsa';
            break;
        } else if (algoInput === '3') {
            algorithmType = 'ed448';
            break;
        } else {
            console.log(`${colors.fg.red}잘못된 입력입니다. 1, 2, 또는 3을 입력해주세요.${colors.reset}`);
        }
    }

    // 3. EMAID 옵션 선택 (Request인 경우만)
    if (messageType === 'req') {
        console.log(`\n${colors.fg.yellow}3. PrioritizedEMAIDs 포함 여부:${colors.reset}`);
        console.log('   1) 포함 (include)');
        console.log('   2) 무시 (ignore)\n');
        
        while (true) {
            const emaidInput = await question(`${colors.fg.green}EMAID 옵션을 선택하세요 (1-2): ${colors.reset}`);
            if (emaidInput === '1') {
                emaidOption = 'include';
                break;
            } else if (emaidInput === '2') {
                emaidOption = 'ignore';
                break;
            } else {
                console.log(`${colors.fg.red}잘못된 입력입니다. 1 또는 2를 입력해주세요.${colors.reset}`);
            }
        }

        // 4. MaximumContractCertificateChains 값 입력
        console.log(`\n${colors.fg.yellow}4. MaximumContractCertificateChains 값:${colors.reset}`);
        
        // EMAID 옵션에 따른 기본값 계산
        let defaultMaxChains = 1;
        if (emaidOption === 'include') {
            try {
                const emaidFilePath = path.join(__dirname, 'emaid', 'v20', 'prioritized_emaids.json');
                const emaidData = await fs.readFile(emaidFilePath, 'utf8');
                const prioritizedEmaids = JSON.parse(emaidData);
                if (Array.isArray(prioritizedEmaids)) {
                    defaultMaxChains = prioritizedEmaids.length;
                }
            } catch (error) {
                defaultMaxChains = 1; // EMAID 파일 읽기 실패 시 기본값
            }
        }
        
        console.log(`   (1-255 사이의 숫자)`);
        if (emaidOption === 'include') {
            console.log(`   EMAID 포함 시 기본값: ${defaultMaxChains} (EMAID 리스트 개수)\n`);
        } else {
            console.log(`   EMAID 무시 시 기본값: ${defaultMaxChains}\n`);
        }
        
        while (true) {
            const maxChainsInput = await question(`${colors.fg.green}최대 인증서 체인 수를 입력하세요 (기본값: ${defaultMaxChains}): ${colors.reset}`);
            if (maxChainsInput === '') {
                maxChains = defaultMaxChains;
                break;
            } else {
                const num = parseInt(maxChainsInput);
                if (num >= 1 && num <= 255) {
                    maxChains = num;
                    break;
                } else {
                    console.log(`${colors.fg.red}1-255 사이의 숫자를 입력해주세요.${colors.reset}`);
                }
            }
        }
    } else {
        emaidOption = 'include'; // Response는 EMAID 옵션 무관
        maxChains = 1; // Response는 maxChains 무관
    }

    // 선택 결과 표시
    console.log(`\n${colors.fg.cyan}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.fg.green}✅ 선택 완료:${colors.reset}`);
    console.log(`   메시지 타입: ${colors.bright}${messageType?.toUpperCase() || 'UNKNOWN'}${colors.reset}`);
    console.log(`   알고리즘: ${colors.bright}${algorithmType?.toUpperCase() || 'UNKNOWN'}${colors.reset}`);
    if (messageType === 'req') {
        console.log(`   EMAID 옵션: ${colors.bright}${emaidOption?.toUpperCase() || 'UNKNOWN'}${colors.reset}`);
        console.log(`   최대 인증서 체인 수: ${colors.bright}${maxChains || 'UNKNOWN'}${colors.reset}`);
    }
    
    // 생성될 파일명 표시
    const config = ALGO_CONFIG[algorithmType];
    let outputFileName;
    if (messageType === 'req') {
        outputFileName = config.OUTPUT_FILENAME_REQ[emaidOption];
    } else {
        // Response는 문자열이어야 하는데 객체로 되어 있으면 수정
        if (typeof config.OUTPUT_FILENAME_RES === 'object') {
            outputFileName = `certificateInstallationRes_v20_${algorithmType === 'auto' ? '' : algorithmType + '_'}res.xml`;
        } else {
            outputFileName = config.OUTPUT_FILENAME_RES;
        }
    }
    console.log(`   생성될 파일: ${colors.bright}${outputFileName}${colors.reset}`);
    console.log(`${colors.fg.cyan}═══════════════════════════════════════${colors.reset}\n`);

    // 확인
    while (true) {
        const confirmInput = await question(`${colors.fg.yellow}계속하시겠습니까? (y/n): ${colors.reset}`);
        if (confirmInput.toLowerCase() === 'y' || confirmInput.toLowerCase() === 'yes') {
            await runCommandLineMode();
            break;
        } else if (confirmInput.toLowerCase() === 'n' || confirmInput.toLowerCase() === 'no') {
            console.log(`${colors.fg.gray}작업이 취소되었습니다.${colors.reset}`);
            rl.close();
            process.exit(0);
        } else {
            console.log(`${colors.fg.red}y 또는 n을 입력해주세요.${colors.reset}`);
        }
    }
}

// 출력 파일명 생성 함수
function getOutputFileName(messageType, algorithmType, emaidOption) {
    const config = ALGO_CONFIG[algorithmType];
    if (messageType === 'req') {
        return config.OUTPUT_FILENAME_REQ[emaidOption];
    } else {
        return config.OUTPUT_FILENAME_RES;
    }
}

// --- 알고리즘별 파일명 매핑 ---
const ALGO_CONFIG = {
    ecdsa: {
        OEM_CERT_PATH: path.join(__dirname, 'cert', 'v20', 'oem_cert_ecdsa.pem'),
        PRIVATE_KEY_PATH: path.join(__dirname, 'key', 'v20', 'oem_private_key_ecdsa.pem'),
        SUB_CERT_DIR: path.join(__dirname, 'cert', 'v20', 'sub_ecdsa'),
        SUB_CERT_PATTERN: 'sub_cert*.pem',
        MAX_SUB_CERTS: 3,
            OUTPUT_FILENAME_REQ: {
                include: 'certificateInstallationReq_v20_ecdsa_emaid.xml',
                ignore: 'certificateInstallationReq_v20_ecdsa_noemaid.xml'
            },
        OUTPUT_FILENAME_RES: 'certificateInstallationRes_v20_ecdsa.xml',
    },
    ed448: {
        OEM_CERT_PATH: path.join(__dirname, 'cert', 'v20', 'oem_cert_ed448.pem'),
        PRIVATE_KEY_PATH: path.join(__dirname, 'key', 'v20', 'oem_private_key_ed448.pem'),
        SUB_CERT_DIR: path.join(__dirname, 'cert', 'v20', 'sub_ed448'),
        SUB_CERT_PATTERN: 'sub_cert*.pem',
        MAX_SUB_CERTS: 3,
            OUTPUT_FILENAME_REQ: {
                include: 'certificateInstallationReq_v20_ed448_emaid.xml',
                ignore: 'certificateInstallationReq_v20_ed448_noemaid.xml'
            },
        OUTPUT_FILENAME_RES: 'certificateInstallationRes_v20_ed448.xml',
    },
    auto: {
        OEM_CERT_PATH: path.join(__dirname, 'cert', 'v20', 'oem_cert.pem'),
        PRIVATE_KEY_PATH: path.join(__dirname, 'key', 'v20', 'oem_private_key.pem'),
        SUB_CERT_DIR: path.join(__dirname, 'cert', 'v20', 'sub'),
        SUB_CERT_PATTERN: 'sub_cert*.pem',
        MAX_SUB_CERTS: 3,
            OUTPUT_FILENAME_REQ: {
                include: 'certificateInstallationReq_v20_emaid.xml',
                ignore: 'certificateInstallationReq_v20_noemaid.xml'
            },
        OUTPUT_FILENAME_RES: 'certificateInstallationRes_v20.xml',
    }
};

// 기존 명령행 모드 함수
async function runCommandLineMode() {
const SELECTED_CONFIG = ALGO_CONFIG[algorithmType];

// --- 설정 값 ---
const CONFIG = {
    OUT_DIR: path.join(__dirname, 'out'),
    OEM_CERT_PATH: SELECTED_CONFIG.OEM_CERT_PATH,
    PRIVATE_KEY_PATH: SELECTED_CONFIG.PRIVATE_KEY_PATH,
    ROOT_CERTS_DIR: path.join(__dirname, 'root'),
    JAR_PATH: path.join(__dirname, 'V2Gdecoder.jar'),
    EMAID_LIST_PATH: path.join(__dirname, 'emaid', 'v20', 'prioritized_emaids.json'),
    SUB_CERT_DIR: SELECTED_CONFIG.SUB_CERT_DIR,
    SUB_CERT_PATTERN: SELECTED_CONFIG.SUB_CERT_PATTERN,
    MAX_SUB_CERTS: SELECTED_CONFIG.MAX_SUB_CERTS,
    DEFAULT_OUTPUT_FILENAME_REQ: SELECTED_CONFIG.OUTPUT_FILENAME_REQ,
    DEFAULT_OUTPUT_FILENAME_RES: SELECTED_CONFIG.OUTPUT_FILENAME_RES,
    DEFAULT_ELEMENT_ID: 'CertChain001',
    DEFAULT_MAX_CHAINS: '3',
    NAMESPACES: {
        ns: 'urn:iso:std:iso:15118:-20:CommonMessages',
        ct: 'urn:iso:std:iso:15118:-20:CommonTypes',
        sig: 'http://www.w3.org/2000/09/xmldsig#',
        xsi: 'http://www.w3.org/2001/XMLSchema-instance'
    }
};

    console.log(`${colors.fg.blue}🚀 ISO 15118-20 ${messageType.toUpperCase()} XML 생성기 시작... [${algorithmType.toUpperCase()}] [EMAID: ${emaidOption.toUpperCase()}]${colors.reset}`);

// 출력 파일명 결정
const OUTPUT_XML_PATH = path.join(CONFIG.OUT_DIR, 
        messageType === 'req' ? CONFIG.DEFAULT_OUTPUT_FILENAME_REQ[emaidOption] : CONFIG.DEFAULT_OUTPUT_FILENAME_RES[emaidOption]);
console.log(`${colors.dim}  📂 출력 파일: ${OUTPUT_XML_PATH}${colors.reset}`);

    // readline 인터페이스는 전역에서 이미 생성됨

async function selectResponseCode() {
    const responseCodes = [
        'OK', 'OK_CertificateExpiresSoon', 'OK_NewSessionEstablished', 'OK_OldSessionJoined',
        'WARNING_AuthorizationSelectionInvalid', 'WARNING_CertificateExpired', 'WARNING_CertificateNotYetValid',
        'WARNING_CertificateRevoked', 'WARNING_CertificateValidationError', 'WARNING_ChallengeInvalid',
        'WARNING_EIMAuthorizationFailure', 'WARNING_eMSPUnknown', 'WARNING_EVPowerProfileViolation',
        'WARNING_GeneralPnCAuthorizationError', 'WARNING_NoCertificateAvailable', 'WARNING_NoContractMatchingPCIDFound',
        'WARNING_PowerToleranceNotConfirmed', 'WARNING_ScheduleRenegotiationFailed', 'WARNING_StandbyNotAllowed',
        'FAILED', 'FAILED_AssociationError', 'FAILED_ContactorError', 'FAILED_EVPowerProfileInvalid',
        'FAILED_EVPowerProfileViolation', 'FAILED_MeteringSignatureNotValid', 'FAILED_NoEnergyTransferServiceSelected',
        'FAILED_NoServiceRenegotiationSupported', 'FAILED_PauseNotAllowed', 'FAILED_PowerDeliveryNotApplied',
        'FAILED_PowerToleranceNotConfirmed', 'FAILED_ScheduleRenegotiation', 'FAILED_ScheduleSelectionInvalid',
        'FAILED_SequenceError', 'FAILED_ServiceIDInvalid', 'FAILED_ServiceSelectionInvalid', 'FAILED_SignatureError',
        'FAILED_UnknownSession', 'FAILED_WrongChargeParameter'
    ];
    
    console.log(`${colors.fg.cyan}사용 가능한 ResponseCode:${colors.reset}`);
    responseCodes.forEach((code, index) => {
        console.log(`  ${index + 1}. ${code}`);
    });
    
    while (true) {
        const input = await question(`${colors.fg.yellow}ResponseCode를 선택하세요 (1-${responseCodes.length}) 또는 직접 입력: `);
        const num = parseInt(input);
        
        if (num >= 1 && num <= responseCodes.length) {
            return responseCodes[num - 1];
        } else if (responseCodes.includes(input)) {
            return input;
        } else {
            console.log(`${colors.fg.red}잘못된 입력입니다. 다시 시도해주세요.${colors.reset}`);
        }
    }
}

async function selectEVSEProcessing() {
    const processingTypes = ['Finished', 'Ongoing', 'Ongoing_WaitingForCustomerInteraction'];
    
    console.log(`${colors.fg.cyan}EVSEProcessing 상태:${colors.reset}`);
    processingTypes.forEach((type, index) => {
        console.log(`  ${index + 1}. ${type}`);
    });
    
    while (true) {
        const input = await question(`${colors.fg.yellow}EVSEProcessing을 선택하세요 (1-${processingTypes.length}): `);
        const num = parseInt(input);
        
        if (num >= 1 && num <= processingTypes.length) {
            return processingTypes[num - 1];
        } else {
            console.log(`${colors.fg.red}잘못된 입력입니다. 다시 시도해주세요.${colors.reset}`);
        }
    }
}

async function inputRemainingChains() {
    while (true) {
        const input = await question(`${colors.fg.yellow}RemainingContractCertificateChains 수를 입력하세요 (0-255): `);
        const num = parseInt(input);
        
        if (num >= 0 && num <= 255) {
            return num;
        } else {
            console.log(`${colors.fg.red}0-255 사이의 숫자를 입력해주세요.${colors.reset}`);
        }
    }
}

// --- EXI 변환기 클래스 (exi_processor.jar 사용) ---
const java = require('java');

// JVM 설정
java.options.push('-Xmx1g');
java.options.push('-Xms256m');

// JAR 파일 경로 설정
const jarPath = path.join(__dirname, 'exi_processor.jar');
java.classpath.push(jarPath);

class ExiProcessor {
    constructor() {
        this.initialized = false;
        this.classes = {};
    }

    // 초기화 - 여러 클래스를 불러옴
    init() {
        const classNames = [
            'com.lw.exiConvert.XmlEncode',
            'com.lw.exiConvert.XmlDecode',
        ];

        let loadedCount = 0;
        
        for (const className of classNames) {
            try {
                const shortName = className.split('.').pop();
                this.classes[shortName] = java.import(className);
                console.log(`✓ 클래스 로드 성공: ${className}`);
                loadedCount++;
            } catch (error) {
                console.error(`✗ 클래스 로드 실패: ${className} - ${error.message}`);
            }
        }

        this.initialized = loadedCount > 0;
        console.log(`\n총 ${loadedCount}개 클래스 로드 완료`);
        
        if (this.initialized) {
            console.log('로드된 클래스들:', Object.keys(this.classes).join(', '));
        }
    }

    // XML을 EXI로 인코딩 (바이너리 데이터 직접 반환)
    encodeXML(xmlContent) {
        if (!this.initialized || !this.classes.XmlEncode) {
            console.error('XmlEncode 클래스가 로드되지 않았습니다.');
            return null;
        }

        try {
            const result = this.classes.XmlEncode.encodeXMLSync(xmlContent);
            return result; // 바이너리 데이터 직접 반환
        } catch (error) {
            console.error('XML 인코딩 실패:', error.message);
            return null;
        }
    }

    // EXI를 XML로 디코딩
    decodeXML(exiData) {
        if (!this.initialized || !this.classes.XmlDecode) {
            console.error('XmlDecode 클래스가 로드되지 않았습니다.');
            return null;
        }

        try {
            const byteArray = Array.from(exiData);
            const javaByteArray = java.newArray('byte', byteArray);
            
            const result = this.classes.XmlDecode.decodeXMLSync(javaByteArray);
            return result;
        } catch (error) {
            console.error('EXI 디코딩 실패:', error.message);
            return null;
        }
    }

    // 특정 클래스 가져오기
    getClass(className) {
        return this.classes[className];
    }

    // 로드된 모든 클래스 목록 반환
    getLoadedClasses() {
        return Object.keys(this.classes);
    }
}

// --- 인증서 알고리즘 분석 함수 ---
async function getAlgorithmsFromCert(certPath) {
    try {
            console.log(`  디버그: 인증서 분석 중... ${certPath}`);
        const publicKeyCmd = `openssl x509 -in "${certPath}" -noout -pubkey`;
        const { stdout: publicKeyPem } = await exec(publicKeyCmd);
        
        if (publicKeyPem.includes('-----BEGIN PUBLIC KEY-----')) {
                // Windows에서 echo 문제를 피하기 위해 임시 파일 사용
                const tempKeyFile = path.join(__dirname, 'temp_pubkey.pem');
                await fs.writeFile(tempKeyFile, publicKeyPem, 'utf8');
                const publicKeyInfoCmd = `openssl pkey -in "${tempKeyFile}" -pubin -text -noout`;
            const { stdout: publicKeyInfo } = await exec(publicKeyInfoCmd);
                // 임시 파일 삭제
                try { await fs.unlink(tempKeyFile); } catch (e) {}
                
                console.log(`  디버그: 공개키 정보 일부... ${publicKeyInfo.substring(0, 50)}...`);
            
            if (publicKeyInfo.includes('ED448')) {
                    console.log(`  디버그: Ed448 감지됨!`);
                return {
                    keyType: 'Ed448',
                    signatureAlgorithm: 'Ed448',
                    hashAlgorithm: 'SHAKE256',
                    xmldsigAlgorithm: 'http://www.w3.org/2021/04/xmldsig-more#ed448'
                };
            } else if (publicKeyInfo.includes('secp521r1')) {
                    console.log(`  디버그: ECDSA secp521r1 감지됨`);
                return {
                    keyType: 'ECDSA',
                    curve: 'secp521r1',
                    signatureAlgorithm: 'ECDSA-SHA512',
                    hashAlgorithm: 'SHA512',
                    xmldsigAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512'
                };
            } else {
                    console.log(`  디버그: 기본 ECDSA secp256r1 사용`);
                return {
                    keyType: 'ECDSA',
                    curve: 'secp256r1',
                    signatureAlgorithm: 'ECDSA-SHA512',
                    hashAlgorithm: 'SHA512',
                    xmldsigAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512'
                };
            }
        }
        
        // 기본값 (ECDSA-SHA512)
        return {
            keyType: 'ECDSA',
            curve: 'unknown',
            signatureAlgorithm: 'ECDSA-SHA512',
            hashAlgorithm: 'SHA512',
            xmldsigAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512'
        };
        
    } catch (error) {
        console.error(`  ${colors.fg.red}인증서 알고리즘 분석 오류:${colors.reset}`, error.message);
        throw error;
    }
}

// --- 서브 인증서 로드 함수 (개수 제한 포함) ---
async function loadSubCertificates(subCertDir, pattern, maxCount) {
    try {
        const files = await fs.readdir(subCertDir);
        const subCertFiles = files.filter(file => 
            file.match(new RegExp(pattern.replace('*', '.*')))
        ).sort(); // 파일명 순서대로 정렬
        
        // 최대 개수 제한
        const limitedFiles = subCertFiles.slice(0, maxCount);
        
        if (subCertFiles.length > maxCount) {
            console.log(`  ${colors.fg.yellow}경고: 서브 인증서 ${subCertFiles.length}개 중 ${maxCount}개만 사용됩니다.${colors.reset}`);
        }
        
        const subCertificates = [];
        for (const file of limitedFiles) {
            const certPath = path.join(subCertDir, file);
            const certData = await fs.readFile(certPath, 'utf8');
            subCertificates.push({
                filename: file,
                data: certData,
                base64: certData.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r?\n|\s/g, '')
            });
            console.log(`  서브 인증서 로드 완료: ${file}`);
        }
        
        return subCertificates;
    } catch (error) {
        console.log(`  서브 인증서 디렉토리 없음 또는 비어있음: ${subCertDir}`);
        return [];
    }
}

// --- 인증서를 Base64로 읽기 ---
async function readCertificateAsBase64(certPath) {
    try {
        const certPem = await fs.readFile(certPath, 'utf8');
        return certPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r?\n|\s/g, '');
    } catch (error) {
        console.error(`  ${colors.fg.red}인증서 읽기 오류 (${certPath}):${colors.reset}`, error.message);
        throw error;
    }
}

// --- 메인 XML 생성 함수 ---
async function generateISO15118v20XML() {
    if (messageType === 'req') {
        await generateCertificateInstallationReq();
    } else {
        await generateCertificateInstallationRes();
    }
}

async function generateCertificateInstallationReq() {
    const exiProcessor = new ExiProcessor();
    let calculatedDigestValue = 'ERROR_DIGEST_VALUE';
    let calculatedSignatureValue = 'ERROR_SIGNATURE_VALUE';
    let sessionId = 'ERROR_SESSION';
    let oemCertBase64 = 'ERROR_OEM_CERT';
    let subCertificates = [];
    let rootCertInfos = [];
    let algorithms = null;
    let prioritizedEmaids = [];

    try {
        // 출력 디렉토리 생성
        await fs.mkdir(CONFIG.OUT_DIR, { recursive: true });

        // 1. 데이터 준비
        console.log(`${colors.fg.blue}[1/7] 데이터 준비 중...${colors.reset}`);
        
        // ExiProcessor 초기화
        exiProcessor.init();
        
        // 알고리즘 정보 추출
        algorithms = await getAlgorithmsFromCert(CONFIG.OEM_CERT_PATH);
        console.log(`  감지된 알고리즘: ${algorithms.signatureAlgorithm} (${algorithms.keyType})`);
        
        // OEM 인증서 로드
        oemCertBase64 = await readCertificateAsBase64(CONFIG.OEM_CERT_PATH);
        console.log(`  OEM 인증서 로드 완료 (길이: ${oemCertBase64.length})`);
        
        // 서브 인증서들 로드
        const subCertObjects = await loadSubCertificates(
            CONFIG.SUB_CERT_DIR,
            CONFIG.SUB_CERT_PATTERN,
            CONFIG.MAX_SUB_CERTS
        );
        subCertificates = subCertObjects.map(obj => obj.base64);
        
        // 세션 ID 생성
        sessionId = crypto.randomBytes(8).toString('hex').toUpperCase();
        console.log(`  세션 ID: ${sessionId}`);
        
        // 루트 인증서 정보 추출
        try {
            const certFiles = await fs.readdir(CONFIG.ROOT_CERTS_DIR);
            const opensslPromises = certFiles
                .filter(file => /\.(pem|crt|cer)$/i.test(file))
                .map(async (file) => {
                    const certPath = path.join(CONFIG.ROOT_CERTS_DIR, file);
                    try {
                        const subjectCmd = `openssl x509 -in "${certPath}" -noout -subject -nameopt RFC2253`;
                        const serialCmd = `openssl x509 -in "${certPath}" -noout -serial`;
                        
                        const { stdout: subjectOut } = await exec(subjectCmd);
                        const { stdout: serialOut } = await exec(serialCmd);
                        
                        const issuerName = subjectOut.replace('subject=', '').trim();
                        const serialHex = serialOut.replace('serial=', '').trim();
                        const serialDecimal = serialHex ? BigInt('0x' + serialHex).toString() : 'INVALID';
                        
                        if (issuerName && serialDecimal !== 'INVALID') {
                            return { issuerName, serialNumber: serialDecimal };
                        }
                        return null;
                    } catch (e) {
                        console.error(`  루트 인증서 ${file} 처리 오류: ${e.message}`);
                        return null;
                    }
                });
            
            rootCertInfos = (await Promise.all(opensslPromises)).filter(c => c !== null);
            console.log(`  루트 인증서 ${rootCertInfos.length}개 로드 완료`);
        } catch (err) {
            console.error(`  루트 인증서 폴더 처리 오류: ${err.message}`);
        }

        // EMAID 리스트 로드 (선택사항)
            if (emaidOption === 'include') {
        try {
            const emaidData = await fs.readFile(CONFIG.EMAID_LIST_PATH, 'utf8');
            prioritizedEmaids = JSON.parse(emaidData);
            if (Array.isArray(prioritizedEmaids)) {
                console.log(`  EMAID 리스트 로드 완료: ${prioritizedEmaids.length}개`);
            } else {
                prioritizedEmaids = [];
            }
        } catch (error) {
            console.log(`  ${colors.fg.yellow}EMAID 리스트 건너뛰기: ${error.message}${colors.reset}`);
                    prioritizedEmaids = [];
                }
            } else {
                console.log(`  ${colors.fg.cyan}EMAID 무시 옵션으로 PrioritizedEMAIDs를 생략합니다.${colors.reset}`);
            prioritizedEmaids = [];
        }

        // 2. DigestValue 계산
        console.log(`${colors.fg.blue}[2/7] DigestValue 계산 중...${colors.reset}`);

        // OEMProvisioningCertificateChain 생성 (새로운 구조)
        const chainElement = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('OEMProvisioningCertificateChain', { 
                'Id': CONFIG.DEFAULT_ELEMENT_ID,
                'xmlns': CONFIG.NAMESPACES.ns
            });
            
        chainElement.ele('Certificate').txt(oemCertBase64);
        
        // 서브 인증서 추가 (SubCertificates 래퍼 사용)
        if (subCertificates.length > 0) {
            const subCertificatesWrapper = chainElement.ele('SubCertificates');
            subCertificates.forEach(subCert => {
                subCertificatesWrapper.ele('Certificate').txt(subCert);
            });
        }

        let chainXmlString = chainElement.root().toString({ prettyPrint: false });
        console.log(`  인증서 체인 XML 생성 완료 (길이: ${chainXmlString.length})`);

        try {
            // EXI 인코딩 (바이너리 데이터 직접 반환)
            console.log(`  ${colors.fg.cyan}[EXI] XML을 EXI로 인코딩 중...${colors.reset}`);
            const chainExiBuffer = exiProcessor.encodeXML(chainXmlString);
            
            if (!chainExiBuffer) {
                throw new Error('EXI 인코딩 실패');
            }
            
            const hash = crypto.createHash(algorithms.hashAlgorithm.toLowerCase());
            hash.update(chainExiBuffer);
            calculatedDigestValue = hash.digest('base64');
                console.log(`  ${colors.fg.green}[EXI] 인코딩 완료, DigestValue 계산 완료: ${calculatedDigestValue}${colors.reset}`);
        } catch (error) {
            console.error(`  DigestValue 계산 실패: ${error.message}`);
            // Fallback: XML 문자열 직접 해싱
            const hash = crypto.createHash(algorithms.hashAlgorithm.toLowerCase());
            hash.update(chainXmlString, 'utf8');
            calculatedDigestValue = hash.digest('base64');
                console.log(`  ${colors.fg.yellow}Fallback DigestValue 사용: ${calculatedDigestValue}${colors.reset}`);
        }

        // 3. SignatureValue 계산
        console.log(`${colors.fg.blue}[3/7] SignatureValue 계산 중...${colors.reset}`);

        const signedInfoBuilder = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('sig:SignedInfo', { 'xmlns:sig': CONFIG.NAMESPACES.sig });
            
        const canonicalizationMethod = signedInfoBuilder.ele('sig:CanonicalizationMethod');
        canonicalizationMethod.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
        
        const signatureMethod = signedInfoBuilder.ele('sig:SignatureMethod');
        signatureMethod.att('Algorithm', algorithms.xmldsigAlgorithm);
        
        const reference = signedInfoBuilder.ele('sig:Reference');
        reference.att('URI', `#${CONFIG.DEFAULT_ELEMENT_ID}`);
        
        const transforms = reference.ele('sig:Transforms');
        const transform = transforms.ele('sig:Transform');
        transform.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
        
        const digestMethod = reference.ele('sig:DigestMethod');
        digestMethod.att('Algorithm', `http://www.w3.org/2001/04/xmlenc#${algorithms.hashAlgorithm.toLowerCase()}`);
        
        reference.ele('sig:DigestValue').txt(calculatedDigestValue);

        let signedInfoXmlString = signedInfoBuilder.root().toString({ prettyPrint: false });
        console.log(`  SignedInfo 생성 완료 (길이: ${signedInfoXmlString.length})`);

        try {
            // 개인 키 로드 및 서명
            const privateKeyPem = await fs.readFile(CONFIG.PRIVATE_KEY_PATH, 'utf8');
            
            let signatureBuffer;
            if (algorithms.keyType === 'Ed448') {
                // Ed448 서명 (EXI 인코딩 시도)
                try {
                    console.log(`  ${colors.fg.cyan}[EXI] SignedInfo를 EXI로 인코딩 중...${colors.reset}`);
                    const signedInfoExiBuffer = exiProcessor.encodeXML(signedInfoXmlString);
                    
                    if (!signedInfoExiBuffer) {
                        throw new Error('SignedInfo EXI 인코딩 실패');
                    }
                    
                        // Ed448은 prehash 없이 직접 서명
                        signatureBuffer = crypto.sign(null, signedInfoExiBuffer, privateKeyPem);
                    console.log(`  ${colors.fg.green}[EXI] SignedInfo 인코딩 완료${colors.reset}`);
                } catch (exiError) {
                    // Fallback: 원본 XML 문자열로 서명
                    console.log(`  ${colors.fg.yellow}Fallback: 원본 XML로 서명${colors.reset}`);
                        const xmlBuffer = Buffer.from(signedInfoXmlString, 'utf8');
                        signatureBuffer = crypto.sign(null, xmlBuffer, privateKeyPem);
                }
            } else {
                // ECDSA 서명 (EXI 인코딩 시도)
                try {
                    console.log(`  ${colors.fg.cyan}[EXI] SignedInfo를 EXI로 인코딩 중...${colors.reset}`);
                    const signedInfoExiBuffer = exiProcessor.encodeXML(signedInfoXmlString);
                    
                    if (!signedInfoExiBuffer) {
                        throw new Error('SignedInfo EXI 인코딩 실패');
                    }
                    
                    const sign = crypto.createSign(algorithms.hashAlgorithm);
                    sign.update(signedInfoExiBuffer);
                    sign.end();
                    signatureBuffer = sign.sign(privateKeyPem);
                    console.log(`  ${colors.fg.green}[EXI] SignedInfo 인코딩 완료${colors.reset}`);
                } catch (exiError) {
                    // Fallback: 원본 XML 문자열로 서명
                    console.log(`  ${colors.fg.yellow}Fallback: 원본 XML로 서명${colors.reset}`);
                    const sign = crypto.createSign(algorithms.hashAlgorithm);
                    sign.update(signedInfoXmlString, 'utf8');
                    sign.end();
                    signatureBuffer = sign.sign(privateKeyPem);
                }
            }
            
            calculatedSignatureValue = signatureBuffer.toString('base64');
                console.log(`  SignatureValue 계산 완료: ${calculatedSignatureValue}`);
        } catch (error) {
            console.error(`  SignatureValue 계산 실패: ${error.message}`);
            calculatedSignatureValue = 'SIGNATURE_CALCULATION_FAILED';
        }

        // 4. 최종 XML 생성
        console.log(`${colors.fg.blue}[4/7] 최종 XML 구조 생성 중...${colors.reset}`);

        const finalXml = createFinalXMLv20(
            sessionId, 
            oemCertBase64, 
            subCertificates, 
            rootCertInfos, 
            calculatedDigestValue, 
            calculatedSignatureValue, 
            algorithms,
                prioritizedEmaids,
                emaidOption,
                maxChains
        );

        // 5. XML 파일 저장
        console.log(`${colors.fg.blue}[5/7] XML 파일 저장 중...${colors.reset}`);
        await fs.writeFile(OUTPUT_XML_PATH, finalXml, 'utf8');
        console.log(`  ${colors.fg.green}✅ XML 파일 저장 완료: ${OUTPUT_XML_PATH}${colors.reset}`);

        // 6. 검증
        console.log(`${colors.fg.blue}[6/7] 생성된 XML 검증 중...${colors.reset}`);
        const fileStats = await fs.stat(OUTPUT_XML_PATH);
        console.log(`  파일 크기: ${fileStats.size} bytes`);

        // 7. 완료
        console.log(`${colors.fg.blue}[7/7] 생성 완료!${colors.reset}`);
        console.log(`${colors.fg.green}🎉 ISO 15118-20 CertificateInstallationReq XML 생성이 완료되었습니다!${colors.reset}`);
        console.log(`${colors.fg.cyan}📄 출력 파일: ${OUTPUT_XML_PATH}${colors.reset}`);

    } catch (error) {
        console.error(`${colors.fg.red}❌ XML 생성 중 오류 발생:${colors.reset}`, error.message);
        
        // 오류 발생 시에도 기본 XML 생성 시도
        console.log(`${colors.fg.yellow}⚠️ 오류 복구용 기본 XML 생성 시도...${colors.reset}`);
        try {
            const errorXml = createErrorXMLv20(
                sessionId, 
                oemCertBase64, 
                subCertificates, 
                rootCertInfos, 
                calculatedDigestValue, 
                calculatedSignatureValue, 
                algorithms,
                    prioritizedEmaids,
                    emaidOption,
                    maxChains
            );
            await fs.writeFile(OUTPUT_XML_PATH, errorXml, 'utf8');
            console.log(`${colors.fg.yellow}⚠️ 기본 XML이 생성되었습니다. 수동 확인이 필요합니다.${colors.reset}`);
        } catch (fallbackError) {
            console.error(`${colors.fg.red}기본 XML 생성도 실패했습니다:${colors.reset}`, fallbackError.message);
        }
    }
}

async function generateCertificateInstallationRes() {
    try {
        // 출력 디렉토리 생성
        await fs.mkdir(CONFIG.OUT_DIR, { recursive: true });

        console.log(`${colors.fg.blue}[1/5] 사용자 입력 받는 중...${colors.reset}`);
        
        // 사용자 입력 받기
        const responseCode = await selectResponseCode();
        const evseProcessing = await selectEVSEProcessing();
        const remainingChains = await inputRemainingChains();
        
        console.log(`${colors.fg.blue}[2/5] 데이터 준비 중...${colors.reset}`);
        
        // 세션 ID 생성
        const sessionId = crypto.randomBytes(8).toString('hex').toUpperCase();
        console.log(`  세션 ID: ${sessionId}`);
        
        // 타임스탬프 생성
        const timestamp = Math.floor(Date.now() / 1000);
        console.log(`  타임스탬프: ${timestamp}`);
        
        // 알고리즘 정보 추출
        const algorithms = await getAlgorithmsFromCert(CONFIG.OEM_CERT_PATH);
        console.log(`  감지된 알고리즘: ${algorithms.signatureAlgorithm} (${algorithms.keyType})`);
        
        // CPS 인증서 체인 로드
        const cpsCertBase64 = await readCertificateAsBase64(CONFIG.OEM_CERT_PATH);
        const cpsSubCerts = await loadSubCertificates(
            CONFIG.SUB_CERT_DIR,
            CONFIG.SUB_CERT_PATTERN,
            CONFIG.MAX_SUB_CERTS
        );
        
        console.log(`${colors.fg.blue}[3/5] 키 생성 중...${colors.reset}`);
        
        // ECDH 키 생성
        const ecdhCurve = algorithms.keyType === 'Ed448' ? 'X448' : 'SECP521';
        const { publicKey: dhPublicKey, privateKey: dhPrivateKey } = await generateECDHKeys(ecdhCurve);
        
        // 암호화된 개인키 생성
        const encryptedPrivateKey = await generateEncryptedPrivateKey(dhPrivateKey, algorithms.keyType);
        
        console.log(`${colors.fg.blue}[4/5] 서명 생성 중...${colors.reset}`);
        
        // SignedInstallationData 생성 및 서명
        const signedInstallationData = await createSignedInstallationData(
            algorithms, 
            dhPublicKey, 
            encryptedPrivateKey,
            ecdhCurve
        );
        
        console.log(`${colors.fg.blue}[5/5] XML 생성 중...${colors.reset}`);
        
        // 최종 XML 생성
        const finalXml = createCertificateInstallationResXML(
            sessionId,
            timestamp,
            responseCode,
            evseProcessing,
            cpsCertBase64,
            cpsSubCerts,
            signedInstallationData,
            remainingChains,
            algorithms
        );
        
        // XML 파일 저장
        await fs.writeFile(OUTPUT_XML_PATH, finalXml, 'utf8');
        
        console.log(`${colors.fg.green}🎉 ISO 15118-20 CertificateInstallationRes XML 생성이 완료되었습니다!${colors.reset}`);
        console.log(`${colors.fg.cyan}📄 출력 파일: ${OUTPUT_XML_PATH}${colors.reset}`);
        
    } catch (error) {
        console.error(`${colors.fg.red}❌ CertificateInstallationRes 생성 중 오류 발생:${colors.reset}`, error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

// ECDH 키 생성 함수
async function generateECDHKeys(curve) {
    try {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
            namedCurve: curve === 'SECP521' ? 'secp521r1' : 'X448',
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });
        
        // 공개키를 133바이트 base64로 변환
        const publicKeyBuffer = Buffer.from(publicKey, 'utf8');
        const base64PublicKey = publicKeyBuffer.toString('base64');
        
        return {
            publicKey: base64PublicKey,
            privateKey: privateKey
        };
    } catch (error) {
        console.error(`ECDH 키 생성 오류: ${error.message}`);
        throw error;
    }
}

// 암호화된 개인키 생성 함수
async function generateEncryptedPrivateKey(privateKey, keyType) {
    try {
        const privateKeyBuffer = Buffer.from(privateKey, 'utf8');
        let encryptedKey;
        
        if (keyType === 'Ed448') {
            // X448: 84바이트
            encryptedKey = crypto.randomBytes(84);
        } else {
            // SECP521: 94바이트
            encryptedKey = crypto.randomBytes(94);
        }
        
        return encryptedKey.toString('base64');
    } catch (error) {
        console.error(`암호화된 개인키 생성 오류: ${error.message}`);
        throw error;
    }
}

// SignedInstallationData 생성 함수
async function createSignedInstallationData(algorithms, dhPublicKey, encryptedPrivateKey, ecdhCurve) {
    try {
        // 계약 인증서 체인 로드
        const contractCertBase64 = await readCertificateAsBase64(CONFIG.OEM_CERT_PATH);
        const contractSubCerts = await loadSubCertificates(
            CONFIG.SUB_CERT_DIR,
            CONFIG.SUB_CERT_PATTERN,
            CONFIG.MAX_SUB_CERTS
        );
        
        // SignedInstallationData XML 생성
        const signedDataBuilder = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('SignedInstallationData', { 'Id': 'SignedInstallationData001' });
        
        // ContractCertificateChain
        const contractChain = signedDataBuilder.ele('ContractCertificateChain');
        contractChain.ele('Certificate').txt(contractCertBase64);
        
        if (contractSubCerts.length > 0) {
            const subCerts = contractChain.ele('SubCertificates');
            contractSubCerts.forEach(cert => {
                subCerts.ele('Certificate').txt(cert.base64);
            });
        }
        
        // ECDHCurve
        signedDataBuilder.ele('ECDHCurve').txt(ecdhCurve);
        
        // DHPublicKey
        signedDataBuilder.ele('DHPublicKey').txt(dhPublicKey);
        
        // 암호화된 개인키
        if (ecdhCurve === 'SECP521') {
            signedDataBuilder.ele('SECP521_EncryptedPrivateKey').txt(encryptedPrivateKey);
        } else {
            signedDataBuilder.ele('X448_EncryptedPrivateKey').txt(encryptedPrivateKey);
        }
        
        const signedDataXml = signedDataBuilder.root().toString({ prettyPrint: false });
        
        // 서명 생성
        const privateKeyPem = await fs.readFile(CONFIG.PRIVATE_KEY_PATH, 'utf8');
        const sign = crypto.createSign(algorithms.hashAlgorithm);
        sign.update(signedDataXml, 'utf8');
        sign.end();
        const signature = sign.sign(privateKeyPem);
        
        return {
            xml: signedDataXml,
            signature: signature.toString('base64'),
            digestValue: crypto.createHash(algorithms.hashAlgorithm.toLowerCase()).update(signedDataXml, 'utf8').digest('base64')
        };
        
    } catch (error) {
        console.error(`SignedInstallationData 생성 오류: ${error.message}`);
        throw error;
    }
}

// CertificateInstallationRes XML 생성 함수
function createCertificateInstallationResXML(sessionId, timestamp, responseCode, evseProcessing, cpsCertBase64, cpsSubCerts, signedInstallationData, remainingChains, algorithms) {
    const xmlBuilder = create({ version: '1.0', encoding: 'UTF-8' });
    
    const message = xmlBuilder.ele('CertificateInstallationRes');
    
    // 네임스페이스 추가
    message.att('xmlns', CONFIG.NAMESPACES.ns);
    message.att('xmlns:ct', CONFIG.NAMESPACES.ct);
    message.att('xmlns:sig', CONFIG.NAMESPACES.sig);
    message.att('xmlns:xsi', CONFIG.NAMESPACES.xsi);
    message.att('xsi:schemaLocation', 'urn:iso:std:iso:15118:-20:CommonMessages V2G_CI_CommonMessages.xsd');
    
    // Header
    const header = message.ele('ct:Header');
    header.ele('ct:SessionID').txt(sessionId);
    header.ele('ct:TimeStamp').txt(timestamp.toString());
    
    // Header 안에 서명 추가
    const signature = header.ele('sig:Signature');
    const signedInfo = signature.ele('sig:SignedInfo');
    
    const canonicalizationMethod = signedInfo.ele('sig:CanonicalizationMethod');
    canonicalizationMethod.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
    
    const signatureMethod = signedInfo.ele('sig:SignatureMethod');
    signatureMethod.att('Algorithm', algorithms.xmldsigAlgorithm);
    
    const reference = signedInfo.ele('sig:Reference');
    reference.att('URI', '#SignedInstallationData001');
    
    const transforms = reference.ele('sig:Transforms');
    const transform = transforms.ele('sig:Transform');
    transform.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
    
    const digestMethod = reference.ele('sig:DigestMethod');
    digestMethod.att('Algorithm', `http://www.w3.org/2001/04/xmlenc#${algorithms.hashAlgorithm.toLowerCase()}`);
    
    reference.ele('sig:DigestValue').txt(signedInstallationData.digestValue);
    signature.ele('sig:SignatureValue').txt(signedInstallationData.signature);
    
    // ResponseCode
    message.ele('ct:ResponseCode').txt(responseCode);
    
    // EVSEProcessing
    message.ele('EVSEProcessing').txt(evseProcessing);
    
    // CPSCertificateChain
    const cpsChain = message.ele('CPSCertificateChain');
    cpsChain.ele('Certificate').txt(cpsCertBase64);
    
    if (cpsSubCerts.length > 0) {
        const subCerts = cpsChain.ele('SubCertificates');
        cpsSubCerts.forEach(cert => {
            subCerts.ele('Certificate').txt(cert.base64);
        });
    }
    
    // SignedInstallationData
    const signedDataElement = message.ele('SignedInstallationData');
    signedDataElement.att('Id', 'SignedInstallationData001');
    
    // ContractCertificateChain
    const contractChain = signedDataElement.ele('ContractCertificateChain');
    contractChain.ele('Certificate').txt(cpsCertBase64); // 임시로 CPS 인증서 사용
    
    if (cpsSubCerts.length > 0) {
        const subCerts = contractChain.ele('SubCertificates');
        cpsSubCerts.forEach(cert => {
            subCerts.ele('Certificate').txt(cert.base64);
        });
    }
    
    // ECDHCurve
    const ecdhCurve = algorithms.keyType === 'Ed448' ? 'X448' : 'SECP521';
    signedDataElement.ele('ECDHCurve').txt(ecdhCurve);
    
    // DHPublicKey
    signedDataElement.ele('DHPublicKey').txt(signedInstallationData.xml.match(/<DHPublicKey>(.*?)<\/DHPublicKey>/)?.[1] || '');
    
    // 암호화된 개인키
    if (ecdhCurve === 'SECP521') {
        signedDataElement.ele('SECP521_EncryptedPrivateKey').txt(signedInstallationData.xml.match(/<SECP521_EncryptedPrivateKey>(.*?)<\/SECP521_EncryptedPrivateKey>/)?.[1] || '');
    } else {
        signedDataElement.ele('X448_EncryptedPrivateKey').txt(signedInstallationData.xml.match(/<X448_EncryptedPrivateKey>(.*?)<\/X448_EncryptedPrivateKey>/)?.[1] || '');
    }
    
    // RemainingContractCertificateChains
    message.ele('RemainingContractCertificateChains').txt(remainingChains.toString());
    
    return xmlBuilder.end({ prettyPrint: true });
}

    function createFinalXMLv20(sessionId, oemCertBase64, subCertificates, rootCertInfos, digestValue, signatureValue, algorithms, prioritizedEmaids, emaidOption, maxChains) {
    const xmlBuilder = create({ version: '1.0', encoding: 'UTF-8' });
    
    const message = xmlBuilder.ele('CertificateInstallationReq');
    
    // 네임스페이스 추가 (기본 네임스페이스 사용)
    message.att('xmlns', CONFIG.NAMESPACES.ns);
    message.att('xmlns:ct', CONFIG.NAMESPACES.ct);
    message.att('xmlns:sig', CONFIG.NAMESPACES.sig);
    message.att('xmlns:xsi', CONFIG.NAMESPACES.xsi);
    message.att('xsi:schemaLocation', 'urn:iso:std:iso:15118:-20:CommonMessages V2G_CI_CommonMessages.xsd');
    
    // Header (ct: prefix 사용)
    const header = message.ele('ct:Header');
    header.ele('ct:SessionID').txt(sessionId);
    header.ele('ct:TimeStamp').txt(Math.floor(Date.now() / 1000).toString());
    
    // Header 안에 서명 추가
    const signature = header.ele('sig:Signature');
    const signedInfo = signature.ele('sig:SignedInfo');
    
    const canonicalizationMethod = signedInfo.ele('sig:CanonicalizationMethod');
    canonicalizationMethod.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
    
    const signatureMethod = signedInfo.ele('sig:SignatureMethod');
    signatureMethod.att('Algorithm', algorithms?.xmldsigAlgorithm || 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512');
    
    const reference = signedInfo.ele('sig:Reference');
    reference.att('URI', `#${CONFIG.DEFAULT_ELEMENT_ID}`);
    
    const transforms = reference.ele('sig:Transforms');
    const transform = transforms.ele('sig:Transform');
    transform.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
    
    const digestMethod = reference.ele('sig:DigestMethod');
    const hashAlg = algorithms?.hashAlgorithm?.toLowerCase() || 'sha512';
    digestMethod.att('Algorithm', `http://www.w3.org/2001/04/xmlenc#${hashAlg}`);
    
    reference.ele('sig:DigestValue').txt(digestValue);
    signature.ele('sig:SignatureValue').txt(signatureValue);
    
    // OEM Provisioning Certificate Chain (기본 네임스페이스, prefix 없음)
    const oemProvisioningChain = message.ele('OEMProvisioningCertificateChain', { 
        'Id': CONFIG.DEFAULT_ELEMENT_ID 
    });
    oemProvisioningChain.ele('Certificate').txt(oemCertBase64);
    
    // 서브 인증서 추가 (SubCertificates 래퍼 사용)
    if (subCertificates.length > 0) {
        const subCertificatesWrapper = oemProvisioningChain.ele('SubCertificates');
        subCertificates.forEach(subCert => {
            subCertificatesWrapper.ele('Certificate').txt(subCert);
        });
    }
    
    // 루트 인증서 ID 목록 (X509IssuerSerial 래퍼 사용)
    if (rootCertInfos.length > 0) {
        const rootCertIds = message.ele('ListOfRootCertificateIDs');
        rootCertInfos.forEach(cert => {
            const rootCertId = rootCertIds.ele('ct:RootCertificateID');
            const issuerSerial = rootCertId.ele('sig:X509IssuerSerial');
            issuerSerial.ele('sig:X509IssuerName').txt(cert.issuerName);
            issuerSerial.ele('sig:X509SerialNumber').txt(cert.serialNumber);
        });
    }
    
    // 최대 인증서 체인 수
        message.ele('MaximumContractCertificateChains').txt(maxChains?.toString() || '1');
    
        // 우선순위 EMAID 리스트 (PrioritizedEMAIDs 사용) - emaidOption에 따라 조건부 생성
        if (emaidOption === 'include' && prioritizedEmaids.length > 0) {
        const prioritizedEmaidList = message.ele('PrioritizedEMAIDs');
        prioritizedEmaids.forEach(emaid => {
            prioritizedEmaidList.ele('EMAID').txt(emaid);
        });
    }
    
    return xmlBuilder.end({ prettyPrint: true });
}

    function createErrorXMLv20(sessionId, oemCertBase64, subCertificates, rootCertInfos, digestValue, signatureValue, algorithms, prioritizedEmaids, emaidOption, maxChains) {
    const xmlBuilder = create({ version: '1.0', encoding: 'UTF-8' });
    
    const message = xmlBuilder.ele('CertificateInstallationReq');
    
    // 네임스페이스 추가 (기본 네임스페이스 사용)
    message.att('xmlns', CONFIG.NAMESPACES.ns);
    message.att('xmlns:ct', CONFIG.NAMESPACES.ct);
    message.att('xmlns:sig', CONFIG.NAMESPACES.sig);
    message.att('xmlns:xsi', CONFIG.NAMESPACES.xsi);
    message.att('xsi:schemaLocation', 'urn:iso:std:iso:15118:-20:CommonMessages V2G_CI_CommonMessages.xsd');
    
    // 오류 정보 주석 추가
    message.com('이 XML은 오류 발생으로 인한 기본 생성 버전입니다. 수동 검토가 필요합니다.');
    
    // Header (ct: prefix 사용)
    const header = message.ele('ct:Header');
    header.ele('ct:SessionID').txt(sessionId || 'ERROR_SESSION');
    header.ele('ct:TimeStamp').txt(Math.floor(Date.now() / 1000).toString());
    
    // Header 안에 서명 추가
    const signature = header.ele('sig:Signature');
    const signedInfo = signature.ele('sig:SignedInfo');
    
    const canonicalizationMethod = signedInfo.ele('sig:CanonicalizationMethod');
    canonicalizationMethod.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
    
    const signatureMethod = signedInfo.ele('sig:SignatureMethod');
    signatureMethod.att('Algorithm', algorithms?.xmldsigAlgorithm || 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512');
    
    const reference = signedInfo.ele('sig:Reference');
    reference.att('URI', `#${CONFIG.DEFAULT_ELEMENT_ID}`);
    
    const transforms = reference.ele('sig:Transforms');
    const transform = transforms.ele('sig:Transform');
    transform.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
    
    const digestMethod = reference.ele('sig:DigestMethod');
    const hashAlg = algorithms?.hashAlgorithm?.toLowerCase() || 'sha512';
    digestMethod.att('Algorithm', `http://www.w3.org/2001/04/xmlenc#${hashAlg}`);
    
    reference.ele('sig:DigestValue').txt(digestValue || 'ERROR_DIGEST_VALUE');
    signature.ele('sig:SignatureValue').txt(signatureValue || 'ERROR_SIGNATURE_VALUE');
    
    // OEM Provisioning Certificate Chain (기본 네임스페이스, prefix 없음)
    const oemProvisioningChain = message.ele('OEMProvisioningCertificateChain', { 
        'Id': CONFIG.DEFAULT_ELEMENT_ID 
    });
    oemProvisioningChain.ele('Certificate').txt(oemCertBase64 || 'ERROR_OEM_CERT');
    
    // 서브 인증서 추가 (SubCertificates 래퍼 사용)
    if (subCertificates && subCertificates.length > 0) {
        const subCertificatesWrapper = oemProvisioningChain.ele('SubCertificates');
        subCertificates.forEach(subCert => {
            subCertificatesWrapper.ele('Certificate').txt(subCert);
        });
    }
    
    // 루트 인증서 ID 목록 (X509IssuerSerial 래퍼 사용)
    const rootCertIds = message.ele('ListOfRootCertificateIDs');
    if (rootCertInfos && rootCertInfos.length > 0) {
        rootCertInfos.forEach(cert => {
            const rootCertId = rootCertIds.ele('ct:RootCertificateID');
            const issuerSerial = rootCertId.ele('sig:X509IssuerSerial');
            issuerSerial.ele('sig:X509IssuerName').txt(cert.issuerName || 'ERROR_ISSUER');
            issuerSerial.ele('sig:X509SerialNumber').txt(cert.serialNumber || 'ERROR_SERIAL');
        });
    } else {
        const rootCertId = rootCertIds.ele('ct:RootCertificateID');
        const issuerSerial = rootCertId.ele('sig:X509IssuerSerial');
        issuerSerial.ele('sig:X509IssuerName').txt('ERROR_NO_ROOT_CERTS');
        issuerSerial.ele('sig:X509SerialNumber').txt('0');
    }
    
    // 최대 인증서 체인 수
        message.ele('MaximumContractCertificateChains').txt(maxChains?.toString() || '1');
    
    return xmlBuilder.end({ prettyPrint: true });
}

// 메인 실행
if (require.main === module) {
    generateISO15118v20XML().catch(error => {
            console.error(`${colors.fg.red}치명적 오류:${colors.reset}`, error);
            process.exit(1);
        });
    }
}

// 메인 실행
if (require.main === module) {
    main().catch(error => {
        console.error(`${colors.fg.red}치명적 오류:${colors.reset}`, error);
        process.exit(1);
    });
} 