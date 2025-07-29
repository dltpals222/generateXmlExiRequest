#!/usr/bin/env node

/**
 * EXI Processor 클래스
 * exi_processor.jar를 사용하여 XML과 EXI 간 변환을 처리
 */

const java = require('java');
const path = require('path');

// JVM 설정
java.options.push('-Xmx1g');
java.options.push('-Xms256m');

// JAR 파일 경로 설정
const jarPath = path.join(__dirname, '..', 'exi_processor.jar');
java.classpath.push(jarPath);

class ExiProcessor {
    constructor() {
        this.initialized = false;
        this.classes = {};
    }

    // 초기화 - 여러 클래스를 불러옴
    init() {
        const classNames = [
            'com.lw.exiConvert.XmlEncode',
            'com.lw.exiConvert.XmlDecode',
        ];

        let loadedCount = 0;
        
        for (const className of classNames) {
            try {
                const shortName = className.split('.').pop();
                this.classes[shortName] = java.import(className);
                console.log(`✓ 클래스 로드 성공: ${className}`);
                loadedCount++;
            } catch (error) {
                console.error(`✗ 클래스 로드 실패: ${className} - ${error.message}`);
            }
        }

        this.initialized = loadedCount > 0;
        console.log(`\n총 ${loadedCount}개 클래스 로드 완료`);
        
        if (this.initialized) {
            console.log('로드된 클래스들:', Object.keys(this.classes).join(', '));
        }
    }

    // XML을 EXI로 인코딩 (바이너리 데이터 직접 반환)
    encodeXML(xmlContent) {
        if (!this.initialized || !this.classes.XmlEncode) {
            console.error('XmlEncode 클래스가 로드되지 않았습니다.');
            return null;
        }

        try {
            const result = this.classes.XmlEncode.encodeXMLSync(xmlContent);
            return result; // 바이너리 데이터 직접 반환
        } catch (error) {
            console.error('XML 인코딩 실패:', error.message);
            return null;
        }
    }

    // EXI를 XML로 디코딩
    decodeXML(exiData) {
        if (!this.initialized || !this.classes.XmlDecode) {
            console.error('XmlDecode 클래스가 로드되지 않았습니다.');
            return null;
        }

        try {
            const byteArray = Array.from(exiData);
            const javaByteArray = java.newArray('byte', byteArray);
            
            const result = this.classes.XmlDecode.decodeXMLSync(javaByteArray);
            return result;
        } catch (error) {
            console.error('EXI 디코딩 실패:', error.message);
            return null;
        }
    }

    // 특정 클래스 가져오기
    getClass(className) {
        return this.classes[className];
    }

    // 로드된 모든 클래스 목록 반환
    getLoadedClasses() {
        return Object.keys(this.classes);
    }
}

module.exports = ExiProcessor; 