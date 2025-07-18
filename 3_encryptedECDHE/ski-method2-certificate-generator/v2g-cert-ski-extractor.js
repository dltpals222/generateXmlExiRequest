/**
 * V2G Certificate SKI Extractor and AAD Generator
 * 
 * This module implements V2G20-2492 Additional Authenticated Data (AAD) calculation
 * by extracting Subject Key Identifier (SKI) from X.509 certificates and combining
 * it with PCID (Provisioning Certificate Identifier) values.
 * 
 * Key Features:
 * - Extracts SKI from X.509 certificates using OpenSSL
 * - Supports flexible SKI lengths (commonly 8 or 16 bytes)
 * - Calculates V2G20-2492 compliant AAD = PCID (18 bytes) + SKI (variable)
 * - Batch processing of multiple certificates
 * - Comprehensive error handling and validation
 * - JSON reporting for audit and debugging
 * 
 * V2G20-2492 Standard Compliance:
 * "Additional authenticated data (AAD) shall be calculated by concatenating 
 * the PCID received/used in the CertificateInstallationReq message with 
 * capital letters and digits without separators (18 bytes), followed by 
 * the SKI value of the contract certificate included in the 
 * CertificateInstallationRes encoded as a hexadecimal string with 
 * capital letters and digits according to IETF RFC 5234."
 * 
 * @author V2G Implementation Team
 * @version 1.0.0
 * @requires openssl - OpenSSL command-line tool for certificate parsing
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Extract Subject Key Identifier (SKI) from X.509 certificate using OpenSSL
 * 
 * Uses OpenSSL command-line tool to parse the certificate and extract the 
 * X509v3 Subject Key Identifier extension. The SKI is typically found as
 * a hex string with colons (e.g., "4F:98:CD:B9:EF:40:11:F0") and is
 * converted to uppercase format without colons for V2G AAD calculation.
 * 
 * @param {string} certPath - Absolute or relative path to the X.509 certificate file (.pem format)
 * @returns {string} SKI value in uppercase hexadecimal format without colons (e.g., "4F98CDB9EF4011F0")
 * @throws {Error} If certificate file cannot be read, OpenSSL fails, or SKI extension is not found
 */
function extractSKIFromCertificate(certPath) {
    try {
        // Use OpenSSL to extract SKI from certificate
        const cmd = `openssl x509 -in "${certPath}" -text -noout`;
        const certText = execSync(cmd, { encoding: 'utf8' });
        
        // Find Subject Key Identifier line
        const lines = certText.split('\n');
        let skiFound = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Look for "X509v3 Subject Key Identifier"
            if (line.includes('X509v3 Subject Key Identifier')) {
                skiFound = true;
                continue;
            }
            
            // Next line after SKI identifier should contain the value
            if (skiFound && line.match(/^[A-F0-9:]+$/)) {
                // Remove colons and return uppercase
                const ski = line.replace(/:/g, '').toUpperCase();
                console.log(`Extracted SKI from certificate: ${ski}`);
                return ski;
            }
        }
        
        throw new Error('Subject Key Identifier not found in certificate');
        
    } catch (error) {
        throw new Error(`Failed to extract SKI: ${error.message}`);
    }
}

/**
 * Calculate Additional Authenticated Data (AAD) according to V2G20-2492 standard
 * 
 * V2G20-2492 specifies that AAD shall be calculated by concatenating:
 * 1. PCID (Provisioning Certificate Identifier) - 18 bytes ASCII
 * 2. SKI (Subject Key Identifier) - variable length hexadecimal
 * 
 * This implementation supports flexible SKI lengths (commonly 8 or 16 bytes)
 * unlike the original specification which assumes 16 bytes. The total AAD
 * length will be 18 + (SKI_length_in_bytes).
 * 
 * @param {string} pcid - PCID value, exactly 18 characters, capital letters and digits only (A-Z, 0-9)
 * @param {string} ski - SKI value as hexadecimal string, uppercase letters and digits (A-F, 0-9), even length
 * @returns {Buffer} AAD buffer containing concatenated PCID + SKI bytes
 * @throws {Error} If PCID format is invalid (wrong length or invalid characters)
 * @throws {Error} If SKI format is invalid (empty, odd length, or invalid hex characters)
 */
function calculateAAD(pcid, ski) {
    // Validate PCID
    if (typeof pcid !== 'string' || pcid.length !== 18) {
        throw new Error('PCID must be exactly 18 characters');
    }
    
    if (!/^[A-Z0-9]{18}$/.test(pcid)) {
        throw new Error('PCID must contain only capital letters and digits');
    }
    
    // Validate SKI (flexible length)
    if (typeof ski !== 'string' || ski.length === 0) {
        throw new Error('SKI cannot be empty');
    }
    
    if (ski.length % 2 !== 0) {
        throw new Error('SKI must have even number of hex characters');
    }
    
    if (!/^[A-F0-9]+$/.test(ski)) {
        throw new Error('SKI must contain only valid hex characters (A-F, 0-9)');
    }
    
    // Convert to buffers
    const pcidBuffer = Buffer.from(pcid, 'ascii');
    const skiBuffer = Buffer.from(ski, 'hex');
    
    // Concatenate
    const aadBuffer = Buffer.concat([pcidBuffer, skiBuffer]);
    
    console.log(`PCID: ${pcid} (${pcidBuffer.length} bytes)`);
    console.log(`SKI:  ${ski} (${skiBuffer.length} bytes)`);
    console.log(`AAD:  ${aadBuffer.toString('hex').toUpperCase()} (${aadBuffer.length} bytes)`);
    
    return aadBuffer;
}

