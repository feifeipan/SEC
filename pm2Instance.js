var name = process.argv[2] || '';

if (!name){
	process.stdout.write(JSON.stringify({
		code: 1,
		message: 'Invalid Name'
	}), function(){
		process.exit(1);
	});
}

var pm2 = null;
try {
	pm2 = require('pm2');
} catch (e){
	process.stdout.write(JSON.stringify({
		code: 1,
		message: 'Invalid PM2'
	}), function(){
		process.exit(1);
	});
}

try{
	pm2.describe(name, function(err, desc){
		if (err){
			process.stdout.write(JSON.stringify({
				code: 1,
				message: '' + err
			}), function(){
				process.exit(1);
			});
		} else {
			process.stdout.write(JSON.stringify({
				code: 0,
				data: desc
			}), function(){
				process.exit(0);
			});
		}
	});
}catch(e){
	process.stdout.write(JSON.stringify({
		code: 1,
		message: e.message
	}), function(){
		process.exit(1);
	});
}
