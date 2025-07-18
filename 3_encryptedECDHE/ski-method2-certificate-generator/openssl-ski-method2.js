const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * RFC 5280 Section 4.2.1.2 - Subject Key Identifier Method 2
 * 4-bit type field 0100 + least significant 60 bits of SHA-1 hash
 */
function calculateSKIMethod2(publicKeyPem) {
    // Extract public key bits from PEM
    const publicKeyLines = publicKeyPem.split('\n').filter(line => 
        !line.includes('-----BEGIN') && !line.includes('-----END') && line.trim()
    );
    const publicKeyB64 = publicKeyLines.join('');
    const publicKeyDer = Buffer.from(publicKeyB64, 'base64');
    
    // Parse DER to extract the actual public key bits
    // This is a simplified approach - in real implementation, need proper ASN.1 parsing
    const sha1Hash = crypto.createHash('sha1').update(publicKeyDer).digest();
    
    // Take last 8 bytes and create SKI with Method 2 format
    const last8Bytes = sha1Hash.slice(-8);
    
    // Create 4-bit type field 0100 (4 in hex) in upper nibble
    const ski = Buffer.alloc(8);
    ski[0] = 0x40 | (last8Bytes[0] & 0x0F); // 0100xxxx
    
    // Copy remaining bytes
    for (let i = 1; i < 8; i++) {
        ski[i] = last8Bytes[i];
    }
    
    // Mask last 4 bits to ensure exactly 60 bits
    ski[7] = ski[7] & 0xF0;
    
    return ski.toString('hex').toUpperCase();
}

/**
 * Generate random certificate filename
 */
function generateRandomName() {
    return 'cert_' + crypto.randomBytes(8).toString('hex');
}

/**
 * Create OpenSSL config for certificate generation
 */
function createOpenSSLConfig(cn, ski, outputDir) {
    const configContent = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = KR
O = testOrg
CN = ${cn}

[v3_req]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,nonRepudiation,keyEncipherment,keyAgreement
subjectKeyIdentifier = critical,${ski}
subjectAltName = DNS:${cn}

[v3_ca]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,nonRepudiation,keyEncipherment,keyAgreement
subjectKeyIdentifier = critical,${ski}
subjectAltName = DNS:${cn}
`;
    
    const configPath = path.join(outputDir, 'temp_openssl.conf');
    fs.writeFileSync(configPath, configContent);
    return configPath;
}

/**
 * Generate certificate using OpenSSL with custom SKI
 */
function generateCertificateWithSKI(caKeyPath, caCertPath, cn, keyType, outputDir) {
    console.log(`\n=== Creating certificate for ${cn} with ${keyType} ===`);
    
    const randomName = generateRandomName();
    const keyPath = path.join(outputDir, `${randomName}.key`);
    const csrPath = path.join(outputDir, `${randomName}.csr`);
    const certPath = path.join(outputDir, `${randomName}.pem`);
    
    try {
        // Step 1: Generate private key based on type
        let keyGenCmd;
        if (keyType === 'secp521r1') {
            keyGenCmd = `openssl ecparam -genkey -name secp521r1 -out "${keyPath}"`;
        } else if (keyType === 'ed448') {
            keyGenCmd = `openssl genpkey -algorithm Ed448 -out "${keyPath}"`;
        } else {
            throw new Error(`Unsupported key type: ${keyType}`);
        }
        
        console.log('Generating private key...');
        execSync(keyGenCmd, { stdio: 'inherit' });
        
        // Step 2: Extract public key and calculate SKI Method 2
        console.log('Extracting public key for SKI calculation...');
        const pubKeyCmd = `openssl pkey -in "${keyPath}" -pubout`;
        const publicKeyPem = execSync(pubKeyCmd, { encoding: 'utf8' });
        
        const ski = calculateSKIMethod2(publicKeyPem);
        console.log(`Generated SKI (Method 2): ${ski}`);
        
        // Step 3: Create OpenSSL config with custom SKI
        const configPath = createOpenSSLConfig(cn, ski, outputDir);
        
        // Step 4: Generate CSR
        console.log('Creating certificate signing request...');
        const csrCmd = `openssl req -new -key "${keyPath}" -out "${csrPath}" -config "${configPath}"`;
        execSync(csrCmd, { stdio: 'inherit' });
        
        // Step 5: Sign certificate with CA
        console.log('Signing certificate with CA...');
        const signCmd = `openssl x509 -req -in "${csrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" -CAcreateserial -out "${certPath}" -days 365 -extensions v3_ca -extfile "${configPath}"`;
        execSync(signCmd, { stdio: 'inherit' });
        
        // Step 6: Get certificate serial number
        const serialCmd = `openssl x509 -in "${certPath}" -noout -serial`;
        const serialOutput = execSync(serialCmd, { encoding: 'utf8' });
        const serialNumber = serialOutput.trim().replace('serial=', '');
        
        // Clean up temporary files
        fs.unlinkSync(configPath);
        fs.unlinkSync(csrPath);
        
        console.log(`Certificate saved: ${certPath}`);
        console.log(`Private key saved: ${keyPath}`);
        console.log(`Serial number: ${serialNumber}`);
        
        return {
            certPath,
            keyPath,
            serialNumber,
            ski,
            cn,
            keyType
        };
        
    } catch (error) {
        console.error(`Error generating certificate for ${cn}:`, error.message);
        
        // Clean up on error
        [keyPath, csrPath, certPath].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
        
        throw error;
    }
}

/**
 * Main function
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
    const keyTypes = [
        { type: 'secp521r1', caKey: 'eMSP_SubCA_2_Secp521r1.key', caCert: 'eMSP_SubCA_2_Secp521r1.pem' },
        { type: 'ed448', caKey: 'eMSP_SubCA_2_Ed448.key', caCert: 'eMSP_SubCA_2_Ed448.pem' }
    ];
    
    // Generate certificates for all combinations
    for (const cn of cns) {
        for (const keyTypeInfo of keyTypes) {
            try {
                const result = generateCertificateWithSKI(
                    path.join(caBasePath, keyTypeInfo.caKey),
                    path.join(caBasePath, keyTypeInfo.caCert),
                    cn,
                    keyTypeInfo.type,
                    outputDir
                );
                certificates.push(result);
            } catch (error) {
                console.error(`Failed to generate ${keyTypeInfo.type} certificate for ${cn}:`, error.message);
            }
        }
    }
    
    // Generate report
    const reportPath = path.join(outputDir, 'certificate-report.json');
    const report = {
        generated: new Date().toISOString(),
        method: 'RFC 5280 SKI Method 2 (4-bit type field 0100 + 60-bit SHA-1)',
        total: certificates.length,
        certificates: certificates
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n=== Certificate Generation Summary ===');
    console.log(`Total certificates generated: ${certificates.length}`);
    console.log(`Report saved: ${reportPath}`);
    
    certificates.forEach(cert => {
        console.log(`\n${cert.keyType.toUpperCase()} - ${cert.cn}:`);
        console.log(`  Certificate: ${path.basename(cert.certPath)}`);
        console.log(`  Private Key: ${path.basename(cert.keyPath)}`);
        console.log(`  SKI: ${cert.ski}`);
        console.log(`  Serial: ${cert.serialNumber}`);
    });
    
    return certificates;
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
    calculateSKIMethod2,
    generateCertificateWithSKI,
    main
}; 