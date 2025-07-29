const fs = require('fs');
const path = require('path');
const readline = require('readline');

const cert = {
  v2: {
    contract_sub_count: 1,
    sub_count: 1,
  },
  v20: {
    sub_count: 1,
    sub_ecdsa_count: 1,
    sub_ed448_count: 1,
  }
};

const useDefault = process.argv.includes('-y');

// 색상 정의
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

// readline 인터페이스 생성
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt, defaultValue) {
  // return new Promise(resolve => rl.question(prompt, answer => resolve(Number(answer))));
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      const parsed = Number(answer);
      if (answer.trim() === '') {
        resolve(defaultValue); // 기본값 반환
      } else if (!isNaN(parsed)) {
        resolve(parsed); // 숫자 반환
      } else {
        resolve(NaN); // 숫자가 아닌 입력
      }
    });
  });
}

async function runInteractiveMode() {
  console.log(`${colors.fg.cyan}═══════════════════════════════════════${colors.reset}`);
  console.log(`${colors.fg.blue}🚀 폴더 및 파일 생성 초기화${colors.reset}`);
  console.log(`${colors.fg.cyan}═══════════════════════════════════════${colors.reset}`);

  // v2 계약 인증서 수
  while (true) {
    const contractSubCount = await question(`${colors.fg.green}v2 계약인증서 체인 갯수를 적어주세요 (1~3, 기본값 : 1): ${colors.reset}`, 1);
    if (contractSubCount >= 1 && contractSubCount <= 3) {
      cert.v2.contract_sub_count = contractSubCount;
      break;
    } else {
      console.log(`${colors.fg.red}잘못된 입력입니다. 1~3 사이의 값을 입력해주세요.${colors.reset}`);
    }
  }

  // v2 서브 인증서 수
  while (true) {
    const subCount = await question(`${colors.fg.green}v2 서브 인증서 체인 갯수를 적어주세요 (1~3, 기본값 : 1): ${colors.reset}`, 1);
    if (subCount >= 1 && subCount <= 3) {
      cert.v2.sub_count = subCount;
      break;
    } else {
      console.log(`${colors.fg.red}잘못된 입력입니다. 1~3 사이의 값을 입력해주세요.${colors.reset}`);
    }
  }

  // v20 sub
  while (true) {
    const subCount = await question(`${colors.fg.green}v20 Auto 알고리즘 서브 인증서 체인 갯수를 적어주세요 (1~3, 기본값 : 1): ${colors.reset}`, 1);
    if (subCount >= 1 && subCount <= 3) {
      cert.v20.sub_count = subCount;
      break;
    } else {
      console.log(`${colors.fg.red}잘못된 입력입니다. 1~3 사이의 값을 입력해주세요.${colors.reset}`);
    }
  }

  // v20 ecdsa
  while (true) {
    const subCount = await question(`${colors.fg.green}v20 ECDSA 알고리즘 서브 인증서 체인 갯수를 적어주세요 (1~3, 기본값 : 1): ${colors.reset}`, 1);
    if (subCount >= 1 && subCount <= 3) {
      cert.v20.sub_ecdsa_count = subCount;
      break;
    } else {
      console.log(`${colors.fg.red}잘못된 입력입니다. 1~3 사이의 값을 입력해주세요.${colors.reset}`);
    }
  }

  // v20 ed448
  while (true) {
    const subCount = await question(`${colors.fg.green}v20 Ed448 알고리즘 서브 인증서 체인 갯수를 적어주세요 (1~3, 기본값 : 1): ${colors.reset}`, 1);
    if (subCount >= 1 && subCount <= 3) {
      cert.v20.sub_ed448_count = subCount;
      break;
    } else {
      console.log(`${colors.fg.red}잘못된 입력입니다. 1~3 사이의 값을 입력해주세요.${colors.reset}`);
    }
  }

  rl.close(); // readline 종료

  // 파일 생성 로직 실행
  createDirFileTree(generateFilesToCreate());
}

function generateFilesToCreate() {
  const files = [
    'cert/v2/oem_cert.pem',
    'cert/v2/target_contract_cert.pem',
    'cert/v20/oem_cert.pem',
    'cert/v20/oem_cert_ecdsa.pem',
    'cert/v20/oem_cert_ed448.pem',
    'emaid/v2/contract_emaid.json',
    'emaid/v20/prioritized_emaids.json',
    'key/v2/contract_private_key.pem',
    'key/v2/oem_private_key.pem',
    'key/v20/oem_private_key.pem',
    'key/v20/oem_private_key_ecdsa.pem',
    'key/v20/oem_private_key_ed448.pem',
  ];

  for (let i = 1; i <= cert.v2.contract_sub_count; i++) {
    files.push(`cert/v2/contract_sub/contract_sub_cert${i}.pem`);
  }

  for (let i = 1; i <= cert.v2.sub_count; i++) {
    files.push(`cert/v2/sub/sub_cert${i}.pem`);
  }

  for (let i = 1; i <= cert.v20.sub_count; i++) {
    files.push(`cert/v20/sub/sub_cert${i}.pem`);
  }

  for (let i = 1; i <= cert.v20.sub_ecdsa_count; i++) {
    files.push(`cert/v20/sub_ecdsa/sub_cert${i}.pem`);
  }

  for (let i = 1; i <= cert.v20.sub_ed448_count; i++) {
    files.push(`cert/v20/sub_ed448/sub_cert${i}.pem`);
  }

  return files;
}

function createDirFileTree(files) {
  files.forEach((filePath) => {
    const fullPath = path.resolve(__dirname, filePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 디렉토리 생성됨: ${dir}`);
    }

    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, '', 'utf8');
      console.log(`📄 빈 파일 생성됨: ${filePath}`);
    } else {
      console.log(`✅ 파일 이미 존재함: ${filePath}`);
    }
  });
}

async function main() {
  if (useDefault) {
    console.log(`${colors.fg.cyan}✔ '-y' 옵션이 지정되어 기본값으로 자동 생성합니다.${colors.reset}`);
    createDirFileTree(generateFilesToCreate());
  } else {
    await runInteractiveMode();
  }
}

// 실행 시작
main();