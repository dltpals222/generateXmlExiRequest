/**
 * V2G 448-bit Private Key Encryption System
 * 
 * Implements V2G20-2500 standard for encrypting 448-bit contract certificate private keys
 * using AES-GCM-256 encryption with the same session key as 521-bit encryption.
 * 
 * Key Features:
 * - Same ECDHE session key as 521-bit encryption (V2G20-2500)
 * - 448-bit private key (no padding required - byte aligned)
 * - AES-GCM-256 encryption with V2G20-2492 AAD
 * - Big-endian byte order compliance (V2G20-2501)
 * - X448_EncryptedPrivateKey output format per V2G20-2502
 * 
 * Process Flow:
 * 1. Extract 448-bit private key from certificate key file (no padding)
 * 2. Reuse ECDHE session key from 521-bit encryption
 * 3. Calculate AAD using PCID + SKI (V2G20-2492)
 * 4. Encrypt using AES-GCM-256
 * 5. Format output: IV(12B) + Ciphertext(56B) + Tag(16B) = 84B
 * 6. Encode as Base64Binary
 * 
 * @version 1.0.0
 * @requires openssl - For private key extraction
 * @requires crypto - Node.js crypto module for AES-GCM-256
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

// Import reusable functions from 521-bit encryption system
const { 
    performECDHE, 
    deriveSessionKey,
    encryptPrivateKey,
    formatEncryptedResult
} = require('./v2g-521bit-private-key-encryption.js');

const { extractSKIFromCertificate, calculateAAD } = require('./v2g-cert-ski-extractor.js');

/**
 * Extract 448-bit private key from X448 private key file
 * 
 * Uses OpenSSL to extract the raw private key scalar value from
 * an X448 private key file. Unlike 521-bit keys, 448-bit keys are
 * byte-aligned and require no padding per V2G20-2500.
 * 
 * @param {string} keyPath - Path to the X448 private key file (.key format)
 * @returns {Buffer} 448-bit private key as 56 bytes (no padding needed)
 * @throws {Error} If key extraction fails or key is not X448
 */
async function extract448BitPrivateKey(keyPath) {
    try {
        // Extract private key scalar using OpenSSL
        const cmd = `openssl pkey -in "${keyPath}" -text -noout`;
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
        
        // Convert to buffer - 448 bits = 56 bytes exactly (no padding)
        let keyBuffer = Buffer.from(privateKeyHex, 'hex');
        
        // V2G20-2500: 448-bit X448 key should be exactly 56 bytes (no padding required)
        // If we get 57 bytes, take the last 56 bytes (remove leading byte if present)
        if (keyBuffer.length === 57) {
            keyBuffer = keyBuffer.slice(1); // Remove first byte
        } else if (keyBuffer.length === 56) {
            // Perfect, no adjustment needed
        } else if (keyBuffer.length < 56) {
            // Pad to 56 bytes if needed
            const paddedBuffer = Buffer.alloc(56);
            keyBuffer.copy(paddedBuffer, 56 - keyBuffer.length);
            keyBuffer = paddedBuffer;
        } else if (keyBuffer.length > 57) {
            // Take the last 56 bytes if longer
            keyBuffer = keyBuffer.slice(-56);
        }
        
        if (keyBuffer.length !== 56) {
            throw new Error(`X448 private key adjustment failed: got ${keyBuffer.length} bytes, expected 56 bytes`);
        }
        
        console.log(`✅ Extracted private key: ${keyBuffer.length} bytes (${keyBuffer.length * 8} bits)`);
        console.log(`   Private key: [PROTECTED - V2G20-2608 compliance]`);
        console.log(`   Padding: Not required (byte-aligned)`);
        
        return keyBuffer;
        
    } catch (error) {
        throw new Error(`Failed to extract 448-bit private key: ${error.message}`);
    }
}

/**
 * Encrypt 448-bit private key using AES-GCM-256
 * 
 * Implements V2G20-2500 encryption requirements:
 * - 448-bit key (56 bytes, no padding needed)
 * - AES-GCM-256 encryption
 * - Random 96-bit IV
 * - AAD calculated per V2G20-2492
 * - Big-endian byte order (V2G20-2501)
 * 
 * @param {Buffer} privateKey - 448-bit private key (56 bytes)
 * @param {Buffer} sessionKey - 256-bit session key
 * @param {Buffer} aad - Additional authenticated data
 * @returns {Object} {iv: Buffer, ciphertext: Buffer, authTag: Buffer}
 */
