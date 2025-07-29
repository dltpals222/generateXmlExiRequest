/**
 * ISO 15118-20 인증서 관련 요청 (CertificateInstallationReq, CertificateUpdateReq 등)을
 * 지정된 XML 파일 내용을 사용하여 서버로 전송하는 스크립트입니다.
 * 이 스크립트는 exi_processor.jar를 사용하여 XML을 EXI로 인코딩한 후 Base64로 인코딩하여 전송합니다.
 *
 * [실행 방법]
 * node iso15118_20CertRequest.js [옵션]
 *
 * [옵션]
 * -f <파일명>, --file <파일명>
 *   설명: 요청에 사용할 XML 파일의 이름을 지정합니다.
 *        이 파일은 반드시 'out' 디렉토리 내에 위치해야 합니다.
 *   기본값: 'certificateInstallationReq_20.xml'
 *
 * --action <액션>
 *   설명: 서버에 요청할 액션을 지정합니다. ('install' 또는 'update')
 *   기본값: 'install'
 *
 * [실행 예시]
 * 1. 기본값으로 실행 (install 액션, out/certificateInstallationReq_20.xml 파일 사용):
 *    node iso15118_20CertRequest.js
 *
 * 2. 'update' 액션으로 실행 (out/certificateInstallationReq_20.xml 파일 사용):
 *    node iso15118_20CertRequest.js --action update
 *
 * 3. 특정 XML 파일 사용 (install 액션):
 *    node iso15118_20CertRequest.js --file my_request.xml
 *    node iso15118_20CertRequest.js -f my_request.xml
 *
 * 4. 특정 XML 파일과 'update' 액션 사용:
 *    node iso15118_20CertRequest.js --file my_request.xml --action update
 *    node iso15118_20CertRequest.js --action update -f my_request.xml (옵션 순서 무관)
 *
 * [주의사항]
 * - 지정된 XML 파일이 'out' 디렉토리에 존재해야 합니다.
 * - 요청을 받을 서버 (기본 설정: http://localhost:7600)가 실행 중이어야 합니다.
 * - 'node-fetch' 라이브러리가 필요합니다 (`npm install node-fetch`).
 */
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

// 새로운 EXI 프로세서 사용
const ExiProcessor = require('./exiProcessor');

