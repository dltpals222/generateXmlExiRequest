const http = require('http');
const fs = require('fs');
const path = require('path');

// 명령줄 인자에서 엔드포인트를 가져오거나 기본값 사용
const endpoint = process.argv[2] || 'testCreateHeader20';
const hostname = 'localhost';
const port = 7600;
const requestPath = `/api/contract-cert/${endpoint}`;

const postData = JSON.stringify({});

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

console.log(`POST 요청 전송 중: http://${hostname}:${port}${requestPath}`);

const req = http.request(options, (res) => {
  console.log(`상태 코드: ${res.statusCode}`);
  console.log(`응답 헤더:`, res.headers);
  
  let responseData = '';
  
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    console.log('\n=== 응답 결과 ===');
    
    // 상태코드가 200이 아닌 경우 파일 저장하지 않음
    if (res.statusCode !== 200) {
      console.log(`❌ 상태코드 ${res.statusCode}: 파일을 저장하지 않습니다.`);
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
    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 파일명 생성
    const filename = `${endpoint}_${timestamp}.json`;
    const filepath = path.join(outputDir, filename);
    
    try {
      const jsonData = JSON.parse(responseData);
      
      // 파일에 저장할 데이터 준비
      const saveData = {
        timestamp: now.toISOString(),
        endpoint: endpoint,
        url: `http://${hostname}:${port}${requestPath}`,
        statusCode: res.statusCode,
        headers: res.headers,
        responseData: jsonData
      };
      
      // 파일에 저장
      fs.writeFileSync(filepath, JSON.stringify(saveData, null, 2), 'utf8');
      console.log(`✅ 결과가 파일에 저장되었습니다: ${filepath}`);
      
      if (jsonData.results && Array.isArray(jsonData.results)) {
        console.log(`총 ${jsonData.results.length}개의 테스트 케이스 결과:`);
        console.log('─'.repeat(80));
        
        jsonData.results.forEach((result, index) => {
          console.log(`\n[${index + 1}] 테스트 케이스: ${result.testCase}`);
          console.log(`    세션 ID: ${result.sessionId}`);
          console.log(`    성공 여부: ${result.success ? '✅ 성공' : '❌ 실패'}`);
          
          if (result.success && result.xml) {
            console.log(`    생성된 XML: ${result.xml.substring(0, 100)}${result.xml.length > 100 ? '...' : ''}`);
          }
          
          if (result.error) {
            console.log(`    에러: ${result.error}`);
          }
        });
      } else {
        console.log('원본 응답:', responseData);
      }
    } catch (e) {
      console.log('JSON 파싱 실패. 원본 응답:', responseData);
      
      // JSON 파싱 실패시에도 파일 저장
      const saveData = {
        timestamp: now.toISOString(),
        endpoint: endpoint,
        url: `http://${hostname}:${port}${requestPath}`,
        statusCode: res.statusCode,
        headers: res.headers,
        rawResponse: responseData,
        error: 'JSON 파싱 실패'
      };
      
      fs.writeFileSync(filepath, JSON.stringify(saveData, null, 2), 'utf8');
      console.log(`✅ 원본 응답이 파일에 저장되었습니다: ${filepath}`);
    }
  });
});

req.on('error', (e) => {
  console.error(`요청 에러: ${e.message}`);
});

// 빈 데이터 전송
req.write(postData);
req.end(); 