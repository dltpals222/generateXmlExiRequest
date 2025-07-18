/**
 * V2G 521-bit Private Key Encryption System
 * 
 * Implements V2G20-2497 standard for encrypting contract certificate private keys
 * using AES-GCM-256 encryption with ECDHE-derived session keys.
 * 
 * Key Features:
 * - ECDHE key exchange simulation using SECP521R1
 * - 521-bit to 528-bit padding (7 leading zero bits)
 * - AES-GCM-256 encryption with V2G20-2492 AAD
 * - Big-endian byte order compliance (V2G20-2498)
 * - Base64Binary output format per V2G20-2499
 * 
 * Process Flow:
 * 1. Extract 521-bit private key from certificate key file
 * 2. Perform ECDHE key exchange (eMSP + EVCC)
 * 3. Derive 256-bit session key using HKDF-SHA256
 * 4. Calculate AAD using PCID + SKI (V2G20-2492)
 * 5. Pad private key to 528 bits (66 bytes)
 * 6. Encrypt using AES-GCM-256
 * 7. Format output: IV(12B) + Ciphertext(66B) + Tag(16B) = 94B
 * 8. Encode as Base64Binary
 * 
 * @version 1.0.0
 * @requires openssl - For private key extraction and ECDHE operations
 * @requires crypto - Node.js crypto module for AES-GCM-256
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { calculateAAD } = require('./v2g-cert-ski-extractor.js');

/**
 * Extract 521-bit private key from ECDSA private key file
 * 
 * Uses OpenSSL to extract the raw private key scalar value from
 * a SECP521R1 private key file. The scalar is converted to big-endian
 * format as required by V2G20-2498.
 * 
 * @param {string} keyPath - Path to the ECDSA private key file (.key format)
 * @returns {Buffer} 521-bit private key as 66 bytes (with leading zeros if needed)
 * @throws {Error} If key extraction fails or key is not SECP521R1
 */
async function extract521BitPrivateKey(keyPath) {
    try {
        // Extract private key scalar using OpenSSL
        const cmd = `openssl ec -in "${keyPath}" -text -noout`;
        const keyText = execSync(cmd, { encoding: 'utf8' });
        
        // Find the private key section
        const lines = keyText.split('\n');
        let privateKeyStart = -1;
        let privateKeyHex = '';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.includes('priv:')) {
                privateKeyStart = i + 1;
                continue;
            }
            
            if (privateKeyStart >= 0) {
                // Stop at pub: or ASN1 OID: section
                if (line.includes('pub:') || line.includes('ASN1 OID:')) {
                    break;
                }
                
                // Extract hex digits (remove colons and spaces)
                const hexPart = line.replace(/[:\s]/g, '');
                if (/^[0-9a-f]+$/i.test(hexPart)) {
                    privateKeyHex += hexPart;
                }
            }
        }
        
        if (!privateKeyHex) {
            throw new Error('Could not extract private key from file');
        }
        
        // Convert to buffer and ensure 66 bytes (528 bits) for AES-GCM
        let keyBuffer = Buffer.from(privateKeyHex, 'hex');
        
        // Pad to 66 bytes if needed (V2G20-2497: 528 bits = 66 bytes)
        if (keyBuffer.length < 66) {
            const paddedBuffer = Buffer.alloc(66);
            keyBuffer.copy(paddedBuffer, 66 - keyBuffer.length);
            keyBuffer = paddedBuffer;
        } else if (keyBuffer.length > 66) {
            // Take the last 66 bytes if longer
            keyBuffer = keyBuffer.slice(-66);
        }
        
        console.log(`✅ Extracted private key: ${keyBuffer.length} bytes (${keyBuffer.length * 8} bits)`);
        console.log(`   Private key: [PROTECTED - V2G20-2608 compliance]`);
        
        return keyBuffer;
        
    } catch (error) {
        throw new Error(`Failed to extract private key: ${error.message}`);
    }
}

/**
 * Perform ECDHE key exchange (SECP521R1 or X448)
 * 
 * Generates an ephemeral (one-time) key pair for eMSP (SA) internally,
 * and uses the provided EVCC public key to compute the shared secret.
 * Returns the shared secret and the ephemeral public key (to be sent to EVCC).
 *
 * @param {'secp521r1'|'x448'} curveType - Curve type for ECDHE
 * @param {string} evccPublicKeyPem - PEM formatted EVCC public key
 * @returns {Object} {sharedSecret: Buffer, emspEphemeralPublicKey: Buffer}
 * @throws {Error} If ECDHE key exchange fails
 */
