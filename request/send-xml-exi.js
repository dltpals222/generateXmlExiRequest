#!/usr/bin/env node

/**
 * ISO 15118-20 인증서 관련 요청 (CertificateInstallationReq, CertificateUpdateReq 등)을
 * 지정된 XML 파일 내용을 EXI로 인코딩하여 서버로 전송하는 스크립트입니다.
 * 이 스크립트는 exi_processor.jar를 사용하여 XML을 EXI로 인코딩한 후 Base64로 인코딩하여 전송합니다.
 *
 * [실행 방법]
 * node send-xml-exi.js [옵션]
 *
 * [옵션]
 * -f <파일명>, --file <파일명>
 *   설명: 요청에 사용할 XML 파일의 이름을 지정합니다.
 *        이 파일은 반드시 '../out' 디렉토리 내에 위치해야 합니다.
 *   기본값: 대화형 선택
 *
 * --action <액션>
 *   설명: 서버에 요청할 액션을 지정합니다. ('install' 또는 'update')
 *   기본값: 'install'
 *
 * --host <호스트>
 *   설명: 서버 호스트를 지정합니다.
 *   기본값: 'localhost'
 *
 * --port <포트>
 *   설명: 서버 포트를 지정합니다.
 *   기본값: 7600
 */

const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ANSI 색상 코드 정의
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    fg: {
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        cyan: "\x1b[36m",
        magenta: "\x1b[35m",
        gray: "\x1b[90m",
    }
};

// readline 인터페이스 설정
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

// EXI 프로세서 가져오기
const ExiProcessor = require('./ExiProcessor');

/**
 * 디렉토리 생성 함수 (없을 경우에만 생성)
 * @param {string} dirPath - 생성할 디렉토리 경로
 */
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`${colors.dim}디렉토리 생성됨: ${dirPath}${colors.reset}`);
    }
}

/**
 * 대화형 파일 선택 함수
 */
async function selectXmlFile() {
    console.log(`${colors.fg.blue}🚀 ISO 15118-20 EXI 요청 전송기${colors.reset}\n`);
    
    // out 폴더의 XML 파일 목록 가져오기
    const outDir = path.join(__dirname, '..', 'out');
    let xmlFiles = [];
    
    try {
        const files = fs.readdirSync(outDir);
        xmlFiles = files.filter(file => file.endsWith('.xml') && file.includes('Req'));
        
        if (xmlFiles.length === 0) {
            console.log(`${colors.fg.red}❌ out 폴더에 Request XML 파일이 없습니다.${colors.reset}`);
            console.log(`${colors.fg.yellow}먼저 'node gen-v20.js'로 XML을 생성해주세요.${colors.reset}`);
            rl.close();
            process.exit(1);
        }
    } catch (error) {
        console.log(`${colors.fg.red}❌ out 폴더를 읽을 수 없습니다: ${error.message}${colors.reset}`);
        rl.close();
        process.exit(1);
    }

    // 파일 정보 분석 및 표시
    console.log(`${colors.fg.cyan}사용 가능한 Request XML 파일들:${colors.reset}\n`);
    
    xmlFiles.forEach((file, index) => {
        const filePath = path.join(outDir, file);
        const stats = fs.statSync(filePath);
        const size = (stats.size / 1024).toFixed(1);
        const modified = stats.mtime.toLocaleString('ko-KR');
        
        // 파일명에서 정보 추출
        let algorithm = 'Auto';
        let emaidOption = '';
        
        if (file.includes('ecdsa')) algorithm = 'ECDSA';
        else if (file.includes('ed448')) algorithm = 'Ed448';
        
        if (file.includes('noemaid')) emaidOption = ' + EMAID 무시';
        else if (file.includes('emaid') || (file.includes('v20') && !file.includes('noemaid'))) emaidOption = ' + EMAID 포함';
        
        console.log(`  ${colors.bright}${index + 1})${colors.reset} ${file}`);
        console.log(`     ${colors.fg.gray}→ ${algorithm}${emaidOption} | ${size}KB | ${modified}${colors.reset}\n`);
    });
    
    // 사용자 선택
    while (true) {
        const input = await question(`${colors.fg.green}EXI 전송할 XML 파일을 선택하세요 (1-${xmlFiles.length}): ${colors.reset}`);
        const choice = parseInt(input);
        
        if (choice >= 1 && choice <= xmlFiles.length) {
            const selectedFile = xmlFiles[choice - 1];
            console.log(`${colors.fg.cyan}선택된 파일: ${selectedFile}${colors.reset}\n`);
            return selectedFile;
        } else {
            console.log(`${colors.fg.red}1-${xmlFiles.length} 사이의 숫자를 입력해주세요.${colors.reset}`);
        }
    }
}

