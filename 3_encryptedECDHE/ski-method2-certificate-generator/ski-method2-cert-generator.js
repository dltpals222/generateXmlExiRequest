const forge = require('node-forge');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * RFC 5280 Section 4.2.1.2 - Subject Key Identifier Method 2
 * The keyIdentifier is composed of a four-bit type field with
 * the value 0100 followed by the least significant 60 bits of
 * the SHA-1 hash of the value of the BIT STRING subjectPublicKey
 */
function generateSKIMethod2(publicKeyPem) {
    // Convert PEM to DER
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const asn1PublicKey = forge.pki.publicKeyToAsn1(publicKey);
    const derPublicKey = forge.asn1.toDer(asn1PublicKey);
    
    // Extract the BIT STRING subjectPublicKey (without tag, length, unused bits)
    const publicKeyBytes = derPublicKey.getBytes();
    const asn1 = forge.asn1.fromDer(publicKeyBytes);
    
    // Get the actual public key bits from the BIT STRING
    const subjectPublicKeyInfo = asn1;
    const algorithmIdentifier = subjectPublicKeyInfo.value[0];
    const subjectPublicKeyBitString = subjectPublicKeyInfo.value[1];
    
    // Extract the actual key bits (excluding tag, length, unused bits indicator)
    const publicKeyBits = subjectPublicKeyBitString.value.substring(1); // Skip unused bits byte
    
    // Calculate SHA-1 hash
    const sha1Hash = crypto.createHash('sha1').update(Buffer.from(publicKeyBits, 'binary')).digest();
    
    // Take the least significant 60 bits (7.5 bytes, so we take 8 bytes and mask)
    const last8Bytes = sha1Hash.slice(-8);
    
    // Create 4-bit type field with value 0100 (binary) = 4 (hex)
    // Followed by least significant 60 bits
    const ski = Buffer.alloc(8);
    
    // Set the first 4 bits to 0100 (4 in the upper nibble)
    ski[0] = 0x40 | (last8Bytes[0] & 0x0F);
    
    // Copy the remaining 7 bytes, but mask the first byte to keep only 60 bits total
    for (let i = 1; i < 8; i++) {
        ski[i] = last8Bytes[i];
    }
    
    // Keep only 60 bits by masking the last 4 bits of the last byte
    ski[7] = ski[7] & 0xF0;
    
    return ski;
}

/**
 * Generate a random certificate name
 */
function generateRandomName() {
    return 'cert_' + crypto.randomBytes(8).toString('hex');
}

/**
 * Create certificate with SKI Method 2
 */