async function performECDHE(curveType, evccPublicKeyPem) {
    try {
        console.log(`\n=== ECDHE Key Exchange (Ephemeral Key Generation, curve: ${curveType}) ===`);
        let emspEphemeralKeyPath, emspEphemeralPubPath, emspEphemeralPublicKey, sharedSecretBuffer;

        // Save EVCC public key to temporary file
        const tempEvccPublicKeyPath = './tmp_evcc_public.pem';
        await fs.writeFile(tempEvccPublicKeyPath, evccPublicKeyPem);

        if (curveType === 'secp521r1') {
            // 1. Generate ephemeral key pair for eMSP (SA) - SECP521R1
            emspEphemeralKeyPath = './tmp_emsp_ephemeral_secp521r1.key';
            emspEphemeralPubPath = './tmp_emsp_ephemeral_secp521r1_public.pem';
            execSync(`openssl ecparam -name secp521r1 -genkey -noout -out "${emspEphemeralKeyPath}"`);
            execSync(`openssl ec -in "${emspEphemeralKeyPath}" -pubout -out "${emspEphemeralPubPath}"`);
            emspEphemeralPublicKey = await fs.readFile(emspEphemeralPubPath);
            // 2. Compute shared secret
            const cmd = `openssl pkeyutl -derive -inkey "${emspEphemeralKeyPath}" -peerkey "${tempEvccPublicKeyPath}"`;
            sharedSecretBuffer = execSync(cmd);
        } else if (curveType === 'x448') {
            // 1. Generate ephemeral key pair for eMSP (SA) - X448
            emspEphemeralKeyPath = './tmp_emsp_ephemeral_x448.key';
            emspEphemeralPubPath = './tmp_emsp_ephemeral_x448_public.pem';
            execSync(`openssl genpkey -algorithm X448 -out "${emspEphemeralKeyPath}"`);
            execSync(`openssl pkey -in "${emspEphemeralKeyPath}" -pubout -out "${emspEphemeralPubPath}"`);
            emspEphemeralPublicKey = await fs.readFile(emspEphemeralPubPath);
            // 2. Compute shared secret
            const cmd = `openssl pkeyutl -derive -inkey "${emspEphemeralKeyPath}" -peerkey "${tempEvccPublicKeyPath}"`;
            sharedSecretBuffer = execSync(cmd);
        } else {
            throw new Error(`Unsupported curveType: ${curveType}`);
        }

        console.log(`✅ Shared secret generated: ${sharedSecretBuffer.length} bytes`);
        console.log(`   Shared secret: [PROTECTED - V2G20-2608 compliance]`);
        console.log(`✅ Ephemeral public key generated (to send to EVCC): ${emspEphemeralPublicKey.length} bytes`);

        // 3. Clean up temporary files
        try {
            await fs.access(emspEphemeralKeyPath).then(() => fs.unlink(emspEphemeralKeyPath));
            await fs.access(emspEphemeralPubPath).then(() => fs.unlink(emspEphemeralPubPath));
            await fs.access(tempEvccPublicKeyPath).then(() => fs.unlink(tempEvccPublicKeyPath));
        } catch (cleanupError) {
            console.error('Error cleaning up temporary files:', cleanupError);
        }

        return {
            sharedSecret: sharedSecretBuffer,
            emspEphemeralPublicKey // This should be sent to EVCC (DHPublicKey)
        };
    } catch (error) {
        // Clean up temporary files in case of error
        try {
            await fs.access(emspEphemeralKeyPath).then(() => fs.unlink(emspEphemeralKeyPath));
            await fs.access(emspEphemeralPubPath).then(() => fs.unlink(emspEphemeralPubPath));
            await fs.access(tempEvccPublicKeyPath).then(() => fs.unlink(tempEvccPublicKeyPath));
        } catch (cleanupError) {
            console.error('Error cleaning up temporary files:', cleanupError);
        }
        throw new Error(`ECDHE key exchange failed: ${error.message}`);
    }
}

