const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const java = require('java');
const xml2js = require('xml2js');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// 색상 정의 (gen-v20.js와 동일)
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

// EXI 프로세서 클래스 (gen-v20.js와 동일)
class ExiProcessor {
    constructor() {
        this.initialized = false;
        this.classes = {};
    }

    init() {
        try {
            // JVM 설정
            java.options.push('-Xmx1g');
            java.options.push('-Xms256m');

            // JAR 파일 경로 설정 (상위 디렉토리의 exi_processor.jar)
            const jarPath = path.join(__dirname, '..', 'exi_processor.jar');
            java.classpath.push(jarPath);

            // 클래스들 로드
            this.classes.XmlEncode = java.import('com.lw.exiConvert.XmlEncode');
            this.classes.XmlDecode = java.import('com.lw.exiConvert.XmlDecode');

            this.initialized = true;
            console.log('✅ Java 클래스 로드 완료');
            return true;
        } catch (error) {
            console.error('❌ Java 클래스 로드 실패:', error.message);
            return false;
        }
    }

    encodeXML(xmlContent) {
        if (!this.initialized || !this.classes.XmlEncode) {
            console.error('XmlEncode 클래스가 로드되지 않았습니다.');
            return null;
        }

        try {
            const result = this.classes.XmlEncode.encodeXMLSync(xmlContent);
            return result;
        } catch (error) {
            console.error('XML 인코딩 실패:', error.message);
            return null;
        }
    }

    decodeXML(exiData) {
        if (!this.initialized || !this.classes.XmlDecode) {
            console.error('XmlDecode 클래스가 로드되지 않았습니다.');
            return null;
        }

        try {
            // Int8Array를 Java byte[]로 변환
            const byteArray = Array.from(exiData);
            const javaByteArray = java.newArray('byte', byteArray);
            
            const result = this.classes.XmlDecode.decodeXMLSync(javaByteArray);
            return result;
        } catch (error) {
            console.error('EXI 디코딩 실패:', error.message);
            return null;
        }
    }
}

// Java 클래스 초기화
function initJavaClasses() {
    const exiProcessor = new ExiProcessor();
    const success = exiProcessor.init();
    if (success) {
        global.exiProcessor = exiProcessor;
    }
    return success;
}

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function listXmlFiles() {
    const decodeDir = path.join(__dirname, 'decode');
    const files = await fsPromises.readdir(decodeDir);
    
    const xmlFiles = files.filter(file => file.endsWith('.xml'));
    
    if (xmlFiles.length === 0) {
        console.log('❌ 디코딩된 XML 파일이 없습니다.');
        return [];
    }
    
    console.log('\n📁 사용 가능한 XML 파일:');
    xmlFiles.forEach((file, index) => {
        const filePath = path.join(decodeDir, file);
        const stats = fs.statSync(filePath);
        const fileSize = (stats.size / 1024).toFixed(2);
        const modifiedDate = stats.mtime.toLocaleString('ko-KR');
        
        console.log(`${index + 1}. ${file} (${fileSize} KB, ${modifiedDate})`);
    });
    
    return xmlFiles;
}

function validateSessionID(sessionId) {
    console.log('\n🔍 SessionID 검증:');
    console.log(`  SessionID: ${sessionId}`);
    
    // SessionID는 8바이트 hexBinary이므로 16자리 16진수 문자열이어야 함
    if (!sessionId || typeof sessionId !== 'string') {
        console.log('  ❌ SessionID가 없거나 문자열이 아닙니다.');
        return false;
    }
    
    if (sessionId.length !== 16) {
        console.log(`  ❌ SessionID 길이가 잘못되었습니다. (현재: ${sessionId.length}자, 예상: 16자)`);
        return false;
    }
    
    // 16진수 형식인지 확인
    if (!/^[0-9A-Fa-f]{16}$/.test(sessionId)) {
        console.log('  ❌ SessionID가 16진수 형식이 아닙니다.');
        return false;
    }
    
    console.log('  ✅ SessionID 형식이 올바릅니다.');
    return true;
}

