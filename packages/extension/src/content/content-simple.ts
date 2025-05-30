console.log('BookmarkAI Web Clip content script loaded - SIMPLE VERSION');

// Test if the script is running
const testDiv = document.createElement('div');
testDiv.id = 'bookmarkai-test';
testDiv.style.cssText = 'position:fixed;bottom:24px;right:24px;width:56px;height:56px;background:#ff0000;border-radius:50%;z-index:2147483647;';
document.body.appendChild(testDiv);

console.log('BookmarkAI: Test div added to page');