// 🔒 V2G Private Key Encryption 실제 사용 예제

const SECP521R1PrivateKeyEncryption = require('./secp521r1-encryption');
const X448PrivateKeyEncryption = require('./x448-encryption');

console.log('🚗 V2G Private Key Encryption 사용 예제');
console.log('=====================================\n');

// ============================================
// 1️⃣ 원하는 값으로 테스트 데이터 변경하기
// ============================================

function getCustomTestData() {
    return {
        // 여기에 실제 값을 입력하세요!
        pcid: 'MYCAR2024TESTDATA1', // 18자 정확히 (영문 대문자, 숫자만)
        ski: 'ABCDEF1234567890FEDCBA0987654321'  // 32 hex 문자 (16바이트)
        
        // 실제 V2G 시스템에서는:
        // pcid: CertificateInstallationReq 메시지에서 받은 값
        // ski: 계약 인증서의 Subject Key Identifier
    };
}

// ============================================
// 2️⃣ SECP521R1 (521-bit) 사용 예제
// ============================================

async function exampleSECP521R1() {
    console.log('🔐 SECP521R1 (521-bit) 암호화 예제');
    console.log('----------------------------------');
    
    const encryption = new SECP521R1PrivateKeyEncryption();
    const testData = getCustomTestData();
    
    // 1. 키 쌍 생성 (실제로는 계약 인증서에서 가져옴)
    console.log('1. 계약 인증서 키 쌍 생성...');
    const contractKeyPair = encryption.generateECDHEKeyPair();
    
    console.log('2. 수신자(EVCC) ECDHE 키 쌍 생성...');
    const receiverKeyPair = encryption.generateECDHEKeyPair();
    
    // 2. 송신자(SA/eMSP) 암호화
    console.log('3. 개인키 암호화 중...');
    const encryptionResult = encryption.senderEncrypt(
        contractKeyPair.privateKey,  // 🔑 계약 인증서 개인키
        receiverKeyPair.publicKey,   // 🔑 수신자 공개키
        testData.pcid,               // 📝 PCID (18자)
        testData.ski                 // 📝 SKI (32 hex)
    );
    
    console.log('📦 암호화 결과:');
    console.log(`   암호화된 개인키: ${encryptionResult.encryptedPrivateKey.length}바이트`);
    console.log(`   송신자 공개키: ${encryptionResult.senderPublicKey.length}바이트`);
    console.log(`   HEX: ${encryptionResult.encryptedPrivateKey.toString('hex').substring(0, 64)}...`);
    
    // 3. 수신자(EVCC) 복호화
    console.log('\n4. 개인키 복호화 중...');
    const decryptedKey = encryption.receiverDecrypt(
        encryptionResult.encryptedPrivateKey,  // 📦 암호화된 개인키
        encryptionResult.senderPublicKey,      // 🔑 송신자 공개키
        receiverKeyPair.privateKey,            // 🔑 수신자 개인키
        testData.pcid,                         // 📝 PCID
        testData.ski,                          // 📝 SKI
        contractKeyPair.publicKey              // 🔑 계약 인증서 공개키 (검증용)
    );
    
    console.log('✅ 복호화 성공!');
    console.log(`   복호화된 개인키: ${decryptedKey.length}바이트`);
    console.log(`   원본과 일치: ${contractKeyPair.privateKey.equals(decryptedKey)}`);
    
    return {
        originalKey: contractKeyPair.privateKey,
        encryptedKey: encryptionResult.encryptedPrivateKey,
        decryptedKey: decryptedKey,
        senderPublicKey: encryptionResult.senderPublicKey
    };
}

// ============================================
// 3️⃣ X448 (448-bit) 사용 예제  
// ============================================

async function exampleX448() {
    console.log('\n🔐 X448 (448-bit) 암호화 예제');
    console.log('-----------------------------');
    
    const encryption = new X448PrivateKeyEncryption();
    const testData = getCustomTestData();
    
    // 키 쌍 생성
    const contractKeyPair = encryption.generateECDHEKeyPair();
    const receiverKeyPair = encryption.generateECDHEKeyPair();
    
    // 암호화
    const encryptionResult = encryption.senderEncrypt(
        contractKeyPair.privateKey,
        receiverKeyPair.publicKey,
        testData.pcid,
        testData.ski
    );
    
    console.log('📦 X448 암호화 결과:');
    console.log(`   암호화된 개인키: ${encryptionResult.encryptedPrivateKey.length}바이트`);
    console.log(`   HEX: ${encryptionResult.encryptedPrivateKey.toString('hex').substring(0, 64)}...`);
    
    // 복호화
    const decryptedKey = encryption.receiverDecrypt(
        encryptionResult.encryptedPrivateKey,
        encryptionResult.senderPublicKey,
        receiverKeyPair.privateKey,
        testData.pcid,
        testData.ski,
        contractKeyPair.publicKey
    );
    
    console.log('✅ X448 복호화 성공!');
    console.log(`   원본과 일치: ${contractKeyPair.privateKey.equals(decryptedKey)}`);
}

// ============================================
// 4️⃣ 실제 hex 키 사용 예제
// ============================================

function exampleWithRealHexKeys() {
    console.log('\n🔧 실제 HEX 키 사용 예제');
    console.log('------------------------');
    
    // 실제 운영에서는 이런 식으로 hex 문자열을 Buffer로 변환
    const realPrivateKeyHex = '01' + '0'.repeat(130); // 66바이트 예시
    const realPublicKeyHex = '04' + '0'.repeat(264);  // 133바이트 예시
    
    console.log('💡 실제 키 사용 방법:');
    console.log('```javascript');
    console.log('// hex 문자열을 Buffer로 변환');
    console.log(`const privateKey = Buffer.from('${realPrivateKeyHex.substring(0, 32)}...', 'hex');`);
    console.log(`const publicKey = Buffer.from('${realPublicKeyHex.substring(0, 32)}...', 'hex');`);
    console.log('');
    console.log('// 암호화');
    console.log('const result = encryption.senderEncrypt(privateKey, receiverPublicKey, pcid, ski);');
    console.log('```');
}

// ============================================
// 5️⃣ 메인 실행
// ============================================

async function main() {
    try {
        // SECP521R1 예제 실행
        const secp521Result = await exampleSECP521R1();
        
        // X448 예제 실행
        await exampleX448();
        
        // 실제 키 사용법 예제
        exampleWithRealHexKeys();
        
        console.log('\n🎉 모든 예제 실행 완료!');
        console.log('\n📋 요약:');
        console.log(`   SECP521R1 암호화 크기: ${secp521Result.encryptedKey.length}바이트 (94바이트 예상)`);
        console.log(`   원본 키 크기: ${secp521Result.originalKey.length}바이트`);
        console.log(`   복호화 성공: ${secp521Result.originalKey.equals(secp521Result.decryptedKey)}`);
        
        console.log('\n🔧 값 변경 방법:');
        console.log('1. getCustomTestData() 함수에서 PCID/SKI 변경');
        console.log('2. 실제 키는 Buffer.from(hexString, "hex")로 변환');
        console.log('3. test.js의 generateTestData() 함수도 동일하게 변경');
        
    } catch (error) {
        console.error('❌ 예제 실행 중 오류:', error.message);
    }
}

// 예제 실행
main(); 