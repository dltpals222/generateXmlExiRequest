const ExiProcessor = require('./exiProcessor');
const path = require('path');
const fs = require('fs');

// ANSI 색상 코드
const colors = {
    reset: "\x1b[0m",
    fg: {
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        cyan: "\x1b[36m",
    }
};

async function testExiProcessor() {
    console.log(`${colors.fg.blue}=== 새로운 EXI 프로세서 테스트 시작 ===${colors.reset}`);
    
    const processor = new ExiProcessor();
    
    try {
        // 1. 초기화
        console.log(`\n${colors.fg.cyan}[1/4] EXI 프로세서 초기화...${colors.reset}`);
        processor.init();
        
        if (!processor.initialized) {
            throw new Error('EXI 프로세서 초기화 실패');
        }
        console.log(`${colors.fg.green}✓ 초기화 성공${colors.reset}`);
        
        // 2. 테스트 XML 생성
        console.log(`\n${colors.fg.cyan}[2/4] 테스트 XML 생성...${colors.reset}`);
        const testXml = `<?xml version="1.0" encoding="UTF-8"?>
<ns:Message xmlns:ns="urn:iso:std:iso:15118:-20:CommonMessages">
    <ns:Header>
        <ns:SessionID>12345678</ns:SessionID>
    </ns:Header>
    <ns:Body>
        <ns:TestElement>Hello EXI Processor</ns:TestElement>
    </ns:Body>
</ns:Message>`;
        
        const testXmlPath = path.join(__dirname, 'test_exi_processor.xml');
        fs.writeFileSync(testXmlPath, testXml, 'utf8');
        console.log(`${colors.fg.green}✓ 테스트 XML 파일 생성: ${testXmlPath}${colors.reset}`);
        
        // 3. XML → EXI 변환 테스트
        console.log(`\n${colors.fg.cyan}[3/4] XML → EXI 변환 테스트...${colors.reset}`);
        const exiFilePath = processor.xmlToExiFile(testXmlPath);
        if (!exiFilePath) {
            throw new Error('XML → EXI 변환 실패');
        }
        console.log(`${colors.fg.green}✓ EXI 파일 생성: ${exiFilePath}${colors.reset}`);
        
        // 4. EXI → XML 변환 테스트
        console.log(`\n${colors.fg.cyan}[4/4] EXI → XML 변환 테스트...${colors.reset}`);
        const decodedXmlPath = processor.exiToXmlFile(exiFilePath);
        if (!decodedXmlPath) {
            throw new Error('EXI → XML 변환 실패');
        }
        console.log(`${colors.fg.green}✓ 디코딩된 XML 파일 생성: ${decodedXmlPath}${colors.reset}`);
        
        // 5. 결과 비교
        console.log(`\n${colors.fg.cyan}[5/5] 결과 비교...${colors.reset}`);
        const originalXml = fs.readFileSync(testXmlPath, 'utf8');
        const decodedXml = fs.readFileSync(decodedXmlPath, 'utf8');
        
        // XML 내용 비교 (공백과 줄바꿈 정규화)
        const normalizeXml = (xml) => xml.replace(/\s+/g, ' ').trim();
        const originalNormalized = normalizeXml(originalXml);
        const decodedNormalized = normalizeXml(decodedXml);
        
        if (originalNormalized === decodedNormalized) {
            console.log(`${colors.fg.green}✓ XML 내용 일치 - 변환 성공!${colors.reset}`);
        } else {
            console.log(`${colors.fg.yellow}⚠ XML 내용 불일치${colors.reset}`);
            console.log('원본:', originalNormalized);
            console.log('디코딩:', decodedNormalized);
        }
        
        console.log(`\n${colors.fg.green}=== 테스트 완료 ===${colors.reset}`);
        
    } catch (error) {
        console.error(`${colors.fg.red}테스트 실패:${colors.reset}`, error.message);
        process.exit(1);
    }
}

// 테스트 실행
testExiProcessor(); 