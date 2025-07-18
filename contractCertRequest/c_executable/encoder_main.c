#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h> // uint8_t 등 사용을 위해 추가
#include <math.h> // floor 함수 사용을 위해 추가
#include <libxml/parser.h> // libxml2 헤더 추가
#include <libxml/xpath.h>  // libxml2 XPath 헤더 추가

// cbV2G 라이브러리 헤더
#include "iso20_CommonMessages_Datatypes.h"
#include "iso20_CommonMessages_Encoder.h"
#include "exi_bitstream.h"
#include "exi_error_codes.h"

// 임시 버퍼 크기
#define INPUT_BUFFER_SIZE 4096
#define EXI_BUFFER_SIZE 16384 // Increase buffer size significantly

// --- XML XPath Helper Functions ---

// Helper function to evaluate an XPath expression and return the content of the first resulting node as xmlChar*
// Note: The caller is responsible for freeing the returned xmlChar* using xmlFree().
static xmlChar* get_xpath_content(xmlXPathContextPtr ctx, const xmlChar* xpath_expr) {
    xmlXPathObjectPtr xpathObj = NULL;
    xmlChar *content = NULL;

    if (ctx == NULL || xpath_expr == NULL) {
        return NULL;
    }

    xpathObj = xmlXPathEvalExpression(xpath_expr, ctx);
    if (xpathObj == NULL) {
        fprintf(stderr, "Warning: Failed to evaluate XPath expression: %s\\n", (const char*)xpath_expr);
        return NULL;
    }

    // Check if the result is a nodeset and not empty
    if (xmlXPathNodeSetIsEmpty(xpathObj->nodesetval)) {
        // fprintf(stderr, "Warning: XPath expression yielded no results: %s\\n", (const char*)xpath_expr);
        xmlXPathFreeObject(xpathObj);
        return NULL;
    }

    // Get the content of the first node in the set
    if (xpathObj->nodesetval->nodeNr > 0 && xpathObj->nodesetval->nodeTab[0] != NULL) {
        content = xmlNodeGetContent(xpathObj->nodesetval->nodeTab[0]);
        if (content == NULL) {
             // Node might exist but have no content (e.g., empty element)
             // Return an empty string instead of NULL for consistency, if desired.
             // content = xmlCharStrdup(""); // Or handle as NULL
             fprintf(stderr, "Warning: Node found by XPath '%s' but has no content.\\n", (const char*)xpath_expr);
        }
    } else {
         fprintf(stderr, "Warning: XPath expression '%s' resulted in an unexpected nodeset structure.\\n", (const char*)xpath_expr);
    }


    xmlXPathFreeObject(xpathObj);
    return content; // Remember to xmlFree() this outside!
}

// Helper function to get an attribute value from the first node found by an XPath expression
// Note: The caller is responsible for freeing the returned xmlChar* using xmlFree().
static xmlChar* get_xpath_attribute(xmlXPathContextPtr ctx, const xmlChar* xpath_expr, const xmlChar* attr_name) {
    xmlXPathObjectPtr xpathObj = NULL;
    xmlChar *attr_value = NULL;

    if (ctx == NULL || xpath_expr == NULL || attr_name == NULL) {
        return NULL;
    }

    xpathObj = xmlXPathEvalExpression(xpath_expr, ctx);
    if (xpathObj == NULL) {
        fprintf(stderr, "Warning: Failed to evaluate XPath expression: %s\\n", (const char*)xpath_expr);
        return NULL;
    }

    if (xmlXPathNodeSetIsEmpty(xpathObj->nodesetval)) {
        // fprintf(stderr, "Warning: XPath expression yielded no results: %s\\n", (const char*)xpath_expr);
        xmlXPathFreeObject(xpathObj);
        return NULL;
    }

    if (xpathObj->nodesetval->nodeNr > 0 && xpathObj->nodesetval->nodeTab[0] != NULL) {
        // Get attribute from the first node
        attr_value = xmlGetProp(xpathObj->nodesetval->nodeTab[0], attr_name);
         if (attr_value == NULL) {
             // fprintf(stderr, "Warning: Attribute '%s' not found on node selected by XPath '%s'.\\n", (const char*)attr_name, (const char*)xpath_expr);
         }
    } else {
         fprintf(stderr, "Warning: XPath expression '%s' resulted in an unexpected nodeset structure.\\n", (const char*)xpath_expr);
    }


    xmlXPathFreeObject(xpathObj);
    return attr_value; // Remember to xmlFree() this outside!
}


// Helper function to get the count of nodes matching an XPath expression
static int get_xpath_count(xmlXPathContextPtr ctx, const xmlChar* xpath_expr) {
    xmlXPathObjectPtr xpathObj = NULL;
    int count = 0;

    if (ctx == NULL || xpath_expr == NULL) {
        return -1; // Indicate error
    }

    xpathObj = xmlXPathEvalExpression(xpath_expr, ctx);
    if (xpathObj == NULL) {
        fprintf(stderr, "Warning: Failed to evaluate XPath expression: %s\\n", (const char*)xpath_expr);
        return -1; // Indicate error
    }

    if (xpathObj->nodesetval != NULL) {
        count = xpathObj->nodesetval->nodeNr;
    } else {
         fprintf(stderr, "Warning: XPath expression '%s' did not return a nodeset.\\n", (const char*)xpath_expr);
         count = -1; // Indicate error or unexpected type
    }


    xmlXPathFreeObject(xpathObj);
    return count;
}

// Helper function to get a nodeset object matching an XPath expression
// Note: The caller is responsible for freeing the returned xmlXPathObjectPtr using xmlXPathFreeObject().
static xmlXPathObjectPtr get_xpath_nodeset(xmlXPathContextPtr ctx, const xmlChar* xpath_expr) {
     xmlXPathObjectPtr xpathObj = NULL;

    if (ctx == NULL || xpath_expr == NULL) {
        return NULL;
    }

    xpathObj = xmlXPathEvalExpression(xpath_expr, ctx);
    if (xpathObj == NULL) {
        fprintf(stderr, "Warning: Failed to evaluate XPath expression: %s\\n", (const char*)xpath_expr);
        return NULL;
    }

    // Check if it's actually a nodeset
    if (xpathObj->type != XPATH_NODESET) {
        fprintf(stderr, "Warning: XPath expression '%s' did not return a nodeset as expected (type: %d).\\n", (const char*)xpath_expr, xpathObj->type);
        xmlXPathFreeObject(xpathObj); // Free the unexpected object
        return NULL;
    }

    // Return the object, caller must free it later
    return xpathObj;
}

