/**
 * 새로운 EXI 프로세서 사용 예제
 * 
 * 이 파일은 exi_processor.jar를 사용하여 XML과 EXI 간의 변환을 수행하는 방법을 보여줍니다.
 */

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

async function exampleUsage() {
    console.log(`${colors.fg.blue}=== 새로운 EXI 프로세서 사용 예제 ===${colors.reset}`);
    
    const processor = new ExiProcessor();
    
    try {
        // 1. 초기화
        console.log(`\n${colors.fg.cyan}[1] EXI 프로세서 초기화${colors.reset}`);
        processor.init();
        
        if (!processor.initialized) {
            throw new Error('EXI 프로세서 초기화 실패');
        }
        console.log(`${colors.fg.green}✓ 초기화 성공${colors.reset}`);
        
        // 2. 간단한 XML 변환 예제
        console.log(`\n${colors.fg.cyan}[2] 간단한 XML 변환 예제${colors.reset}`);
        
        const simpleXml = `<?xml version="1.0" encoding="UTF-8"?>
<test:Message xmlns:test="urn:example:test">
    <test:Header>
        <test:ID>12345</test:ID>
    </test:Header>
    <test:Body>
        <test:Content>Hello EXI Processor!</test:Content>
    </test:Body>
</test:Message>`;
        
        console.log('원본 XML:');
        console.log(simpleXml);
        
        // XML을 EXI로 변환
        const exiData = processor.encodeXML(simpleXml);
        if (!exiData) {
            throw new Error('XML → EXI 변환 실패');
        }
        console.log(`\n${colors.fg.green}✓ EXI 변환 성공 (${exiData.length} 바이트)${colors.reset}`);
        
        // EXI를 XML로 변환
        const decodedXml = processor.decodeXML(exiData);
        if (!decodedXml) {
            throw new Error('EXI → XML 변환 실패');
        }
        console.log(`\n${colors.fg.green}✓ XML 디코딩 성공${colors.reset}`);
        console.log('디코딩된 XML:');
        console.log(decodedXml);
        
        // 3. Base64 인코딩 예제
        console.log(`\n${colors.fg.cyan}[3] Base64 인코딩 예제${colors.reset}`);
        
        const base64Exi = await processor.encodeToEXI(simpleXml);
        console.log(`Base64 EXI 데이터 (${base64Exi.length} 문자):`);
        console.log(base64Exi.substring(0, 100) + '...');
        
        // 4. 파일 처리 예제
        console.log(`\n${colors.fg.cyan}[4] 파일 처리 예제${colors.reset}`);
        
        const testXmlPath = path.join(__dirname, 'example_test.xml');
        fs.writeFileSync(testXmlPath, simpleXml, 'utf8');
        console.log(`테스트 XML 파일 생성: ${testXmlPath}`);
        
        // XML → EXI → XML 전체 프로세스
        const success = processor.processFile(testXmlPath);
        if (success) {
            console.log(`${colors.fg.green}✓ 파일 처리 성공${colors.reset}`);
        } else {
            console.log(`${colors.fg.red}✗ 파일 처리 실패${colors.reset}`);
        }
        
        // 5. 클래스 정보 확인
        console.log(`\n${colors.fg.cyan}[5] 로드된 클래스 정보${colors.reset}`);
        const loadedClasses = processor.getLoadedClasses();
        console.log(`로드된 클래스들: ${loadedClasses.join(', ')}`);
        
        console.log(`\n${colors.fg.green}=== 예제 완료 ===${colors.reset}`);
        
    } catch (error) {
        console.error(`${colors.fg.red}예제 실행 실패:${colors.reset}`, error.message);
        process.exit(1);
    }
}

// 예제 실행
exampleUsage(); 