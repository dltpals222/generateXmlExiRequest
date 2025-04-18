const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { create } = require('xmlbuilder2');
const util = require('util');
const { spawn } = require('child_process');
const xmljs = require('libxmljs2'); // For namespace handling

// exec를 Promise 기반으로 변환
const exec = util.promisify(require('child_process').exec);

// --- 설정 값 ---
const OUTPUT_XML_PATH = path.join(__dirname, 'certRequest.xml'); // 생성될 XML 파일 경로
// OEM 인증서 경로를 'cert' 하위 폴더로 변경
const OEM_PROV_CERT_PATH = path.join(__dirname, 'cert', 'oem_prov_cert.pem'); 
// 서명에 사용할 개인 키 경로 (ECDSA, secp256r1/prime256v1 가정)
const PRIVATE_KEY_PATH = path.join(__dirname, 'key', 'private.key.pem'); 
// 루트 인증서들이 있는 폴더 경로
const ROOT_CERTS_DIR = path.join(__dirname, 'root'); 
const JAR_PATH = path.join(__dirname, 'V2Gdecoder.jar'); // JAR 경로

// --- EXIConverter 클래스 정의 (제공된 버전 사용) ---
class EXIConverter {
    async encodeToEXI(xmlString, encodingType = 'default') { // encodingType 파라미터 추가 (서버 흉내, 실제 사용은 안 함)
        const tempXmlFile = path.join(__dirname, `temp_encode_${encodingType}.xml`);
        const tempExiFile = path.join(__dirname, `temp_encode_${encodingType}.xml.exi`);
        console.log(`  [EXI Converter] Encoding XML (${encodingType}) to EXI...`);
        try {
            // console.log('  [EXI Converter] Input XML:', xmlString); // 디버깅 시 필요
            if (!xmlString || xmlString.trim() === '') throw new Error('Empty XML input');
            
            console.log(`  [EXI Converter] Writing XML to temp file: ${tempXmlFile}`);
            await fs.writeFile(tempXmlFile, xmlString, 'utf8');

            let executeJavaCommandArgs = [
                '-jar', JAR_PATH,
                '-x', // XML to EXI
                '-f', tempXmlFile,
                '-o', tempExiFile
                // *** 경고: 여기에 스키마 지정 옵션이 없음 (표준과 다름) ***
            ];

            console.log('  [EXI Converter] Executing Java command...');
            await this.executeJavaCommand(executeJavaCommandArgs);

            console.log(`  [EXI Converter] Reading encoded EXI file: ${tempExiFile}`);
            const exiDataBuffer = await fs.readFile(tempExiFile);
            console.log(`  [EXI Converter] Successfully read EXI data (length: ${exiDataBuffer.length})`);

            // EXI 헤더 수정 (제공된 코드 유지, 표준과의 관련성은 불확실)
            const modifiedExiData = Buffer.from(exiDataBuffer);
            if (modifiedExiData.length > 2) {
               modifiedExiData[2] = modifiedExiData[2] & 0b11111011;
               console.log('  [EXI Converter] Applied EXI header modification.');
            } else {
               console.warn('  [EXI Converter] Warn: EXI data too short for header modification.');
            }
            
            const base64Result = modifiedExiData.toString('base64');
            if (!base64Result || base64Result.trim() === '') throw new Error('Empty EXI result after encoding');
            console.log(`  [EXI Converter] Encoding successful (${encodingType}). Base64 length: ${base64Result.length}`);
            return base64Result;

        } catch (error) {
            console.error(`  [EXI Converter] Error in encodeToEXI (${encodingType}):`, error);
            throw error;
        } finally {
            await fs.unlink(tempXmlFile).catch(err => {});
            await fs.unlink(tempExiFile).catch(err => {});
        }
    }

    // decodeFromEXI는 현재 사용 안 함