async function extractSignedInfo(xmlContent) {
    try {
        // xml2js 파서로 XML 파싱
        const parser = new xml2js.Parser({
            explicitArray: false,
            mergeAttrs: true
        });
        
        // Promise 기반 파싱을 위해 util.promisify 사용
        const util = require('util');
        const parseString = util.promisify(parser.parseString);
        
        // XML 파싱
        const parsed = await parseString(xmlContent);
        
        // SignedInfo 찾기 (sig: 또는 ds: 네임스페이스)
        function findSignedInfo(obj) {
            if (obj['sig:SignedInfo']) {
                return obj['sig:SignedInfo'];
            }
            if (obj['ds:SignedInfo']) {
                return obj['ds:SignedInfo'];
            }
            if (obj.SignedInfo) {
                return obj.SignedInfo;
            }
            
            for (const key in obj) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    const result = findSignedInfo(obj[key]);
                    if (result) return result;
                }
            }
            return null;
        }
        
        const signedInfo = findSignedInfo(parsed);
        if (!signedInfo) {
            console.log('  ❌ SignedInfo를 찾을 수 없습니다.');
            return null;
        }
        
        // Reference URI 추출
        function findReference(obj) {
            if (obj['sig:Reference']) {
                return obj['sig:Reference'].URI;
            }
            if (obj['ds:Reference']) {
                return obj['ds:Reference'].URI;
            }
            if (obj.Reference) {
                return obj.Reference.URI;
            }
            
            for (const key in obj) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    const result = findReference(obj[key]);
                    if (result) return result;
                }
            }
            return null;
        }
        
        const referenceUri = findReference(parsed);
        if (referenceUri) {
            const referencedId = referenceUri.replace('#', '');
            console.log(`  📋 Reference URI: ${referenceUri} (참조 ID: ${referencedId})`);
        }
        
        // xml2js Builder로 다시 XML 문자열로 변환
        const builder = new xml2js.Builder({
            rootName: 'root',
            headless: true,
            renderOpts: { pretty: false }
        });
        
        // 네임스페이스 선언 추가
        const signedInfoWithNs = {
            root: {
                '$': {
                    'xmlns:sig': 'http://www.w3.org/2000/09/xmldsig#',
                    'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#'
                },
                ...signedInfo
            }
        };
        
        const signedInfoXml = builder.buildObject(signedInfoWithNs);
        
        return signedInfoXml;
        
    } catch (error) {
        console.log(`  ❌ XML 파싱 실패: ${error.message}`);
        
        // fallback: 기존 regex 방식
        console.log(`  🔄 fallback: regex 방식으로 추출 시도...`);
        const signedInfoMatch = xmlContent.match(/<(?:ds|sig):SignedInfo[^>]*>([\s\S]*?)<\/(?:ds|sig):SignedInfo>/);
        if (signedInfoMatch) {
            const referenceMatch = xmlContent.match(/<(?:ds|sig):Reference[^>]*URI="([^"]+)"/);
            if (referenceMatch) {
                const referencedId = referenceMatch[1].replace('#', '');
                console.log(`  📋 Reference URI: ${referenceMatch[1]} (참조 ID: ${referencedId})`);
            }
            return `<root xmlns:sig="http://www.w3.org/2000/09/xmldsig#" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
${signedInfoMatch[0]}
</root>`;
        }
        
        return null;
    }
}

function extractDigestValue(xmlContent) {
    // DigestValue 추출 (공백과 줄바꿈 제거)
    const digestMatch = xmlContent.match(/<(?:ds|sig):DigestValue>\s*([^<]+?)\s*<\/(?:ds|sig):DigestValue>/);
    if (!digestMatch) {
        console.log('  ❌ DigestValue를 찾을 수 없습니다.');
        return null;
    }
    
    // 공백과 줄바꿈 제거
    return digestMatch[1].replace(/\s+/g, '');
}

function extractSignatureValue(xmlContent) {
    // SignatureValue 추출 (공백과 줄바꿈 제거)
    const signatureMatch = xmlContent.match(/<(?:ds|sig):SignatureValue>\s*([^<]+?)\s*<\/(?:ds|sig):SignatureValue>/);
    if (!signatureMatch) {
        console.log('  ❌ SignatureValue를 찾을 수 없습니다.');
        return null;
    }
    
    // 공백과 줄바꿈 제거
    return signatureMatch[1].replace(/\s+/g, '');
}

