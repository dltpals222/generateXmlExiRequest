/**
 * V2G Private Key Encryption Implementation (V2G20-2497/2498/2499)
 * 
 * Implements the encryption of 521-bit contract certificate private keys
 * according to ISO 15118-20 standards V2G20-2497, V2G20-2498, and V2G20-2499.
 * 
 * Key Standards Compliance:
 * - V2G20-2497: AES-GCM-256 encryption with 521→528 bit padding
 * - V2G20-2498: Big-endian byte order for all data elements
 * - V2G20-2499: IV(12) + Ciphertext(66) + Tag(16) = 94 bytes structure
 * 
 * Features:
 * - ECDHE session key derivation simulation
 * - 521-bit private key extraction from .key files
 * - 7-bit leading zero padding (521→528 bits)
 * - 96-bit random IV generation
 * - V2G20-2492 AAD integration
 * - Big-endian data processing
 * - SECP521_EncryptedPrivateKey field generation
 * 
 * @author V2G Implementation Team
 * @version 1.0.0
 * @requires openssl - For private key extraction
 * @requires crypto - For AES-GCM-256 and random generation
 */

const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { calculateAAD } = require('./v2g-cert-ski-extractor');

/**
 * Generate ECDHE session key for AES-GCM-256 encryption
 * 
 * Simulates ECDHE key exchange to derive a 256-bit session key.
 * In real V2G implementation, this would be derived from actual
 * ECDHE key exchange between SA (eMSP) and EVCC.
 * 
 * @param {string} info - Key derivation context information
 * @returns {Buffer} 256-bit (32 bytes) session key
 */
function generateSessionKey(info = 'V2G-SessionKey') {
    // Simulate ECDHE shared secret (in real implementation, this comes from ECDHE)
    const sharedSecret = crypto.randomBytes(32);
    
    // HKDF key derivation (simplified for demonstration)
    const salt = Buffer.alloc(32); // Empty salt as per many V2G implementations
    const infoBuffer = Buffer.from(info, 'utf8');
    
    // HKDF Extract
    const prk = crypto.createHmac('sha256', salt).update(sharedSecret).digest();
    
    // HKDF Expand  
    const sessionKey = crypto.createHmac('sha256', prk)
        .update(Buffer.concat([infoBuffer, Buffer.from([0x01])]))
        .digest();
    
    console.log(`Generated session key: ${sessionKey.toString('hex').toUpperCase()}`);
    return sessionKey;
}

/**
 * Extract 521-bit private key from SECP521R1 key file
 * 
 * Uses OpenSSL to extract the raw private key value from a .key file.
 * The private key is returned as a big-endian buffer containing exactly
 * 521 bits of key material.
 * 
 * @param {string} keyFilePath - Path to SECP521R1 private key file (.key)
 * @returns {Buffer} 521-bit private key as big-endian buffer (66 bytes, last byte uses 1 bit)
 * @throws {Error} If key file cannot be read or is not SECP521R1
 */
function extractPrivateKey521(keyFilePath) {
    try {
        // Extract private key in raw format using OpenSSL
        const cmd = `openssl ec -in "${keyFilePath}" -text -noout`;
        const keyText = execSync(cmd, { encoding: 'utf8' });
        
        // Find the private key value in the output
        const lines = keyText.split('\n');
        let privKeyLines = [];
        let foundPriv = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.includes('priv:')) {
                foundPriv = true;
                continue;
            }
            
            if (foundPriv) {
                // Stop at pub: or ASN1 OID: or any other section
                if (line.includes('pub:') || line.includes('ASN1') || line.includes('NIST')) {
                    break;
                }
                
                // Extract hex values (remove colons and spaces)
                const hexMatch = line.match(/[0-9a-f:]+/i);
                if (hexMatch) {
                    privKeyLines.push(hexMatch[0].replace(/:/g, ''));
                }
            }
        }
        
        if (privKeyLines.length === 0) {
            throw new Error('Private key value not found in key file');
        }
        
        // Combine all hex lines and convert to buffer
        const privKeyHex = privKeyLines.join('').replace(/\s/g, '');
        const privKeyBuffer = Buffer.from(privKeyHex, 'hex');
        
        // Verify length (should be 66 bytes for 521 bits, with last byte using only 1 bit)
        if (privKeyBuffer.length !== 66) {
            throw new Error(`Expected 66 bytes for 521-bit key, got ${privKeyBuffer.length} bytes`);
        }
        
        console.log(`Extracted 521-bit private key: ${privKeyBuffer.toString('hex').toUpperCase()}`);
        console.log(`Private key length: ${privKeyBuffer.length} bytes (${privKeyBuffer.length * 8} bits total, 521 bits used)`);
        
        return privKeyBuffer;
        
    } catch (error) {
        throw new Error(`Failed to extract private key: ${error.message}`);
    }
}