    executeJavaCommand(args) {
        // (이전과 동일한 executeJavaCommand 구현)
         return new Promise((resolve, reject) => {
            const java = spawn('java', args);
            let output = '';
            let error = '';
            console.log('    Java command:', 'java', args.join(' '));
            java.stdout.on('data', (data) => { output += data.toString(); });
            java.stderr.on('data', (data) => { error += data.toString(); console.error('    Java stderr:', data.toString()); });
            java.on('error', (err) => { console.error('    Java spawn error:', err); reject(err); });
            java.on('close', (code) => {
                console.log('    Java process exit code:', code);
                if (code === 0) { resolve(output); }
                else { reject(new Error(`Java execution failed (code: ${code}). Stderr: ${error || 'N/A'}`)); }
            });
        });
    }
}
const exiConverter = new EXIConverter(); // 인스턴스 생성

// --- 네임스페이스 처리 유틸리티 (서버 코드 참고) ---

// 네임스페이스 정보 추출 (단순화 버전)
function getNamespacesFromRoot(xmlDoc) {
    const root = xmlDoc.root();
    if (!root) return {};
    const namespaces = {};
    root.namespaces(true).forEach(ns => {
        const prefix = ns.prefix();
        if (prefix) { // 기본 네임스페이스(xmlns) 제외
             namespaces[prefix] = ns.href();
        }
    });
    return namespaces;
}

// XML Fragment에 필요한 네임스페이스 추가 (서버 코드 참고)
function addNamespaces(xmlFragmentString, requiredNamespaces) {
    try {
        const fragmentDoc = xmljs.parseXmlString(xmlFragmentString, { noblanks: true });
        const rootElement = fragmentDoc.root();
        if (!rootElement) return xmlFragmentString; // 파싱 실패 시 원본 반환

        const definedNamespaces = getNamespacesFromRoot(fragmentDoc);

        // 필요한데 정의되지 않은 네임스페이스 추가
        for (const [prefix, uri] of Object.entries(requiredNamespaces)) {
            if (!definedNamespaces[prefix]) {
                console.log(`  Adding namespace to fragment: xmlns:${prefix}="${uri}"`);
                rootElement.defineNamespace(prefix, uri);
            }
        }
        // 네임스페이스 추가 후 prettyPrint 없이 문자열 반환 (해싱/인코딩용)
        return rootElement.toString({ prettyPrint: false, selfCloseEmpty: true });
    } catch (e) {
        console.error("Error adding namespaces to fragment:", e);
        return xmlFragmentString; // 오류 시 원본 반환
    }
}

