const fsPromises = require('fs').promises; // Use promises API
const fs = require('fs'); // Keep sync API for existsSync if needed
const { spawn } = require('child_process'); // Change to spawn
const path = require('path');

// --- EXIConverter 클래스 정의 시작 ---
const JAR_PATH = path.join(__dirname, 'V2Gdecoder.jar');

class EXIConverter {
    async encodeToEXI(xmlString) {
        const tempXmlFile = path.join(__dirname, 'temp_encode.xml'); // Use distinct names
        const tempExiFile = path.join(__dirname, 'temp_encode.xml.exi'); // Use distinct names
        
        try {
            // 입력 XML 검증 및 로깅
            console.log('Input XML length:', xmlString?.length);
            if (!xmlString || xmlString.trim() === '') {
                throw new Error('Empty XML input');
            }

            // XML 파일 쓰기 전 로깅
            console.log('Writing XML to temp file:', tempXmlFile);
            await fsPromises.writeFile(tempXmlFile, xmlString);
            
            // 파일이 제대로 써졌는지 확인
            const writtenXml = await fsPromises.readFile(tempXmlFile, 'utf8');
            console.log('Written XML length:', writtenXml.length);

            let executeJavaCommandArgs = [
                '-jar', JAR_PATH,
                '-x', // Use -x for XML to EXI based on the example
                '-f', tempXmlFile,
                '-o', tempExiFile
            ];

            // Java 명령어 실행
            console.log('Executing Java command for EXI encoding...');
            await this.executeJavaCommand(executeJavaCommandArgs);
            
            // EXI 파일 읽기 전 존재 여부 확인
            const exiExists = await fsPromises.access(tempExiFile)
                .then(() => true)
                .catch(() => false);
            console.log('EXI file exists:', exiExists);
            if (!exiExists) {
                throw new Error(`EXI encoding failed, output file not found: ${tempExiFile}`);
            }

            // EXI 파일 읽기
            console.log('Reading EXI file...');
            const exiData = await fsPromises.readFile(tempExiFile);
            console.log('EXI data length:', exiData.length);

            // EXI 헤더 수정 (Optional, keep if needed)
            const modifiedExiData = Buffer.from(exiData);
            if (modifiedExiData.length > 2) { // Ensure buffer is long enough
               modifiedExiData[2] = modifiedExiData[2] & 0b11111011;
               console.log('Applied EXI header modification.');
            } else {
               console.warn('EXI data too short for header modification.');
            }
            
            // Base64 변환 및 결과 확인
            const base64Result = modifiedExiData.toString('base64');
            console.log('Base64 result length:', base64Result.length);

            if (!base64Result || base64Result.trim() === '') {
                throw new Error('Empty EXI result after encoding');
            }

            return base64Result;
            
        } catch (error) {
            console.error('Error in encodeToEXI:', error);
            throw error; // Re-throw the error to be caught by the caller
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
                    console.log('Temp XML file deleted');
                }
                
                if (exiExists) {
                    await fsPromises.unlink(tempExiFile);
                    console.log('Temp EXI file deleted');
                }
            } catch (err) {
                console.error('Error during cleanup:', err);
            }
        }
    }

    // decodeFromEXI method can be kept if needed, but not used in this script
    // async decodeFromEXI(base64String) { ... }

    executeJavaCommand(args) {
        return new Promise((resolve, reject) => {
            const java = spawn('java', args);
            let output = '';
            let error = '';
    
            console.log('Java command:', 'java', args.join(' '));
    
            java.stdout.on('data', (data) => {
                const message = data.toString();
                console.log('Java stdout:', message);
                output += message;
            });
    
            java.stderr.on('data', (data) => {
                const message = data.toString();
                console.error('Java stderr:', message); // Log stderr as error
                error += message;
            });
    
            java.on('error', (err) => { // Handle process spawn errors
                console.error('Java process spawn error:', err);
                reject(new Error(`Failed to start Java process: ${err.message}`));
            });
    
            java.on('close', (code) => {
                console.log('Java process exit code:', code);
                if (code === 0) {
                    resolve(output);
                } else {
                    // Provide more context in the rejection error
                    reject(new Error(`Java execution failed (code: ${code}). Stderr: ${error || 'No stderr output'}. Stdout: ${output || 'No stdout output'}`));
                }
            });
        });
    }
}
// --- EXIConverter 클래스 정의 끝 ---

// Instantiate the converter
const exiConverter = new EXIConverter();

