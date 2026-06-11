const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'js', 'data.js');
let content = fs.readFileSync(filePath, 'utf8');

// 我们需要修复在单引号字符串内部的未转义单引号（即5'和3'等）
// 策略：找到所有用单引号括起来的字符串，并将其中间的5'、3'等替换为转义形式

// 先尝试直接解析，如果能解析就不用修复
try {
    new Function(content);
    console.log('文件已经语法正确，无需修复');
    process.exit(0);
} catch(e) {
    console.log('文件需要修复：', e.message);
}

// 方法：将所有 '5' 替换为 '5\', '3' 替换为 '3\' 
// 但要小心不要把已经转义的再转义
// 先把所有 \' 替换为一个临时标记，然后把剩余的 '5' 和 '3' 等转义，再恢复标记

// 更简单的方法：用正则匹配在单引号字符串中的单引号
// 由于我们的字符串内容主要是中文文本，问题主要在于内容中的 '5'和'3'
// 让我们寻找所有 '5'后面跟着一个字符再 ' 的模式

// 实际错误模式：在字符串中出现 5' 或 3' 未转义
// 我们可以在任何出现 5' 或 3' 或 5\'- 或 3\'-的地方确保转义

let fixedCount = 0;

// 先检测并报告问题
const lines = content.split('\n');
console.log('分析文件中的单引号问题...');

let problems = [];
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 寻找在单引号字符串中的 5' 或 3'（前面不是反斜杠）
    // 匹配：'...5'...' 中的 5' 或 3'
    const matches = line.match(/[^\\]5'|[^\\]3'/g);
    if (matches) {
        for (const m of matches) {
            if (!m.includes("'\\'")) {
                problems.push({ line: i+1, text: line.trim().substring(0, 80), match: m });
            }
        }
    }
}

console.log(`发现 ${problems.length} 个潜在问题`);
problems.slice(0, 10).forEach(p => console.log(`  第${p.line}行: ${p.text.substring(0, 60)}... (${p.match})`));

// 现在进行实际修复
// 策略：将 '5' 替换为 '5\' ， '3' 替换为 '3\'
// 但只有在单引号字符串内部才需要
// 让我们用一种更聪明的方式：逐字符解析，识别字符串边界

console.log('\n开始智能修复...');

let result = [];
let inSingleQuote = false;
let inDoubleQuote = false;
let inBacktick = false;
let i = 0;
let escapeNext = false;

while (i < content.length) {
    const ch = content[i];
    const prev = i > 0 ? content[i-1] : '';
    const next = i < content.length-1 ? content[i+1] : '';
    
    if (escapeNext) {
        result.push(ch);
        escapeNext = false;
        i++;
        continue;
    }
    
    if (ch === '\\') {
        result.push(ch);
        escapeNext = true;
        i++;
        continue;
    }
    
    // 处理引号
    if (ch === "'" && !inDoubleQuote && !inBacktick) {
        // 如果在字符串内部，且是 5' 或 3' 的一部分（即前面是5或3，后面不是引号/逗号/冒号/方括号）
        // 检查：这是否是一个字符串内容中的单引号（如 5'端）
        if (inSingleQuote) {
            // 检查是否是字符串结束的单引号
            // 如果后面是 , 或 ] 或 } 或 : 或空白+这些，或者是行末，则可能是结束
            let after = '';
            for (let j = i+1; j < Math.min(i+10, content.length); j++) {
                after += content[j];
            }
            // 如果后面紧跟的是关闭字符串的标志（逗号、括号、引号等），那就是结束引号
            const isLikelyEnd = /^\s*[,)\]}:]/.test(after) || /^\s*$/.test(after.substring(0,2)) || after.trim().startsWith("'") || after.trim().startsWith('"');
            // 或者前面是5或3，后面不是空格+结束符，则是内容中的单引号
            const is5PrimeOr3Prime = (prev === '5' || prev === '3');
            
            if (is5PrimeOr3Prime && !isLikelyEnd) {
                // 这是5'或3'，需要转义
                result.push("\\'");
                fixedCount++;
                i++;
                continue;
            }
            
            // 检查其他情况：如果单引号在中文/英文文本中间（不是字符串边界）
            const surroundedByText = /[\u4e00-\u9fa5a-zA-Z]/.test(prev) && /[\u4e00-\u9fa5a-zA-Z]/.test(next);
            if (surroundedByText) {
                // 这可能是内容中的单引号（如 owner's），但在我们的数据中主要是 5'/3'
                result.push("\\'");
                fixedCount++;
                i++;
                continue;
            }
            
            // 正常的字符串结束
            inSingleQuote = false;
            result.push(ch);
            i++;
            continue;
        } else {
            inSingleQuote = true;
            result.push(ch);
            i++;
            continue;
        }
    }
    
    if (ch === '"' && !inSingleQuote && !inBacktick) {
        inDoubleQuote = !inDoubleQuote;
        result.push(ch);
        i++;
        continue;
    }
    
    if (ch === '`' && !inSingleQuote && !inDoubleQuote) {
        inBacktick = !inBacktick;
        result.push(ch);
        i++;
        continue;
    }
    
    result.push(ch);
    i++;
}

const fixedContent = result.join('');
console.log(`共修复 ${fixedCount} 处单引号`);

// 验证
try {
    new Function(fixedContent);
    console.log('✓ 语法验证通过');
    fs.writeFileSync(filePath, fixedContent, 'utf8');
    console.log('✓ 文件已保存');
} catch(e) {
    console.log('✗ 修复后仍有语法错误');
    console.log('错误位置:', e.message);
    
    // 尝试查找错误行
    const errMatch = e.message.match(/:(\d+)/);
    if (errMatch) {
        const errLine = parseInt(errMatch[1]);
        const lines2 = fixedContent.split('\n');
        for (let j = Math.max(0, errLine-3); j < Math.min(lines2.length, errLine+3); j++) {
            console.log(`  第${j+1}行: ${lines2[j].trim().substring(0, 100)}`);
        }
    }
    
    // 写一个修复后的文件供检查
    fs.writeFileSync(filePath + '.fixed', fixedContent, 'utf8');
    console.log('修复后的内容已保存到 data.js.fixed，请手动检查');
}