// --- 메인 XML 생성 함수 ---
async function generateCertificateInstallationReqXml() {
    let calculatedDigestValue = 'ERROR_DIGEST_VALUE';
    let calculatedSignatureValue = 'ERROR_SIGNATURE_VALUE';
    let sessionId = 'ERROR_SESSION';
    let oemCertBase64 = 'ERROR_OEM_CERT';
    let dynamicRootCerts = [];
    // 표준 네임스페이스 정의 (서버 코드 및 생성될 XML 기반)
    const standardNamespaces = {
        'ns7': 'urn:iso:15118:2:2013:MsgDef',        // V2G_Message
        'ns8': 'urn:iso:15118:2:2013:MsgHeader',     // Header elements
        'ns5': 'urn:iso:15118:2:2013:MsgBody',        // Body elements
        'ns6': 'urn:iso:15118:2:2013:MsgDataTypes',  // DataType elements
        'ns4': 'http://www.w3.org/2000/09/xmldsig#' // Signature elements
    };

    try {
        // --- 1. 데이터 준비 --- 
        console.log('[1/7] 데이터 준비...');
        // (OEM Cert, Session ID, Root Certs 로드 로직 - 이전과 동일)
        const oemCertPem = await fs.readFile(OEM_PROV_CERT_PATH, 'utf8');
        oemCertBase64 = oemCertPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r?\n|\s/g, '');
        sessionId = crypto.randomBytes(8).toString('hex').toUpperCase();
        console.log(`  Session ID: ${sessionId}`);
        try {
            const certFiles = await fs.readdir(ROOT_CERTS_DIR);
            const opensslPromises = certFiles
                .filter(file => /\.(pem|crt|cer)$/i.test(file))
                .map(async (file) => {
                    const certPath = path.join(ROOT_CERTS_DIR, file);
                    try {
                         const subjectCmd = `openssl x509 -in "${certPath}" -noout -subject -nameopt RFC2253`;
                         const serialCmd = `openssl x509 -in "${certPath}" -noout -serial`;
                         const { stdout: subjectOut } = await exec(subjectCmd);
                         const { stdout: serialOut } = await exec(serialCmd);
                         const issuerName = subjectOut.replace('subject=', '').trim();
                         const serialHex = serialOut.replace('serial=', '').trim();
                         const serialDecimal = serialHex ? BigInt('0x' + serialHex).toString() : 'INVALID';
                         if(issuerName && serialDecimal !== 'INVALID') return {issuerName, serialNumber: serialDecimal};
                         else return null;
                    } catch (e) { console.error(` Error processing root cert ${file}: ${e.message}`); return null; }
                });
            dynamicRootCerts = (await Promise.all(opensslPromises)).filter(c => c !== null);
            console.log(`  루트 인증서 ${dynamicRootCerts.length}개 로드 완료.`);
        } catch (err) { console.error(` 루트 인증서 폴더(${ROOT_CERTS_DIR}) 처리 오류: ${err.message}`); throw err; }


        // --- 2. DigestValue 계산 (Fragment 추출 -> 네임스페이스 추가 -> EXI 인코딩(시도) -> 해싱) ---
        console.log('[2/7] DigestValue 계산 시도...');
        console.warn("  경고: 표준(V2G_CI_MsgDef 스키마 기반 EXI)과 다를 수 있음!");

        // Body Fragment 생성 (Id 포함)
        const bodyFragmentBuilder = create({ version: '1.0', encoding: 'UTF-8' })
             .ele('ns5:CertificateInstallationReq', { 'ns5:Id': 'ID1' }); // 네임스페이스는 addNamespaces에서 추가
        bodyFragmentBuilder.ele('ns5:OEMProvisioningCert').txt(oemCertBase64);
        const rootCertListFragment = bodyFragmentBuilder.ele('ns5:ListOfRootCertificateIDs');
        dynamicRootCerts.forEach(cert => {
            const rootCertId = rootCertListFragment.ele('ns6:RootCertificateID');
            rootCertId.ele('ns4:X509IssuerName').txt(cert.issuerName);
            rootCertId.ele('ns4:X509SerialNumber').txt(cert.serialNumber);
        });
        let bodyXmlFragmentString = bodyFragmentBuilder.root().first().toString({ prettyPrint: false }); // 요소 자체의 문자열
        
        // 필요한 네임스페이스 추가 (Body Fragment는 ns5, ns6, ns4 사용)
        bodyXmlFragmentString = addNamespaces(bodyXmlFragmentString, {
             'ns5': standardNamespaces['ns5'], 
             'ns6': standardNamespaces['ns6'], 
             'ns4': standardNamespaces['ns4'] 
            }); 
        
        // Fragment EXI 인코딩 시도 (Base64 결과)
        const bodyExiBase64 = await exiConverter.encodeToEXI(bodyXmlFragmentString, 'body_fragment');
        const bodyExiBuffer = Buffer.from(bodyExiBase64, 'base64'); // 해싱 위해 Buffer로 디코딩
        const bodyHash = crypto.createHash('sha256').update(bodyExiBuffer).digest();
        calculatedDigestValue = bodyHash.toString('base64');
        console.log(`  계산된 DigestValue (Base64): ${calculatedDigestValue}`);


        // --- 3. SignatureValue 계산 (Fragment 추출 -> 네임스페이스 추가 -> EXI 인코딩(시도) -> 해싱 -> 서명) ---
        console.log('[3/7] SignatureValue 계산 시도...');
        console.warn("  경고: 표준(XMLdsig 스키마 기반 EXI)과 다를 수 있음!");

        // SignedInfo Fragment 생성 (계산된 DigestValue 사용)
        const signedInfoFragmentBuilder = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('ns4:SignedInfo'); // 네임스페이스는 addNamespaces에서 추가
        signedInfoFragmentBuilder.ele('ns4:CanonicalizationMethod', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
        signedInfoFragmentBuilder.ele('ns4:SignatureMethod', { Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256' });
        const referenceFragment = signedInfoFragmentBuilder.ele('ns4:Reference', { URI: '#ID1' });
        referenceFragment.ele('ns4:Transforms').ele('ns4:Transform', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
        referenceFragment.ele('ns4:DigestMethod', { Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' });
        referenceFragment.ele('ns4:DigestValue').txt(calculatedDigestValue);
        let signedInfoXmlFragmentString = signedInfoFragmentBuilder.root().first().toString({ prettyPrint: false });

        // 필요한 네임스페이스 추가 (SignedInfo Fragment는 ns4만 사용)
        signedInfoXmlFragmentString = addNamespaces(signedInfoXmlFragmentString, {'ns4': standardNamespaces['ns4']});

        // Fragment EXI 인코딩 시도 (Base64 결과)
        const signedInfoExiBase64 = await exiConverter.encodeToEXI(signedInfoXmlFragmentString, 'signedinfo_fragment');
        const signedInfoExiBuffer = Buffer.from(signedInfoExiBase64, 'base64'); // 해싱 위해 Buffer로 디코딩
        const signedInfoExiHash = crypto.createHash('sha256').update(signedInfoExiBuffer).digest();

        // 개인 키 로드 및 서명 (DER 인코딩)
        console.log(`  개인 키 로드: ${PRIVATE_KEY_PATH}`);
        const privateKey = await fs.readFile(PRIVATE_KEY_PATH, 'utf8');
        const signer = crypto.createSign('sha256');
        signer.update(signedInfoExiHash);
        signer.end();
        const signatureOptions = { key: privateKey, dsaEncoding: 'der' }; // 서버와 동일하게 DER 사용
        calculatedSignatureValue = signer.sign(signatureOptions, 'base64');
        console.log(`  계산된 SignatureValue (Base64): ${calculatedSignatureValue}`);


        // --- 4. 최종 XML 조립 --- 
        console.log('[4/7] 최종 XML 구조 조립...');
        const root = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('ns7:V2G_Message', {
                'xmlns:ns7': standardNamespaces['ns7'], 'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
                'xmlns:ns3': 'http://www.w3.org/2001/XMLSchema', 'xmlns:ns4': standardNamespaces['ns4'],
                'xmlns:ns5': standardNamespaces['ns5'], 'xmlns:ns6': standardNamespaces['ns6'],
                'xmlns:ns8': standardNamespaces['ns8']
            });

        // Header (계산된 값 사용)
        const header = root.ele('ns7:Header');
        header.ele('ns8:SessionID').txt(sessionId);
        const signature = header.ele('ns4:Signature');
        const signedInfo = signature.ele('ns4:SignedInfo'); 
        signedInfo.ele('ns4:CanonicalizationMethod', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
        signedInfo.ele('ns4:SignatureMethod', { Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256' });
        const reference = signedInfo.ele('ns4:Reference', { URI: '#ID1' });
        const transforms = reference.ele('ns4:Transforms');
        transforms.ele('ns4:Transform', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
        reference.ele('ns4:DigestMethod', { Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' });
        reference.ele('ns4:DigestValue').txt(calculatedDigestValue); 
        signature.ele('ns4:SignatureValue').txt(calculatedSignatureValue); 

        // Body (데이터 다시 삽입)
        const body = root.ele('ns7:Body');
        const certInstallReq = body.ele('ns5:CertificateInstallationReq', { 'ns5:Id': 'ID1' }); 
        certInstallReq.ele('ns5:OEMProvisioningCert').txt(oemCertBase64);
        const rootCertList = certInstallReq.ele('ns5:ListOfRootCertificateIDs');
        dynamicRootCerts.forEach(cert => {
            const rootCertId = rootCertList.ele('ns6:RootCertificateID');
            rootCertId.ele('ns4:X509IssuerName').txt(cert.issuerName);
            rootCertId.ele('ns4:X509SerialNumber').txt(cert.serialNumber);
        }); 

        const xmlString = root.end({ prettyPrint: true });
        console.log('[5/7] 최종 XML 구조 생성 완료.');

        // --- 5. 생성된 XML 파일 저장 ---
        console.log('[6/7] 최종 XML 파일 저장...');
        await fs.writeFile(OUTPUT_XML_PATH, xmlString, 'utf8');
        console.log(`[7/7] 성공: XML 파일이 '${OUTPUT_XML_PATH}' 경로에 생성되었습니다.`);
        console.warn("  경고: 생성된 XML의 서명 값은 표준 스키마 기반 EXI 변환 없이 계산(시도)되었으므로 유효하지 않을 수 있습니다.");

        return xmlString;

    } catch (error) {
        console.error('최종 XML 생성 중 오류 발생:', error);
        console.error("  오류로 인해 Digest/SignatureValue가 기본 오류 값('ERROR_...')으로 설정되었을 수 있습니다.");
        // 오류 발생 시에도 기본 구조와 오류 값으로 파일 저장 시도 (디버깅 목적)
         try {
            console.warn("  오류 발생... 기본 오류 값으로 XML 파일 저장을 시도합니다.");
            const errorXmlString = createErrorXml(sessionId, oemCertBase64, dynamicRootCerts, calculatedDigestValue, calculatedSignatureValue, standardNamespaces);
             await fs.writeFile(OUTPUT_XML_PATH, errorXmlString, 'utf8');
             console.log(`  경고: 오류가 발생하여 기본 오류 값을 포함한 XML 파일이 저장되었습니다: ${OUTPUT_XML_PATH}`);
         } catch (writeError) {
             console.error("  오류 XML 파일 저장 실패:", writeError);
         }
        throw error; // 원래 오류 다시 throw
    }
}

// 오류 발생 시 기본 XML 생성 함수
function createErrorXml(sessionId, oemCertBase64, dynamicRootCerts, digestValue, signatureValue, namespaces) {
    const root = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('ns7:V2G_Message', {
            'xmlns:ns7': namespaces['ns7'], 'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            'xmlns:ns3': 'http://www.w3.org/2001/XMLSchema', 'xmlns:ns4': namespaces['ns4'],
            'xmlns:ns5': namespaces['ns5'], 'xmlns:ns6': namespaces['ns6'], 'xmlns:ns8': namespaces['ns8']
        });
    // Header
    const header = root.ele('ns7:Header');
    header.ele('ns8:SessionID').txt(sessionId);
    const signature = header.ele('ns4:Signature');
    const signedInfo = signature.ele('ns4:SignedInfo');
    signedInfo.ele('ns4:CanonicalizationMethod', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
    signedInfo.ele('ns4:SignatureMethod', { Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256' });
    const reference = signedInfo.ele('ns4:Reference', { URI: '#ID1' });
    reference.ele('ns4:Transforms').ele('ns4:Transform', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
    reference.ele('ns4:DigestMethod', { Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' });
    reference.ele('ns4:DigestValue').txt(digestValue); // 오류 시 'ERROR_DIGEST_VALUE'
    signature.ele('ns4:SignatureValue').txt(signatureValue); // 오류 시 'ERROR_SIGNATURE_VALUE'
    // Body
    const body = root.ele('ns7:Body');
    const certInstallReq = body.ele('ns5:CertificateInstallationReq', { 'ns5:Id': 'ID1' });
    certInstallReq.ele('ns5:OEMProvisioningCert').txt(oemCertBase64);
    const rootCertList = certInstallReq.ele('ns5:ListOfRootCertificateIDs');
    dynamicRootCerts.forEach(cert => {
        const rootCertId = rootCertList.ele('ns6:RootCertificateID');
        rootCertId.ele('ns4:X509IssuerName').txt(cert.issuerName);
        rootCertId.ele('ns4:X509SerialNumber').txt(cert.serialNumber);
    });
    return root.end({ prettyPrint: true });
}

// --- 스크립트 실행 --- 
(async () => {
    try {
        require.resolve('xmlbuilder2');
        require.resolve('libxmljs2'); // libxmljs2 추가
    } catch (e) {
        console.error("오류: 필요한 라이브러리(xmlbuilder2 또는 libxmljs2)가 설치되지 않았습니다.");
        console.log("설치 명령어: npm install xmlbuilder2 libxmljs2");
        process.exit(1);
    }
    // OpenSSL 및 Java 존재 여부 확인 로직 추가 가능

    try {
        await generateCertificateInstallationReqXml();
        console.log('스크립트 실행 완료.');
    } catch (error) {
        console.error('스크립트 실행 중 최종 오류 발생.');
        process.exitCode = 1;
    }
})(); 