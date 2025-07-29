#!/usr/bin/env node

/**
 * ISO 15118-2 Certificate XML 생성기
 * Install/Update 메시지 지원
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { create } = require('xmlbuilder2');
const util = require('util');
const { spawn } = require('child_process');
const xmljs = require('libxmljs2');

// exec를 Promise 기반으로 변환
const exec = util.promisify(require('child_process').exec);

// 명령행 인수 처리
const messageType = process.argv[2] || 'install';
if (!['install', 'update'].includes(messageType)) {
    console.error('❌ 사용법: node gen-v2.js [install|update]');
    process.exit(1);
}

// 색상 정의
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

// --- 설정 값 ---
const CONFIG = {
    // 메시지 타입별 설정
    MESSAGE_TYPE: messageType,
    OUTPUT_XML_PATH: path.join(__dirname, 'out', `certificate${messageType === 'install' ? 'Installation' : 'Update'}Req_v2.xml`),
    
    // Install용 설정
    INSTALL: {
        OEM_CERT_PATH: path.join(__dirname, 'cert', 'v2', 'oem_cert.pem'),
        PRIVATE_KEY_PATH: path.join(__dirname, 'key', 'v2', 'oem_private_key.pem'),
        SUB_CERT_DIR: path.join(__dirname, 'cert', 'v2', 'sub'), // 서브 인증서 디렉토리
        SUB_CERT_PATTERN: 'sub_cert*.pem', // 와일드카드 패턴
        MAX_SUB_CERTS: 4, // ISO 15118-2 최대 4개
    },
    
    // Update용 설정
    UPDATE: {
        CONTRACT_CERT_PATH: path.join(__dirname, 'cert', 'v2', 'target_contract_cert.pem'),
        CONTRACT_SUB_CERT_DIR: path.join(__dirname, 'cert', 'v2', 'contract_sub'), // 서브 인증서 디렉토리
        CONTRACT_SUB_CERT_PATTERN: 'contract_sub_cert*.pem', // 와일드카드 패턴
        PRIVATE_KEY_PATH: path.join(__dirname, 'key', 'v2', 'contract_private_key.pem'),
        EMAID_JSON_PATH: path.join(__dirname, 'emaid', 'v2', 'contract_emaid.json'),
        MAX_SUB_CERTS: 4, // ISO 15118-2 최대 4개
    },
    
    // 공통 설정
    ROOT_CERTS_DIR: path.join(__dirname, 'root'),
    JAR_PATH: path.join(__dirname, 'V2Gdecoder.jar'),
    
    // 표준 네임스페이스 정의
    NAMESPACES: {
        'ns7': 'urn:iso:15118:2:2013:MsgDef',
        'ns8': 'urn:iso:15118:2:2013:MsgHeader',
        'ns5': 'urn:iso:15118:2:2013:MsgBody',
        'ns6': 'urn:iso:15118:2:2013:MsgDataTypes',
        'ns4': 'http://www.w3.org/2000/09/xmldsig#'
    }
};

console.log(`${colors.fg.blue}🚀 ISO 15118-2 Certificate ${messageType === 'install' ? 'Installation' : 'Update'} XML 생성기 시작...${colors.reset}`);
console.log(`  📂 출력 파일: ${CONFIG.OUTPUT_XML_PATH}`);

// --- EXI 변환기 클래스 ---
class EXIConverter {
    async encodeToEXI(xmlString, encodingType = 'default') {
        const tempXmlFile = path.join(__dirname, `temp_encode_${encodingType}_${Date.now()}.xml`);
        const tempExiFile = path.join(__dirname, `temp_encode_${encodingType}_${Date.now()}.xml.exi`);
        
        console.log(`  ${colors.fg.cyan}[EXI] XML을 EXI로 인코딩 중 (${encodingType})...${colors.reset}`);
        
        try {
            if (!xmlString?.trim()) {
                throw new Error('Empty XML input');
            }
            
            await fs.writeFile(tempXmlFile, xmlString, 'utf8');
            
            const javaArgs = [
                '-jar', CONFIG.JAR_PATH,
                '-x', // XML to EXI
                '-f', tempXmlFile,
                '-o', tempExiFile
            ];
            
            await this.executeJavaCommand(javaArgs);
            
            const exiDataBuffer = await fs.readFile(tempExiFile);
            
            // EXI 헤더 수정
            const modifiedExiData = Buffer.from(exiDataBuffer);
            if (modifiedExiData.length > 2) {
                modifiedExiData[2] = modifiedExiData[2] & 0b11111011;
            }
            
            const base64Result = modifiedExiData.toString('base64');
            console.log(`  ${colors.fg.green}[EXI] 인코딩 완료 (${encodingType}), Base64 길이: ${base64Result.length}${colors.reset}`);
            
            return base64Result;
            
        } catch (error) {
            console.error(`  ${colors.fg.red}[EXI] 인코딩 오류 (${encodingType}):${colors.reset}`, error.message);
            throw error;
        } finally {
            // 임시 파일 정리
            await fs.unlink(tempXmlFile).catch(() => {});
            await fs.unlink(tempExiFile).catch(() => {});
        }
    }
    
    executeJavaCommand(args) {
        return new Promise((resolve, reject) => {
            const java = spawn('java', args);
            let output = '';
            let error = '';
            
            java.stdout.on('data', (data) => { output += data.toString(); });
            java.stderr.on('data', (data) => { error += data.toString(); });
            java.on('error', (err) => { reject(err); });
            java.on('close', (code) => {
                if (code === 0) { 
                    resolve(output); 
                } else { 
                    reject(new Error(`Java 실행 실패 (코드: ${code}). 오류: ${error || 'N/A'}`)); 
                }
            });
        });
    }
}

// --- 유틸리티 함수들 ---
function getNamespacesFromRoot(xmlDoc) {
    const root = xmlDoc.root();
    if (!root) return {};
    
    const namespaces = {};
    root.namespaces(true).forEach(ns => {
        const prefix = ns.prefix();
        if (prefix) {
            namespaces[prefix] = ns.href();
        }
    });
    return namespaces;
}

function addNamespaces(xmlFragmentString, requiredNamespaces) {
    try {
        const fragmentDoc = xmljs.parseXmlString(xmlFragmentString, { noblanks: true });
        const rootElement = fragmentDoc.root();
        if (!rootElement) return xmlFragmentString;

        const definedNamespaces = getNamespacesFromRoot(fragmentDoc);

        for (const [prefix, uri] of Object.entries(requiredNamespaces)) {
            if (!definedNamespaces[prefix]) {
                console.log(`  ${colors.fg.cyan}[XML] 네임스페이스 추가: xmlns:${prefix}="${uri}"${colors.reset}`);
                rootElement.defineNamespace(prefix, uri);
            }
        }
        
        return rootElement.toString({ prettyPrint: false, selfCloseEmpty: true });
    } catch (e) {
        console.error(`  ${colors.fg.red}[XML] 네임스페이스 추가 오류:${colors.reset}`, e.message);
        return xmlFragmentString;
    }
}

// --- CN에서 eMAID 추출 함수 ---
async function extractEMAIDFromCert(certPath) {
    try {
        const subjectCmd = `openssl x509 -in "${certPath}" -noout -subject -nameopt RFC2253`;
        const { stdout } = await exec(subjectCmd);
        
        // CN= 부분 추출
        const cnMatch = stdout.match(/CN=([^,]+)/);
        if (cnMatch && cnMatch[1]) {
            return cnMatch[1].trim();
        }
        return null;
    } catch (error) {
        console.error(`  인증서에서 CN 추출 오류: ${error.message}`);
        return null;
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

// --- eMAID 로드 함수 ---
async function loadEMAID() {
    if (CONFIG.MESSAGE_TYPE !== 'update') {
        return null; // Install 메시지에서는 eMAID 불필요
    }
    
    try {
        // 1. JSON 파일에서 eMAID 읽기 시도
        const jsonData = await fs.readFile(CONFIG.UPDATE.EMAID_JSON_PATH, 'utf8');
        const emaidData = JSON.parse(jsonData);
        
        if (emaidData.emaid && emaidData.emaid.trim()) {
            console.log(`  eMAID (JSON): ${emaidData.emaid}`);
            return emaidData.emaid.trim();
        }
        
        // 2. JSON이 비어있으면 계약 인증서에서 CN 추출
        console.log(`  JSON에서 eMAID가 비어있음, 계약 인증서에서 CN 추출 시도...`);
        const emaidFromCert = await extractEMAIDFromCert(CONFIG.UPDATE.CONTRACT_CERT_PATH);
        
        if (emaidFromCert) {
            console.log(`  eMAID (인증서 CN): ${emaidFromCert}`);
            return emaidFromCert;
        }
        
        throw new Error('JSON과 인증서 모두에서 eMAID를 찾을 수 없음');
        
    } catch (error) {
        console.error(`  eMAID 로드 오류: ${error.message}`);
        return 'ERROR_EMAID';
    }
}

// --- 메인 XML 생성 함수 ---
async function generateISO15118v2XML() {
    const exiConverter = new EXIConverter();
    let calculatedDigestValue = 'ERROR_DIGEST_VALUE';
    let calculatedSignatureValue = 'ERROR_SIGNATURE_VALUE';
    let sessionId = 'ERROR_SESSION';
    let dynamicRootCerts = [];
    let certData = {};

    try {
        // 1. 데이터 준비
        console.log(`${colors.fg.blue}[1/7] 데이터 준비 중...${colors.reset}`);
        
        // 메시지 타입별 인증서 로드
        if (CONFIG.MESSAGE_TYPE === 'install') {
            const oemCertPem = await fs.readFile(CONFIG.INSTALL.OEM_CERT_PATH, 'utf8');
            certData.oemCertBase64 = oemCertPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r?\n|\s/g, '');
            console.log(`  OEM 인증서 로드 완료 (길이: ${certData.oemCertBase64.length})`);
            
            // Install용 서브 인증서들 로드
            certData.subCertificates = await loadSubCertificates(
                CONFIG.INSTALL.SUB_CERT_DIR,
                CONFIG.INSTALL.SUB_CERT_PATTERN,
                CONFIG.INSTALL.MAX_SUB_CERTS
            );
        } else {
            // Update 메시지용 계약 인증서 로드
            const contractCertPem = await fs.readFile(CONFIG.UPDATE.CONTRACT_CERT_PATH, 'utf8');
            certData.contractCertBase64 = contractCertPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r?\n|\s/g, '');
            console.log(`  계약 인증서 로드 완료 (길이: ${certData.contractCertBase64.length})`);
            
            // Update용 서브 인증서들 로드
            certData.subCertificates = await loadSubCertificates(
                CONFIG.UPDATE.CONTRACT_SUB_CERT_DIR,
                CONFIG.UPDATE.CONTRACT_SUB_CERT_PATTERN,
                CONFIG.UPDATE.MAX_SUB_CERTS
            );
            
            // eMAID 로드
            certData.emaid = await loadEMAID();
        }
        
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
            
            const results = await Promise.all(opensslPromises);
            dynamicRootCerts = results.filter(cert => cert !== null);
            console.log(`  루트 인증서 ${dynamicRootCerts.length}개 로드 완료`);
            
        } catch (error) {
            console.error(`  루트 인증서 로드 오류: ${error.message}`);
            dynamicRootCerts = [{
                issuerName: 'ERROR_LOADING_ROOT_CERTS',
                serialNumber: '0'
            }];
        }

        // 2. DigestValue 계산
        console.log(`${colors.fg.blue}[2/7] DigestValue 계산 중...${colors.reset}`);
        
        const chainFragment = createCertificateChainFragment(certData);
        console.log(`  인증서 체인 XML 생성 완료 (길이: ${chainFragment.length})`);
        
        try {
            const base64ChainExi = await exiConverter.encodeToEXI(chainFragment, 'chain_fragment');
            const chainExiBuffer = Buffer.from(base64ChainExi, 'base64');
            
            const hash = crypto.createHash('sha256');
            hash.update(chainExiBuffer);
            calculatedDigestValue = hash.digest('base64');
            console.log(`  DigestValue 계산 완료: ${calculatedDigestValue.substring(0, 20)}...`);
        } catch (error) {
            console.error(`  DigestValue 계산 실패: ${error.message}`);
            calculatedDigestValue = 'DIGEST_CALCULATION_FAILED';
        }

        // 3. SignatureValue 계산
        console.log(`${colors.fg.blue}[3/7] SignatureValue 계산 중...${colors.reset}`);
        
        const signedInfoXmlString = createSignedInfoXML(calculatedDigestValue);
        console.log(`  SignedInfo 생성 완료 (길이: ${signedInfoXmlString.length})`);

        try {
            const base64SignedInfoExi = await exiConverter.encodeToEXI(signedInfoXmlString, 'signed_info');
            const signedInfoExiBuffer = Buffer.from(base64SignedInfoExi, 'base64');
            
            // 메시지 타입별 개인 키 로드
            const privateKeyPath = CONFIG.MESSAGE_TYPE === 'install' 
                ? CONFIG.INSTALL.PRIVATE_KEY_PATH 
                : CONFIG.UPDATE.PRIVATE_KEY_PATH;
            
            const privateKeyPem = await fs.readFile(privateKeyPath, 'utf8');
            const sign = crypto.createSign('SHA256');
            sign.update(signedInfoExiBuffer);
            sign.end();
            
            const signatureBuffer = sign.sign(privateKeyPem);
            calculatedSignatureValue = signatureBuffer.toString('base64');
            console.log(`  SignatureValue 계산 완료: ${calculatedSignatureValue.substring(0, 20)}...`);
        } catch (error) {
            console.error(`  SignatureValue 계산 실패: ${error.message}`);
            calculatedSignatureValue = 'SIGNATURE_CALCULATION_FAILED';
        }

        // 4. 최종 XML 생성
        console.log(`${colors.fg.blue}[4/7] 최종 XML 구조 생성 중...${colors.reset}`);

        const finalXml = createFinalXML(sessionId, certData, dynamicRootCerts, calculatedDigestValue, calculatedSignatureValue);

        // 5. XML 파일 저장
        console.log(`${colors.fg.blue}[5/7] XML 파일 저장 중...${colors.reset}`);
        
        // out 폴더 생성 (없는 경우)
        const outputDir = path.dirname(CONFIG.OUTPUT_XML_PATH);
        await fs.mkdir(outputDir, { recursive: true });
        
        await fs.writeFile(CONFIG.OUTPUT_XML_PATH, finalXml, 'utf8');
        console.log(`  ${colors.fg.green}✅ XML 파일 저장 완료: ${CONFIG.OUTPUT_XML_PATH}${colors.reset}`);

        // 6. 검증
        console.log(`${colors.fg.blue}[6/7] 생성된 XML 검증 중...${colors.reset}`);
        const fileStats = await fs.stat(CONFIG.OUTPUT_XML_PATH);
        console.log(`  파일 크기: ${fileStats.size} bytes`);

        // 7. 완료
        console.log(`${colors.fg.blue}[7/7] 생성 완료!${colors.reset}`);
        console.log(`${colors.fg.green}🎉 ISO 15118-2 Certificate ${CONFIG.MESSAGE_TYPE === 'install' ? 'Installation' : 'Update'} XML 생성이 완료되었습니다!${colors.reset}`);
        console.log(`${colors.fg.cyan}📄 출력 파일: ${CONFIG.OUTPUT_XML_PATH}${colors.reset}`);

    } catch (error) {
        console.error(`${colors.fg.red}❌ XML 생성 중 오류 발생:${colors.reset}`, error.message);
        
        // 오류 발생 시에도 기본 XML 생성 시도
        console.log(`${colors.fg.yellow}⚠️ 오류 복구용 기본 XML 생성 시도...${colors.reset}`);
        const errorXml = createErrorXML(sessionId, certData, dynamicRootCerts, calculatedDigestValue, calculatedSignatureValue);
        
        // out 폴더 생성 (없는 경우)
        const outputDir = path.dirname(CONFIG.OUTPUT_XML_PATH);
        await fs.mkdir(outputDir, { recursive: true });
        
        await fs.writeFile(CONFIG.OUTPUT_XML_PATH, errorXml, 'utf8');
        console.log(`${colors.fg.yellow}⚠️ 기본 XML이 생성되었습니다. 수동 확인이 필요합니다.${colors.reset}`);
    }
}

// --- 인증서 체인 프래그먼트 생성 함수 ---
function createCertificateChainFragment(certData) {
    const xmlBuilder = create();
    
    if (CONFIG.MESSAGE_TYPE === 'install') {
        // Install 메시지: OEMProvisioningCert
        const certInstallReq = xmlBuilder.ele('ns5:CertificateInstallationReq', { 'ns5:Id': 'ID1' });
        certInstallReq.ele('ns5:OEMProvisioningCert').txt(certData.oemCertBase64 || 'ERROR_OEM_CERT');
        
        // 서브 인증서들 추가 (최대 4개)
        if (certData.subCertificates && certData.subCertificates.length > 0) {
            const subCerts = certInstallReq.ele('ns5:SubCertificates');
            for (const subCert of certData.subCertificates) {
                subCerts.ele('ns5:Certificate').txt(subCert.base64);
            }
        }
        
        // ListOfRootCertificateIDs는 DigestValue 계산에 포함되지 않음
        
    } else {
        // Update 메시지: ContractSignatureCertChain + eMAID
        const certUpdateReq = xmlBuilder.ele('ns5:CertificateUpdateReq', { 'ns5:Id': 'idvalue0' });
        
        const contractChain = certUpdateReq.ele('ns5:ContractSignatureCertChain', { 'ns6:Id': 'oca_id' });
        contractChain.ele('ns6:Certificate').txt(certData.contractCertBase64 || 'ERROR_CONTRACT_CERT');
        
        // 서브 인증서들 추가 (최대 4개)
        if (certData.subCertificates && certData.subCertificates.length > 0) {
            const subCerts = contractChain.ele('ns6:SubCertificates');
            for (const subCert of certData.subCertificates) {
                subCerts.ele('ns6:Certificate').txt(subCert.base64);
            }
        }
        
        certUpdateReq.ele('ns5:eMAID').txt(certData.emaid || 'ERROR_EMAID');
        
        // ListOfRootCertificateIDs는 DigestValue 계산에 포함되지 않음
    }
    
    let xmlString = xmlBuilder.root().first().toString({ prettyPrint: false });
    
    // 네임스페이스 추가
    xmlString = addNamespaces(xmlString, {
        'ns5': CONFIG.NAMESPACES.ns5,
        'ns6': CONFIG.NAMESPACES.ns6
    });
    
    return xmlString;
}

// --- SignedInfo XML 생성 함수 ---
function createSignedInfoXML(calculatedDigestValue) {
    const signedInfoBuilder = create();
    
    const signedInfo = signedInfoBuilder.ele('ns4:SignedInfo');
    
    const canonicalizationMethod = signedInfo.ele('ns4:CanonicalizationMethod');
    canonicalizationMethod.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
    
    const signatureMethod = signedInfo.ele('ns4:SignatureMethod');
    signatureMethod.att('Algorithm', 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256');
    
    const reference = signedInfo.ele('ns4:Reference');
    reference.att('URI', CONFIG.MESSAGE_TYPE === 'install' ? '#ID1' : '#idvalue0');
    
    const transforms = reference.ele('ns4:Transforms');
    const transform = transforms.ele('ns4:Transform');
    transform.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
    
    const digestMethod = reference.ele('ns4:DigestMethod');
    digestMethod.att('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');
    
    reference.ele('ns4:DigestValue').txt(calculatedDigestValue);

    let signedInfoXmlString = signedInfoBuilder.root().first().toString({ prettyPrint: false });
    signedInfoXmlString = addNamespaces(signedInfoXmlString, {
        'ns4': CONFIG.NAMESPACES.ns4
    });

    return signedInfoXmlString;
}

function createFinalXML(sessionId, certData, rootCerts, digestValue, signatureValue) {
    const xmlBuilder = create({ version: '1.0', encoding: 'UTF-8' });
    
    const v2gMessage = xmlBuilder.ele('ns7:V2G_Message');
    
    // 네임스페이스 추가 (예전 XML 순서대로)
    v2gMessage.att('xmlns:ns7', 'urn:iso:15118:2:2013:MsgDef');
    v2gMessage.att('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
    v2gMessage.att('xmlns:ns3', 'http://www.w3.org/2001/XMLSchema');
    v2gMessage.att('xmlns:ns4', 'http://www.w3.org/2000/09/xmldsig#');
    v2gMessage.att('xmlns:ns5', 'urn:iso:15118:2:2013:MsgBody');
    v2gMessage.att('xmlns:ns6', 'urn:iso:15118:2:2013:MsgDataTypes');
    v2gMessage.att('xmlns:ns8', 'urn:iso:15118:2:2013:MsgHeader');
    
    // Header
    const header = v2gMessage.ele('ns7:Header');
    header.ele('ns8:SessionID').txt(sessionId);
    
    // Header 안에 Signature 추가
    const signature = header.ele('ns4:Signature');
    const signedInfo = signature.ele('ns4:SignedInfo');
    
    const canonicalizationMethod = signedInfo.ele('ns4:CanonicalizationMethod');
    canonicalizationMethod.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
    
    const signatureMethod = signedInfo.ele('ns4:SignatureMethod');
    signatureMethod.att('Algorithm', 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256');
    
    const reference = signedInfo.ele('ns4:Reference');
    reference.att('URI', CONFIG.MESSAGE_TYPE === 'install' ? '#ID1' : '#idvalue0');
    
    const transforms = reference.ele('ns4:Transforms');
    const transform = transforms.ele('ns4:Transform');
    transform.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
    
    const digestMethod = reference.ele('ns4:DigestMethod');
    digestMethod.att('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');
    
    reference.ele('ns4:DigestValue').txt(digestValue);
    signature.ele('ns4:SignatureValue').txt(signatureValue);
    
    // Body
    const body = v2gMessage.ele('ns7:Body');
    
    if (CONFIG.MESSAGE_TYPE === 'install') {
        // Install 메시지
        const certInstallReq = body.ele('ns5:CertificateInstallationReq', { 'ns5:Id': 'ID1' });
        certInstallReq.ele('ns5:OEMProvisioningCert').txt(certData.oemCertBase64 || 'ERROR_OEM_CERT');
        
        // 서브 인증서들 추가 (최대 4개)
        if (certData.subCertificates && certData.subCertificates.length > 0) {
            const subCerts = certInstallReq.ele('ns5:SubCertificates');
            for (const subCert of certData.subCertificates) {
                subCerts.ele('ns5:Certificate').txt(subCert.base64);
            }
        }
        
        const rootCertList = certInstallReq.ele('ns5:ListOfRootCertificateIDs');
        rootCerts.forEach(cert => {
            const rootCertId = rootCertList.ele('ns6:RootCertificateID');
            rootCertId.ele('ns4:X509IssuerName').txt(cert.issuerName);
            rootCertId.ele('ns4:X509SerialNumber').txt(cert.serialNumber);
        });
    } else {
        // Update 메시지
        const certUpdateReq = body.ele('ns5:CertificateUpdateReq', { 'ns5:Id': 'idvalue0' });
        
        const contractChain = certUpdateReq.ele('ns5:ContractSignatureCertChain', { 'ns6:Id': 'oca_id' });
        contractChain.ele('ns6:Certificate').txt(certData.contractCertBase64 || 'ERROR_CONTRACT_CERT');
        
        // 서브 인증서들 추가 (최대 4개)
        if (certData.subCertificates && certData.subCertificates.length > 0) {
            const subCerts = contractChain.ele('ns6:SubCertificates');
            for (const subCert of certData.subCertificates) {
                subCerts.ele('ns6:Certificate').txt(subCert.base64);
            }
        }
        
        certUpdateReq.ele('ns5:eMAID').txt(certData.emaid || 'ERROR_EMAID');
        
        const rootCertList = certUpdateReq.ele('ns5:ListOfRootCertificateIDs');
        rootCerts.forEach(cert => {
            const rootCertId = rootCertList.ele('ns6:RootCertificateID');
            rootCertId.ele('ns4:X509IssuerName').txt(cert.issuerName);
            rootCertId.ele('ns4:X509SerialNumber').txt(cert.serialNumber);
        });
    }
    
    return xmlBuilder.end({ prettyPrint: true });
}

function createErrorXML(sessionId, certData, rootCerts, digestValue, signatureValue) {
    const xmlBuilder = create({ version: '1.0', encoding: 'UTF-8' });
    
    const v2gMessage = xmlBuilder.ele('ns7:V2G_Message');
    
    // 네임스페이스 추가
    Object.entries(CONFIG.NAMESPACES).forEach(([prefix, uri]) => {
        v2gMessage.att(`xmlns:${prefix}`, uri);
    });
    
    // 오류 정보 주석 추가
    v2gMessage.com('이 XML은 오류 발생으로 인한 기본 생성 버전입니다. 수동 검토가 필요합니다.');
    
    // Header
    const header = v2gMessage.ele('ns7:Header');
    header.ele('ns8:SessionID').txt(sessionId || 'ERROR_SESSION');
    
    // Header 안에 Signature 추가 (기본값)
    const signature = header.ele('ns4:Signature');
    const signedInfo = signature.ele('ns4:SignedInfo');
    
    const canonicalizationMethod = signedInfo.ele('ns4:CanonicalizationMethod');
    canonicalizationMethod.att('Algorithm', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
    
    const signatureMethod = signedInfo.ele('ns4:SignatureMethod');
    signatureMethod.att('Algorithm', 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256');
    
    const reference = signedInfo.ele('ns4:Reference');
    reference.att('URI', CONFIG.MESSAGE_TYPE === 'install' ? '#ID1' : '#idvalue0');
    
    const transforms = reference.ele('ns4:Transforms');
    const transform = transforms.ele('ns4:Transform');
    transform.att('Algorithm', 'http://www.w3.org/TR/canonical-exi/');
    
    const digestMethod = reference.ele('ns4:DigestMethod');
    digestMethod.att('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');
    
    reference.ele('ns4:DigestValue').txt(digestValue || 'ERROR_DIGEST_VALUE');
    signature.ele('ns4:SignatureValue').txt(signatureValue || 'ERROR_SIGNATURE_VALUE');
    
    // Body
    const body = v2gMessage.ele('ns7:Body');
    
    if (CONFIG.MESSAGE_TYPE === 'install') {
        const certInstallReq = body.ele('ns5:CertificateInstallationReq', { 'ns5:Id': 'ID1' });
        certInstallReq.ele('ns5:OEMProvisioningCert').txt(certData.oemCertBase64 || 'ERROR_OEM_CERT');
        
        const rootCertList = certInstallReq.ele('ns5:ListOfRootCertificateIDs');
        if (rootCerts && rootCerts.length > 0) {
            rootCerts.forEach(cert => {
                const rootCertId = rootCertList.ele('ns6:RootCertificateID');
                rootCertId.ele('ns4:X509IssuerName').txt(cert.issuerName || 'ERROR_ISSUER');
                rootCertId.ele('ns4:X509SerialNumber').txt(cert.serialNumber || 'ERROR_SERIAL');
            });
        } else {
            const rootCertId = rootCertList.ele('ns6:RootCertificateID');
            rootCertId.ele('ns4:X509IssuerName').txt('ERROR_NO_ROOT_CERTS');
            rootCertId.ele('ns4:X509SerialNumber').txt('0');
        }
    } else {
        const certUpdateReq = body.ele('ns5:CertificateUpdateReq', { 'ns5:Id': 'idvalue0' });
        
        const contractChain = certUpdateReq.ele('ns5:ContractSignatureCertChain', { 'ns6:Id': 'oca_id' });
        contractChain.ele('ns6:Certificate').txt(certData.contractCertBase64 || 'ERROR_CONTRACT_CERT');
        
        const subCerts = contractChain.ele('ns6:SubCertificates');
        subCerts.ele('ns6:Certificate').txt(certData.contractSubCertBase64 || 'ERROR_CONTRACT_SUB_CERT');
        
        certUpdateReq.ele('ns5:eMAID').txt(certData.emaid || 'ERROR_EMAID');
        
        const rootCertList = certUpdateReq.ele('ns5:ListOfRootCertificateIDs');
        if (rootCerts && rootCerts.length > 0) {
            rootCerts.forEach(cert => {
                const rootCertId = rootCertList.ele('ns6:RootCertificateID');
                rootCertId.ele('ns4:X509IssuerName').txt(cert.issuerName || 'ERROR_ISSUER');
                rootCertId.ele('ns4:X509SerialNumber').txt(cert.serialNumber || 'ERROR_SERIAL');
            });
        } else {
            const rootCertId = rootCertList.ele('ns6:RootCertificateID');
            rootCertId.ele('ns4:X509IssuerName').txt('ERROR_NO_ROOT_CERTS');
            rootCertId.ele('ns4:X509SerialNumber').txt('0');
        }
    }
    
    return xmlBuilder.end({ prettyPrint: true });
}

// 메인 실행
if (require.main === module) {
    generateISO15118v2XML().catch(error => {
        console.error(`${colors.fg.red}치명적 오류:${colors.reset}`, error);
        process.exit(1);
    });
} 