/**
 * Generate V2G AAD directly from X.509 certificate file
 * 
 * This is a high-level function that combines SKI extraction and AAD calculation
 * in a single operation. It reads the certificate file, extracts the Subject Key
 * Identifier using OpenSSL, and then calculates the V2G20-2492 compliant AAD.
 * 
 * Process flow:
 * 1. Parse certificate using OpenSSL to extract SKI
 * 2. Validate PCID format
 * 3. Calculate AAD = PCID + SKI
 * 4. Return comprehensive result object
 * 
 * @param {string} certPath - Path to X.509 certificate file (.pem format)
 * @param {string} pcid - PCID value for AAD calculation (18 chars, A-Z0-9)
 * @returns {Object} Result object containing:
 *   - certPath: Original certificate path
 *   - pcid: Input PCID value
 *   - extractedSKI: SKI extracted from certificate (hex string)
 *   - skiLength: SKI length in bytes
 *   - aad: Generated AAD as uppercase hex string
 *   - aadLength: Total AAD length in bytes
 *   - success: Boolean indicating operation success
 *   - error: Error message (only if success = false)
 */
function generateAADFromCertificate(certPath, pcid) {
    console.log(`\n=== Generating AAD from Certificate ===`);
    console.log(`Certificate: ${path.basename(certPath)}`);
    console.log(`PCID: ${pcid}`);
    
    try {
        // Extract SKI from certificate
        const ski = extractSKIFromCertificate(certPath);
        
        // Calculate AAD
        const aad = calculateAAD(pcid, ski);
        
        const result = {
            certPath,
            pcid,
            extractedSKI: ski,
            skiLength: ski.length / 2, // bytes
            aad: aad.toString('hex').toUpperCase(),
            aadLength: aad.length,
            success: true
        };
        
        console.log(`✅ Success: AAD generated from certificate`);
        return result;
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return {
            certPath,
            pcid,
            error: error.message,
            success: false
        };
    }
}

/**
 * Process multiple certificates in batch for AAD generation
 * 
 * Processes a list of certificates and their corresponding PCIDs to generate
 * V2G AAD values for each pair. This is useful for bulk processing of contract
 * certificates in V2G environments where multiple certificates need AAD
 * calculation for cryptographic operations.
 * 
 * Each certificate is processed independently, and errors in one certificate
 * do not affect the processing of others. Failed operations are captured
 * in the result array with error details.
 * 
 * @param {Array<Object>} certificateList - Array of certificate objects, each containing:
 *   - certPath {string}: Path to X.509 certificate file
 *   - pcid {string}: PCID value for this certificate
 * @returns {Array<Object>} Array of result objects (same structure as generateAADFromCertificate)
 * @see generateAADFromCertificate For detailed result object structure
 */
function processCertificatesBatch(certificateList) {
    const results = [];
    
    console.log('=== V2G AAD Generation from Certificates ===');
    
    certificateList.forEach((certInfo, index) => {
        console.log(`\n--- Processing Certificate ${index + 1} ---`);
        const result = generateAADFromCertificate(certInfo.certPath, certInfo.pcid);
        results.push(result);
    });
    
    return results;
}

/**
 * Main demonstration function for V2G AAD generation from generated certificates
 * 
 * This function demonstrates the complete workflow of extracting SKI from
 * previously generated certificates and calculating V2G20-2492 compliant AAD.
 * It automatically discovers certificate files in the generated-certificates
 * directory and processes them with sample PCID values.
 * 
 * Workflow:
 * 1. Scan for .pem certificate files in generated-certificates directory
 * 2. Create test PCID values for demonstration
 * 3. Process each certificate to extract SKI and calculate AAD
 * 4. Generate comprehensive JSON report with all results
 * 5. Display summary statistics
 * 
 * Output files:
 * - cert-aad-results.json: Complete results with extracted SKI and calculated AAD
 * 
 * @returns {Array<Object>} Array of processing results for all certificates
 * @throws {Error} If no certificates found or file I/O operations fail
 */
function main() {
    const certsDir = path.join(__dirname, 'generated-certificates');
    const outputPath = path.join(__dirname, 'cert-aad-results.json');
    
    try {
        // Find generated certificate files
        const certFiles = fs.readdirSync(certsDir)
            .filter(file => file.endsWith('.pem'))
            .slice(0, 2); // Take first 2 certificates for testing
        
        if (certFiles.length === 0) {
            console.log('No certificate files found. Please run openssl-ski-method2.js first.');
            return;
        }
        
        // Create test data
        const certificateList = certFiles.map((file, index) => ({
            certPath: path.join(certsDir, file),
            pcid: index === 0 ? 'KRLWPC7CAX69WE0001' : 'KRLWSCF1G544XK2002'
        }));
        
        // Process certificates
        const results = processCertificatesBatch(certificateList);
        
        // Save results
        const report = {
            generated: new Date().toISOString(),
            method: 'AAD from Certificate SKI Extraction',
            totalCertificates: results.length,
            successfulExtractions: results.filter(r => r.success).length,
            results: results
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
        
        // Summary
        console.log(`\n=== Summary ===`);
        console.log(`Certificates processed: ${results.length}`);
        console.log(`Successful extractions: ${results.filter(r => r.success).length}`);
        console.log(`Results saved to: ${outputPath}`);
        
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
    extractSKIFromCertificate,
    calculateAAD,
    generateAADFromCertificate,
    processCertificatesBatch,
    main
}; 