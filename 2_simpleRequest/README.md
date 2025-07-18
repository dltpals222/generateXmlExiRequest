# Simple POST Request

간단한 POST 요청을 보내는 Node.js 스크립트입니다.

## 사용법

### 기본 실행 (testCreateHeader20 엔드포인트)
```bash
node simplePost.js
```

### 다른 엔드포인트로 실행
```bash
node simplePost.js yourEndpoint
```

## 요청 정보
- 호스트: localhost:7600
- 경로: /api/contract-cert/{endpoint}
- 메서드: POST
- 데이터: 빈 JSON 객체 ({})
- 기본 엔드포인트: testCreateHeader20

## 기능
- POST 요청 전송 및 응답 출력
- 결과를 자동으로 파일에 저장
- `output` 폴더에 엔드포인트명과 타임스탬프로 파일명 생성

## 저장되는 파일
- 경로: `output/{endpoint}_{YYYY-MM-DD_HH-mm-ss}.json`
- 형식: JSON 파일
- 포함 내용: 타임스탬프, 엔드포인트, URL, 상태코드, 헤더, 응답 데이터

## 예시
```bash
# 기본값 사용
node simplePost.js
# → POST http://localhost:7600/api/contract-cert/testCreateHeader20
# → 파일 저장: output/testCreateHeader20_2024-01-04_14-30-25.json

# 커스텀 엔드포인트
node simplePost.js customEndpoint
# → POST http://localhost:7600/api/contract-cert/customEndpoint  
# → 파일 저장: output/customEndpoint_2024-01-04_14-31-10.json
``` 