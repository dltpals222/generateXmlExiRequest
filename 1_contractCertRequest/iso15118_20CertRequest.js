const fsPromises = require('fs').promises; // Use promises API
const fs = require('fs'); // Keep sync API for existsSync if needed
const { spawn } = require('child_process'); // Change to spawn
const path = require('path');

// ANSI 색상 코드 정의 (generateCertRequestXmlInstallVersion20.js 와 동일하게 유지)
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
    }
};

// --- EXIConverter 클래스 정의 시작 ---
const JAR_PATH = path.join(__dirname, 'V2Gdecoder.jar');

class EXIConverter {
    async encodeToEXI(xmlString) {
        const tempXmlFile = path.join(__dirname, 'temp.xml');
        const tempExiFile = path.join(__dirname, 'temp.xml.exi');
        
        try {
            // 입력 XML 검증 및 로깅
            console.log(`${colors.dim}Input XML length: ${xmlString?.length}${colors.reset}`);
            if (!xmlString || xmlString.trim() === '') {
                throw new Error('Empty XML input');
            }

            // XML 파일 쓰기 전 로깅
            console.log(`${colors.dim}Writing XML to temp file: ${tempXmlFile}${colors.reset}`);
            await fsPromises.writeFile(tempXmlFile, xmlString);
            
            // 파일이 제대로 써졌는지 확인
            const writtenXml = await fsPromises.readFile(tempXmlFile, 'utf8');
            console.log(`${colors.dim}Written XML length: ${writtenXml.length}${colors.reset}`);

            let executeJavaCommandArgs = [
                '-jar', JAR_PATH,
                '-x',
                '-f', tempXmlFile,
                '-o', tempExiFile
            ];

            // Java 명령어 실행
            console.log(`${colors.fg.blue}Executing Java command for EXI encoding...${colors.reset}`);
            await this.executeJavaCommand(executeJavaCommandArgs);
            
            // EXI 파일 읽기 전 존재 여부 확인
            const exiExists = await fsPromises.access(tempExiFile)
                .then(() => true)
                .catch(() => false);
            console.log(`${colors.dim}EXI file exists: ${exiExists}${colors.reset}`);

            // EXI 파일 읽기
            console.log(`${colors.dim}Reading EXI file...${colors.reset}`);
            const exiData = await fsPromises.readFile(tempExiFile);
            console.log(`${colors.dim}EXI data length: ${exiData.length}${colors.reset}`);

            // EXI 헤더 수정
            const modifiedExiData = Buffer.from(exiData);
            modifiedExiData[2] = modifiedExiData[2] & 0b11111011;
            console.log(`${colors.fg.cyan}EXI 헤더 수정됨: ${modifiedExiData[2].toString(2).padStart(8, '0')}${colors.reset}`);
            
            // 헤더 디버깅 정보 출력
            console.log(`${colors.fg.cyan}EXI 헤더 분석:${colors.reset}`);
            if (modifiedExiData.length >= 3) {
              console.log(`${colors.dim}  - 첫 번째 바이트 (비트맵): ${modifiedExiData[0].toString(2).padStart(8, '0')}${colors.reset}`);
              console.log(`${colors.dim}  - 두 번째 바이트: ${modifiedExiData[1].toString(16).padStart(2, '0')}${colors.reset}`);
              console.log(`${colors.dim}  - 세 번째 바이트 (수정됨): ${modifiedExiData[2].toString(16).padStart(2, '0')}${colors.reset}`);
            }
            
            // Base64 변환 및 결과 확인
            const base64Result = modifiedExiData.toString('base64');
            console.log(`${colors.fg.green}Base64 result length: ${base64Result.length}${colors.reset}`);

            if (!base64Result || base64Result.trim() === '') {
                throw new Error('Empty EXI result after encoding');
            }

            return base64Result;
            
        } catch (error) {
            console.error(`${colors.fg.red}Error in encodeToEXI: ${error.message}${colors.reset}`);
            throw error;
        } finally {
            // 임시 파일이 존재할 경우에만 삭제 시도
            try {
                const xmlExists = await fsPromises.access(tempXmlFile)
                    .then(() => true)
                    .catch(() => false);
                    
                const exiExists = await fsPromises.access(tempExiFile)
                    .then(() => true)
                    .catch(() => false);

                if (xmlExists) {
                    await fsPromises.unlink(tempXmlFile);
                    console.log(`${colors.dim}Temp XML file deleted${colors.reset}`);
                }
                
                if (exiExists) {
                    await fsPromises.unlink(tempExiFile);
                    console.log(`${colors.dim}Temp EXI file deleted${colors.reset}`);
                }
            } catch (err) {
                console.error(`${colors.fg.yellow}Error during cleanup: ${err.message}${colors.reset}`);
            }
        }
    }