/**
 * Pad 521-bit private key to 528 bits as required by V2G20-2497
 * 
 * V2G20-2497 requires padding the 521-bit private key to 528 bits
 * by adding 7 leading zero bits. This makes the key byte-aligned
 * for AES-GCM-256 encryption.
 * 
 * @param {Buffer} privateKey521 - 521-bit private key (66 bytes)
 * @returns {Buffer} 528-bit padded private key (66 bytes, properly aligned)
 */
function padPrivateKeyTo528Bits(privateKey521) {
    // 521 bits = 65.125 bytes, stored in 66 bytes
    // Need to add 7 leading zero bits to make it 528 bits = 66 bytes exactly
    
    const paddedKey = Buffer.alloc(66);
    
    // First byte: 7 leading zeros + 1 bit from original key
    const firstOriginalByte = privateKey521[0];
    paddedKey[0] = firstOriginalByte >> 7; // Take only the MSB and shift right
    
    // Shift all subsequent bits by 7 positions
    for (let i = 0; i < 65; i++) {
        const currentByte = privateKey521[i];
        const nextByte = i < 65 ? privateKey521[i + 1] : 0;
        
        // Take 7 LSBs from current byte and 1 MSB from next byte
        paddedKey[i + 1] = ((currentByte & 0x7F) << 1) | ((nextByte & 0x80) >> 7);
    }
    
    console.log(`Padded to 528 bits: ${paddedKey.toString('hex').toUpperCase()}`);
    return paddedKey;
}

/**
 * Generate 96-bit random Initialization Vector (IV)
 * 
 * Generates a cryptographically secure random 96-bit (12 bytes) IV
 * as required by V2G20-2497 for AES-GCM-256 encryption.
 * 
 * @returns {Buffer} 96-bit (12 bytes) random IV
 */
function generateRandomIV() {
    const iv = crypto.randomBytes(12);
    console.log(`Generated IV: ${iv.toString('hex').toUpperCase()}`);
    return iv;
}

/**
 * Encrypt 528-bit private key using AES-GCM-256
 * 
 * Implements V2G20-2497 encryption using AES-GCM-256 according to
 * NIST Special Publication 800-38D. All data is processed in
 * big-endian format as required by V2G20-2498.
 * 
 * @param {Buffer} privateKey528 - 528-bit padded private key (66 bytes)
 * @param {Buffer} sessionKey - 256-bit session key (32 bytes)
 * @param {Buffer} iv - 96-bit initialization vector (12 bytes)
 * @param {Buffer} aad - Additional authenticated data from V2G20-2492
 * @returns {Object} Encryption result containing:
 *   - ciphertext: 66-byte encrypted private key
 *   - authTag: 16-byte authentication tag
 */
function encryptPrivateKeyAESGCM(privateKey528, sessionKey, iv, aad) {
    try {
        // Create AES-GCM cipher
        const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
        
        // Set additional authenticated data
        cipher.setAAD(aad);
        
        // Encrypt the private key
        let ciphertext = cipher.update(privateKey528);
        cipher.final();
        
        // Get authentication tag
        const authTag = cipher.getAuthTag();
        
        console.log(`Ciphertext: ${ciphertext.toString('hex').toUpperCase()}`);
        console.log(`Auth tag: ${authTag.toString('hex').toUpperCase()}`);
        
        return { ciphertext, authTag };
        
    } catch (error) {
        throw new Error(`AES-GCM encryption failed: ${error.message}`);
    }
}

