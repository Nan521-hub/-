const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'js', 'data.js');
const content = fs.readFileSync(filePath, 'utf8');

// 用eval方式解析数据结构
let bioData;
eval(content.replace('const BIOCHEM_DATA =', 'bioData ='));

console.log('='.repeat(60));
console.log('生物化学学习网站 - 知识点数据结构分析');
console.log('='.repeat(60));

for (const chapter of bioData.chapters) {
    console.log('\n📖 章节:', chapter.title);
    console.log('  ' + '='.repeat(50));
    
    for (const kn of chapter.knowledge) {
        const termsCount = kn.terms ? kn.terms.length : 0;
        const blanksCount = kn.blanks ? kn.blanks.length : 0;
        const memoryCount = kn.memory ? kn.memory.length : 0;
        const essayCount = kn.essay ? kn.essay.length : 0;
        
        const termStatus = termsCount < 15 ? '⚠️('+termsCount+')' : '✓('+termsCount+')';
        const blankStatus = blanksCount < 10 ? '⚠️('+blanksCount+')' : '✓('+blanksCount+')';
        const memStatus = memoryCount < 6 ? '⚠️('+memoryCount+')' : '✓('+memoryCount+')';
        const essayStatus = essayCount < 4 ? '⚠️('+essayCount+')' : '✓('+essayCount+')';
        
        console.log(`  • ${kn.id} ${kn.title}`);
        console.log(`    名词解释: ${termStatus} | 填空题: ${blankStatus} | 简答题: ${memStatus} | 论述题: ${essayStatus}`);
    }
}
