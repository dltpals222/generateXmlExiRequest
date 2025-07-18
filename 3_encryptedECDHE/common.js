const crypto = require('crypto');
const { sha256 } = require('@noble/hashes/sha256');

/**
 * Calculate Additional Authenticated Data (AAD) according to [V2G20-2492]
 * @param {string} pcid - PCID (18 bytes, capital letters and digits without separators)
 * @param {string} ski - SKI value (16 bytes, hexadecimal string with capital letters and digits)
 * @returns {Buffer} AAD buffer (34 bytes total)
 */
function calculateAAD(pcid, ski) {
    if (pcid.length !== 18) {
        throw new Error('PCID must be exactly 18 bytes');
    }
    if (ski.length !== 32) { // 16 bytes = 32 hex characters
        throw new Error('SKI must be exactly 16 bytes (32 hex characters)');
    }
    
    // Validate PCID format (capital letters and digits only)
    if (!/^[A-Z0-9]{18}$/.test(pcid)) {
        throw new Error('PCID must contain only capital letters and digits');
    }
    
    // Validate SKI format (hexadecimal with capital letters and digits)
    if (!/^[A-F0-9]{32}$/.test(ski)) {
        throw new Error('SKI must be hexadecimal with capital letters and digits');
    }
    
    const pcidBuffer = Buffer.from(pcid, 'ascii');
    const skiBuffer = Buffer.from(ski, 'hex');
    
    return Buffer.concat([pcidBuffer, skiBuffer]);
}

/**
 * Generate random IV for AES-GCM encryption
 * @returns {Buffer} 96-bit (12 bytes) random IV
 */
function generateRandomIV() {     
    return crypto.randomBytes(12);
}

/**
 * AES-GCM-256 encryption according to NIST Special Publication 800-38D
 * @param {Buffer} plaintext - Data to encrypt
 * @param {Buffer} sessionKey - 256-bit session key
 * @param {Buffer} iv - 96-bit initialization vector
 * @param {Buffer} aad - Additional authenticated data
 * @returns {Object} {ciphertext: Buffer, authTag: Buffer}
 */
function aesGcmEncrypt(plaintext, sessionKey, iv, aad) {
    if (sessionKey.length !== 32) {
        throw new Error('Session key must be 256 bits (32 bytes)');
    }
    if (iv.length !== 12) {
        throw new Error('IV must be 96 bits (12 bytes)');
    }
    
    try {
        const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
        cipher.setAAD(aad);
        
        let ciphertext = cipher.update(plaintext);
        cipher.final();
        
        const authTag = cipher.getAuthTag();
        if (authTag.length !== 16) {
            throw new Error('Authentication tag must be 128 bits (16 bytes)');
        }
        
        return { ciphertext, authTag };
    } catch (error) {
        if (error.message.includes('createCipherGCM is not a function')) {
            // Fallback for older Node.js versions - use simple XOR stream cipher
            console.warn('⚠️  GCM not available, using XOR + HMAC fallback');
            
            // Generate keystream using AES-ECB (simpler than CTR)
            const keystream = Buffer.alloc(plaintext.length);
            const blockSize = 16;
            
            for (let i = 0; i < plaintext.length; i += blockSize) {
                // Create block input: IV + block counter
                const blockInput = Buffer.alloc(16);
                iv.copy(blockInput, 0, 0, Math.min(12, blockInput.length));
                blockInput.writeUInt32BE(Math.floor(i / blockSize), 12);
                
                // Encrypt block to get keystream
                const cipher = crypto.createCipheriv('aes-256-ecb', sessionKey, null);
                cipher.setAutoPadding(false);
                const keystreamBlock = cipher.update(blockInput);
                cipher.final();
                
                // Copy to keystream buffer
                const copyLen = Math.min(blockSize, plaintext.length - i);
                keystreamBlock.copy(keystream, i, 0, copyLen);
            }
            
            // XOR plaintext with keystream
            const ciphertext = Buffer.alloc(plaintext.length);
            for (let i = 0; i < plaintext.length; i++) {
                ciphertext[i] = plaintext[i] ^ keystream[i];
            }
            
            console.log(`Debug: Keystream first 16 bytes: ${keystream.slice(0, 16).toString('hex')}`);
            console.log(`Debug: Plaintext first 16 bytes: ${plaintext.slice(0, 16).toString('hex')}`);
            console.log(`Debug: Ciphertext first 16 bytes: ${ciphertext.slice(0, 16).toString('hex')}`);
            
            // Generate authentication tag using HMAC
            const hmac = crypto.createHmac('sha256', sessionKey);
            hmac.update(iv);
            hmac.update(aad);
            hmac.update(ciphertext);
            const authTag = hmac.digest().slice(0, 16); // Take first 16 bytes
            
            return { ciphertext, authTag };
        }
        throw error;
    }
}

/**
 * AES-GCM-256 decryption according to NIST Special Publication 800-38D
 * @param {Buffer} ciphertext - Encrypted data
 * @param {Buffer} authTag - Authentication tag
 * @param {Buffer} sessionKey - 256-bit session key
 * @param {Buffer} iv - 96-bit initialization vector
 * @param {Buffer} aad - Additional authenticated data
 * @returns {Buffer} Decrypted plaintext
 */
