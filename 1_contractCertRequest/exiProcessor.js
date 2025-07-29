const java = require('java');
const path = require('path');
const fs = require('fs');

// JVM 설정
java.options.push('-Xmx1g');
java.options.push('-Xms256m');

// JAR 파일 경로 설정 (현재 디렉토리의 exi_processor.jar 사용)
const jarPath = path.join(__dirname, 'exi_processor.jar');
java.classpath.push(jarPath);

// EXI 프로세서 클래스
class ExiProcessor {
    constructor() {
        this.initialized = false;
        this.classes = {}; // 여러 클래스를 저장할 객체
    }

    // 초기화 - 여러 클래스를 불러옴
    init() {
        // 불러올 클래스들 정의
        const classNames = [
            'com.lw.exiConvert.XmlEncode',
            'com.lw.exiConvert.XmlDecode',
            // 필요한 다른 클래스들을 여기에 추가
            // 'com.lw.exiConvert.OtherClass',
        ];

        let loadedCount = 0;
        
        for (const className of classNames) {
            try {
                const shortName = className.split('.').pop(); // 클래스명만 추출 (예: XmlEncode)
                this.classes[shortName] = java.import(className);
                console.log(`✓ 클래스 로드 성공: ${className}`);
                loadedCount++;
            } catch (error) {
                console.error(`✗ 클래스 로드 실패: ${className} - ${error.message}`);
            }
        }

        this.initialized = loadedCount > 0;
        console.log(`\n총 ${loadedCount}개 클래스 로드 완료`);
        
        if (this.initialized) {
            console.log('로드된 클래스들:', Object.keys(this.classes).join(', '));
        }
    }

    // XML을 EXI로 인코딩
    encodeXML(xmlContent) {
        if (!this.initialized || !this.classes.XmlEncode) {
            console.error('XmlEncode 클래스가 로드되지 않았습니다.');
            return null;
        }

        try {
            const result = this.classes.XmlEncode.encodeXMLSync(xmlContent);
            return result;
        } catch (error) {
            console.error('XML 인코딩 실패:', error.message);
            return null;
        }
    }

    // EXI를 XML로 디코딩
    decodeXML(exiData) {
        if (!this.initialized || !this.classes.XmlDecode) {
            console.error('XmlDecode 클래스가 로드되지 않았습니다.');
            return null;
        }

        try {
            // Int8Array를 Java byte[]로 변환
            const byteArray = Array.from(exiData);
            const javaByteArray = java.newArray('byte', byteArray);
            
            const result = this.classes.XmlDecode.decodeXMLSync(javaByteArray);
            return result;
        } catch (error) {
            console.error('EXI 디코딩 실패:', error.message);
            return null;
        }
    }

    // XML을 EXI로 인코딩하고 Base64로 반환 (기존 코드와 호환)
    async encodeToEXI(xmlString, schemaPath = null, isFragment = false, encodingType = 'default') {
        if (!this.initialized) {
            throw new Error('EXI 프로세서가 초기화되지 않았습니다.');
        }

        try {
            console.log(`[EXI Processor] XML을 EXI로 인코딩 중... (${encodingType})`);
            
            // XML을 EXI로 인코딩
            const exiData = this.encodeXML(xmlString);
            if (!exiData) {
                throw new Error('EXI 인코딩 실패');
            }

            // Base64로 변환
            const base64Result = exiData.toString('base64');
            
            console.log(`[EXI Processor] 인코딩 성공. Base64 길이: ${base64Result.length}`);
            return base64Result;

        } catch (error) {
            console.error('[EXI Processor] 인코딩 오류:', error.message);
            throw error;
        }
    }

    // 특정 클래스 가져오기
    getClass(className) {
        return this.classes[className];
    }

    // 로드된 모든 클래스 목록 반환
    getLoadedClasses() {
        return Object.keys(this.classes);
    }

    // XML 파일을 EXI로 변환하고 저장
    xmlToExiFile(xmlFilePath) {
        try {
            // XML 파일 읽기
            const xmlContent = fs.readFileSync(xmlFilePath, 'utf8');
            console.log(`✓ XML 파일 읽기 성공: ${xmlFilePath}`);
            
            // EXI로 인코딩
            const exiData = this.encodeXML(xmlContent);
            if (!exiData) {
                throw new Error('EXI 인코딩 실패');
            }
            
            // EXI 파일 경로 생성 (확장자만 변경)
            const exiFilePath = xmlFilePath.replace(/\.xml$/i, '.exi');
            
            // EXI 파일 저장
            fs.writeFileSync(exiFilePath, exiData);
            console.log(`✓ EXI 파일 저장 성공: ${exiFilePath}`);
            
            return exiFilePath;
        } catch (error) {
            console.error('XML → EXI 변환 실패:', error.message);
            return null;
        }
    }

    // EXI 파일을 XML로 변환하고 저장
    exiToXmlFile(exiFilePath) {
        try {
            // EXI 파일 읽기
            const exiData = fs.readFileSync(exiFilePath);
            console.log(`✓ EXI 파일 읽기 성공: ${exiFilePath}`);
            
            // XML로 디코딩
            const xmlContent = this.decodeXML(exiData);
            if (!xmlContent) {
                throw new Error('XML 디코딩 실패');
            }
            
            // XML 파일 경로 생성 (확장자 변경 + _dec 추가)
            const xmlFilePath = exiFilePath.replace(/\.exi$/i, '_dec.xml');
            
            // XML 파일 저장
            fs.writeFileSync(xmlFilePath, xmlContent, 'utf8');
            console.log(`✓ XML 파일 저장 성공: ${xmlFilePath}`);
            
            return xmlFilePath;
        } catch (error) {
            console.error('EXI → XML 변환 실패:', error.message);
            return null;
        }
    }

    // 전체 프로세스 실행 (XML → EXI → XML)
    processFile(xmlFilePath) {
        console.log(`\n=== 파일 처리 시작: ${xmlFilePath} ===`);
        
        // 1. XML → EXI 변환
        const exiFilePath = this.xmlToExiFile(xmlFilePath);
        if (!exiFilePath) {
            console.error('XML → EXI 변환 실패');
            return false;
        }
        
        // 2. EXI → XML 변환
        const decodedXmlPath = this.exiToXmlFile(exiFilePath);
        if (!decodedXmlPath) {
            console.error('EXI → XML 변환 실패');
            return false;
        }
        
        console.log(`\n=== 파일 처리 완료 ===`);
        console.log(`원본 XML: ${xmlFilePath}`);
        console.log(`EXI 파일: ${exiFilePath}`);
        console.log(`디코딩된 XML: ${decodedXmlPath}`);
        
        return true;
    }
}

module.exports = ExiProcessor; 