// --- Base64 인코딩 함수 시작 (추가) ---
static const char base64_chars[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789+/";

char *base64_encode(const uint8_t *input, size_t input_len) {
    size_t output_len = 4 * ((input_len + 2) / 3); // Base64 출력 길이 계산
    char *output = (char *)malloc(output_len + 1); // Null terminator 포함
    if (output == NULL) return NULL;

    size_t i, j;
    uint32_t octet_a, octet_b, octet_c, triple;

    for (i = 0, j = 0; i < input_len;) {
        octet_a = i < input_len ? input[i++] : 0;
        octet_b = i < input_len ? input[i++] : 0;
        octet_c = i < input_len ? input[i++] : 0;

        triple = (octet_a << 0x10) + (octet_b << 0x08) + octet_c;

        output[j++] = base64_chars[(triple >> 3 * 6) & 0x3F];
        output[j++] = base64_chars[(triple >> 2 * 6) & 0x3F];
        output[j++] = base64_chars[(triple >> 1 * 6) & 0x3F];
        output[j++] = base64_chars[(triple >> 0 * 6) & 0x3F];
    }

    // Padding 처리
    size_t padding = input_len % 3;
    if (padding > 0) {
        output[output_len - 1] = '=';
        if (padding == 1) {
            output[output_len - 2] = '=';
        }
    }

    output[output_len] = '\0'; // Null terminate
    return output;
}
// --- Base64 인코딩 함수 끝 ---

// --- Base64 디코딩 함수 시작 (추가) ---
// Base64 디코딩 테이블 초기화 함수
static int base64_decoding_table[256];
void build_base64_decoding_table() {
    int i;
    for (i = 0; i < 256; i++) base64_decoding_table[i] = -1;
    for (i = 0; i < 64; i++) base64_decoding_table[(int)base64_chars[i]] = i;
}

// Base64 문자열을 디코딩하는 함수
// 반환값: 디코딩된 바이트 수 또는 오류 시 음수 값
// 출력: *output_len 에 디코딩된 바이트 수 저장
// 주의: 반환된 uint8_t* 는 호출자가 free() 해야 함
uint8_t *base64_decode(const char *input, size_t input_len, size_t *output_len) {
    // 입력 길이 유효성 검사 (Base64는 4의 배수여야 함, 패딩 제외하고)
    if (input_len % 4 != 0) return NULL;

    // 디코딩 테이블이 초기화되지 않았으면 초기화
    if (base64_decoding_table[(int)'A'] == -1) {
        build_base64_decoding_table();
    }

    // 출력 길이 계산 (패딩 고려)
    *output_len = input_len / 4 * 3;
    if (input[input_len - 1] == '=') (*output_len)--;
    if (input[input_len - 2] == '=') (*output_len)--;

    // 출력 버퍼 할당
    uint8_t *output = (uint8_t *)malloc(*output_len);
    if (output == NULL) return NULL;

    size_t i, j;
    uint32_t sextet_a, sextet_b, sextet_c, sextet_d, triple;

    // 4 문자(24비트) 씩 처리
    for (i = 0, j = 0; i < input_len;) {
        // Base64 문자 -> 값 변환 (경고 수정: 삼항 연산자 대신 if/else 사용)
        if (input[i] == '=') {
            sextet_a = 0;
        } else {
            sextet_a = base64_decoding_table[(int)input[i]];
        }
        i++;

        if (input[i] == '=') {
            sextet_b = 0;
        } else {
            sextet_b = base64_decoding_table[(int)input[i]];
        }
        i++;

        if (input[i] == '=') {
            sextet_c = 0;
        } else {
            sextet_c = base64_decoding_table[(int)input[i]];
        }
        i++;

        if (input[i] == '=') {
            sextet_d = 0;
        } else {
            sextet_d = base64_decoding_table[(int)input[i]];
        }
        i++;

        // 유효하지 않은 문자 확인 (음수 값 확인으로 변경)
        // sextet_a, b, c, d 는 uint32_t 이므로 음수 비교 대신 -1 캐스팅 비교
        if (sextet_a == (uint32_t)-1 || sextet_b == (uint32_t)-1 ||
            sextet_c == (uint32_t)-1 || sextet_d == (uint32_t)-1) {
            free(output);
            return NULL; // Invalid Base64 character found
        }

        // 6비트 값들을 24비트 값으로 결합
        triple = (sextet_a << 3 * 6) + (sextet_b << 2 * 6) + (sextet_c << 1 * 6) + (sextet_d << 0 * 6);

        // 24비트 값을 3개의 8비트 바이트로 분리하여 출력 버퍼에 저장 (패딩 고려)
        if (j < *output_len) output[j++] = (triple >> 2 * 8) & 0xFF;
        if (j < *output_len) output[j++] = (triple >> 1 * 8) & 0xFF;
        if (j < *output_len) output[j++] = (triple >> 0 * 8) & 0xFF;
    }

    return output;
}
// --- Base64 디코딩 함수 끝 ---

// --- Hex 디코딩 헬퍼 함수 시작 ---
int hex_char_to_int(char c) {
    if (c >= '0' && c <= '9') {
        return c - '0';
    }
    if (c >= 'a' && c <= 'f') {
        return c - 'a' + 10;
    }
    if (c >= 'A' && c <= 'F') {
        return c - 'A' + 10;
    }
    return -1; // Invalid hex character
}

int hex_decode(const char *hex_string, uint8_t *byte_array, size_t max_bytes) {
    size_t hex_len = strlen(hex_string);
    if (hex_len % 2 != 0) {
        return -1; // Hex string must have an even number of characters
    }
    size_t byte_len = hex_len / 2;
    if (byte_len > max_bytes) {
        return -2; // Output buffer too small
    }

    for (size_t i = 0; i < byte_len; ++i) {
        int high_nibble = hex_char_to_int(hex_string[2 * i]);
        int low_nibble = hex_char_to_int(hex_string[2 * i + 1]);

        if (high_nibble == -1 || low_nibble == -1) {
            return -3; // Invalid character in hex string
        }
        byte_array[i] = (uint8_t)((high_nibble << 4) | low_nibble);
    }
    return (int)byte_len; // Return number of bytes decoded
}
// --- Hex 디코딩 헬퍼 함수 끝 ---

// Hex 디코딩 함수 프로토타입 추가
int hex_decode(const char *hex_string, uint8_t *byte_array, size_t max_bytes);

int main() {
    char input_buffer[INPUT_BUFFER_SIZE];
    uint8_t exi_buffer[EXI_BUFFER_SIZE];
    size_t bytes_read = 0;
    int result = 0;
    char *base64_output = NULL;
    struct iso20_exiDocument doc; // 여기에 채울 C 구조체
    xmlDocPtr doc_xml = NULL; // libxml2 문서 포인터 추가
    xmlXPathContextPtr xpathCtx = NULL; // libxml2 XPath 컨텍스트 포인터 추가
    xmlXPathObjectPtr xpathObj = NULL; // libxml2 XPath 결과 포인터 추가 (cleanup에서 해제 필요)
    unsigned char *xml_content = NULL; // XML 내용을 읽어올 동적 버퍼 포인터 추가
    size_t xml_content_len = 0; // 읽어온 XML 내용 길이

    // 동적 할당된 메모리를 추적하기 위한 포인터들 (나중에 free 필요)
    uint8_t *session_id_bytes = NULL;
    uint8_t *oem_prov_cert_bytes = NULL; // OEMProvisioningCertificateChain.Certificate 용 포인터 추가
    uint8_t* decoded_sub_certs[iso20_certificateType_3_ARRAY_SIZE] = {NULL}; // 하위 인증서 디코딩 데이터 포인터 배열 (추가)
    size_t decoded_sub_cert_lens[iso20_certificateType_3_ARRAY_SIZE] = {0}; // 하위 인증서 길이 배열 (추가)
    int sub_cert_count = 0; // 실제 처리된 하위 인증서 개수 (추가)

    // === XML 파싱 및 C 구조체 채우기 시작 ===
    fprintf(stderr, "Info: Reading XML from stdin...\\n");
    // stdin에서 모든 내용을 읽어 동적 버퍼에 저장
    size_t buffer_capacity = INPUT_BUFFER_SIZE;
    xml_content = (unsigned char*)malloc(buffer_capacity);
    if (!xml_content) {
        fprintf(stderr, "Error: Failed to allocate memory for XML content buffer.\n");
        return 1;
    }
    size_t total_read = 0;
    while ((bytes_read = fread(xml_content + total_read, 1, buffer_capacity - total_read -1, stdin)) > 0) {
        total_read += bytes_read;
        if (total_read + 1 >= buffer_capacity) { // 버퍼가 거의 찼으면 확장
            buffer_capacity *= 2;
            unsigned char *new_buffer = (unsigned char*)realloc(xml_content, buffer_capacity);
            if (!new_buffer) {
                fprintf(stderr, "Error: Failed to reallocate memory for XML content buffer.\n");
                free(xml_content);
                return 1;
            }
            xml_content = new_buffer;
        }
    }
    if (ferror(stdin)) {
        fprintf(stderr, "Error: Failed to read XML from stdin.\n");
        free(xml_content);
        return 1;
    }
    xml_content[total_read] = '\0'; // Null 종료
    xml_content_len = total_read;
    fprintf(stderr, "Info: Read %zu bytes of XML.\n", xml_content_len);

    // libxml2 파서 초기화
    xmlInitParser();

    // 메모리에서 XML 파싱
    fprintf(stderr, "Info: Parsing XML memory...\n");
    doc_xml = xmlReadMemory((const char *)xml_content, xml_content_len, "stdin.xml", NULL, 0);
    if (doc_xml == NULL) {
        fprintf(stderr, "Error: Failed to parse XML document.\n");
        // libxml2 에러 스택 출력 추가 가능
        goto cleanup; // 실패 시 cleanup으로 이동
    }
    fprintf(stderr, "Info: XML parsing successful.\n");

    // XPath 컨텍스트 생성
    xpathCtx = xmlXPathNewContext(doc_xml);
    if (xpathCtx == NULL) {
        fprintf(stderr, "Error: Failed to create XPath context.\n");
        goto cleanup; // 실패 시 cleanup으로 이동
    }

    // === (TODO) 여기서부터 XPath를 사용하여 데이터 추출 및 구조체 채우기 로직 ===
    fprintf(stderr, "Info: Populating C struct from XML using XPath...\\n");

    // 메시지 타입 확인 (CertificateInstallationReq가 맞는지)
    // XPath 예시: 최상위 요소 바로 아래에 CertificateInstallationReq가 있는지 확인
    // 실제 최상위 요소 이름은 XML 구조에 따라 변경 필요 (예: /V2G_Message/Body/CertificateInstallationReq)
    // 주의: libxml2는 기본 네임스페이스를 처리하지 못할 수 있으므로, 실제 스키마에서는 네임스페이스 접두사 등록 및 사용이 필요할 수 있음
    //       (예: xmlXPathRegisterNs, XPath에 접두사 사용)
    //       여기서는 네임스페이스가 없다고 가정하고 진행합니다.
    if (get_xpath_count(xpathCtx, BAD_CAST "/V2G_Message/Body/CertificateInstallationReq") != 1) {
         fprintf(stderr, "Error: XML does not seem to contain a valid CertificateInstallationReq message or structure is unexpected.\\n");
         goto cleanup;
    }
    // CertificateInstallationReq 사용 플래그 설정
    doc.CertificateInstallationReq_isUsed = 1u;
    // BodyElement는 exiDocument의 최상위 선택자이므로 설정해야 함
    // (ISO 15118-20 스키마에서는 Body 하위 요소가 exiDocument의 직접적인 선택 사항이 됨)
    // 스키마 구조 확인 후 정확한 플래그 설정 필요. 여기서는 일단 BodyElement 사용 설정.
    // 스키마 확인 결과: exiDocument 바로 아래에 선택적 메시지들이 옴.
    // 따라서 doc.CertificateInstallationReq_isUsed = 1u; 만 설정하는 것이 맞음.
    // doc.BodyElement_isUsed = 1u; // 주석 처리


    // --- messageHeader 처리 --- ('CertificateInstallationReq' 노드를 기준으로 상대 경로 사용 가능)
    const xmlChar *req_base_path = BAD_CAST "/V2G_Message/Body/CertificateInstallationReq"; // 요청 메시지 기준 경로
    xmlChar *header_path_prefix_expr = xmlStrdup(req_base_path);
    header_path_prefix_expr = xmlStrcat(header_path_prefix_expr, BAD_CAST "/../Header"); // 상위 경로의 Header로 이동

    // 1. sessionId 처리 (필수)
    xmlChar *session_id_xpath = xmlStrdup(header_path_prefix_expr);
    session_id_xpath = xmlStrcat(session_id_xpath, BAD_CAST "/SessionID");
    xmlChar *session_id_xml = get_xpath_content(xpathCtx, session_id_xpath);
    xmlFree(session_id_xpath);
    if (session_id_xml == NULL) {
        fprintf(stderr, "Error: Mandatory element 'SessionID' not found in XML header.\\n");
        xmlFree(header_path_prefix_expr);
        goto cleanup;
    }
    // xmlChar* 를 char* 로 안전하게 캐스팅 (UTF-8 가정)
    const char *session_id_hex = (const char *)session_id_xml;
    size_t hex_len = strlen(session_id_hex);
    if (hex_len > 16 || hex_len == 0 || hex_len % 2 != 0) {
         fprintf(stderr, "Error: Invalid hex string format or length for SessionID: %s\\n", session_id_hex);
         xmlFree(session_id_xml); // 할당된 메모리 해제
         xmlFree(header_path_prefix_expr);
         goto cleanup;
    }
    session_id_bytes = (uint8_t *)malloc(hex_len / 2);
    if (!session_id_bytes) {
         fprintf(stderr, "Error: Failed to allocate memory for session ID bytes.\\n");
         xmlFree(session_id_xml);
         xmlFree(header_path_prefix_expr);
         goto cleanup;
    }
    int decoded_len = hex_decode(session_id_hex, session_id_bytes, hex_len / 2);
    xmlFree(session_id_xml); // 추출한 XML 문자열 메모리 해제!
    if (decoded_len < 0) {
         fprintf(stderr, "Error: Failed to decode hex string for SessionID.\\n");
         xmlFree(header_path_prefix_expr);
         goto cleanup;
    }
    // C 구조체에 복사
    memcpy(doc.CertificateInstallationReq.Header.SessionID.bytes, session_id_bytes, decoded_len);
    doc.CertificateInstallationReq.Header.SessionID.bytesLen = (uint16_t)decoded_len;
    fprintf(stderr, "Info: Parsed SessionID (len %d).\\n", decoded_len);


    // 2. timestamp 처리 (필수)
    xmlChar *timestamp_xpath = xmlStrdup(header_path_prefix_expr);
    timestamp_xpath = xmlStrcat(timestamp_xpath, BAD_CAST "/TimeStamp");
    xmlChar *timestamp_xml = get_xpath_content(xpathCtx, timestamp_xpath);
    xmlFree(timestamp_xpath);
    if (timestamp_xml == NULL) {
        fprintf(stderr, "Error: Mandatory element 'TimeStamp' not found in XML header.\\n");
        xmlFree(header_path_prefix_expr);
        goto cleanup;
    }
    // xmlChar* (UTF-8) 를 숫자로 변환 (unsigned long long 사용)
    char *endptr;
    errno = 0; // 에러 체크를 위해 errno 초기화
    unsigned long long ts_val = strtoull((const char *)timestamp_xml, &endptr, 10);
    if (errno == ERANGE || *endptr != '\0' || (const char *)timestamp_xml == endptr) {
         fprintf(stderr, "Error: Invalid numeric format for TimeStamp: %s\\n", (const char *)timestamp_xml);
         xmlFree(timestamp_xml);
         xmlFree(header_path_prefix_expr);
         goto cleanup;
    }
     // uint64_t 범위 체크 (strtoull이 ULLONG_MAX를 반환했을 경우)
    if (ts_val > UINT64_MAX) {
         fprintf(stderr, "Error: TimeStamp value out of range for uint64_t: %s\\n", (const char *)timestamp_xml);
         xmlFree(timestamp_xml);
         xmlFree(header_path_prefix_expr);
         goto cleanup;
    }

    doc.CertificateInstallationReq.Header.TimeStamp = (uint64_t)ts_val;
    xmlFree(timestamp_xml); // 추출한 XML 문자열 메모리 해제!
    fprintf(stderr, "Info: Parsed TimeStamp.\\n");


    // 3. Signature 처리 (선택적)
    xmlChar *signature_xpath = xmlStrdup(header_path_prefix_expr);
    signature_xpath = xmlStrcat(signature_xpath, BAD_CAST "/Signature");
    int signature_count = get_xpath_count(xpathCtx, signature_xpath);
    xmlFree(signature_xpath);
    if (signature_count > 0) {
        doc.CertificateInstallationReq.Header.Signature_isUsed = 1u;
        fprintf(stderr, "Info: Found Signature element in header. Detailed parsing not yet implemented.\\n");
        // TODO: Signature 상세 내용 파싱 (매우 복잡)
    } else if (signature_count == 0) {
         doc.CertificateInstallationReq.Header.Signature_isUsed = 0u;
         fprintf(stderr, "Info: Optional Signature element not found in header.\\n");
    } else {
        // get_xpath_count에서 오류 발생 (-1 반환)
         fprintf(stderr, "Error: Failed to check for Signature element presence.\\n");
         xmlFree(header_path_prefix_expr); // 여기서도 해제 필요
         goto cleanup;
    }
    // XPath 표현식 생성에 사용된 메모리 해제
    xmlFree(header_path_prefix_expr);


    // --- messageBody 처리 --- (이제 'req_base_path' 사용)
    // xmlChar *body_path_prefix = BAD_CAST "/V2G_Message/Body/CertificateInstallationReq"; // Body XPath 접두사

    // === (TODO) 여기서부터 Body 내부 요소들 처리 (OEMProvisioningCertificateChain 등) ===
    fprintf(stderr, "Info: (TODO) XML Body element parsing needed here.\\n");


    // 1.3 SubCertificates 처리 (선택적 요소)
    xmlChar *sub_certs_xpath = xmlStrdup(req_base_path);
    sub_certs_xpath = xmlStrcat(sub_certs_xpath, BAD_CAST "/OEMProvisioningCertificateChain/Certificate");
    // get_xpath_nodeset은 실패 시 NULL 반환, 성공 시 xpathObj 반환 (나중에 free 필요)
    xmlXPathObjectPtr sub_certs_nodes = get_xpath_nodeset(xpathCtx, sub_certs_xpath);
    xmlFree(sub_certs_xpath); // xpath 표현식 문자열 해제

    if (sub_certs_nodes != NULL) {
        // SubCertificates 요소가 존재하고 Certificate 자식 요소들을 찾음
        int num_sub_certs = (sub_certs_nodes->nodesetval) ? sub_certs_nodes->nodesetval->nodeNr : 0;
        fprintf(stderr, "Info: Found %d SubCertificates/Certificate elements.\\n", num_sub_certs);

        if (num_sub_certs > 0) {
             doc.CertificateInstallationReq.OEMProvisioningCertificateChain.SubCertificates_isUsed = 1u; // 플래그 설정

             if (num_sub_certs > iso20_certificateType_3_ARRAY_SIZE) {
                 fprintf(stderr, "Warning: Number of SubCertificates (%d) exceeds maximum allowed size (%d). Only the first %d will be processed.\\n",
                         num_sub_certs, iso20_certificateType_3_ARRAY_SIZE, iso20_certificateType_3_ARRAY_SIZE);
                 sub_cert_count = iso20_certificateType_3_ARRAY_SIZE; // 실제 처리할 개수 제한 (sub_cert_count 변수는 이미 선언됨)
             } else {
                 sub_cert_count = num_sub_certs;
             }
             doc.CertificateInstallationReq.OEMProvisioningCertificateChain.SubCertificates.Certificate.arrayLen = (uint16_t)sub_cert_count; // 배열 길이 설정

             // 노드셋 순회하며 각 인증서 처리
             for (int i = 0; i < sub_cert_count; ++i) {
                 xmlNodePtr cur_node = sub_certs_nodes->nodesetval->nodeTab[i];
                 xmlChar *sub_cert_base64_xml = xmlNodeGetContent(cur_node);
                 if (sub_cert_base64_xml == NULL) {
                      fprintf(stderr, "Error: SubCertificates/Certificate element at index %d is empty.\\n", i);
                      xmlXPathFreeObject(sub_certs_nodes); // 노드셋 객체 해제
                      goto cleanup;
                 }

                 const char *sub_cert_base64 = (const char*)sub_cert_base64_xml;
                 size_t sub_cert_base64_len = strlen(sub_cert_base64);
                 size_t current_decoded_len = 0;

                 fprintf(stderr, "Info: Decoding SubCertificates.Certificate[%d] (Base64)...", i);
                 // decoded_sub_certs 배열은 이미 선언됨
                 decoded_sub_certs[i] = base64_decode(sub_cert_base64, sub_cert_base64_len, &current_decoded_len);
                 xmlFree(sub_cert_base64_xml); // !!! 중요: 콘텐츠 메모리 해제 !!!

                 if (decoded_sub_certs[i] == NULL) {
                     fprintf(stderr, "Error: Failed to decode Base64 for SubCertificates.Certificate at index %d.\\n", i);
                     xmlXPathFreeObject(sub_certs_nodes);
                     goto cleanup;
                 }
                 fprintf(stderr, " Decoded size: %zu bytes.\\n", current_decoded_len);
                 decoded_sub_cert_lens[i] = current_decoded_len; // 길이 저장 (이미 선언된 배열)

                 // C 구조체에 할당 (길이 체크 포함)
                 if (current_decoded_len > iso20_certificateType_BYTES_SIZE) {
                     fprintf(stderr, "Warning: Decoded sub-certificate size (%zu) at index %d exceeds maximum (%d). Potential buffer overflow.\\n", current_decoded_len, i, iso20_certificateType_BYTES_SIZE);
                     memcpy(doc.CertificateInstallationReq.OEMProvisioningCertificateChain.SubCertificates.Certificate.array[i].bytes,
                            decoded_sub_certs[i], iso20_certificateType_BYTES_SIZE);
                     doc.CertificateInstallationReq.OEMProvisioningCertificateChain.SubCertificates.Certificate.array[i].bytesLen = iso20_certificateType_BYTES_SIZE;
                 } else {
                     memcpy(doc.CertificateInstallationReq.OEMProvisioningCertificateChain.SubCertificates.Certificate.array[i].bytes,
                            decoded_sub_certs[i], current_decoded_len);
                     doc.CertificateInstallationReq.OEMProvisioningCertificateChain.SubCertificates.Certificate.array[i].bytesLen = (uint16_t)current_decoded_len;
                 }
             } // end for loop for subcerts
        } else {
            // SubCertificates 요소는 있지만 Certificate 자식이 없는 경우
             doc.CertificateInstallationReq.OEMProvisioningCertificateChain.SubCertificates_isUsed = 0u; // 또는 에러 처리
             fprintf(stderr, "Info: Optional SubCertificates element found but contains no Certificate elements.\\n");
        }
        // 사용 완료된 노드셋 객체 해제
        xmlXPathFreeObject(sub_certs_nodes);
    } else {
        // SubCertificates 요소 자체가 없는 경우
        doc.CertificateInstallationReq.OEMProvisioningCertificateChain.SubCertificates_isUsed = 0u;
        fprintf(stderr, "Info: Optional SubCertificates element not found.\\n");
    }


    // --- 이후 다른 Body 요소 처리 ---
    xmlChar *list_root_ids_path = xmlStrdup(req_base_path);
    list_root_ids_path = xmlStrcat(list_root_ids_path, BAD_CAST "/ListOfRootCertificateIDs");

    // 2. ListOfRootCertificateIDs 처리 (필수 요소)
    xmlChar *root_id_xpath = xmlStrdup(list_root_ids_path);
    root_id_xpath = xmlStrcat(root_id_xpath, BAD_CAST "/RootCertificateID");
    xmlXPathObjectPtr root_id_nodes = get_xpath_nodeset(xpathCtx, root_id_xpath);
    xmlFree(root_id_xpath);

    if (root_id_nodes == NULL || xmlXPathNodeSetIsEmpty(root_id_nodes->nodesetval)) {
        fprintf(stderr, "Error: Mandatory element 'ListOfRootCertificateIDs/RootCertificateID' not found or empty.\\n");
        xmlFree(list_root_ids_path);
        goto cleanup;
    }

    int root_id_count = root_id_nodes->nodesetval->nodeNr;
    fprintf(stderr, "Info: Found %d ListOfRootCertificateIDs/RootCertificateID elements.\\n", root_id_count);

    if (root_id_count > iso20_X509IssuerSerialType_20_ARRAY_SIZE) {
         fprintf(stderr, "Warning: Number of RootCertificateIDs (%d) exceeds maximum allowed size (%d). Only the first %d will be processed.\\n",
                 root_id_count, iso20_X509IssuerSerialType_20_ARRAY_SIZE, iso20_X509IssuerSerialType_20_ARRAY_SIZE);
         root_id_count = iso20_X509IssuerSerialType_20_ARRAY_SIZE;
    }
    doc.CertificateInstallationReq.ListOfRootCertificateIDs.RootCertificateID.arrayLen = (uint16_t)root_id_count; // 배열 길이 설정

    // 각 RootCertificateID 노드 처리
    for (int i = 0; i < root_id_count; ++i) {
        xmlNodePtr cur_node = root_id_nodes->nodesetval->nodeTab[i];
        // xmlXPathContextPtr nodeCtx = NULL; // 현재 노드 기준 XPath 컨텍스트 - 사용 안 함

        // 현재 노드를 기준으로 하위 요소를 찾기 위해 임시 컨텍스트 사용 가능
        // 또는 현재 노드 포인터를 사용하여 직접 하위 요소 검색 (xmlFirstElementChild 등)
        // 여기서는 child 순회 사용
        xmlChar *issuer_name_xml = NULL;
        xmlChar *serial_num_xml = NULL;
        long long serial_ll = 0;
        int found_name = 0;
        int found_serial = 0;

        for (xmlNodePtr child = cur_node->children; child != NULL; child = child->next) {
             if (child->type == XML_ELEMENT_NODE) {
                 if (xmlStrcmp(child->name, BAD_CAST "X509IssuerName") == 0) {
                     issuer_name_xml = xmlNodeGetContent(child);
                     found_name = 1;
                 } else if (xmlStrcmp(child->name, BAD_CAST "X509SerialNumber") == 0) {
                     serial_num_xml = xmlNodeGetContent(child);
                     found_serial = 1;
                 }
             }
        }

        // 필수 요소 확인
        if (!found_name || issuer_name_xml == NULL) {
            fprintf(stderr, "Error: Mandatory element 'X509IssuerName' not found or empty within RootCertificateID at index %d.\\n", i);
            if (issuer_name_xml) xmlFree(issuer_name_xml);
            if (serial_num_xml) xmlFree(serial_num_xml);
            xmlXPathFreeObject(root_id_nodes);
            xmlFree(list_root_ids_path);
            goto cleanup;
        }
        if (!found_serial || serial_num_xml == NULL) {
            fprintf(stderr, "Error: Mandatory element 'X509SerialNumber' not found or empty within RootCertificateID at index %d.\\n", i);
            xmlFree(issuer_name_xml);
            if (serial_num_xml) xmlFree(serial_num_xml);
            xmlXPathFreeObject(root_id_nodes);
            xmlFree(list_root_ids_path);
            goto cleanup;
        }

        // X509IssuerName 처리
        const char *issuer_name_str = (const char *)issuer_name_xml;
        size_t issuer_name_len = strlen(issuer_name_str);
        if (issuer_name_len >= iso20_X509IssuerName_CHARACTER_SIZE) {
            fprintf(stderr, "Warning: X509IssuerName string at index %d is too long (len=%zu, max=%d). Truncating.\\n",
                    i, issuer_name_len, iso20_X509IssuerName_CHARACTER_SIZE - 1);
            strncpy(doc.CertificateInstallationReq.ListOfRootCertificateIDs.RootCertificateID.array[i].X509IssuerName.characters,
                    issuer_name_str, iso20_X509IssuerName_CHARACTER_SIZE - 1);
            doc.CertificateInstallationReq.ListOfRootCertificateIDs.RootCertificateID.array[i].X509IssuerName.characters[iso20_X509IssuerName_CHARACTER_SIZE - 1] = '\0';
            doc.CertificateInstallationReq.ListOfRootCertificateIDs.RootCertificateID.array[i].X509IssuerName.charactersLen = iso20_X509IssuerName_CHARACTER_SIZE - 1;
        } else {
            strcpy(doc.CertificateInstallationReq.ListOfRootCertificateIDs.RootCertificateID.array[i].X509IssuerName.characters, issuer_name_str);
            doc.CertificateInstallationReq.ListOfRootCertificateIDs.RootCertificateID.array[i].X509IssuerName.charactersLen = (uint16_t)issuer_name_len;
        }
        xmlFree(issuer_name_xml); // 메모리 해제

        // X509SerialNumber 처리
        char *endptr_serial;
        errno = 0;
        serial_ll = strtoll((const char *)serial_num_xml, &endptr_serial, 10); // Use strtoll for signed long long
        if (errno != 0 || *endptr_serial != '\0' || (const char *)serial_num_xml == endptr_serial) {
             fprintf(stderr, "Error: Invalid numeric format for X509SerialNumber at index %d: %s\\n", i, (const char *)serial_num_xml);
             xmlFree(serial_num_xml);
             xmlXPathFreeObject(root_id_nodes);
             xmlFree(list_root_ids_path);
             goto cleanup;
        }
         xmlFree(serial_num_xml); // 메모리 해제

        // exi_signed_t 로 변환 (8 octets assumed, check header)
        if (exi_basetypes_convert_to_signed(&doc.CertificateInstallationReq.ListOfRootCertificateIDs.RootCertificateID.array[i].X509SerialNumber, serial_ll, 8) != 0) {
             fprintf(stderr, "Error: Failed to convert value to X509SerialNumber (exi_signed_t) at index %d. Value: %lld\\n", i, serial_ll);
             xmlXPathFreeObject(root_id_nodes);
             xmlFree(list_root_ids_path);
             goto cleanup;
        }
        fprintf(stderr, "Info: Parsed RootCertificateID[%d].\\n", i); // 각 항목 처리 로그 추가
    } // end for loop for root ids

    // 사용 완료된 노드셋 객체 해제
    xmlXPathFreeObject(root_id_nodes);


    // 3. MaximumContractCertificateChains 처리 (필수 요소)
    xmlChar *max_chains_xpath = xmlStrdup(req_base_path);
    max_chains_xpath = xmlStrcat(max_chains_xpath, BAD_CAST "/MaximumContractCertificateChains");
    xmlChar *max_chains_xml = get_xpath_content(xpathCtx, max_chains_xpath);
    xmlFree(max_chains_xpath);
    if (max_chains_xml == NULL) {
         fprintf(stderr, "Error: Mandatory element 'MaximumContractCertificateChains' not found.\\n");
         xmlFree(list_root_ids_path);
         goto cleanup;
    }
    // 숫자로 변환 (unsigned long 사용 후 uint8_t 범위 체크)
    char *endptr_maxc;
    errno = 0;
    unsigned long maxc_val = strtoul((const char *)max_chains_xml, &endptr_maxc, 10);
    if (errno != 0 || *endptr_maxc != '\0' || (const char *)max_chains_xml == endptr_maxc) {
        fprintf(stderr, "Error: Invalid numeric format for MaximumContractCertificateChains: %s\\n", (const char *)max_chains_xml);
        xmlFree(max_chains_xml);
        xmlFree(list_root_ids_path);
        goto cleanup;
    }
    // uint8_t 범위 체크 (0-255)
    if (maxc_val > UINT8_MAX) {
         fprintf(stderr, "Error: MaximumContractCertificateChains value (%lu) out of range for uint8_t.\\n", maxc_val);
         xmlFree(max_chains_xml);
         xmlFree(list_root_ids_path);
         goto cleanup;
    }
    doc.CertificateInstallationReq.MaximumContractCertificateChains = (uint8_t)maxc_val;
    xmlFree(max_chains_xml); // 메모리 해제
    fprintf(stderr, "Info: Parsed MaximumContractCertificateChains.\\n");


    // 4. PrioritizedEMAIDs 처리 (선택적 요소)
    xmlChar *emaids_path = xmlStrdup(req_base_path);
    emaids_path = xmlStrcat(emaids_path, BAD_CAST "/PrioritizedEMAIDs");
    int emaids_present = get_xpath_count(xpathCtx, emaids_path); // 요소 존재 여부 확인

    if (emaids_present > 0) {
        xmlChar *emaid_xpath = xmlStrdup(emaids_path);
        emaid_xpath = xmlStrcat(emaid_xpath, BAD_CAST "/EMAID");
        xmlXPathObjectPtr emaid_nodes = get_xpath_nodeset(xpathCtx, emaid_xpath);
        xmlFree(emaid_xpath);

        if (emaid_nodes != NULL) {
            int num_emaids = (emaid_nodes->nodesetval) ? emaid_nodes->nodesetval->nodeNr : 0;
             fprintf(stderr, "Info: Found %d PrioritizedEMAIDs/EMAID elements.\\n", num_emaids);

             if (num_emaids > 0) {
                 doc.CertificateInstallationReq.PrioritizedEMAIDs_isUsed = 1u; // 플래그 설정

                 if (num_emaids > iso20_identifierType_8_ARRAY_SIZE) {
                     fprintf(stderr, "Warning: Number of EMAIDs (%d) exceeds maximum allowed size (%d). Only the first %d will be processed.\\n",
                             num_emaids, iso20_identifierType_8_ARRAY_SIZE, iso20_identifierType_8_ARRAY_SIZE);
                     num_emaids = iso20_identifierType_8_ARRAY_SIZE;
                 }
                 doc.CertificateInstallationReq.PrioritizedEMAIDs.EMAID.arrayLen = (uint16_t)num_emaids;

                 for (int i = 0; i < num_emaids; ++i) {
                      xmlNodePtr cur_node = emaid_nodes->nodesetval->nodeTab[i];
                      xmlChar *emaid_xml = xmlNodeGetContent(cur_node);
                      if (emaid_xml == NULL) {
                           fprintf(stderr, "Error: EMAID element at index %d is empty.\\n", i);
                           xmlXPathFreeObject(emaid_nodes);
                           xmlFree(emaids_path);
                           xmlFree(list_root_ids_path);
                           goto cleanup;
                      }

                      const char *emaid_str = (const char *)emaid_xml;
                      size_t emaid_len = strlen(emaid_str);
                      // identifierType -> iso20_EMAID_CHARACTER_SIZE 매크로 사용
                      if (emaid_len >= iso20_EMAID_CHARACTER_SIZE) {
                          fprintf(stderr, "Warning: EMAID string at index %d is too long (len=%zu, max=%d). Truncating.\\n",
                                  i, emaid_len, iso20_EMAID_CHARACTER_SIZE - 1);
                          strncpy(doc.CertificateInstallationReq.PrioritizedEMAIDs.EMAID.array[i].characters,
                                  emaid_str, iso20_EMAID_CHARACTER_SIZE - 1);
                          doc.CertificateInstallationReq.PrioritizedEMAIDs.EMAID.array[i].characters[iso20_EMAID_CHARACTER_SIZE - 1] = '\0';
                          doc.CertificateInstallationReq.PrioritizedEMAIDs.EMAID.array[i].charactersLen = iso20_EMAID_CHARACTER_SIZE - 1;
                      } else {
                          strcpy(doc.CertificateInstallationReq.PrioritizedEMAIDs.EMAID.array[i].characters, emaid_str);
                          doc.CertificateInstallationReq.PrioritizedEMAIDs.EMAID.array[i].charactersLen = (uint16_t)emaid_len;
                      }
                      xmlFree(emaid_xml); // !!! 중요: 콘텐츠 메모리 해제 !!!
                      fprintf(stderr, "Info: Parsed PrioritizedEMAIDs/EMAID[%d].\\n", i); // 각 항목 처리 로그 추가
                 } // end for loop for emaids

             } else {
                 // PrioritizedEMAIDs 요소는 있지만 EMAID 자식이 없는 경우
                  doc.CertificateInstallationReq.PrioritizedEMAIDs_isUsed = 0u;
                  fprintf(stderr, "Info: Optional PrioritizedEMAIDs element found but contains no EMAID elements.\\n");
             }
            // 사용 완료된 노드셋 객체 해제
             xmlXPathFreeObject(emaid_nodes);

        } else {
             // PrioritizedEMAIDs 요소는 있지만 EMAID 검색 실패 (오류)
              fprintf(stderr, "Error: Failed to query EMAID elements within PrioritizedEMAIDs.\\n");
              // isUsed 플래그는 0으로 두거나 오류 처리
              doc.CertificateInstallationReq.PrioritizedEMAIDs_isUsed = 0u;
              // goto cleanup; // 필요 시 오류 처리
        }

    } else if (emaids_present == 0) {
        // PrioritizedEMAIDs 요소 자체가 없는 경우
        doc.CertificateInstallationReq.PrioritizedEMAIDs_isUsed = 0u;
        fprintf(stderr, "Info: Optional PrioritizedEMAIDs element not found.\\n");
    } else {
        // get_xpath_count 에서 오류 발생 (-1)
         fprintf(stderr, "Error: Failed to check for PrioritizedEMAIDs element presence.\\n");
         xmlFree(emaids_path);
         xmlFree(list_root_ids_path);
         goto cleanup;
    }
    // XPath 경로 메모리 해제
    xmlFree(emaids_path);


    // 임시: 성공적으로 파싱되었다고 가정하고 진행
    fprintf(stderr, "Info: Finished populating C struct from XML.\\n"); // 로그 메시지 업데이트

    // 사용 완료된 XPath 경로 문자열 메모리 해제
    xmlFree(list_root_ids_path);


    // 4. EXI 인코딩 수행
    exi_bitstream_t stream;
    exi_bitstream_init(&stream, exi_buffer, EXI_BUFFER_SIZE, 0, NULL);
    fprintf(stderr, "Info: Performing EXI encoding...\n");
    result = encode_iso20_exiDocument(&stream, &doc);

    if (result != EXI_ERROR__NO_ERROR) {
         fprintf(stderr, "Error: EXI encoding failed with code: %d\n", result); // 오류 코드 출력 추가
         fflush(stderr); // stderr 버퍼 강제 비우기 추가
         goto cleanup; // 실패 시 cleanup으로 이동
    }
    size_t encoded_size = exi_bitstream_get_length(&stream);
    fprintf(stderr, "Info: EXI encoding successful. Encoded size: %zu bytes.\n", encoded_size);

    // 5. EXI 데이터를 Base64로 인코딩
    fprintf(stderr, "Info: Encoding EXI data (size %zu) to Base64...\n", encoded_size);
    base64_output = base64_encode(exi_buffer, encoded_size);
    if (base64_output == NULL) {
         fprintf(stderr, "Error: base64_encode function failed (returned NULL). Check encoded_size and malloc.\n");
         goto cleanup;
    }
    fprintf(stderr, "Info: Base64 encoding successful.\n");

    // 6. Base64 결과를 표준 출력(stdout)으로 출력
    fprintf(stdout, "%s\n", base64_output);

    // 7. 메모리 해제 (cleanup 레이블)
cleanup: // 오류 발생 시 여기로 점프하여 정리 작업 수행
    fprintf(stderr, "Info: Cleaning up allocated memory...\n");
    if (base64_output != NULL) { free(base64_output); }
    if (session_id_bytes != NULL) { free(session_id_bytes); } // 할당된 sessionId 해제
    if (oem_prov_cert_bytes != NULL) { free(oem_prov_cert_bytes); } // 할당된 oemProvCert 해제
    // SubCertificates 디코딩 메모리 해제 추가
    for (int i = 0; i < sub_cert_count; ++i) { // sub_cert_count는 실제 처리된 개수
        if (decoded_sub_certs[i] != NULL) {
            free(decoded_sub_certs[i]);
        }
    }
    // libxml2 리소스 해제 추가
    if (xpathObj != NULL) xmlXPathFreeObject(xpathObj); // xpathObj는 실제 사용 시 할당됨
    if (xpathCtx != NULL) xmlXPathFreeContext(xpathCtx);
    if (doc_xml != NULL) xmlFreeDoc(doc_xml);
    if (xml_content != NULL) free(xml_content); // XML 읽기 버퍼 해제
    xmlCleanupParser(); // libxml2 정리
    // if (cert_req_id_chars != NULL) { free(cert_req_id_chars); } // 주석 처리된 ID 관련 메모리 해제
    // ... 다른 동적 할당된 메모리 해제 코드 추가 ...

    fprintf(stderr, "Info: Process finished %s.\n", (result == 0 && base64_output) ? "successfully" : "with errors");
    return (result == 0 && base64_output) ? 0 : 1; // 성공/실패에 따른 종료 코드 반환
}