    async decodeFromEXI(base64String) {
        const tempExiFile = path.join(__dirname, 'temp.exi');
        const tempXmlFile = path.join(__dirname, 'temp.exi.xml');
        
        try {
            const exiData = Buffer.from(base64String, 'base64');
            await fsPromises.writeFile(tempExiFile, exiData);
            
            await this.executeJavaCommand([
                '-jar', JAR_PATH,
                '-e',
                '-f', tempExiFile,
                '-o', tempXmlFile
            ]);
            
            return await fsPromises.readFile(tempXmlFile, 'utf8');
            
        } finally {
            await fsPromises.unlink(tempExiFile).catch(() => {});
            await fsPromises.unlink(tempXmlFile).catch(() => {});
        }
    }

    executeJavaCommand(args) {
        return new Promise((resolve, reject) => {
            const java = spawn('java', args);
            let output = '';
            let error = '';
    
            console.log(`${colors.dim}Java command: java ${args.join(' ')}${colors.reset}`);
    
            java.stdout.on('data', (data) => {
                const message = data.toString();
                console.log(`${colors.dim}Java stdout: ${message}${colors.reset}`);
                output += message;
            });
    
            java.stderr.on('data', (data) => {
                const message = data.toString();
                console.error(`${colors.fg.yellow}Java stderr: ${message}${colors.reset}`);
                error += message;
            });
    
            java.on('error', (err) => {
                console.error(`${colors.fg.red}Java process error: ${err}${colors.reset}`);
                reject(err);
            });
    
            java.on('close', (code) => {
                console.log(`${colors.dim}Java process exit code: ${code}${colors.reset}`);
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`${colors.fg.red}Java execution failed (code: ${code}): ${error}${colors.reset}`));
                }
            });
        });
    }
}
// --- EXIConverter 클래스 정의 끝 ---

// 인스턴스 생성
const exiConverter = new EXIConverter();

/**
 * 디렉토리 생성 함수 (없을 경우에만 생성)
 * @param {string} dirPath - 생성할 디렉토리 경로
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`디렉토리 생성됨: ${dirPath}`);
  }
}

/**
 * ISO15118-20 인증서 요청을 보내는 함수
 * @param {string} action - 액션 타입 ('install' 또는 'update')
 */