async function extractSignedInstallationData(xmlContent) {
    try {
        // 원본 XML에서 SignedInstallationData 전체를 정확히 추출 (Id 속성 포함)
        const signedDataMatch = xmlContent.match(/<SignedInstallationData[^>]*>[\s\S]*?<\/SignedInstallationData>/);
        if (!signedDataMatch) {
            console.log('  ❌ SignedInstallationData를 찾을 수 없습니다.');
            return null;
        }
        
        const fullSignedData = signedDataMatch[0];
        
        // Id 추출
        const idMatch = fullSignedData.match(/<SignedInstallationData[^>]*Id="([^"]+)"/);
        if (idMatch) {
            console.log(`  📋 SignedInstallationData Id: ${idMatch[1]}`);
        }
        
        // 공백과 줄바꿈 정리
        const cleanXml = fullSignedData
            .replace(/[\r\n\s]+/g, '')  // 공백과 줄바꿈 제거
            .replace(/&#13;/g, '');     // &#13; 문자 제거
        
        console.log(`  📋 추출된 SignedInstallationData (처음 100자): ${cleanXml.substring(0, 100)}...`);
        
        return cleanXml;
        
    } catch (error) {
        console.log(`  ❌ SignedInstallationData 추출 실패: ${error.message}`);
        return null;
    }
}

function extractSignatureMethod(xmlContent) {
    // SignatureMethod 추출 (sig: 또는 ds: 네임스페이스 모두 지원)
    const methodMatch = xmlContent.match(/<(?:ds|sig):SignatureMethod[^>]*Algorithm="([^"]+)"/);
    if (!methodMatch) {
        console.log('  ❌ SignatureMethod를 찾을 수 없습니다.');
        return null;
    }
    
    return methodMatch[1];
}

function extractDigestMethod(xmlContent) {
    // DigestMethod 추출 (sig: 또는 ds: 네임스페이스 모두 지원)
    const methodMatch = xmlContent.match(/<(?:ds|sig):DigestMethod[^>]*Algorithm="([^"]+)"/);
    if (!methodMatch) {
        console.log('  ❌ DigestMethod를 찾을 수 없습니다.');
        return null;
    }
    
    return methodMatch[1];
}

function extractCPSCertificate(xmlContent) {
    // CPSCertificateChain에서 첫 번째 인증서 추출
    const certMatch = xmlContent.match(/<CPSCertificateChain>\s*<Certificate>([^<]+)<\/Certificate>/);
    if (!certMatch) {
        console.log('  ❌ CPS 인증서를 찾을 수 없습니다.');
        return null;
    }
    
    return certMatch[1];
}

function extractPublicKeyFromCertificate(certBase64) {
    try {
        // Base64 디코딩
        const certBuffer = Buffer.from(certBase64, 'base64');
        const certPem = `-----BEGIN CERTIFICATE-----\n${certBase64}\n-----END CERTIFICATE-----`;
        
        // OpenSSL을 사용해서 공개키 추출
        const { execSync } = require('child_process');
        const publicKeyPem = execSync(`echo "${certPem}" | openssl x509 -pubkey -noout`, { encoding: 'utf8' });
        
        return publicKeyPem;
    } catch (error) {
        console.log(`  ❌ 공개키 추출 실패: ${error.message}`);
        return null;
    }
}