function encrypt448BitPrivateKey_Internal(privateKey, sessionKey, aad) {
    if (privateKey.length !== 56) {
        throw new Error('Private key must be exactly 56 bytes (448 bits)');
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
    
    console.log(`\n=== AES-GCM-256 Encryption (448-bit) ===`);
    console.log(`✅ IV generated: ${iv.length} bytes (${iv.length * 8} bits)`);
    console.log(`✅ Ciphertext created: ${ciphertext.length} bytes (${ciphertext.length * 8} bits)`);
    console.log(`✅ Auth Tag generated: ${authTag.length} bytes (${authTag.length * 8} bits)`);
    console.log(`   Encryption data: [PROTECTED - V2G20-2608 compliance]`);
    
    return { iv, ciphertext, authTag };
}

/**
 * Format encrypted result according to V2G20-2502
 * 
 * Creates the X448_EncryptedPrivateKey structure:
 * IV(12B) + Ciphertext(56B) + Tag(16B) = 84 bytes total
 * 
 * @param {Object} encrypted - {iv, ciphertext, authTag}
 * @returns {Buffer} Formatted encrypted private key (84 bytes)
 */
function format448BitResult(encrypted) {
    const { iv, ciphertext, authTag } = encrypted;
    
    // Validate component sizes
    if (iv.length !== 12) {
        throw new Error(`IV must be 12 bytes, got ${iv.length} bytes`);
    }
    if (ciphertext.length !== 56) {
        throw new Error(`Ciphertext must be 56 bytes, got ${ciphertext.length} bytes`);
    }
    if (authTag.length !== 16) {
        throw new Error(`Auth tag must be 16 bytes, got ${authTag.length} bytes`);
    }
    
    // V2G20-2502 structure: IV + Ciphertext + Tag
    const result = Buffer.concat([iv, ciphertext, authTag]);
    
    if (result.length !== 84) {
        throw new Error(`Invalid encrypted result length: ${result.length} bytes (expected 84)`);
    }
    
    console.log(`\n=== V2G20-2502 Format ===`);
    console.log(`✅ Total length: ${result.length} bytes`);
    console.log(`✅ Structure: IV(12) + Ciphertext(56) + Tag(16)`);
    console.log(`   Formatted result: [PROTECTED - V2G20-2608 compliance]`);
    
    return result;
}

/**
 * Main function: Encrypt 448-bit contract certificate private key
 * 
 * Orchestrates the complete V2G 448-bit private key encryption process
 * according to V2G20-2500 standard using the same session key as 521-bit.
 * 
 * @param {string} certKeyPath - Path to 448-bit contract certificate private key
 * @param {string} certPath - Path to contract certificate (for SKI extraction)
 * @param {string} pcid - PCID for AAD calculation
 * @param {Buffer} sessionKey - Optional: reuse session key from 521-bit encryption
 * @returns {Object} Complete encryption result with metadata
 */
async function encrypt448BitPrivateKey(certKeyPath, certPath, pcid, sessionKey = null) {
    console.log('=== V2G 448-bit Private Key Encryption ===');
    console.log(`Contract key: ${path.basename(certKeyPath)}`);
    console.log(`Contract cert: ${path.basename(certPath)}`);
    console.log(`PCID: ${pcid}`);
    console.log(`Session key: ${sessionKey ? 'Reused from 521-bit' : 'Generate new'}`);
    
    let emspEphemeralKeyPath, emspEphemeralPubPath, tempEvccPublicKeyPath;
    
    try {
        // 1. Extract 448-bit private key (no padding)
        const privateKey = await extract448BitPrivateKey(certKeyPath);
        
        // 2. Get session key (reuse existing or generate new)
        let finalSessionKey;
        let ecdheInfo = null;
        
        if (sessionKey && sessionKey.length === 32) {
            // Reuse session key from 521-bit encryption (V2G20-2500)
            finalSessionKey = sessionKey;
            console.log(`✅ Reusing session key: 32 bytes (256 bits)`);
            console.log(`   Source: 521-bit encryption (V2G20-2500 compliant)`);
        } else {
            // Generate new session key using ECDHE
            const evccPublicKeyPem = await fs.readFile('./encryption_cert_key/ecdhe_evcc_public_x448.pem', 'utf8');
            
            try {
                // Use performECDHE with X448
                const ecdhe = await performECDHE('x448', evccPublicKeyPem);
                finalSessionKey = deriveSessionKey(ecdhe.sharedSecret, 'x448');
                ecdheInfo = {
                    sharedSecret: ecdhe.sharedSecret.toString('hex').toUpperCase(),
                    sessionKey: finalSessionKey.toString('hex').toUpperCase(),
                    emspEphemeralPublicKey: ecdhe.emspEphemeralPublicKey.toString('hex').toUpperCase()
                };
            } catch (error) {
                throw new Error(`ECDHE key exchange failed: ${error.message}`);
            }
        }
        
        // 3. Calculate AAD (same as 521-bit: V2G20-2492)
        const ski = extractSKIFromCertificate(certPath);
        const aad = calculateAAD(pcid, ski);
        
        // 4. Encrypt 448-bit private key using unified AES-GCM-256 process
        const encrypted = encryptPrivateKey(privateKey, finalSessionKey, aad, 'x448');
        
        // 5. Format result according to V2G20-2502
        const formattedResult = formatEncryptedResult(encrypted, 'x448');
        
        // 6. Save results
        const outputPath = './encryption_cert_key/encrypted_448bit_result.json';
        const result = {
            timestamp: new Date().toISOString(),
            standard: 'V2G20-2500',
            keyType: '448-bit X448',
            inputs: {
                contractKeyPath: certKeyPath,
                contractCertPath: certPath,
                pcid: pcid,
                sessionKeySource: sessionKey ? '521-bit reuse' : 'new ECDHE',
                evccPublicKeyPem: sessionKey ? null : await fs.readFile('./encryption_cert_key/ecdhe_evcc_public_x448.pem', 'utf8')
            },
            ecdhe: ecdheInfo, // null if reusing session key
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
                encrypted448BitPrivateKey: formattedResult.toString('hex').toUpperCase(),
                base64Binary: formattedResult.toString('base64'),
                totalLength: formattedResult.length,
                structure: 'IV(12) + Ciphertext(56) + Tag(16) = 84 bytes'
            },
            success: true
        };
        
        await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
        
        console.log(`\n✅ 448-bit encryption completed successfully!`);
        console.log(`✅ Results saved to: ${outputPath}`);
        console.log(`✅ Base64 output: [PROTECTED - V2G20-2608 compliance]`);
        
        return result;
        
    } catch (error) {
        console.error(`❌ 448-bit encryption failed: ${error.message}`);
        return {
            error: error.message,
            success: false,
            timestamp: new Date().toISOString(),
            keyType: '448-bit X448'
        };
    } finally {
        // Clean up temporary files
        try {
            if (emspEphemeralKeyPath) await fs.access(emspEphemeralKeyPath).then(() => fs.unlink(emspEphemeralKeyPath));
            if (emspEphemeralPubPath) await fs.access(emspEphemeralPubPath).then(() => fs.unlink(emspEphemeralPubPath));
            if (tempEvccPublicKeyPath) await fs.access(tempEvccPublicKeyPath).then(() => fs.unlink(tempEvccPublicKeyPath));
        } catch (cleanupError) {
            console.error('Error cleaning up temporary files:', cleanupError);
        }
    }
}