/**
 * 디렉토리 생성 함수 (없을 경우에만 생성) - Keep using fs.existsSync for simplicity here
 * @param {string} dirPath - 생성할 디렉토리 경로
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`디렉토리 생성됨: ${dirPath}`);
  }
}

/**
 * ISO15118 인증서 요청을 보내는 함수
 * @param {string} action - 액션 타입 ('install' 또는 'update')
 */
async function sendISO15118CertRequest(action = 'install') {
  const url = 'http://localhost:7600/api/contract-cert/ISO15118CertReq';
  const outDir = path.join(__dirname, 'out'); // Define outDir earlier
  ensureDirectoryExists(outDir); // Ensure outDir exists

  try {
    // 액션 값 검증
    if (action !== 'install' && action !== 'update') {
      console.warn('유효하지 않은 액션입니다. "install" 또는 "update"만 사용 가능합니다. 기본값 "install" 사용.');
      action = 'install'; // 기본값으로 설정
    }
    
    // XML 파일 읽기 (이 파일은 미리 contractCertRequest 폴더에 생성해야 합니다)
    const xmlFilePath = path.join(__dirname, 'certRequest.xml');
    
    if (!fs.existsSync(xmlFilePath)) { // Use sync here for simplicity before async operations
      console.error('XML 파일이 존재하지 않습니다:', xmlFilePath);
      console.log('certRequest.xml 파일을 contractCertRequest 폴더에 생성해주세요.');
      return; // Exit if file not found
    }
    
    // Use promises API for reading file content
    const xmlContent = await fsPromises.readFile(xmlFilePath, 'utf8');
    console.log('XML 내용 읽기 완료');
    
    // XML을 EXI로 인코딩 (Use the converter)
    console.log('EXI 인코딩 시작...');
    const base64ExiData = await exiConverter.encodeToEXI(xmlContent);
    console.log('EXI 인코딩 완료, Base64 데이터 크기:', base64ExiData.length);
    
    // 요청 데이터 
    const requestData = {
      iso15118SchemaVersion: 'urn:iso:15118:2:2013:MsgDef', // 스키마 버전
      // iso15118SchemaVersion: 'urn:iso:15118:20:2022:MsgDef', // 스키마 버전 (Alternate)
      action: action, // 'install' 또는 'update'
      exiRequest: base64ExiData // Use the base64 result directly
    };

    console.log(`요청 데이터 준비 완료 (action: ${action})`);
    console.log('서버에 요청 전송 중:', url);

    // Use dynamic import for node-fetch
    const fetch = await import('node-fetch').then(mod => mod.default);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    console.log('서버 응답 상태 코드:', response.status);

    if (!response.ok) {
        // Handle non-successful responses
        const errorBody = await response.text();
        console.error(`서버 응답 오류 (${response.status}): ${errorBody}`);
        throw new Error(`서버 요청 실패 (상태 코드: ${response.status})`);
    }

    // Assuming the response is JSON
    const data = await response.json();
    console.log('응답 데이터 (JSON 파싱됨):', JSON.stringify(data, null, 2)); // Pretty print JSON
    
    // 응답 데이터를 파일로 저장
    const responseFilePath = path.join(outDir, 'response.json');
    await fsPromises.writeFile(responseFilePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`응답 데이터가 다음 위치에 저장되었습니다: ${responseFilePath}`);
    
    return data;

  } catch (error) {
    // Log the specific error that occurred
    console.error(`요청 처리 중 오류 발생 in sendISO15118CertRequest: ${error.message}`);
    // Optionally log the stack trace for more details
    // console.error(error.stack); 
    
    // Re-throw or handle as needed. Here, we just log and let the caller handle it.
    // throw error; // Uncomment if the caller needs to catch this specific error
    
    // Indicate failure to the caller of the main script
    process.exitCode = 1; // Set exit code to indicate failure
  }
}

// 함수 실행 (인자로 'install' 또는 'update' 전달 가능)
const actionArg = process.argv[2] === 'update' ? 'update' : 'install'; // Get action from command line arg or default to install
console.log(`실행 액션: ${actionArg}`);

sendISO15118CertRequest(actionArg)
  .then(result => {
    if (result) { // Check if the function returned data (i.e., didn't fail early)
      console.log('요청 처리 성공적으로 완료!');
    } else {
      console.log('요청 처리 중 오류 발생 (상세 내용은 위 로그 참조).');
    }
  })
  .catch(error => {
    // This catch block might not be reached if the error is handled inside sendISO15118CertRequest
    // and not re-thrown, but it's good practice to have it.
    console.error('최종 요청 실패:', error.message);
    process.exitCode = 1; // Ensure exit code reflects failure
  }); 