async function sendISO15118_20CertRequest(action = 'install') {
  // TODO: 서버 URL이 ISO 15118-20용으로 다를 수 있음. 확인 필요.
  const url = 'http://localhost:7600/api/contract-cert/ISO15118CertReq';
  const outDir = path.join(__dirname, 'out'); // 출력 디렉토리
  ensureDirectoryExists(outDir);

  // ISO 15118-20 결과 XML 파일 경로
  const xmlFilePath = path.join(__dirname, 'out', 'certificateInstallationReq_20.xml');
  // 응답 저장 파일 경로
  const responseFilePath = path.join(outDir, 'response_20.json');

  try {
    // 액션 값 검증
    if (action !== 'install' && action !== 'update') {
      console.warn(`${colors.fg.yellow}유효하지 않은 액션입니다. "install" 또는 "update"만 사용 가능합니다. 기본값 "install" 사용.${colors.reset}`);
      action = 'install';
    }

    // XML 파일 존재 확인
    if (!fs.existsSync(xmlFilePath)) {
      console.error(`${colors.fg.red}XML 파일이 존재하지 않습니다: ${xmlFilePath}${colors.reset}`);
      console.log(`먼저 node generateCertRequestXmlInstallVersion20.js 를 실행하여 파일을 생성해주세요.`);
      return; // Exit if file not found
    }

    // XML 파일 읽기
    const xmlContent = await fsPromises.readFile(xmlFilePath, 'utf8');
    console.log(`${colors.dim}XML 내용 읽기 완료 (${xmlFilePath})${colors.reset}`);

    // 작업 폴더에 임시 XML 파일 복사 (디버깅 용도로 보존)
    const debugXmlPath = path.join(outDir, 'debug_request_20.xml');
    await fsPromises.copyFile(xmlFilePath, debugXmlPath);
    console.log(`${colors.dim}디버깅을 위한 XML 파일 복사본 생성: ${debugXmlPath}${colors.reset}`);

    // XML을 EXI로 인코딩
    console.log(`${colors.fg.blue}EXI 인코딩 시작...${colors.reset}`);
    const base64ExiData = await exiConverter.encodeToEXI(xmlContent);
    console.log(`${colors.fg.green}EXI 인코딩 완료, Base64 데이터 크기: ${base64ExiData.length}${colors.reset}`);

    // EXI 데이터를 파일로 저장 (디버깅용)
    const exiDebugFile = path.join(outDir, 'debug_exi_data_20.bin');
    try {
      const exiDataBuffer = Buffer.from(base64ExiData, 'base64');
      await fsPromises.writeFile(exiDebugFile, exiDataBuffer);
      console.log(`${colors.fg.cyan}디버깅용 EXI 데이터가 저장됨: ${exiDebugFile} (${exiDataBuffer.length} 바이트)${colors.reset}`);
    } catch (error) {
      console.error(`${colors.fg.red}EXI 데이터 파일 저장 실패: ${error.message}${colors.reset}`);
    }

    // 서버 요청용 데이터를 파일로도 저장 (확인용)
    const requestDataFile = path.join(outDir, 'request_data_20.json');
    const requestData = {
      iso15118SchemaVersion: 'urn:iso:std:iso:15118:-20:CommonMessages',
      action: action,
      exiRequest: base64ExiData
    };
    
    try {
      await fsPromises.writeFile(requestDataFile, JSON.stringify(requestData, null, 2), 'utf8');
      console.log(`${colors.dim}요청 데이터가 파일로 저장됨: ${requestDataFile}${colors.reset}`);
    } catch (error) {
      console.error(`${colors.fg.red}요청 데이터 파일 저장 실패: ${error.message}${colors.reset}`);
    }

    console.log(`${colors.dim}요청 데이터 준비 완료 (action: ${action})${colors.reset}`);
    console.log(`${colors.fg.blue}서버에 요청 전송 중: ${url}${colors.reset}`);

    // node-fetch 동적 임포트
    const fetch = await import('node-fetch').then(mod => mod.default);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    console.log(`${colors.dim}서버 응답 상태 코드: ${response.status}${colors.reset}`);

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`${colors.fg.red}서버 응답 오류 (${response.status}): ${errorBody}${colors.reset}`);
        throw new Error(`서버 요청 실패 (상태 코드: ${response.status})`);
    }

    // 응답 JSON 파싱
    const data = await response.json();
    console.log(`${colors.dim}응답 데이터 (JSON 파싱됨):${colors.reset}`, JSON.stringify(data, null, 2));

    // 응답 데이터를 파일로 저장
    await fsPromises.writeFile(responseFilePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`${colors.fg.green}응답 데이터가 다음 위치에 저장되었습니다: ${responseFilePath}${colors.reset}`);

    return data;

  } catch (error) {
    console.error(`${colors.fg.red}요청 처리 중 오류 발생 in sendISO15118_20CertRequest: ${error.message}${colors.reset}`);
    process.exitCode = 1;
  }
}

// 함수 실행 (인자로 'install' 또는 'update' 전달 가능)
const actionArg = process.argv[2] === 'update' ? 'update' : 'install';
console.log(`${colors.fg.blue}실행 액션: ${actionArg}${colors.reset}`);

(async () => {
    try {
        // node-fetch 존재 확인 (선택적)
        require.resolve('node-fetch');
    } catch (e) {
        console.error(`${colors.fg.red}오류: node-fetch 라이브러리가 설치되지 않았습니다.${colors.reset}`);
        console.log("설치 명령어: npm install node-fetch");
        process.exit(1);
    }
    try {
        const result = await sendISO15118_20CertRequest(actionArg);
        if (result) {
            console.log(`${colors.fg.green}요청 처리 성공적으로 완료!${colors.reset}`);
        } else {
            console.log(`${colors.fg.yellow}요청 처리 중 오류 발생 (상세 내용은 위 로그 참조).${colors.reset}`);
        }
    } catch (error) {
        console.error(`${colors.fg.red}최종 요청 실패: ${error.message}${colors.reset}`);
        process.exitCode = 1;
    }
})(); 