var fs = require('fs');
var vm = require('vm');

var filePath = process.argv[2];
var c = fs.readFileSync(filePath, 'utf8');
var i = c.indexOf('var source = String.raw');
var s = c.indexOf('`', i) + 1;
var e = c.lastIndexOf('`;');

try {
    vm.runInNewContext(c.slice(s, e).replace(/\r/g, ''), {});
    console.log('OK');
} catch (e) {
    if (e.message.indexOf('not defined') > 0) {
        console.log('OK');
    } else {
        console.log('ERR:' + e.message);
    }
}