/**
 * Create SECP521_EncryptedPrivateKey field according to V2G20-2499
 * 
 * Assembles the final encrypted private key field with the structure:
 * IV (12 bytes) + Ciphertext (66 bytes) + Tag (16 bytes) = 94 bytes total
 * 
 * @param {Buffer} iv - 96-bit initialization vector
 * @param {Buffer} ciphertext - 66-byte encrypted private key
 * @param {Buffer} authTag - 16-byte authentication tag
 * @returns {Buffer} 94-byte SECP521_EncryptedPrivateKey field
 */
function createEncryptedPrivateKeyField(iv, ciphertext, authTag) {
    if (iv.length !== 12) throw new Error('IV must be 12 bytes');
    if (ciphertext.length !== 66) throw new Error('Ciphertext must be 66 bytes');
    if (authTag.length !== 16) throw new Error('Auth tag must be 16 bytes');
    
    // Concatenate: IV + Ciphertext + Tag
    const encryptedField = Buffer.concat([iv, ciphertext, authTag]);
    
    console.log(`SECP521_EncryptedPrivateKey field: ${encryptedField.toString('hex').toUpperCase()}`);
    console.log(`Total length: ${encryptedField.length} bytes`);
    
    return encryptedField;
}

/**
 * Complete V2G private key encryption workflow
 * 
 * Implements the full V2G20-2497/2498/2499 private key encryption process:
 * 1. Extract 521-bit private key from file
 * 2. Generate session key via simulated ECDHE
 * 3. Calculate AAD using V2G20-2492
 * 4. Pad key to 528 bits
 * 5. Generate random IV
 * 6. Encrypt using AES-GCM-256
 * 7. Assemble final SECP521_EncryptedPrivateKey field
 * 
 * @param {string} keyFilePath - Path to SECP521R1 private key file
 * @param {string} certFilePath - Path to corresponding certificate (for SKI extraction)
 * @param {string} pcid - PCID value for AAD calculation
 * @param {string} outputDir - Directory to save encrypted key file
 * @returns {Object} Complete encryption result with all components
 */
function encryptPrivateKeyComplete(keyFilePath, certFilePath, pcid, outputDir) {
    console.log('\n=== V2G Private Key Encryption (V2G20-2497/2498/2499) ===');
    console.log(`Key file: ${path.basename(keyFilePath)}`);
    console.log(`Certificate: ${path.basename(certFilePath)}`);
    console.log(`PCID: ${pcid}`);
    
    try {
        // Step 1: Extract 521-bit private key
        console.log('\n--- Step 1: Extract 521-bit private key ---');
        const privateKey521 = extractPrivateKey521(keyFilePath);
        
        // Step 2: Generate session key
        console.log('\n--- Step 2: Generate ECDHE session key ---');
        const sessionKey = generateSessionKey();
        
        // Step 3: Calculate AAD using existing function
        console.log('\n--- Step 3: Calculate AAD (V2G20-2492) ---');
        const { extractSKIFromCertificate } = require('./v2g-cert-ski-extractor');
        const ski = extractSKIFromCertificate(certFilePath);
        const aad = calculateAAD(pcid, ski);
        
        // Step 4: Pad to 528 bits
        console.log('\n--- Step 4: Pad to 528 bits ---');
        const privateKey528 = padPrivateKeyTo528Bits(privateKey521);
        
        // Step 5: Generate IV
        console.log('\n--- Step 5: Generate random IV ---');
        const iv = generateRandomIV();
        
        // Step 6: Encrypt with AES-GCM-256
        console.log('\n--- Step 6: AES-GCM-256 encryption ---');
        const { ciphertext, authTag } = encryptPrivateKeyAESGCM(privateKey528, sessionKey, iv, aad);
        
        // Step 7: Create final encrypted field
        console.log('\n--- Step 7: Create SECP521_EncryptedPrivateKey field ---');
        const encryptedPrivateKeyField = createEncryptedPrivateKeyField(iv, ciphertext, authTag);
        
        // Save to file with algorithm information in filename
        const baseName = path.basename(keyFilePath, '.key');
        const outputFileName = `SECP521R1_AES-GCM-256_V2G20-2497_encrypted_${baseName}.bin`;
        const outputPath = path.join(outputDir, outputFileName);
        fs.writeFileSync(outputPath, encryptedPrivateKeyField);
        
        const result = {
            keyFilePath,
            certFilePath,
            pcid,
            privateKey521: privateKey521.toString('hex').toUpperCase(),
            sessionKey: sessionKey.toString('hex').toUpperCase(),
            ski: ski,
            aad: aad.toString('hex').toUpperCase(),
            privateKey528: privateKey528.toString('hex').toUpperCase(),
            iv: iv.toString('hex').toUpperCase(),
            ciphertext: ciphertext.toString('hex').toUpperCase(),
            authTag: authTag.toString('hex').toUpperCase(),
            encryptedPrivateKeyField: encryptedPrivateKeyField.toString('hex').toUpperCase(),
            outputPath,
            success: true
        };
        
        console.log(`\n✅ Encryption successful!`);
        console.log(`Encrypted private key saved: ${outputPath}`);
        console.log(`Final field length: ${encryptedPrivateKeyField.length} bytes`);
        
        return result;
        
    } catch (error) {
        console.error(`\n❌ Encryption failed: ${error.message}`);
        return {
            keyFilePath,
            certFilePath,
            pcid,
            error: error.message,
            success: false
        };
    }
}

