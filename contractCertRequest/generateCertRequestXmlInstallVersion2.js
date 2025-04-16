const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { create } = require('xmlbuilder2');
const util = require('util');
const { exec: execCallback } = require('child_process');

// exec를 Promise 기반으로 변환
const exec = util.promisify(execCallback);

// --- 설정 값 ---
const OUTPUT_XML_PATH = path.join(__dirname, 'certRequest.xml'); // 생성될 XML 파일 경로
// OEM 인증서 경로를 'cert' 하위 폴더로 변경
const OEM_PROV_CERT_PATH = path.join(__dirname, 'cert', 'oem_prov_cert.pem'); 
// 서명에 사용할 개인 키 경로 (ECDSA, secp256r1/prime256v1 가정)
const PRIVATE_KEY_PATH = path.join(__dirname, 'key', 'private_key.pem'); 
// 루트 인증서들이 있는 폴더 경로
const ROOT_CERTS_DIR = path.join(__dirname, 'root'); 

// --- XML 생성 함수 ---
async function generateCertificateInstallationReqXml() {
    try {
        // --- 1. 데이터 준비 ---
        console.log(`[1/7] OEM Provisioning Certificate 읽는 중: ${OEM_PROV_CERT_PATH}`);
        let oemCertPem;
        try {
            oemCertPem = await fs.readFile(OEM_PROV_CERT_PATH, 'utf8');
        } catch (err) {
            console.error(`오류: ${OEM_PROV_CERT_PATH} 파일을 읽을 수 없습니다. 파일이 존재하는지 확인하세요.`);
            throw err;
        }
        const oemCertBase64 = oemCertPem
            .replace(/-----BEGIN CERTIFICATE-----/g, '')
            .replace(/-----END CERTIFICATE-----/g, '')
            .replace(/\r?\n/g, '')
            .replace(/\s/g, '');
        console.log('OEM Provisioning Certificate 읽기 및 Base64 변환 완료.');

        const sessionId = crypto.randomBytes(8).toString('hex').toUpperCase();
        console.log(`[2/7] 생성된 Session ID: ${sessionId}`);

        // --- 2. 루트 인증서 정보 동적 로드 ---
        console.log(`[3/7] 루트 인증서 정보 로드 시작 (${ROOT_CERTS_DIR})...`);
        const dynamicRootCerts = [];
        let certFiles = [];
        try {
            certFiles = await fs.readdir(ROOT_CERTS_DIR);
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.error(`오류: 루트 인증서 폴더(${ROOT_CERTS_DIR})를 찾을 수 없습니다.`);
            } else {
                console.error(`오류: 루트 인증서 폴더 읽기 실패: ${err}`);
            }
            throw err;
        }

        const certExtensions = ['.pem', '.crt', '.cer'];
        const rootCertFilePaths = certFiles
            .filter(file => certExtensions.some(ext => file.toLowerCase().endsWith(ext)))
            .map(file => path.join(ROOT_CERTS_DIR, file));

        if (rootCertFilePaths.length === 0) {
            console.warn(`경고: ${ROOT_CERTS_DIR} 폴더에 유효한 루트 인증서 파일(.pem, .crt, .cer)이 없습니다.`);
            // 요구사항에 따라 빈 리스트로 진행하거나 오류를 발생시킬 수 있음
        }

        for (const certPath of rootCertFilePaths) {
            console.log(`  - 처리 중: ${path.basename(certPath)}`);
            try {
                // Subject DN 추출 (RFC2253 형식 사용 권장)
                const { stdout: subjectOutput } = await exec(`openssl x509 -in "${certPath}" -noout -subject -nameopt RFC2253`);
                const issuerName = subjectOutput.replace('subject=', '').trim();

                // Serial Number 추출
                const { stdout: serialOutput } = await exec(`openssl x509 -in "${certPath}" -noout -serial`);
                const serialNumber = serialOutput.replace('serial=', '').trim();

                if (issuerName && serialNumber) {
                    dynamicRootCerts.push({ issuerName, serialNumber });
                    console.log(`    > Issuer: ${issuerName}, Serial: ${serialNumber}`);
                } else {
                    console.warn(`    > 경고: ${path.basename(certPath)}에서 유효한 Subject 또는 Serial 추출 실패.`);
                }
            } catch (opensslError) {
                console.error(`    > 오류: ${path.basename(certPath)} 처리 중 OpenSSL 오류 발생: ${opensslError.message}`);
                // 특정 인증서 처리 실패 시 계속 진행할지 결정
            }
        }
        console.log(`총 ${dynamicRootCerts.length}개의 루트 인증서 정보 로드 완료.`);

        // --- 3. DigestValue 계산 (비표준 방식) ---
        console.log('[4/7] DigestValue 계산 시작 (비표준: XML 직접 해싱)...');
        const bodyFragment = create()
            .ele('ns5:CertificateInstallationReq', { 'xmlns:ns5': 'urn:iso:15118:2:2013:MsgBody', 'xmlns:ns6': 'urn:iso:15118:2:2013:MsgDataTypes', 'xmlns:ns4': 'http://www.w3.org/2000/09/xmldsig#', 'ns5:Id': 'ID1' });
        bodyFragment.ele('ns5:OEMProvisioningCert').txt(oemCertBase64);
        const rootCertListFragment = bodyFragment.ele('ns5:ListOfRootCertificateIDs');
        // 동적으로 로드된 루트 인증서 정보 사용
        if (dynamicRootCerts.length > 0) {
             for (const cert of dynamicRootCerts) {
                 const rootCertId = rootCertListFragment.ele('ns6:RootCertificateID');
                 rootCertId.ele('ns4:X509IssuerName').txt(cert.issuerName);
                 rootCertId.ele('ns4:X509SerialNumber').txt(cert.serialNumber);
             }
        } else {
             // 루트 인증서 정보가 없을 경우 빈 리스트 또는 플레이스홀더 처리 가능
             console.log("ListOfRootCertificateIDs가 비어 있습니다.");
        }
        const bodyXmlString = bodyFragment.root().toString();
        const bodyHash = crypto.createHash('sha256').update(bodyXmlString).digest();
        const calculatedDigestValue = bodyHash.toString('base64');
        console.log(`계산된 DigestValue (Base64): ${calculatedDigestValue}`);

        // --- 4. SignatureValue 계산 (비표준 방식) ---
        console.log('[5/7] SignatureValue 계산 시작 (비표준: XML 직접 해싱 및 서명)...');
        const signedInfoFragment = create()
            .ele('ns4:SignedInfo', { 'xmlns:ns4': 'http://www.w3.org/2000/09/xmldsig#' });
        signedInfoFragment.ele('ns4:CanonicalizationMethod', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
        signedInfoFragment.ele('ns4:SignatureMethod', { Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256' });
        const referenceFragment = signedInfoFragment.ele('ns4:Reference', { URI: '#ID1' });
        const transformsFragment = referenceFragment.ele('ns4:Transforms');
        transformsFragment.ele('ns4:Transform', { Algorithm: 'http://www.w3.org/TR/canonical-exi/' });
        referenceFragment.ele('ns4:DigestMethod', { Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' });
        referenceFragment.ele('ns4:DigestValue').txt(calculatedDigestValue);

        const signedInfoXmlString = signedInfoFragment.root().toString();
        const signedInfoHash = crypto.createHash('sha256').update(signedInfoXmlString).digest();
        
        console.log(`개인 키 로드 중: ${PRIVATE_KEY_PATH}`);
        let privateKey;
        try {
            privateKey = await fs.readFile(PRIVATE_KEY_PATH, 'utf8');
        } catch (err) {
            console.error(`오류: ${PRIVATE_KEY_PATH} 파일을 읽을 수 없습니다. key 폴더에 private_key.pem 파일이 있는지 확인하세요.`);
            throw err;
        }

        const signer = crypto.createSign('sha256');
        signer.update(signedInfoHash);
        signer.end();
        const signatureOptions = {
            key: privateKey,
            dsaEncoding: 'ieee-p1363'
        };
        const calculatedSignatureValue = signer.sign(signatureOptions, 'base64');
        console.log(`계산된 SignatureValue (Base64): ${calculatedSignatureValue}`);

        // --- 5. 최종 XML 조립 --- 
        console.log('[6/7] 최종 XML 구조 생성 시작...');
        const root = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('ns7:V2G_Message', {
                'xmlns:ns7': 'urn:iso:15118:2:2013:MsgDef',
                'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
                'xmlns:ns3': 'http://www.w3.org/2001/XMLSchema', 
                'xmlns:ns4': 'http://www.w3.org/2000/09/xmldsig#',
                'xmlns:ns5': 'urn:iso:15118:2:2013:MsgBody',
                'xmlns:ns6': 'urn:iso:15118:2:2013:MsgDataTypes',
                'xmlns:ns8': 'urn:iso:15118:2:2013:MsgHeader'
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

        // Body (동적 루트 인증서 정보 사용)
        const body = root.ele('ns7:Body');
        const certInstallReq = body.ele('ns5:CertificateInstallationReq', { 'ns5:Id': 'ID1' }); 
        certInstallReq.ele('ns5:OEMProvisioningCert').txt(oemCertBase64);
        const rootCertList = certInstallReq.ele('ns5:ListOfRootCertificateIDs');
        // 동적으로 로드된 루트 인증서 정보 사용
        if (dynamicRootCerts.length > 0) {
            for (const cert of dynamicRootCerts) {
                const rootCertId = rootCertList.ele('ns6:RootCertificateID');
                rootCertId.ele('ns4:X509IssuerName').txt(cert.issuerName);
                rootCertId.ele('ns4:X509SerialNumber').txt(cert.serialNumber);
            }
        } // 루트 인증서가 없는 경우 ListOfRootCertificateIDs는 비어있게 됨

        const xmlString = root.end({ prettyPrint: true });
        console.log('최종 XML 구조 생성 완료.');

        // 6. 생성된 XML 파일 저장
        console.log('[7/7] 최종 XML 파일 저장...');
        await fs.writeFile(OUTPUT_XML_PATH, xmlString, 'utf8');
        console.log(`성공: XML 파일이 '${OUTPUT_XML_PATH}' 경로에 생성되었습니다.`);
        console.warn("경고: 생성된 XML의 DigestValue와 SignatureValue는 표준 EXI 변환 없이 계산되었으므로 실제 환경에서는 유효하지 않을 수 있습니다.");

        return xmlString;

    } catch (error) {
        console.error('XML 생성 및 서명 중 오류 발생:', error);
        // 오류 발생 시에도 에러 로그 외에 스택 트레이스 출력 도움이 될 수 있음
        console.error(error.stack);
        throw error; 
    }
}

// --- 스크립트 실행 --- 
(async () => {
    // 필요한 라이브러리 및 OpenSSL 존재 여부 확인 로직 추가 가능

    try {
        await generateCertificateInstallationReqXml();
        console.log('스크립트 실행 완료.');
    } catch (error) {
        console.error('스크립트 실행 중 최종 오류 발생.');
        process.exitCode = 1; // 오류 코드와 함께 종료
    }
})(); 