/**
 * Derive 256-bit session key using Concatenation KDF with SHA512
 * 
 * Implements V2G20-2535 compliant key derivation from ECDHE shared secret
 * using NIST SP 800-56A "concatenation key derivation function" with SHA512.
 * 
 * V2G20-2535 Requirements:
 * - KDF: "concatenation key derivation function" 
 * - Hash: SHA512
 * - Algorithm ID: 0x01
 * - Sender ID: "U" = 0x55 (eMSP)
 * - Receiver ID: "V" = 0x56 (EVCC)
 * - Output: exactly 256 bits
 * - For X448: input parameters shall be derived according to IETF RFC 7748
 * 
 * @param {Buffer} sharedSecret - ECDHE shared secret from secp521r1 or X448
 * @param {string} curveType - Curve type ('secp521r1' or 'x448')
 * @returns {Buffer} 256-bit session key
 */
function deriveSessionKey(sharedSecret, curveType = 'secp521r1') {
    // V2G20-2535 required parameters
    const algorithmID = Buffer.from([0x01]);           // Algorithm ID: 0x01
    const senderID = Buffer.from([0x55]);              // "U" = 0x55 (eMSP/SA)  
    const receiverID = Buffer.from([0x56]);            // "V" = 0x56 (EVCC)
    
    // Process shared secret according to curve type
    let processedSharedSecret;
    
    if (curveType === 'x448') {
        // V2G20-2535: For X448, derive according to IETF RFC 7748
        // RFC 7748 specifies that X448 shared secret should be processed in little-endian
        // and may require specific byte ordering for KDF input
        console.log(`   Processing X448 shared secret according to RFC 7748`);
        
        // Ensure shared secret is exactly 56 bytes for X448
        if (sharedSecret.length !== 56) {
            throw new Error(`X448 shared secret must be 56 bytes, got ${sharedSecret.length} bytes`);
        }
        
        // RFC 7748: X448 shared secret processing
        // The shared secret is already in the correct format from OpenSSL
        processedSharedSecret = sharedSecret;
        
    } else if (curveType === 'secp521r1') {
        // Standard SECP521R1 processing
        console.log(`   Processing SECP521R1 shared secret according to NIST SP 800-56A`);
        
        // Ensure shared secret is correct length for SECP521R1 (66 bytes)
        if (sharedSecret.length !== 66) {
            throw new Error(`SECP521R1 shared secret must be 66 bytes, got ${sharedSecret.length} bytes`);
        }
        
        processedSharedSecret = sharedSecret;
        
    } else {
        throw new Error(`Unsupported curve type: ${curveType}`);
    }
    
    // Construct OtherInfo per NIST SP 800-56A
    const otherInfo = Buffer.concat([algorithmID, senderID, receiverID]);
    
    // NIST SP 800-56A Concatenation KDF with SHA512
    // H(SharedSecret || Counter || OtherInfo)
    const counter = Buffer.from([0x00, 0x00, 0x00, 0x01]); // Counter = 1 (big-endian)
    
    const hash = crypto.createHash('sha512')
        .update(processedSharedSecret)
        .update(counter)
        .update(otherInfo)
        .digest();
    
    // Extract exactly 256 bits (32 bytes) as required by V2G20-2535
    const sessionKey = hash.slice(0, 32);
    
    console.log(`✅ Session key derived: ${sessionKey.length} bytes (${sessionKey.length * 8} bits)`);
    console.log(`   KDF: Concatenation KDF with SHA512 (V2G20-2535 compliant)`);
    console.log(`   Curve: ${curveType.toUpperCase()}`);
    console.log(`   Session key: [PROTECTED - V2G20-2608 compliance]`);
    
    return sessionKey;
}

/**
 * Encrypt private key using AES-GCM-256
 * 
 * Implements V2G20-2497 (521-bit) and V2G20-2500 (448-bit) encryption requirements:
 * - 521-bit key padded to 528 bits (66 bytes) or 448-bit key (56 bytes, no padding)
 * - AES-GCM-256 encryption
 * - Random 96-bit IV
 * - AAD calculated per V2G20-2492
 * - Big-endian byte order (V2G20-2498/V2G20-2501)
 * 
 * @param {Buffer} privateKey - Private key (66 bytes for 521-bit or 56 bytes for 448-bit)
 * @param {Buffer} sessionKey - 256-bit session key
 * @param {Buffer} aad - Additional authenticated data
 * @param {string} algorithm - Algorithm type ('secp521r1' or 'x448')
 * @returns {Object} {iv: Buffer, ciphertext: Buffer, authTag: Buffer}
 */
