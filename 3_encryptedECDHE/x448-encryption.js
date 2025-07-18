const crypto = require('crypto');
const { x448 } = require('@noble/curves/ed448');
const { 
    calculateAAD, 
    generateRandomIV, 
    aesGcmEncrypt, 
    aesGcmDecrypt, 
    deriveSessionKey, 
    secureCleanup,
    bytesToBigInt,
    bigIntToBytes
} = require('./common');

/**
 * X448 Private Key Encryption for EVCC without TPM 2.0
 * Implements V2G20-2500, V2G20-2501, V2G20-2502
 */
class X448PrivateKeyEncryption {
    constructor() {
        this.curve = x448;
        this.PRIVATE_KEY_BITS = 448;
        this.PRIVATE_KEY_BYTES = 56; // 448 bits = 56 bytes (byte-aligned)
        this.PUBLIC_KEY_BYTES = 56;  // X448 public key is also 56 bytes
    }

    /**
     * Generate ECDHE key pair for sender (SA/eMSP)
     * @returns {Object} {privateKey: Buffer, publicKey: Buffer}
     */
    generateECDHEKeyPair() {
        const privateKey = this.curve.utils.randomPrivateKey();
        const publicKey = this.curve.getPublicKey(privateKey);
        
        return {
            privateKey: Buffer.from(privateKey),
            publicKey: Buffer.from(publicKey)
        };
    }

    /**
     * Compute ECDHE shared secret for X448
     * @param {Buffer} privateKey - ECDHE private key (56 bytes)
     * @param {Buffer} publicKey - Peer's ECDHE public key (56 bytes)
     * @returns {Buffer} Shared secret (56 bytes)
     */
    computeSharedSecret(privateKey, publicKey) {
        if (privateKey.length !== 56) {
            throw new Error('X448 private key must be 56 bytes');
        }
        if (publicKey.length !== 56) {
            throw new Error('X448 public key must be 56 bytes');
        }
        
        const sharedSecret = this.curve.getSharedSecret(privateKey, publicKey);
        return Buffer.from(sharedSecret);
    }

