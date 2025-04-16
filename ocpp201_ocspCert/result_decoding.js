const fs = require('fs').promises;
const path = require('path');
const util = require('util');

// asn1js 라이브러리 필요
let asn1js, fromBER, pkijs;
try {
    asn1js = require('asn1js');
    fromBER = asn1js.fromBER;
    pkijs = require('pkijs');
    console.log('ASN.1 라이브러리 로드 성공');
} catch (error) {
    console.log('ASN.1 라이브러리가 설치되지 않았습니다. 내부 분석 기능을 사용하려면 다음 명령어로 설치하세요:');
    console.log('npm install asn1js pkijs pvutils');
}

// 디버그 모드 설정 (상세 분석 여부)
const DEBUG_MODE = true;

/**
 * 문자열이 유효한 Base64 형식인지 확인
 */
function isValidBase64(str) {
    // Base64 정규식 패턴
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(str) && str.length % 4 === 0;
}

/**
 * 데이터가 ASN.1 DER 형식인지 검증
 */
function isLikelyDER(buffer) {
    // 최소 길이 확인
    if (buffer.length < 2) return false;
    
    // ASN.1 DER의 첫 바이트는 일반적으로 특정 태그 값
    const firstByte = buffer[0];
    
    // SEQUENCE (0x30), SET (0x31), INTEGER (0x02), OCTET STRING (0x04) 등이 가장 일반적
    const commonTags = [0x30, 0x31, 0x02, 0x04, 0x06];
    
    return commonTags.includes(firstByte);
}

/**
 * Buffer를 ArrayBuffer로 변환
 */
function bufferToArrayBuffer(buffer) {
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < buffer.length; i++) {
        view[i] = buffer[i];
    }
    return arrayBuffer;
}

/**
 * 버퍼의 내용을 base64로 변환
 */
function getBase64(buffer) {
    return buffer.toString('base64');
}

/**
 * ASN.1 구조를 분석하여 사람이 읽기 쉬운 형태로 출력하는 함수
 * @param {Buffer} derData - DER 인코딩된 데이터
 */