/**
 * ISO15118-20 인증서 요청을 EXI 인코딩하여 보내는 함수
 */
async function sendISO15118_20CertRequestWithEXI() {
    // 기본값 설정
    let action = 'install';
    let xmlFilename = null;
    let hostname = 'localhost';
    let port = 7600;

    // 인수 파싱 로직
    const args = process.argv.slice(2);
    let fileSpecified = false;
    
    for (let i = 0; i < args.length; i++) {
        if ((args[i] === '-f' || args[i] === '--file') && i + 1 < args.length) {
            xmlFilename = args[i + 1];
            fileSpecified = true;
            i++;
            console.log(`${colors.dim}  [Arg Parse] 파일명 인수로 설정: ${xmlFilename}${colors.reset}`);
        } else if (args[i] === '--action' && i + 1 < args.length) {
            const potentialAction = args[i + 1].toLowerCase();
            if (potentialAction === 'install' || potentialAction === 'update') {
                action = potentialAction;
                console.log(`${colors.dim}  [Arg Parse] 액션 인수로 설정: ${action}${colors.reset}`);
            } else {
                console.warn(`${colors.fg.yellow}  [Arg Parse] 경고: 유효하지 않은 액션 값입니다 (${args[i + 1]}). 기본값 'install' 사용.${colors.reset}`);
            }
            i++;
        } else if (args[i] === '--host' && i + 1 < args.length) {
            hostname = args[i + 1];
            i++;
            console.log(`${colors.dim}  [Arg Parse] 호스트 인수로 설정: ${hostname}${colors.reset}`);
        } else if (args[i] === '--port' && i + 1 < args.length) {
            port = parseInt(args[i + 1]);
            i++;
            console.log(`${colors.dim}  [Arg Parse] 포트 인수로 설정: ${port}${colors.reset}`);
        }
    }

    // 파일이 지정되지 않았으면 대화형 선택
    if (!fileSpecified) {
        xmlFilename = await selectXmlFile();
    }

    console.log(`${colors.fg.blue}🚀 EXI 인코딩 XML 요청 전송 시작...${colors.reset}`);
    console.log(`${colors.fg.gray}  📄 XML 파일: ${xmlFilename}${colors.reset}`);
    console.log(`${colors.fg.gray}  🎯 액션: ${action}${colors.reset}`);
    console.log(`${colors.fg.gray}  🌐 서버: ${hostname}:${port}${colors.reset}`);

    const url = `http://${hostname}:${port}/api/contract-cert/ISO15118CertReq`;
    const outDir = path.join(__dirname, '..', 'out');
    const requestOutputDir = path.join(__dirname, 'output');
    
    ensureDirectoryExists(requestOutputDir);

    // XML 파일 경로 설정
    const xmlFilePath = path.join(outDir, xmlFilename);

    // 응답 저장 파일 경로
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const responseFilename = `exi_response_${xmlFilename.replace('.xml', '')}_${action}_${timestamp}.json`;
    const responseFilePath = path.join(requestOutputDir, responseFilename);

    try {
        // XML 파일 존재 확인
        if (!fs.existsSync(xmlFilePath)) {
            console.error(`${colors.fg.red}❌ XML 파일이 존재하지 않습니다: ${xmlFilePath}${colors.reset}`);
            return;
        }

        // XML 파일 읽기
        const xmlContent = await fsPromises.readFile(xmlFilePath, 'utf8');
        console.log(`${colors.fg.green}✅ XML 내용 읽기 완료 (${xmlContent.length} bytes)${colors.reset}`);

        // 디버깅용 XML 파일 복사
        const debugXmlPath = path.join(requestOutputDir, `debug_request_${xmlFilename}`);
        await fsPromises.copyFile(xmlFilePath, debugXmlPath);
        console.log(`${colors.dim}📋 디버깅용 XML 파일 복사본 생성: ${debugXmlPath}${colors.reset}`);

        // EXI 프로세서 초기화
        console.log(`${colors.fg.blue}🔧 EXI 프로세서 초기화 중...${colors.reset}`);
        const exiProcessor = new ExiProcessor();
        exiProcessor.init();
        
        if (!exiProcessor.initialized) {
            throw new Error('EXI 프로세서 초기화 실패');
        }
        console.log(`${colors.fg.green}✅ EXI 프로세서 초기화 완료${colors.reset}`);

        // XML을 EXI로 인코딩
        console.log(`${colors.fg.blue}🔄 XML을 EXI로 인코딩 중...${colors.reset}`);
        let base64ExiData;
        
        try {
            // ExiProcessor를 사용하여 EXI 인코딩 (바이너리 데이터 직접 반환)
            const exiData = exiProcessor.encodeXML(xmlContent);
            
            if (!exiData) {
                throw new Error('EXI 인코딩 실패');
            }
            
            // 바이너리 데이터를 Base64로 변환
            base64ExiData = Buffer.from(exiData).toString('base64');
            console.log(`${colors.fg.green}✅ EXI 인코딩 완료, Base64 크기: ${base64ExiData.length}${colors.reset}`);
            
        } catch (error) {
            console.log(`${colors.fg.yellow}⚠️ EXI 인코딩 실패: ${error.message}${colors.reset}`);
            console.log(`${colors.fg.yellow}📄 원본 XML을 그대로 전송합니다.${colors.reset}`);
            
            // EXI 인코딩 실패 시 원본 XML을 Base64로 인코딩
            base64ExiData = Buffer.from(xmlContent, 'utf8').toString('base64');
            console.log(`${colors.fg.green}✅ XML을 Base64로 인코딩 완료, 크기: ${base64ExiData.length}${colors.reset}`);
        }

        // EXI 데이터를 파일로 저장 (디버깅용)
        const exiDebugFile = path.join(requestOutputDir, `debug_exi_data_${xmlFilename.replace('.xml', '')}.bin`);
        try {
            const exiDataBuffer = Buffer.from(base64ExiData, 'base64');
            await fsPromises.writeFile(exiDebugFile, exiDataBuffer);
            console.log(`${colors.fg.cyan}🔍 디버깅용 EXI 데이터 저장: ${exiDebugFile} (${exiDataBuffer.length} bytes)${colors.reset}`);
        } catch (error) {
            console.error(`${colors.fg.red}❌ EXI 데이터 파일 저장 실패: ${error.message}${colors.reset}`);
        }

        // 서버 요청용 데이터 준비 (제공받은 코드의 구조와 동일)
        const requestData = {
            iso15118SchemaVersion: 'urn:iso:std:iso:15118:-20:CommonMessages',
            action: action,
            exiRequest: base64ExiData
        };

        // 요청 데이터를 파일로 저장 (확인용)
        const requestDataFile = path.join(requestOutputDir, `request_data_${xmlFilename.replace('.xml', '')}_${action}.json`);
        try {
            await fsPromises.writeFile(requestDataFile, JSON.stringify(requestData, null, 2), 'utf8');
            console.log(`${colors.dim}📋 요청 데이터 파일 저장: ${requestDataFile}${colors.reset}`);
        } catch (error) {
            console.error(`${colors.fg.red}❌ 요청 데이터 파일 저장 실패: ${error.message}${colors.reset}`);
        }

        console.log(`${colors.fg.cyan}📤 서버에 요청 전송 중: ${url}${colors.reset}`);

        // node-fetch 동적 임포트 (fetch API 사용)
        let fetch;
        try {
            fetch = await import('node-fetch').then(mod => mod.default);
        } catch (error) {
            console.error(`${colors.fg.red}❌ node-fetch 라이브러리가 설치되지 않았습니다.${colors.reset}`);
            console.log("설치 명령어: npm install node-fetch");
            return;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
        });

        console.log(`${colors.fg.yellow}📊 서버 응답 상태 코드: ${response.status}${colors.reset}`);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`${colors.fg.red}❌ 서버 응답 오류 (${response.status}): ${errorBody}${colors.reset}`);
            throw new Error(`서버 요청 실패 (상태 코드: ${response.status})`);
        }

        // 응답 JSON 파싱
        const data = await response.json();
        console.log(`\n${colors.bright}=== 응답 결과 ===${colors.reset}`);

        // 응답 데이터를 파일로 저장 - 보낸 데이터와 받은 데이터를 하나의 JSON으로 저장
        const saveData = {
            timestamp: new Date().toISOString(),
            request: {
                xmlFile: xmlFilename,
                action: action,
                url: url,
                xmlContentLength: xmlContent.length,
                exiDataLength: base64ExiData.length,
                sentData: {
                    iso15118SchemaVersion: requestData.iso15118SchemaVersion,
                    action: requestData.action,
                    exiRequest: requestData.exiRequest
                }
            },
            response: {
                statusCode: response.status,
                headers: Object.fromEntries(response.headers),
                data: data
            }
        };

        await fsPromises.writeFile(responseFilePath, JSON.stringify(saveData, null, 2), 'utf8');
        console.log(`${colors.fg.green}✅ 응답 데이터 저장: ${responseFilePath}${colors.reset}`);

        // 응답 데이터 분석 및 출력
        console.log(`${colors.fg.cyan}📄 응답 데이터 분석:${colors.reset}`);
        
        // 서버 응답 상태 확인 (success 필드 또는 status 필드 기준)
        const isSuccess = data.success === true || 
                         data.status === 'Accepted' || 
                         data.status === 'OK' ||
                         (response.status >= 200 && response.status < 300);
        
        if (isSuccess) {
            console.log(`${colors.fg.green}✅ 요청 처리 성공${colors.reset}`);
            
            if (data.status) {
                console.log(`${colors.fg.blue}상태:${colors.reset} ${data.status}`);
            }
            
            if (data.result) {
                console.log(`${colors.fg.blue}결과:${colors.reset}`);
                if (typeof data.result === 'string') {
                    console.log(`  ${data.result.substring(0, 200)}${data.result.length > 200 ? '...' : ''}`);
                } else {
                    console.log(`  ${JSON.stringify(data.result, null, 2)}`);
                }
            }
            
            if (data.exiResponse && Array.isArray(data.exiResponse)) {
                console.log(`${colors.fg.blue}EXI 응답:${colors.reset} ${data.exiResponse.length} bytes 데이터 수신`);
            }
            
            if (data.message) {
                console.log(`${colors.fg.blue}메시지:${colors.reset} ${data.message}`);
            }
        } else {
            console.log(`${colors.fg.red}❌ 요청 처리 실패${colors.reset}`);
            
            if (data.error) {
                console.log(`${colors.fg.red}에러:${colors.reset} ${data.error}`);
            }
            
            if (data.details) {
                console.log(`${colors.fg.yellow}상세:${colors.reset} ${data.details}`);
            }
            
            if (data.status) {
                console.log(`${colors.fg.red}상태:${colors.reset} ${data.status}`);
            }
        }

        return data;

    } catch (error) {
        console.error(`${colors.fg.red}❌ 요청 처리 중 오류 발생: ${error.message}${colors.reset}`);
        process.exitCode = 1;
        return null;
    }
}