/**
 * Encrypt both 521-bit and 448-bit private keys with shared session key
 * 
 * Demonstrates V2G20-2500 requirement: "using the same session key used 
 * to encrypt the 521 bit private key"
 * 
 * @param {Object} config - Configuration object with file paths and PCID
 * @returns {Object} Combined encryption results
 */
async function encryptBothPrivateKeys(config) {
    console.log('=== V2G Dual Private Key Encryption (521-bit + 448-bit) ===');
    
    try {
        // Import 521-bit encryption function
        const { encryptContractPrivateKey } = require('./v2g-521bit-private-key-encryption.js');
        
        // 1. Encrypt 521-bit private key (generates session key)
        console.log('\n--- Phase 1: 521-bit Private Key Encryption ---');
        const result521 = await encryptContractPrivateKey(
            config.cert521KeyPath,
            config.cert521Path,
            config.pcid
        );
        
        if (!result521.success) {
            throw new Error('521-bit encryption failed');
        }
        
        // Extract session key from 521-bit result
        const sessionKey = Buffer.from(result521.ecdhe.sessionKey, 'hex');
        
        // 2. Encrypt 448-bit private key (reuse session key)
        console.log('\n--- Phase 2: 448-bit Private Key Encryption ---');
        const result448 = await encrypt448BitPrivateKey(
            config.cert448KeyPath,
            config.cert448Path,
            config.pcid,
            sessionKey  // V2G20-2500: same session key
        );
        
        if (!result448.success) {
            throw new Error('448-bit encryption failed');
        }
        
        // 3. Save combined results
        const combinedResult = {
            timestamp: new Date().toISOString(),
            standard: 'V2G20-2500 + V2G20-2497',
            sharedSessionKey: result521.ecdhe.sessionKey,
            results: {
                key521bit: result521,
                key448bit: result448
            },
            success: true
        };
        
        const combinedPath = './encryption_cert_key/dual_encryption_result.json';
        await fs.writeFile(combinedPath, JSON.stringify(combinedResult, null, 2));
        
        console.log(`\n🎉 Dual encryption completed successfully!`);
        console.log(`✅ Combined results saved to: ${combinedPath}`);
        
        return combinedResult;
        
    } catch (error) {
        console.error(`❌ Dual encryption failed: ${error.message}`);
        return {
            error: error.message,
            success: false,
            timestamp: new Date().toISOString()
        };
    }
}

// Main execution for testing
if (require.main === module) {
    const certKeyPath = './encryption_cert_key/cert_x448.key';  // X448 key for 448-bit demo
    const certPath = './encryption_cert_key/cert_x448.pem';  // Using X448 cert for SKI extraction
    const pcid = 'V2GTEST123456789AB'; // 18-character test PCID
    
    encrypt448BitPrivateKey(certKeyPath, certPath, pcid)
        .then(result => {
            if (result.success) {
                console.log('\n🎉 V2G 448-bit Private Key Encryption Demo Complete!');
            } else {
                console.log('\n❌ 448-bit Encryption Demo Failed');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Unexpected error:', error.message);
            process.exit(1);
        });
}

module.exports = {
    extract448BitPrivateKey,
    encrypt448BitPrivateKey,
    encryptBothPrivateKeys
}; 