function analyzeOCSPResponse(derData, hashAlgorithm = 'SHA256') {
    try {
        // Buffer를 ArrayBuffer로 변환
        const arrayBuffer = bufferToArrayBuffer(derData);
        
        const asn1 = fromBER(arrayBuffer);
        if (asn1.offset === -1) {
            console.error('ASN.1 디코딩 실패');
            return;
        }

        if (DEBUG_MODE) {
            // 개발 환경 - 상세 로그
            console.log('\n=== OCSP 응답 구조 분석 시작 ===\n');
            
            // OCSPResponse SEQUENCE
            const ocspResponse = asn1.result;
            console.log('OCSPResponse SEQUENCE:');
            console.log('  구조:', {
                tagClass: ocspResponse.idBlock.tagClass,
                tagNumber: ocspResponse.idBlock.tagNumber,
                isConstructed: ocspResponse.idBlock.isConstructed
            });
            
            // responseStatus
            const responseStatus = ocspResponse.valueBlock.value[0];
            console.log('\nresponseStatus:');
            console.log('  구조:', {
                tagClass: responseStatus.idBlock.tagClass,
                tagNumber: responseStatus.idBlock.tagNumber,
                type: 'ENUMERATED'
            });
            console.log('  값:', responseStatus.valueBlock.valueDec);

            // responseBytes [0] EXPLICIT
            const responseBytes = ocspResponse.valueBlock.value[1];
            console.log('\nresponseBytes [0] EXPLICIT:');
            console.log('  구조:', {
                tagClass: responseBytes.idBlock.tagClass,
                tagNumber: responseBytes.idBlock.tagNumber,
                isConstructed: responseBytes.idBlock.isConstructed
            });
            
            // ResponseBytes SEQUENCE
            const responseBytesSeq = responseBytes.valueBlock.value[0];
            console.log('\nResponseBytes SEQUENCE:');
            console.log('  구조:', {
                tagClass: responseBytesSeq.idBlock.tagClass,
                tagNumber: responseBytesSeq.idBlock.tagNumber,
                isConstructed: responseBytesSeq.idBlock.isConstructed
            });
            
            // responseType
            const responseType = responseBytesSeq.valueBlock.value[0];
            console.log('\nresponseType:');
            console.log('  값:', responseType.valueBlock.toString());

            try {
                // response (BasicOCSPResponse)
                const basicResponseDER = responseBytesSeq.valueBlock.value[1].valueBlock.valueHex;
                const basicResponseArrayBuffer = bufferToArrayBuffer(Buffer.from(basicResponseDER));
                const basicResponseASN1 = fromBER(basicResponseArrayBuffer);
                
                if (basicResponseASN1.offset === -1) {
                    console.error('BasicOCSPResponse ASN.1 디코딩 실패');
                    return;
                }
                
                const basicResponse = basicResponseASN1.result;
                console.log('\nBasicOCSPResponse SEQUENCE:');
                console.log('  구조:', {
                    tagClass: basicResponse.idBlock.tagClass,
                    tagNumber: basicResponse.idBlock.tagNumber,
                    isConstructed: basicResponse.idBlock.isConstructed
                });

                // tbsResponseData
                const tbsResponseData = basicResponse.valueBlock.value[0];
                console.log('\nTBSResponseData SEQUENCE:');
                console.log('  구조:', {
                    tagClass: tbsResponseData.idBlock.tagClass,
                    tagNumber: tbsResponseData.idBlock.tagNumber,
                    isConstructed: tbsResponseData.idBlock.isConstructed
                });
                
                // version [0] EXPLICIT (있을 경우)
                let versionIndex = -1;
                for (let i = 0; i < tbsResponseData.valueBlock.value.length; i++) {
                    const item = tbsResponseData.valueBlock.value[i];
                    if (item.idBlock.tagClass === 3 && item.idBlock.tagNumber === 0) {
                        versionIndex = i;
                        break;
                    }
                }
                
                if (versionIndex !== -1) {
                    const version = tbsResponseData.valueBlock.value[versionIndex];
                    console.log('\nversion [0] EXPLICIT:');
                    console.log('  구조:', {
                        tagClass: version.idBlock.tagClass,
                        tagNumber: version.idBlock.tagNumber,
                        isConstructed: version.idBlock.isConstructed
                    });
                    console.log('  값:', version.valueBlock.value[0].valueBlock.valueDec);
                }
                
                // responderID CHOICE
                let responderIdIndex = -1;
                for (let i = 0; i < tbsResponseData.valueBlock.value.length; i++) {
                    const item = tbsResponseData.valueBlock.value[i];
                    if ((item.idBlock.tagClass === 2 && item.idBlock.tagNumber === 1) || // byName
                        (item.idBlock.tagClass === 2 && item.idBlock.tagNumber === 2)) { // byKey
                        responderIdIndex = i;
                        break;
                    }
                }
                
                if (responderIdIndex !== -1) {
                    const responderId = tbsResponseData.valueBlock.value[responderIdIndex];
                    console.log('\nresponderID CHOICE:');
                    console.log('  구조:', {
                        tagClass: responderId.idBlock.tagClass,
                        tagNumber: responderId.idBlock.tagNumber,
                        isConstructed: responderId.idBlock.isConstructed
                    });
                    console.log('  type:', responderId.idBlock.tagNumber === 1 ? 'byName [1] IMPLICIT' : 'byKey [2] IMPLICIT');
                    console.log('  값 (Base64):', Buffer.from(responderId.valueBlock.valueHex).toString('base64'));
                }

                // producedAt
                let producedAtIndex = -1;
                for (let i = 0; i < tbsResponseData.valueBlock.value.length; i++) {
                    const item = tbsResponseData.valueBlock.value[i];
                    if (item.idBlock.tagClass === 1 && (item.idBlock.tagNumber === 24)) { // GeneralizedTime
                        producedAtIndex = i;
                        break;
                    }
                }
                
                if (producedAtIndex !== -1) {
                    const producedAt = tbsResponseData.valueBlock.value[producedAtIndex];
                    console.log('\nproducedAt:');
                    try {
                        console.log('  값:', producedAt.toDate().toISOString());
                    } catch (e) {
                        console.log('  값:', '(날짜 파싱 오류)');
                    }
                }

                // responses SEQUENCE OF
                let responsesIndex = -1;
                for (let i = 0; i < tbsResponseData.valueBlock.value.length; i++) {
                    const item = tbsResponseData.valueBlock.value[i];
                    if (item.idBlock.tagClass === 1 && item.idBlock.tagNumber === 16 && item.idBlock.isConstructed) {
                        responsesIndex = i;
                        break;
                    }
                }
                
                if (responsesIndex !== -1) {
                    const responses = tbsResponseData.valueBlock.value[responsesIndex];
                    console.log('\nresponses SEQUENCE OF:');
                    console.log('  구조:', {
                        tagClass: responses.idBlock.tagClass,
                        tagNumber: responses.idBlock.tagNumber,
                        isConstructed: responses.idBlock.isConstructed
                    });

                    // SingleResponse
                    for (const singleResponse of responses.valueBlock.value) {
                        console.log('\n  SingleResponse SEQUENCE:');
                        console.log('    구조:', {
                            tagClass: singleResponse.idBlock.tagClass,
                            tagNumber: singleResponse.idBlock.tagNumber,
                            isConstructed: singleResponse.idBlock.isConstructed
                        });
                        
                        try {
                            // certID
                            const certId = singleResponse.valueBlock.value[0];
                            console.log('\n    CertID SEQUENCE:');
                            console.log('      hashAlgorithm:', certId.valueBlock.value[0].valueBlock.value[0].valueBlock.toString());
                            console.log('      issuerNameHash (Base64):', Buffer.from(certId.valueBlock.value[1].valueBlock.valueHex).toString('base64'));
                            console.log('      issuerKeyHash (Base64):', Buffer.from(certId.valueBlock.value[2].valueBlock.valueHex).toString('base64'));
                            console.log('      serialNumber:', Buffer.from(certId.valueBlock.value[3].valueBlock.valueHex).toString('hex').toLowerCase());
                        } catch (e) {
                            console.log('      CertID 파싱 오류:', e.message);
                        }

                        try {
                            // certStatus CHOICE
                            const certStatus = singleResponse.valueBlock.value[1];
                            console.log('\n    certStatus CHOICE:');
                            console.log('      구조:', {
                                tagClass: certStatus.idBlock.tagClass,
                                tagNumber: certStatus.idBlock.tagNumber,
                                isConstructed: certStatus.idBlock.isConstructed
                            });
                            console.log('      type:', 
                                certStatus.idBlock.tagNumber === 0 ? 'good [0] IMPLICIT' : 
                                certStatus.idBlock.tagNumber === 1 ? 'revoked [1] IMPLICIT' : 
                                'unknown [2] IMPLICIT'
                            );
                        } catch (e) {
                            console.log('      certStatus 파싱 오류:', e.message);
                        }

                        try {
                            // thisUpdate
                            const thisUpdate = singleResponse.valueBlock.value[2];
                            console.log('\n    thisUpdate:');
                            console.log('      값:', thisUpdate.toDate().toISOString());
                        } catch (e) {
                            console.log('      thisUpdate 파싱 오류:', e.message);
                        }

                        try {
                            // nextUpdate [0] EXPLICIT OPTIONAL
                            if (singleResponse.valueBlock.value.length > 3) {
                                const nextUpdateContainer = singleResponse.valueBlock.value[3];
                                if (nextUpdateContainer.idBlock.tagNumber === 0) {
                                    console.log('\n    nextUpdate [0] EXPLICIT:');
                                    console.log('      구조:', {
                                        tagClass: nextUpdateContainer.idBlock.tagClass,
                                        tagNumber: nextUpdateContainer.idBlock.tagNumber,
                                        isConstructed: nextUpdateContainer.idBlock.isConstructed
                                    });
                                    console.log('      값:', nextUpdateContainer.valueBlock.value[0].toDate().toISOString());
                                }
                            }
                        } catch (e) {
                            console.log('      nextUpdate 파싱 오류:', e.message);
                        }

                        try {
                            // singleExtensions [1] EXPLICIT OPTIONAL
                            if (singleResponse.valueBlock.value.length > 4) {
                                const singleExtensions = singleResponse.valueBlock.value[4];
                                if (singleExtensions.idBlock.tagNumber === 1) {
                                    console.log('\n    singleExtensions [1] EXPLICIT:');
                                    console.log('      구조:', {
                                        tagClass: singleExtensions.idBlock.tagClass,
                                        tagNumber: singleExtensions.idBlock.tagNumber,
                                        isConstructed: singleExtensions.idBlock.isConstructed
                                    });
                                }
                            }
                        } catch (e) {
                            console.log('      singleExtensions 파싱 오류:', e.message);
                        }
                    }
                }

                // responseExtensions [1] EXPLICIT OPTIONAL
                for (const item of tbsResponseData.valueBlock.value) {
                    if (item.idBlock.tagClass === 3 && item.idBlock.tagNumber === 1) {
                        console.log('\nresponseExtensions [1] EXPLICIT:');
                        console.log('  구조:', {
                            tagClass: item.idBlock.tagClass,
                            tagNumber: item.idBlock.tagNumber,
                            isConstructed: item.idBlock.isConstructed
                        });
                        break;
                    }
                }

                // signatureAlgorithm
                try {
                    const signatureAlgorithm = basicResponse.valueBlock.value[1];
                    console.log('\nsignatureAlgorithm SEQUENCE:');
                    console.log('  구조:', {
                        tagClass: signatureAlgorithm.idBlock.tagClass,
                        tagNumber: signatureAlgorithm.idBlock.tagNumber,
                        isConstructed: signatureAlgorithm.idBlock.isConstructed
                    });
                    console.log('  알고리즘:', signatureAlgorithm.valueBlock.value[0].valueBlock.toString());
                } catch (e) {
                    console.log('\nsignatureAlgorithm 파싱 오류:', e.message);
                }

                // signature
                try {
                    const signature = basicResponse.valueBlock.value[2];
                    console.log('\nsignature BIT STRING:');
                    console.log('  구조:', {
                        tagClass: signature.idBlock.tagClass,
                        tagNumber: signature.idBlock.tagNumber,
                        isConstructed: signature.idBlock.isConstructed
                    });
                    console.log('  값 (Base64, 일부):', Buffer.from(signature.valueBlock.valueHex).toString('base64').substring(0, 80) + '...');
                } catch (e) {
                    console.log('\nsignature 파싱 오류:', e.message);
                }

                // certs [0] EXPLICIT OPTIONAL
                try {
                    if (basicResponse.valueBlock.value.length > 3) {
                        const certs = basicResponse.valueBlock.value[3];
                        if (certs.idBlock.tagNumber === 0) {
                            console.log('\ncerts [0] EXPLICIT:');
                            console.log('  구조:', {
                                tagClass: certs.idBlock.tagClass,
                                tagNumber: certs.idBlock.tagNumber,
                                isConstructed: certs.idBlock.isConstructed
                            });
                            console.log(`  인증서 체인 개수: ${certs.valueBlock.value[0].valueBlock.value.length}`);
                            
                            // 인증서 체인 순회
                            certs.valueBlock.value[0].valueBlock.value.forEach((cert, index) => {
                                console.log(`\n  Certificate [${index}] Details:`);
                                try {
                                    if (cert.valueBlock && cert.valueBlock.value) {
                                        const tbsCert = cert.valueBlock.value[0];
                                        
                                        // 버전 정보
                                        const version = tbsCert.valueBlock.value.find(v => v.idBlock.tagNumber === 0);
                                        if (version) {
                                            console.log('    Version:', version.valueBlock.value[0].valueBlock.valueDec + 1);
                                        }

                                        // 시리얼 넘버
                                        const serialNumber = tbsCert.valueBlock.value.find(v => v instanceof asn1js.Integer);
                                        if (serialNumber) {
                                            console.log('    Serial Number:', Buffer.from(serialNumber.valueBlock.valueHex).toString('hex').toLowerCase());
                                        }
                                    }
                                } catch (error) {
                                    console.error(`    Error parsing certificate [${index}]:`, error.message);
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.log('\ncerts 파싱 오류:', e.message);
                }
            } catch (error) {
                console.error('BasicOCSPResponse 파싱 중 오류:', error.message);
                console.error('오류 스택:', error.stack);
            }
            
            console.log('\n=== OCSP 응답 구조 분석 종료 ===\n');
        } else {
            // 배포 환경 - 핵심 정보만 로깅
            console.log('=== OCSP 응답 분석 ===');
            
            const ocspResponse = asn1.result;
            const responseStatus = ocspResponse.valueBlock.value[0];
            console.log('응답 상태:', getResponseStatusText(responseStatus.valueBlock.valueDec));

            try {
                const responseBytes = ocspResponse.valueBlock.value[1];
                const responseBytesSeq = responseBytes.valueBlock.value[0];
                const basicResponseDER = responseBytesSeq.valueBlock.value[1].valueBlock.valueHex;
                const basicResponseArrayBuffer = bufferToArrayBuffer(Buffer.from(basicResponseDER));
                const basicResponse = fromBER(basicResponseArrayBuffer).result;
                
                // 서명 알고리즘 정보 추출
                const signatureAlgorithm = basicResponse.valueBlock.value[1];
                console.log('서명 알고리즘:', signatureAlgorithm.valueBlock.value[0].valueBlock.toString());
                
                // 응답 데이터에서 인증서 상태 정보 찾기
                const tbsResponseData = basicResponse.valueBlock.value[0];
                
                // responses SEQUENCE OF 찾기
                let responses = null;
                for (const item of tbsResponseData.valueBlock.value) {
                    if (item.idBlock.tagClass === 1 && item.idBlock.tagNumber === 16 && item.idBlock.isConstructed) {
                        responses = item;
                        break;
                    }
                }
                
                if (responses) {
                    console.log('\n인증서 상태 정보:');
                    
                    // 각 응답 처리
                    for (let i = 0; i < responses.valueBlock.value.length; i++) {
                        const singleResponse = responses.valueBlock.value[i];
                        
                        try {
                            // CertID 정보 추출
                            const certId = singleResponse.valueBlock.value[0];
                            const serialNumber = Buffer.from(certId.valueBlock.value[3].valueBlock.valueHex).toString('hex').toLowerCase();
                            const hashAlg = certId.valueBlock.value[0].valueBlock.value[0].valueBlock.toString();
                            
                            console.log(`\n인증서 ${i + 1}:`);
                            console.log('  일련번호:', serialNumber);
                            console.log('  해시 알고리즘:', hashAlg);
                            
                            // 인증서 상태
                            const certStatus = singleResponse.valueBlock.value[1];
                            console.log('  상태:', getCertStatusText(certStatus.idBlock.tagNumber));
                            
                            // 발행/만료 시간
                            if (singleResponse.valueBlock.value.length > 2) {
                                const thisUpdate = singleResponse.valueBlock.value[2];
                                console.log('  발행시간:', thisUpdate.toDate().toLocaleString());
                                
                                if (singleResponse.valueBlock.value.length > 3) {
                                    const nextUpdate = singleResponse.valueBlock.value[3];
                                    if (nextUpdate.idBlock.tagNumber === 0) {
                                        console.log('  만료시간:', nextUpdate.valueBlock.value[0].toDate().toLocaleString());
                                    }
                                }
                            }
                        } catch (error) {
                            console.log(`  인증서 ${i + 1} 파싱 오류:`, error.message);
                        }
                    }
                }
                
                // 인증서 체인 정보
                if (basicResponse.valueBlock.value.length > 3) {
                    const certs = basicResponse.valueBlock.value[3];
                    if (certs.idBlock.tagNumber === 0) {
                        const chainLength = certs.valueBlock.value[0].valueBlock.value.length;
                        console.log('\n인증서 체인 정보:');
                        console.log('  체인 길이:', chainLength);
                    }
                }
            } catch (error) {
                console.log('OCSP 응답 파싱 오류:', error.message);
            }
            
            console.log('\n=== OCSP 응답 분석 완료 ===');
        }
    } catch (error) {
        // 에러는 환경에 관계없이 항상 로깅
        console.error('OCSP 응답 분석 중 오류 발생:', error);
        console.error('오류 스택:', error.stack);
    }
}

/**
 * OCSP 응답 상태 값을 텍스트로 변환
 */
function getResponseStatusText(statusCode) {
    switch (statusCode) {
        case 0: return 'successful (0)';
        case 1: return 'malformedRequest (1)';
        case 2: return 'internalError (2)';
        case 3: return 'tryLater (3)';
        case 4: return 'not used (4)';
        case 5: return 'sigRequired (5)';
        case 6: return 'unauthorized (6)';
        default: return `unknown (${statusCode})`;
    }
}

/**
 * 인증서 상태 값을 텍스트로 변환
 */
function getCertStatusText(tagNumber) {
    switch (tagNumber) {
        case 0: return 'good [0] IMPLICIT';
        case 1: return 'revoked [1] IMPLICIT';
        case 2: return 'unknown [2] IMPLICIT';
        default: return `unknown (${tagNumber})`;
    }
}

async function decodeBase64ToBinary(base64Data) {
    // Base64 검증
    if (!isValidBase64(base64Data)) {
        console.error('오류: 입력된 문자열이 유효한 Base64 형식이 아닙니다.');
        console.log('올바른 Base64 문자열을 입력해주세요.');
        console.log('예: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...');
        return null;
    }
    
    // Base64 데이터를 바이너리로 디코딩
    const decodedContent = Buffer.from(base64Data, 'base64');
    
    // 디코딩된 데이터가 ASN.1 DER 형식인지 확인
    if (!isLikelyDER(decodedContent)) {
        console.warn('경고: 디코딩된 데이터가 ASN.1 DER 형식이 아닐 수 있습니다.');
        console.log('데이터 크기:', decodedContent.length, '바이트');
        // 처음 16바이트도 Base64로 출력
        console.log('처음 16바이트 (Base64):', decodedContent.slice(0, 16).toString('base64'));
    }
    
    // 디렉토리 확인 및 생성
    try {
        await fs.access(path.join(__dirname, 'ocsp_response'));
    } catch (error) {
        await fs.mkdir(path.join(__dirname, 'ocsp_response'), { recursive: true });
    }
    
    // 디코딩된 내용을 파일에 저장
    const outputPath = path.join(__dirname, 'ocsp_response', 'decoded_result.der');
    await fs.writeFile(outputPath, decodedContent);
    console.log(`디코딩된 내용이 ${outputPath} 파일에 저장되었습니다.`);
    console.log(`파일 크기: ${decodedContent.length} 바이트`);
    
    // 파일 덤프 출력: Hex 대신 Base64 사용
    if (decodedContent.length > 0) {
        console.log('\n=== 파일 내용 덤프 (처음 100바이트, Base64) ===');
        const maxBytes = Math.min(decodedContent.length, 100);
        console.log(decodedContent.slice(0, maxBytes).toString('base64'));
    }
    
    // 내부 분석 기능 사용 (asn1js 라이브러리가 있는 경우)
    if (asn1js && fromBER) {
        console.log('\n=== 내부 ASN.1 파서로 OCSP 응답 구조 분석 ===');
        analyzeOCSPResponse(decodedContent);
    }
    
    return decodedContent;
}

// 파일에서 Base64 문자열 읽기 함수
async function readBase64FromFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return content.trim();
    } catch (error) {
        console.error(`파일 읽기 오류: ${error.message}`);
        return null;
    }
}

// 메인 함수
async function main() {
    console.log('OCSP 응답 분석 도구 v1.3');
    console.log('RFC 6960 형식의 OCSP 응답을 분석합니다.');
    
    // 명령줄 인수
    const args = process.argv.slice(2);
    
    // 인수가 없으면 사용법 표시
    if (args.length === 0) {
        console.log('\n사용법:');
        console.log('1. Base64 문자열 직접 입력: node result_decoding.js "Base64문자열"');
        console.log('2. 파일에서 읽기: node result_decoding.js -f 파일경로');
        console.log('3. 테스트 파일 사용: node result_decoding.js -t');
        console.log('\n예시:');
        console.log('node result_decoding.js "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."');
        console.log('node result_decoding.js -f ocsp_response/result_text.txt');
        return;
    }
    
    let base64Data;
    
    // 테스트 옵션
    if (args[0] === '-t') {
        console.log('내장된 테스트 파일 사용 중...');
        try {
            base64Data = await readBase64FromFile(path.join(__dirname, 'result_text.txt'));
            if (!base64Data) {
                console.error('테스트 파일을 읽을 수 없습니다.');
                return;
            }
        } catch (error) {
            console.error('테스트 파일 로드 오류:', error.message);
            return;
        }
    }
    // 파일에서 읽기 옵션
    else if (args[0] === '-f' && args[1]) {
        console.log(`파일에서 Base64 데이터 읽는 중: ${args[1]}`);
        base64Data = await readBase64FromFile(args[1]);
        if (!base64Data) return;
    } else {
        base64Data = args[0];
        console.log('명령줄에서 제공된 Base64 데이터 처리 중');
    }
    
    await decodeBase64ToBinary(base64Data);
}

// 라이브러리 설치 안내
if (!asn1js || !fromBER) {
    console.log('\n참고: ASN.1 분석 기능을 사용하려면 다음 명령어로 필요한 라이브러리를 설치하세요:');
    console.log('npm install asn1js pkijs pvutils');
    console.log('');
}

main().catch(err => console.error('오류:', err.message));

module.exports = {
    decodeBase64ToBinary,
    analyzeOCSPResponse
};

