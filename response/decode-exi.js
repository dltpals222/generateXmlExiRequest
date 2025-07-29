const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');
const java = require('java');

// JVM 설정
java.options.push('-Xmx1g');
java.options.push('-Xms256m');

// JAR 파일 경로 설정 (상위 디렉토리의 exi_processor.jar)
const jarPath = path.join(__dirname, '..', 'exi_processor.jar');
java.classpath.push(jarPath);

// XML 포맷팅 함수 (태그와 값이 한 줄, 2칸 들여쓰기, 값에 줄바꿈 없음)
function formatXML(xmlString) {
  try {
    // XML 선언 분리
    let xmlDecl = '';
    let body = xmlString;
    const declMatch = xmlString.match(/^<\?xml[^>]*\?>/);
    if (declMatch) {
      xmlDecl = declMatch[0] + '\n';
      body = xmlString.replace(/^<\?xml[^>]*\?>\s*/, '');
    }

    // 줄바꿈/공백 정리
    body = body.replace(/>[\s\n\r]*</g, '><'); // 태그 사이 공백 제거

    // 태그별로 줄바꿈
    let pretty = '';
    let indent = 0;
    const tagRegex = /(<[^>]+>)([^<]*)/g;
    let match;
    while ((match = tagRegex.exec(body)) !== null) {
      let [full, tag, value] = match;
      // 닫는 태그면 들여쓰기 감소
      if (/^<\//.test(tag)) indent = Math.max(0, indent - 1);
      // 줄 생성
      let line = '  '.repeat(indent) + tag;
      if (value && value.trim()) {
        line += value.replace(/[\n\r]+/g, '').trim();
      }
      pretty += line + '\n';
      // 여는 태그(단일/닫는 태그 제외)면 들여쓰기 증가
      if (/^<[^!?/][^>]*[^/]?>$/.test(tag)) indent++;
    }
    return xmlDecl + pretty.trim();
  } catch (e) {
    console.log('⚠️ XML 포맷팅 실패, 원본 반환:', e.message);
    return xmlString;
  }
}

// EXI 프로세서 클래스
class ExiProcessor {
    constructor() {
        this.initialized = false;
        this.classes = {};
    }

    // 초기화 - 여러 클래스를 불러옴
    init() {
        const classNames = [
            'com.lw.exiConvert.XmlEncode',
            'com.lw.exiConvert.XmlDecode',
        ];

        let loadedCount = 0;
        
        for (const className of classNames) {
            try {
                const shortName = className.split('.').pop();
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

    // EXI를 XML로 디코딩
    decodeXML(exiData) {
        if (!this.initialized || !this.classes.XmlDecode) {
            console.error('XmlDecode 클래스가 로드되지 않았습니다.');
            return null;
        }

        try {
            const byteArray = Array.from(exiData);
            const javaByteArray = java.newArray('byte', byteArray);
            
            const result = this.classes.XmlDecode.decodeXMLSync(javaByteArray);
            return result;
        } catch (error) {
            console.error('EXI 디코딩 실패:', error.message);
            return null;
        }
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function listExiResponseFiles() {
    const requestOutputDir = path.join(__dirname, '..', 'request', 'output');
    const files = await fsPromises.readdir(requestOutputDir);
    
    const exiResponseFiles = files.filter(file => 
        file.startsWith('exi_response_') && file.endsWith('.json')
    );
    
    if (exiResponseFiles.length === 0) {
        console.log('❌ EXI 응답 파일이 없습니다.');
        return [];
    }
    
    console.log('\n📁 사용 가능한 EXI 응답 파일:');
    exiResponseFiles.forEach((file, index) => {
        const filePath = path.join(requestOutputDir, file);
        const stats = fs.statSync(filePath);
        const fileSize = (stats.size / 1024).toFixed(2);
        const modifiedDate = stats.mtime.toLocaleString('ko-KR');
        
        console.log(`${index + 1}. ${file} (${fileSize} KB, ${modifiedDate})`);
    });
    
    return exiResponseFiles;
}

async function decodeExiResponse(exiResponseFile) {
    const requestOutputDir = path.join(__dirname, '..', 'request', 'output');
    const exiResponsePath = path.join(requestOutputDir, exiResponseFile);
    const decodeOutputDir = path.join(__dirname, 'decode');
    
    // decode 디렉토리 생성 (없는 경우)
    if (!fs.existsSync(decodeOutputDir)) {
        fs.mkdirSync(decodeOutputDir, { recursive: true });
        console.log(`📁 디렉토리 생성됨: ${decodeOutputDir}`);
    }
    
    // EXI 프로세서 초기화
    const exiProcessor = new ExiProcessor();
    exiProcessor.init();
    
    if (!exiProcessor.initialized) {
        console.log('❌ EXI 프로세서 초기화 실패');
        return [];
    }
    
    try {
        // EXI 응답 파일 읽기
        const exiResponseData = await fsPromises.readFile(exiResponsePath, 'utf8');
        const response = JSON.parse(exiResponseData);
        
        if (!response.response || !response.response.data || !response.response.data.exiResponse) {
            console.log('❌ EXI 응답 데이터가 없습니다.');
            return [];
        }
        
        const exiResponse = response.response.data.exiResponse;
        
        if (Array.isArray(exiResponse)) {
            // 배열 형태인 경우: 여러 개의 EXI 응답 처리
            console.log(`🔄 ${exiResponse.length}개의 EXI 응답을 처리 중...`);
            
            const xmlFiles = [];
            
            for (let i = 0; i < exiResponse.length; i++) {
                const singleExiResponse = exiResponse[i];
                let xmlBuffer;
                
                if (typeof singleExiResponse === 'string') {
                    // 문자열 형태인 경우: Base64 디코딩 후 EXI 디코딩 시도
                    console.log(`  🔄 [${i + 1}/${exiResponse.length}] Base64 디코딩 중...`);
                    const exiBuffer = Buffer.from(singleExiResponse, 'base64');
                    
                    try {
                        // EXI 디코딩 시도
                        console.log(`  🔄 [${i + 1}/${exiResponse.length}] EXI 디코딩 중...`);
                        const decodedXml = exiProcessor.decodeXML(exiBuffer);
                        
                        if (decodedXml) {
                            // XML 포맷팅 (보기 좋게 들여쓰기)
                            const formattedXml = formatXML(decodedXml);
                            xmlBuffer = Buffer.from(formattedXml, 'utf8');
                            console.log(`  ✅ [${i + 1}/${exiResponse.length}] EXI 디코딩 성공`);
                        } else {
                            throw new Error('EXI 디코딩 결과가 null');
                        }
                    } catch (exiError) {
                        // EXI 디코딩 실패 시 Base64 디코딩된 데이터를 그대로 사용
                        console.log(`  ⚠️ [${i + 1}/${exiResponse.length}] EXI 디코딩 실패, Base64 데이터 사용: ${exiError.message}`);
                        xmlBuffer = exiBuffer;
                    }
                } else if (Array.isArray(singleExiResponse)) {
                    // 바이트 배열인 경우
                    console.log(`  🔄 [${i + 1}/${exiResponse.length}] 바이트 배열을 Buffer로 변환 중...`);
                    const exiBuffer = Buffer.from(singleExiResponse.map(byte => byte < 0 ? byte + 256 : byte));
                    
                    try {
                        // EXI 디코딩 시도
                        console.log(`  🔄 [${i + 1}/${exiResponse.length}] EXI 디코딩 중...`);
                        const decodedXml = exiProcessor.decodeXML(exiBuffer);
                        
                        if (decodedXml) {
                            // XML 포맷팅 (보기 좋게 들여쓰기)
                            const formattedXml = formatXML(decodedXml);
                            xmlBuffer = Buffer.from(formattedXml, 'utf8');
                            console.log(`  ✅ [${i + 1}/${exiResponse.length}] EXI 디코딩 성공`);
                        } else {
                            throw new Error('EXI 디코딩 결과가 null');
                        }
                    } catch (exiError) {
                        // EXI 디코딩 실패 시 바이트 배열 데이터를 그대로 사용
                        console.log(`  ⚠️ [${i + 1}/${exiResponse.length}] EXI 디코딩 실패, 바이트 배열 데이터 사용: ${exiError.message}`);
                        xmlBuffer = exiBuffer;
                    }
                } else {
                    console.log(`  ⚠️ [${i + 1}/${exiResponse.length}] 지원하지 않는 형식, 건너뜀`);
                    continue;
                }
                
                // XML 파일명 생성 (인덱스 추가)
                const baseFileName = path.parse(exiResponseFile).name;
                const xmlOutputFile = path.join(decodeOutputDir, `${baseFileName}_${i + 1}.xml`);
                
                // XML 파일로 저장
                await fsPromises.writeFile(xmlOutputFile, xmlBuffer);
                
                // XML 파일 읽기
                const decodedXml = xmlBuffer.toString('utf8');
                
                console.log(`  ✅ [${i + 1}/${exiResponse.length}] XML 파일 저장 완료: ${path.basename(xmlOutputFile)}`);
                console.log(`  📊 파일 크기: ${(decodedXml.length / 1024).toFixed(2)} KB`);
                
                xmlFiles.push(xmlOutputFile);
            }
            
            console.log(`\n✅ 총 ${xmlFiles.length}개의 XML 파일이 저장되었습니다.`);
            return xmlFiles;
            
        } else if (typeof exiResponse === 'string') {
            // 단일 문자열 형태인 경우: Base64 디코딩 후 EXI 디코딩 시도
            console.log('🔄 단일 Base64 디코딩 중...');
            const exiBuffer = Buffer.from(exiResponse, 'base64');
            
            let xmlBuffer;
            try {
                // EXI 디코딩 시도
                console.log('🔄 EXI 디코딩 중...');
                const decodedXml = exiProcessor.decodeXML(exiBuffer);
                
                if (decodedXml) {
                    // XML 포맷팅 (보기 좋게 들여쓰기)
                    const formattedXml = formatXML(decodedXml);
                    xmlBuffer = Buffer.from(formattedXml, 'utf8');
                    console.log('✅ EXI 디코딩 성공');
                } else {
                    throw new Error('EXI 디코딩 결과가 null');
                }
            } catch (exiError) {
                // EXI 디코딩 실패 시 Base64 디코딩된 데이터를 그대로 사용
                console.log(`⚠️ EXI 디코딩 실패, Base64 데이터 사용: ${exiError.message}`);
                xmlBuffer = exiBuffer;
            }
            
            const xmlOutputFile = path.join(decodeOutputDir, `${path.parse(exiResponseFile).name}.xml`);
            
            // XML 파일로 저장
            await fsPromises.writeFile(xmlOutputFile, xmlBuffer);
            
            // XML 파일 읽기
            const decodedXml = xmlBuffer.toString('utf8');
                     
            console.log('\n✅ XML 파일 저장 완료!');
            console.log(`📄 저장된 파일: ${xmlOutputFile}`);
            console.log(`📊 파일 크기: ${(decodedXml.length / 1024).toFixed(2)} KB`);
            
            // XML 내용 미리보기 (처음 500자)
            console.log('\n📋 XML 내용 미리보기:');
            console.log('─'.repeat(50));
            console.log(decodedXml.substring(0, 500));
            if (decodedXml.length > 500) {
                console.log('...');
            }
            console.log('─'.repeat(50));
            
            return [xmlOutputFile];
        } else {
            console.log('❌ 지원하지 않는 EXI 응답 형식입니다.');
            return [];
        }
        
    } catch (error) {
        console.error('❌ 파일 처리 실패:', error.message);
        throw error;
    }
}

async function main() {
    try {
        console.log('🔍 EXI 응답 디코더');
        console.log('='.repeat(30));
        
        // EXI 응답 파일 목록 표시
        const exiResponseFiles = await listExiResponseFiles();
        
        if (exiResponseFiles.length === 0) {
            rl.close();
            return;
        }
        
        // 사용자 선택
        const selection = await question(`\n디코딩할 파일 번호를 선택하세요 (1-${exiResponseFiles.length}): `);
        const fileIndex = parseInt(selection) - 1;
        
        if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= exiResponseFiles.length) {
            console.log('❌ 잘못된 선택입니다.');
            rl.close();
            return;
        }
        
        const selectedFile = exiResponseFiles[fileIndex];
        console.log(`\n🎯 선택된 파일: ${selectedFile}`);
        
        // EXI 디코딩 실행
        await decodeExiResponse(selectedFile);
        
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
    } finally {
        rl.close();
    }
}

// 명령줄 인수로 파일명이 제공된 경우
if (process.argv.length > 2) {
    const exiResponseFile = process.argv[2];
    decodeExiResponse(exiResponseFile)
        .then(() => {
            console.log('\n✅ 디코딩 완료!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ 디코딩 실패:', error.message);
            process.exit(1);
        });
} else {
    // 대화형 모드
    main();
} 