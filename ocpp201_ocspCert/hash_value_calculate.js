/**
 * OCPP 2.0.1 OCSP 인증서 해시 계산 도구
 * 
 * 필요한 파일:
 * 1. 인증서 파일 (PEM 형식)
 *    - 체인 인증서 파일: 여러 인증서가 하나의 파일에 포함된 형태 (예: test_chain.pem)
 *      형식: -----BEGIN CERTIFICATE----- (리프 인증서) -----END CERTIFICATE-----
 *            -----BEGIN CERTIFICATE----- (중간 CA 인증서) -----END CERTIFICATE-----
 *    - 단일 인증서 파일: 하나의 인증서만 포함된 형태
 *      형식: -----BEGIN CERTIFICATE----- (인증서 내용) -----END CERTIFICATE-----
 * 
 * 사용 방법:
 * 1. test_chain.pem을 원하는 인증서 파일로 변경하세요.
 * 2. 코드를 실행하면 자동으로 인증서가 체인인지 단일 인증서인지 판단합니다.
 * 3. 체인 인증서인 경우: 중간 CA의 공개키로 Issuer Key Hash를 계산합니다.
 * 4. 단일 인증서인 경우: 인증서의 Subject DN으로 해시를 계산합니다.
 * 
 * 요구사항:
 * - OpenSSL이 시스템에 설치되어 있어야 합니다.
 * - Node.js가 설치되어 있어야 합니다.
 */

const fs = require('fs').promises;
const { exec: execCallback } = require('child_process');
const util = require('util');
const path = require('path');
const crypto = require('crypto');

// exec를 Promise 기반으로 변환
const exec = util.promisify(execCallback);

async function isCertificateChain(certPEM) {
    const certs = certPEM.split(/(?=-----BEGIN CERTIFICATE-----)/);
    return certs.length > 1;
}