function aesGcmDecrypt(ciphertext, authTag, sessionKey, iv, aad) {
    if (sessionKey.length !== 32) {
        throw new Error('Session key must be 256 bits (32 bytes)');
    }
    if (iv.length !== 12) {
        throw new Error('IV must be 96 bits (12 bytes)');
    }
    if (authTag.length !== 16) {
        throw new Error('Authentication tag must be 128 bits (16 bytes)');
    }
    
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, iv);
        decipher.setAuthTag(authTag);
        decipher.setAAD(aad);
        
        let plaintext = decipher.update(ciphertext);
        
        try {
            decipher.final();
        } catch (error) {
            throw new Error('Decryption failed: Authentication tag verification failed');
        }
        
        return plaintext;
    } catch (error) {
        if (error.message.includes('createDecipherGCM is not a function')) {
            // Fallback for older Node.js versions
            console.warn('⚠️  GCM not available, using XOR + HMAC fallback');
            
            // Verify authentication tag first
            const hmac = crypto.createHmac('sha256', sessionKey);
            hmac.update(iv);
            hmac.update(aad);
            hmac.update(ciphertext);
            const expectedTag = hmac.digest().slice(0, 16);
            
            if (!crypto.timingSafeEqual(authTag, expectedTag)) {
                throw new Error('Decryption failed: Authentication tag verification failed');
            }
            
            // Decrypt using same XOR stream method
            // Generate same keystream
            const keystream = Buffer.alloc(ciphertext.length);
            const blockSize = 16;
            
            for (let i = 0; i < ciphertext.length; i += blockSize) {
                // Create same block input: IV + block counter
                const blockInput = Buffer.alloc(16);
                iv.copy(blockInput, 0, 0, Math.min(12, blockInput.length));
                blockInput.writeUInt32BE(Math.floor(i / blockSize), 12);
                
                // Encrypt block to get keystream
                const cipher = crypto.createCipheriv('aes-256-ecb', sessionKey, null);
                cipher.setAutoPadding(false);
                const keystreamBlock = cipher.update(blockInput);
                cipher.final();
                
                // Copy to keystream buffer
                const copyLen = Math.min(blockSize, ciphertext.length - i);
                keystreamBlock.copy(keystream, i, 0, copyLen);
            }
            
            // XOR ciphertext with keystream to get plaintext
            const plaintext = Buffer.alloc(ciphertext.length);
            for (let i = 0; i < ciphertext.length; i++) {
                plaintext[i] = ciphertext[i] ^ keystream[i];
            }
            
            console.log(`Debug: Decrypt keystream first 16 bytes: ${keystream.slice(0, 16).toString('hex')}`);
            console.log(`Debug: Decrypt ciphertext first 16 bytes: ${ciphertext.slice(0, 16).toString('hex')}`);
            console.log(`Debug: Decrypt plaintext first 16 bytes: ${plaintext.slice(0, 16).toString('hex')}`);
            
            return plaintext;
        }
        throw error;
    }
}

/**
 * Derive session key using HKDF-SHA256
 * @param {Buffer} sharedSecret - ECDHE shared secret
 * @param {string} info - Key derivation info string
 * @returns {Buffer} 256-bit session key
 */
function deriveSessionKey(sharedSecret, info = 'V2G-SessionKey') {
    const salt = Buffer.alloc(32); // Empty salt
    const infoBuffer = Buffer.from(info, 'utf8');
    
    // HKDF Extract
    const prk = crypto.createHmac('sha256', salt).update(sharedSecret).digest();
    
    // HKDF Expand
    const okm = crypto.createHmac('sha256', prk).update(Buffer.concat([infoBuffer, Buffer.from([0x01])])).digest();
    
    return okm; // 32 bytes = 256 bits
}

/**
 * Secure memory cleanup (best effort)
 * @param {Buffer} buffer - Buffer to clear
 */
function secureCleanup(buffer) {
    if (Buffer.isBuffer(buffer)) {
        buffer.fill(0);
    }
}

/**
 * Convert big-endian bytes to big integer (for key validation)
 * @param {Buffer} bytes - Byte array in big-endian format  
 * @returns {bigint} Big integer representation
 */
function bytesToBigInt(bytes) {
    let result = 0n;
    for (let i = 0; i < bytes.length; i++) {
        result = (result << 8n) + BigInt(bytes[i]);
    }
    return result;
}

/**
 * Convert big integer to big-endian bytes
 * @param {bigint} num - Big integer
 * @param {number} byteLength - Target byte length
 * @returns {Buffer} Big-endian byte array
 */
function bigIntToBytes(num, byteLength) {
    const bytes = new Uint8Array(byteLength);
    for (let i = byteLength - 1; i >= 0; i--) {
        bytes[i] = Number(num & 0xFFn);
        num >>= 8n;
    }
    return Buffer.from(bytes);
}

module.exports = {
    calculateAAD,
    generateRandomIV,
    aesGcmEncrypt,
    aesGcmDecrypt,
    deriveSessionKey,
    secureCleanup,
    bytesToBigInt,
    bigIntToBytes
}; 