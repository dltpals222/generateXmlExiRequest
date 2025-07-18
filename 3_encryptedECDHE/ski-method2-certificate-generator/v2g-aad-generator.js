const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * V2G20-2492: Calculate Additional Authenticated Data (AAD)
 * AAD = PCID (18 bytes) + SKI (16 bytes) = 34 bytes total
 * 
 * @param {string} pcid - PCID (18 bytes, capital letters and digits without separators)
 * @param {string} ski - SKI value (16 bytes, hexadecimal string with capital letters and digits)
 * @returns {Buffer} AAD buffer (34 bytes total)
 */
function calculateAAD(pcid, ski) {
    // Validate PCID format and length
    if (typeof pcid !== 'string' || pcid.length !== 18) {
        throw new Error('PCID must be exactly 18 characters');
    }
    
    // Validate PCID contains only capital letters and digits
    if (!/^[A-Z0-9]{18}$/.test(pcid)) {
        throw new Error('PCID must contain only capital letters and digits (A-Z, 0-9)');
    }
    
    // Validate SKI format and length
    if (typeof ski !== 'string' || ski.length !== 32) {
        throw new Error('SKI must be exactly 32 hex characters (16 bytes)');
    }
    
    // Validate SKI contains only valid hex characters (capital letters and digits)
    if (!/^[A-F0-9]{32}$/.test(ski)) {
        throw new Error('SKI must be hexadecimal with capital letters and digits (A-F, 0-9)');
    }
    
    // Convert PCID to buffer (18 bytes)
    const pcidBuffer = Buffer.from(pcid, 'ascii');
    
    // Convert SKI hex string to buffer (16 bytes)
    const skiBuffer = Buffer.from(ski, 'hex');
    
    // Concatenate PCID + SKI = 34 bytes total
    const aadBuffer = Buffer.concat([pcidBuffer, skiBuffer]);
    
    console.log(`PCID: ${pcid} (${pcidBuffer.length} bytes)`);
    console.log(`SKI:  ${ski} (${skiBuffer.length} bytes)`);
    console.log(`AAD:  ${aadBuffer.toString('hex').toUpperCase()} (${aadBuffer.length} bytes)`);
    
    return aadBuffer;
}

/**
 * Load test data from JSON file
 */
function loadTestData(jsonFilePath) {
    try {
        const jsonData = fs.readFileSync(jsonFilePath, 'utf8');
        return JSON.parse(jsonData);
    } catch (error) {
        throw new Error(`Failed to load test data: ${error.message}`);
    }
}

/**
 * Generate AAD for multiple test cases
 */
function generateAADBatch(testDataPath) {
    const testData = loadTestData(testDataPath);
    const results = [];
    
    console.log('=== V2G AAD Generation (V2G20-2492) ===\n');
    
    testData.testCases.forEach((testCase, index) => {
        console.log(`--- Test Case ${index + 1}: ${testCase.name} ---`);
        
        try {
            const aad = calculateAAD(testCase.pcid, testCase.ski);
            
            const result = {
                name: testCase.name,
                pcid: testCase.pcid,
                emaid: testCase.emaid,
                ski: testCase.ski,
                aad: aad.toString('hex').toUpperCase(),
                aadLength: aad.length,
                success: true
            };
            
            results.push(result);
            console.log(`✅ Success: AAD generated for ${testCase.name}`);
            
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            
            results.push({
                name: testCase.name,
                pcid: testCase.pcid,
                emaid: testCase.emaid,
                ski: testCase.ski,
                error: error.message,
                success: false
            });
        }
        
        console.log(''); // Empty line for readability
    });
    
    return results;
}

/**
 * Save AAD results to JSON file
 */
function saveResults(results, outputPath) {
    const report = {
        generated: new Date().toISOString(),
        standard: 'V2G20-2492 Additional Authenticated Data',
        totalTestCases: results.length,
        successfulCases: results.filter(r => r.success).length,
        results: results
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`Results saved to: ${outputPath}`);
}

/**
 * Main function
 */
function main() {
    const testDataPath = path.join(__dirname, 'test-data.json');
    const outputPath = path.join(__dirname, 'aad-generation-results.json');
    
    try {
        // Generate AAD for all test cases
        const results = generateAADBatch(testDataPath);
        
        // Save results
        saveResults(results, outputPath);
        
        // Summary
        const successful = results.filter(r => r.success).length;
        console.log(`\n=== Summary ===`);
        console.log(`Total test cases: ${results.length}`);
        console.log(`Successful: ${successful}`);
        console.log(`Failed: ${results.length - successful}`);
        
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
    calculateAAD,
    generateAADBatch,
    loadTestData,
    saveResults,
    main
}; 