// 사용법 출력 함수
function printUsage() {
    console.log(`${colors.fg.cyan}📖 사용법:${colors.reset}`);
    console.log(`  node send-xml-exi.js [옵션]`);
    console.log();
    console.log(`${colors.fg.yellow}옵션:${colors.reset}`);
    console.log(`  -f, --file <파일명>     XML 파일명 (기본값: certificateInstallationReq_v20_ecdsa.xml)`);
    console.log(`  --action <액션>         액션 타입 (install|update, 기본값: install)`);
    console.log(`  --host <호스트>         서버 호스트 (기본값: localhost)`);
    console.log(`  --port <포트>           서버 포트 (기본값: 7600)`);
    console.log(`  -h, --help              이 도움말 출력`);
    console.log();
    console.log(`${colors.fg.cyan}예시:${colors.reset}`);
    console.log(`  node send-xml-exi.js`);
    console.log(`  node send-xml-exi.js --action update`);
    console.log(`  node send-xml-exi.js -f my_request.xml --action install`);
    console.log(`  node send-xml-exi.js --host 192.168.1.100 --port 8080`);
    console.log();
    console.log(`${colors.fg.yellow}사용 가능한 XML 파일들:${colors.reset}`);
    
    // out 폴더의 XML 파일 목록 출력
    const outDir = path.join(__dirname, '..', 'out');
    try {
        const files = fs.readdirSync(outDir).filter(file => file.endsWith('.xml'));
        files.forEach(file => {
            console.log(`  - ${file}`);
        });
    } catch (error) {
        console.log(`  ${colors.fg.red}out 폴더를 찾을 수 없습니다.${colors.reset}`);
    }
}

// 도움말 확인
const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
}

// 함수 실행
(async () => {
    try {
        const result = await sendISO15118_20CertRequestWithEXI();
        if (result) {
            console.log(`${colors.fg.green}🎉 요청 처리 성공적으로 완료!${colors.reset}`);
        } else {
            console.log(`${colors.fg.yellow}⚠️ 요청 처리 중 오류 발생 (상세 내용은 위 로그 참조).${colors.reset}`);
        }
        rl.close();
    } catch (error) {
        console.error(`${colors.fg.red}❌ 최종 요청 실패: ${error.message}${colors.reset}`);
        rl.close();
        process.exitCode = 1;
    }
})(); 