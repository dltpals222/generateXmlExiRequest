from cryptography.hazmat.primitives.asymmetric import x448
from cryptography.hazmat.primitives import serialization
import base64

# 사용자가 제공한 새로운 PEM 형식의 공개키 (이스케이프된 \n 포함)
raw_pem = """-----BEGIN PUBLIC KEY-----\nMEIwBQYDK2VvAzkAQQsADYiVnvk+0LIbnt8rOKIAGnnQet1aJfiTOK3saqAAJ59G\nDPTW5ax2cy2ZKBoANHLbhl3bhaG7BhOALxEAQVBVUg==\n-----END PUBLIC KEY-----"""

# \n을 실제 개행문자로 변환
pem_key = raw_pem.replace("\\n", "\n")

print("변환된 PEM 키:")
print(repr(pem_key))
print("\nPEM 키 내용:")
print(pem_key)

# 새로운 Base64 데이터
b64_data = """MEIwBQYDK2VvAzkAQQsADYiVnvk+0LIbnt8rOKIAGnnQet1aJfiTOK3saqAAJ59GDPTW5ax2cy2ZKBoANHLbhl3bhaG7BhOALxEAQVBVUg=="""

print(f"Base64 데이터 길이: {len(b64_data)}")

try:
    # Base64 디코딩
    der_data = base64.b64decode(b64_data)
    print(f"DER 데이터 길이: {len(der_data)} 바이트")
    print(f"DER 데이터 (hex): {der_data.hex()}")

    # DER 형식으로 바로 로드 시도 (이번에는 올바른 형식일 것 같음)
    print("\n=== DER 형식으로 로드 시도 ===")
    try:
        public_key = serialization.load_der_public_key(der_data)
        print(f"✅ DER 형식으로 로드 성공! 키 타입: {type(public_key)}")

        if isinstance(public_key, x448.X448PublicKey):
            print("🎉 유효한 X448 공개키입니다!")

            # Raw 바이트 추출
            raw_bytes = public_key.public_bytes(
                encoding=serialization.Encoding.Raw,
                format=serialization.PublicFormat.Raw,
            )
            print(f"X448 공개키 길이: {len(raw_bytes)} 바이트 (예상: 56바이트)")
            print(f"Raw X448 공개키 (16진수): {raw_bytes.hex()}")

            # 올바른 PEM 형식으로 재구성
            pem_output = public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            print(f"\n재구성된 PEM 형식:")
            print(pem_output.decode("utf-8"))

        else:
            print(f"❌ X448 공개키가 아닙니다. 실제 타입: {type(public_key)}")

    except Exception as e:
        print(f"❌ DER 형식 로드 실패: {e}")

    # PEM 형식으로도 시도
    print("\n=== PEM 형식으로 로드 시도 ===")
    try:
        public_key = serialization.load_pem_public_key(pem_key.encode("utf-8"))
        print(f"✅ PEM 형식으로 로드 성공! 키 타입: {type(public_key)}")

        if isinstance(public_key, x448.X448PublicKey):
            print("🎉 PEM에서도 유효한 X448 공개키입니다!")
        else:
            print(f"❌ X448 공개키가 아닙니다. 실제 타입: {type(public_key)}")

    except Exception as e:
        print(f"❌ PEM 형식 로드 실패: {e}")

except Exception as e:
    print(f"\n❌ Base64 디코딩 실패: {e}")

print("\n" + "=" * 60)
print("새로운 공개키 테스트 완료!")
print("이 공개키는 올바른 형식으로 되어 있어서")
print("별도의 바이트 수정 없이 바로 로드할 수 있을 것입니다.")
