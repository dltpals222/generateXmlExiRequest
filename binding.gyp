{
    "targets": [
        {
            "target_name": "cbv2g_addon",
            "sources": [
                "contractCertRequest/nodejs_interface/wrapper.cpp",
                "contractCertRequest/c/common/exi_types_decoder.c",
                "contractCertRequest/c/common/exi_basetypes_encoder.c",
                "contractCertRequest/c/common/exi_basetypes_decoder.c",
                "contractCertRequest/c/common/exi_header.c",
                "contractCertRequest/c/common/exi_bitstream.c",
                "contractCertRequest/c/common/exi_basetypes.c",
            ],
            "include_dirs": [
                "<!(node -p \"require('node-addon-api').include_dir\")",
                "contractCertRequest/c/common",
                "contractCertRequest/c/v2gtp",
                "contractCertRequest/c/appHandshake",
                "contractCertRequest/c/din",
                "contractCertRequest/c/iso-2",
                "contractCertRequest/c/iso-20",
            ],
            "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
            "cflags!": ["-fno-exceptions"],
            "cflags_cc!": ["-fno-exceptions"],
            "xcode_settings": {
                "GCC_ENABLE_CPP_EXCEPTIONS": "NO",
                "CLANG_CXX_LIBRARY": "libc++",
                "MACOSX_DEPLOYMENT_TARGET": "10.7",
            },
            "msvs_settings": {"VCCLCompilerTool": {"ExceptionHandling": 1}},
        }
    ]
}