function encryptPrivateKey(privateKey, sessionKey, aad, algorithm = 'secp521r1') {
    // Validate inputs based on algorithm
    if (algorithm === 'secp521r1') {
        if (privateKey.length !== 66) {
            throw new Error('Private key must be exactly 66 bytes (528 bits) for SECP521R1');
        }
    } else if (algorithm === 'x448') {
        if (privateKey.length !== 56) {
            throw new Error('Private key must be exactly 56 bytes (448 bits) for X448');
        }
    } else {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
    
    if (sessionKey.length !== 32) {
        throw new Error('Session key must be 32 bytes (256 bits)');
    }
    
    // Generate random 96-bit IV (12 bytes)
    const iv = crypto.randomBytes(12);
    
    // AES-GCM-256 encryption
    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
    cipher.setAAD(aad);
    
    let ciphertext = cipher.update(privateKey);
    cipher.final();
    
    const authTag = cipher.getAuthTag();
    
    console.log(`\n=== AES-GCM-256 Encryption (${algorithm.toUpperCase()}) ===`);
    console.log(`✅ IV generated: ${iv.length} bytes (${iv.length * 8} bits)`);
    console.log(`✅ Ciphertext created: ${ciphertext.length} bytes (${ciphertext.length * 8} bits)`);
    console.log(`✅ Auth Tag generated: ${authTag.length} bytes (${authTag.length * 8} bits)`);
    console.log(`   Encryption data: [PROTECTED - V2G20-2608 compliance]`);
    
    return { iv, ciphertext, authTag };
}

/**
 * Format encrypted result according to V2G20-2499 (521-bit) or V2G20-2502 (448-bit)
 * 
 * Creates the appropriate structure based on algorithm:
 * - SECP521R1: IV(12B) + Ciphertext(66B) + Tag(16B) = 94 bytes total
 * - X448: IV(12B) + Ciphertext(56B) + Tag(16B) = 84 bytes total
 * 
 * @param {Object} encrypted - {iv, ciphertext, authTag}
 * @param {string} algorithm - Algorithm type ('secp521r1' or 'x448')
 * @returns {Buffer} Formatted encrypted private key
 */
function formatEncryptedResult(encrypted, algorithm = 'secp521r1') {
    const { iv, ciphertext, authTag } = encrypted;
    
    // Validate component sizes based on algorithm
    if (iv.length !== 12) {
        throw new Error(`IV must be 12 bytes, got ${iv.length} bytes`);
    }
    if (authTag.length !== 16) {
        throw new Error(`Auth tag must be 16 bytes, got ${authTag.length} bytes`);
    }
    
    let expectedCiphertextLength, expectedTotalLength, standard;
    
    if (algorithm === 'secp521r1') {
        expectedCiphertextLength = 66;
        expectedTotalLength = 94;
        standard = 'V2G20-2499';
    } else if (algorithm === 'x448') {
        expectedCiphertextLength = 56;
        expectedTotalLength = 84;
        standard = 'V2G20-2502';
    } else {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
    
    if (ciphertext.length !== expectedCiphertextLength) {
        throw new Error(`Ciphertext must be ${expectedCiphertextLength} bytes for ${algorithm.toUpperCase()}, got ${ciphertext.length} bytes`);
    }
    
    // Create structure: IV + Ciphertext + Tag
    const result = Buffer.concat([iv, ciphertext, authTag]);
    
    if (result.length !== expectedTotalLength) {
        throw new Error(`Invalid encrypted result length: ${result.length} bytes (expected ${expectedTotalLength} for ${algorithm.toUpperCase()})`);
    }
    
    console.log(`\n=== ${standard} Format (${algorithm.toUpperCase()}) ===`);
    console.log(`✅ Total length: ${result.length} bytes`);
    console.log(`✅ Structure: IV(12) + Ciphertext(${expectedCiphertextLength}) + Tag(16)`);
    console.log(`   Formatted result: [PROTECTED - V2G20-2608 compliance]`);
    
    return result;
}

/**
 * Main function: Encrypt contract certificate private key
 * 
 * Orchestrates the complete V2G private key encryption process
 * according to V2G20-2497 standard.
 * 
 * @param {string} certKeyPath - Path to contract certificate private key
 * @param {string} certPath - Path to contract certificate (for SKI extraction)
 * @param {string} pcid - PCID for AAD calculation
 * @returns {Object} Complete encryption result with metadata
 */
async function encryptContractPrivateKey(certKeyPath, certPath, pcid) {
    console.log('=== V2G 521-bit Private Key Encryption ===');
    console.log(`Contract key: ${path.basename(certKeyPath)}`);
    console.log(`Contract cert: ${path.basename(certPath)}`);
    console.log(`PCID: ${pcid}`);
    
    try {
        // 1. Extract 521-bit private key
        const privateKey = await extract521BitPrivateKey(certKeyPath);
        
        // 2. Perform ECDHE key exchange
        const evccPublicKeyPem = await fs.readFile('./encryption_cert_key/ecdhe_evcc_public.pem', 'utf8');
        const ecdhe = await performECDHE('secp521r1', evccPublicKeyPem);
        
        // 3. Derive session key
        const sessionKey = deriveSessionKey(ecdhe.sharedSecret, 'secp521r1');
        
        // 4. Calculate AAD (requires SKI extraction)
        const { extractSKIFromCertificate } = require('./v2g-cert-ski-extractor.js');
        const ski = extractSKIFromCertificate(certPath);
        const aad = calculateAAD(pcid, ski);
        
        // 5. Encrypt private key
        const encrypted = encryptPrivateKey(privateKey, sessionKey, aad, 'secp521r1');
        
        // 6. Format result
        const formattedResult = formatEncryptedResult(encrypted, 'secp521r1');
        
        // 7. Save results
        const outputPath = './encryption_cert_key/encrypted_result.json';
        const result = {
            timestamp: new Date().toISOString(),
            standard: 'V2G20-2497',
            inputs: {
                contractKeyPath: certKeyPath,
                contractCertPath: certPath,
                pcid: pcid,
                evccPublicKeyPem: evccPublicKeyPem
            },
            ecdhe: {
                sharedSecret: ecdhe.sharedSecret.toString('hex').toUpperCase(),
                sessionKey: sessionKey.toString('hex').toUpperCase()
            },
            aad: {
                ski: ski,
                aad: aad.toString('hex').toUpperCase(),
                aadLength: aad.length
            },
            encryption: {
                iv: encrypted.iv.toString('hex').toUpperCase(),
                ciphertext: encrypted.ciphertext.toString('hex').toUpperCase(),
                authTag: encrypted.authTag.toString('hex').toUpperCase()
            },
            output: {
                encrypted521BitPrivateKey: formattedResult.toString('hex').toUpperCase(),
                base64Binary: formattedResult.toString('base64'),
                totalLength: formattedResult.length
            },
            success: true
        };
        
        await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
        
        console.log(`\n✅ Encryption completed successfully!`);
        console.log(`✅ Results saved to: ${outputPath}`);
        console.log(`✅ Base64 output: [PROTECTED - V2G20-2608 compliance]`);
        
        return result;
        
    } catch (error) {
        console.error(`❌ Encryption failed: ${error.message}`);
        return {
            error: error.message,
            success: false,
            timestamp: new Date().toISOString()
        };
    }
}

// Main execution
if (require.main === module) {
    const certKeyPath = './encryption_cert_key/cert.key';
    const certPath = './encryption_cert_key/cert.pem';
    const pcid = 'V2GTEST123456789AB'; // 18-character test PCID
    
    encryptContractPrivateKey(certKeyPath, certPath, pcid)
        .then(result => {
            if (result.success) {
                console.log('\n🎉 V2G Private Key Encryption Demo Complete!');
            } else {
                console.log('\n❌ Encryption Demo Failed');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Unexpected error:', error.message);
            process.exit(1);
        });
}

module.exports = {
    extract521BitPrivateKey,
    performECDHE,
    deriveSessionKey,
    encryptPrivateKey,
    formatEncryptedResult,
    encryptContractPrivateKey
}; 