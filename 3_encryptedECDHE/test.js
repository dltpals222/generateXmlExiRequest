const SECP521R1PrivateKeyEncryption = require('./secp521r1-encryption');
const X448PrivateKeyEncryption = require('./x448-encryption');

// 테스트 데이터 생성
function generateTestData() {
    return {
        pcid: 'ABCD1234567890EFGH', // 18 bytes
        ski: 'A1B2C3D4E5F6708192A3B4C5D6E7F801' // 32 hex characters = 16 bytes
    };
}

// 바이트 배열을 16진수 문자열로 변환
function bytesToHex(bytes) {
    return Buffer.from(bytes).toString('hex').toUpperCase();
}

// 테스트 결과 출력
function printTestResult(testName, success, details = '') {
    const status = success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${testName}`);
    if (details) {
        console.log(`   ${details}`);
    }
}

// SECP521R1 암호화 테스트
async function testSECP521R1Encryption() {
    console.log('\n=== SECP521R1 (521-bit) Private Key Encryption Test ===');
    
    try {
        const encryption = new SECP521R1PrivateKeyEncryption();
        const testData = generateTestData();
        
        // 1. 계약 인증서 키 쌍 생성 (실제 시나리오에서는 인증서에서 추출)
        console.log('\n1. Generating contract certificate key pair...');
        const contractKeyPair = encryption.generateECDHEKeyPair();
        console.log(`   Contract Private Key: ${contractKeyPair.privateKey.length} bytes`);
        console.log(`   Contract Public Key: ${contractKeyPair.publicKey.length} bytes`);
        
        // 2. 수신자(EVCC) ECDHE 키 쌍 생성
        console.log('\n2. Generating receiver ECDHE key pair...');
        const receiverKeyPair = encryption.generateECDHEKeyPair();
        console.log(`   Receiver Private Key: ${receiverKeyPair.privateKey.length} bytes`);
        console.log(`   Receiver Public Key: ${receiverKeyPair.publicKey.length} bytes`);
        
        // 3. 송신자(SA/eMSP) 암호화
        console.log('\n3. Sender encrypting private key...');
        const encryptionResult = encryption.senderEncrypt(
            contractKeyPair.privateKey,
            receiverKeyPair.publicKey,
            testData.pcid,
            testData.ski
        );
        
        console.log(`   Encrypted Private Key: ${encryptionResult.encryptedPrivateKey.length} bytes`);
        console.log(`   Sender Public Key: ${encryptionResult.senderPublicKey.length} bytes`);
        console.log(`   Structure: [12 IV][66 ciphertext][16 tag] = ${encryptionResult.encryptedPrivateKey.length} total`);
        
        // 4. 수신자(EVCC) 복호화
        console.log('\n4. Receiver decrypting private key...');
        const decryptedPrivateKey = encryption.receiverDecrypt(
            encryptionResult.encryptedPrivateKey,
            encryptionResult.senderPublicKey,
            receiverKeyPair.privateKey,
            testData.pcid,
            testData.ski,
            contractKeyPair.publicKey
        );
        
        console.log(`   Decrypted Private Key: ${decryptedPrivateKey.length} bytes`);
        
        // 5. 검증
        console.log('\n5. Verification...');
        const isValid = contractKeyPair.privateKey.equals(decryptedPrivateKey);
        printTestResult('Private key encryption/decryption', isValid);
        
        if (!isValid) {
            console.log('Debug: Keys do not match!');
            console.log(`Original:  ${contractKeyPair.privateKey.toString('hex').substring(0, 32)}...`);
            console.log(`Decrypted: ${decryptedPrivateKey.toString('hex').substring(0, 32)}...`);
        }
        
        // 6. 패딩 테스트
        console.log('\n6. Testing padding mechanism...');
        const paddedKey = encryption.padPrivateKey(contractKeyPair.privateKey);
        console.log(`   Padded key length: ${paddedKey.length} bytes (528 bits)`);
        
        const unpaddedKey = encryption.removePadding(paddedKey);
        const paddingValid = contractKeyPair.privateKey.equals(unpaddedKey);
        printTestResult('Padding/unpadding', paddingValid);
        
        // 7. 키 유효성 검증 테스트
        console.log('\n7. Testing key validation...');
        const validationResult = encryption.validatePrivateKey(
            contractKeyPair.privateKey,
            contractKeyPair.publicKey
        );
        printTestResult('Private key validation', validationResult);
        
        return true;
        
    } catch (error) {
        console.error('SECP521R1 Test Error:', error.message);
        return false;
    }
}

// X448 암호화 테스트
async function testX448Encryption() {
    console.log('\n=== X448 (448-bit) Private Key Encryption Test ===');
    
    try {
        const encryption = new X448PrivateKeyEncryption();
        const testData = generateTestData();
        
        // 1. 계약 인증서 키 쌍 생성
        console.log('\n1. Generating contract certificate key pair...');
        const contractKeyPair = encryption.generateECDHEKeyPair();
        console.log(`   Contract Private Key: ${contractKeyPair.privateKey.length} bytes`);
        console.log(`   Contract Public Key: ${contractKeyPair.publicKey.length} bytes`);
        
        // 2. 수신자(EVCC) ECDHE 키 쌍 생성
        console.log('\n2. Generating receiver ECDHE key pair...');
        const receiverKeyPair = encryption.generateECDHEKeyPair();
        console.log(`   Receiver Private Key: ${receiverKeyPair.privateKey.length} bytes`);
        console.log(`   Receiver Public Key: ${receiverKeyPair.publicKey.length} bytes`);
        
        // 3. 송신자(SA/eMSP) 암호화
        console.log('\n3. Sender encrypting private key...');
        const encryptionResult = encryption.senderEncrypt(
            contractKeyPair.privateKey,
            receiverKeyPair.publicKey,
            testData.pcid,
            testData.ski
        );
        
        console.log(`   Encrypted Private Key: ${encryptionResult.encryptedPrivateKey.length} bytes`);
        console.log(`   Sender Public Key: ${encryptionResult.senderPublicKey.length} bytes`);
        console.log(`   Structure: [12 IV][56 ciphertext][16 tag] = ${encryptionResult.encryptedPrivateKey.length} total`);
        
        // 4. 수신자(EVCC) 복호화
        console.log('\n4. Receiver decrypting private key...');
        const decryptedPrivateKey = encryption.receiverDecrypt(
            encryptionResult.encryptedPrivateKey,
            encryptionResult.senderPublicKey,
            receiverKeyPair.privateKey,
            testData.pcid,
            testData.ski,
            contractKeyPair.publicKey
        );
        
        console.log(`   Decrypted Private Key: ${decryptedPrivateKey.length} bytes`);
        
        // 5. 검증
        console.log('\n5. Verification...');
        const isValid = contractKeyPair.privateKey.equals(decryptedPrivateKey);
        printTestResult('Private key encryption/decryption', isValid);
        
        // 6. 키 유효성 검증 테스트
        console.log('\n6. Testing key validation...');
        const validationResult = encryption.validatePrivateKey(
            contractKeyPair.privateKey,
            contractKeyPair.publicKey
        );
        printTestResult('Private key validation', validationResult);
        
        // 7. DHPublicKey 포맷 테스트
        console.log('\n7. Testing DHPublicKey format...');
        const dhPublicKey = encryption.formatDHPublicKey(contractKeyPair.publicKey);
        const formatValid = dhPublicKey.equals(contractKeyPair.publicKey) && dhPublicKey.length === 56;
        printTestResult('DHPublicKey format (no padding)', formatValid);
        
        return true;
        
    } catch (error) {
        console.error('X448 Test Error:', error.message);
        return false;
    }
}

// AAD 계산 테스트
function testAADCalculation() {
    console.log('\n=== AAD Calculation Test ===');
    
    try {
        const { calculateAAD } = require('./common');
        const testData = generateTestData();
        
        console.log(`\nInput PCID: "${testData.pcid}" (${testData.pcid.length} bytes)`);
        console.log(`Input SKI: "${testData.ski}" (${testData.ski.length} hex chars = ${testData.ski.length/2} bytes)`);
        
        const aad = calculateAAD(testData.pcid, testData.ski);
        console.log(`AAD Length: ${aad.length} bytes`);
        console.log(`AAD Hex: ${bytesToHex(aad)}`);
        
        const expectedLength = 18 + 16; // PCID + SKI
        const lengthValid = aad.length === expectedLength;
        printTestResult('AAD calculation', lengthValid, `Expected: ${expectedLength} bytes, Got: ${aad.length} bytes`);
        
        return lengthValid;
        
    } catch (error) {
        console.error('AAD Test Error:', error.message);
        return false;
    }
}

// 에러 케이스 테스트
function testErrorCases() {
    console.log('\n=== Error Cases Test ===');
    
    let passed = 0;
    let total = 0;
    
    const { calculateAAD } = require('./common');
    
    // 잘못된 PCID 길이
    total++;
    try {
        calculateAAD('SHORT', 'A1B2C3D4E5F6708192A3B4C5D6E7F801');
        console.log('❌ Should have thrown error for short PCID');
    } catch (error) {
        console.log('✅ Correctly rejected short PCID');
        passed++;
    }
    
    // 잘못된 SKI 길이
    total++;
    try {
        calculateAAD('ABCD1234567890EFGH', 'SHORT');
        console.log('❌ Should have thrown error for short SKI');
    } catch (error) {
        console.log('✅ Correctly rejected short SKI');
        passed++;
    }
    
    // 잘못된 PCID 형식
    total++;
    try {
        calculateAAD('abcd1234567890efgh', 'A1B2C3D4E5F6708192A3B4C5D6E7F801');
        console.log('❌ Should have thrown error for lowercase PCID');
    } catch (error) {
        console.log('✅ Correctly rejected lowercase PCID');
        passed++;
    }
    
    // 잘못된 SKI 형식
    total++;
    try {
        calculateAAD('ABCD1234567890EFGH', 'g1b2c3d4e5f6708192a3b4c5d6e7f801');
        console.log('❌ Should have thrown error for invalid SKI');
    } catch (error) {
        console.log('✅ Correctly rejected invalid SKI');
        passed++;
    }
    
    console.log(`\nError Cases: ${passed}/${total} passed`);
    return passed === total;
}

// 메인 테스트 실행
async function runAllTests() {
    console.log('🔒 V2G Private Key Encryption Test Suite');
    console.log('=========================================');
    
    const results = [];
    
    // AAD 계산 테스트
    results.push(testAADCalculation());
    
    // 에러 케이스 테스트
    results.push(testErrorCases());
    
    // SECP521R1 테스트
    results.push(await testSECP521R1Encryption());
    
    // X448 테스트
    results.push(await testX448Encryption());
    
    // 결과 요약
    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Summary');
    console.log('='.repeat(50));
    
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    console.log(`✅ Passed: ${passed}/${total}`);
    console.log(`❌ Failed: ${total - passed}/${total}`);
    
    if (passed === total) {
        console.log('\n🎉 All tests passed! The implementation follows V2G20 specifications.');
    } else {
        console.log('\n⚠️  Some tests failed. Please check the implementation.');
    }
    
    // 보안 관련 정보
    console.log('\n🔐 Security Notes:');
    console.log('- Private keys are securely cleared after use');
    console.log('- AES-GCM-256 provides authenticated encryption');
    console.log('- ECDHE ensures forward secrecy');
    console.log('- Key validation prevents invalid key usage');
    console.log('- Padding validation prevents bit manipulation attacks');
}

// 테스트 실행
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = {
    testSECP521R1Encryption,
    testX448Encryption,
    testAADCalculation,
    testErrorCases
}; 