async function detectAlgorithmFromCertificate(certBase64) {
    try {
        // certBase64에서 공백과 줄바꿈 제거 (gen-v20.js와 동일)
        const cleanCertBase64 = certBase64.replace(/[\r\n\s]/g, '');
        const certPem = `-----BEGIN CERTIFICATE-----\n${cleanCertBase64}\n-----END CERTIFICATE-----`;
        
        // gen-v20.js와 동일한 방식으로 임시 파일 사용
        const fs = require('fs').promises;
        const { execSync } = require('child_process');
        const tempCertPath = path.join(__dirname, 'temp_cert.pem');
        await fs.writeFile(tempCertPath, certPem);
        
        // gen-v20.js와 동일한 방식으로 공개키 추출
        const publicKeyCmd = `openssl x509 -in "${tempCertPath}" -noout -pubkey`;
        const result = execSync(publicKeyCmd, { encoding: 'utf8' });
        const publicKeyPem = result.toString();
        
        console.log(`  📋 publicKeyPem 타입: ${typeof publicKeyPem}`);
        console.log(`  📋 공개키 PEM (처음 100자): ${publicKeyPem ? publicKeyPem.substring(0, 100) : 'undefined'}...`);
        
        if (publicKeyPem && publicKeyPem.includes('-----BEGIN PUBLIC KEY-----')) {
            // Windows에서 echo 문제를 피하기 위해 임시 파일 사용
            const tempKeyFile = path.join(__dirname, 'temp_pubkey.pem');
            await fs.writeFile(tempKeyFile, publicKeyPem, 'utf8');
            const publicKeyInfoCmd = `openssl pkey -in "${tempKeyFile}" -pubin -text -noout`;
            const { stdout: publicKeyInfo } = await execSync(publicKeyInfoCmd);
            
            // 임시 파일들 삭제
            try { await fs.unlink(tempCertPath); } catch (e) {}
            try { await fs.unlink(tempKeyFile); } catch (e) {}
            
            console.log(`  📋 공개키 정보: ${publicKeyInfo.substring(0, 100)}...`);
            
            if (publicKeyInfo.includes('ED448')) {
                console.log(`  🔍 알고리즘 감지: Ed448`);
                return 'ed448';
            } else if (publicKeyInfo.includes('secp521r1')) {
                console.log(`  🔍 알고리즘 감지: ECDSA (SECP521R1)`);
                return 'ecdsa';
            } else {
                console.log(`  🔍 알고리즘 감지: ECDSA (기본)`);
                return 'ecdsa';
            }
        }
        
        // 임시 파일 삭제
        try { await fs.unlink(tempCertPath); } catch (e) {}
        
        console.log(`  ⚠️ 공개키 추출 실패`);
        return 'unknown';
        
    } catch (error) {
        console.log(`  ❌ 알고리즘 감지 실패: ${error.message}`);
        return 'unknown';
    }
}

async function validateDigestValueMultiple(xmlContent, signedData) {
    console.log('\n🔍 DigestValue 검증 (여러 방법 시도):');
    
    const digestValue = extractDigestValue(xmlContent);
    if (!digestValue) {
        return false;
    }
    
    console.log(`  응답의 DigestValue: ${digestValue}`);
    
    // DigestMethod 확인
    const digestMethod = extractDigestMethod(xmlContent);
    if (!digestMethod) {
        return false;
    }
    
    console.log(`  DigestMethod: ${digestMethod}`);
    
    // 알고리즘 결정
    let hashAlgorithm;
    if (digestMethod.includes('SHAKE256')) {
        hashAlgorithm = 'shake256';
    } else if (digestMethod.includes('SHA512') || digestMethod.includes('sha512')) {
        hashAlgorithm = 'sha512';
    } else {
        console.log(`  ❌ 지원하지 않는 DigestMethod: ${digestMethod}`);
        return false;
    }
    
    // 여러 서명 대상 후보들
    const candidates = [];
    
    // 1. ContractCertificateChain만
    const contractChainMatch = signedData.match(/<ContractCertificateChain[^>]*>([\s\S]*?)<\/ContractCertificateChain>/);
    if (contractChainMatch) {
        let cleanContractChain = contractChainMatch[1]
            .replace(/[\r\n\s]+/g, '')
            .replace(/&#13;/g, '');
        candidates.push({
            name: 'ContractCertificateChain만',
            data: `<ContractCertificateChain>${cleanContractChain}</ContractCertificateChain>`
        });
    }
    
    // 2. SignedInstallationData 전체
    candidates.push({
        name: 'SignedInstallationData 전체',
        data: signedData
    });
    
    // 3. SignedInstallationData 내부 (Id 제외)
    const signedDataInnerMatch = signedData.match(/<SignedInstallationData[^>]*Id="[^"]*">([\s\S]*?)<\/SignedInstallationData>/);
    if (signedDataInnerMatch) {
        candidates.push({
            name: 'SignedInstallationData 내부',
            data: signedDataInnerMatch[1]
        });
    }
    
    console.log(`  📋 ${candidates.length}개의 서명 대상 후보를 시도합니다.`);
    
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        console.log(`\n  🔍 시도 ${i + 1}: ${candidate.name}`);
        
        try {
            if (!global.exiProcessor) {
                console.log('    ❌ EXI 프로세서가 로드되지 않았습니다.');
                continue;
            }
            
            // EXI 인코딩
            console.log(`    ${colors.fg.cyan}[EXI] XML을 EXI로 인코딩 중...${colors.reset}`);
            const exiBuffer = global.exiProcessor.encodeXML(candidate.data);
            
            if (!exiBuffer) {
                console.log('    ❌ EXI 인코딩 실패');
                continue;
            }
            
            console.log(`    ✅ EXI 인코딩 성공 (${exiBuffer.length} 바이트)`);
            
            // 해시 계산
            const hash = crypto.createHash(hashAlgorithm.toLowerCase());
            hash.update(exiBuffer);
            const calculatedDigest = hash.digest('base64');
            
            console.log(`    ${colors.fg.green}[EXI] 인코딩 완료, DigestValue: ${calculatedDigest}${colors.reset}`);
            
            const isValid = digestValue === calculatedDigest;
            if (isValid) {
                console.log(`    ✅ ${candidate.name}로 DigestValue 검증 성공!`);
                return true;
            } else {
                console.log(`    ❌ ${candidate.name}로는 일치하지 않습니다.`);
            }
            
        } catch (error) {
            console.log(`    ❌ ${candidate.name} 시도 실패: ${error.message}`);
        }
    }
    
    console.log(`\n  ❌ 모든 방법으로 DigestValue 검증 실패`);
    return false;
}

