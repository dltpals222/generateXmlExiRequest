const certGenerator = require('./openssl-ski-method2');
const path = require('path');

// 예제 1: 단일 인증서 생성
console.log('=== Example 1: Generate Single Certificate ===');

try {
    const outputDir = path.join(__dirname, 'example-output');
    const caBasePath = path.join(__dirname, '..', 'CA');
    
    // SECP521R1 인증서 생성 예제
    const result = certGenerator.generateCertificateWithSKI(
        path.join(caBasePath, 'eMSP_SubCA_2_Secp521r1.key'),
        path.join(caBasePath, 'eMSP_SubCA_2_Secp521r1.pem'),
        'EXAMPLE_TEST_CN',
        'secp521r1',
        outputDir
    );
    
    console.log('Generated certificate info:');
    console.log(`- CN: ${result.cn}`);
    console.log(`- Key Type: ${result.keyType}`);
    console.log(`- SKI (Method 2): ${result.ski}`);
    console.log(`- Serial: ${result.serialNumber}`);
    console.log(`- Certificate: ${path.basename(result.certPath)}`);
    console.log(`- Private Key: ${path.basename(result.keyPath)}`);
    
} catch (error) {
    console.error('Error in example 1:', error.message);
}

// 예제 2: SKI Method 2 계산 확인
console.log('\n=== Example 2: SKI Method 2 Verification ===');

// 임의의 공개키로 SKI Method 2 계산 예제
const samplePublicKey = `-----BEGIN PUBLIC KEY-----
MIGbMBAGByqGSM49AgEGBSuBBAAjA4GGAAQBxLkjJL8LlhGGTvKdVROL69wm91dq
6AO5Rj+Nh8H3sXhw1K0C4K1HSs3HHvjx4k1m2mj3E/xmQb6JGX9p2S/LxCwBR2K4
-----END PUBLIC KEY-----`;

try {
    const ski = certGenerator.calculateSKIMethod2(samplePublicKey);
    console.log(`Sample Public Key SKI: ${ski}`);
    
    // RFC 5280 Method 2 형식 검증
    const firstByte = parseInt(ski.substring(0, 2), 16);
    const typeBits = (firstByte >> 4) & 0x0F;
    
    console.log(`First byte: 0x${firstByte.toString(16).toUpperCase()}`);
    console.log(`Type field (4 bits): ${typeBits.toString(2).padStart(4, '0')} (binary) = ${typeBits} (decimal)`);
    console.log(`Expected type field: 0100 (binary) = 4 (decimal)`);
    console.log(`Valid RFC 5280 Method 2: ${typeBits === 4 ? 'YES' : 'NO'}`);
    
} catch (error) {
    console.error('Error in example 2:', error.message);
}

// 예제 3: 전체 배치 생성
console.log('\n=== Example 3: Batch Generation ===');
console.log('Running main() function for full batch generation...');

try {
    const certificates = certGenerator.main();
    console.log(`\nBatch generation completed: ${certificates.length} certificates generated`);
} catch (error) {
    console.error('Error in example 3:', error.message);
} 