async function extractCertificateInfo(certPath) {
    // ocsp_response 디렉토리 확인 및 생성
    const ocspResponseDir = 'ocsp_response';
    try {
        await fs.access(ocspResponseDir);
    } catch (error) {
        // 디렉토리가 없으면 생성
        await fs.mkdir(ocspResponseDir, { recursive: true });
    }

    // 임시 파일 경로 설정 (현재 디렉토리에)
    const tempIntermediatePath = `${ocspResponseDir}/intermediate_${Date.now()}.pem`;
    const tempLeafPath = `${ocspResponseDir}/leaf_${Date.now()}.pem`;
    const tempDerPath = `${ocspResponseDir}/temp_${Date.now()}.der`;
    
    // 기본 해시 알고리즘
    let hashAlgorithm = 'SHA256';

    // 임시 파일 경로 저장 (정리를 위해)
    const tempFiles = [tempLeafPath, tempDerPath];
    let isChain = false;

    try {
        // 인증서 파일 읽기
        const certPEM = await fs.readFile(certPath, 'utf8');
        isChain = await isCertificateChain(certPEM);
        
        if (isChain) {
            tempFiles.push(tempIntermediatePath);
        }
        
        // 인증서를 파일에 저장 (체인인 경우 리프 인증서)
        await fs.writeFile(tempLeafPath, isChain ? certPEM.split(/(?=-----BEGIN CERTIFICATE-----)/)[0] : certPEM);
        
        // 인증서에서 서명 알고리즘 추출
        const { stdout: sigAlgOutput } = await exec(`openssl x509 -in "${tempLeafPath}" -text -noout | grep "Signature Algorithm"`);
        console.log('\n서명 알고리즘 정보:');
        console.log(sigAlgOutput.trim());
        
        // 추가로 공개키 정보 추출 (ECDSA인 경우 커브 정보 필요)
        const { stdout: pubkeyInfo } = await exec(`openssl x509 -in "${tempLeafPath}" -text -noout | grep -A 10 "Public Key Algorithm"`);
        console.log('\n공개키 알고리즘 정보:');
        console.log(pubkeyInfo.trim());
        
        // 발급자 정보 상세 추출
        const { stdout: issuerInfo } = await exec(`openssl x509 -in "${tempLeafPath}" -text -noout -nameopt RFC2253 | grep -A 10 "Issuer:"`);
        console.log('\n발급자(Issuer) 정보:');
        console.log(issuerInfo.trim());
        
        // 서명 알고리즘 및 커브에 따른 해시 알고리즘 유추
        const sigAlg = sigAlgOutput.toLowerCase();
        const pubKey = pubkeyInfo.toLowerCase();

        // 기본값은 SHA256
        hashAlgorithm = 'SHA256';
        
        // RSA는 모두 SHA256
        if (sigAlg.includes('rsa')) {
            hashAlgorithm = 'SHA256';
        } 
        // ECDSA의 경우 커브(비트 길이)에 따라 결정
        else if (sigAlg.includes('ecdsa')) {
            // 521 비트 키인지 확인하여 SHA512 결정
            if (pubKey.includes('521 bit')) { 
                hashAlgorithm = 'SHA512';
            } else {
                // 다른 ECDSA 커브는 SHA256
                hashAlgorithm = 'SHA256';
            }
        }
        // Ed448은 SHA512
        else if (sigAlg.includes('ed448') || pubKey.includes('ed448')) {
            hashAlgorithm = 'SHA512';
        }
        // 명시적인 해시 알고리즘 언급이 있으면 그것을 사용
        else if (sigAlg.includes('sha512')) {
            hashAlgorithm = 'SHA512';
        } else if (sigAlg.includes('sha384')) {
            hashAlgorithm = 'SHA384';
        } else if (sigAlg.includes('sha1')) {
            hashAlgorithm = 'SHA1';
        } else if (sigAlg.includes('md5')) {
            hashAlgorithm = 'MD5';
        }
        // 그 외에는 모두 SHA256 (요구사항에 따라)
        else {
            hashAlgorithm = 'SHA256';
        }
        
        console.log(`\n인증서 분석 결과 사용할 해시 알고리즘: ${hashAlgorithm}\n`);
        
        let publicKeyHash, leafIssuerDN, leafSerialNumber, issuerDNHash;
        
        if (isChain) {
            // 체인 인증서 처리
            const certs = certPEM.split(/(?=-----BEGIN CERTIFICATE-----)/);
            await fs.writeFile(tempIntermediatePath, certs[1]);  // 중간 CA 인증서
            await fs.writeFile(tempLeafPath, certs[0]);         // 리프 인증서

            // 중간 인증서의 공개키 해시 계산
            await exec(`openssl x509 -in "${tempIntermediatePath}" -pubkey -noout | openssl pkey -pubin -outform DER -out "${tempDerPath}"`);
            const intermediatePublicKeyDER = await fs.readFile(tempDerPath);
            publicKeyHash = crypto
                .createHash(hashAlgorithm)
                .update(intermediatePublicKeyDER)
                .digest('base64');

            // 리프 인증서 정보 추출
            const { stdout: subjectDN } = await exec(`openssl x509 -in "${tempLeafPath}" -nameopt RFC2253 -issuer -noout`);
            leafIssuerDN = subjectDN.replace('issuer=', '').trim();

            const { stdout: serialOutput } = await exec(`openssl x509 -in "${tempLeafPath}" -serial -noout`);
            leafSerialNumber = serialOutput.replace('serial=', '').trim().toLowerCase();
            
            // 발급자 정보 상세 출력 (RFC2253 형식 외에도)
            const { stdout: issuerDetailedInfo } = await exec(`openssl x509 -in "${tempLeafPath}" -text -noout | grep -A 10 "Issuer:"`);
            console.log('\n발급자 상세 정보 (체인 인증서):');
            console.log(issuerDetailedInfo.trim());
        } else {
            // 단일 인증서 처리
            await fs.writeFile(tempLeafPath, certPEM);

            // 인증서의 Issuer DN 추출 및 해시 계산 (Subject DN이 아닌 Issuer DN 사용)
            const { stdout: issuerDN } = await exec(`openssl x509 -in "${tempLeafPath}" -nameopt RFC2253 -issuer -noout`);
            const certIssuerDN = issuerDN.replace('issuer=', '').trim();

            // 인증서의 공개키 해시 계산
            await exec(`openssl x509 -in "${tempLeafPath}" -pubkey -noout | openssl pkey -pubin -outform DER -out "${tempDerPath}"`);
            const publicKeyDER = await fs.readFile(tempDerPath);
            publicKeyHash = crypto
                .createHash(hashAlgorithm)
                .update(publicKeyDER)
                .digest('base64');

            // Serial Number 추출
            const { stdout: serialOutput } = await exec(`openssl x509 -in "${tempLeafPath}" -serial -noout`);
            leafSerialNumber = serialOutput.replace('serial=', '').trim().toLowerCase();

            // Issuer DN을 DER로 변환하고 해시
            await exec(`openssl asn1parse -genstr "UTF8:${certIssuerDN}" -noout -out "${tempDerPath}"`);
            const issuerDNDER = await fs.readFile(tempDerPath);
            issuerDNHash = crypto
                .createHash(hashAlgorithm)
                .update(issuerDNDER)
                .digest('base64');

            leafIssuerDN = certIssuerDN;
            
            // 발급자 정보 추출 (단일 인증서의 경우)
            const { stdout: issuerDetailedInfo } = await exec(`openssl x509 -in "${tempLeafPath}" -text -noout -nameopt RFC2253 | grep -A 10 "Issuer:"`);
            console.log('\n발급자 상세 정보 (단일 인증서):');
            console.log(issuerDetailedInfo.trim());
            
            // 추가로 Subject DN 정보도 표시
            const { stdout: subjectInfo } = await exec(`openssl x509 -in "${tempLeafPath}" -text -noout -nameopt RFC2253 | grep -A 10 "Subject:"`);
            console.log('\n주체(Subject) 정보 (단일 인증서):');
            console.log(subjectInfo.trim());
        }

        // DN을 ASN.1 DER 형식으로 변환
        await exec(`openssl asn1parse -genstr "UTF8:${leafIssuerDN}" -noout -out "${tempDerPath}"`);
        const leafIssuerDNDER = await fs.readFile(tempDerPath);
        
        // 발급자 DN DER의 해시 계산 (체인이 아닌 경우 이미 계산되어 있음)
        if (isChain) {
            issuerDNHash = crypto
                .createHash(hashAlgorithm)
                .update(leafIssuerDNDER)
                .digest('base64');
        }

        // 콘솔 색상 정의
        const colors = {
            black: '\x1b[30m',
            red: '\x1b[31m', 
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            white: '\x1b[37m',
            gray: '\x1b[90m',
            brightRed: '\x1b[91m',
            brightGreen: '\x1b[92m', 
            brightYellow: '\x1b[93m',
            brightBlue: '\x1b[94m',
            brightMagenta: '\x1b[95m',
            brightCyan: '\x1b[96m',
            brightWhite: '\x1b[97m',
            bgBlack: '\x1b[40m',
            bgRed: '\x1b[41m',
            bgGreen: '\x1b[42m',
            bgYellow: '\x1b[43m',
            bgBlue: '\x1b[44m',
            bgMagenta: '\x1b[45m',
            bgCyan: '\x1b[46m',
            bgWhite: '\x1b[47m',
            reset: '\x1b[0m'
        };

        // 결과 출력
        console.group(`Hash Algorithm: ${hashAlgorithm}`);
        console.log(`${colors.green}Certificate Type:${colors.reset}`, isChain ? 'Chain' : 'Single');
        console.log(`${colors.yellow}Issuer Key Hash:${colors.reset}`, publicKeyHash);
        console.log(`${colors.blue}${isChain ? 'Issuer Name' : 'Subject DN'}:${colors.reset}`, leafIssuerDN);
        console.log(`${colors.magenta}Serial Number:${colors.reset}`, leafSerialNumber);
        console.log(`${colors.cyan}${isChain ? 'Issuer Name Hash' : 'Subject DN Hash'}:${colors.reset}`, issuerDNHash);
        console.groupEnd(`Hash Algorithm: ${hashAlgorithm}`);

        // 필요한 정보만 강조 출력
        console.log('\n========== 필요한 정보 ==========');
        console.log(`Certificate Type: ${colors.green}${isChain ? 'Chain' : 'Single'}${colors.reset}`);
        console.log(`Hash Algorithm: ${colors.green}${hashAlgorithm}${colors.reset}`);
        console.log(`${isChain ? 'Issuer Name Hash' : 'Subject DN Hash'}: ${colors.cyan}${issuerDNHash}${colors.reset}`);
        console.log(`Issuer Key Hash: ${colors.yellow}${publicKeyHash}${colors.reset}`);
        console.log(`Serial Number: ${colors.magenta}${leafSerialNumber}${colors.reset}`);
        console.log('===============================\n');

        // 임시 파일들 삭제
        await fs.unlink(tempLeafPath).catch(() => {});
        await fs.unlink(tempDerPath).catch(() => {});
        if (isChain) {
            await fs.unlink(tempIntermediatePath).catch(() => {});
        }

        return {
            isChain,
            publicKeyHash,
            leafIssuerDN,
            leafSerialNumber,
            issuerDNHash
        };
    } catch (error) {
        // 에러 발생 시에도 임시 파일 삭제 시도
        try {
            for (const tempFile of tempFiles) {
                await fs.unlink(tempFile).catch(() => {});
            }
        } catch (cleanupError) {
            console.error('Error cleaning up temporary files:', cleanupError);
        }
        
        console.error('Error processing certificates:', error.message);
        throw error;
    }
}

// 비동기 함수 실행
// 명령행 인수로 파일 경로를 받거나 기본값 사용
const targetPath = process.argv[2] || path.join(__dirname, 'test_chain.pem');
console.log(`처리할 인증서 파일: ${targetPath}`);
extractCertificateInfo(targetPath).catch(console.error);

// 사용 예시 출력
if (!process.argv[2]) {
    console.log('\n사용 방법:');
    console.log('node hash_value_calculate.js [인증서파일경로]');
    console.log('예: node hash_value_calculate.js ./my_certificate.pem');
}

module.exports = {
    extractCertificateInfo
};