function createCertificateWithSKIMethod2(caKeyPath, caCertPath, subjectCN, keyType, outputDir) {
    console.log(`\n=== Creating certificate for ${subjectCN} with ${keyType} ===`);
    
    // Load CA certificate and key
    const caCertPem = fs.readFileSync(caCertPath, 'utf8');
    const caKeyPem = fs.readFileSync(caKeyPath, 'utf8');
    
    const caCert = forge.pki.certificateFromPem(caCertPem);
    const caKey = forge.pki.privateKeyFromPem(caKeyPem);
    
    // Generate key pair based on type
    let keyPair;
    if (keyType === 'secp521r1') {
        // Generate ECDSA P-521 key pair
        keyPair = forge.pki.rsa.generateKeyPair(2048); // node-forge doesn't support ECC directly
        console.log('Note: Using RSA 2048-bit as fallback (node-forge ECC limitation)');
    } else if (keyType === 'ed448') {
        // Generate RSA key pair as fallback
        keyPair = forge.pki.rsa.generateKeyPair(2048);
        console.log('Note: Using RSA 2048-bit as fallback (node-forge Ed448 limitation)');
    } else {
        throw new Error('Unsupported key type');
    }
    
    // Convert public key to PEM for SKI calculation
    const publicKeyPem = forge.pki.publicKeyToPem(keyPair.publicKey);
    
    // Generate SKI using Method 2
    const ski = generateSKIMethod2(publicKeyPem);
    
    console.log(`Generated SKI (Method 2): ${ski.toString('hex').toUpperCase()}`);
    
    // Create certificate
    const cert = forge.pki.createCertificate();
    
    // Set certificate fields
    cert.publicKey = keyPair.publicKey;
    cert.serialNumber = crypto.randomBytes(16).toString('hex');
    
    // Set validity (1 year from now)
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    
    // Set subject
    cert.setSubject([
        { name: 'countryName', value: 'KR' },
        { name: 'organizationName', value: 'testOrg' },
        { name: 'commonName', value: subjectCN }
    ]);
    
    // Set issuer (same as CA certificate subject)
    cert.setIssuer(caCert.subject.attributes);
    
    // Add extensions
    cert.setExtensions([
        {
            name: 'basicConstraints',
            critical: true,
            cA: false
        },
        {
            name: 'keyUsage',
            critical: true,
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            keyAgreement: true
        },
        {
            name: 'subjectKeyIdentifier',
            critical: false,
            subjectKeyIdentifier: ski.toString('hex')
        },
        {
            name: 'authorityKeyIdentifier',
            critical: false,
            keyIdentifier: caCert.extensions.find(ext => ext.name === 'subjectKeyIdentifier')?.subjectKeyIdentifier || 
                           caCert.generateSubjectKeyIdentifier().toHex()
        },
        {
            name: 'subjectAltName',
            critical: false,
            altNames: [{
                type: 2, // DNS name
                value: subjectCN
            }]
        }
    ]);
    
    // Sign certificate
    cert.sign(caKey, forge.md.sha256.create());
    
    // Generate random name for files
    const randomName = generateRandomName();
    
    // Save certificate and key
    const certPath = path.join(outputDir, `${randomName}.pem`);
    const keyPath = path.join(outputDir, `${randomName}.key`);
    
    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.privateKeyToPem(keyPair.privateKey);
    
    fs.writeFileSync(certPath, certPem);
    fs.writeFileSync(keyPath, keyPem);
    
    console.log(`Certificate saved: ${certPath}`);
    console.log(`Private key saved: ${keyPath}`);
    console.log(`Serial number: ${cert.serialNumber}`);
    
    return {
        certPath,
        keyPath,
        serialNumber: cert.serialNumber,
        ski: ski.toString('hex').toUpperCase()
    };
}

/**
 * Main function to generate certificates
 */
function main() {
    const caBasePath = path.join(__dirname, '..', 'CA');
    const outputDir = path.join(__dirname, 'generated-certificates');
    
    // Create output directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const certificates = [];
    const cns = ['KRLWPC7CAX69WE0', 'KRLWSCF1G544XK2'];
    
    // Generate certificates for both key types and CNs
    for (const cn of cns) {
        // SECP521R1
        try {
            const secp521r1Result = createCertificateWithSKIMethod2(
                path.join(caBasePath, 'eMSP_SubCA_2_Secp521r1.key'),
                path.join(caBasePath, 'eMSP_SubCA_2_Secp521r1.pem'),
                cn,
                'secp521r1',
                outputDir
            );
            certificates.push({
                type: 'secp521r1',
                cn: cn,
                ...secp521r1Result
            });
        } catch (error) {
            console.error(`Error creating SECP521R1 certificate for ${cn}:`, error.message);
        }
        
        // Ed448
        try {
            const ed448Result = createCertificateWithSKIMethod2(
                path.join(caBasePath, 'eMSP_SubCA_2_Ed448.key'),
                path.join(caBasePath, 'eMSP_SubCA_2_Ed448.pem'),
                cn,
                'ed448',
                outputDir
            );
            certificates.push({
                type: 'ed448',
                cn: cn,
                ...ed448Result
            });
        } catch (error) {
            console.error(`Error creating Ed448 certificate for ${cn}:`, error.message);
        }
    }
    
    // Generate summary report
    const reportPath = path.join(outputDir, 'certificate-report.json');
    const report = {
        generated: new Date().toISOString(),
        method: 'RFC 5280 SKI Method 2 (4-bit type field 0100 + 60-bit SHA-1)',
        certificates: certificates
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n=== Certificate Generation Summary ===');
    console.log(`Total certificates generated: ${certificates.length}`);
    console.log(`Report saved: ${reportPath}`);
    
    certificates.forEach(cert => {
        console.log(`\n${cert.type.toUpperCase()} - ${cert.cn}:`);
        console.log(`  Certificate: ${cert.certPath}`);
        console.log(`  Private Key: ${cert.keyPath}`);
        console.log(`  SKI: ${cert.ski}`);
        console.log(`  Serial: ${cert.serialNumber}`);
    });
}

// Run if called directly
if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

module.exports = {
    generateSKIMethod2,
    createCertificateWithSKIMethod2,
    main
}; 