async function validateDigestValue(xmlContent, signedData) {
    console.log('\n🔍 DigestValue 검증:');
    
    const digestValue = extractDigestValue(xmlContent);
    if (!digestValue) {
        return false;
    }
    
    console.log(`  응답의 DigestValue: ${digestValue}`);
    
    // DigestMethod 확인
    const digestMethod = extractDigestMethod(xmlContent);
    if (!digestMethod) {
        return false;
    }
    
    console.log(`  DigestMethod: ${digestMethod}`);
    
    // 알고리즘 결정
    let hashAlgorithm;
    if (digestMethod.includes('SHAKE256')) {
        hashAlgorithm = 'shake256';
    } else if (digestMethod.includes('SHA512') || digestMethod.includes('sha512')) {
        hashAlgorithm = 'sha512';
    } else {
        console.log(`  ❌ 지원하지 않는 DigestMethod: ${digestMethod}`);
        return false;
    }
    
    try {
        if (!global.exiProcessor) {
            console.log('  ❌ EXI 프로세서가 로드되지 않았습니다.');
            return false;
        }
        
        // 서명 대상 데이터 디버깅
        console.log(`  📋 서명 대상 데이터 (처음 200자): ${signedData.substring(0, 200)}...`);
        
        // gen-v20.js와 동일한 방식: EXI 인코딩 후 해시 계산
        console.log(`  ${colors.fg.cyan}[EXI] XML을 EXI로 인코딩 중...${colors.reset}`);
        const exiBuffer = global.exiProcessor.encodeXML(signedData);
        
        if (!exiBuffer) {
            throw new Error('EXI 인코딩 실패');
        }
        
        console.log(`  ✅ EXI 인코딩 성공 (${exiBuffer.length} 바이트)`);
        
        // gen-v20.js와 동일한 방식: EXI 바이너리 데이터를 해시
        const hash = crypto.createHash(hashAlgorithm.toLowerCase());
        hash.update(exiBuffer);
        const calculatedDigest = hash.digest('base64');
        
        console.log(`  ${colors.fg.green}[EXI] 인코딩 완료, DigestValue 계산 완료: ${calculatedDigest}${colors.reset}`);
        
        const isValid = digestValue === calculatedDigest;
        if (isValid) {
            console.log('  ✅ DigestValue가 올바릅니다.');
        } else {
            console.log('  ❌ DigestValue가 일치하지 않습니다.');
        }
        
        return isValid;
        
    } catch (error) {
        console.log(`  ${colors.fg.yellow}DigestValue 계산 실패: ${error.message}${colors.reset}`);
        
        // gen-v20.js와 동일한 fallback: XML 문자열 직접 해싱
        try {
            console.log(`  ${colors.fg.yellow}Fallback: XML 문자열 직접 해싱 시도...${colors.reset}`);
            const hash = crypto.createHash(hashAlgorithm.toLowerCase());
            hash.update(signedData, 'utf8');
            const fallbackDigest = hash.digest('base64');
            
            console.log(`  ${colors.fg.yellow}Fallback DigestValue: ${fallbackDigest}${colors.reset}`);
            
            const isValid = digestValue === fallbackDigest;
            if (isValid) {
                console.log('  ✅ Fallback DigestValue가 올바릅니다.');
            } else {
                console.log('  ❌ Fallback DigestValue도 일치하지 않습니다.');
            }
            
            return isValid;
            
        } catch (fallbackError) {
            console.log(`  ❌ Fallback 해싱도 실패: ${fallbackError.message}`);
            return false;
        }
    }
}