    /**
     * Validate 448-bit private key according to [V2G20-2510]
     * @param {Buffer} privateKey - 448-bit private key
     * @param {Buffer} publicKey - Corresponding public key from certificate
     * @returns {boolean} True if valid
     */
    validatePrivateKey(privateKey, publicKey) {
        try {
            console.log(`Debug X448: Private key length: ${privateKey.length}`);
            console.log(`Debug X448: Public key length: ${publicKey.length}`);
            
            if (privateKey.length !== 56) {
                console.log(`Debug X448: Invalid private key length: ${privateKey.length}`);
                return false;
            }
            if (publicKey.length !== 56) {
                console.log(`Debug X448: Invalid public key length: ${publicKey.length}`);
                return false;
            }
            
            // Check if private key is not zero
            const privateKeyBigInt = bytesToBigInt(privateKey);
            if (privateKeyBigInt === 0n) {
                console.log('Debug X448: Private key is zero');
                return false;
            }
            
            // For X448, validation is simpler - just check if derived public key matches
            try {
                const derivedPublicKey = this.curve.getPublicKey(privateKey);
                const matches = Buffer.from(derivedPublicKey).equals(publicKey);
                console.log(`Debug X448: Public key matches: ${matches}`);
                return matches;
            } catch (keyError) {
                console.log(`Debug X448: Key derivation error: ${keyError.message}`);
                return false;
            }
            
        } catch (error) {
            console.log(`Debug X448: Validation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Encrypt 448-bit contract certificate private key according to [V2G20-2500]
     * @param {Buffer} privateKey - 448-bit private key (56 bytes)
     * @param {Buffer} sessionKey - 256-bit session key from ECDHE
     * @param {string} pcid - PCID for AAD calculation
     * @param {string} ski - SKI for AAD calculation
     * @returns {Buffer} X448_EncryptedPrivateKey (84 bytes: 12 IV + 56 ciphertext + 16 tag)
     */
    encryptPrivateKey(privateKey, sessionKey, pcid, ski) {
        // Validate input sizes
        if (privateKey.length !== 56) {
            throw new Error('Private key must be 56 bytes (448 bits)');
        }
        
        // Note: No padding required for 448-bit key as it's byte-aligned [V2G20-2500]
        
        // Generate random IV
        const iv = generateRandomIV();
        
        // Calculate AAD according to [V2G20-2492]
        const aad = calculateAAD(pcid, ski);
        
        // Encrypt using AES-GCM-256
        const { ciphertext, authTag } = aesGcmEncrypt(privateKey, sessionKey, iv, aad);
        
        // Construct X448_EncryptedPrivateKey according to [V2G20-2502]
        // Structure: [12 bytes IV][56 bytes ciphertext][16 bytes auth tag] = 84 bytes total
        const encryptedPrivateKey = Buffer.concat([iv, ciphertext, authTag]);
        
        return encryptedPrivateKey;
    }

    /**
     * Decrypt 448-bit contract certificate private key according to [V2G20-2508]
     * @param {Buffer} encryptedPrivateKey - X448_EncryptedPrivateKey (84 bytes)
     * @param {Buffer} sessionKey - 256-bit session key from ECDHE
     * @param {string} pcid - PCID for AAD calculation
     * @param {string} ski - SKI for AAD calculation
     * @returns {Buffer} Decrypted 448-bit private key
     */
    decryptPrivateKey(encryptedPrivateKey, sessionKey, pcid, ski) {
        // Validate input size
        if (encryptedPrivateKey.length !== 84) {
            throw new Error('Encrypted private key must be 84 bytes (12 IV + 56 ciphertext + 16 tag)');
        }
        
        // Extract components according to [V2G20-2508]
        const iv = encryptedPrivateKey.slice(0, 12);           // 12 most significant bytes
        const ciphertext = encryptedPrivateKey.slice(12, 68);  // 56 bytes after IV
        const authTag = encryptedPrivateKey.slice(68, 84);     // 16 least significant bytes
        
        // Calculate AAD
        const aad = calculateAAD(pcid, ski);
        
        // Decrypt using AES-GCM-256
        const privateKey = aesGcmDecrypt(ciphertext, authTag, sessionKey, iv, aad);
        
        // Use the 448-bit decrypted data as the private key [V2G20-2509]
        // No padding removal needed since 448 bits is byte-aligned
        
        return privateKey;
    }

    /**
     * Complete encryption flow for sender (SA/eMSP)
     * @param {Buffer} contractPrivateKey - 448-bit contract certificate private key
     * @param {Buffer} receiverPublicKey - Receiver's ECDHE public key
     * @param {string} pcid - PCID from CertificateInstallationReq
     * @param {string} ski - SKI from contract certificate
     * @returns {Object} {encryptedPrivateKey: Buffer, senderPublicKey: Buffer}
     */
    senderEncrypt(contractPrivateKey, receiverPublicKey, pcid, ski) {
        // Generate ECDHE key pair for sender
        const senderKeyPair = this.generateECDHEKeyPair();
        
        // Compute shared secret
        const sharedSecret = this.computeSharedSecret(senderKeyPair.privateKey, receiverPublicKey);
        
        // Derive session key
        const sessionKey = deriveSessionKey(sharedSecret);
        
        // Encrypt private key
        const encryptedPrivateKey = this.encryptPrivateKey(contractPrivateKey, sessionKey, pcid, ski);
        
        // Secure cleanup according to [V2G20-2496]
        secureCleanup(senderKeyPair.privateKey);
        secureCleanup(sharedSecret);
        secureCleanup(sessionKey);
        
        return {
            encryptedPrivateKey,
            senderPublicKey: senderKeyPair.publicKey
        };
    }

    /**
     * Complete decryption flow for receiver (EVCC)
     * @param {Buffer} encryptedPrivateKey - X448_EncryptedPrivateKey
     * @param {Buffer} senderPublicKey - Sender's ECDHE public key
     * @param {Buffer} receiverPrivateKey - Receiver's ECDHE private key
     * @param {string} pcid - PCID from CertificateInstallationReq
     * @param {string} ski - SKI from contract certificate
     * @param {Buffer} contractPublicKey - Public key from contract certificate (for validation)
     * @returns {Buffer} Decrypted and validated 448-bit private key
     */
    receiverDecrypt(encryptedPrivateKey, senderPublicKey, receiverPrivateKey, pcid, ski, contractPublicKey) {
        // Compute shared secret
        const sharedSecret = this.computeSharedSecret(receiverPrivateKey, senderPublicKey);
        
        // Derive session key
        const sessionKey = deriveSessionKey(sharedSecret);
        
        // Decrypt private key
        const privateKey = this.decryptPrivateKey(encryptedPrivateKey, sessionKey, pcid, ski);
        
        // Validate private key according to [V2G20-2510]
        if (!this.validatePrivateKey(privateKey, contractPublicKey)) {
            throw new Error('Private key validation failed');
        }
        
        // Secure cleanup
        secureCleanup(sharedSecret);
        secureCleanup(sessionKey);
        
        return privateKey;
    }

    /**
     * Generate DHPublicKey without extra padding according to [V2G20-2495]
     * @param {Buffer} publicKey - X448 public key (56 bytes)
     * @returns {Buffer} DHPublicKey without padding
     */
    formatDHPublicKey(publicKey) {
        if (publicKey.length !== 56) {
            throw new Error('X448 public key must be 56 bytes');
        }
        
        // According to [V2G20-2495], no extra filler/padding bytes should be added
        // to reach DHPublicKey size of 133 bytes when using 448-bit ephemeral public key
        return publicKey;
    }
}

module.exports = X448PrivateKeyEncryption; 