/**
 * Process multiple private keys for encryption
 * 
 * Batch processes multiple SECP521R1 private keys, encrypting each
 * according to V2G20-2497/2498/2499 standards.
 * 
 * @param {Array<Object>} keyList - Array of objects containing:
 *   - keyPath: Path to private key file
 *   - certPath: Path to corresponding certificate
 *   - pcid: PCID value for this key
 * @param {string} outputDir - Directory for encrypted key files
 * @returns {Array<Object>} Array of encryption results
 */
function encryptPrivateKeysBatch(keyList, outputDir) {
    console.log('=== V2G Private Key Encryption Batch Processing ===');
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const results = [];
    
    keyList.forEach((keyInfo, index) => {
        console.log(`\n--- Processing Key ${index + 1}/${keyList.length} ---`);
        const result = encryptPrivateKeyComplete(
            keyInfo.keyPath,
            keyInfo.certPath,
            keyInfo.pcid,
            outputDir
        );
        results.push(result);
    });
    
    return results;
}

/**
 * Main demonstration function
 */
function main() {
    const generatedDir = path.join(__dirname, 'generated-certificates');
    const outputDir = path.join(__dirname, 'encrypted-private-keys');
    const reportPath = path.join(__dirname, 'encryption-results.json');
    
    try {
        // Find generated key files (SECP521R1 only for this demo)
        const keyFiles = fs.readdirSync(generatedDir)
            .filter(file => file.endsWith('.key'))
            .slice(0, 2); // Take first 2 for demo
        
        if (keyFiles.length === 0) {
            console.log('No key files found. Please run openssl-ski-method2.js first.');
            return;
        }
        
        // Create test data
        const keyList = keyFiles.map((keyFile, index) => {
            const baseName = keyFile.replace('.key', '');
            return {
                keyPath: path.join(generatedDir, keyFile),
                certPath: path.join(generatedDir, `${baseName}.pem`),
                pcid: index === 0 ? 'KRLWPC7CAX69WE0001' : 'KRLWSCF1G544XK2002'
            };
        });
        
        // Process encryption
        const results = encryptPrivateKeysBatch(keyList, outputDir);
        
        // Generate report
        const report = {
            generated: new Date().toISOString(),
            standards: ['V2G20-2497', 'V2G20-2498', 'V2G20-2499'],
            encryption: 'AES-GCM-256',
            totalKeys: results.length,
            successfulEncryptions: results.filter(r => r.success).length,
            results: results
        };
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        // Summary
        console.log('\n=== Encryption Summary ===');
        console.log(`Total keys processed: ${results.length}`);
        console.log(`Successful encryptions: ${results.filter(r => r.success).length}`);
        console.log(`Report saved: ${reportPath}`);
        
        return results;
        
    } catch (error) {
        console.error('Error in main:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    generateSessionKey,
    extractPrivateKey521,
    padPrivateKeyTo528Bits,
    generateRandomIV,
    encryptPrivateKeyAESGCM,
    createEncryptedPrivateKeyField,
    encryptPrivateKeyComplete,
    encryptPrivateKeysBatch,
    main
}; 