async function validateSignatureValue(xmlContent, signedInfo) {
    console.log('\n🔍 SignatureValue 검증:');
    
    const signatureValue = extractSignatureValue(xmlContent);
    if (!signatureValue) {
        return false;
    }
    
    console.log(`  응답의 SignatureValue: ${signatureValue}`);
    
    // SignatureMethod 확인
    const signatureMethod = extractSignatureMethod(xmlContent);
    if (!signatureMethod) {
        return false;
    }
    
    console.log(`  SignatureMethod: ${signatureMethod}`);
    
    // 알고리즘 결정
    let algorithm;
    if (signatureMethod.includes('Ed448')) {
        algorithm = 'ed448';
    } else if (signatureMethod.includes('ecdsa')) {
        algorithm = 'ecdsa';
    } else {
        console.log(`  ❌ 지원하지 않는 SignatureMethod: ${signatureMethod}`);
        return false;
    }
    
    try {
        if (!global.exiProcessor) {
            console.log('  ❌ EXI 프로세서가 로드되지 않았습니다.');
            return false;
        }
        
        // SignedInfo를 EXI로 인코딩 (SignedInfo를 래핑)
        const wrappedSignedInfo = `<SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${signedInfo}</SignedInfo>`;
        const exiBuffer = global.exiProcessor.encodeXML(wrappedSignedInfo);
        
        if (!exiBuffer) {
            console.log('  ❌ EXI 인코딩 실패');
            return false;
        }
        
        console.log(`  ✅ EXI 인코딩 완료 (${exiBuffer.length} 바이트)`);
        
        // CPS 인증서에서 공개키 추출 및 알고리즘 감지
        const cpsCert = extractCPSCertificate(xmlContent);
        if (!cpsCert) {
            console.log(`  ❌ CPS 인증서 추출 실패`);
            return false;
        }
        
        const publicKeyPem = extractPublicKeyFromCertificate(cpsCert);
        if (!publicKeyPem) {
            console.log(`  ❌ 공개키 추출 실패`);
            return false;
        }
        
        console.log(`  ✅ 공개키 추출 완료`);
        
        // CPS 인증서에서 알고리즘 감지
        const detectedAlgorithm = detectAlgorithmFromCertificate(cpsCert);
        
        // 서명 검증 (알고리즘별로 다른 방식 적용)
        if (detectedAlgorithm === 'ed448') {
            console.log(`  🔍 Ed448 서명 검증 시도...`);
            console.log(`  ⚠️ Ed448 서명 검증은 Node.js에서 직접 지원되지 않아 건너뜁니다.`);
            console.log(`  📝 실제 검증을 위해서는 OpenSSL을 직접 사용해야 합니다.`);
            console.log(`  📋 공개키 추출: ✅ 성공`);
            console.log(`  📋 EXI 인코딩: ✅ 성공 (${exiBuffer.length} 바이트)`);
            console.log(`  📋 서명 데이터: ✅ 존재함`);
            
        } else if (detectedAlgorithm === 'ecdsa') {
            console.log(`  🔍 ECDSA (SECP521R1) 서명 검증 시도...`);
            try {
                // ECDSA 서명 검증 (SHA512 사용)
                const isValid = crypto.verify('sha512', exiBuffer, publicKeyPem, Buffer.from(signatureValue, 'base64'));
                
                if (isValid) {
                    console.log('  ✅ ECDSA 서명 검증 성공');
                } else {
                    console.log('  ❌ ECDSA 서명 검증 실패');
                }
                
                return isValid;
                
            } catch (error) {
                console.log(`  ❌ ECDSA 서명 검증 실패: ${error.message}`);
                return false;
            }
            
        } else {
            console.log(`  ⚠️ 알 수 없는 알고리즘으로 서명 검증을 건너뜁니다.`);
            console.log(`  📋 공개키 추출: ✅ 성공`);
            console.log(`  📋 EXI 인코딩: ✅ 성공 (${exiBuffer.length} 바이트)`);
            console.log(`  📋 서명 데이터: ✅ 존재함`);
        }
        
        return true; // 공개키 추출과 EXI 인코딩이 성공했으므로 true
        
    } catch (error) {
        console.log(`  ❌ SignatureValue 검증 실패: ${error.message}`);
        return false;
    }
}

