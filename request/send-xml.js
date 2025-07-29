#!/usr/bin/env node

/**
 * ISO 15118-20 XML 요청 전송 스크립트
 * out 폴더의 XML 파일을 읽어서 서버로 전송
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 색상 정의
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
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

// 메인 함수
async function main() {
// 명령줄 인자 처리
    let xmlFileName = process.argv[2];
const endpoint = process.argv[3] || 'certificateInstallation';
const hostname = process.argv[4] || 'localhost';
const port = parseInt(process.argv[5]) || 7600;

    // 파일명이 없으면 대화형 선택
if (!xmlFileName) {
        console.log(`${colors.fg.blue}🚀 ISO 15118-20 XML 요청 전송기${colors.reset}\n`);
    
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
            const input = await question(`${colors.fg.green}전송할 XML 파일을 선택하세요 (1-${xmlFiles.length}): ${colors.reset}`);
            const choice = parseInt(input);
            
            if (choice >= 1 && choice <= xmlFiles.length) {
                xmlFileName = xmlFiles[choice - 1];
                console.log(`${colors.fg.cyan}선택된 파일: ${xmlFileName}${colors.reset}\n`);
                break;
            } else {
                console.log(`${colors.fg.red}1-${xmlFiles.length} 사이의 숫자를 입력해주세요.${colors.reset}`);
            }
        }
    }

    // 기존 로직 계속...
    await sendXmlRequest(xmlFileName, endpoint, hostname, port);
    rl.close();
}

async function sendXmlRequest(xmlFileName, endpoint, hostname, port) {

    console.log(`${colors.fg.cyan}📤 전송 정보:${colors.reset}`);
    console.log(`  파일: ${xmlFileName}`);
    console.log(`  엔드포인트: ${endpoint}`);
    console.log(`  서버: ${hostname}:${port}\n`);

// XML 파일 경로 설정
const xmlFilePath = path.join(__dirname, '..', 'out', xmlFileName);

// XML 파일 존재 확인
if (!fs.existsSync(xmlFilePath)) {
    console.error(`${colors.fg.red}❌ XML 파일을 찾을 수 없습니다: ${xmlFilePath}${colors.reset}`);
    process.exit(1);
}

console.log(`${colors.fg.blue}🚀 XML 요청 전송 시작...${colors.reset}`);
console.log(`${colors.fg.gray}  📄 XML 파일: ${xmlFileName}${colors.reset}`);
console.log(`${colors.fg.gray}  🎯 엔드포인트: ${endpoint}${colors.reset}`);
console.log(`${colors.fg.gray}  🌐 서버: ${hostname}:${port}${colors.reset}`);

// XML 파일 읽기
let xmlContent;
try {
    xmlContent = fs.readFileSync(xmlFilePath, 'utf8');
    console.log(`${colors.fg.green}✅ XML 파일 읽기 성공 (${xmlContent.length} bytes)${colors.reset}`);
} catch (error) {
    console.error(`${colors.fg.red}❌ XML 파일 읽기 실패: ${error.message}${colors.reset}`);
    process.exit(1);
}

// 요청 데이터 준비
const postData = JSON.stringify({
    xmlContent: xmlContent,
    messageType: xmlFileName.includes('Req') ? 'request' : 'response',
    algorithm: xmlFileName.includes('ecdsa') ? 'ecdsa' : 
               xmlFileName.includes('ed448') ? 'ed448' : 'auto',
    version: xmlFileName.includes('v20') ? '20' : '2'
});

const requestPath = `/api/contract-cert/${endpoint}`;

const options = {
    hostname: hostname,
    port: port,
    path: requestPath,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log(`${colors.fg.cyan}📤 POST 요청 전송 중: http://${hostname}:${port}${requestPath}${colors.reset}`);

const req = http.request(options, (res) => {
    console.log(`${colors.fg.yellow}📊 상태 코드: ${res.statusCode}${colors.reset}`);
    console.log(`${colors.fg.gray}📋 응답 헤더:${colors.reset}`, res.headers);
    
    let responseData = '';
    
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        responseData += chunk;
    });
    
    res.on('end', () => {
        console.log(`\n${colors.bright}=== 응답 결과 ===${colors.reset}`);
        
        // 상태코드가 200이 아닌 경우 파일 저장하지 않음
        if (res.statusCode !== 200) {
            console.log(`${colors.fg.red}❌ 상태코드 ${res.statusCode}: 파일을 저장하지 않습니다.${colors.reset}`);
            console.log('응답 내용:', responseData);
            return;
        }
        
        // 날짜와 시간 포맷 생성 (YYYY-MM-DD_HH-mm-ss)
        const now = new Date();
        const timestamp = now.getFullYear() + '-' + 
                         String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                         String(now.getDate()).padStart(2, '0') + '_' + 
                         String(now.getHours()).padStart(2, '0') + '-' + 
                         String(now.getMinutes()).padStart(2, '0') + '-' + 
                         String(now.getSeconds()).padStart(2, '0');
        
        // output 폴더 생성
        const outputDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // 파일명 생성 (XML 파일명 기반)
        const baseFileName = path.parse(xmlFileName).name;
        const filename = `${baseFileName}_${endpoint}_${timestamp}.json`;
        const filepath = path.join(outputDir, filename);
        
        try {
            const jsonData = JSON.parse(responseData);
            
            // 파일에 저장할 데이터 준비 - 보낸 데이터와 받은 데이터를 하나의 JSON으로 저장
            const saveData = {
                timestamp: now.toISOString(),
                request: {
                    xmlFile: xmlFileName,
                    endpoint: endpoint,
                    url: `http://${hostname}:${port}${requestPath}`,
                    xmlContentLength: xmlContent.length,
                    sentData: {
                        xmlContent: xmlContent,
                        messageType: messageType,
                        algorithm: algorithm,
                        version: version
                    }
                },
                response: {
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: jsonData
                }
            };
            
            // 파일에 저장
            fs.writeFileSync(filepath, JSON.stringify(saveData, null, 2), 'utf8');
            console.log(`${colors.fg.green}✅ 결과가 파일에 저장되었습니다: ${filepath}${colors.reset}`);
            
            // 응답 데이터 분석 및 출력
            console.log(`${colors.fg.cyan}📄 응답 데이터 분석:${colors.reset}`);
            
            if (jsonData.success) {
                console.log(`${colors.fg.green}✅ 요청 처리 성공${colors.reset}`);
                
                if (jsonData.result) {
                    console.log(`${colors.fg.blue}결과:${colors.reset}`);
                    if (typeof jsonData.result === 'string') {
                        console.log(`  ${jsonData.result.substring(0, 200)}${jsonData.result.length > 200 ? '...' : ''}`);
                    } else {
                        console.log(`  ${JSON.stringify(jsonData.result, null, 2)}`);
                    }
                }
                
                if (jsonData.message) {
                    console.log(`${colors.fg.blue}메시지:${colors.reset} ${jsonData.message}`);
                }
            } else {
                console.log(`${colors.fg.red}❌ 요청 처리 실패${colors.reset}`);
                
                if (jsonData.error) {
                    console.log(`${colors.fg.red}에러:${colors.reset} ${jsonData.error}`);
                }
                
                if (jsonData.details) {
                    console.log(`${colors.fg.yellow}상세:${colors.reset} ${jsonData.details}`);
                }
            }
            
            // 추가 정보가 있는 경우
            if (jsonData.validation) {
                console.log(`${colors.fg.magenta}검증 결과:${colors.reset}`);
                console.log(`  유효성: ${jsonData.validation.isValid ? '✅ 유효' : '❌ 무효'}`);
                if (jsonData.validation.errors) {
                    console.log(`  오류: ${jsonData.validation.errors.join(', ')}`);
                }
            }
            
        } catch (e) {
            console.log(`${colors.fg.yellow}⚠️ JSON 파싱 실패. 원본 응답:${colors.reset}`);
            console.log(responseData);
            
            // JSON 파싱 실패시에도 파일 저장 - 보낸 데이터와 받은 데이터를 하나의 JSON으로 저장
            const saveData = {
                timestamp: now.toISOString(),
                request: {
                    xmlFile: xmlFileName,
                    endpoint: endpoint,
                    url: `http://${hostname}:${port}${requestPath}`,
                    xmlContentLength: xmlContent.length,
                    sentData: {
                        xmlContent: xmlContent,
                        messageType: messageType,
                        algorithm: algorithm,
                        version: version
                    }
                },
                response: {
                    statusCode: res.statusCode,
                    headers: res.headers,
                    rawResponse: responseData,
                    error: 'JSON 파싱 실패'
                }
            };
            
            fs.writeFileSync(filepath, JSON.stringify(saveData, null, 2), 'utf8');
            console.log(`${colors.fg.green}✅ 원본 응답이 파일에 저장되었습니다: ${filepath}${colors.reset}`);
        }
    });
});

req.on('error', (e) => {
    console.error(`${colors.fg.red}❌ 요청 에러: ${e.message}${colors.reset}`);
});

// XML 데이터 전송
req.write(postData);
req.end(); 
}

main(); 