// EXI 프로세서 인스턴스 생성
const exiProcessor = new ExiProcessor();

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
async function sendISO15118_20CertRequest() {
  // 기본값 설정
  let action = 'install';
  let xmlFilename = 'certificateInstallationReq_20.xml';

  // 인수 파싱 로직
  const args = process.argv.slice(2); // 실행 경로와 스크립트 이름 제외
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-f' || args[i] === '--file') && i + 1 < args.length) {
      xmlFilename = args[i + 1];
      i++; // 값까지 건너뛰기
      console.log(`${colors.dim}  [Arg Parse] 파일명 인수로 설정: ${xmlFilename}${colors.reset}`);
    } else if (args[i] === '--action' && i + 1 < args.length) {
      const potentialAction = args[i + 1].toLowerCase();
      if (potentialAction === 'install' || potentialAction === 'update') {
          action = potentialAction;
          console.log(`${colors.dim}  [Arg Parse] 액션 인수로 설정: ${action}${colors.reset}`);
      } else {
          console.warn(`${colors.fg.yellow}  [Arg Parse] 경고: 유효하지 않은 액션 값입니다 (${args[i + 1]}). 기본값 'install' 사용.${colors.reset}`);
      }
      i++; // 값까지 건너뛰기
    }
  }

  console.log(`${colors.fg.blue}최종 설정 - 액션: ${action}, 파일명: ${xmlFilename}${colors.reset}`);

  const url = 'http://localhost:7600/api/contract-cert/ISO15118CertReq';
  const outDir = path.join(__dirname, 'out');
  ensureDirectoryExists(outDir);

  // 최종 XML 파일 경로 설정 (파싱 결과 또는 기본값 사용)
  const xmlFilePath = path.join(outDir, xmlFilename);

  // 응답 저장 파일 경로 (파일명에 타임스탬프 추가하여 구분 용이하게 변경)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const responseFilename = `response_20_${xmlFilename.replace('.xml', '')}_${action}_${timestamp}.json`;
  const responseFilePath = path.join(outDir, responseFilename);

  try {
    // 액션 값은 파싱 결과를 사용
    console.log(`${colors.fg.blue}실행 액션: ${action}${colors.reset}`);

    // XML 파일 존재 확인
    if (!fs.existsSync(xmlFilePath)) {
      console.error(`${colors.fg.red}XML 파일이 존재하지 않습니다: ${xmlFilePath}${colors.reset}`);
      return; // Exit if file not found
    }

    // XML 파일 읽기
    const xmlContent = await fsPromises.readFile(xmlFilePath, 'utf8');
    console.log(`${colors.dim}XML 내용 읽기 완료 (${xmlFilePath})${colors.reset}`);

    // 작업 폴더에 임시 XML 파일 복사 (디버깅 용도로 보존, 입력 파일명 기반으로 변경)
    const debugXmlPath = path.join(outDir, `debug_request_${xmlFilename}`);
    await fsPromises.copyFile(xmlFilePath, debugXmlPath);
    console.log(`${colors.dim}디버깅을 위한 XML 파일 복사본 생성: ${debugXmlPath}${colors.reset}`);

    // EXI 프로세서 초기화
    console.log(`${colors.fg.blue}EXI 프로세서 초기화 중...${colors.reset}`);
    exiProcessor.init();
    
    if (!exiProcessor.initialized) {
      throw new Error('EXI 프로세서 초기화 실패');
    }
    console.log(`${colors.fg.green}EXI 프로세서 초기화 완료${colors.reset}`);

    // XML을 EXI로 인코딩 (네임스페이스 문제 해결을 위해 간단한 방식 사용)
    console.log(`${colors.fg.blue}XML을 EXI로 인코딩 중...${colors.reset}`);
    let exiData;
    try {
      // 스키마 없이 시도 (가장 간단한 방식)
      exiData = await exiProcessor.encodeToEXI(xmlContent, null, false, 'full_xml');
      console.log(`${colors.fg.green}EXI 인코딩 완료 (스키마 없이), 데이터 크기: ${exiData.length}${colors.reset}`);
    } catch (error) {
      console.log(`${colors.fg.yellow}EXI 인코딩 실패: ${error.message}${colors.reset}`);
      console.log(`${colors.fg.yellow}원본 XML을 그대로 전송합니다.${colors.reset}`);
      // EXI 인코딩 실패 시 원본 XML을 Base64로 인코딩
      exiData = Buffer.from(xmlContent, 'utf8').toString('base64');
      console.log(`${colors.fg.green}XML을 Base64로 인코딩 완료, 크기: ${exiData.length}${colors.reset}`);
    }

    // EXI 데이터를 Base64로 변환
    let base64ExiData;
    if (typeof exiData === 'string' && exiData.includes(',')) {
      // 문자열 형태의 바이트 배열인 경우 (예: "-128,31,112,7,...")
      console.log(`${colors.fg.blue}바이트 배열 문자열을 Base64로 변환 중...${colors.reset}`);
      const byteArray = exiData.split(',').map(byte => parseInt(byte.trim()));
      const buffer = Buffer.from(byteArray);
      base64ExiData = buffer.toString('base64');
      console.log(`${colors.fg.green}Base64 변환 완료, 크기: ${base64ExiData.length}${colors.reset}`);
    } else {
      // 이미 Base64 형태이거나 다른 형태인 경우
      base64ExiData = exiData;
    }

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
      iso15118SchemaVersion: 'urn:iso:std:iso:15118:-20:CommonMessages', // 스키마 버전은 유지 (서버에서 필요할 수 있음)
      action: action, // 파싱된 액션 사용
      exiRequest: base64ExiData // EXI 인코딩된 Base64 데이터
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

// 함수 실행 (인수 처리는 함수 내부에서 수행)
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
        // sendISO15118_20CertRequest 함수는 이제 인수를 받지 않음
        const result = await sendISO15118_20CertRequest();
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