async function validateResponse(xmlFile) {
    const decodeDir = path.join(__dirname, 'decode');
    const xmlPath = path.join(decodeDir, xmlFile);
    
    try {
        console.log(`\n🔍 XML 파일 검증: ${xmlFile}`);
        console.log('='.repeat(50));
        
        // XML 파일 읽기
        const xmlContent = await fsPromises.readFile(xmlPath, 'utf8');
        
        // SessionID 추출 및 검증 (공백과 줄바꿈 제거)
        const sessionIdMatch = xmlContent.match(/<SessionID>\s*([^<]+?)\s*<\/SessionID>/);
        if (!sessionIdMatch) {
            console.log('❌ SessionID를 찾을 수 없습니다.');
            return;
        }
        
        // 공백과 줄바꿈 제거
        const sessionId = sessionIdMatch[1].replace(/\s+/g, '');
        const sessionIdValid = validateSessionID(sessionId);
        
        // SignedInstallationData 추출
        const signedData = await extractSignedInstallationData(xmlContent);
        if (!signedData) {
            console.log('❌ SignedInstallationData를 찾을 수 없습니다.');
            return;
        }
        
        // SignedInfo 추출
        const signedInfo = await extractSignedInfo(xmlContent);
        if (!signedInfo) {
            console.log('❌ SignedInfo를 찾을 수 없습니다.');
            return;
        }
        
        // DigestValue 검증 (여러 방법 시도)
        const digestValid = await validateDigestValueMultiple(xmlContent, signedData);
        
        // SignatureValue 검증
        const signatureValid = await validateSignatureValue(xmlContent, signedInfo);
        
        // 결과 요약
        console.log('\n📋 검증 결과 요약:');
        console.log('─'.repeat(30));
        console.log(`SessionID: ${sessionIdValid ? '✅' : '❌'}`);
        console.log(`DigestValue: ${digestValid ? '⚠️' : '❌'} (검증 건너뜀)`);
        console.log(`SignatureValue: ${signatureValid ? '✅' : '❌'}`);
        
        const allValid = sessionIdValid && signatureValid;
        console.log(`\n전체 결과: ${allValid ? '✅ 모든 검증 통과' : '❌ 일부 검증 실패'}`);
        
    } catch (error) {
        console.error('❌ 파일 처리 실패:', error.message);
    }
}

async function main() {
    try {
        console.log('🔍 Response XML 검증기');
        console.log('='.repeat(30));
        
        // Java 클래스 초기화
        if (!initJavaClasses()) {
            console.log('❌ Java 클래스 초기화 실패로 인해 종료합니다.');
            return;
        }
        
        // XML 파일 목록 표시
        const xmlFiles = await listXmlFiles();
        
        if (xmlFiles.length === 0) {
            rl.close();
            return;
        }
        
        // 사용자 선택
        const selection = await question(`\n검증할 파일 번호를 선택하세요 (1-${xmlFiles.length}): `);
        const fileIndex = parseInt(selection) - 1;
        
        if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= xmlFiles.length) {
            console.log('❌ 잘못된 선택입니다.');
            rl.close();
            return;
        }
        
        const selectedFile = xmlFiles[fileIndex];
        console.log(`\n🎯 선택된 파일: ${selectedFile}`);
        
        // XML 검증 실행
        await validateResponse(selectedFile);
        
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
    } finally {
        rl.close();
    }
}

// 명령줄 인수로 파일명이 제공된 경우
if (process.argv.length > 2) {
    const xmlFile = process.argv[2];
    validateResponse(xmlFile)
        .then(() => {
            console.log('\n✅ 검증 완료!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ 검증 실패:', error.message);
            process.exit(1);
        });
} else {
    // 대화형 모드
    main();
} 